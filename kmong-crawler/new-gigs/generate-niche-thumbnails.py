#!/usr/bin/env python3
"""
니치 10상품 맞춤 썸네일 생성 (1280x960 4:3)
- 각 니치 핵심 카피 + 대비 컬러 + 강조 숫자
- Pretendard/Noto Sans KR 굵은 폰트
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path

OUT = Path('/home/onda/projects/onda-hompage/kmong-crawler/new-gigs/03-images')
OUT.mkdir(exist_ok=True, parents=True)
FONT = '/home/onda/projects/gotit-instagram/fonts/NotoSansKR-Variable.ttf'

W, H = 1280, 960

THUMBS = [
    # id, title_top, title_main (2줄), highlight (가격/숫자), color_bg, color_accent
    ('N01', '아임웹 구독료 1년 120만원',   '자체 홈페이지\n무료 이사',           '연 0원',      (40, 170, 120),  (255, 220, 50)),
    ('N02', '식스샵 월 2.2~6.6만',         '포트폴리오 통째로\n이사시켜 드립니다', '30작업+',     (30, 30, 40),    (255, 255, 255)),
    ('N03', '카페24 + SSL 연 50만',       '가비아·카페24 임대\n무료 호스팅 이사', '연 50만 절감', (70, 120, 200),  (255, 200, 50)),
    ('N04', '노션 = SEO 미노출',           '노션 그대로 쓰고\n진짜 홈페이지로',   'SEO OK',      (20, 20, 25),    (180, 255, 120)),
    ('N05', 'Wix $29/월 Squarespace',     '한국 이전 특화\n한국어 SEO 세팅',    '달러 탈출',   (100, 50, 160),  (255, 240, 100)),
    ('N06', '월 0원 문의폼',                '이메일 + 푸시 알림\n놓치는 문의 0',   '월 0원',      (220, 80, 80),   (255, 255, 255)),
    ('N07', '안전하지 않음 경고',           '자물쇠 아이콘 달기\nSSL 무료 전환',   '연 33만 절감', (50, 140, 90),   (255, 255, 255)),
    ('N08', '네이버예약 수수료 3.3%',       'B2B 컨설팅 레슨\n자체 예약 시스템',   '수수료 0%',   (30, 60, 120),   (255, 200, 60)),
    ('N09', '관광객 다국어 + 이미지 번역',  '상세페이지 JPG까지\n번역 재합성',    '영·일·중',    (180, 60, 100),  (255, 240, 180)),
    ('N10', '리뉴얼 후 순위 날아갔어요',    '옛 주소→새 주소\n301 자동 연결',    '순위 복구',   (30, 90, 140),   (255, 220, 80)),
]

def fit(text, max_w, max_h, start=140):
    for size in range(start, 30, -4):
        f = ImageFont.truetype(FONT, size)
        bbox = f.getbbox(text)
        if bbox[2]-bbox[0] <= max_w and bbox[3]-bbox[1] <= max_h:
            return f, size
    return ImageFont.truetype(FONT, 30), 30

def make(item):
    nid, top, main, hl, bg, acc = item
    img = Image.new('RGB', (W, H), bg)
    # 상단 우측 모서리 장식
    d = ImageDraw.Draw(img)
    d.rectangle([W-220, 0, W, 220], fill=acc)
    d.rectangle([0, H-12, W, H], fill=acc)
    # 상단 문구 (작은 글씨, 페인포인트)
    f_top = ImageFont.truetype(FONT, 42)
    d.text((80, 100), top, font=f_top, fill=acc)
    # 메인 2줄
    lines = main.split('\n')
    y = 240
    for ln in lines:
        fm, _ = fit(ln, W-160, 180, start=130)
        d.text((80, y), ln, font=fm, fill=(255, 255, 255) if sum(bg) < 400 else (20, 20, 20))
        y += 150
    # 강조 박스 (우하)
    hl_font = ImageFont.truetype(FONT, 76)
    bb = hl_font.getbbox(hl)
    hl_w = bb[2]-bb[0]+80
    hl_h = bb[3]-bb[1]+40
    bx = W - hl_w - 80
    by = H - hl_h - 100
    d.rounded_rectangle([bx, by, bx+hl_w, by+hl_h], radius=20, fill=acc)
    d.text((bx+40, by+10), hl, font=hl_font, fill=bg)
    # 하단 좌측 브랜드
    brand = ImageFont.truetype(FONT, 36)
    d.text((80, H-80), 'ONDA 마케팅', font=brand, fill=(200, 200, 200))
    # ID 마크 (우상)
    idf = ImageFont.truetype(FONT, 54)
    d.text((W-200, 80), nid, font=idf, fill=bg, anchor='lt')

    out = OUT / f'niche-{nid}.png'
    img.save(out, optimize=True)
    return out

for t in THUMBS:
    p = make(t)
    print(f'  ✓ {p.name}')
print('완료:', len(THUMBS), '장')
