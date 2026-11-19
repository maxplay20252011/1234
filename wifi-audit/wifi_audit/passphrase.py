"""Evaluación LOCAL de la fortaleza de la contraseña WiFi. No hay intentos de
conexión ni de descifrado: solo análisis estático de la cadena que tú introduces.
Nunca se escribe en disco, ni en informes, ni en logs."""
from __future__ import annotations

import math
import re

COMMON = {
    "12345678", "123456789", "1234567890", "password", "password1", "passw0rd",
    "qwertyuiop", "qwerty123", "iloveyou", "11111111", "00000000", "87654321",
    "admin123", "wifi1234", "internet", "contrasena", "contraseña", "bienvenido",
    "abcd1234", "letmein1", "welcome1", "12341234", "123123123", "987654321",
}
SEQUENCES = ("0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiopasdfghjklzxcvbnm")


def _has_sequence(p: str, n: int = 5) -> bool:
    low = p.lower()
    for s in SEQUENCES:
        for seq in (s, s[::-1]):
            for i in range(len(seq) - n + 1):
                if seq[i:i + n] in low:
                    return True
    return False


def evaluate(pw: str, ssid: str = "") -> tuple[int, list[str], float]:
    """Devuelve (severidad 0-4 -> índice), motivos, bits estimados.
    Severidad: 0 ok, 1 low, 2 medium, 3 high, 4 critical."""
    reasons: list[str] = []
    sev = 0
    low = pw.lower()
    pool = 0
    pool += 26 if re.search(r"[a-z]", pw) else 0
    pool += 26 if re.search(r"[A-Z]", pw) else 0
    pool += 10 if re.search(r"\d", pw) else 0
    pool += 33 if re.search(r"[^A-Za-z0-9]", pw) else 0
    bits = len(pw) * math.log2(pool) if pool else 0.0

    def bump(level: int, why: str) -> None:
        nonlocal sev
        sev = max(sev, level); reasons.append(why)

    if low in COMMON or (pw.isdigit() and len(pw) < 12):
        bump(4, "está en listas de contraseñas comunes o es solo numérica corta")
    if len(pw) < 8:
        bump(4, "menos de 8 caracteres (mínimo exigido por WPA2/3)")
    elif len(pw) < 12:
        bump(3, f"solo {len(pw)} caracteres: viable por fuerza bruta offline si se captura un handshake")
    elif len(pw) < 16:
        bump(2, f"{len(pw)} caracteres: aceptable, pero 16+ aporta margen")
    if ssid and len(ssid) >= 4 and ssid.lower() in low:
        bump(3, "contiene el nombre de la red (SSID)")
    if _has_sequence(pw):
        bump(3, "contiene secuencias previsibles (12345, abcde, qwert…)")
    if re.fullmatch(r"(.)\1+", pw) or re.fullmatch(r"(.{1,3})\1{2,}", pw):
        bump(3, "patrón repetitivo")
    if re.fullmatch(r"\d+", pw) and len(pw) >= 12:
        bump(2, "solo dígitos: el espacio de búsqueda es mucho menor")
    if re.search(r"(19|20)\d\d", pw):
        bump(1, "contiene un año (patrón frecuente en diccionarios)")
    if sev <= 1 and bits < 60:
        bump(2, f"entropía estimada baja (~{bits:.0f} bits)")
    return sev, reasons, bits
