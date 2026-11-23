import React, { useState, useEffect, useRef } from 'react'
import { fetchSettings, sendQuery } from '../api.js'
import { defensesOnCount } from '../status.js'

/**
 * Extracts distinct, readable citation chips from retrieved chunks metadata.
 */
export function extractCitations(retrievedChunks) {
  if (!retrievedChunks || !Array.isArray(retrievedChunks)) {
    return []
  }

  const citations = []
  const seen = new Set()

  for (let idx = 0; idx < retrievedChunks.length; idx++) {
    const chunk = retrievedChunks[idx]
    const docName = chunk.source_document || chunk.source || 'unknown'

    // Determine document type badge
    const lowerDoc = docName.toLowerCase()
    let type = 'doc'
    let badge = 'DOC'
    if (lowerDoc.endsWith('.pdf')) {
      type = 'pdf'
      badge = 'PDF'
    } else if (lowerDoc.endsWith('.md') || lowerDoc.endsWith('.markdown')) {
      type = 'doc'
      badge = 'DOC'
    }

    // No invented sections: identify the chunk by its rank in this retrieval, plus its similarity score.
    const score = typeof chunk.similarity_score === 'number' ? chunk.similarity_score : null
    const rank = `chunk ${idx + 1} of ${retrievedChunks.length}`
    const label = `${docName} — ${rank}`
    const key = `${badge}:${label}`

    if (!seen.has(key)) {
      seen.add(key)
      citations.push({
        type,
        badge,
        label,
        docName,
        section: rank,
        score,
      })
    }
  }

  return citations
}

/**
 * Evaluates whether a safe or danger banner should be rendered
 * under an AI response that touched an injected or flagged chunk.
 */
export function determineBanner(result) {
  if (!result) return null

  const finalStatus = result.final_status
  const isFlagged = Boolean(result.is_flagged)
  const hasFlaggedChunk = Boolean(
    result.retrieved_chunks &&
      Array.isArray(result.retrieved_chunks) &&
      result.retrieved_chunks.some((c) => c.flagged)
  )
  const mits = result.active_mitigations || {}
  const isAttackStatus = finalStatus === 'leaked'
  const shieldIcon = (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )

  // If attack succeeded or leaked unverified content: Danger banner
  if (isAttackStatus) {
    return {
      type: 'danger',
      id: 'chatBannerDanger',
      icon: (
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 3l10 18H2L12 3z" />
          <path d="M12 9v5" />
        </svg>
      ),
      text: 'Injected instruction followed',
    }
  }

  // Output filter replaced the answer: Safe banner naming the control that acted
  if (finalStatus === 'blocked') {
    return {
      type: 'safe',
      id: 'chatBannerSafe',
      icon: shieldIcon,
      text: 'Blocked by output filter — answer replaced',
    }
  }

  // Answer did not repeat the injected claim with input-side defenses active
  if (finalStatus === 'sanitized') {
    return {
      type: 'safe',
      id: 'chatBannerSafe',
      icon: shieldIcon,
      text: mits.delimiter
        ? 'Untrusted content wrapped — instruction ignored'
        : 'Injection phrases stripped — claim not repeated',
    }
  }

  // Flag threshold only logs: never present it as a defense
  if (isFlagged || hasFlaggedChunk) {
    return {
      type: 'amber',
      id: 'chatBannerFlagged',
      icon: (
        <svg className="icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
      text: 'Flagged for review (log only — did not block)',
    }
  }

  // Clean response with no injection or flags touched
  return null
}

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [inputQuery, setInputQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [defensesOn, setDefensesOn] = useState(null) // real Settings state, read-only here
  const [error, setError] = useState(null)
  const threadEndRef = useRef(null)

  // Read the real Settings state (display only; Chat never writes settings)
  const loadSettings = async () => {
    try {
      const data = await fetchSettings()
      const m = data?.mitigations || data?.active_mitigations
      setDefensesOn(m ? defensesOnCount(m) : null)
    } catch (err) {
      console.error('Failed to load settings in Chat header:', err)
      setDefensesOn(null)
    }
  }

  useEffect(() => {
    loadSettings()
    const handleMitigationChange = () => loadSettings()
    window.addEventListener('mitigation-settings-changed', handleMitigationChange)
    return () => {
      window.removeEventListener('mitigation-settings-changed', handleMitigationChange)
    }
  }, [])

  // Auto-scroll to bottom of thread when messages update
  useEffect(() => {
    if (threadEndRef.current && typeof threadEndRef.current.scrollIntoView === 'function') {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading])

  // Handle user query submission
  const handleSend = async (e) => {
    if (e) e.preventDefault()
    const trimmed = inputQuery.trim()
    if (!trimmed || isLoading) return

    const userMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    }

    setMessages((prev) => [...prev, userMessage])
    setInputQuery('')
    setIsLoading(true)
    setError(null)

    try {
      // No per-query override: the backend applies the real Settings state
      const payload = { query: trimmed }

      const result = await sendQuery(payload)
      const citations = extractCitations(result.retrieved_chunks)
      const banner = determineBanner(result)

      const aiMessage = {
        id: `ai_${Date.now()}`,
        role: 'ai',
        text: result.response || result.raw_response || 'No response generated.',
        citations,
        banner,
        final_status: result.final_status,
        is_flagged: result.is_flagged,
        mitigations_used: result.active_mitigations,
      }

      setMessages((prev) => [...prev, aiMessage])
    } catch (err) {
      console.error('Chat query execution failed:', err)
      setError(err.message)
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'ai',
          text: `Query failed: ${err.message}`,
          isError: true,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="page active" id="page-chat">
      <div className="pagehead">
        <div>
          <h1>Chat</h1>
          <div className="sub">Ask questions grounded in your knowledge base</div>
        </div>
        <a
          href="#/settings"
          className="state"
          id="chatToggleState"
          title="Defenses come from Settings. Click to change them there."
          style={{ textDecoration: 'none' }}
        >
          Defenses: {defensesOn === null ? '—' : `${defensesOn} of 4 on`}
        </a>
      </div>

      <div className="chatwrap">
        <div className="thread" id="chat-thread">
          {messages.length === 0 ? (
            <div className="p-8 text-center text-text-secondary border border-dashed border-border-strong rounded-lg my-auto">
              <p className="text-sm mb-2 text-text-primary font-medium">No messages yet in this session</p>
              <p className="text-xs text-text-muted mb-4">
                Ask a question to query your indexed knowledge base, or test indirect prompt injection defenses.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  type="button"
                  className="btn ghost text-xs py-1 px-3"
                  onClick={() => setInputQuery('Summarize the refund policy from our FAQ.')}
                >
                  Prompt: "Summarize the refund policy from our FAQ."
                </button>
                <button
                  type="button"
                  className="btn ghost text-xs py-1 px-3"
                  onClick={() => setInputQuery("What's the escalation process for a P1 incident?")}
                >
                  Prompt: "What's the escalation process for a P1 incident?"
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={msg.id || idx}
                className={`msg-row ${msg.role === 'user' ? 'user' : ''}`}
                id={`msg-row-${idx}`}
              >
                {msg.role === 'user' ? (
                  <div className="bubble-user">{msg.text}</div>
                ) : (
                  <div className="ai-block">
                    <div className="answer-text" id={`chat-answer-${idx}`}>
                      {msg.text}
                    </div>

                    {msg.citations && msg.citations.length > 0 && (
                      <div className="citerow" id={`citerow-${idx}`}>
                        {msg.citations.map((cite, cIdx) => (
                          <div key={cIdx} className="citechip">
                            <span className={`filetag ${cite.type}`}>{cite.badge}</span>
                            <span>{cite.label}{cite.score !== null && cite.score !== undefined ? ` · ${cite.score.toFixed(2)}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {msg.banner && (
                      <div
                        className={`banner ${msg.banner.type}`}
                        id={msg.banner.id || `banner-${idx}`}
                      >
                        {msg.banner.icon}
                        <span>{msg.banner.text}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="msg-row" id="chat-loading-indicator">
              <div className="ai-block">
                <div className="answer-text text-text-muted italic flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-violet animate-pulse" />
                  Retrieving documents and generating response...
                </div>
              </div>
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {error && (
          <div className="text-xs text-red mb-2 px-2">
            Error: {error}
          </div>
        )}

        <form className="chat-input" onSubmit={handleSend}>
          <input
            type="text"
            id="chat-input-field"
            placeholder="Ask about your documents…"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="iconbtn"
            id="chat-submit-btn"
            disabled={isLoading || !inputQuery.trim()}
            title="Send query"
          >
            <svg
              className="icon"
              viewBox="0 0 24 24"
              style={{ stroke: 'none', fill: 'currentColor' }}
            >
              <path d="M4 12l16-7-6 16-2.5-6.5L4 12z" />
            </svg>
          </button>
        </form>
      </div>
    </section>
  )
}
