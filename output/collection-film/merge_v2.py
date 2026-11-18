import render_v2 as r
import subprocess
patches=[(i,r.OUT/f'fit-{i}.mp4') for i,p in enumerate(r.products) if p['videos']]
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
