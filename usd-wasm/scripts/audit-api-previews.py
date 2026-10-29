"""Make native-preview contact sheets and flag near-identical silhouettes for review."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / '.cache/api-example-captures/manifest.json').read_text())
output = ROOT / '.cache/api-scenes-review'
output.mkdir(parents=True, exist_ok=True)
records, masks, concerns = [], [], []
for entry in manifest:
    path = ROOT / 'tests/fixtures/thumbnails' / (entry['id'] + '.png')
    image = Image.open(path).convert('RGBA')
    alpha = image.getchannel('A')
    mask = alpha.resize((48, 36), Image.Resampling.BOX)
    bits = bytes(int(value > 100) for value in mask.getdata())
    coverage = sum(bits) / len(bits)
    if not .025 < coverage < .90:
        concerns.append(f"{entry['example']}: object coverage {coverage:.1%} is outside capture limits")
    records.append({'id': entry['id'], 'coverage': round(coverage, 4), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    masks.append(bits)
if len({record['sha256'] for record in records}) != len(records):
    raise SystemExit('Duplicate native preview images')
near = []
for i, left in enumerate(masks):
    for j in range(i):
        right = masks[j]
        union = sum(bool(a or b) for a, b in zip(left, right))
        similarity = sum(bool(a and b) for a, b in zip(left, right)) / max(1, union)
        if similarity > .88:
            near.append({'left': records[i]['id'], 'right': records[j]['id'], 'silhouetteIoU': round(similarity, 3)})
for start in range(0, len(manifest), 20):
    entries = manifest[start:start+20]
    sheet = Image.new('RGB', (5*240, 4*204), '#eceee9')
    draw = ImageDraw.Draw(sheet)
    for index, entry in enumerate(entries):
        image = Image.open(ROOT / 'tests/fixtures/thumbnails' / (entry['id'] + '.png')).convert('RGBA')
        image.thumbnail((232, 174), Image.Resampling.LANCZOS)
        x, y = (index % 5)*240+4, (index // 5)*204
        sheet.paste(image, (x+(232-image.width)//2, y+(174-image.height)//2), image)
        title = entry['example'].removeprefix('fixture-').replace('-', ' ')
        draw.text((x+3, y+177), title[:34], fill='#15201b')
    sheet.save(output / f'contact-sheet-{start//20+1}.png')
report = {'count': len(records), 'renderer': 'native Storm', 'previews': records, 'nearSilhouettesForReview': near, 'captureConcerns': concerns}
(output / 'preview-audit.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'count': len(records), 'nearSilhouettesForReview': near, 'captureConcerns': concerns}, indent=2))

if concerns:
    raise SystemExit("\n".join(concerns))
