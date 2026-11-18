import render_v2 as r
import subprocess
from PIL import Image
patches=[]
for i,p in enumerate(r.products):
 if not p['videos']:continue
 path=r.OUT/f'fit-{i}.mp4';patches.append((i,path))
 enc=subprocess.Popen([r.FF,'-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','24','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',str(path)],stdin=subprocess.PIPE)
 reader=r.video_frames(i)
 for f in range(144):
  raw=reader.stdout.read(556*548*3)
  assert len(raw)==556*548*3
  im=r.frame(i,24+f/24,Image.frombytes('RGB',(556,548),raw));enc.stdin.write(im.tobytes())
  if f==72:im.save(r.OUT/f'fit-check-{i}.jpg')
 reader.stdout.close();reader.wait();enc.stdin.close();assert enc.wait()==0
 print('Reframed video',i+1,flush=True)
original=r.OUT/'KAPTAN-Collection-One-Motion-Per-Product-1080p.mp4'
args=[r.FF,'-y','-v','error','-i',str(original)]
for _,path in patches:args+=['-i',str(path)]
graph=[];labels=[];cursor=0
for k,(i,path) in enumerate(patches,1):
 start=i*30+24;end=(i+1)*30
 label=f'b{k}';graph.append(f'[0:v]trim=start={cursor}:end={start},setpts=PTS-STARTPTS[{label}]');labels.append(f'[{label}]')
 graph.append(f'[{k}:v]setpts=PTS-STARTPTS[p{k}]');labels.append(f'[p{k}]');cursor=end
if cursor<300:
 graph.append(f'[0:v]trim=start={cursor}:end=300,setpts=PTS-STARTPTS[tail]');labels.append('[tail]')
graph.append(''.join(labels)+f'concat=n={len(labels)}:v=1:a=0[v]')
output=r.OUT/'final-fit.mp4'
subprocess.run(args+['-filter_complex',';'.join(graph),'-map','[v]','-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(output)],check=True)
output.replace(original)
print('Final video ready',flush=True)
