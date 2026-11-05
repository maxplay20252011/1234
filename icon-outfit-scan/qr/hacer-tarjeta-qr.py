# Arma el QR (SVG) del juego: python3 qr/hacer-tarjeta-qr.py URL > qr/qr.svg
import sys, io, re, segno
q = segno.make(sys.argv[1], error="q")          # nivel Q: aguanta ~25 % de daño (roce, arrugas, reflejo)
b = io.BytesIO(); q.save(b, kind="svg", scale=10, border=0, dark="#1B1426", light=None, xmldecl=False)
svg = b.getvalue().decode(); w = re.search(r'width="(\d+)"', svg).group(1)
print(svg.replace("<svg ", f'<svg viewBox="0 0 {w} {w}" shape-rendering="crispEdges" ', 1))
