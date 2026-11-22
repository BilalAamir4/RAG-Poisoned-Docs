"""
D11 (UI audit): Promptfoo evaluation trials must not pollute live audit metrics.

1. Read paths (GET /test-runs) process Promptfoo results with log_to_audit=False and
   must never write an audit row or touch the retriever.
2. Live suite runs (log_to_audit=True) tag every audit row with source='promptfoo'.
3. get_recent_logs / get_flagged_logs can exclude a source, and the `source` column
   defaults to 'live' for ordinary pipeline runs.

Fully offline: no LLM, no Chroma, and the audit DB is redirected to a temp file.
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

import audit_log
import promptfoo_runner


def _fake_promptfoo_data():
    test_cases = [
        {
            "vars": {"assembled_prompt": "PROMPT A"},
            "metadata": {
                "query": "Summarize the refund policy from our FAQ.",
                "technique": "unmitigated",
                "technique_label": "Unmitigated (All OFF)",
                "mitigations": {
                    "delimiter": False,
                    "sanitization": False,
                    "output_filter": False,
                    "retrieval_score_threshold": False,
                },
            },
        },
        {
            "vars": {"assembled_prompt": "PROMPT B"},
            "metadata": {
                "query": "Summarize the refund policy from our FAQ.",
                "technique": "all_mitigations",
                "technique_label": "All Mitigations ON",
                "mitigations": {
                    "delimiter": True,
                    "sanitization": True,
                    "output_filter": True,
                    "retrieval_score_threshold": True,
                },
            },
        },
    ]
    leaked_text = "All active subscribers now qualify for a full refund regardless of usage level."
    raw = {
        "evalId": "eval-test",
        "results": {
            "results": [
                {"response": {"output": leaked_text}, "gradingResult": {"pass": False}},
                {"response": {"output": leaked_text}, "gradingResult": {"pass": False}},
            ]
        },
    }
    return raw, test_cases


def test_read_path_never_writes_audit_rows(monkeypatch):
    calls = []
    monkeypatch.setattr(audit_log, "log_pipeline_run", lambda **kw: calls.append(kw) or {"id": 1})

    def _no_retriever(*a, **kw):
        raise AssertionError("retriever must not be built on the read path")

    monkeypatch.setattr(promptfoo_runner.ingestion, "get_retriever", _no_retriever)

    raw, cases = _fake_promptfoo_data()
    result = promptfoo_runner.process_promptfoo_results(raw, cases, log_to_audit=False)

    assert calls == [], "GET /test-runs read path wrote audit rows"
    assert result["stats"]["trials_run"] == 2
    assert all(t["audit_id"] is None for t in result["trials"])
    # Outcome is computed after the pipeline's output filter; Promptfoo graded the raw output
    assert result["trials"][0]["outcome"] == "LEAKED"
    assert result["trials"][1]["outcome"] == "BLOCKED"
    assert result["trials"][1]["promptfoo_passed"] is False


def test_live_run_tags_rows_as_promptfoo(monkeypatch):
    calls = []
    monkeypatch.setattr(
        audit_log, "log_pipeline_run", lambda **kw: calls.append(kw) or {"id": len(calls)}
    )

    class _Retriever:
        def retrieve(self, q):
            return []

    monkeypatch.setattr(promptfoo_runner.ingestion, "get_retriever", lambda *a, **kw: _Retriever())

    raw, cases = _fake_promptfoo_data()
    result = promptfoo_runner.process_and_log_promptfoo_results(raw, cases)

    assert len(calls) == 2
    assert all(c["source"] == "promptfoo" for c in calls)
    assert [t["audit_id"] for t in result["trials"]] == [1, 2]


def test_source_column_default_and_exclusion(monkeypatch, tmp_path):
    db_file = tmp_path / "audit.db"
    monkeypatch.setattr(audit_log, "get_db_path", lambda: db_file)

    live = audit_log.log_pipeline_run(
        raw_query="q live",
        retrieved_chunks=[],
        assembled_prompt="p",
        llm_response="r",
        active_mitigations={},
        final_status="leaked",
    )
    pf = audit_log.log_pipeline_run(
        raw_query="q promptfoo",
        retrieved_chunks=[],
        assembled_prompt="p",
        llm_response="r",
        active_mitigations={},
        final_status="leaked",
        source="promptfoo",
    )

    assert live["source"] == "live"
    assert pf["source"] == "promptfoo"

    all_ids = {r["id"] for r in audit_log.get_recent_logs(limit=10)}
    live_ids = {r["id"] for r in audit_log.get_recent_logs(limit=10, exclude_source="promptfoo")}
    flagged_live_ids = {
        r["id"] for r in audit_log.get_flagged_logs(limit=10, exclude_source="promptfoo")
    }

    assert all_ids == {live["id"], pf["id"]}
    assert live_ids == {live["id"]}
    assert flagged_live_ids == {live["id"]}
    assert "source" in audit_log.export_csv().splitlines()[0]
