<#
.SYNOPSIS
    Starts the OSSM stack (Postgres, SeaweedFS, API, web, Caddy) with Docker Compose.

.DESCRIPTION
    Makes sure Docker Desktop is running, brings up deploy/compose.yaml (plus the local-only
    compose.override.yaml that publishes Postgres on 127.0.0.1:5432), waits until the API answers
    through the proxy, then opens the site.

.PARAMETER NoBuild
    Skip rebuilding images; reuse the ones already built.

.PARAMETER NoOpen
    Don't open the browser when the stack is ready.

.PARAMETER Logs
    Follow container logs after startup (Ctrl+C stops following, not the stack).

.PARAMETER Stop
    Stop and remove the containers instead of starting them. Volumes (database, uploads) are kept.

.PARAMETER Port
    Host port for the proxy. Defaults to $env:OSSM_PORT, then 8080.

.EXAMPLE
    .\.claude\script\start.ps1
    .\.claude\script\start.ps1 -NoBuild -NoOpen
    .\.claude\script\start.ps1 -Stop
#>
[CmdletBinding()]
param(
    [switch]$NoBuild,
    [switch]$NoOpen,
    [switch]$Logs,
    [switch]$Stop,
    [int]$Port = $(if ($env:OSSM_PORT) { [int]$env:OSSM_PORT } else { 8080 })
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$compose = @(
    '-f', (Join-Path $repoRoot 'deploy\compose.yaml'),
    '-f', (Join-Path $repoRoot 'deploy\compose.override.yaml')
)
$env:OSSM_PORT = "$Port"
$url = "http://localhost:$Port"

function Test-DockerReady {
    docker info *> $null
    return $LASTEXITCODE -eq 0
}

function Start-DockerDesktop {
    if (Test-DockerReady) { return }

    $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path $exe)) {
        throw "Docker isn't running and Docker Desktop wasn't found at '$exe'. Start Docker and re-run."
    }

    Write-Host 'Starting Docker Desktop...' -ForegroundColor Cyan
    Start-Process $exe

    $deadline = (Get-Date).AddMinutes(3)
    while (-not (Test-DockerReady)) {
        if ((Get-Date) -gt $deadline) { throw 'Timed out waiting for Docker to become ready.' }
        Start-Sleep -Seconds 3
    }
    Write-Host 'Docker is ready.' -ForegroundColor Green
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'docker was not found on PATH. Install Docker Desktop first.'
}

Start-DockerDesktop

Push-Location $repoRoot
try {
    if ($Stop) {
        Write-Host 'Stopping OSSM...' -ForegroundColor Cyan
        docker compose @compose down
        if ($LASTEXITCODE -ne 0) { throw 'docker compose down failed.' }
        Write-Host 'Stopped. Data volumes were kept.' -ForegroundColor Green
        return
    }

    $up = @('up', '-d', '--wait')
    if (-not $NoBuild) { $up += '--build' }

    Write-Host "Starting OSSM on $url ..." -ForegroundColor Cyan
    docker compose @compose @up
    if ($LASTEXITCODE -ne 0) {
        throw 'docker compose up failed. Check the output above, or run: docker compose -f deploy/compose.yaml logs'
    }

    # Caddy sends /api to the backend; the OpenAPI document is public and only answers once the API is up.
    Write-Host 'Waiting for the API...' -ForegroundColor Cyan
    $deadline = (Get-Date).AddMinutes(3)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri "$url/api/v3/api-docs" -UseBasicParsing -TimeoutSec 5
            if ($resp.StatusCode -eq 200) { $ready = $true; break }
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    if (-not $ready) {
        Write-Warning "The API didn't answer at $url within 3 minutes. Inspect it with: docker compose -f deploy/compose.yaml logs api"
    } else {
        Write-Host "OSSM is up: $url" -ForegroundColor Green
        Write-Host "  API docs: $url/api/docs"
        Write-Host '  Postgres: 127.0.0.1:5432 (db ossm, user ossm)'
        Write-Host '  Stop it:  .\.claude\script\start.ps1 -Stop'
        if (-not $NoOpen) { Start-Process $url }
    }

    if ($Logs) {
        docker compose @compose logs -f
    }
} finally {
    Pop-Location
}
