"""
RAG Poisoned Docs - FastAPI Application Layer
Exposes the RAG pipeline (P1-P4) as a clean REST API (Spec 1.10 & 2.4).
Endpoints:
- GET /health: Health check (LLM reachable, DB reachable, config status)
- POST /query: Query pipeline with active or per-request mitigations
- GET /documents: List indexed knowledge base documents with status badges
- POST /documents/upload: Upload a markdown/text document and trigger re-index
- GET /audit-log: Query recent or flagged audit log records
- GET /audit-log/export: Export audit logs as CSV file
- GET /audit-log/{log_id}: Retrieve single audit log entry for Trace Detail
- GET /settings: Read active mitigation settings and system config panel
- POST /settings: Update active mitigation settings and threshold value
- POST /settings/reset: Atomic reset of Chroma collection, documents, and audit logs
- GET /test-runs: Summary statistics and trial rows for Test Suite Results screen
"""

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import settings
import audit_log
import ingestion
import llm_client
import pipeline
import promptfoo_runner

app = FastAPI(
    title="RAG Poisoned Docs API",
    description="AI & Agentic Automation Security Platform - REST API",
    version="1.0.0",
)

# CORS configuration strictly reads config.ALLOWED_ORIGINS (comma-separated list from env)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Baseline documents set (protected from arbitrary deletion during reset)
BASELINE_DOCUMENTS = {
    "employee_handbook.md",
    "enterprise_terms.md",
    "faq_doc.md",
    "incident_runbook.md",
    "q3_roadmap.md",
    "support_policy.md",
    "vendor_security_guidelines.md",
}

# Mutable in-memory mitigation settings state (defaults: all mitigations OFF per baseline)
DEFAULT_SETTINGS: Dict[str, Any] = {
    "delimiter": False,
    "sanitization": False,
    "output_filter": False,
    "retrieval_score_threshold": False,
    "threshold_value": pipeline.DEFAULT_RETRIEVAL_SCORE_THRESHOLD,  # 0.30
}

active_settings: Dict[str, Any] = dict(DEFAULT_SETTINGS)


# --- Pydantic Models ---

class QueryRequest(BaseModel):
    query: str = Field(..., description="The user question or trigger query")
    mitigations: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional overrides for mitigation flags (delimiter, sanitization, output_filter, retrieval_score_threshold)",
    )
    similarity_top_k: Optional[int] = Field(
        default=3,
        description="Number of top chunks to retrieve",
    )
    sandbox: bool = Field(
        default=False,
        description="Demo Mode only: retrieve from the temporary sandbox collection instead of the real one",
    )


class SandboxRequest(BaseModel):
    instruction: str = Field(..., description="Visitor's own wording of the hidden instruction (validated server-side)")


class SettingsUpdateRequest(BaseModel):
    delimiter: Optional[bool] = None
    sanitization: Optional[bool] = None
    output_filter: Optional[bool] = None
    retrieval_score_threshold: Optional[bool] = None
    threshold_value: Optional[float] = None


# --- Health Endpoint ---

@app.get("/health")
def health_check():
    """
    Returns system status, verifying reachability of both LLM and SQLite database.
    """
    llm_ok = llm_client.check_health(timeout=2.0)
    
    db_ok = False
    try:
        with audit_log.get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            db_ok = cursor.fetchone() is not None
    except Exception:
        db_ok = False

    overall_status = "ok" if (llm_ok and db_ok) else "degraded"

    return {
        "status": overall_status,
        "llm_reachable": llm_ok,
        "db_reachable": db_ok,
        "model": settings.LLM_MODEL,
        "llm_base_url": settings.LLM_BASE_URL,
        "data_dir": settings.DATA_DIR,
    }


# --- Query Endpoint ---

@app.post("/query")
def run_query(request: QueryRequest):
    """
    Executes the full retrieval-to-generation pipeline with mitigations and logging.
    If mitigations are not provided in request body, uses the active server settings.
    """
    flags = dict(active_settings)
    if request.mitigations:
        flags.update(request.mitigations)

    top_k = request.similarity_top_k if request.similarity_top_k and request.similarity_top_k > 0 else 3

    if request.sandbox and not ingestion.sandbox_exists():
        raise HTTPException(status_code=409, detail="No demo sandbox exists. Plant an instruction first.")

    try:
        result = pipeline.query_pipeline(
            query=request.query,
            mitigation_flags=flags,
            similarity_top_k=top_k,
            sandbox=request.sandbox,
        )
    except RuntimeError as err:
        # LLM failure (timeout, empty completion). HTTPException is handled inside the CORS
        # middleware, so the browser can read the real message instead of "Failed to fetch".
        raise HTTPException(status_code=502, detail=f"LLM generation failed: {err}")

    return {
        "query": result["query"],
        "response": result["response"],
        "raw_response": result["raw_response"],
        "prompt": result["prompt"],
        "retrieved_chunks": result["audit_entry"]["retrieved_chunks"],
        "is_flagged": result["is_flagged"],
        "final_status": result["final_status"],
        "audit_id": result["audit_id"],
        "active_mitigations": result["audit_entry"]["active_mitigations"],
        "reasoning_content": result.get("reasoning_content"),
        "stages": result["stages"],
        "sandbox": result["sandbox"],
    }



# --- Documents Endpoints ---

@app.get("/documents")
def list_documents():
    """
    Lists indexed knowledge base documents in DATA_DIR/documents with file type,
    size, and status badge ('Flagged pattern' for poisoned doc, 'Indexed' for others).
    """
    _, documents_dir = ingestion.get_chroma_paths()
    docs = []

    if documents_dir.exists():
        for file_path in sorted(documents_dir.glob("*")):
            if file_path.is_file() and file_path.name != ".gitkeep":
                try:
                    stat = file_path.stat()
                    content = file_path.read_text(encoding="utf-8", errors="replace")
                    is_poisoned = (
                        file_path.name == ingestion.POISONED_DOC_NAME
                        or ingestion.ATTACK_PAYLOAD in content
                    )
                    status = "Flagged pattern" if is_poisoned else "Indexed"

                    docs.append({
                        "filename": file_path.name,
                        "file_type": file_path.suffix.lstrip(".") or "txt",
                        "size_bytes": stat.st_size,
                        "status": status,
                        "is_poisoned": is_poisoned,
                        "last_modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                    })
                except Exception as err:
                    docs.append({
                        "filename": file_path.name,
                        "file_type": file_path.suffix.lstrip(".") or "unknown",
                        "size_bytes": 0,
                        "status": "Failed",
                        "is_poisoned": False,
                        "error": str(err),
                        "last_modified": datetime.now(timezone.utc).isoformat(),
                    })

    return {
        "documents": docs,
        "total": len(docs),
    }


NEWLINE = chr(10)
BLANK_LINE = NEWLINE * 2


@app.get("/documents/{filename}")
def get_document(filename: str):
    """
    Read-only: returns the real text of one indexed document. For the poisoned document it also returns where the
    planted instruction sits (character offsets into `text`) and the policy paragraph it contradicts
    (the paragraph immediately before the instruction, section heading removed), all computed server-side.
    """
    _, documents_dir = ingestion.get_chroma_paths()
    if Path(filename).name != filename or filename.startswith("."):
        raise HTTPException(status_code=404, detail="Document not found")
    file_path = documents_dir / filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found")

    text = file_path.read_text(encoding="utf-8", errors="replace")
    start = text.find(ingestion.ATTACK_PAYLOAD)
    injected_span = None
    policy_text = None
    section_heading = None
    if start >= 0:
        injected_span = {"start": start, "end": start + len(ingestion.ATTACK_PAYLOAD)}
        paragraph = text[:start].rstrip().split(BLANK_LINE)[-1]
        lines = paragraph.split(NEWLINE)
        while lines and lines[0].lstrip().startswith("#"):
            section_heading = lines.pop(0).lstrip("# ").strip()
        policy_text = NEWLINE.join(lines).strip() or None

    return {
        "filename": filename,
        "text": text,
        "is_poisoned": start >= 0,
        "injected_span": injected_span,
        "section_heading": section_heading,
        "policy_text": policy_text,
    }


@app.post("/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Uploads a markdown or text document into DATA_DIR/documents and synchronously
    re-indexes the knowledge base so the document is immediately retrievable.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in [".md", ".txt"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file extension '{suffix}'. Only .md and .txt files are supported.",
        )

    _, documents_dir = ingestion.get_chroma_paths()
    dest_path = documents_dir / file.filename

    content = await file.read()
    dest_path.write_bytes(content)

    # Re-index to ensure Chroma collection includes the new document
    try:
        ingestion.build_index(force_reindex=True)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to re-index documents after upload: {err}")

    # Check if newly uploaded file matches the poisoned pattern
    text_content = content.decode("utf-8", errors="replace")
    is_poisoned = ingestion.ATTACK_PAYLOAD in text_content or file.filename == ingestion.POISONED_DOC_NAME
    status = "Flagged pattern" if is_poisoned else "Indexed"

    return {
        "filename": file.filename,
        "size_bytes": len(content),
        "status": status,
        "is_poisoned": is_poisoned,
        "message": f"Document '{file.filename}' uploaded and indexed successfully.",
    }


# --- Audit Log Endpoints ---

def _format_log_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to deserialize JSON columns for API consumption."""
    formatted = dict(row)
    if isinstance(formatted.get("retrieved_chunks"), str):
        try:
            formatted["retrieved_chunks"] = json.loads(formatted["retrieved_chunks"])
        except Exception:
            pass
    if isinstance(formatted.get("active_mitigations"), str):
        try:
            formatted["active_mitigations"] = json.loads(formatted["active_mitigations"])
        except Exception:
            pass
    return formatted


@app.get("/audit-log")
def get_audit_logs(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    flagged_only: bool = Query(default=False),
    exclude_source: Optional[str] = Query(default=None),
):
    """
    Retrieves audit log records ordered by timestamp descending.
    Supports filtering by flagged_only, with pagination via limit and offset.
    Optional exclude_source (e.g. 'promptfoo') omits rows from that source.
    """
    if flagged_only:
        raw_logs = audit_log.get_flagged_logs(limit=limit, offset=offset, exclude_source=exclude_source)
    else:
        raw_logs = audit_log.get_recent_logs(limit=limit, offset=offset, exclude_source=exclude_source)

    formatted_logs = [_format_log_row(r) for r in raw_logs]
    return {
        "logs": formatted_logs,
        "total": len(formatted_logs),
        "limit": limit,
        "offset": offset,
        "flagged_only": flagged_only,
    }


@app.get("/audit-log/export")
def export_audit_log_csv(flagged_only: bool = Query(default=False)):
    """
    Exports the audit log table as an RFC 4180 compliant CSV file (Spec Screen 4).
    Supports optional flagged_only filtering to match the UI filter.
    """
    csv_content = audit_log.export_csv(flagged_only=flagged_only)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit_logs{'_flagged' if flagged_only else ''}.csv"},
    )


@app.get("/audit-log/{log_id}")
def get_single_audit_log(log_id: int):
    """
    Retrieves a single audit log entry by ID for Trace Detail / Attack Replay (Spec Screen 5).
    """
    entry = audit_log.get_log_by_id(log_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Audit log entry with id {log_id} not found")
    return _format_log_row(entry)


# --- Settings Endpoints ---

# --- Demo sandbox (Demo Mode step 7) ---

@app.get("/demo/sandbox")
def get_sandbox():
    state = ingestion.get_sandbox_state()
    return {
        "exists": ingestion.sandbox_exists(),
        "max_chars": ingestion.MAX_SANDBOX_INSTRUCTION_CHARS,
        "instruction": state.get("instruction"),
    }


@app.post("/demo/sandbox")
def create_sandbox(request: SandboxRequest):
    """Plants the visitor's instruction in a temporary copy of the FAQ and indexes it into the single sandbox collection."""
    try:
        ingestion.validate_sandbox_instruction(request.instruction)
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err))
    try:
        return ingestion.build_sandbox(request.instruction)
    except RuntimeError as err:
        raise HTTPException(status_code=500, detail=f"Sandbox build failed: {err}")


@app.delete("/demo/sandbox")
def delete_sandbox():
    return {"dropped": ingestion.drop_sandbox()}


@app.on_event("startup")
def _drop_leftover_sandbox():
    # A sandbox never survives a backend restart.
    try:
        ingestion.drop_sandbox()
    except Exception:
        pass


@app.on_event("startup")
def _warm_embedding_model():
    # Load the embedding model and run one embedding now, so the first live query is not a cold start.
    # uvicorn only serves /health after startup hooks finish, so start-dev.ps1's health wait covers this.
    try:
        ingestion.get_embed_model().get_text_embedding("warm-up")
    except Exception:
        pass


@app.get("/settings")
def get_settings():
    """
    Returns active mitigation toggle states, detection threshold, and read-only
    stack configuration (Spec 2.4 #7).
    """
    return {
        "mitigations": active_settings,
        "system_info": {
            "llm_model": settings.LLM_MODEL,
            "llm_base_url": settings.LLM_BASE_URL,
            "embedding_model": settings.EMBEDDING_MODEL,
            "vector_store": settings.VECTOR_STORE,
            "active_knowledge_base": settings.KNOWLEDGE_BASE,
            "data_dir": settings.DATA_DIR,
        },
    }


@app.post("/settings")
def update_settings(update_data: SettingsUpdateRequest):
    """
    Updates active mitigation flags and/or detection threshold value.
    Returns the updated settings state.
    """
    updates = update_data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        if value is not None:
            active_settings[key] = value

    return {
        "status": "updated",
        "mitigations": active_settings,
        "system_info": {
            "llm_model": settings.LLM_MODEL,
            "llm_base_url": settings.LLM_BASE_URL,
            "embedding_model": settings.EMBEDDING_MODEL,
            "vector_store": settings.VECTOR_STORE,
            "active_knowledge_base": settings.KNOWLEDGE_BASE,
            "data_dir": settings.DATA_DIR,
        },
    }


@app.post("/settings/reset")
def reset_demo_data():
    """
    Atomic demo reset handler (Spec 2.4 #7 & Locked Decisions):
    1. Removes any uploaded non-baseline documents to restore pristine document set
    2. Deletes + recreates the Chroma collection and synchronously re-indexes baseline documents
    3. Clears the SQLite audit log rows
    4. Resets mitigation toggles to default state
    All in one single endpoint handler.
    """
    _, documents_dir = ingestion.get_chroma_paths()

    # Step 1: Remove any non-baseline documents uploaded during previous runs
    removed_files = []
    if documents_dir.exists():
        for doc_file in documents_dir.glob("*"):
            if doc_file.is_file() and doc_file.name not in BASELINE_DOCUMENTS and doc_file.name != ".gitkeep":
                try:
                    doc_file.unlink()
                    removed_files.append(doc_file.name)
                except Exception:
                    pass

    # Step 2: Delete + recreate Chroma collection & re-index baseline documents synchronously
    try:
        ingestion.reindex_baseline_documents()
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to re-index Chroma collection during reset: {err}")

    # Step 2b: Drop any leftover demo sandbox collection
    try:
        ingestion.drop_sandbox()
    except Exception:
        pass

    # Step 3: Clear the SQLite audit log
    deleted_logs_count = audit_log.clear_audit_log()

    # Step 4: Reset active mitigation toggles to default
    active_settings.clear()
    active_settings.update(DEFAULT_SETTINGS)

    return {
        "status": "reset_complete",
        "message": "Vector store re-indexed and SQLite audit logs cleared.",
        "documents_indexed": len(BASELINE_DOCUMENTS),
        "removed_uploaded_files": removed_files,
        "logs_cleared": deleted_logs_count,
        "mitigations_reset": active_settings,
    }


# --- Test Runs Endpoint ---

# Latest in-memory Promptfoo test suite result
latest_promptfoo_result: Optional[Dict[str, Any]] = None


@app.get("/test-runs")
def get_test_runs():
    """
    Returns aggregated test statistics, technique-by-technique success/block rates,
    and trial records for the Test Suite Results screen (Spec Screen 6).
    If a Promptfoo suite has been executed, returns the Promptfoo evaluation results.
    Otherwise, returns the verified P4 16-combination baseline benchmark.
    """
    global latest_promptfoo_result

    # Check if latest_promptfoo_result is already in memory
    if latest_promptfoo_result:
        resp = dict(latest_promptfoo_result)
        recent_logs = audit_log.get_recent_logs(limit=20)
        resp["recent_audit_runs"] = [_format_log_row(r) for r in recent_logs]
        return resp

    # Prefer the processed result persisted by the last live suite run (read-only)
    if promptfoo_runner.PROMPTFOO_PROCESSED_PATH.exists():
        try:
            with open(promptfoo_runner.PROMPTFOO_PROCESSED_PATH, "r", encoding="utf-8") as f:
                processed = json.load(f)
            latest_promptfoo_result = processed
            resp = dict(processed)
            recent_logs = audit_log.get_recent_logs(limit=20)
            resp["recent_audit_runs"] = [_format_log_row(r) for r in recent_logs]
            return resp
        except Exception:
            pass

    # Otherwise re-derive from raw Promptfoo output on disk — WITHOUT writing audit rows
    if promptfoo_runner.PROMPTFOO_OUTPUT_PATH.exists() and promptfoo_runner.PROMPTFOO_TESTS_PATH.exists():
        try:
            with open(promptfoo_runner.PROMPTFOO_TESTS_PATH, "r", encoding="utf-8") as f:
                test_cases = json.load(f)
            with open(promptfoo_runner.PROMPTFOO_OUTPUT_PATH, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
            processed = promptfoo_runner.process_promptfoo_results(raw_data, test_cases, log_to_audit=False)
            latest_promptfoo_result = processed
            resp = dict(processed)
            recent_logs = audit_log.get_recent_logs(limit=20)
            resp["recent_audit_runs"] = [_format_log_row(r) for r in recent_logs]
            return resp
        except Exception:
            pass

    # No Promptfoo run on record: report an honest empty state (no hardcoded baseline numbers).
    recent_logs = audit_log.get_recent_logs(limit=20)
    return {
        "stats": {"trials_run": 0, "succeeded": 0, "blocked": 0, "block_rate_pct": 0},
        "by_technique": {},
        "trials": [],
        "recent_audit_runs": [_format_log_row(r) for r in recent_logs],
        "promptfoo_metadata": None,
    }


@app.post("/test-runs/run")
@app.post("/test-runs/promptfoo")
def run_test_suite():
    """
    Executes a live Promptfoo test suite (Spec 2.4 #6):
    - Runs trigger query and variants across 5 representative mitigation techniques
    - Evaluates model output via Promptfoo assertions
    - Emulates end-to-end RAG output filter
    - Logs each trial into SQLite audit log with traceable audit_id
    - Returns aggregated stats, technique breakdown, and trial-by-trial table
    """
    global latest_promptfoo_result
    try:
        results = promptfoo_runner.execute_promptfoo_suite()
        latest_promptfoo_result = results
        resp = dict(results)
        recent_logs = audit_log.get_recent_logs(limit=20)
        resp["recent_audit_runs"] = [_format_log_row(r) for r in recent_logs]
        return resp
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Promptfoo suite execution failed: {err}")

