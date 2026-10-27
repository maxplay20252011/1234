# Genera fotos difíciles de tarjetas para medir el escáner: python3 pruebas/banco.py CARPETA_SALIDA
# Simula fotos de celular (3000×4000): distancia, giro, perspectiva, desenfoque, poca luz, reflejo, ruido, JPEG.
import sys, os, random, json
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw
import numpy as np
random.seed(7)
T = os.path.join(os.path.dirname(__file__), "..", "tarjetas", "png")
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
cartas = sorted(f for f in os.listdir(T) if f.endswith(".png"))
def perspectiva(img, fuerza):
    w, h = img.size; d = fuerza
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    dst = [(random.uniform(0, d) * w, random.uniform(0, d) * h), (w - random.uniform(0, d) * w, random.uniform(0, d) * h),
           (w - random.uniform(0, d) * w, h - random.uniform(0, d) * h), (random.uniform(0, d) * w, h - random.uniform(0, d) * h)]
    A = []; B = []
    for (x, y), (u, v) in zip(dst, src):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]; B += [u, v]
    coef = np.linalg.solve(np.array(A, float), np.array(B, float))
    return img.transform((w, h), Image.PERSPECTIVE, tuple(coef), Image.BICUBIC, fillcolor=(0, 0, 0, 0))
def foto(nombres, tam, giro, persp, blur, luz, reflejo, ruido, fondo):
    W, H = 3000, 4000
    bg = Image.new("RGB", (W, H), fondo)
    # textura de mesa
    arr = np.array(bg).astype(np.int16) + np.random.randint(-12, 12, (H, W, 1)); bg = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    n = len(nombres); x0 = W * 0.08
    for i, nom in enumerate(nombres):
        c = Image.open(os.path.join(T, nom)).convert("RGBA")
        alto = int(H * tam); c = c.resize((int(c.width * alto / c.height), alto), Image.LANCZOS)
        if persp: c = perspectiva(c.convert("RGBA"), persp)
        c = c.rotate(giro + random.uniform(-4, 4), expand=True, resample=Image.BICUBIC)
        if n == 1: pos = (int((W - c.width) / 2 + random.uniform(-.1, .1) * W), int((H - c.height) / 2 + random.uniform(-.08, .08) * H))
        else: pos = (int(x0), int(H * 0.3 + random.uniform(-.05, .05) * H)); x0 += c.width * 0.98
        bg.paste(c, pos, c)
    if blur: bg = bg.filter(ImageFilter.GaussianBlur(blur))
    bg = ImageEnhance.Brightness(bg).enhance(luz)
    if reflejo:
        g = Image.new("L", (W, H), 0); dr = ImageDraw.Draw(g); cx, cy = random.uniform(.3, .7) * W, random.uniform(.3, .7) * H
        for r in range(900, 0, -30): dr.ellipse([cx - r, cy - r * .6, cx + r, cy + r * .6], fill=int(255 * (1 - r / 900) * reflejo))
        bg = Image.composite(Image.new("RGB", (W, H), (255, 255, 250)), bg, g.filter(ImageFilter.GaussianBlur(60)))
    if ruido:
        arr = np.array(bg).astype(np.int16) + np.random.normal(0, ruido, (H, W, 3)).astype(np.int16); bg = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    return bg
casos = []
for i in range(60):
    nombres = random.sample(cartas, 1) if i < 48 else [random.choice([c for c in cartas if c.startswith(g)]) for g in ("estilo", "clima", "evento")]
    p = dict(tam=random.choice([0.55, 0.4, 0.3, 0.22, 0.16]) if len(nombres) == 1 else random.choice([0.3, 0.24, 0.2]),
             giro=random.choice([0, 0, 15, -30, 90, 180]), persp=random.choice([0, 0.06, 0.12, 0.18]),
             blur=random.choice([0, 1.5, 3, 5]), luz=random.choice([1, 0.8, 0.55, 0.4]), reflejo=random.choice([0, 0, 0.5, 0.8]),
             ruido=random.choice([0, 6, 14]), fondo=random.choice([(126, 112, 104), (40, 38, 44), (200, 196, 188), (90, 120, 150)]))
    if len(nombres) > 1: p["giro"] = random.choice([0, 0, 8, -8])
    img = foto(nombres, **p)
    f = f"caso{i:02d}.jpg"; img.save(os.path.join(OUT, f), quality=random.choice([92, 80, 65]))
    casos.append({"archivo": f, "esperado": sorted(n.split("-")[0] + ":" + n.split("-")[1].replace(".png", "") for n in nombres), **p})
json.dump(casos, open(os.path.join(OUT, "casos.json"), "w"), indent=1)
print(len(casos), "fotos en", OUT)
