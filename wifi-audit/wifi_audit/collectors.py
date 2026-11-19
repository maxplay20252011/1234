"""Recolección PASIVA de datos WiFi. Solo lee lo que el sistema operativo ya
conoce (lista de redes visibles / red activa). No inyecta paquetes, no
desautentica clientes, no captura handshakes, no prueba contraseñas."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import unicodedata

from .models import AccessPoint


class CollectorError(RuntimeError):
    pass


def _run(cmd: list[str]) -> str:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
    except FileNotFoundError as e:
        raise CollectorError(f"No se encontró el comando: {cmd[0]}") from e
    except subprocess.TimeoutExpired as e:
        raise CollectorError(f"Timeout ejecutando {' '.join(cmd)}") from e
    if r.returncode != 0:
        raise CollectorError(f"{' '.join(cmd)} falló: {r.stderr.strip()}")
    return r.stdout


# ---------------------------------------------------------------- Linux (nmcli)
def split_terse(line: str) -> list[str]:
    """Divide una línea `nmcli -t` respetando '\\:' y '\\\\'."""
    out, cur, i = [], [], 0
    while i < len(line):
        c = line[i]
        if c == "\\" and i + 1 < len(line):
            cur.append(line[i + 1])
            i += 2
        elif c == ":":
            out.append("".join(cur))
            cur = []
            i += 1
        else:
            cur.append(c)
            i += 1
    out.append("".join(cur))
    return out


def parse_nmcli(text: str) -> list[AccessPoint]:
    """Campos: IN-USE,SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY,WPA-FLAGS,RSN-FLAGS"""
    aps = []
    for line in text.splitlines():
        if not line.strip():
            continue
        p = split_terse(line)
        if len(p) < 9:
            continue
        inuse, ssid, bssid, chan, freq, sig, sec, wpaf, rsnf = p[:9]
        ap = AccessPoint(ssid=ssid, bssid=bssid.upper(), connected=inuse.strip() == "*")
        ap.channel = int(chan) if chan.isdigit() else None
        m = re.match(r"(\d+)", freq)
        ap.freq_mhz = int(m.group(1)) if m else None
        ap.signal = int(sig) if sig.isdigit() else None
        wpa, rsn, secu = set(wpaf.split()), set(rsnf.split()), sec.upper()

        if "WEP" in secu:
            ap.akm.add("WEP"); ap.pairwise.add("WEP")
        if "WPA1" in secu or wpa:
            ap.versions.add("WPA1")
            wlow = {w.lower() for w in wpa}
            if "psk" in wlow or not wlow:
                ap.akm.add("PSK")
            if "802.1x" in wlow:
                ap.akm.add("EAP")
        if rsn or "WPA2" in secu or "WPA3" in secu:
            low = {w.lower() for w in rsn}
            if "psk" in low or "802.1x" in low or "WPA2" in secu:
                ap.versions.add("WPA2")
            if "sae" in low or "WPA3" in secu:
                ap.versions.add("WPA3"); ap.akm.add("SAE")
            if "psk" in low:
                ap.akm.add("PSK")
            if "802.1x" in low or "eap-suite-b-192" in low:
                ap.akm.add("EAP")
            if "owe" in low or "owe_transition_mode" in low:
                ap.akm.add("OWE")
            if not low and "WPA2" in secu and "802.1X" not in secu:
                ap.akm.add("PSK")  # nmcli antiguo sin flags
        for flags in (wpa, rsn):
            for f in flags:
                if f.startswith("pair_"):
                    ap.pairwise.add(f[5:].upper().replace("WEP40", "WEP").replace("WEP104", "WEP"))
        if not ap.akm and sec.strip() in ("", "--"):
            ap.akm.add("OPEN")
        aps.append(ap)
    return aps


def collect_nmcli(rescan: bool = False) -> list[AccessPoint]:
    if not shutil.which("nmcli"):
        raise CollectorError("nmcli no está disponible (se requiere NetworkManager).")
    base = ["nmcli", "-t", "-f"]
    fields = "IN-USE,SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY,WPA-FLAGS,RSN-FLAGS"
    tail = ["dev", "wifi", "list", "--rescan", "yes" if rescan else "no"]
    return parse_nmcli(_run(base + [fields] + tail))


# --------------------------------------------------------- Windows (netsh) ES/EN
def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).strip().lower()


_KV = re.compile(r"^\s*([^:]+?)\s+:\s*(.*)$")


def _akm_from_auth(auth: str, ap: AccessPoint) -> None:
    a = _norm(auth)
    if a in ("open", "abierta", "abierto"):
        ap.akm.add("OPEN")
    elif "owe" in a:
        ap.akm.add("OWE")
    elif "wep" in a or "compartida" in a or "shared" in a:
        ap.akm.add("WEP"); ap.versions.discard("WPA1")
    elif "enterprise" in a or "empresa" in a or "802.1x" in a:
        ap.akm.add("EAP")
        ap.versions.add("WPA3" if "wpa3" in a else "WPA2" if "wpa2" in a else "WPA1")
    elif "wpa3" in a or "sae" in a:
        ap.akm.add("SAE"); ap.versions.add("WPA3")
    elif "wpa2" in a:
        ap.akm.add("PSK"); ap.versions.add("WPA2")
    elif "wpa" in a:
        ap.akm.add("PSK"); ap.versions.add("WPA1")


def parse_netsh_networks(text: str) -> list[AccessPoint]:
    """Salida de `netsh wlan show networks mode=bssid` (inglés o español)."""
    aps: list[AccessPoint] = []
    ssid, akm_proto = "", None
    cur: AccessPoint | None = None
    for line in text.splitlines():
        m = _KV.match(line)
        if not m:
            continue
        k, v = _norm(m.group(1)), m.group(2).strip()
        if re.fullmatch(r"(nombre de )?ssid \d+", k):
            ssid, akm_proto, cur = v, AccessPoint(ssid=v), None
        elif akm_proto is not None and k in ("authentication", "autenticacion"):
            _akm_from_auth(v, akm_proto)
        elif akm_proto is not None and k in ("encryption", "cifrado"):
            n = _norm(v)
            akm_proto.pairwise |= {c for c in ("CCMP", "TKIP", "GCMP", "WEP") if c.lower() in n}
        elif re.fullmatch(r"bssid \d+", k):
            cur = AccessPoint(ssid=ssid, bssid=v.upper(), akm=set(akm_proto.akm),
                              pairwise=set(akm_proto.pairwise), versions=set(akm_proto.versions))
            aps.append(cur)
        elif cur and k in ("signal", "senal"):
            cur.signal = int(re.sub(r"\D", "", v) or 0)
        elif cur and k in ("channel", "canal"):
            cur.channel = int(re.sub(r"\D", "", v) or 0) or None
    return aps


def collect_netsh() -> list[AccessPoint]:
    if not shutil.which("netsh"):
        raise CollectorError("netsh no está disponible.")
    aps = parse_netsh_networks(_run(["netsh", "wlan", "show", "networks", "mode=bssid"]))
    cur_bssid = ""
    for line in _run(["netsh", "wlan", "show", "interfaces"]).splitlines():
        m = _KV.match(line)
        if m and _norm(m.group(1)) == "bssid":
            cur_bssid = m.group(2).strip().upper()
    for ap in aps:
        ap.connected = bool(cur_bssid) and ap.bssid == cur_bssid
    return aps


# ------------------------------------------------------------------- JSON
def load_json(path: str) -> list[AccessPoint]:
    """Entrada manual/offline (macOS u otras fuentes). Ver examples/."""
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    items = data["aps"] if isinstance(data, dict) else data
    aps = []
    for d in items:
        aps.append(AccessPoint(
            ssid=d.get("ssid", ""), bssid=d.get("bssid", "").upper(),
            channel=d.get("channel"), freq_mhz=d.get("freq_mhz"), signal=d.get("signal"),
            akm={x.upper() for x in d.get("akm", [])},
            pairwise={x.upper() for x in d.get("pairwise", [])},
            versions={x.upper() for x in d.get("versions", [])},
            pmf=d.get("pmf"), wps=d.get("wps"), connected=bool(d.get("connected", False)),
        ))
    return aps


def collect(platform: str, rescan: bool = False) -> list[AccessPoint]:
    if platform.startswith("linux"):
        return collect_nmcli(rescan)
    if platform.startswith("win"):
        return collect_netsh()
    raise CollectorError(
        "Colección automática solo para Linux (nmcli) y Windows (netsh). "
        "En otros sistemas usa --input con un JSON (ver examples/).")
