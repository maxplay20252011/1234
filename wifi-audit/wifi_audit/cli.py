from __future__ import annotations

import argparse
import getpass
import sys

from . import __version__
from .collectors import CollectorError, collect, load_json
from .models import SEVERITIES
from .report import build, to_json, to_text
from .rules import analyze, score

BANNER = ("wifi-audit: herramienta de auditoría PASIVA para tu propia red. "
          "No ataca, no captura tráfico ajeno y no prueba contraseñas.")


def pick_target(aps, ssid, confirm_own):
    """Política de alcance: por defecto SOLO la red a la que ya estás conectado.
    Auditar otra SSID exige declararla explícitamente como propia."""
    if ssid:
        if not confirm_own:
            raise SystemExit("Error: --ssid exige --confirm-own (declaras que la red es tuya "
                             "y tienes autorización para auditarla).")
        cands = [a for a in aps if a.ssid == ssid]
        if not cands:
            raise SystemExit(f"No se ve la red '{ssid}' en el escaneo.")
        return max(cands, key=lambda a: (a.connected, a.signal or 0))
    cur = [a for a in aps if a.connected]
    if not cur:
        raise SystemExit("No estás conectado a ninguna red WiFi. Conéctate a la tuya primero "
                         "(o usa --ssid NOMBRE --confirm-own para una red tuya cercana).")
    return cur[0]


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="wifi-audit", description=BANNER)
    p.add_argument("--input", help="JSON con datos de APs (en vez de escanear)")
    p.add_argument("--ssid", help="Auditar esta SSID en lugar de la conectada (requiere --confirm-own)")
    p.add_argument("--confirm-own", action="store_true", help="Declaro que la red es mía / estoy autorizado")
    p.add_argument("--known-bssid", action="append", default=[], metavar="MAC",
                   help="BSSID legítimo de tus equipos (repetible); activa detección de APs impostores")
    p.add_argument("--check-passphrase", action="store_true",
                   help="Evalúa localmente la fortaleza de tu contraseña (se pide sin eco; no se guarda)")
    p.add_argument("--rescan", action="store_true", help="Pedir un escaneo nuevo (por defecto usa la caché del SO)")
    p.add_argument("--format", choices=("text", "md", "json"), default="text")
    p.add_argument("--min-severity", choices=SEVERITIES, default="info")
    p.add_argument("--version", action="version", version=__version__)
    a = p.parse_args(argv)

    try:
        aps = load_json(a.input) if a.input else collect(sys.platform, a.rescan)
        target = pick_target(aps, a.ssid, a.confirm_own)
    except CollectorError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 2
    except (OSError, ValueError, KeyError) as e:
        print(f"Error leyendo la entrada: {e}", file=sys.stderr)
        return 2

    pw = getpass.getpass("Contraseña WiFi (no se muestra ni se guarda): ") if a.check_passphrase else None
    findings = analyze(target, aps, {b.upper() for b in a.known_bssid}, pw)
    sc, grade = score(findings)
    neighbors = len({x.bssid for x in aps if x.ssid != target.ssid})
    rep = build(target, findings, sc, grade, neighbors, "info" if a.min_severity == "info" else a.min_severity)
    print(to_json(rep) if a.format == "json" else to_text(rep, md=a.format == "md"))
    return 1 if any(f.severity in ("critical", "high") for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
