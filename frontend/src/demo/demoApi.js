// Network calls for Demo Mode. Every query sends explicit per-query defense flags and never touches Settings.
import { getApiBaseUrl } from '../api.js'
import { addLiveRun } from './session.js'

async function readError(res, label) {
  let detail = `${res.status} ${res.statusText}`
  try {
    const j = await res.json()
    if (j && typeof j.detail === 'string') detail = j.detail
  } catch { /* not JSON */ }
  return new Error(`${label}: ${detail}`)
}

async function call(method, path, { body, signal, label } = {}) {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    signal,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw await readError(res, label || path)
  return res.json()
}

export async function runDemoQuery({ query, mitigations, sandbox = false, signal }) {
  const data = await call('POST', '/query', { body: { query, mitigations, sandbox }, signal, label: 'Query failed' })
  addLiveRun(data.audit_id)
  return { ...data, recorded: false }
}
export const getDocument = (name, signal) =>
  call('GET', `/documents/${encodeURIComponent(name)}`, { signal, label: 'Could not load the document' })
export const getSettingsReadOnly = (signal) => call('GET', '/settings', { signal, label: 'Could not read settings' })
export const getTestRuns = (signal) => call('GET', '/test-runs', { signal, label: 'Could not load the test results' })
export const getAuditRow = (id, signal) => call('GET', `/audit-log/${id}`, { signal, label: 'Could not load the audit row' })
export const getSandbox = (signal) => call('GET', '/demo/sandbox', { signal, label: 'Could not read the sandbox' })
export const plantSandbox = (instruction, signal) =>
  call('POST', '/demo/sandbox', { body: { instruction }, signal, label: 'Could not plant the instruction' })
export const dropSandbox = () => call('DELETE', '/demo/sandbox', { label: 'Could not restore' })
