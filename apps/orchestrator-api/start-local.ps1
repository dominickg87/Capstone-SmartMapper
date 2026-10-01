$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$configPath = Join-Path $PSScriptRoot '.env.development.local'
$serverPath = Join-Path $PSScriptRoot 'dist\server.js'
$mockPath = Join-Path $workspace 'apps\mock-carriers'
$vitePath = Join-Path $workspace 'node_modules\vite\bin\vite.js'
$nodePath = Join-Path $workspace '.tools\node-v24.19.0-win-x64\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
}
if (-not (Test-Path -LiteralPath $configPath)) {
    throw 'Create apps/orchestrator-api/.env.development.local using the setup guide first.'
}
if (-not (Test-Path -LiteralPath $serverPath)) {
    throw 'Run pnpm build first.'
}
if (-not (Test-Path -LiteralPath $vitePath)) {
    throw 'Run pnpm install first.'
}
$settings = Get-Content -LiteralPath $configPath
if ($settings -notcontains 'NODE_ENV=development' -or $settings -notcontains 'SMARTMAPPER_CHECKPOINT_STORE=memory') {
    throw 'The local launcher requires development mode and memory checkpoints.'
}
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in @(4300, 4173) })
if ($listeners.Count -gt 0) {
    throw 'Port 4300 or 4173 is already in use. Leave an existing local session running or stop it before starting another.'
}
$certificate = Join-Path $env:USERPROFILE '.config\herd\config\valet\CA\LaravelValetCASelfSigned.crt'
if (-not (Test-Path -LiteralPath $certificate)) {
    throw 'The local Herd public CA certificate was not found. Configure certificate trust before starting.'
}
$env:NODE_EXTRA_CA_CERTS = $certificate
$logDirectory = Join-Path $workspace '.tools\local-runtime'
[System.IO.Directory]::CreateDirectory($logDirectory) | Out-Null
$api = Start-Process -FilePath $nodePath -ArgumentList ('--env-file="' + $configPath + '" "' + $serverPath + '"') `
    -WorkingDirectory $workspace -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logDirectory 'api.stdout.log') `
    -RedirectStandardError (Join-Path $logDirectory 'api.stderr.log')
$mock = Start-Process -FilePath $nodePath -ArgumentList ('"' + $vitePath + '" --host 127.0.0.1 --port 4173 --strictPort') `
    -WorkingDirectory $mockPath -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logDirectory 'mock.stdout.log') `
    -RedirectStandardError (Join-Path $logDirectory 'mock.stderr.log')
[ordered]@{
    apiPid = $api.Id
    mockPid = $mock.Id
    startedAt = [DateTime]::UtcNow.ToString('o')
    backend = 'http://127.0.0.1:4300'
    mock = 'http://127.0.0.1:4173'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDirectory 'processes.json') -Encoding UTF8
Write-Output "Started local API PID $($api.Id) and mock carrier PID $($mock.Id)."
Write-Output 'Health: http://127.0.0.1:4300/health'
Write-Output 'Mock form: http://127.0.0.1:4173/modern'
