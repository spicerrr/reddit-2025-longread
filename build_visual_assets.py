from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / 'data' / 'site_data.json').read_text(encoding='utf-8'))
SOURCE = Image.open(ROOT / 'assets' / 'photo' / '2025_events_collage.jpg').convert('RGB')

FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'


def font(path: str, size: int):
    return ImageFont.truetype(path, size=size)


def fit_crop(img: Image.Image, size: tuple[int, int], focus=(0.5, 0.5)) -> Image.Image:
    w, h = img.size
    tw, th = size
    scale = max(tw / w, th / h)
    nw, nh = int(w * scale), int(h * scale)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    fx, fy = focus
    left = max(0, min(nw - tw, int((nw - tw) * fx)))
    top = max(0, min(nh - th, int((nh - th) * fy)))
    return img.crop((left, top, left + tw, top + th))


def overlay_gradient(img: Image.Image, top=(0, 0, 0, 10), bottom=(0, 0, 0, 210)) -> Image.Image:
    base = img.convert('RGBA')
    grad = Image.new('RGBA', base.size)
    draw = ImageDraw.Draw(grad)
    for y in range(base.height):
        t = y / max(base.height - 1, 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(4))
        draw.line((0, y, base.width, y), fill=color)
    return Image.alpha_composite(base, grad)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, width: int) -> list[str]:
    words = text.split()
    lines, current = [], ''
    for word in words:
        trial = f'{current} {word}'.strip()
        if draw.textbbox((0, 0), trial, font=fnt)[2] <= width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_multiline(draw, xy, lines: Iterable[str], fnt, fill, spacing=8):
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += fnt.size + spacing
    return y


def panels() -> list[Image.Image]:
    w, h = SOURCE.size
    xs = [0, int(w * 0.34), int(w * 0.665), w]
    ys = [0, int(h * 0.33), int(h * 0.67), h]
    result = []
    for r in range(3):
        for c in range(3):
            result.append(SOURCE.crop((xs[c], ys[r], xs[c+1], ys[r+1])))
    return result

P = panels()


def save_community_covers():
    out = ROOT / 'assets' / 'communities'
    out.mkdir(parents=True, exist_ok=True)
    palette = {
        'worldnews': ('#1c2a58', '#f0f3fb'), 'news': ('#d94c35', '#fff4ef'),
        'science': ('#1f7f6e', '#eff9f5'), 'technology': ('#6548a6', '#f5f1ff'),
        'movies': ('#b57c12', '#fff8e8'), 'gaming': ('#db5d4b', '#fff1ed'),
        'CasualConversation': ('#c9684e', '#fff4ef'), 'NoStupidQuestions': ('#376aa8', '#eef5ff')
    }
    subtitles = {item['id']: item['title'] for item in DATA['subreddits']}
    by_sub = {}
    for post in DATA['semantic_points']:
        by_sub.setdefault(post['subreddit'], [])
        if post['title'] not in by_sub[post['subreddit']]:
            by_sub[post['subreddit']].append(post['title'])

    for sid, subtitle in subtitles.items():
        accent, bg = palette[sid]
        image = Image.new('RGB', (960, 620), bg)
        draw = ImageDraw.Draw(image)
        for y in range(0, 620, 34):
            draw.line((0, y, 960, y), fill='#ded9d1', width=1)
        for i in range(55):
            x, y = (i * 97) % 960, (i * 61) % 620
            r = 2 + i % 3
            draw.ellipse((x-r, y-r, x+r, y+r), fill=accent)
        draw.rounded_rectangle((42, 34, 218, 82), radius=24, fill=accent)
        draw.text((68, 47), 'REDDIT 2025', font=font(FONT_BOLD, 18), fill='white')
        draw.text((44, 102), f'r/{sid}', font=font(FONT_SERIF, 48), fill='#171b22')
        draw.text((46, 162), subtitle, font=font(FONT_REGULAR, 21), fill='#5d6470')
        titles = by_sub.get(sid, [])[:4]
        cards = [(45,225,420,365,-3),(395,206,910,350,2),(85,385,540,550,2),(510,380,915,555,-2)]
        for idx, (x1,y1,x2,y2,angle) in enumerate(cards):
            card = Image.new('RGBA', (x2-x1, y2-y1), (255,255,255,246))
            cd = ImageDraw.Draw(card)
            cd.rounded_rectangle((0,0,card.width-1,card.height-1), radius=18, fill=(255,255,255,246), outline=(210,207,201,255), width=2)
            cd.ellipse((18,18,40,40), fill=accent)
            cd.text((51,16), f'r/{sid}', font=font(FONT_BOLD,14), fill='#2d333d')
            title = titles[idx] if idx < len(titles) else subtitle
            title_font = font(FONT_BOLD, 19 if card.width > 430 else 17)
            lines = wrap_text(cd, title, title_font, card.width - 36)
            draw_multiline(cd, (18,54), lines[:4], title_font, '#171b22', 5)
            cd.text((18,card.height-30), 'Открыть тред ↗', font=font(FONT_REGULAR,13), fill=accent)
            card = card.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(0,0,0,0))
            image.paste(card, (x1-8,y1-8), card)
        image.save(out / f'{sid.lower()}.jpg', quality=92, optimize=True)


def save_month_covers():
    out = ROOT / 'assets' / 'months'
    out.mkdir(parents=True, exist_ok=True)
    focuses = [(0.2,0.2),(0.5,0.15),(0.8,0.2),(0.2,0.52),(0.5,0.52),(0.82,0.52),(0.2,0.82),(0.52,0.82),(0.82,0.82),(0.35,0.35),(0.65,0.65),(0.5,0.5)]
    accents = ['#111827','#6f42c1','#177c69','#b8422b','#b17b14','#7b2430','#235a91','#355d14','#78336d','#5f46a7','#9c6810','#aa3040']
    for i, scene in enumerate(DATA['months']):
        base = fit_crop(SOURCE, (1200, 760), focus=focuses[i])
        base = ImageEnhance.Color(base).enhance(0.78)
        base = ImageEnhance.Contrast(base).enhance(1.08)
        base = overlay_gradient(base, (0,0,0,25), (6,8,16,230))
        draw = ImageDraw.Draw(base)
        draw.rounded_rectangle((56, 50, 224, 104), radius=27, fill=accents[i])
        draw.text((82, 64), scene['month_name'].upper(), font=font(FONT_BOLD, 21), fill='white')
        title_font = font(FONT_BOLD, 46)
        lines = wrap_text(draw, scene['title'], title_font, 990)
        y = 470 - max(0, len(lines)-2)*35
        draw_multiline(draw, (58, y), lines[:3], title_font, 'white', spacing=8)
        draw.text((60, 680), scene['label'], font=font(FONT_REGULAR, 23), fill=(235,238,244))
        draw.ellipse((1040, 55, 1130, 145), fill=(255,255,255,34), outline=(255,255,255,100), width=2)
        draw.text((1085, 80), str(i+1).zfill(2), anchor='ma', font=font(FONT_BOLD, 30), fill='white')
        base.convert('RGB').save(out / f"{scene['month']}.jpg", quality=91, optimize=True)


def save_fandom_posters():
    out = ROOT / 'assets' / 'fandom-posters'
    out.mkdir(parents=True, exist_ok=True)
    accents = ['#ff4500','#214b8b','#6f45a8','#147a6e','#b87a16','#4e6e17','#9b2f66','#43368f']
    for i, card in enumerate(DATA['fandoms']):
        name = card['name']
        accent = accents[i % len(accents)]
        bg = '#f4efe8' if i % 2 == 0 else '#111722'
        image = Image.new('RGB', (760, 1040), bg)
        draw = ImageDraw.Draw(image)
        draw.polygon([(0,0),(760,0),(760,250),(0,410)], fill=accent)
        for n in range(50):
            x, y = (n*83)%760, 260+(n*57)%780
            r = 2 + n%4
            color = (255,255,255) if bg != '#f4efe8' else (20,24,32)
            draw.ellipse((x-r,y-r,x+r,y+r), fill=color)
        draw.rounded_rectangle((44,40,240,88), radius=24, fill='white')
        draw.text((67,53), 'FANDOM INDEX', font=font(FONT_BOLD,18), fill=accent)
        title_color = 'white' if bg != '#f4efe8' else '#111722'
        title_font = font(FONT_SERIF, 76 if len(name)<13 else 58)
        draw_multiline(draw, (48,300), wrap_text(draw,name,title_font,650)[:2], title_font, title_color, 2)
        snippet = card.get('example','')
        strip = Image.new('RGBA', (660,250), (255,255,255,245))
        sd = ImageDraw.Draw(strip)
        sd.rounded_rectangle((0,0,659,249), radius=24, fill=(255,255,255,245), outline=(220,216,210,255), width=2)
        sd.ellipse((24,24,58,58), fill='#ff4500')
        sd.text((74,26), f"r/{card['community']}", font=font(FONT_BOLD,18), fill='#222831')
        draw_multiline(sd, (24,82), wrap_text(sd,snippet,font(FONT_BOLD,24),605)[:5], font(FONT_BOLD,24), '#171b22', 7)
        strip = strip.rotate(-2 if i%2 else 2, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(0,0,0,0))
        image.paste(strip, (50,610), strip)
        draw.text((50,952), f"{card['mentions']} упоминаний · пик {card['peak_month']}", font=font(FONT_REGULAR,22), fill=title_color)
        filename = re.sub(r'[^a-z0-9]+','_',name.lower()).strip('_') + '.jpg'
        image.save(out / filename, quality=92, optimize=True)


def save_thread_previews():
    out = ROOT / 'assets' / 'thread-previews'
    out.mkdir(parents=True, exist_ok=True)
    for i, t in enumerate(DATA['threads'][:12]):
        w, h = 980, 520
        image = Image.new('RGB', (w, h), '#f5f6f7')
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((30, 30, 110, h-30), radius=24, fill='#eceff1')
        draw.polygon([(70,70),(54,96),(86,96)], fill='#ff4500')
        draw.polygon([(70,h-70),(54,h-96),(86,h-96)], fill='#8b9aa9')
        draw.rounded_rectangle((130, 30, w-30, h-30), radius=26, fill='white', outline='#dfe3e7', width=2)
        draw.ellipse((165, 67, 213, 115), fill='#ff4500')
        draw.text((189, 91), 'r', anchor='mm', font=font(FONT_BOLD, 26), fill='white')
        draw.text((230, 66), f"r/{t['subreddit']}", font=font(FONT_BOLD, 24), fill='#20252d')
        draw.text((230, 98), f"{t['month']} · эпизод: {t['scene']}", font=font(FONT_REGULAR, 18), fill='#707985')
        title_font = font(FONT_BOLD, 34)
        draw_multiline(draw, (165, 160), wrap_text(draw, t['title'], title_font, 690)[:5], title_font, '#151a21', 10)
        draw.rounded_rectangle((165, 430, 330, 472), radius=21, fill='#f3f4f5')
        draw.text((190, 442), 'Открыть тред ↗', font=font(FONT_BOLD, 17), fill='#ff4500')
        image.save(out / f'thread_{i+1:02d}.jpg', quality=91, optimize=True)


def main():
    save_community_covers()
    save_month_covers()
    save_fandom_posters()
    save_thread_previews()
    print('Visual assets generated.')

if __name__ == '__main__':
    main()
