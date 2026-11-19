from __future__ import annotations

import re

from .models import PENALTY, AccessPoint, Finding
from . import passphrase as pp

_SEV = ["info", "low", "medium", "high", "critical"]

DEFAULT_SSID = re.compile(
    r"^(tp-?link|netgear|linksys|dlink|d-link|asus|huawei|zyxel|movistar|vodafone|orange|"
    r"jazztel|livebox|mi?fibra|digi|wlan|wifi|belkin|xiaomi|fritz!?box|telekom|ono|"
    r"yoigo|masmovil|pepephone|sky|bt-?hub|virgin|xfinity|att|home)[-_ ]?[0-9a-f]{2,}",
    re.I)


def _overlap(a: AccessPoint, b: AccessPoint) -> bool:
    if a.channel is None or b.channel is None or a.band != b.band:
        return False
    return abs(a.channel - b.channel) < 5 if a.band == "2.4" else a.channel == b.channel


def security_rank(ap: AccessPoint) -> int:
    if "OPEN" in ap.akm: return 0
    if "WEP" in ap.akm: return 1
    if ap.versions == {"WPA1"} or ap.pairwise == {"TKIP"}: return 2
    if "TKIP" in ap.pairwise or "WPA1" in ap.versions: return 3
    if "SAE" in ap.akm and "PSK" not in ap.akm: return 6
    if "EAP" in ap.akm: return 6
    if "SAE" in ap.akm: return 5
    return 4


def analyze(target: AccessPoint, all_aps: list[AccessPoint], known_bssids: set[str] | None = None,
            passwd: str | None = None) -> list[Finding]:
    F: list[Finding] = []
    add = lambda *a: F.append(Finding(*a))
    known = {b.upper() for b in (known_bssids or set())}

    # ---------------------------------------------------------- cifrado / autenticación
    if "OPEN" in target.akm:
        add("open", "critical", "Red abierta (sin cifrado)",
            "Todo el tráfico viaja en claro y cualquiera en rango puede leerlo y unirse.",
            "Configura WPA3-Personal (o WPA2/WPA3 mixto si hay equipos antiguos) con una contraseña larga.")
    if "WEP" in target.akm:
        add("wep", "critical", "Cifrado WEP",
            "WEP está roto desde 2001; la clave se recupera en minutos con tráfico pasivo.",
            "Sustituye por WPA2-AES como mínimo, idealmente WPA3. Si un dispositivo solo soporta WEP, reemplázalo.")
    if "WPA1" in target.versions and not (target.versions & {"WPA2", "WPA3"}):
        add("wpa1", "high", "Solo WPA (v1)",
            "WPA1 depende de TKIP, obsoleto y con ataques prácticos.",
            "Activa WPA2-AES (CCMP) o WPA3.")
    elif "WPA1" in target.versions:
        add("wpa-mixed", "medium", "Modo mixto WPA/WPA2",
            "El router acepta WPA1, por lo que un atacante puede forzar a un cliente al protocolo débil.",
            "Desactiva WPA1/'WPA+WPA2' y deja solo WPA2-AES o WPA2/WPA3.")
    if "TKIP" in target.pairwise:
        only = target.pairwise <= {"TKIP"}
        add("tkip", "high" if only else "medium",
            "TKIP " + ("como único cifrado" if only else "habilitado junto a AES"),
            "TKIP está deprecado (WiFi Alliance) y limita el rendimiento a 802.11g.",
            "Selecciona cifrado 'AES/CCMP' únicamente.")
    psk_only = "PSK" in target.akm and "SAE" not in target.akm
    if psk_only and "WPA2" in target.versions and "OPEN" not in target.akm and not (target.pairwise & {"TKIP"}):
        add("wpa2-psk", "low", "WPA2-Personal (sin WPA3)",
            "Seguro si la contraseña es fuerte, pero un handshake capturado permite ataque de diccionario offline.",
            "Si tu router y tus dispositivos lo soportan, activa WPA3-Personal (SAE) o al menos el modo mixto WPA2/WPA3.")
    if "PSK" in target.akm and "SAE" in target.akm:
        add("transition", "low", "Modo de transición WPA2/WPA3",
            "Los clientes WPA2 siguen expuestos al ataque offline y existen ataques de downgrade hacia WPA2.",
            "Cuando todos tus dispositivos soporten WPA3, pasa a WPA3-Personal exclusivo.")
    if "SAE" in target.akm and "PSK" not in target.akm:
        add("wpa3", "info", "WPA3-Personal (SAE) ✔",
            "Autenticación resistente a diccionario offline y con PMF obligatorio.", "Sin acción.")
    if "EAP" in target.akm:
        add("eap", "info", "WPA-Enterprise (802.1X)",
            "Seguridad adecuada si los clientes validan el certificado del servidor RADIUS "
            "(no verificable desde aquí).",
            "Verifica que los clientes tienen fijado el CA/servidor y que el método EAP es EAP-TLS o PEAP con validación.")
    if "OWE" in target.akm and "OPEN" not in target.akm:
        add("owe", "medium", "Enhanced Open (OWE)",
            "Cifra el tráfico pero NO autentica la red: no protege frente a un punto de acceso falso.",
            "Para una red privada usa WPA3-Personal con contraseña.")

    # ---------------------------------------------------------- PMF / WPS
    if target.pmf == "disabled":
        add("pmf-off", "medium", "PMF (802.11w) desactivado",
            "Sin Protected Management Frames, la desautenticación forzada es trivial.",
            "Activa PMF 'opcional' o 'requerido' en el router.")
    elif target.pmf is None and psk_only:
        add("pmf-unknown", "info", "PMF (802.11w): no determinable desde el cliente",
            "El sistema no expone si el router anuncia PMF.",
            "Compruébalo en el panel del router y actívalo en modo opcional/requerido.")
    if target.wps:
        add("wps", "high", "WPS activo",
            "El PIN de WPS es vulnerable a fuerza bruta (Pixie Dust / PIN de 8 dígitos) en muchos routers.",
            "Desactiva WPS por completo en el router.")

    # ---------------------------------------------------------- nombre / visibilidad
    if not target.ssid:
        add("hidden", "low", "SSID oculto",
            "Ocultar el SSID no aporta seguridad (se ve en cualquier tráfico de asociación) y puede "
            "hacer que tus dispositivos lo anuncien en cualquier lugar.",
            "Muéstralo y confía en un cifrado fuerte.")
    elif DEFAULT_SSID.match(target.ssid):
        add("default-ssid", "low", "SSID con patrón de fábrica/operador",
            "Revela marca u operador y suele indicar que la contraseña de fábrica sigue vigente "
            "(en varios modelos se deriva del BSSID).",
            "Cambia el SSID y la contraseña por valores propios.")

    # ---------------------------------------------------------- contraseña (opcional, local)
    if passwd is not None:
        sev, reasons, bits = pp.evaluate(passwd, target.ssid)
        if sev:
            exposed = "PSK" in target.akm
            level = _SEV[sev] if exposed else _SEV[min(sev, 1)]
            add("passphrase", level, "Contraseña WiFi débil",
                "; ".join(reasons) + (" (red WPA3-SAE: el riesgo offline es menor)" if not exposed else "") + ".",
                "Usa 16+ caracteres aleatorios o una frase de 5-6 palabras sin relación entre sí, única para esta red.")
        else:
            add("passphrase", "info", "Contraseña WiFi: sin debilidades evidentes",
                f"Longitud {len(passwd)}, entropía estimada ~{bits:.0f} bits (es una estimación, no una garantía).",
                "Sin acción.")

    # ---------------------------------------------------------- consistencia / AP falsos
    siblings = [a for a in all_aps if a.ssid == target.ssid and a.bssid != target.bssid and target.ssid]
    for s in siblings:
        if known and s.bssid not in known:
            add(f"unknown-bssid-{s.bssid}", "high", f"Punto de acceso no autorizado con tu SSID ({s.bssid})",
                "Tu SSID se anuncia desde un BSSID que no está en tu lista de equipos propios: "
                "posible 'evil twin' o router/extensor ajeno.",
                "Compara con tus equipos; si no es tuyo, cambia la contraseña y busca el origen.")
        elif security_rank(s) < security_rank(target):
            add(f"weaker-sibling-{s.bssid}", "high",
                f"Mismo SSID con seguridad MÁS DÉBIL en otro BSSID ({s.bssid})",
                "Los clientes pueden asociarse al AP más débil: mala configuración (banda/mesh) "
                "o AP falso que imita tu red.",
                "Unifica el cifrado en todos tus APs/bandas; verifica que ese BSSID es tuyo.")
    if siblings and not known:
        add("mesh-info", "info", f"{len(siblings)} BSSID adicional(es) con el mismo SSID",
            "Normal en routers dual-band, mesh o repetidores.",
            "Registra tus BSSID legítimos con --known-bssid para detectar APs impostores.")

    # ---------------------------------------------------------- RF
    neighbors = [a for a in all_aps if a.ssid != target.ssid and _overlap(target, a)]
    if len(neighbors) >= 4:
        add("congestion", "low", f"Canal congestionado ({len(neighbors)} redes ajenas solapadas)",
            "Más interferencia = más retransmisiones y peor disponibilidad.",
            "Cambia el canal (2.4 GHz: 1, 6 u 11) o muévete a 5/6 GHz.")
    if target.band == "2.4" and not any(a.ssid == target.ssid and a.band in ("5", "6") for a in all_aps):
        add("band", "info", "Solo se ve la banda de 2.4 GHz",
            "Banda más saturada y con peor aislamiento.", "Activa 5 GHz si tu router la soporta.")
    if target.signal is not None and target.signal < 40:
        add("signal", "info", f"Señal débil ({target.signal} %)",
            "Los resultados de un escaneo con señal baja pueden ser incompletos.",
            "Repite la auditoría más cerca del router.")
    return F


def score(findings: list[Finding]) -> tuple[int, str]:
    s = max(0, 100 - sum(PENALTY[f.severity] for f in findings))
    grade = "A" if s >= 90 else "B" if s >= 75 else "C" if s >= 60 else "D" if s >= 40 else "F"
    return s, grade


ROUTER_CHECKLIST = [
    "Contraseña de administración del router distinta de la de fábrica.",
    "Firmware actualizado (activa actualizaciones automáticas si existen).",
    "WPS desactivado (si no lo confirmaste arriba).",
    "Administración remota/WAN desactivada; panel solo desde la LAN (y por HTTPS).",
    "UPnP desactivado salvo necesidad real; revisa el reenvío de puertos activo.",
    "Red de invitados aislada para visitas y dispositivos IoT.",
    "DNS del router y DHCP: comprueba que no apuntan a servidores desconocidos.",
    "Lista de dispositivos conectados revisada; todos reconocidos.",
    "Desactiva 802.11b/protocolos legacy si no los necesitas.",
]
