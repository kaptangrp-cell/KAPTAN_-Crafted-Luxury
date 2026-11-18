from pathlib import Path
import sys,json,subprocess
sys.path.insert(0,'/tmp/kaptan-video-libs')
import imageio_ffmpeg
from PIL import Image,ImageOps,ImageDraw
r=Path(__file__).resolve().parent; ff=imageio_ffmpeg.get_ffmpeg_exe();file=r/'KAPTAN-Dynamic-Collection-5min-1080p.mp4'
frames,seconds=imageio_ffmpeg.count_frames_and_secs(str(file))
assert frames==7200,(frames,seconds)
assert abs(seconds-300)<.05,seconds
result=subprocess.run([ff,'-v','error','-i',str(file),'-f','null','-'],capture_output=True,text=True)
assert result.returncode==0 and not result.stderr,result.stderr
sheet=Image.new('RGB',(960,1350),'black')
for i in range(10):
 t=i*30+13
 dest=r/f'encoded-{i:02}.jpg'
 subprocess.run([ff,'-y','-v','error','-ss',str(t),'-i',str(file),'-frames:v','1',str(dest)],check=True)
 im=Image.open(dest);assert im.size==(1920,1080)
 sheet.paste(im.resize((480,270)),((i%2)*480,(i//2)*270))
sheet.save(r/'Contact-sheet.jpg')
(r/'validation.json').write_text(json.dumps({'frames':frames,'duration_seconds':seconds,'resolution':'1920x1080','fps':24,'full_decode':'passed','audio':'silent','file_bytes':file.stat().st_size},indent=2))
print((r/'validation.json').read_text())
