# Genera public/og.png, la imagen de la tarjeta que muestran WhatsApp y
# compañía al compartir un enlace de AIB+. Uso: py scripts/imagen-og.py
# (necesita Pillow y las fuentes Georgia y Segoe UI de Windows).
from PIL import Image, ImageDraw, ImageFont, ImageFilter
S = 2
W, H = 1200 * S, 630 * S
MARFIL = (247, 246, 242); TINTA = (14, 26, 43); AZUL = (26, 45, 77); CHAMPAN = (196, 162, 106)
MUTED = (82, 91, 105); LINEA = (228, 225, 216); BLANCO = (255, 255, 255)
F = 'C:/Windows/Fonts/'
def fuente(n, t): return ImageFont.truetype(F + n, t * S)

img = Image.new('RGB', (W, H), MARFIL)
# Brillo champán suave arriba a la izquierda
glow = Image.new('L', (W, H), 0)
gd = ImageDraw.Draw(glow)
gd.ellipse((-300 * S, -380 * S, 700 * S, 380 * S), fill=70)
glow = glow.filter(ImageFilter.GaussianBlur(160 * S))
img = Image.composite(Image.new('RGB', (W, H), (236, 224, 200)), img, glow)
d = ImageDraw.Draw(img)

# Logo y marca
x0, y0 = 80 * S, 78 * S
d.polygon([(x0 + 22 * S, y0), (x0 + 44 * S, y0 + 26 * S), (x0 + 22 * S, y0 + 52 * S), (x0, y0 + 26 * S)], fill=AZUL)
d.polygon([(x0 + 22 * S, y0 + 13 * S), (x0 + 33 * S, y0 + 26 * S), (x0 + 22 * S, y0 + 39 * S), (x0 + 11 * S, y0 + 26 * S)], fill=CHAMPAN)
marca = fuente('georgiab.ttf', 40)
d.text((x0 + 62 * S, y0 + 4 * S), 'AIB', font=marca, fill=TINTA)
ancho_aib = d.textlength('AIB', font=marca)
d.text((x0 + 62 * S + ancho_aib + 2 * S, y0 + 4 * S), '+', font=marca, fill=CHAMPAN)

# Titular
titular = fuente('georgiab.ttf', 62)
y = 205 * S
for linea in ['Mira cómo se vería', 'la web de tu negocio']:
    d.text((80 * S, y), linea, font=titular, fill=TINTA)
    y += 78 * S
d.rectangle((80 * S, y + 22 * S, 160 * S, y + 25 * S), fill=CHAMPAN)
sub = fuente('segoeui.ttf', 28)
d.text((80 * S, y + 50 * S), 'En un minuto, con tu nombre y tus colores.', font=sub, fill=MUTED)

# Celular con una web de ejemplo
px, py, pw, ph = 842 * S, 64 * S, 290 * S, 600 * S
sombra = Image.new('L', (W, H), 0)
ImageDraw.Draw(sombra).rounded_rectangle((px + 6 * S, py + 24 * S, px + pw + 6 * S, py + ph + 24 * S), 46 * S, fill=60)
sombra = sombra.filter(ImageFilter.GaussianBlur(28 * S))
img = Image.composite(Image.new('RGB', (W, H), (205, 200, 188)), img, sombra)
d = ImageDraw.Draw(img)
d.rounded_rectangle((px, py, px + pw, py + ph), 46 * S, fill=TINTA)
ix, iy, iw = px + 12 * S, py + 12 * S, pw - 24 * S
d.rounded_rectangle((ix, iy, ix + iw, py + ph - 12 * S), 36 * S, fill=BLANCO)
# cabecera de la web
d.rounded_rectangle((ix + 18 * S, iy + 34 * S, ix + 30 * S, iy + 46 * S), 3 * S, fill=AZUL)
d.rounded_rectangle((ix + 38 * S, iy + 36 * S, ix + 120 * S, iy + 44 * S), 4 * S, fill=TINTA)
for k in range(3):
    d.rounded_rectangle((ix + iw - 70 * S + k * 18 * S, iy + 38 * S, ix + iw - 58 * S + k * 18 * S, iy + 42 * S), 2 * S, fill=LINEA)
# portada
hy = iy + 66 * S
d.rounded_rectangle((ix + 14 * S, hy, ix + iw - 14 * S, hy + 190 * S), 18 * S, fill=AZUL)
d.rounded_rectangle((ix + 32 * S, hy + 40 * S, ix + 190 * S, hy + 54 * S), 6 * S, fill=BLANCO)
d.rounded_rectangle((ix + 32 * S, hy + 64 * S, ix + 150 * S, hy + 78 * S), 6 * S, fill=BLANCO)
d.rounded_rectangle((ix + 32 * S, hy + 96 * S, ix + 200 * S, hy + 104 * S), 4 * S, fill=(120, 136, 166))
d.rounded_rectangle((ix + 32 * S, hy + 112 * S, ix + 170 * S, hy + 120 * S), 4 * S, fill=(120, 136, 166))
d.rounded_rectangle((ix + 32 * S, hy + 140 * S, ix + 128 * S, hy + 166 * S), 13 * S, fill=CHAMPAN)
# tarjetas de productos
ty = hy + 212 * S
cw = (iw - 14 * S * 2 - 12 * S) // 2
for fila in range(2):
    for col in range(2):
        cx = ix + 14 * S + col * (cw + 12 * S)
        cy = ty + fila * 128 * S
        tono = [(236, 229, 214), (226, 231, 239)][(fila + col) % 2]
        d.rounded_rectangle((cx, cy, cx + cw, cy + 80 * S), 12 * S, fill=tono)
        d.rounded_rectangle((cx, cy + 90 * S, cx + cw - 30 * S, cy + 98 * S), 4 * S, fill=TINTA)
        d.rounded_rectangle((cx, cy + 106 * S, cx + 40 * S, cy + 114 * S), 4 * S, fill=CHAMPAN)

img = img.resize((1200, 630), Image.LANCZOS)
import os
salida = os.path.join(os.path.dirname(__file__), '..', 'public', 'og.png')
img.save(salida, optimize=True)
print(os.path.getsize(salida))
