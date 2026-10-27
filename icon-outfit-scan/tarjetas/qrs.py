# Genera el SVG del QR de cada tarjeta (contenido "ICON|categoria|opcion"): python3 qrs.py > qrs.json
import json, io, re, segno
OPC = {"estilo": ["elegante","casual","urbano","minimal","romantico","glam","deportivo","boho"],
       "clima": ["calido","templado","frio","lluvia"],
       "evento": ["amigos","fiesta","elegante","clases","cita","airelibre","formal","casual"]}
out = {}
for g, ks in OPC.items():
    for k in ks:
        q = segno.make(f"ICON|{g}|{k}", error="q")
        b = io.BytesIO(); q.save(b, kind="svg", scale=10, border=0, dark="#221A30", light=None, xmldecl=False)
        svg = b.getvalue().decode()
        w = re.search(r'width="(\d+)"', svg).group(1)
        out[f"{g}|{k}"] = svg.replace("<svg ", f'<svg viewBox="0 0 {w} {w}" ', 1)
print(json.dumps(out))
