# Rehearsal setup — fresh clone to running demo (presenting laptop)

Run every command in **PowerShell**. Do this while you still have internet; afterwards the demo runs offline. Each step lists the output to expect (values such as seconds will differ).

## 1. Install the tools (once)

| Tool | Check | Expect |
|---|---|---|
| Git | `git --version` | `git version 2.x` |
| Python 3.13 (3.11+ works; the launcher prefers 3.13 via `py -3.13`) | `py -3.13 --version` | `Python 3.13.x` |
| Node.js 18+ | `node --version` | `v18` or higher |
| Ollama | `ollama --version` | `ollama version is 0.x` |
| Google Chrome | open it once | any recent version |

## 2. Clone

```powershell
git clone https://github.com/BilalAamir4/Rag-Prompt-Injection-Security.git rag-poisoned-docs
cd rag-poisoned-docs
```
(After you rename the GitHub repo to `rag-poisoned-docs`, use `https://github.com/BilalAamir4/rag-poisoned-docs.git`.) Expect `Cloning into 'rag-poisoned-docs'...` and the folder to contain `start-dev.ps1`, `backend`, `frontend`, `PRESENTER_SCRIPT.md`.

## 3. Install dependencies

```powershell
py -3.13 -m pip install -r backend/requirements.txt
```
Expect `Successfully installed ...` (several minutes; it installs FastAPI, LlamaIndex, ChromaDB, sentence-transformers and PyTorch).

```powershell
cd frontend; npm install; cd ..
```
Expect `added NNN packages` and no `npm error`.

```powershell
npm install
```
(Repo root; only needed for the optional walk script in section 7. Expect `added ... packages`.)

## 4. Download the models (needs internet, once)

```powershell
ollama pull llama3.1:8b
```
Expect `pulling manifest ... success` (about 4.9 GB). Check with `ollama list`: a row `llama3.1:8b`.

The embedding model (`sentence-transformers/all-MiniLM-L6-v2`) downloads automatically the first time the backend starts (next step), so the first start needs internet and takes longer.

## 5. Start everything

```powershell
.\start-dev.ps1
```
If PowerShell blocks scripts: `powershell -ExecutionPolicy Bypass -File .\start-dev.ps1`. Expect, in order (times are from a cold start on the development laptop: about 78 s in total):

```
=== PoisonDoc - Launcher ===
[1/6] Checking environment files...
  [WARN] Copied backend/.env.example -> backend/.env      (first run only; same for frontend)
  [PASS] .env ready (LLM_MODEL=llama3.1:8b)
[2/6] Checking Ollama...
  [PASS] Started Ollama with OLLAMA_CONTEXT_LENGTH=8192
  [PASS] Model llama3.1:8b is installed
[3/6] Checking DATA_DIR...
  [PASS] DATA_DIR ready (./data)
[4/6] Starting backend...
  [PASS] Backend healthy (model: llama3.1:8b); embedding model warmed at startup
[5/6] Warming up llama3.1:8b ...
  [PASS] Model warm (16 s), kept loaded for 60 min
  [PASS] Context length 8192
[6/6] Starting frontend on http://localhost:5173 ...
  VITE v5.x  ready in ... ms
```
Any `[FAIL]` line stops the script and says what to do. If Ollama was already running, it prints `Ollama already running (cannot verify its context length...)`: stop Ollama (tray icon, Quit) and re-run so it starts with the 8192 context. Leave this window open.

In a second PowerShell window, from the repo folder:

```powershell
Invoke-RestMethod http://localhost:8000/health
```
Expect `status ok`, `llm_reachable True`, `db_reachable True`, `model llama3.1:8b`.

```powershell
Invoke-RestMethod -Method Post http://localhost:8000/settings/reset
```
Expect `status reset_complete` and `documents_indexed 7`.

Record the baselines you will compare against at the end:

```powershell
Invoke-RestMethod http://localhost:8000/settings | ConvertTo-Json -Depth 5 | Out-File settings_before.json -Encoding utf8
(Get-FileHash data\documents\faq_doc.md -Algorithm SHA256).Hash
```
Expect the hash `D51921268C433FDE54CB21A4850BD9F446E1084EF04A9D4A35169C74E31EB556`.

## 6. Check the demo in the browser (100% zoom)

Open Chrome at `http://localhost:5173`, press Ctrl+0 (100% zoom), maximise. Expect the PoisonDoc title line "PoisonDoc — prompt injection attacks and defenses in RAG" and an empty diagram. Walk the 7 steps with PRESENTER_SCRIPT.md and note, per step, the time you spend and any glitch (template below). Check that every step's content is above the bottom bar.

Then repeat once with **Ollama stopped** (quit it from the tray, or `Stop-Process -Name ollama* -Force`) following each step's failure plan: steps 2, 4, 5 should show the red "The live run failed" box and offer "Show recorded run(s)" with the banner "Recorded replay — <date>, <model> — not a live run"; step 7 shows only the error; 3 and 6 still work. Start Ollama again with `.\start-dev.ps1` (stop the old one first with Ctrl+C).

## 7. Optional: automated timed walk

```powershell
node scripts/demo_walk.mjs http://localhost:5173 rehearsal 1536 864
```
(use your laptop's real viewport width/height). Expect a JSON line such as `{"step2":1.3,"step4":2.4,"step5":12.6,"step7":4.9,"total_live":21.2}` (seconds on the development laptop) and PNGs in `rehearsal/`. It resets nothing and changes no settings; it plants and restores a temporary step-7 copy.

## 8. Finish and compare

```powershell
Invoke-RestMethod http://localhost:8000/settings | ConvertTo-Json -Depth 5 | Out-File settings_after.json -Encoding utf8
fc.exe settings_before.json settings_after.json
(Get-FileHash data\documents\faq_doc.md -Algorithm SHA256).Hash
```
Expect `FC: no differences encountered` and the same hash as before. Then `POST /settings/reset` again so the evidence screen starts clean on the day.

### Rehearsal log template (copy to `rehearsal.md` and send it back)

| Step | Budget | Measured | Glitch / note |
|---|---|---|---|
| 1 | 1:30 | | |
| 2 | 1:00 | | |
| 3 | 0:45 | | |
| 4 | 1:15 | | |
| 5 | 2:15 | | |
| 6 | 1:15 | | |
| 7 | 2:00 | | |
| Total | 10:00 | | |

Also note: cold `start-dev.ps1` time to ready, the first live answer's wait, behaviour with Ollama stopped, and any step whose content is cut off at your screen size.
