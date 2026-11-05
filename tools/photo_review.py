"""Food photo review + replacement (runs in CI: needs open internet + Pillow).

Mode 1 — review (default):
  REVIEW_IDS="steak,lamb"  (empty = every food)
  Writes photo-review/sheet-NN.png: food | CURRENT | candidates 1..8
  and photo-review/candidates.json {food: {current, queries, candidates:[{n, id, url, source, license, creator}]}}
  Candidates come from Openverse, restricted to CC0 / public-domain PHOTOGRAPHS (no attribution required).

Mode 2 — apply picks:
  PICKS='{"steak": "<openverse id>", ...}'
  Downloads each chosen image, center-crops to a 900x900 JPEG at img/food/<food>.jpg,
  and records provenance in img/food/CREDITS.json.
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
IMG = os.path.join(ROOT, 'img', 'food')
os.makedirs(OUT, exist_ok=True)

src = open(os.path.join(ROOT, 'js/data/foods.js'), encoding='utf-8').read()
FOODS = re.findall(r"\['(\w+)', '([^']+)', '[^']*', '[^']*', \d, '[^']*', '([\w:./-]+)'\]", src)
assert len(FOODS) > 50, f'parsed only {len(FOODS)} foods'
BY_ID = {f: (n, p) for f, n, p in FOODS}

QUERIES = {  # better search terms than the display name
    'steak': ['grilled steak', 'steak dinner'], 'lamb': ['lamb chops', 'rack of lamb'],
    'scallops': ['seared scallops', 'scallops dish'], 'philly': ['cheesesteak sandwich', 'philly cheesesteak'],
    'burrito': ['burrito', 'burrito cut'], 'burritobowl': ['burrito bowl', 'rice bowl beans'],
    'friedfish': ['fried fish', 'fish and chips'], 'crabcakes': ['crab cakes', 'crab cake'],
    'oysters': ['oysters', 'raw oysters'], 'hibachi': ['teppanyaki', 'hibachi'],
    'pulledpork': ['pulled pork sandwich', 'pulled pork'], 'falafel': ['falafel', 'falafel plate'],
    'fajitas': ['fajitas', 'sizzling fajitas'],
}
UA = {'User-Agent': 'idc-photo-review/1.1 (GitHub Actions; github.com/BobLobLaw55/Idc-app)'}
THUMB, CANDS = 220, 8


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                print('FAIL', url, e, file=sys.stderr)
                return None
            time.sleep(2 * (i + 1))


def to_img(data, size):
    try:
        im = Image.open(io.BytesIO(data)).convert('RGB')
    except Exception:  # noqa: BLE001
        return None
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    return im.resize((size, size), Image.LANCZOS)


def current_img(photo):
    if photo.startswith('local:'):
        path = os.path.join(IMG, photo[6:])
        return to_img(open(path, 'rb').read(), THUMB) if os.path.exists(path) else None
    d = get(f'https://images.unsplash.com/photo-{photo}?auto=format&fit=crop&w={THUMB}&h={THUMB}&q=60')
    return to_img(d, THUMB) if d else None


def openverse(query):
    q = urllib.parse.urlencode({'q': query, 'license': 'cc0,pdm', 'category': 'photograph', 'page_size': 20, 'mature': 'false'})
    d = get(f'https://api.openverse.org/v1/images/?{q}')
    return json.loads(d).get('results', []) if d else []


def review(ids):
    font = small = ImageFont.load_default()
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
        small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
    except Exception:  # noqa: BLE001
        pass
    result, rows = {}, []
    for fid in ids:
        name, photo = BY_ID[fid]
        seen, cands = set(), []
        for q in QUERIES.get(fid, [name]):
            for r in openverse(q):
                if r['id'] in seen or (r.get('width') or 0) < 500:
                    continue
                seen.add(r['id'])
                cands.append({'id': r['id'], 'url': r['url'], 'thumb': r.get('thumbnail'), 'source': r.get('foreign_landing_url'),
                              'license': r.get('license'), 'creator': r.get('creator'), 'title': r.get('title')})
            time.sleep(1)
        cands = cands[:CANDS]
        imgs = [current_img(photo)]
        for i, c in enumerate(cands):
            c['n'] = i + 1
            d = get(c['thumb'] or c['url'])
            imgs.append(to_img(d, THUMB) if d else None)
        result[fid] = {'name': name, 'current': photo, 'candidates': cands}
        rows.append((fid, name, imgs))
        print(f'{fid}: {len(cands)} candidates', flush=True)

    LABEL_W, PAD, PER = 230, 8, 8
    for n in range(0, len(rows), PER):
        chunk = rows[n:n + PER]
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
                d.text((x + 4, y + THUMB + 2), 'CURRENT' if j == 0 else str(j), fill=(255, 120, 120) if j == 0 else (230, 230, 230), font=small)
        sheet.save(os.path.join(OUT, f'sheet-{n // PER + 1:02d}.png'), optimize=True)
    json.dump(result, open(os.path.join(OUT, 'candidates.json'), 'w'), indent=1)


def apply(picks):
    os.makedirs(IMG, exist_ok=True)
    credits_path = os.path.join(IMG, 'CREDITS.json')
    credits = json.load(open(credits_path)) if os.path.exists(credits_path) else {}
    for fid, oid in picks.items():
        meta = json.loads(get(f'https://api.openverse.org/v1/images/{oid}/'))
        assert meta['license'] in ('cc0', 'pdm'), (fid, meta['license'])
        im = to_img(get(meta['url']), 900)
        assert im, f'could not download {fid}'
        im.save(os.path.join(IMG, f'{fid}.jpg'), 'JPEG', quality=82, optimize=True, progressive=True)
        im.resize((THUMB, THUMB)).save(os.path.join(OUT, f'picked-{fid}.jpg'), 'JPEG', quality=80)
        credits[fid] = {'openverse_id': oid, 'title': meta.get('title'), 'creator': meta.get('creator'), 'license': meta['license'],
                        'license_url': meta.get('license_url'), 'source': meta.get('foreign_landing_url')}
        print('saved', fid, meta['license'], flush=True)
    json.dump(credits, open(credits_path, 'w'), indent=1, sort_keys=True)


if __name__ == '__main__':
    picks = os.environ.get('PICKS', '').strip()
    if picks:
        apply(json.loads(picks))
    else:
        ids = [x for x in os.environ.get('REVIEW_IDS', '').replace(' ', '').split(',') if x] or [f for f, _, _ in FOODS]
        review(ids)
    print('done')
