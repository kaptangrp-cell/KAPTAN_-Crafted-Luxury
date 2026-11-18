from pathlib import Path
import subprocess,json
from PIL import Image
R=Path(__file__).resolve().parent
FF='/tmp/kaptan-video-libs/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1'
p=R/'KAPTAN-Collection-One-Motion-Per-Product-1080p.mp4'
r=subprocess.run([FF,'-v','error','-i',str(p),'-progress','pipe:1','-f','null','-'],capture_output=True,text=True,check=True)
assert not r.stderr,r.stderr
fields=dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)
assert int(fields['frame'])==7200,fields
assert abs(int(fields['out_time_us'])/1e6-300)<.05,fields
sheet=Image.new('RGB',(960,1080))
for i,t in enumerate([2,13,26,32,43,56,62,73]):
 dest=R/f'encoded-{t}.jpg'
 subprocess.run([FF,'-y','-v','error','-ss',str(t),'-i',str(p),'-frames:v','1',str(dest)],check=True)
 im=Image.open(dest);assert im.size==(1920,1080)
 sheet.paste(im.resize((480,270)),((i%2)*480,(i//2)*270))
sheet.save(R/'Contact-sheet.jpg')
result={'frames':7200,'duration_seconds':300,'resolution':'1920x1080','decode':'passed','size_bytes':p.stat().st_size}
(R/'validation.json').write_text(json.dumps(result,indent=2));print(result)
