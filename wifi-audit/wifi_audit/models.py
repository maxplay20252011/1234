from __future__ import annotations

from dataclasses import dataclass, field

SEVERITIES = ("critical", "high", "medium", "low", "info")
PENALTY = {"critical": 40, "high": 25, "medium": 12, "low": 5, "info": 0}


@dataclass
class AccessPoint:
    ssid: str
    bssid: str = ""
    channel: int | None = None
    freq_mhz: int | None = None
    signal: int | None = None            # 0-100 %
    akm: set[str] = field(default_factory=set)       # OPEN WEP PSK SAE EAP OWE
    pairwise: set[str] = field(default_factory=set)  # CCMP TKIP WEP GCMP
    versions: set[str] = field(default_factory=set)  # WPA1 WPA2 WPA3
    pmf: str | None = None               # required | capable | disabled | None=desconocido
    wps: bool | None = None              # None=desconocido
    connected: bool = False

    @property
    def band(self) -> str | None:
        f = self.freq_mhz
        if f is None and self.channel is not None:
            return "2.4" if self.channel <= 14 else "5"
        if f is None:
            return None
        return "2.4" if f < 3000 else "5" if f < 5900 else "6"


@dataclass
class Finding:
    id: str
    severity: str
    title: str
    detail: str
    recommendation: str
