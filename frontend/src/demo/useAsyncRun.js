import { useCallback, useEffect, useRef, useState } from 'react'
import { demoContent } from './demoContent.js'

// Measured durations of this session's completed live runs, per kind (seconds).
const measured = {}
export function expectedSeconds(kind) {
  const list = measured[kind] || []
  if (list.length === 0) return { n: demoContent.typicalSeconds[kind] ?? demoContent.typicalSeconds.query, measured: false }
  const sorted = [...list].sort((a, b) => a - b)
  return { n: Math.max(1, Math.round(sorted[Math.floor(sorted.length / 2)])), measured: true }
}

// state: idle | running | done | error. `start(fn)` runs fn(signal); cancel() aborts it.
export function useAsyncRun(kind = 'query') {
  const [state, setState] = useState('idle')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const ctl = useRef(null)
  const timer = useRef(null)

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }
  useEffect(() => () => { stopTimer(); ctl.current?.abort() }, [])

  const start = useCallback(async (fn) => {
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    setState('running'); setError(null); setData(null); setElapsed(0)
    const t0 = performance.now()
    stopTimer()
    timer.current = setInterval(() => setElapsed(Math.round((performance.now() - t0) / 1000)), 1000)
    try {
      const out = await fn(c.signal)
      if (c.signal.aborted) return undefined
      if (!measured[kind]) measured[kind] = []
      measured[kind].push((performance.now() - t0) / 1000)
      setData(out); setState('done')
      return out
    } catch (e) {
      if (c.signal.aborted) { setState('idle'); return undefined }
      setError(e?.message || String(e)); setState('error')
      return undefined
    } finally {
      stopTimer()
    }
  }, [kind])

  const cancel = useCallback(() => ctl.current?.abort(), [])
  const reset = useCallback(() => { setState('idle'); setData(null); setError(null) }, [])
  return { state, data, error, elapsed, start, cancel, reset, setData }
}
