#!/usr/bin/env bash
# =========================================================================
# Bank Tycoon — Intro MAXWER
# Ensamblado con FFmpeg: frames PNG -> MP4 (H.264) + audio, versión alfa
# y verificación con ffprobe.
#
#   bash scripts/build.sh                 # usa el último render
#   bash scripts/build.sh vertical_4s     # un tag concreto
#   bash scripts/build.sh --prores        # además exporta ProRes 4444
# =========================================================================
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WANT_PRORES=0
TAG=""
for a in "$@"; do
  case "$a" in
    --prores) WANT_PRORES=1 ;;
    --*) ;;
    *) TAG="$a" ;;
  esac
done

# ---------------------------------------------------------------- checks
command -v ffmpeg  >/dev/null || { echo "✗ Falta ffmpeg.  Instalalo y volvé a correr."; exit 1; }
command -v ffprobe >/dev/null || { echo "✗ Falta ffprobe (viene con ffmpeg)."; exit 1; }
command -v node    >/dev/null || { echo "✗ Falta node 20+."; exit 1; }

MANIFEST="out/last-render.json"
if [[ -n "$TAG" ]]; then MANIFEST="out/frames/$TAG/manifest.json"; fi
[[ -f "$MANIFEST" ]] || { echo "✗ No encuentro $MANIFEST — corré primero: node scripts/render.mjs --format=vertical"; exit 1; }

j() { node -p "JSON.parse(require('fs').readFileSync('$1','utf8'))$2"; }

TAG=$(j "$MANIFEST" ".tag")
FPS=$(j "$MANIFEST" ".fps")
W=$(j "$MANIFEST" ".width")
H=$(j "$MANIFEST" ".height")
DUR=$(j "$MANIFEST" ".duration")
FRAMES=$(j "$MANIFEST" ".frames")
FRAMEDIR=$(j "$MANIFEST" ".dir || ''")
ALPHADIR=$(j "$MANIFEST" ".alpha || ''")

CRF=$(j config.json ".encode.crf")
PRESET=$(j config.json ".encode.preset")
PIXFMT=$(j config.json ".encode.pixFmt")
MAXMB=$(j config.json ".encode.maxSizeMB")
ACRF=$(j config.json ".encode.alpha.crf")
LUFS=$(j config.json ".audio.targetLufs")
TP=$(j config.json ".audio.truePeak")
LRA=$(j config.json ".audio.loudnessRange")
AR=$(j config.json ".audio.sampleRate")
ABR=$(j config.json ".audio.bitrate")
ACH=$(j config.json ".audio.channels")
AUDIO_ON=$(j config.json ".audio.enabled")

[[ -n "$FRAMEDIR" && -d "$FRAMEDIR" ]] || { echo "✗ No hay frames en '$FRAMEDIR'."; exit 1; }

BASE="out/bank-tycoon-intro_${TAG}"
MP4="${BASE}.mp4"
WEBM="${BASE}_alpha.webm"
MOV="${BASE}_alpha.mov"
CL=$([[ "$ACH" == "1" ]] && echo mono || echo stereo)

echo ""
echo "▶ Build  $TAG   ${W}x${H} @ ${FPS}fps   ${DUR}s   ${FRAMES} frames"

# ------------------------------------------------------- pista de audio
# Los SFX son opcionales: si assets/sfx está vacío se genera silencio
# (así el build funciona de cero) y se saltea el loudnorm.
AUDIO_ARGS=(); AUDIO_MAP=(); FILTER=""
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
    n=$((n+1))
    AUDIO_ARGS+=(-i "$f")
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
echo "· MP4 H.264…"
ffmpeg -y -hide_banner -loglevel error -stats \
  -framerate "$FPS" -start_number 0 -i "${FRAMEDIR}/frame_%06d.png" \
  "${AUDIO_ARGS[@]}" \
  -filter_complex "$FILTER" \
  -map 0:v -map "[aout]" \
  -c:v libx264 -preset "$PRESET" -crf "$CRF" -pix_fmt "$PIXFMT" \
  -profile:v high -level 4.2 -x264-params "keyint=${FPS}:min-keyint=1:scenecut=0" \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a "$ABR" -ar "$AR" -ac "$ACH" \
  -fps_mode passthrough -t "$DUR" \
  -movflags +faststart \
  "$MP4"

# ------------------------------------------------- versión con canal alfa
if [[ -n "$ALPHADIR" && -d "$ALPHADIR" ]]; then
  echo "· WebM VP9 con alfa…"
  ffmpeg -y -hide_banner -loglevel error -stats \
    -framerate "$FPS" -start_number 0 -i "${ALPHADIR}/frame_%06d.png" \
    -c:v libvpx-vp9 -pix_fmt yuva420p -crf "$ACRF" -b:v 0 -row-mt 1 \
    -auto-alt-ref 0 -deadline good -cpu-used 2 \
    -fps_mode passthrough -an "$WEBM"
  if [[ "$WANT_PRORES" == "1" ]]; then
    echo "· ProRes 4444 con alfa…"
    ffmpeg -y -hide_banner -loglevel error -stats \
      -framerate "$FPS" -start_number 0 -i "${ALPHADIR}/frame_%06d.png" \
      -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -alpha_bits 8 -vendor apl0 \
      -fps_mode passthrough -an "$MOV"
  fi
else
  echo "  (sin frames alfa: corré  node scripts/render.mjs --format=${TAG%%_*} --with-alpha)"
fi

# ------------------------------------------------------------ verificación
echo ""
echo "▶ Verificación (ffprobe)"
verify() {
  local file="$1" expW="$2" expH="$3" expFps="$4" expFrames="$5" expDur="$6" wantAlpha="${7:-0}"
  [[ -f "$file" ]] || return 0
  local info rw rh rfps rframes rdur size ok=1
  info=$(ffprobe -v error -select_streams v:0 -count_frames \
        -show_entries stream=width,height,avg_frame_rate,nb_read_frames,codec_name,pix_fmt \
        -show_entries format=duration,size -of json "$file")
  rw=$(node -p "JSON.parse(process.argv[1]).streams[0].width" "$info")
  rh=$(node -p "JSON.parse(process.argv[1]).streams[0].height" "$info")
  rfps=$(node -p "const s=JSON.parse(process.argv[1]).streams[0].avg_frame_rate.split('/');(s[0]/s[1]).toFixed(3)" "$info")
  rframes=$(node -p "JSON.parse(process.argv[1]).streams[0].nb_read_frames" "$info")
  rdur=$(node -p "(+JSON.parse(process.argv[1]).format.duration).toFixed(3)" "$info")
  size=$(node -p "(+JSON.parse(process.argv[1]).format.size/1048576).toFixed(2)" "$info")
  local cod pix
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
    # VP9/ProRes con alfa: el límite de tamaño es para el MP4 de entrega, no para el overlay
    local amode
    amode=$(ffprobe -v error -select_streams v:0 -show_entries stream_tags=alpha_mode -of csv=p=0 "$file")
    if [[ "$amode" == "1" || "$pix" == *"a"* ]]; then echo "     ✓ canal alfa presente (alpha_mode=${amode:-n/a}, $pix)"
    else echo "     ✗ SIN canal alfa"; ok=0; fi
    echo "     · tamaño: ${size} MB (overlay, sin límite)"
  else
    if node -e "process.exit(+$size<=$MAXMB?0:1)"; then echo "     ✓ tamaño: ${size} MB (bajo el límite de ${MAXMB} MB)"
    else echo "     ✗ tamaño: ${size} MB — POR ENCIMA del límite de ${MAXMB} MB"; ok=0; fi
  fi

  # Frames duplicados / perdidos: mpdecimate cuenta los frames NO idénticos.
  # El 1:1 con los PNG ya lo garantiza -fps_mode passthrough; esto es el control cruzado.
  local uniq dups
  uniq=$(ffmpeg -hide_banner -nostdin -i "$file" -vf mpdecimate -fps_mode vfr -f null - 2>&1          | grep -oE 'frame= *[0-9]+' | tail -1 | grep -oE '[0-9]+' || echo "$expFrames")
  dups=$(( expFrames - uniq ))
  echo "     · frames únicos ${uniq}/${expFrames} — ${dups} idénticos consecutivos (la cola del flash es plana: esperado)"
  [[ "$ok" == "1" ]] || GLOBAL_OK=0
}

GLOBAL_OK=1
verify "$MP4" "$W" "$H" "$FPS" "$FRAMES" "$DUR"
[[ -f "$WEBM" ]] && verify "$WEBM" "$W" "$H" "$FPS" "$FRAMES" "$DUR" 1
[[ -f "$MOV"  ]] && verify "$MOV"  "$W" "$H" "$FPS" "$FRAMES" "$DUR" 1

# Zona segura (la calculó render.mjs)
SAFE=$(node -p "const m=JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));m.safeArea?String(m.safeArea.ok):'null'")
if [[ "$SAFE" == "true" ]]; then
  echo "  ✓ zona segura: ningún texto en los márgenes prohibidos"
elif [[ "$SAFE" == "false" ]]; then
  echo "  ✗ zona segura: hay texto fuera — ver $MANIFEST"; GLOBAL_OK=0
fi

echo ""
if [[ "$GLOBAL_OK" == "1" ]]; then echo "✔ Todo OK. Salida: $MP4"; else echo "✗ Revisá los ✗ de arriba."; exit 1; fi
echo ""
