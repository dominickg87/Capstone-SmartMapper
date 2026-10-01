$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$output = Join-Path $workspace "artifacts\smartmapper-api-$stamp"
$staging = Join-Path $workspace "artifacts\smartmapper-workspace-$stamp"
Push-Location $workspace
try {
    pnpm --filter '@smartmapper/orchestrator-api...' build
    if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }
    [System.IO.Directory]::CreateDirectory($staging) | Out-Null
    foreach ($file in @('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml')) {
        Copy-Item -LiteralPath (Join-Path $workspace $file) -Destination (Join-Path $staging $file)
    }
    foreach ($group in @('apps', 'packages')) {
        foreach ($project in (Get-ChildItem -LiteralPath (Join-Path $workspace $group) -Directory)) {
            $destination = Join-Path $staging ($group + '\' + $project.Name)
            [System.IO.Directory]::CreateDirectory($destination) | Out-Null
            Copy-Item -LiteralPath (Join-Path $project.FullName 'package.json') -Destination $destination
            if (Test-Path -LiteralPath (Join-Path $project.FullName 'dist')) {
                Copy-Item -LiteralPath (Join-Path $project.FullName 'dist') -Destination $destination -Recurse
            }
        }
    }
    Push-Location $staging
    try {
        pnpm --filter '@smartmapper/orchestrator-api' --config.verify-deps-before-run=false --config.node-linker=hoisted --store-dir (Join-Path $workspace '.pnpm-store') deploy --prod $output
        if ($LASTEXITCODE -ne 0) { throw 'Deployment package preparation failed' }
    } finally { Pop-Location }
    $zip = "$output.zip"
    tar -a -c -h -f $zip -C $output .
    if ($LASTEXITCODE -ne 0) { throw 'ZIP creation failed' }
    Write-Output "Prepared: $zip"
    Write-Output 'App Service startup command: node dist/server.js'
} finally {
    Pop-Location
}
