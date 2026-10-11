"""Render the existing shield and a simple 1200x630 social card (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parent.parent
image=Image.new('RGB',(1200,630),'#0c1020'); d=ImageDraw.Draw(image)
font_dir=Path('/System/Library/Fonts/Supplemental')
# Optional font directory allows regeneration on non-macOS machines.
import os
font_dir=Path(os.environ.get('PREPSUITE_FONT_DIR', str(font_dir)))
def font(size,bold=False):return ImageFont.truetype(str(font_dir/('Arial Bold.ttf' if bold else 'Arial.ttf')),size)
d.rounded_rectangle((810,50,1150,580),radius=26,fill='#191f34',outline='#41435f',width=2)
# Board motif, subordinate to the product message.
for r in range(6):
 for c in range(4):
  x,y=838+c*70,110+r*70
  d.rectangle((x,y,x+69,y+69),fill='#b8abd9' if (r+c)%2 else '#505875')
# Existing shield's geometry, drawn as a vector path via Pillow's polygon primitives.
ox,oy,scale=55,45,1.1
outer=[(32,4),(24,9),(15,12),(7,13),(7,34),(10,45),(19,54),(32,61),(45,54),(54,45),(57,34),(57,13),(49,12),(40,9)]
inner=[(32,16),(24,20),(17,22),(17,34),(22,42),(32,51),(42,42),(47,34),(47,22),(40,20)]
for points,color in [(outer,'#e9e3d5'),(inner,'#0c1020')]:d.polygon([(ox+x*scale,oy+y*scale) for x,y in points],fill=color)
d.text((135,55),'PrepSuite.ai',font=font(38,True),fill='#f6f3ff')
d.text((60,175),'One move ahead.',font=font(65,True),fill='#f6f3ff')
d.text((60,255),'Before move one.',font=font(58,True),fill='#baa5ff')
for i,line in enumerate(['Connect tournament players','with their online accounts.','Combine their games. Arrive with a plan.']):
 d.text((64,367+i*42),line,font=font(27),fill='#ced1df')
d.text((64,555),'CHESS.COM  /  LICHESS  /  OVER THE BOARD',font=font(17,True),fill='#b9a5ff')
image.save(root/'public/prepsuite-social.png',optimize=True)
