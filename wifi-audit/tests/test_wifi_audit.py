import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from wifi_audit import cli, collectors as c, passphrase as pp
from wifi_audit.models import AccessPoint
from wifi_audit.rules import analyze, score

NMCLI = r"""*:MiCasa:AA\:BB\:CC\:00\:00\:01:6:2437 MHz:72:WPA1 WPA2:pair_tkip group_tkip psk:pair_ccmp pair_tkip group_ccmp psk
 :MiCasa:AA\:BB\:CC\:00\:00\:02:36:5180 MHz:60:WPA2 WPA3:: pair_ccmp group_ccmp psk sae
 :Cafe\:Libre:AA\:BB\:CC\:00\:00\:03:1:2412 MHz:55:--::
 :Viejo:AA\:BB\:CC\:00\:00\:04:11:2462 MHz:40:WEP::
 :Corp:AA\:BB\:CC\:00\:00\:05:149:5745 MHz:70:WPA2 802.1X::pair_ccmp group_ccmp 802.1x
"""

NETSH_ES = """
SSID 1 : MiWifi
    Tipo de red            : Infraestructura
    Autenticación          : WPA2-Personal
    Cifrado                : CCMP
    BSSID 1                : aa:bb:cc:dd:ee:ff
         Señal             : 80%
         Canal             : 11
"""


def ap(**kw):
    kw.setdefault("ssid", "X"); kw.setdefault("bssid", "AA:00"); kw.setdefault("channel", 36)
    kw.setdefault("freq_mhz", 5180)
    return AccessPoint(**kw)


def ids(fs): return {f.id for f in fs}


class Parsing(unittest.TestCase):
    def test_split_terse(self):
        self.assertEqual(c.split_terse(r"a\:b:c"), ["a:b", "c"])

    def test_nmcli(self):
        aps = c.parse_nmcli(NMCLI)
        self.assertEqual(len(aps), 5)
        a = aps[0]
        self.assertTrue(a.connected); self.assertEqual(a.bssid, "AA:BB:CC:00:00:01")
        self.assertEqual(a.versions, {"WPA1", "WPA2"}); self.assertIn("TKIP", a.pairwise)
        self.assertEqual(aps[1].akm, {"PSK", "SAE"}); self.assertEqual(aps[1].band, "5")
        self.assertEqual(aps[2].ssid, "Cafe:Libre"); self.assertEqual(aps[2].akm, {"OPEN"})
        self.assertEqual(aps[3].akm, {"WEP"}); self.assertEqual(aps[4].akm, {"EAP"})

    def test_netsh_es(self):
        aps = c.parse_netsh_networks(NETSH_ES)
        self.assertEqual(len(aps), 1)
        self.assertEqual((aps[0].ssid, aps[0].akm, aps[0].channel, aps[0].signal),
                         ("MiWifi", {"PSK"}, 11, 80))


class Rules(unittest.TestCase):
    def test_open_wep_critical(self):
        for akm, fid in (({"OPEN"}, "open"), ({"WEP"}, "wep")):
            t = ap(akm=akm)
            f = [x for x in analyze(t, [t]) if x.id == fid][0]
            self.assertEqual(f.severity, "critical")

    def test_mixed_tkip(self):
        t = ap(akm={"PSK"}, versions={"WPA1", "WPA2"}, pairwise={"CCMP", "TKIP"})
        self.assertTrue({"wpa-mixed", "tkip"} <= ids(analyze(t, [t])))

    def test_wpa3_clean(self):
        t = ap(akm={"SAE"}, versions={"WPA3"}, pairwise={"CCMP"}, ssid="Mio", pmf="required")
        fs = analyze(t, [t])
        self.assertEqual(score(fs)[1], "A")
        self.assertNotIn("wpa2-psk", ids(fs))

    def test_wpa2_only_low(self):
        t = ap(akm={"PSK"}, versions={"WPA2"}, pairwise={"CCMP"})
        self.assertIn("wpa2-psk", ids(analyze(t, [t])))

    def test_wps(self):
        t = ap(akm={"SAE"}, versions={"WPA3"}, wps=True)
        self.assertIn("wps", ids(analyze(t, [t])))

    def test_evil_twin_detection(self):
        t = ap(ssid="Casa", akm={"PSK"}, versions={"WPA2"}, pairwise={"CCMP"})
        twin = ap(ssid="Casa", bssid="DE:AD", akm={"OPEN"})
        self.assertTrue(any(i.startswith("weaker-sibling") for i in ids(analyze(t, [t, twin]))))
        legit2 = ap(ssid="Casa", bssid="AA:02", akm={"PSK"}, versions={"WPA2"}, pairwise={"CCMP"})
        fs = ids(analyze(t, [t, legit2, twin], known_bssids={"AA:00", "AA:02"}))
        self.assertTrue(any(i.startswith("unknown-bssid") for i in fs))
        self.assertFalse(any("AA:02" in i for i in fs))

    def test_default_ssid(self):
        t = ap(ssid="MOVISTAR_A1B2", akm={"SAE"}, versions={"WPA3"})
        self.assertIn("default-ssid", ids(analyze(t, [t])))

    def test_passphrase_downgrades_on_sae(self):
        t = ap(akm={"SAE"}, versions={"WPA3"})
        f = [x for x in analyze(t, [t], passwd="12345678") if x.id == "passphrase"][0]
        self.assertEqual(f.severity, "low")
        t2 = ap(akm={"PSK"}, versions={"WPA2"})
        f2 = [x for x in analyze(t2, [t2], passwd="12345678") if x.id == "passphrase"][0]
        self.assertEqual(f2.severity, "critical")


class Passphrase(unittest.TestCase):
    def test_levels(self):
        self.assertEqual(pp.evaluate("password")[0], 4)
        self.assertGreaterEqual(pp.evaluate("Casa2020")[0], 3)
        self.assertEqual(pp.evaluate("tj9#Vw2$kL8!pQz4xR7", "Casa")[0], 0)
        self.assertGreaterEqual(pp.evaluate("micasa-wifi-123456", "MiCasa")[0], 3)


class Scope(unittest.TestCase):
    def test_requires_connection(self):
        with self.assertRaises(SystemExit):
            cli.pick_target([ap(connected=False)], None, False)

    def test_ssid_requires_confirm(self):
        with self.assertRaises(SystemExit):
            cli.pick_target([ap(ssid="Otra")], "Otra", False)
        self.assertEqual(cli.pick_target([ap(ssid="Otra")], "Otra", True).ssid, "Otra")

    def test_report_never_lists_neighbors(self):
        from wifi_audit.report import build, to_json
        aps = c.load_json(os.path.join(os.path.dirname(__file__), "..", "examples", "home.json"))
        t = cli.pick_target(aps, None, False)
        fs = analyze(t, aps)
        out = to_json(build(t, fs, *score(fs), 1, "info"))
        self.assertNotIn("vecino1", out); self.assertNotIn("11:22:33", out)


if __name__ == "__main__":
    unittest.main()
