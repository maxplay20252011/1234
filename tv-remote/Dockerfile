# Imagen para Linux, Raspberry Pi o NAS. Ver el aviso en docker-compose.yml:
# en Docker Desktop para Windows o Mac el descubrimiento no va a funcionar.
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Se copian primero los manifiestos para aprovechar la cache de capas: mientras
# las dependencias no cambien, no se reinstalan.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

# ─── Imagen final ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim

# ffmpeg es opcional: sin el, los videos se envian tal cual y la aplicacion
# avisa. Se incluye porque en un servidor fijo el espacio sobra y evita el
# problema mas comun ("el video no arranca").
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/node_modules ./node_modules

EXPOSE 8099
CMD ["node", "server/dist/index.js"]
