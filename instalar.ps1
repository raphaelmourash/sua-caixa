# Script de Instalação do SuaCaixa com Tratamento Automático de TLS
$ErrorActionPreference = 'Stop'

# Garante compatibilidade com TLS 1.2 caso o PowerShell seja mais antigo
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
    # Ignora se a versão do .NET não suportar diretamente esta atribuição
}

$url  = "https://github.com/raphaelmourash/sua-caixa/releases/latest/download/SuaCaixa_0.1.0_x64-setup.exe"
$dest = Join-Path $env:TEMP "SuaCaixa_0.1.0_x64-setup.exe"

Write-Host "A descarregar a versão mais recente do SuaCaixa..." -ForegroundColor Cyan

try {
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}
catch {
    Write-Host "Aviso: Falha na descarga padrão. A tentar renegociar conexão segura..." -ForegroundColor Yellow
    # Segunda tentativa forçando explicitamente os protocolos TLS suportados
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}

# Remove a marca de origem da internet (MOTW) para evitar bloqueios do SmartScreen
Unblock-File -Path $dest -ErrorAction SilentlyContinue

Write-Host "A instalar a aplicação..." -ForegroundColor Yellow

try {
    # Tenta instalação silenciosa primeiro
    $process = Start-Process -FilePath $dest -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-" -PassThru -Wait
    
    if ($process.ExitCode -ne 0) {
        throw "O instalador retornou o código de erro $($process.ExitCode)"
    }
    Write-Host "Instalação concluída com sucesso!" -ForegroundColor Green
}
catch {
    Write-Host "Aviso: A instalação silenciosa foi restrita. A abrir o instalador interativo..." -ForegroundColor Magenta
    Start-Process -FilePath $dest -Wait
}

# Limpeza do ficheiro temporário
Remove-Item $dest -Force -ErrorAction SilentlyContinue
