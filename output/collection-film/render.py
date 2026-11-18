"""KAPTAN collection film — deterministic 300s / 1920x1080 / 24fps.
Run: PYTHONPATH=/tmp/kaptan-video-libs python3 render.py
Use --preview to render representative stills only.
"""
import sys,json,math,subprocess,functools
from pathlib import Path
sys.path.insert(0,'/tmp/kaptan-video-libs')
from PIL import Image,ImageDraw,ImageFont,ImageOps
import imageio_ffmpeg
R=Path(__file__).resolve().parent; W,H,FPS=1920,1080,24
GOLD='#c9a227';WHITE='#f9f6ee';MUTED='#b9b4a7';BLACK='#000000'
FF=imageio_ffmpeg.get_ffmpeg_exe()
products=json.loads((R/'manifest.json').read_text())
# Every published product appears once, for 30 seconds. Source prices are unchanged.
order=[0,5,6,7,8,3,9,1,4,2]
products=[products[i] for i in order]
names=['Heart & Star Candle Holder','Crystal Cube Salt Lamp','Penny Cube Salt Lamp','Cylinder Salt Lamp','Ball Shape Salt Lamp','Crystal Fire Bowl Lamp','Flying Bird Plate Salt Lamp','Leather Mini Wallet','Premium Leather Wallet','Classic Leather Belt']
desc=['Natural salt. A warm candlelit accent.','Geometric form. A warm interior accent.','A sculptural cube for your favourite corner.','A clean silhouette. A softer evening glow.','A rounded accent for a welcoming home.','Crystal salt balls in a luminous bowl.','A decorative bird scene, softly illuminated.','A compact companion for daily essentials.','A classic leather accessory for everyday use.','A finishing touch for everyday outfits.']
for i,p in enumerate(products):p['display_name']=names[i];p['line']=desc[i]
@functools.lru_cache(None)
def font(size,kind='sans'):
 return ImageFont.truetype(str(R/'assets'/({'sans':'Inter','bold':'Inter-Semibold','serif':'Playfair'}[kind]+'.ttf')),size)
def txt(d,xy,text,size=26,color=WHITE,kind='sans'):d.text(xy,text,font=font(size,kind),fill=color)
def wrap(d,text,width,size,kind='sans'):
 lines=[];line=''
 for word in text.split():
  cand=(line+' '+word).strip()
  if d.textlength(cand,font=font(size,kind))>width and line:lines.append(line);line=word
  else:line=cand
 if line:lines.append(line)
 return lines
photos=[[Image.open(R/f).convert('RGB') for f in p['images']] for p in products]
logo=Image.open(R.parents[1]/'public/kaptan-logo.png').convert('RGBA');logo=ImageOps.contain(logo,(84,84))
def price(p):return f"€{p['price']:.2f}"
def contain(im,size):
 layer=Image.new('RGB',size,'#0d0d0d');fit=ImageOps.contain(im,size,Image.Resampling.LANCZOS);layer.paste(fit,((size[0]-fit.width)//2,(size[1]-fit.height)//2));return layer
@functools.lru_cache(maxsize=100)
def card(i,j):
 im=Image.new('RGB',(580,620),'#1a1a1a');d=ImageDraw.Draw(im);d.rectangle((0,0,579,619),outline=GOLD,width=2)
 im.paste(contain(photos[i][j%len(photos[i])],(556,548)),(12,12));txt(d,(24,578),f"{j%len(photos[i])+1:02}  /  COLLECTION VIEW",17,GOLD)
 return im
@functools.lru_cache(None)
def background(i):
 p=products[i];im=Image.new('RGB',(W,H),BLACK);d=ImageDraw.Draw(im)
 d.rectangle((960,0,W,H),fill='#0d0d0d');d.line((960,142,960,1008),fill='#443b20',width=2)
 im.paste(logo,(52,22),logo);txt(d,(154,30),'KAPTAN',52,GOLD,'serif');txt(d,(157,94),'T H E   C O L L E C T I O N',18,MUTED)
 txt(d,(1300,55),'CHARACTER IN EVERYDAY LIFE',22,GOLD)
 d.line((56,142,1864,142),fill='#544521',width=2)
 txt(d,(58,173),'DISCOVER THE COLLECTION',20,GOLD)
 txt(d,(58,210),'Warmth & everyday elegance',42,WHITE,'serif')
 group=0 if i<5 else 5
 for r,k in enumerate(range(group,group+5)):
  y=292+r*133;active=k==i
  d.rounded_rectangle((48,y,909,y+119),radius=12,fill='#1a1a1a' if active else '#0d0d0d',outline=GOLD if active else '#29251c',width=2 if active else 1)
  im.paste(contain(photos[k][0],(92,99)),(60,y+10))
  if active:d.rectangle((48,y+20,52,y+99),fill=GOLD)
  lines=wrap(d,products[k]['display_name'],530,27,'serif')
  for l,line in enumerate(lines):txt(d,(174,y+15+l*32),line,27,WHITE if active else MUTED,'serif')
  # Concise descriptions keep all five rows readable at normal viewing distance.
  text=products[k]['line'];lines=wrap(d,text,535,19)
  for l,line in enumerate(lines[:2]):txt(d,(174,y+65+l*23),line,19,MUTED)
  txt(d,(790,y+42),price(products[k]),26,GOLD,'bold')
 txt(d,(58,971),'EURO PRICES  ·  EXPLORE MORE AT KAPTANGRP.COM',18,MUTED)
 txt(d,(1010,174),'KAPTAN SALT LAMPS' if i<7 else 'KAPTAN LEATHER',20,GOLD)
 # The right panel's fixed labels remain legible while imagery moves above them.
 for l,line in enumerate(wrap(d,p['display_name'],690,39,'serif')):txt(d,(1010,850+l*47),line,39,WHITE,'serif')
 txt(d,(1735,855),price(p),35,GOLD,'bold')
 txt(d,(1010,953),p['line'],22,MUTED)
 d.line((56,1010,1864,1010),fill='#544521',width=2)
 txt(d,(58,1030),'KAPTAN COLLECTION',20,GOLD);txt(d,(760,1030),'kaptangrp.com',23,WHITE)
 txt(d,(1370,1034),'Prices captured 13 Nov 2026 · See store for availability',15,MUTED)
 return im

def ease(x):x=max(0,min(1,x));return x*x*(3-2*x)
def place(stage,c,x,y,scale=1,angle=0):
 w=max(1,round(c.width*scale));h=max(1,round(c.height*scale)); c=c.resize((w,h),Image.Resampling.BICUBIC).convert('RGBA')
 if angle:c=c.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
 stage.paste(c,(round(x-c.width/2),round(y-c.height/2)),c)

def frame(i,t,vframe=None):
 im=background(i).copy();d=ImageDraw.Draw(im)
 # Confine all paths to the right-hand showcase; the list never moves out of view.
 stage=Image.new('RGB',(904,628),'#0d0d0d');sd=ImageDraw.Draw(stage)
 sd.ellipse((80,65,824,588),outline='#302919',width=2)
 n=max(3,len(photos[i]))
 if t<10:
  mode='CURATED VIEWS';phase=t/3.3;idx=int(phase)%n;u=ease((phase%1-.70)/.30)
  for depth in [2,1,0]:
   j=(idx+depth)%n
   x=452+depth*55; y=320-depth*24
   if depth==0:x-=u*560;y+=u*35
   place(stage,card(i,j),x,y,.83-depth*.05,-depth*4-u*5 if depth==0 else -depth*4)
 elif t<18:
  mode='EVERY ANGLE';theta=(t-10)/8*math.tau
  positions=[]
  for j in range(3):
   a=theta+j*math.tau/3;depth=math.cos(a);positions.append((depth,j,452+265*math.sin(a),305+44*depth,.49+.24*(depth+1)/2))
  for depth,j,x,y,s in sorted(positions):place(stage,card(i,j),x,y,s,-math.sin(theta+j*math.tau/3)*5)
 elif t<24:
  mode='DETAILS IN MOTION';phase=(t-18)/3;idx=int(phase);u=ease((phase%1-.60)/.40)
  for off in [-1,0,1]:place(stage,card(i,idx+off),452+(off-u)*650,313,.91)
  # A subtle gesture trail demonstrates a leftward glide without pretending the MP4 is interactive.
  if u>0 and u<1:
   x=640-340*u;sd=ImageDraw.Draw(stage);sd.line((x,589,x+100,589),fill=GOLD,width=3);sd.ellipse((x-9,580,x+9,598),outline=GOLD,width=2)
 else:
  mode='PRODUCT FILM' if vframe is not None else 'SIGNATURE DETAILS'
  if vframe is not None:stage.paste(vframe,(0,0))
  else:place(stage,card(i,2),452,314,.91+0.015*math.sin((t-24)/6*math.pi))
 im.paste(stage,(986,212));d=ImageDraw.Draw(im)
 txt(d,(1600,175),mode,17,MUTED)
 # Segmented progress ties the changing list to the active product.
 for j in range(10):
  x=1010+j*81;d.rounded_rectangle((x,992,x+65,995),radius=1,fill=GOLD if j<=i else '#3b3424')
 d.rectangle((56,1007,56+int(1808*(i*30+t)/300),1009),fill=GOLD)
 # A short gold edge wipe bridges products, without black gaps or overlapping copy.
 if t<.45:
  u=ease(t/.45);d.rectangle((960,144,960+int(944*(1-u)),1004),fill='#0d0d0d');d.line((960+int(944*(1-u)),144,960+int(944*(1-u)),1004),fill=GOLD,width=3)
 return im

def video_frames(i):
 if not products[i]['videos']:return None
 p=subprocess.Popen([FF,'-v','error','-ss','1','-i',str(R/products[i]['videos'][0]),'-t','6','-vf','fps=24,scale=904:628:force_original_aspect_ratio=decrease,pad=904:628:(ow-iw)/2:(oh-ih)/2:color=0x0d0d0d','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
 return p

def main():
 if '--preview' in sys.argv:
  for i,t in [(0,2),(2,13),(5,21),(9,27)]:frame(i,t).save(R/f'preview-{i}-{t}.jpg')
  return
 out=R/'KAPTAN-Dynamic-Collection-5min-1080p.mp4'
 log=open(R/'encode.log','w')
 enc=subprocess.Popen([FF,'-y','-v','warning','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','24','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE,stderr=log)
 for i in range(10):
  reader=None
  for f in range(720):
   t=f/FPS;vf=None
   if f==576:reader=video_frames(i)
   if reader:
    raw=reader.stdout.read(904*628*3)
    if len(raw)!=904*628*3:raise RuntimeError('Video source too short: '+products[i]['name'])
    vf=Image.frombytes('RGB',(904,628),raw)
   img=frame(i,t,vf);enc.stdin.write(img.tobytes())
   if f in [60,310,500,660]:img.save(R/f'check-{i:02}-{f:03}.jpg',quality=90)
  if reader:reader.stdout.close();reader.wait()
  print(f'Completed product {i+1}/10: {products[i]["display_name"]}',flush=True)
 enc.stdin.close()
 if enc.wait():raise RuntimeError('Encoder failed; inspect encode.log')
 print(out,flush=True)
if __name__=='__main__':main()
