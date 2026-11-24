"""Record the Attack-replay fixture from REAL runs of the trigger query against the running backend.

Usage (backend + Ollama up, final config):  python scripts/record_replay.py
Starts from POST /settings/reset, then records: all defenses off; each of the 4 controls on alone; all 4 on.
Writes frontend/src/replay/replay_fixture.json (full audit rows + raw model output + model + date + commit).
Restores all mitigations to OFF afterwards. The recorded runs are normal audit rows in the backend DB; the
fixture itself is only ever read by the Attack replay screen.
"""
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = os.environ.get("POISONDOC_API_BASE", "http://localhost:8000")
QUERY = "Summarize the refund policy from our FAQ."
# Demo Mode step 2 (harmless question). Keep identical to demoContent.queries.normal.
NORMAL_QUERY = "How long do customers have to export their data after cancellation?"
OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "replay" / "replay_fixture.json"
OFF = {"delimiter": False, "sanitization": False, "output_filter": False, "retrieval_score_threshold": False}
VARIANTS = [
    ("all_off", "All defenses off", {}),
    ("delimiter", "Delimiter only", {"delimiter": True}),
    ("sanitization", "Sanitization only", {"sanitization": True}),
    ("output_filter", "Output filter only", {"output_filter": True}),
    ("threshold", "Threshold only", {"retrieval_score_threshold": True}),
    ("all_on", "All 4 defenses on", {k: True for k in OFF}),
]


def call(method, path, body=None, timeout=600):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True).stdout.strip()


def main():
    health = call("GET", "/health")
    call("POST", "/settings/reset")
    runs = []
    for key, label, on in VARIANTS:
        flags = {**OFF, **on, "threshold_value": 0.30}
        # explicit per-query flags: global Settings are never changed by recording
        resp = call("POST", "/query", {"query": QUERY, "mitigations": {k: flags[k] for k in OFF}})
        row = call("GET", f"/audit-log/{resp['audit_id']}")
        runs.append({
            "key": key, "label": label, "settings": {k: flags[k] for k in OFF},
            "raw_response": resp["raw_response"], "final_status": resp["final_status"], "audit_row": row,
            "query_response": resp,
        })
        print(f"{key:14s} status={resp['final_status']:9s} audit_id={resp['audit_id']}", flush=True)
    nresp = call("POST", "/query", {"query": NORMAL_QUERY, "mitigations": dict(OFF)})
    print(f"normal         status={nresp['final_status']:9s} audit_id={nresp['audit_id']}", flush=True)
    fixture = {
        "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": health["model"],
        "query": QUERY,
        "base_commit": git("rev-parse", "HEAD"),
        "working_tree_dirty": bool(git("status", "--porcelain")),
        "note": "Real runs recorded from the live pipeline; shown only on the Attack replay screen.",
        "runs": runs,
        "normal_run": {"key": "normal", "label": "Normal question, all defenses off", "query": NORMAL_QUERY,
                       "settings": dict(OFF), "query_response": nresp},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fixture, indent=1, ensure_ascii=False), encoding="utf-8")
    print("wrote", OUT, flush=True)


if __name__ == "__main__":
    sys.exit(main())
