// Recorded replay: adapts the labelled fixture to the same shape as a live /query response.
import fixture from '../replay/replay_fixture.json'

const KEY_FOR_ROW = {
  none: 'all_off',
  delimiter: 'delimiter',
  sanitization: 'sanitization',
  output_filter: 'output_filter',
  retrieval_score_threshold: 'threshold',
  all: 'all_on',
}

export const replayMeta = () => ({ date: String(fixture.recorded_at || '').slice(0, 10), model: fixture.model })

function toResponse(run, query) {
  const q = run.query_response
  const row = run.audit_row || {}
  return {
    recorded: true,
    query: query || run.query || fixture.query,
    response: q?.response ?? row.llm_response ?? '',
    raw_response: q?.raw_response ?? run.raw_response ?? '',
    final_status: q?.final_status ?? run.final_status,
    retrieved_chunks: q?.retrieved_chunks ?? row.retrieved_chunks ?? [],
    stages: q?.stages ?? null,
    audit_id: null, // never counted as a session run
    active_mitigations: run.settings,
  }
}

export function recordedRowRun(rowId) {
  const run = (fixture.runs || []).find((r) => r.key === KEY_FOR_ROW[rowId])
  return run ? toResponse(run) : null
}
export const recordedAttack = () => recordedRowRun('none')
export function recordedNormal() {
  return fixture.normal_run ? toResponse(fixture.normal_run, fixture.normal_run.query) : null
}
