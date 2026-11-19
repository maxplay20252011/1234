# wifi-audit

Auditoría **pasiva** de la seguridad de **tu propia** red WiFi. Python 3.9+, sin dependencias.

## Qué hace
- Lee del sistema operativo la red a la que ya estás conectado (y el resto de BSSID visibles).
- Detecta: red abierta, WEP, WPA1/TKIP, modo mixto, WPA2 sin WPA3, modo transición, OWE, WPS (si el dato existe),
  PMF desactivado, SSID oculto / de fábrica, congestión de canal.
- Detecta **APs impostores con tu SSID** (evil twin) si le das tus BSSID legítimos con `--known-bssid`,
  y APs con tu SSID pero seguridad más débil.
- Opcional: evalúa localmente la fortaleza de tu contraseña (`--check-passphrase`, sin eco, nunca se guarda).
- Informe en texto / Markdown / JSON con puntuación, severidad, recomendación y checklist del router.
- Código de salida `1` si hay hallazgos high/critical (útil para cron/CI), `2` en error.

## Límites de alcance (por diseño)
- Por defecto audita **solo la red conectada**. `--ssid` exige `--confirm-own`.
- Sin inyección, desautenticación, captura de handshakes, fuerza bruta ni conexión a redes ajenas.
- Las redes vecinas **solo se cuentan** (para congestión); no se listan ni se evalúan.
- `--confirm-own` es una declaración, no una verificación: la responsabilidad legal es tuya.

## Uso
```bash
python -m wifi_audit                                   # red conectada
python -m wifi_audit --known-bssid AA:BB:CC:00:00:01 --known-bssid AA:BB:CC:00:00:02
python -m wifi_audit --check-passphrase --format md > informe.md
python -m wifi_audit --input examples/home.json        # datos offline / macOS
python -m unittest discover -s tests
```

## Limitaciones conocidas (leer antes de fiarse)
- **Solo probado con fixtures sintéticos.** El parser de `nmcli` (Linux) y de `netsh` (Windows, EN/ES) está
  escrito contra el formato documentado, pero no se ha validado con hardware real. Valídalo en tu equipo.
- **macOS:** sin colector nativo (`airport` fue retirado y `system_profiler` es frágil de parsear). Usa `--input` con JSON.
- Un cliente WiFi **no ve** WPS, PMF ni la configuración interna del router salvo que el SO lo exponga;
  esos puntos salen como "desconocido" y en el checklist manual. WPS solo se marca si lo aportas por JSON.
- La puntuación es una heurística propia, no un estándar. La estimación de entropía de la contraseña también.
- Con nmcli la versión WPA se deduce de flags; routers con configuraciones atípicas pueden mostrarse de forma incompleta.

## Siguientes pasos razonables
Colector `iw scan dump` (con root) para leer WPS/PMF reales de tu AP, colector macOS, baseline histórico
para alertar de cambios (nuevo BSSID, downgrade de cifrado) vía cron.
