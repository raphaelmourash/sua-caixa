# Script de Instalação Automatizada do SuaCaixa
$ErrorActionPreference = 'Stop'

# URL direto para o instalador na release v0.1.0
$url  = "https://github.com/raphaelmourash/sua-caixa/releases/latest/download/SuaCaixa_0.1.0_x64-setup.exe"
$dest = Join-Path $env:TEMP "SuaCaixa_0.1.0_x64-setup.exe"

Write-Host "A descarregar a versão mais recente do SuaCaixa..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing

# Remove a marca "veio da internet" (MOTW) para evitar o SmartScreen do Windows
Unblock-File -Path $dest

Write-Host "A instalar a aplicação..." -ForegroundColor Yellow
Start-Process -FilePath $dest -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-" -Wait

# Limpeza do ficheiro temporário
Remove-Item $dest -Force -ErrorAction SilentlyContinue

Write-Host "Instalação concluída com sucesso! O SuaCaixa está pronto a usar." -ForegroundColor Green
