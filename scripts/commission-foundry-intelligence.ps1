param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

function Section([string]$Title) {
  Write-Host "`n=== $Title ===" -ForegroundColor Cyan
}

function Run-Step([string]$Label, [scriptblock]$Action) {
  Write-Host "`n[$Label]" -ForegroundColor Yellow
  try {
    & $Action
    Write-Host "PASS: $Label" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "FAIL: $Label" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    return $false
  }
}

$report = [ordered]@{
  sampledAt = (Get-Date).ToUniversalTime().ToString('o')
  repository = [ordered]@{}
  validation = [ordered]@{}
  host = [ordered]@{}
  ollama = [ordered]@{}
}

Section 'Repository'
$report.repository.branch = (git branch --show-current).Trim()
$report.repository.commit = (git rev-parse HEAD).Trim()
$report.repository.status = @(git status --short)
Write-Host "Branch: $($report.repository.branch)"
Write-Host "Commit: $($report.repository.commit)"
if ($report.repository.status.Count -gt 0) {
  Write-Host 'Working tree contains local changes:' -ForegroundColor Yellow
  $report.repository.status | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host 'Working tree clean.' -ForegroundColor Green
}

Section 'Foundry validation'
$report.validation.frontendTests = Run-Step 'npm test' { npm test }
$report.validation.operationalAudit = Run-Step 'operational audit' { npm run audit:operational }
$report.validation.integrationAudit = Run-Step 'Foundry Link audit' { npm run audit:integration }
if (-not $SkipBuild) {
  $report.validation.frontendBuild = Run-Step 'frontend production build' { npm run build }
}
$report.validation.rustCheck = Run-Step 'Rust/Tauri cargo check' { cargo check --manifest-path src-tauri/Cargo.toml }
$report.validation.foundryLinkRust = Run-Step 'Foundry Link Rust transport tests' { cargo test --manifest-path src-tauri/Cargo.toml foundry_link::command_tests }
$report.validation.ollamaRust = Run-Step 'Ollama localhost Rust transport tests' { cargo test --manifest-path src-tauri/Cargo.toml ollama_local::tests }

Section 'Windows host'
try {
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $os = Get-CimInstance Win32_OperatingSystem
  $gpu = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Microsoft Basic' } | Select-Object Name, AdapterRAM)
  $drives = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
    [ordered]@{
      name = [string]$_.DeviceID
      totalBytes = [uint64]$_.Size
      freeBytes = [uint64]$_.FreeSpace
      fileSystem = [string]$_.FileSystem
    }
  })
  $report.host.cpu = [string]$cpu.Name
  $report.host.totalMemoryBytes = [uint64]$os.TotalVisibleMemorySize * 1024
  $report.host.gpu = $gpu
  $report.host.drives = $drives
  Write-Host "CPU: $($report.host.cpu)"
  Write-Host ("RAM: {0:N1} GiB" -f ($report.host.totalMemoryBytes / 1GB))
  $gpu | ForEach-Object { Write-Host "GPU: $($_.Name)" }
  $drives | ForEach-Object { Write-Host ("Drive {0}: {1:N1} GiB free / {2:N1} GiB ({3})" -f $_.name, ($_.freeBytes/1GB), ($_.totalBytes/1GB), $_.fileSystem) }
} catch {
  $report.host.error = $_.Exception.Message
  Write-Host "Host inventory failed: $($report.host.error)" -ForegroundColor Red
}

Section 'Ollama'
$ollamaCommand = Get-Command ollama -ErrorAction SilentlyContinue
$report.ollama.cliInstalled = $null -ne $ollamaCommand
if ($ollamaCommand) {
  try {
    $report.ollama.version = ((ollama --version) | Out-String).Trim()
    Write-Host $report.ollama.version
  } catch {
    $report.ollama.versionError = $_.Exception.Message
  }
} else {
  Write-Host 'Ollama CLI not found on PATH.' -ForegroundColor Yellow
}

try {
  $tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -Method Get -TimeoutSec 3
  $report.ollama.serviceReachable = $true
  $report.ollama.models = @($tags.models | ForEach-Object { $_.name })
  Write-Host 'Ollama localhost API reachable.' -ForegroundColor Green
  if ($report.ollama.models.Count -gt 0) {
    Write-Host 'Installed models:'
    $report.ollama.models | ForEach-Object { Write-Host "  - $_" }
  } else {
    Write-Host 'Ollama is reachable but no local models are installed.' -ForegroundColor Yellow
  }
} catch {
  $report.ollama.serviceReachable = $false
  $report.ollama.apiError = $_.Exception.Message
  Write-Host 'Ollama localhost API is not currently reachable.' -ForegroundColor Yellow
  Write-Host $report.ollama.apiError
}

Section 'Commissioning result'
$requiredValidation = @(
  $report.validation.frontendTests,
  $report.validation.operationalAudit,
  $report.validation.integrationAudit,
  $report.validation.rustCheck,
  $report.validation.foundryLinkRust,
  $report.validation.ollamaRust
)
if (-not $SkipBuild) { $requiredValidation += $report.validation.frontendBuild }
$report.readyForRuntimeProbe = ($requiredValidation -notcontains $false) -and ($report.repository.branch -eq 'rollout/foundry-intelligence')
$report.readyForIntelligenceCommissioning = $report.readyForRuntimeProbe -and $report.ollama.serviceReachable -and ($report.ollama.models.Count -gt 0)

Write-Host "Ready for Foundry runtime probe: $($report.readyForRuntimeProbe)"
Write-Host "Ready for Intelligence model commissioning: $($report.readyForIntelligenceCommissioning)"
Write-Host "`n--- FOUNDry COMMISSIONING REPORT JSON ---" -ForegroundColor Cyan
$report | ConvertTo-Json -Depth 8
Write-Host '--- END REPORT ---' -ForegroundColor Cyan
