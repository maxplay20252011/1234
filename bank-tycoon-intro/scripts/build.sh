#!/usr/bin/env bash
# =========================================================================
# Bank Tycoon — intro MAXWER
# build.sh · frames PNG (270x480) -> MP4 1080x1920 con upscale NEAREST,
#           versión con canal alfa, audio y verificación con ffprobe.
#
# El upscale es el punto crítico de todo el pipeline: scale=...:flags=neighbor
# replica cada píxel 4x4 exactos. Cualquier otro escalador (bicubic, lanczos)
# metería bordes borrosos y arruinaría la estética.
#
#   bash scripts/build.sh                 # usa el último render
#   bash scripts/build.sh vertical_4s     # un tag concreto
#   bash scripts/build.sh --prores        # además exporta ProRes 4444
# =========================================================================
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WANT_PRORES=0; TAG=""
for a in "$@"; do
  case "$a" in
    --prores) WANT_PRORES=1 ;;
    --*) ;;
    *) TAG="$a" ;;
  esac
done

command -v ffmpeg  >/dev/null || { echo "✗ Falta ffmpeg. Instalalo y volvé a correr."; exit 1; }
command -v ffprobe >/dev/null || { echo "✗ Falta ffprobe (viene con ffmpeg)."; exit 1; }
command -v node    >/dev/null || { echo "✗ Falta node 20+."; exit 1; }

MANIFEST="out/last-render.json"
[[ -n "$TAG" ]] && MANIFEST="out/frames/$TAG/manifest.json"
[[ -f "$MANIFEST" ]] || { echo "✗ No encuentro $MANIFEST — corré primero: node scripts/render.mjs --format=vertical"; exit 1; }

j() { node -p "JSON.parse(require('fs').readFileSync('$1','utf8'))$2"; }

TAG=$(j "$MANIFEST" ".tag")
FPS=$(j "$MANIFEST" ".fps")
TPS=$(j "$MANIFEST" ".ticksPerSecond")
W=$(j "$MANIFEST" ".width");     H=$(j "$MANIFEST" ".height")
LW=$(j "$MANIFEST" ".lowWidth"); LH=$(j "$MANIFEST" ".lowHeight")
UP=$(j "$MANIFEST" ".upscale")
DUR=$(j "$MANIFEST" ".duration"); FRAMES=$(j "$MANIFEST" ".frames")
FRAMEDIR=$(j "$MANIFEST" ".dir || ''"); ALPHADIR=$(j "$MANIFEST" ".alpha || ''")

CRF=$(j config.json ".encode.crf");        PRESET=$(j config.json ".encode.preset")
PIXFMT=$(j config.json ".encode.pixFmt");  MAXMB=$(j config.json ".encode.maxSizeMB")
SWSF=$(j config.json ".encode.scaleFlags"); ACRF=$(j config.json ".encode.alpha.crf")
LUFS=$(j config.json ".audio.targetLufs"); TP=$(j config.json ".audio.truePeak")
LRA=$(j config.json ".audio.loudnessRange"); AR=$(j config.json ".audio.sampleRate")
ABR=$(j config.json ".audio.bitrate");     ACH=$(j config.json ".audio.channels")
AUDIO_ON=$(j config.json ".audio.enabled")

[[ -n "$FRAMEDIR" && -d "$FRAMEDIR" ]] || { echo "✗ No hay frames en '$FRAMEDIR'."; exit 1; }

BASE="out/bank-tycoon-intro_${TAG}"
MP4="${BASE}.mp4"; WEBM="${BASE}_alpha.webm"; MOV="${BASE}_alpha.mov"
CL=$([[ "$ACH" == "1" ]] && echo mono || echo stereo)
SCALE="scale=${W}:${H}:flags=${SWSF}:sws_dither=none"

echo ""
echo "▶ Build  $TAG   ${LW}x${LH} --x${UP} ${SWSF}--> ${W}x${H} @ ${FPS}fps   ${DUR}s   ${FRAMES} frames"

# ------------------------------------------------------- pista de audio
AUDIO_ARGS=(); FILTER=""
CUES=$(node -e '
  const fs=require("fs");
  const c=JSON.parse(fs.readFileSync("config.json","utf8"));
  if(!c.audio||c.audio.enabled===false){process.exit(0)}
  for(const q of (c.audio.cues||[])){
    const p="assets/sfx/"+q.file;
    if(fs.existsSync(p)) console.log([p,q.at,(q.gain??1)].join("\t"));
  }')

if [[ "$AUDIO_ON" == "true" && -n "$CUES" ]]; then
  n=0
  while IFS=$'\t' read -r f at gain; do
    [[ -z "$f" ]] && continue
    n=$((n+1)); AUDIO_ARGS+=(-i "$f")
    ms=$(node -p "Math.round($at*1000)")
    FILTER+="[${n}:a]aresample=${AR},aformat=channel_layouts=${CL},volume=${gain},adelay=${ms}|${ms},apad[a${n}];"
  done <<< "$CUES"
  mixin=""; for ((i=1;i<=n;i++)); do mixin+="[a${i}]"; done
  FILTER+="${mixin}amix=inputs=${n}:duration=longest:normalize=0,"
  FILTER+="atrim=0:${DUR},loudnorm=I=${LUFS}:TP=${TP}:LRA=${LRA},aresample=${AR}[aout]"
  echo "  audio     ${n} SFX mezclados + loudnorm ${LUFS} LUFS"
else
  AUDIO_ARGS+=(-f lavfi -t "$DUR" -i "anullsrc=r=${AR}:cl=${CL}")
  FILTER="[1:a]aresample=${AR}[aout]"
  echo "  audio     silencio (poné tus SFX en assets/sfx/ — ver README de esa carpeta)"
fi

# ------------------------------------------------------------- MP4 H.264
echo "· MP4 H.264 con upscale ${SWSF}…"
ffmpeg -y -hide_banner -loglevel error -stats \
  -framerate "$FPS" -start_number 0 -i "${FRAMEDIR}/frame_%06d.png" \
  "${AUDIO_ARGS[@]}" \
  -filter_complex "[0:v]${SCALE}[v];${FILTER}" \
  -map "[v]" -map "[aout]" \
  -c:v libx264 -preset "$PRESET" -crf "$CRF" -pix_fmt "$PIXFMT" \
  -profile:v high -level 4.2 -x264-params "keyint=${FPS}:min-keyint=1:scenecut=0" \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a "$ABR" -ar "$AR" -ac "$ACH" \
  -fps_mode passthrough -t "$DUR" -movflags +faststart \
  "$MP4"

# ------------------------------------------------- versión con canal alfa
if [[ -n "$ALPHADIR" && -d "$ALPHADIR" ]]; then
  echo "· WebM VP9 con alfa…"
  ffmpeg -y -hide_banner -loglevel error -stats \
    -framerate "$FPS" -start_number 0 -i "${ALPHADIR}/frame_%06d.png" \
    -vf "${SCALE},format=yuva420p" \
    -c:v libvpx-vp9 -pix_fmt yuva420p -crf "$ACRF" -b:v 0 -row-mt 1 \
    -auto-alt-ref 0 -deadline good -cpu-used 2 \
    -fps_mode passthrough -an "$WEBM"
  if [[ "$WANT_PRORES" == "1" ]]; then
    echo "· ProRes 4444 con alfa…"
    ffmpeg -y -hide_banner -loglevel error -stats \
      -framerate "$FPS" -start_number 0 -i "${ALPHADIR}/frame_%06d.png" \
      -vf "${SCALE},format=yuva444p10le" \
      -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -alpha_bits 8 -vendor apl0 \
      -fps_mode passthrough -an "$MOV"
  fi
else
  echo "  (sin frames alfa: corré  node scripts/render.mjs --format=${TAG%%_*} --with-alpha)"
fi

# ============================================================ verificación
echo ""
echo "▶ Verificación (ffprobe)"
GLOBAL_OK=1

# ¿Cada bloque de UPxUP es de un solo color? Truco: bajar por promedio de área
# y volver a subir con nearest. Si el bloque era uniforme, la ida y vuelta es
# la identidad y el PSNR da inf. Si hubo interpolación, da un número finito.
pixelcheck() {
  local img="$1" label="$2" hard="$3"
  local out psnr
  out=$(ffmpeg -hide_banner -nostdin -i "$img" \
        -lavfi "split[a][b];[a]scale=iw/${UP}:ih/${UP}:flags=area,scale=iw*${UP}:ih*${UP}:flags=neighbor[c];[b][c]psnr" \
        -f null - 2>&1 | grep -oE 'average:[a-z0-9.]+' | tail -1 || true)
  psnr=${out#average:}
  if [[ "$psnr" == "inf" ]]; then
    echo "     ✓ ${label}: bloques de ${UP}x${UP} perfectamente uniformes (PSNR inf)"
  elif [[ -n "$psnr" ]] && node -e "process.exit(+'$psnr' >= 34 ? 0 : 1)" 2>/dev/null; then
    echo "     ✓ ${label}: ${psnr} dB (desvío sólo por la compresión H.264, sin blur de escalado)"
  else
    echo "     ✗ ${label}: PSNR ${psnr:-n/a} — el escalado NO es nearest, hay bordes borrosos"
    [[ "$hard" == "1" ]] && GLOBAL_OK=0
  fi
}

verify() {
  local file="$1" expW="$2" expH="$3" expFps="$4" expFrames="$5" expDur="$6" wantAlpha="${7:-0}"
  [[ -f "$file" ]] || return 0
  local info rw rh rfps rframes rdur size cod pix ok=1
  info=$(ffprobe -v error -select_streams v:0 -count_frames \
        -show_entries stream=width,height,avg_frame_rate,nb_read_frames,codec_name,pix_fmt \
        -show_entries format=duration,size -of json "$file")
  rw=$(node -p "JSON.parse(process.argv[1]).streams[0].width" "$info")
  rh=$(node -p "JSON.parse(process.argv[1]).streams[0].height" "$info")
  rfps=$(node -p "const s=JSON.parse(process.argv[1]).streams[0].avg_frame_rate.split('/');(s[0]/s[1]).toFixed(3)" "$info")
  rframes=$(node -p "JSON.parse(process.argv[1]).streams[0].nb_read_frames" "$info")
  rdur=$(node -p "(+JSON.parse(process.argv[1]).format.duration).toFixed(3)" "$info")
  size=$(node -p "(+JSON.parse(process.argv[1]).format.size/1048576).toFixed(2)" "$info")
  cod=$(node -p "JSON.parse(process.argv[1]).streams[0].codec_name" "$info")
  pix=$(node -p "JSON.parse(process.argv[1]).streams[0].pix_fmt" "$info")

  echo "  $file"
  echo "     codec $cod / $pix"
  chk() { if [[ "$2" == "$3" ]]; then echo "     ✓ $1: $2"; else echo "     ✗ $1: $2 (esperado $3)"; ok=0; fi }
  chk "resolución" "${rw}x${rh}" "${expW}x${expH}"
  chk "fps        " "$(node -p "(+$rfps).toFixed(3)")" "$(node -p "(+$expFps).toFixed(3)")"
  chk "frames     " "$rframes" "$expFrames"
  if node -e "process.exit(Math.abs($rdur-$expDur) <= 1.5/$expFps ? 0 : 1)"; then
    echo "     ✓ duración: ${rdur}s"
  else echo "     ✗ duración: ${rdur}s (esperado ${expDur}s)"; ok=0; fi

  if [[ "$wantAlpha" == "1" ]]; then
    local amode
    amode=$(ffprobe -v error -select_streams v:0 -show_entries stream_tags=alpha_mode -of csv=p=0 "$file")
    if [[ "$amode" == "1" || "$pix" == *"a"* ]]; then echo "     ✓ canal alfa presente (alpha_mode=${amode:-n/a}, $pix)"
    else echo "     ✗ SIN canal alfa"; ok=0; fi
    echo "     · tamaño: ${size} MB (overlay, sin límite)"
  else
    if node -e "process.exit(+$size<=$MAXMB?0:1)"; then echo "     ✓ tamaño: ${size} MB (bajo el límite de ${MAXMB} MB)"
    else echo "     ✗ tamaño: ${size} MB — POR ENCIMA del límite de ${MAXMB} MB"; ok=0; fi
  fi

  # Cadencia de 20 ticks/s: 2 de cada 3 frames SON iguales a propósito.
  # Lo que se verifica es que la cantidad de frames distintos no supere
  # la cantidad de ticks lógicos (si la superara, algo se estaría
  # interpolando entre ticks).
  local uniq ticks
  uniq=$(ffmpeg -hide_banner -nostdin -i "$file" -vf mpdecimate -fps_mode vfr -f null - 2>&1 \
         | grep -oE 'frame= *[0-9]+' | tail -1 | grep -oE '[0-9]+' || echo "$expFrames")
  ticks=$(node -p "Math.round($expDur*$TPS)")
  if node -e "process.exit($uniq <= $ticks + 1 ? 0 : 1)"; then
    echo "     ✓ cadencia: ${uniq} frames distintos ≤ ${ticks} ticks lógicos (movimiento a pasos, sin interpolar)"
  else
    echo "     ✗ cadencia: ${uniq} frames distintos > ${ticks} ticks — hay movimiento interpolado"; ok=0
  fi

  # Un frame decodificado, para ver si el píxel sigue siendo cuadrado
  local mid tmp
  mid=$(node -p "Math.floor($expFrames*0.62)")
  tmp="out/.pixelcheck_$$.png"
  ffmpeg -v error -y $( [[ "$wantAlpha" == "1" ]] && echo "-c:v libvpx-vp9" ) -i "$file" \
     -vf "select=eq(n\,${mid})" -vframes 1 "$tmp" 2>/dev/null || true
  [[ -f "$tmp" ]] && { pixelcheck "$tmp" "píxel cuadrado en el video (frame ${mid})" 0; rm -f "$tmp"; }

  [[ "$ok" == "1" ]] || GLOBAL_OK=0
}

# 1) El upscale en sí, sin compresión de por medio: tiene que dar inf
MIDF=$(node -p "String(Math.floor($FRAMES*0.62)).padStart(6,'0')")
TMPUP="out/.upscale_$$.png"
ffmpeg -v error -y -i "${FRAMEDIR}/frame_${MIDF}.png" -vf "$SCALE" "$TMPUP"
echo "  upscale ${LW}x${LH} -> ${W}x${H} (flags=${SWSF})"
pixelcheck "$TMPUP" "píxel cuadrado tras el upscale" 1
rm -f "$TMPUP"

verify "$MP4" "$W" "$H" "$FPS" "$FRAMES" "$DUR"
[[ -f "$WEBM" ]] && verify "$WEBM" "$W" "$H" "$FPS" "$FRAMES" "$DUR" 1
[[ -f "$MOV"  ]] && verify "$MOV"  "$W" "$H" "$FPS" "$FRAMES" "$DUR" 1

SAFE=$(node -p "const m=JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));m.safeArea?String(m.safeArea.ok):'null'")
if [[ "$SAFE" == "true" ]]; then
  echo "  ✓ zona segura: ningún texto en los márgenes prohibidos"
elif [[ "$SAFE" == "false" ]]; then
  echo "  ✗ zona segura: hay texto fuera — ver $MANIFEST"; GLOBAL_OK=0
fi

echo ""
if [[ "$GLOBAL_OK" == "1" ]]; then echo "✔ Todo OK. Salida: $MP4"; else echo "✗ Revisá los ✗ de arriba."; exit 1; fi
echo ""
