#!/usr/bin/env python3
"""
N01 (아임웹 이사) 상세 이미지 갤러리 3장 생성 — 1280x960 4:3

1. gallery-1: 월 구독료 Before → After (3~10만 → 0원)
2. gallery-2: ROI 타임라인 (6~7개월 본전 → 평생 공짜)
3. gallery-3: 이사 7단계 프로세스
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path('/home/onda/projects/onda-hompage/kmong-crawler/new-gigs/03-images')
OUT.mkdir(exist_ok=True, parents=True)
FONT = '/home/onda/projects/gotit-instagram/fonts/NotoSansKR-Variable.ttf'

W, H = 1304, 976  # 크몽 권장 규격 (652x488의 2배)

def f(size):
    return ImageFont.truetype(FONT, size)

def text_w(t, font):
    bb = font.getbbox(t)
    return bb[2] - bb[0]

# ═══════════════════════════════════════════════════════════
# Gallery 1: Before/After 구독료 비교
# ═══════════════════════════════════════════════════════════
def gallery_1():
    img = Image.new('RGB', (W, H), (250, 248, 244))
    d = ImageDraw.Draw(img)
    # 상단 타이틀
    title = '매달 나가는 돈, 얼마나 될까요?'
    tf = f(64)
    d.text(((W - text_w(title, tf)) // 2, 60), title, font=tf, fill=(30, 30, 30))

    # 좌측 Before (빨강)
    box_y = 200
    box_h = 580
    # Before box
    d.rounded_rectangle([80, box_y, 620, box_y + box_h], radius=30, fill=(252, 235, 230), outline=(220, 80, 80), width=4)
    d.text((80 + 40, box_y + 30), 'BEFORE', font=f(36), fill=(220, 80, 80))
    d.text((80 + 40, box_y + 90), '지금 (아임웹)', font=f(48), fill=(30, 30, 30))
    # 숫자들
    d.text((80 + 40, box_y + 200), '월', font=f(44), fill=(80, 80, 80))
    d.text((80 + 40, box_y + 270), '3~10만원', font=f(90), fill=(220, 60, 60))
    d.text((80 + 40, box_y + 400), '1년: 40~120만원', font=f(40), fill=(60, 60, 60))
    d.text((80 + 40, box_y + 460), '3년: 120~360만원', font=f(40), fill=(60, 60, 60))
    d.text((80 + 40, box_y + 520), '계속 나감', font=f(36), fill=(180, 80, 80))

    # 화살표
    arrow_y = box_y + box_h // 2
    d.polygon([(640, arrow_y - 30), (700, arrow_y), (640, arrow_y + 30)], fill=(40, 160, 120))

    # 우측 After (초록)
    d.rounded_rectangle([720, box_y, W - 80, box_y + box_h], radius=30, fill=(230, 248, 240), outline=(40, 160, 120), width=4)
    d.text((720 + 40, box_y + 30), 'AFTER', font=f(36), fill=(40, 160, 120))
    d.text((720 + 40, box_y + 90), '이사 후 (내 홈페이지)', font=f(44), fill=(30, 30, 30))
    d.text((720 + 40, box_y + 200), '월', font=f(44), fill=(80, 80, 80))
    d.text((720 + 40, box_y + 270), '0원', font=f(130), fill=(40, 160, 120))
    d.text((720 + 40, box_y + 440), '한 번 25~60만원 내고', font=f(36), fill=(60, 60, 60))
    d.text((720 + 40, box_y + 490), '그 후로는 평생 공짜', font=f(40), fill=(40, 160, 120))

    # 하단
    d.text(((W - text_w('1년 안에 본전 뽑고, 2년째부터는 순이익', f(40))) // 2, H - 120), '1년 안에 본전 뽑고, 2년째부터는 순이익', font=f(40), fill=(30, 30, 30))
    d.text(((W - text_w('ONDA 마케팅 · 아임웹 이사 전문', f(28))) // 2, H - 50), 'ONDA 마케팅 · 아임웹 이사 전문', font=f(28), fill=(150, 150, 150))

    out = OUT / 'niche-N01-gallery-1.png'
    img.save(out, optimize=True)
    print(f'  ✓ {out.name}')
    return out

# ═══════════════════════════════════════════════════════════
# Gallery 2: ROI 타임라인 (6~7개월 본전)
# ═══════════════════════════════════════════════════════════
def gallery_2():
    img = Image.new('RGB', (W, H), (250, 248, 244))
    d = ImageDraw.Draw(img)
    # 타이틀
    title = '언제 본전 뽑아요? 계산해드립니다'
    tf = f(60)
    d.text(((W - text_w(title, tf)) // 2, 60), title, font=tf, fill=(30, 30, 30))

    # 상단 subtitle
    sub = '정확히 6~7개월 후 본전. 그 다음부터는 평생 공짜.'
    sf = f(34)
    d.text(((W - text_w(sub, sf)) // 2, 140), sub, font=sf, fill=(80, 80, 80))

    # 2개 케이스
    # Case 1: Pro (월 3.3만)
    c1_y = 240
    d.rounded_rectangle([80, c1_y, W - 80, c1_y + 280], radius=25, fill=(255, 255, 255), outline=(200, 200, 200), width=2)
    d.text((120, c1_y + 30), '아임웹 Pro (월 3.3만원) 쓰시는 분', font=f(40), fill=(30, 30, 30))
    d.text((120, c1_y + 100), 'STANDARD 25만원 한 번 결제', font=f(32), fill=(100, 100, 100))

    # 타임라인 박스
    tl_y = c1_y + 170
    tl_x = 120
    month_w = (W - 240 - 80) // 12
    for m in range(12):
        color = (40, 160, 120) if m < 7 else (70, 200, 160)
        d.rectangle([tl_x + m * month_w, tl_y, tl_x + (m + 1) * month_w - 4, tl_y + 50], fill=color)
    # 7개월 표시
    d.polygon([(tl_x + 7 * month_w - 10, tl_y - 20), (tl_x + 7 * month_w + 10, tl_y - 20), (tl_x + 7 * month_w, tl_y)], fill=(220, 60, 60))
    d.text((tl_x + 7 * month_w - 80, tl_y + 60), '7개월: 본전 ✓', font=f(28), fill=(220, 60, 60))
    d.text((tl_x, tl_y + 60), '0개월', font=f(24), fill=(120, 120, 120))
    d.text((tl_x + 11 * month_w - 40, tl_y + 60), '12개월', font=f(24), fill=(120, 120, 120))

    # Case 2: Biz (월 9.9만)
    c2_y = 580
    d.rounded_rectangle([80, c2_y, W - 80, c2_y + 280], radius=25, fill=(255, 255, 255), outline=(200, 200, 200), width=2)
    d.text((120, c2_y + 30), '아임웹 Biz (월 9.9만원) 쓰시는 분', font=f(40), fill=(30, 30, 30))
    d.text((120, c2_y + 100), 'PREMIUM 60만원 한 번 결제', font=f(32), fill=(100, 100, 100))

    tl_y2 = c2_y + 170
    for m in range(12):
        color = (40, 160, 120) if m < 6 else (70, 200, 160)
        d.rectangle([tl_x + m * month_w, tl_y2, tl_x + (m + 1) * month_w - 4, tl_y2 + 50], fill=color)
    d.polygon([(tl_x + 6 * month_w - 10, tl_y2 - 20), (tl_x + 6 * month_w + 10, tl_y2 - 20), (tl_x + 6 * month_w, tl_y2)], fill=(220, 60, 60))
    d.text((tl_x + 6 * month_w - 80, tl_y2 + 60), '6개월: 본전 ✓', font=f(28), fill=(220, 60, 60))
    d.text((tl_x, tl_y2 + 60), '0개월', font=f(24), fill=(120, 120, 120))
    d.text((tl_x + 11 * month_w - 40, tl_y2 + 60), '12개월', font=f(24), fill=(120, 120, 120))

    # footer
    d.text(((W - text_w('ONDA 마케팅 · 본전 계산 확실합니다', f(28))) // 2, H - 40), 'ONDA 마케팅 · 본전 계산 확실합니다', font=f(28), fill=(150, 150, 150))

    out = OUT / 'niche-N01-gallery-2.png'
    img.save(out, optimize=True)
    print(f'  ✓ {out.name}')
    return out

# ═══════════════════════════════════════════════════════════
# Gallery 3: 이사 7단계 프로세스
# ═══════════════════════════════════════════════════════════
def gallery_3():
    img = Image.new('RGB', (W, H), (250, 248, 244))
    d = ImageDraw.Draw(img)
    # 타이틀
    title = '이사 어떻게 해드려요?'
    tf = f(64)
    d.text(((W - text_w(title, tf)) // 2, 50), title, font=tf, fill=(30, 30, 30))
    sub = '7일~14일, 손님은 끊김 없이 사이트 이용'
    sf = f(32)
    d.text(((W - text_w(sub, sf)) // 2, 130), sub, font=sf, fill=(100, 100, 100))

    steps = [
        ('1', '주소 주세요', '지금 아임웹 홈페이지\n주소 전달'),
        ('2', '범위 정하기', '전체? 중요한 페이지만?\n함께 결정'),
        ('3', '자료 수집', '크몽 안전결제 후\n사장님 글·사진 수집'),
        ('4', '새로 제작', '원하시는 분위기로\n디자인 새 제작'),
        ('5', '미리 보기', '완성본 보여드림\n수정사항 말씀'),
        ('6', '주소 연결', '내 도메인에 연결\n손님 끊김 0분'),
        ('7', '완료 + A/S', '인도 완료\n30일 무상 수리'),
    ]

    # 7단계 3열 2행 (마지막 한 줄은 중앙)
    cols = 4
    box_w = 280
    box_h = 260
    gap_x = 20
    gap_y = 30
    total_w = cols * box_w + (cols - 1) * gap_x
    start_x = (W - total_w) // 2
    start_y = 210

    for i, (num, title_s, desc) in enumerate(steps):
        row = i // cols
        col = i % cols
        # 마지막 행이 4개 미만이면 중앙 정렬
        if row == 1:
            remaining = len(steps) - cols
            row_total_w = remaining * box_w + (remaining - 1) * gap_x
            row_start_x = (W - row_total_w) // 2
            x = row_start_x + col * (box_w + gap_x)
        else:
            x = start_x + col * (box_w + gap_x)
        y = start_y + row * (box_h + gap_y)

        # 박스
        d.rounded_rectangle([x, y, x + box_w, y + box_h], radius=20, fill=(255, 255, 255), outline=(40, 160, 120), width=3)
        # 단계 번호
        nf = f(80)
        d.text((x + 20, y + 15), num, font=nf, fill=(40, 160, 120))
        # 제목
        d.text((x + 20, y + 110), title_s, font=f(32), fill=(30, 30, 30))
        # 설명
        desc_lines = desc.split('\n')
        for di, dl in enumerate(desc_lines):
            d.text((x + 20, y + 160 + di * 35), dl, font=f(24), fill=(100, 100, 100))

    # footer
    d.text(((W - text_w('ONDA 마케팅 · 7일~14일 완성 · 30일 무료 수리', f(28))) // 2, H - 40),
           'ONDA 마케팅 · 7일~14일 완성 · 30일 무료 수리', font=f(28), fill=(150, 150, 150))

    out = OUT / 'niche-N01-gallery-3.png'
    img.save(out, optimize=True)
    print(f'  ✓ {out.name}')
    return out

if __name__ == '__main__':
    gallery_1()
    gallery_2()
    gallery_3()
    print('N01 갤러리 3장 완료')
