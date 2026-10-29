# Fotos con las TRES tarjetas juntas, sin QR legible: python3 pruebas/banco-junto.py CARPETA_HOJAS CARPETA_SALIDA
# - tarjetas impresas con el QR tapado, una al lado de la otra o en abanico
# - tres papelitos escritos a mano (de banco-texto) sobre la mesa
# - listas de tres líneas escritas a mano o en pantalla (las hojas "multi" de banco-texto)
import sys, os, json, random
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw
random.seed(9); np.random.seed(9)
T = os.path.join(os.path.dirname(__file__), "..", "tarjetas", "png")
H_DIR, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
hojas = json.load(open(os.path.join(H_DIR, "hojas.json")))
OPC = {"estilo": ["elegante","casual","urbano","minimal","romantico","glam","deportivo","boho"], "clima": ["calido","templado","frio","lluvia"],
       "evento": ["amigos","fiesta","elegante","clases","cita","airelibre","formal","casual"]}
def foto(piezas, sep, giros, fondo, blur, luz, ruido):
    W, H = 4000, 3000  # apaisada: así se sacan tres cosas juntas
    bg = Image.new("RGB", (W, H), fondo)
    arr = np.array(bg).astype(np.int16) + np.random.randint(-10, 10, (H, W, 1)); bg = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    total = sum(p.width for p in piezas) + sep * (len(piezas) - 1); x = (W - total) // 2
    for p, g in zip(piezas, giros):
        r = p.rotate(g, expand=True, resample=Image.BICUBIC)
        bg.paste(r, (x, (H - r.height) // 2 + random.randint(-150, 150)), r); x += p.width + sep
    if blur: bg = bg.filter(ImageFilter.GaussianBlur(blur))
    bg = ImageEnhance.Brightness(bg).enhance(luz)
    a = np.array(bg).astype(np.int16) + np.random.normal(0, ruido, (H, W, 3)).astype(np.int16)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
casos = []; i = 0
def guardar(img, esperado, tipo):
    global i
    f = f"junto{i:02d}.jpg"; img.save(os.path.join(OUT, f), quality=85)
    casos.append({"archivo": f, "esperado": sorted(esperado), "tipo": tipo, "tam": 0, "giro": 0, "persp": 0, "blur": 0, "luz": 0, "reflejo": 0, "ruido": 0}); i += 1
for n in range(10):  # tarjetas impresas sin QR
    el = {g: random.choice(OPC[g]) for g in OPC}; piezas = []
    for g in ("estilo", "clima", "evento"):
        c = Image.open(os.path.join(T, f"{g}-{el[g]}.png")).convert("RGBA"); w, h = c.size
        ImageDraw.Draw(c).rectangle([int(w * .6), int(h * .72), w - 18, h - 18], fill=(252, 250, 246, 255))  # tapa el QR
        alto = int(3000 * random.choice([0.55, 0.45, 0.38])); c = c.resize((int(w * alto / h), alto), Image.LANCZOS); piezas.append(c)
    img = foto(piezas, random.choice([40, 120, 260]), [random.uniform(-9, 9) for _ in range(3)], random.choice([(126,112,104),(60,58,64),(196,190,178)]),
               random.choice([0, 1.5, 3]), random.choice([1, 0.8, 0.6]), random.choice([0, 6, 12]))
    guardar(img, [f"{g}:{el[g]}" for g in el], "impresas")
solas = [h for h in hojas if len(h["esperado"]) == 1 and h["tipo"] == "mano"]
for n in range(8):  # tres papelitos escritos a mano
    trio = []
    for g in ("estilo", "clima", "evento"):
        cand = [h for h in solas if h["esperado"][0].startswith(g)]
        if cand: trio.append(random.choice(cand))
    if len(trio) < 3: continue
    piezas = []
    for h in trio:
        p = Image.open(os.path.join(H_DIR, "hojas", h["archivo"])).convert("RGBA"); ancho = int(4000 * random.choice([0.3, 0.26]))
        piezas.append(p.resize((ancho, int(p.height * ancho / p.width)), Image.LANCZOS))
    img = foto(piezas, random.choice([40, 120]), [random.uniform(-7, 7) for _ in range(3)], random.choice([(126,112,104),(60,58,64),(150,160,170)]),
               random.choice([0, 1.5]), random.choice([1, 0.8]), random.choice([0, 6]))
    guardar(img, [h["esperado"][0] for h in trio], "papelitos")
for h in [h for h in hojas if len(h["esperado"]) == 3]:  # listas de tres líneas
    p = Image.open(os.path.join(H_DIR, "hojas", h["archivo"])).convert("RGBA"); ancho = int(4000 * random.choice([0.7, 0.55]))
    p = p.resize((ancho, int(p.height * ancho / p.width)), Image.LANCZOS)
    img = foto([p], 0, [random.uniform(-6, 6)], random.choice([(126,112,104),(60,58,64)]), random.choice([0, 1.5]), random.choice([1, 0.8]), random.choice([0, 6]))
    guardar(img, h["esperado"], "lista-" + h["tipo"])
json.dump(casos, open(os.path.join(OUT, "casos.json"), "w"), indent=1)
print(len(casos), "fotos con tres juntas")
