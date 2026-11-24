// Per-demo-session facts: audit ids of LIVE runs (step 6 shows exactly these) and step 2's live scores.
// Recorded runs are never added. Stored in sessionStorage with an in-memory fallback.
const KEY = 'poisondoc-demo-session'
let memory = { auditIds: [], normalScores: null }

function load() {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (raw) memory = { ...memory, ...JSON.parse(raw) }
  } catch { /* storage unavailable: memory only */ }
  return memory
}
function save() {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(memory)) } catch { /* ignore */ }
}

export function addLiveRun(auditId) {
  load()
  if (auditId != null && !memory.auditIds.includes(auditId)) memory.auditIds.push(auditId)
  save()
}
export const getLiveRunIds = () => [...load().auditIds]
export function setNormalScores(scores) { load(); memory.normalScores = scores; save() }
export const getNormalScores = () => load().normalScores
export function resetSession() { memory = { auditIds: [], normalScores: null }; save() }
