# Convierte las hojas de banco-texto.cjs en fotos de celular (3000×4000): python3 pruebas/banco-texto.py CARPETA
# Manuscrito: papel sobre una mesa, perspectiva, sombra, poca luz. Digital: pantalla con moiré y reflejo, o impreso.
import sys, os, json, random
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
random.seed(5); np.random.seed(5)
D = sys.argv[1]; casos = json.load(open(os.path.join(D, "hojas.json")))
def perspectiva(img, d):
    w, h = img.size
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    dst = [(random.uniform(0, d) * w, random.uniform(0, d) * h), (w - random.uniform(0, d) * w, random.uniform(0, d) * h),
           (w - random.uniform(0, d) * w, h - random.uniform(0, d) * h), (random.uniform(0, d) * w, h - random.uniform(0, d) * h)]
    A, B = [], []
    for (x, y), (u, v) in zip(dst, src):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]; B += [u, v]
    coef = np.linalg.solve(np.array(A, float), np.array(B, float))
    return img.transform((w, h), Image.PERSPECTIVE, tuple(coef), Image.BICUBIC, fillcolor=(0, 0, 0, 0))
salida = []
for c in casos:
    W, H = 3000, 4000
    hoja = Image.open(os.path.join(D, "hojas", c["archivo"])).convert("RGBA")
    ancho = int(W * random.choice([0.85, 0.7, 0.55, 0.42]))
    hoja = hoja.resize((ancho, int(hoja.height * ancho / hoja.width)), Image.LANCZOS)
    if c["fondo"].startswith("pantalla"):  # moiré de los píxeles del monitor
        a = np.array(hoja).astype(np.int16); yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
        patron = (np.sin(xx * 0.9 + yy * 0.13) * 9).astype(np.int16)[..., None]; a[..., :3] += patron
        hoja = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    hoja = perspectiva(hoja, random.choice([0, 0.05, 0.1, 0.15]))
    hoja = hoja.rotate(random.choice([0, 0, 0, 5, -8, 90, 180]), expand=True, resample=Image.BICUBIC)
    fondo = random.choice([(126, 112, 104), (60, 58, 64), (196, 190, 178), (150, 160, 170)])
    bg = Image.new("RGB", (W, H), fondo)
    bg.paste(hoja, ((W - hoja.width) // 2 + random.randint(-150, 150), (H - hoja.height) // 2 + random.randint(-300, 300)), hoja)
    blur = random.choice([0, 1.5, 3, 4.5]); luz = random.choice([1, 0.85, 0.6, 0.45])
    if blur: bg = bg.filter(ImageFilter.GaussianBlur(blur))
    # sombra suave de la mano o del celular
    if random.random() < 0.5:
        g = Image.new("L", (W, H), 0); ImageDraw.Draw(g).ellipse([random.randint(-800, 1500), random.randint(-800, 2500), random.randint(1500, 3800), random.randint(2500, 4800)], fill=110)
        bg = Image.composite(Image.new("RGB", (W, H), (20, 20, 25)), bg, g.filter(ImageFilter.GaussianBlur(220)))
    if c["fondo"].startswith("pantalla") and random.random() < 0.6:  # reflejo en la pantalla
        g = Image.new("L", (W, H), 0); cx, cy = random.uniform(.3, .7) * W, random.uniform(.3, .7) * H
        ImageDraw.Draw(g).ellipse([cx - 700, cy - 400, cx + 700, cy + 400], fill=150)
        bg = Image.composite(Image.new("RGB", (W, H), (255, 255, 255)), bg, g.filter(ImageFilter.GaussianBlur(150)))
    bg = ImageEnhance.Brightness(bg).enhance(luz)
    a = np.array(bg).astype(np.int16) + np.random.normal(0, random.choice([0, 5, 12]), (H, W, 3)).astype(np.int16)
    bg = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    f = c["archivo"].replace(".png", ".jpg"); bg.save(os.path.join(D, f), quality=random.choice([90, 78]))
    salida.append({"archivo": f, "esperado": c["esperado"], "tipo": c["tipo"], "fondo": c["fondo"], "fuente": c["fuente"], "lineas": c["lineas"],
                   "tam": round(ancho / W, 2), "blur": blur, "luz": luz, "giro": 0, "persp": 0, "reflejo": 0, "ruido": 0})
json.dump(salida, open(os.path.join(D, "casos.json"), "w"), indent=1, ensure_ascii=False)
print(len(salida), "fotos")
