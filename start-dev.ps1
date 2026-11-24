# Sentinel RAG - Demo / Development Launcher (PowerShell)
# Starts Ollama (context 8192) if needed, checks the configured model, starts the backend,
# waits for /health, warms the model, then runs Vite in this window. Ctrl+C stops what it started.
$ErrorActionPreference = "Stop"
$OllamaCtx = "8192"
$Root = $PSScriptRoot
Set-Location $Root

function Pass($m) { Write-Host "  [PASS] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  [FAIL] $m" -ForegroundColor Red; exit 1 }

Write-Host "=== Sentinel RAG - Launcher ===" -ForegroundColor Cyan

# [1/6] Environment files
Write-Host "[1/6] Checking environment files..."
foreach ($pair in @(@("backend/.env", "backend/.env.example"), @("frontend/.env", "frontend/.env.example"))) {
    if (-not (Test-Path $pair[0]) -and (Test-Path $pair[1])) {
        Copy-Item $pair[1] $pair[0]
        Warn "Copied $($pair[1]) -> $($pair[0])"
    }
}
if (-not ((Test-Path "backend/.env") -and (Test-Path "frontend/.env"))) { Fail "Missing .env files and no .env.example to copy." }

$model = "llama3.1:8b"; $dataDir = "./data"; $llmBase = "http://localhost:11434/v1"
foreach ($line in Get-Content "backend/.env") {
    if ($line -match "^LLM_MODEL=(.+)$")    { $model   = $matches[1].Trim() }
    if ($line -match "^DATA_DIR=(.+)$")     { $dataDir = $matches[1].Trim() }
    if ($line -match "^LLM_BASE_URL=(.+)$") { $llmBase = $matches[1].Trim() }
}
Pass ".env ready (LLM_MODEL=$model)"

# [2/6] Ollama
Write-Host "[2/6] Checking Ollama..."
$started = @()
function Test-Ollama { try { Invoke-RestMethod "http://localhost:11434/api/tags" -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (Test-Ollama) {
    Pass "Ollama already running (cannot verify its context length; stop it and re-run if unsure)."
} else {
    $env:OLLAMA_CONTEXT_LENGTH = $OllamaCtx
    $ollamaProc = Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Minimized -PassThru
    $started += $ollamaProc
    for ($i = 0; $i -lt 20 -and -not (Test-Ollama); $i++) { Start-Sleep -Seconds 1 }
    if (-not (Test-Ollama)) { Fail "Ollama did not start. Run 'ollama serve' manually." }
    Pass "Started Ollama with OLLAMA_CONTEXT_LENGTH=$OllamaCtx"
}
$tags = (Invoke-RestMethod "http://localhost:11434/api/tags").models.name
if ($tags -notcontains $model) { Fail "Model '$model' is not installed. Run: ollama pull $model" }
Pass "Model $model is installed"

# [3/6] DATA_DIR
Write-Host "[3/6] Checking DATA_DIR..."
$docs = Join-Path "backend" (Join-Path $dataDir "documents")
if (-not (Test-Path $docs)) { New-Item -ItemType Directory -Path $docs -Force | Out-Null }
Pass "DATA_DIR ready ($dataDir)"

# [4/6] Backend (no --reload: a reload mid-demo would drop the in-memory settings)
Write-Host "[4/6] Starting backend..."
$pythonExe = "python"
if (Get-Command py -ErrorAction SilentlyContinue) {
    try {
        & py -3.13 -c "import uvicorn" 2>$null
        if ($LASTEXITCODE -eq 0) { $pythonExe = (& py -3.13 -c "import sys; print(sys.executable)").Trim() }
    } catch {}
}
$backend = Start-Process -FilePath $pythonExe -ArgumentList "-m","uvicorn","main:app","--host","127.0.0.1","--port","8000" -WorkingDirectory "backend" -PassThru
$started += $backend
$health = $null
for ($i = 0; $i -lt 60 -and -not $health; $i++) {
    Start-Sleep -Seconds 2
    try { $health = Invoke-RestMethod "http://localhost:8000/health" -TimeoutSec 3 } catch {}
}
if (-not $health) { Fail "Backend did not become healthy within 120 s (see its console window)." }
if (-not $health.llm_reachable) { Fail "Backend is up but cannot reach the LLM at $llmBase." }
Pass "Backend healthy (model: $($health.model)); embedding model warmed at startup"

# [5/6] Warm-up: load the model into memory and keep it there, so the first demo query is not a cold start
Write-Host "[5/6] Warming up $model (can take up to a minute on a cold start)..."
try {
    $body = @{ model = $model; prompt = "Reply with OK."; stream = $false; keep_alive = "60m"; options = @{ temperature = 0; num_predict = 4 } } | ConvertTo-Json -Depth 4
    $sw = [Diagnostics.Stopwatch]::StartNew()
    Invoke-RestMethod "http://localhost:11434/api/generate" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 300 | Out-Null
    Pass "Model warm ($([int]$sw.Elapsed.TotalSeconds) s), kept loaded for 60 min"
    try {
        $ps = Invoke-RestMethod "http://localhost:11434/api/ps"
        $loaded = $ps.models | Where-Object { $_.name -eq $model } | Select-Object -First 1
        if ($loaded -and $loaded.context_length) {
            if ([string]$loaded.context_length -ne $OllamaCtx) { Warn "Loaded context length is $($loaded.context_length), expected $OllamaCtx. Restart Ollama via this script." }
            else { Pass "Context length $($loaded.context_length)" }
        }
    } catch {}
} catch {
    Warn "Warm-up failed ($($_.Exception.Message)). The first query may be slow."
}

# [6/6] Frontend
Write-Host "[6/6] Starting frontend on http://localhost:5173 (Ctrl+C to stop everything this script started)..." -ForegroundColor Cyan
try {
    Set-Location "frontend"
    npm run dev
} finally {
    Set-Location $Root
    Write-Host "`nStopping processes started by this script..." -ForegroundColor Yellow
    foreach ($p in $started) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
}
