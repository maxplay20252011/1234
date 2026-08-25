# Instalacion para Windows.
# Uso, desde PowerShell y en esta carpeta:
#     powershell -ExecutionPolicy Bypass -File .\install.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "  Instalando el control de televisores"
Write-Host "  ------------------------------------"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  Falta Node.js."
    Write-Host ""
    Write-Host "  Instalalo desde https://nodejs.org (el boton que dice LTS) y volve"
    Write-Host "  a correr este script."
    exit 1
}

# El proyecto usa fetch estable y otras cosas de Node 20 en adelante.
$mayor = [int](node -p "process.versions.node.split('.')[0]")
if ($mayor -lt 20) {
    Write-Host "  Tenes Node $(node -v), pero hace falta la version 20 o superior."
    Write-Host "  Actualizalo desde https://nodejs.org"
    exit 1
}
Write-Host "  Node $(node -v): bien."

if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    Write-Host "  ffmpeg: instalado (se van a poder convertir videos incompatibles)."
} else {
    Write-Host "  ffmpeg: no esta. No es obligatorio; los videos se envian tal cual."
    Write-Host "          Para instalarlo:  winget install ffmpeg"
}

Write-Host ""
Write-Host "  Instalando dependencias (tarda un minuto la primera vez)..."
npm install --silent

if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host "  Se creo el archivo .env con los valores por defecto."
}

Write-Host ""
Write-Host "  Compilando la interfaz..."
npm run build --silent

Write-Host ""
Write-Host "  ------------------------------------"
Write-Host "  Listo."
Write-Host ""
Write-Host "  Para ver si encuentra tus televisores:"
Write-Host "      npm run discover"
Write-Host ""
Write-Host "  Para arrancar la aplicacion:"
Write-Host "      npm start"
Write-Host ""
Write-Host "  Despues abri desde el celular la direccion que imprima la terminal."
Write-Host ""

# Windows Firewall pregunta la primera vez que algo escucha en un puerto.
Write-Host "  Nota: la primera vez, Windows puede preguntar si permitis que Node"
Write-Host "  acceda a la red. Hay que decir que SI para las redes privadas, o el"
Write-Host "  celular no va a poder conectarse."
Write-Host ""
