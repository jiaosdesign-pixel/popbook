#!/usr/bin/env python3 -I
"""python3 -I .claude/skills/moment/scripts/photo.py <photo> [--swatches out.png]

Reads a photo for a new moment and prints JSON: the date it was taken (EXIF, else the file's date), GPS if present,
size and orientation, the dominant colours overall and by band (sky / middle / ground), each as hex with its share,
and a first guess at the palette slots a moment needs (cover, core, stripes, sky-ish, water-ish, ground-ish).
The guesses are a starting point; the builder still picks the final palette against the parchment tokens.
--swatches writes a small PNG of the bands and colours to look at.
"""
import json, os, sys
from datetime import datetime
from PIL import Image, ExifTags

def hexc(rgb): return '#%02X%02X%02X' % tuple(int(v) for v in rgb[:3])

def dominant(im, n=6):
    im = im.convert('RGB').resize((160, max(1, int(160 * im.height / im.width))))
    q = im.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: n * 3]
    counts = sorted(q.getcolors(), reverse=True)
    total = sum(c for c, _ in counts)
    out = []
    for c, i in counts:
        out.append({'hex': hexc(pal[i * 3: i * 3 + 3]), 'share': round(c / total, 3)})
    return out

def exif_info(im):
    info = {'taken': None, 'gps': None}
    try:
        ex = im.getexif()
    except Exception:
        return info
    tags = {ExifTags.TAGS.get(k, k): v for k, v in ex.items()}
    sub = {}
    try:
        sub = {ExifTags.TAGS.get(k, k): v for k, v in ex.get_ifd(ExifTags.IFD.Exif).items()}
    except Exception:
        pass
    raw = sub.get('DateTimeOriginal') or tags.get('DateTime')
    if raw:
        try:
            info['taken'] = datetime.strptime(str(raw), '%Y:%m:%d %H:%M:%S').strftime('%Y-%m-%d %H:%M')
        except Exception:
            info['taken'] = str(raw)
    try:
        g = ex.get_ifd(ExifTags.IFD.GPSInfo)
        if g:
            def deg(v, ref): d = float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600; return -d if ref in ('S', 'W') else d
            info['gps'] = {'lat': round(deg(g[2], g[1]), 5), 'lon': round(deg(g[4], g[3]), 5)}
    except Exception:
        pass
    return info

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    path = sys.argv[1]
    im = Image.open(path)
    im.load()
    w, h = im.size
    meta = exif_info(im)
    if not meta['taken']:
        import re
        name = os.path.basename(path)
        m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', name) or re.match(r'^(\d{1,2})[:\-.](\d{1,2})[ _]', name)
        if m and len(m.groups()) == 3:
            meta['taken'] = '%s-%s-%s (from the file name)' % m.groups()
        elif m:
            year = datetime.fromtimestamp(os.path.getmtime(path)).year
            meta['taken'] = '%d-%02d-%02d (month and day from the file name, year from the file date)' % (year, int(m.group(1)), int(m.group(2)))
        else:
            meta['taken'] = datetime.fromtimestamp(os.path.getmtime(path)).strftime('%Y-%m-%d') + ' (file date only, no EXIF: confirm the date)'
    rgb = im.convert('RGB')
    bands = {
        'sky': rgb.crop((0, 0, w, h // 3)),
        'middle': rgb.crop((0, h // 3, w, 2 * h // 3)),
        'ground': rgb.crop((0, 2 * h // 3, w, h)),
    }
    out = {
        'file': os.path.basename(path), 'size': [w, h], 'orientation': 'landscape' if w >= h else 'portrait',
        'taken': meta['taken'], 'gps': meta['gps'],
        'overall': dominant(rgb, 8),
        'bands': {k: dominant(v, 4) for k, v in bands.items()},
    }
    sky, mid, gnd = out['bands']['sky'][0]['hex'], out['bands']['middle'][0]['hex'], out['bands']['ground'][0]['hex']
    out['guess'] = {
        'cover': 'a muted mid-tone from the photo, e.g. ' + out['overall'][1]['hex'],
        'core': '#F4F1E8 (paper core, keep)',
        'stripes': [c['hex'] for c in out['overall'][:6]],
        'sky-ish': sky, 'middle-ish': mid, 'ground-ish': gnd,
        'note': 'Paper colours sit a step lighter and warmer than the photo; the book is parchment, not a print.',
    }
    print(json.dumps(out, indent=1))
    if '--swatches' in sys.argv:
        dest = sys.argv[sys.argv.index('--swatches') + 1]
        sw = Image.new('RGB', (8 * 60, 4 * 60), '#FAF9F5')
        rows = [out['overall']] + [out['bands'][k] for k in ('sky', 'middle', 'ground')]
        for r, cols in enumerate(rows):
            for c, col in enumerate(cols[:8]):
                sw.paste(Image.new('RGB', (56, 56), col['hex']), (c * 60 + 2, r * 60 + 2))
        sw.save(dest)
        print('swatches:', dest, file=sys.stderr)

main()
