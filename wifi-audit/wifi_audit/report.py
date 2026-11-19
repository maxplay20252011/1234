from __future__ import annotations

import json
from dataclasses import asdict

from .models import SEVERITIES, AccessPoint, Finding
from .rules import ROUTER_CHECKLIST

ICON = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🔵", "info": "⚪"}


def _desc(ap: AccessPoint) -> dict:
    return {
        "ssid": ap.ssid or "(oculto)", "bssid": ap.bssid, "band_ghz": ap.band, "channel": ap.channel,
        "signal_pct": ap.signal, "versions": sorted(ap.versions), "akm": sorted(ap.akm),
        "pairwise": sorted(ap.pairwise), "pmf": ap.pmf or "desconocido",
        "wps": "desconocido" if ap.wps is None else ap.wps,
    }


def build(target: AccessPoint, findings: list[Finding], sc: int, grade: str,
          neighbors_seen: int, min_sev: str) -> dict:
    keep = SEVERITIES[: SEVERITIES.index(min_sev) + 1]
    fs = sorted((f for f in findings if f.severity in keep), key=lambda f: SEVERITIES.index(f.severity))
    return {"target": _desc(target), "score": sc, "grade": grade,
            "other_networks_in_range": neighbors_seen,   # solo recuento: no se listan ni evalúan
            "findings": [asdict(f) for f in fs],
            "manual_checklist": ROUTER_CHECKLIST}


def to_json(rep: dict) -> str:
    return json.dumps(rep, ensure_ascii=False, indent=2)


def to_text(rep: dict, md: bool = False) -> str:
    t = rep["target"]
    h = (lambda s: f"## {s}") if md else (lambda s: f"\n=== {s} ===")
    L = ["# Auditoría WiFi" if md else "AUDITORÍA WIFI (pasiva, solo tu red)", ""]
    L.append(f"Red: {t['ssid']}  BSSID: {t['bssid']}  Banda: {t['band_ghz']} GHz  Canal: {t['channel']}")
    L.append(f"Seguridad detectada: {'/'.join(t['versions']) or '-'} | AKM {','.join(t['akm']) or '-'} | "
             f"cifrado {','.join(t['pairwise']) or '-'} | PMF {t['pmf']} | WPS {t['wps']}")
    L.append(f"Puntuación: {rep['score']}/100  Nota: {rep['grade']}  "
             f"(heurística orientativa, no certificación)")
    L.append(h("Hallazgos"))
    if not rep["findings"]:
        L.append("Sin hallazgos en el nivel de severidad solicitado.")
    for f in rep["findings"]:
        L.append(f"\n{ICON[f['severity']]} [{f['severity'].upper()}] {f['title']}")
        L.append(f"   Qué pasa:  {f['detail']}")
        L.append(f"   Qué hacer: {f['recommendation']}")
    L.append(h("Revisión manual en el router (no verificable desde un cliente WiFi)"))
    L += [f"- [ ] {c}" for c in rep["manual_checklist"]]
    L.append(f"\nOtras redes en rango: {rep['other_networks_in_range']} (solo recuento; no se analizan).")
    return "\n".join(L)
