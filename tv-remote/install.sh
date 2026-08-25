#!/usr/bin/env bash
# Instalacion para Linux y macOS.  Uso:  ./install.sh
set -euo pipefail

cd "$(dirname "$0")"

echo ""
echo "  Instalando el control de televisores"
echo "  ────────────────────────────────────"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  Falta Node.js."
  echo ""
  echo "  Instalalo desde https://nodejs.org (el boton que dice LTS) y volve a"
  echo "  correr este script."
  exit 1
fi

# El proyecto usa fetch estable y otras cosas de Node 20 en adelante.
VERSION_MAYOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$VERSION_MAYOR" -lt 20 ]; then
  echo "  Tenes Node $(node -v), pero hace falta la version 20 o superior."
  echo "  Actualizalo desde https://nodejs.org"
  exit 1
fi
echo "  Node $(node -v): bien."

if command -v ffmpeg >/dev/null 2>&1; then
  echo "  ffmpeg: instalado (se van a poder convertir videos incompatibles)."
else
  echo "  ffmpeg: no esta. No es obligatorio; los videos se envian tal cual."
  echo "           Para instalarlo:  sudo apt install ffmpeg   /   brew install ffmpeg"
fi

echo ""
echo "  Instalando dependencias (tarda un minuto la primera vez)..."
npm install --silent

if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Se creo el archivo .env con los valores por defecto."
fi

echo ""
echo "  Compilando la interfaz..."
npm run build --silent

echo ""
echo "  ────────────────────────────────────"
echo "  Listo."
echo ""
echo "  Para ver si encuentra tus televisores:"
echo "      npm run discover"
echo ""
echo "  Para arrancar la aplicacion:"
echo "      npm start"
echo ""
echo "  Despues abri desde el celular la direccion que imprima la terminal."
echo ""
