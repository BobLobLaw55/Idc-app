"""Photo review: contact sheets of each food's current photo + alternative candidates.

Runs in CI (needs open internet + Pillow). Output (in ./photo-review/):
  sheet-NN.png      rows of: food name | CURRENT photo | candidates 1..5
  candidates.json   {food_id: {"name":..., "current":..., "candidates":[photo ids]}}
Candidates come from Unsplash search, excluding Unsplash+ (premium) photos, so every
candidate is under the free Unsplash License.
"""
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'photo-review')
os.makedirs(OUT, exist_ok=True)

src = open(os.path.join(ROOT, 'js/data/foods.js'), encoding='utf-8').read()
FOODS = re.findall(r"\['(\w+)', '([^']+)', '[^']*', '[^']*', \d, '[^']*', '([\w-]+)'\]", src)
assert len(FOODS) > 50, f'parsed only {len(FOODS)} foods'

UA = {'User-Agent': 'idc-photo-review/1.0 (GitHub Actions)'}
THUMB = 220
CANDS = 5


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                print('FAIL', url, e, file=sys.stderr)
                return None
            time.sleep(2 * (i + 1))


def thumb(photo_id):
    data = get(f'https://images.unsplash.com/photo-{photo_id}?auto=format&fit=crop&w={THUMB}&h={THUMB}&q=60')
    if not data:
        return None
    try:
        return Image.open(io.BytesIO(data)).convert('RGB').resize((THUMB, THUMB))
    except Exception:  # noqa: BLE001
        return None


def search(query):
    q = urllib.parse.quote(query + ' food')
    data = get(f'https://unsplash.com/napi/search/photos?query={q}&per_page=20')
    if not data:
        return []
    out = []
    for r in json.loads(data).get('results', []):
        if r.get('premium') or r.get('plus'):
            continue
        raw = (r.get('urls') or {}).get('raw', '')
        m = re.match(r'https://images\.unsplash\.com/photo-([\w-]+)', raw)
        if m:
            out.append(m.group(1))
        if len(out) >= CANDS:
            break
    return out


try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except Exception:  # noqa: BLE001
    font = small = ImageFont.load_default()

result = {}
rows = []
for fid, name, current in FOODS:
    cands = search(name)
    result[fid] = {'name': name, 'current': current, 'candidates': cands}
    imgs = [thumb(current)] + [thumb(c) for c in cands]
    rows.append((fid, name, imgs))
    print(f'{fid}: {len(cands)} candidates', flush=True)
    time.sleep(0.5)

LABEL_W, PAD, PER_SHEET = 230, 8, 12
for n in range(0, len(rows), PER_SHEET):
    chunk = rows[n:n + PER_SHEET]
    W = LABEL_W + (CANDS + 1) * (THUMB + PAD) + PAD
    H = len(chunk) * (THUMB + PAD + 22) + PAD
    sheet = Image.new('RGB', (W, H), (24, 20, 28))
    d = ImageDraw.Draw(sheet)
    for i, (fid, name, imgs) in enumerate(chunk):
        y = PAD + i * (THUMB + PAD + 22)
        d.text((PAD, y + 8), name, fill=(255, 220, 160), font=font)
        d.text((PAD, y + 34), fid, fill=(180, 170, 190), font=small)
        for j, im in enumerate(imgs):
            x = LABEL_W + j * (THUMB + PAD)
            if im:
                sheet.paste(im, (x, y))
            else:
                d.rectangle([x, y, x + THUMB, y + THUMB], outline=(120, 120, 120))
                d.text((x + 70, y + 100), 'missing', fill=(200, 80, 80), font=small)
            label = 'CURRENT' if j == 0 else str(j)
            d.text((x + 4, y + THUMB + 2), label, fill=(255, 120, 120) if j == 0 else (220, 220, 220), font=small)
            if j == 0:
                d.rectangle([x - 2, y - 2, x + THUMB + 1, y + THUMB + 1], outline=(255, 90, 90), width=3)
    sheet.save(os.path.join(OUT, f'sheet-{n // PER_SHEET + 1:02d}.png'), optimize=True)

json.dump(result, open(os.path.join(OUT, 'candidates.json'), 'w'), indent=1)
print('done', len(rows), 'foods')
