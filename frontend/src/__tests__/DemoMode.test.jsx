import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('../demo/demoApi.js', () => ({
  runDemoQuery: vi.fn(),
  getDocument: vi.fn(),
  getSettingsReadOnly: vi.fn(),
  getTestRuns: vi.fn(),
  getAuditRow: vi.fn(),
  getSandbox: vi.fn(),
  plantSandbox: vi.fn(),
  dropSandbox: vi.fn(),
}))

import * as api from '../demo/demoApi.js'
import Step4 from '../demo/steps/Step4.jsx'
import Step5 from '../demo/steps/Step5.jsx'
import DemoApp from '../demo/DemoApp.jsx'
import { getLiveRunIds, resetSession } from '../demo/session.js'
import { demoContent } from '../demo/demoContent.js'

const LEAK = 'Now all active subscribers qualify for a full refund regardless of usage level.'
const wrap = (el) => render(<TooltipProvider>{el}</TooltipProvider>)

beforeEach(() => {
  vi.clearAllMocks()
  resetSession()
  api.getDocument.mockResolvedValue({ policy_text: 'REAL POLICY TEXT', text: 'x', injected_span: null })
})

describe('replay fallback', () => {
  it('step 4: live failure shows the real error, then the labelled recorded run; nothing is logged as a session run', async () => {
    api.runDemoQuery.mockRejectedValue(new Error('Query failed: LLM generation failed: connection refused'))
    wrap(<Step4 />)
    fireEvent.click(screen.getByText(demoContent.live.runButton))
    expect(await screen.findByTestId('run-error-text')).toHaveTextContent('connection refused')
    expect(screen.queryByTestId('replay-banner')).toBeNull()

    fireEvent.click(screen.getByText(demoContent.live.showRecorded))
    const banner = await screen.findByTestId('replay-banner')
    expect(banner).toHaveTextContent(/Recorded replay — \d{4}-\d{2}-\d{2}, .+ — not a live run/)
    expect(screen.getByTestId('step4-verdict')).toBeInTheDocument()
    expect(getLiveRunIds()).toEqual([])
  })

  it('step 5: a mid-table failure replaces the WHOLE table with recorded runs (never mixed)', async () => {
    api.getSettingsReadOnly.mockResolvedValue({ mitigations: { threshold_value: 0.3 } })
    const live = { response: LEAK, raw_response: LEAK, stages: null, audit_id: 1, retrieved_chunks: [] }
    api.runDemoQuery.mockResolvedValueOnce(live).mockResolvedValueOnce(live).mockRejectedValue(new Error('Query failed: Ollama stopped'))
    wrap(<Step5 />)
    fireEvent.click(screen.getByText(demoContent.step5.runAll))
    expect(await screen.findByTestId('run-error-text')).toHaveTextContent('Ollama stopped')
    fireEvent.click(screen.getByText(demoContent.live.showRecordedTable))
    expect(await screen.findByTestId('replay-banner')).toBeInTheDocument()
    expect(screen.queryByTestId('run-error')).toBeNull()
    // all six rows are recorded rows (each has a raw-answer badge from the fixture), none are pending
    for (const id of ['none', 'delimiter', 'sanitization', 'output_filter', 'retrieval_score_threshold', 'all']) {
      expect(screen.getByTestId(`raw-${id}`)).toBeInTheDocument()
    }
    expect(screen.queryByText(demoContent.step5.pending)).toBeNull()
    expect(screen.queryByTestId('threshold-note')).toBeNull()
  })
})

describe('navigation', () => {
  const press = (key) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key })) })

  it('step 1: arrow keys reveal the diagram stage by stage, then move to step 2; back reverses', async () => {
    window.location.hash = '#/demo'
    wrap(<DemoApp />)
    const revealed = () => Number(screen.getByTestId('diagram').getAttribute('data-revealed'))
    expect(revealed()).toBe(0)
    for (let i = 1; i <= 4; i += 1) { press('ArrowRight'); await waitFor(() => expect(revealed()).toBe(i)) }
    press('ArrowRight')
    await waitFor(() => expect(screen.getByTestId('demo-main')).toHaveAttribute('data-step', '2'))
    expect(window.location.hash).toBe('#/demo/2')
    press('ArrowLeft')
    await waitFor(() => expect(screen.getByTestId('demo-main')).toHaveAttribute('data-step', '1'))
    expect(revealed()).toBe(4) // coming back from step 2 shows it fully revealed
    press('ArrowLeft')
    await waitFor(() => expect(revealed()).toBe(3))
  })

  it('deep link #/demo/1 shows the diagram fully revealed; #/demo/3 opens step 3', async () => {
    window.location.hash = '#/demo/1'
    const { unmount } = wrap(<DemoApp />)
    expect(screen.getByTestId('diagram')).toHaveAttribute('data-revealed', '4')
    unmount()
    api.getDocument.mockResolvedValue({ filename: 'faq_doc.md', text: 'abc HIDDEN def', injected_span: { start: 4, end: 10 } })
    window.location.hash = '#/demo/3'
    wrap(<DemoApp />)
    expect(screen.getByTestId('demo-main')).toHaveAttribute('data-step', '3')
    expect((await screen.findByTestId('highlight')).textContent).toContain('HIDDEN')
  })

  it('typing in the step 7 textarea does not trigger navigation', async () => {
    api.getSandbox.mockResolvedValue({ exists: false, max_chars: 500 })
    window.location.hash = '#/demo/7'
    wrap(<DemoApp />)
    const box = await screen.findByTestId('instruction-input')
    box.focus()
    fireEvent.keyDown(box, { key: 'ArrowLeft' })
    expect(screen.getByTestId('demo-main')).toHaveAttribute('data-step', '7')
  })
})

describe('jargon tooltip', () => {
  it('click pins the tooltip open until it is clicked again', async () => {
    window.location.hash = '#/demo/1'
    wrap(<DemoApp />)
    const term = screen.getByTestId('term-embedding')
    fireEvent.click(term)
    expect((await screen.findAllByText(demoContent.glossary.embedding)).length).toBeGreaterThan(0)
    fireEvent.click(term)
    await waitFor(() => expect(screen.queryAllByText(demoContent.glossary.embedding).length).toBe(0))
  })
})
