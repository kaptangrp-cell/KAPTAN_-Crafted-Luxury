from pathlib import Path
import json,urllib.request,concurrent.futures,sys
sys.path.insert(0,'/tmp/kaptan-video-libs')
from fontTools.ttLib import TTFont
ROOT=Path(__file__).resolve().parent
catalog=json.loads((ROOT/'catalog.json').read_text())
def get(task):
 url,path=task
 if not path.exists():
  with urllib.request.urlopen(url,timeout=90) as r: path.write_bytes(r.read())
 return str(path.relative_to(ROOT))
tasks=[]
for i,p in enumerate(catalog):
 media=sorted(p['product_images'],key=lambda m:m.get('sort_order') or 0)
 p['images']=[];p['videos']=[]
 for j,m in enumerate(media):
  video=m.get('media_type')=='video' or '.mp4' in m['url']
  if not video and len(p['images'])>=4:continue
  if video and p['videos']:continue
  path=ROOT/'assets'/f'{i:02}-{j:02}{".mp4" if video else ".jpg"}'
  p['videos' if video else 'images'].append(str(path.relative_to(ROOT)))
  tasks.append((m['url'],path))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 for f in ex.map(get,tasks):print(f,flush=True)
(ROOT/'manifest.json').write_text(json.dumps(catalog,indent=2))
repo=ROOT.parents[1]
for family,weight,out in [('inter',400,'Inter'),('inter',600,'Inter-Semibold'),('playfair-display',400,'Playfair')]:
 font=TTFont(repo/f'node_modules/@fontsource/{family}/files/{family}-latin-{weight}-normal.woff2');font.flavor=None;font.save(ROOT/'assets'/f'{out}.ttf')
print('Prepared',len(tasks),'assets')
