#!/usr/bin/env python3
"""
ONDA 홈페이지 제작 서비스 - 인스타그램 홍보 소재 10종
고퀄리티 디자인 (1080x1080)
"""

from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageOps, ImageFilter
import os, math, random

BASE = "/home/onda/projects/onda-hompage"
FONT_DIR = "/home/onda/projects/gotit-instagram/fonts"
IMG_DIR = f"{BASE}/kmong-images"
OUT_DIR = f"{BASE}/insta-posts"
os.makedirs(OUT_DIR, exist_ok=True)

SIZE = 1080

# === Fonts ===
def font(name, size):
    paths = {
        "sans": f"{FONT_DIR}/NotoSansKR-Variable.ttf",
        "serif": f"{FONT_DIR}/NotoSerifKR-Variable.ttf",
        "black": f"{FONT_DIR}/BlackHanSans-Regular.ttf",
        "mont": f"{FONT_DIR}/Montserrat-Variable.ttf",
        "play": f"{FONT_DIR}/PlayfairDisplay-Variable.ttf",
    }
    return ImageFont.truetype(paths[name], size)

# === Load assets ===
PORTFOLIOS = {
    "cafe": Image.open(f"{IMG_DIR}/v3-portfolio/portfolio-cafe-v3.jpg").convert("RGB"),
    "clinic": Image.open(f"{IMG_DIR}/v3-portfolio/portfolio-clinic-v3.jpg").convert("RGB"),
    "nail": Image.open(f"{IMG_DIR}/v3-portfolio/portfolio-nail-v3.jpg").convert("RGB"),
    "pilates": Image.open(f"{IMG_DIR}/v3-portfolio/portfolio-pilates-v3.jpg").convert("RGB"),
    "tax": Image.open(f"{IMG_DIR}/v3-portfolio/portfolio-tax-v3.jpg").convert("RGB"),
}
PORTFOLIOS_V2 = {
    "cafe": Image.open(f"{IMG_DIR}/portfolio/portfolio-cafe-v2.jpg").convert("RGB"),
    "clinic": Image.open(f"{IMG_DIR}/portfolio/portfolio-clinic-v2.jpg").convert("RGB"),
    "nail": Image.open(f"{IMG_DIR}/portfolio/portfolio-nail-v2.jpg").convert("RGB"),
    "pilates": Image.open(f"{IMG_DIR}/portfolio/portfolio-pilates-v2.jpg").convert("RGB"),
    "tax": Image.open(f"{IMG_DIR}/portfolio/portfolio-tax-v2.jpg").convert("RGB"),
}
LOGO = Image.open(f"{BASE}/onda_logo.jpg").convert("RGBA")

# === Colors ===
C = {
    "bg_dark": (18, 18, 22),
    "bg_deep": (12, 12, 16),
    "white": (255, 255, 255),
    "off_white": (245, 245, 248),
    "accent": (0, 200, 150),       # 온다 그린
    "accent2": (0, 230, 170),
    "accent_dark": (0, 160, 120),
    "gold": (255, 200, 60),
    "coral": (255, 100, 80),
    "blue": (60, 120, 255),
    "purple": (130, 80, 255),
    "charcoal": (40, 40, 45),
    "gray": (120, 120, 130),
    "light_gray": (180, 180, 190),
    "dark_gray": (60, 60, 68),
    "cream": (250, 248, 242),
    "mint_bg": (240, 255, 250),
}

# === Helpers ===
def new_canvas(color=(255,255,255)):
    return Image.new("RGB", (SIZE, SIZE), color)

def fit_cover(img, tw, th):
    ratio = img.width / img.height
    tr = tw / th
    if ratio > tr:
        nh = th; nw = int(nh * ratio)
    else:
        nw = tw; nh = int(nw / ratio)
    img = img.resize((nw, nh), Image.LANCZOS)
    l = (nw - tw)//2; t = (nh - th)//2
    return img.crop((l, t, l+tw, t+th))

def text_size(draw, text, fnt):
    bb = draw.textbbox((0,0), text, font=fnt)
    return bb[2]-bb[0], bb[3]-bb[1]

def draw_center(draw, y, text, fnt, fill):
    tw, th = text_size(draw, text, fnt)
    draw.text(((SIZE-tw)//2, y), text, font=fnt, fill=fill)
    return th

def draw_line(draw, x0, y0, x1, y1, fill, width=2):
    draw.line([(x0,y0),(x1,y1)], fill=fill, width=width)

def add_logo(canvas, x, y, size=80):
    logo = LOGO.copy().resize((size, size), Image.LANCZOS)
    if canvas.mode == "RGB":
        canvas = canvas.convert("RGBA")
        canvas.paste(logo, (x, y), logo)
        return canvas.convert("RGB")
    canvas.paste(logo, (x, y), logo)
    return canvas

def gradient_bg(canvas, c1, c2):
    draw = ImageDraw.Draw(canvas)
    for y in range(SIZE):
        r = y / SIZE
        cr = int(c1[0]*(1-r) + c2[0]*r)
        cg = int(c1[1]*(1-r) + c2[1]*r)
        cb = int(c1[2]*(1-r) + c2[2]*r)
        draw.rectangle([0,y,SIZE,y+1], fill=(cr,cg,cb))
    return canvas

def draw_pill(draw, cx, cy, text, fnt, bg, fg, px=28, py=10):
    tw, th = text_size(draw, text, fnt)
    x0=cx-tw//2-px; y0=cy-th//2-py; x1=cx+tw//2+px; y1=cy+th//2+py
    draw.rounded_rectangle([x0,y0,x1,y1], radius=(y1-y0)//2, fill=bg)
    draw.text((cx-tw//2, cy-th//2), text, font=fnt, fill=fg)

def mockup_screen(canvas, img, x, y, w, h, radius=16, shadow=True):
    """포트폴리오를 목업 스크린으로 배치"""
    draw = ImageDraw.Draw(canvas)
    if shadow:
        # 그림자
        for s in range(20, 0, -2):
            alpha = 8
            draw.rounded_rectangle([x-s+5, y-s+8, x+w+s+5, y+h+s+8],
                                   radius=radius+s, fill=(0,0,0))
    # 스크린 프레임
    draw.rounded_rectangle([x-3, y-3, x+w+3, y+h+3], radius=radius+3, fill=(50,50,55))
    # 이미지
    resized = fit_cover(img, w, h)
    # 라운드 마스크
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, w, h], radius=radius, fill=255)
    canvas.paste(resized, (x, y), mask)
    return canvas


# ===================================================================
# POST 01 - 히어로: "당신의 사업, 이렇게 바뀝니다"
# ===================================================================
def post_01():
    canvas = new_canvas()
    gradient_bg(canvas, (12,12,18), (25,30,40))
    draw = ImageDraw.Draw(canvas)

    # 상단 라벨
    draw_pill(draw, SIZE//2, 55, "ONDA MARKETING", font("mont", 16), C["accent"], C["bg_dark"])

    # 메인 타이틀
    draw_center(draw, 95, "당신의 사업,", font("black", 72), C["white"])
    draw_center(draw, 180, "이렇게 바뀝니다", font("black", 72), C["accent"])

    # 포트폴리오 3개 목업
    screens = [
        (PORTFOLIOS["cafe"], 40, 310, 320, 400),
        (PORTFOLIOS["clinic"], 380, 290, 340, 420),
        (PORTFOLIOS["nail"], 720, 310, 320, 400),
    ]
    for img, x, y, w, h in screens:
        canvas = mockup_screen(canvas, img, x, y, w, h, radius=12)

    draw = ImageDraw.Draw(canvas)

    # 하단 정보
    draw_center(draw, 760, "카페 · 병원 · 네일 · 필라테스 · 세무사", font("sans", 22), C["light_gray"])
    draw_center(draw, 810, "업종별 맞춤 반응형 홈페이지", font("black", 36), C["white"])

    # 가격 태그
    draw_pill(draw, SIZE//2, 890, "15만원부터", font("black", 28), C["accent"], C["bg_dark"], px=40, py=14)

    # 하단
    draw_center(draw, 950, "84개 포트폴리오 · 평균 5일 제작 · CMS 포함", font("sans", 16), C["gray"])

    canvas = add_logo(canvas, SIZE-100, 20, 70)
    return canvas


# ===================================================================
# POST 02 - 포트폴리오 그리드 (6개 업종)
# ===================================================================
def post_02():
    canvas = new_canvas()
    gradient_bg(canvas, (18,18,24), (10,10,14))
    draw = ImageDraw.Draw(canvas)

    # 상단
    draw_center(draw, 30, "PORTFOLIO", font("mont", 20), C["accent"])
    draw_line(draw, SIZE//2-60, 65, SIZE//2+60, 65, C["accent"], 2)
    draw_center(draw, 80, "84개 실제 제작 사례", font("black", 48), C["white"])

    # 2x3 그리드
    gap = 16
    cols, rows = 3, 2
    cell_w = (SIZE - gap*(cols+1)) // cols
    cell_h = (560) // rows

    all_imgs = list(PORTFOLIOS.values()) + [list(PORTFOLIOS_V2.values())[0]]
    labels = ["카페", "병원", "네일샵", "필라테스", "세무사", "기업"]

    for i in range(6):
        col = i % cols
        row = i // cols
        x = gap + col * (cell_w + gap)
        y = 170 + row * (cell_h + gap)
        img = all_imgs[i % len(all_imgs)]
        canvas = mockup_screen(canvas, img, x, y, cell_w, cell_h, radius=10, shadow=False)
        draw = ImageDraw.Draw(canvas)
        # 라벨
        lw, _ = text_size(draw, labels[i], font("sans", 16))
        draw.rounded_rectangle([x+cell_w//2-lw//2-12, y+cell_h-35, x+cell_w//2+lw//2+12, y+cell_h-5],
                               radius=12, fill=(0,0,0,180))
        draw.text((x+cell_w//2-lw//2, y+cell_h-33), labels[i], font=font("sans", 16), fill=C["white"])

    draw = ImageDraw.Draw(canvas)

    # 하단
    draw_center(draw, 770, "그 외 78개 업종 제작 가능", font("sans", 22), C["light_gray"])

    # 업종 태그
    tags = ["부동산", "음식점", "헬스장", "법률사무소", "학원", "인테리어", "펫샵"]
    tag_y = 830
    start_x = 60
    for i, tag in enumerate(tags):
        tw, _ = text_size(draw, tag, font("sans", 18))
        draw.rounded_rectangle([start_x, tag_y, start_x+tw+24, tag_y+36], radius=18, outline=C["accent"], width=1)
        draw.text((start_x+12, tag_y+5), tag, font=font("sans", 18), fill=C["accent"])
        start_x += tw + 40

    # CTA
    draw_pill(draw, SIZE//2, 930, "포트폴리오 더 보기 →", font("sans", 20), C["accent"], C["bg_dark"], px=36, py=12)

    canvas = add_logo(canvas, SIZE-100, 20, 70)
    return canvas


# ===================================================================
# POST 03 - "코딩 없이 직접 수정" CMS 기능 강조
# ===================================================================
def post_03():
    canvas = new_canvas()
    gradient_bg(canvas, (8,8,12), (20,25,35))
    draw = ImageDraw.Draw(canvas)

    # 상단
    draw_pill(draw, SIZE//2, 50, "CMS 기능 포함", font("mont", 14), C["accent"], C["bg_dark"])

    draw_center(draw, 90, "코딩 없이", font("black", 80), C["white"])
    draw_center(draw, 185, "직접 수정", font("black", 80), C["accent"])

    # 목업 스크린 (큰 것 하나)
    canvas = mockup_screen(canvas, PORTFOLIOS["pilates"], 100, 310, SIZE-200, 420, radius=14)
    draw = ImageDraw.Draw(canvas)

    # CMS 편집 포인트 표시 (점선 원 + 라벨)
    edit_points = [
        (220, 420, "텍스트 수정"),
        (540, 380, "이미지 교체"),
        (750, 520, "색상 변경"),
    ]
    for px, py, label in edit_points:
        # 글로우 원
        for r in range(24, 18, -1):
            draw.ellipse([px-r, py-r, px+r, py+r], outline=C["accent"])
        draw.ellipse([px-6, py-6, px+6, py+6], fill=C["accent"])
        # 라벨
        lw, _ = text_size(draw, label, font("sans", 16))
        draw.rounded_rectangle([px-lw//2-10, py+28, px+lw//2+10, py+56], radius=10, fill=C["accent"])
        draw.text((px-lw//2, py+30), label, font=font("sans", 16), fill=C["bg_dark"])

    # 하단 설명
    draw_center(draw, 770, "글자 · 사진 · 색상 · 레이아웃", font("black", 32), C["white"])
    draw_center(draw, 820, "클릭 한 번으로 직접 수정하세요", font("sans", 24), C["light_gray"])

    # 하단 장점
    features = ["✓ 코딩 불필요", "✓ 실시간 반영", "✓ 무제한 수정"]
    fx = 140
    for feat in features:
        draw.text((fx, 890), feat, font=font("sans", 20), fill=C["accent"])
        fx += 300

    canvas = add_logo(canvas, SIZE-100, 20, 70)
    return canvas


# ===================================================================
# POST 04 - 가격표 카드
# ===================================================================
def post_04():
    canvas = new_canvas()
    gradient_bg(canvas, (12,12,16), (22,22,28))
    draw = ImageDraw.Draw(canvas)

    # 상단
    draw_center(draw, 30, "PRICING", font("mont", 18), C["accent"])
    draw_center(draw, 65, "합리적인 가격", font("black", 52), C["white"])
    draw_center(draw, 130, "투명한 견적", font("black", 52), C["accent"])

    # 3개 가격 카드
    cards = [
        ("BASIC", "15만원~", "원페이지", ["반응형 디자인", "모바일 최적화", "CMS 기본", "1회 수정"], False),
        ("STANDARD", "35만원~", "5페이지", ["반응형 디자인", "CMS 전체 기능", "SEO 최적화", "문의폼/지도", "2회 수정"], True),
        ("PREMIUM", "70만원~", "10페이지+", ["반응형 디자인", "CMS + 위젯", "SEO + 분석", "다국어 지원", "1개월 유지보수"], False),
    ]

    card_w = 310
    card_gap = 24
    start_x = (SIZE - card_w*3 - card_gap*2) // 2

    for i, (tier, price, pages, features, highlight) in enumerate(cards):
        x = start_x + i * (card_w + card_gap)
        y = 210
        h = 700

        # 카드 배경
        bg = C["charcoal"] if not highlight else (0, 50, 40)
        outline = (60,60,68) if not highlight else C["accent"]
        draw.rounded_rectangle([x, y, x+card_w, y+h], radius=16, fill=bg, outline=outline, width=2)

        if highlight:
            # BEST 태그
            draw.rounded_rectangle([x+card_w//2-40, y-14, x+card_w//2+40, y+14], radius=14, fill=C["accent"])
            draw.text((x+card_w//2-22, y-12), "BEST", font=font("mont", 16), fill=C["bg_dark"])

        # 티어명
        tw, _ = text_size(draw, tier, font("mont", 20))
        draw.text((x+(card_w-tw)//2, y+30), tier, font=font("mont", 20),
                  fill=C["accent"] if highlight else C["light_gray"])

        # 가격
        pw, _ = text_size(draw, price, font("black", 44))
        draw.text((x+(card_w-pw)//2, y+65), price, font=font("black", 44),
                  fill=C["white"])

        # 페이지
        pgw, _ = text_size(draw, pages, font("sans", 18))
        draw.text((x+(card_w-pgw)//2, y+125), pages, font=font("sans", 18), fill=C["gray"])

        # 구분선
        draw_line(draw, x+30, y+165, x+card_w-30, y+165, (80,80,88) if not highlight else C["accent_dark"], 1)

        # 피처 리스트
        fy = y + 190
        for feat in features:
            check_color = C["accent"] if highlight else C["light_gray"]
            draw.text((x+35, fy), "✓", font=font("sans", 18), fill=check_color)
            draw.text((x+65, fy), feat, font=font("sans", 18), fill=C["white"] if highlight else C["light_gray"])
            fy += 40

    # 하단
    draw_center(draw, 950, "부가세 별도 · 맞춤 견적 가능 · 급행 추가 15만원", font("sans", 16), C["gray"])

    canvas = add_logo(canvas, SIZE-100, 20, 70)
    return canvas


# ===================================================================
# POST 05 - 제작 프로세스 타임라인
# ===================================================================
def post_05():
    canvas = new_canvas()
    gradient_bg(canvas, (15,15,20), (8,8,12))
    draw = ImageDraw.Draw(canvas)

    draw_center(draw, 30, "PROCESS", font("mont", 18), C["accent"])
    draw_center(draw, 65, "5일이면 완성", font("black", 60), C["white"])
    draw_center(draw, 140, "심플한 제작 과정", font("sans", 26), C["light_gray"])

    # 5단계 타임라인
    steps = [
        ("01", "상담", "D+0", "요구사항 파악\n업종/스타일 논의"),
        ("02", "기획", "D+1", "레이아웃 설계\n콘텐츠 구성"),
        ("03", "디자인", "D+2~3", "시안 제작\n피드백 반영"),
        ("04", "개발", "D+3~4", "코딩 + CMS\n반응형 적용"),
        ("05", "납품", "D+5", "최종 검수\n도메인 연결"),
    ]

    line_x = 160
    start_y = 220
    step_gap = 145

    for i, (num, title, day, desc) in enumerate(steps):
        y = start_y + i * step_gap

        # 타임라인 세로선
        if i < len(steps) - 1:
            draw_line(draw, line_x, y+40, line_x, y+step_gap, (60,60,68), 2)

        # 원형 번호
        draw.ellipse([line_x-22, y-2, line_x+22, y+42], fill=C["accent"])
        nw, _ = text_size(draw, num, font("mont", 20))
        draw.text((line_x-nw//2, y+5), num, font=font("mont", 20), fill=C["bg_dark"])

        # 타이틀 + 날짜
        draw.text((line_x+50, y), title, font=font("black", 34), fill=C["white"])
        dw, _ = text_size(draw, day, font("mont", 16))
        draw.rounded_rectangle([line_x+50+200, y+5, line_x+50+200+dw+20, y+33], radius=12, fill=C["charcoal"])
        draw.text((line_x+50+210, y+7), day, font=font("mont", 16), fill=C["accent"])

        # 설명
        draw.text((line_x+50, y+42), desc, font=font("sans", 16), fill=C["gray"], spacing=6)

    # 하단 CTA
    draw_pill(draw, SIZE//2, 980, "무료 상담 시작하기 →", font("black", 24), C["accent"], C["bg_dark"], px=40, py=14)

    canvas = add_logo(canvas, SIZE-100, 20, 70)
    return canvas


# ===================================================================
# POST 06 - 반응형 강조 (PC + 모바일 목업)
# ===================================================================
def post_06():
    canvas = new_canvas()
    gradient_bg(canvas, (10,10,16), (18,22,30))
    draw = ImageDraw.Draw(canvas)

    draw_pill(draw, SIZE//2, 50, "RESPONSIVE DESIGN", font("mont", 14), C["accent"], C["bg_dark"])
    draw_center(draw, 90, "PC에서도 모바일에서도", font("black", 50), C["white"])
    draw_center(draw, 155, "완벽하게", font("black", 70), C["accent"])

    # PC 목업 (큰 것)
    canvas = mockup_screen(canvas, PORTFOLIOS["cafe"], 60, 280, 620, 440, radius=12)
    draw = ImageDraw.Draw(canvas)

    # PC 라벨
    draw.rounded_rectangle([80, 290, 170, 320], radius=10, fill=C["accent"])
    draw.text((92, 293), "PC", font=font("mont", 18), fill=C["bg_dark"])

    # 모바일 목업 (작은 것, 오른쪽 겹치게)
    phone_w, phone_h = 240, 440
    phone_x, phone_y = 740, 320

    # 폰 프레임
    draw.rounded_rectangle([phone_x-6, phone_y-6, phone_x+phone_w+6, phone_y+phone_h+6],
                           radius=24, fill=(50,50,55))
    # 상단 노치
    draw.rounded_rectangle([phone_x+phone_w//2-30, phone_y-2, phone_x+phone_w//2+30, phone_y+6],
                           radius=4, fill=(30,30,35))
    # 스크린
    img = fit_cover(PORTFOLIOS["cafe"], phone_w, phone_h)
    mask = Image.new("L", (phone_w, phone_h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0,0,phone_w,phone_h], radius=20, fill=255)
    canvas.paste(img, (phone_x, phone_y), mask)

    draw = ImageDraw.Draw(canvas)
    # 모바일 라벨
    draw.rounded_rectangle([phone_x+10, phone_y+10, phone_x+110, phone_y+40], radius=10, fill=C["accent"])
    draw.text((phone_x+18, phone_y+13), "Mobile", font=font("mont", 16), fill=C["bg_dark"])

    # 하단
    draw_center(draw, 800, "모든 기기에서 최적화된 경험", font("sans", 24), C["light_gray"])

    features = ["✓ 자동 레이아웃 조정", "✓ 터치 최적화", "✓ 빠른 로딩 속도"]
    fx = 120
    for f in features:
        draw.text((fx, 860), f, font=font("sans", 20), fill=C["accent"])
        fx += 310

    draw_center(draw, 940, "구글 모바일 우선 인덱싱 대응", font("sans", 18), C["gray"])

    canvas = add_logo(canvas, SIZE-100, 20, 70)
    return canvas


# ===================================================================
# POST 07 - 숫자로 증명 (통계)
# ===================================================================
def post_07():
    canvas = new_canvas()
    gradient_bg(canvas, (10,15,12), (18,18,22))
    draw = ImageDraw.Draw(canvas)

    draw_center(draw, 40, "WHY ONDA?", font("mont", 20), C["accent"])
    draw_center(draw, 80, "숫자로 증명합니다", font("black", 56), C["white"])

    # 4개 큰 숫자 카드 (2x2)
    stats = [
        ("84+", "제작 사례", "다양한 업종"),
        ("5일", "평균 납기", "빠른 제작"),
        ("100%", "반응형", "모든 기기"),
        ("4.9", "만족도", "크몽 평점"),
    ]

    card_w, card_h = 460, 300
    gap = 24
    sx = (SIZE - card_w*2 - gap) // 2
    sy = 190

    for i, (num, label, sub) in enumerate(stats):
        col = i % 2
        row = i // 2
        x = sx + col * (card_w + gap)
        y = sy + row * (card_h + gap)

        draw.rounded_rectangle([x, y, x+card_w, y+card_h], radius=16, fill=C["charcoal"])
        draw.rounded_rectangle([x, y, x+card_w, y+card_h], radius=16, outline=(60,60,68), width=1)

        # 큰 숫자
        nw, nh = text_size(draw, num, font("mont", 90))
        draw.text((x+(card_w-nw)//2, y+30), num, font=font("mont", 90), fill=C["accent"])

        # 라벨
        lw, _ = text_size(draw, label, font("black", 32))
        draw.text((x+(card_w-lw)//2, y+160), label, font=font("black", 32), fill=C["white"])

        # 서브
        sw, _ = text_size(draw, sub, font("sans", 18))
        draw.text((x+(card_w-sw)//2, y+210), sub, font=font("sans", 18), fill=C["gray"])

    # 하단
    draw_center(draw, 850, "온다마케팅과 함께한 사장님들의 결과", font("sans", 22), C["light_gray"])
    draw_pill(draw, SIZE//2, 930, "무료 상담 →", font("black", 24), C["accent"], C["bg_dark"], px=40, py=14)

    canvas = add_logo(canvas, SIZE-100, 20, 70)
    return canvas


# ===================================================================
# POST 08 - 고객 후기 스타일
# ===================================================================
def post_08():
    canvas = new_canvas()
    gradient_bg(canvas, (14,14,18), (8,8,12))
    draw = ImageDraw.Draw(canvas)

    draw_center(draw, 30, "REVIEW", font("mont", 18), C["accent"])
    draw_center(draw, 65, "사장님들의 실제 후기", font("black", 48), C["white"])

    # 리뷰 카드 3개
    reviews = [
        ("카페 사장님", "★★★★★", "디자인이 정말 마음에 들어요.\n모바일에서도 완벽하고,\n직접 수정도 쉬워서 만족합니다."),
        ("필라테스 원장님", "★★★★★", "5일만에 딱 원하는 사이트가\n나왔어요. CMS 덕분에\n수정비용 0원이에요."),
        ("세무사님", "★★★★★", "전문적인 느낌이 확 나면서도\n깔끔해요. 상담 문의가\n2배로 늘었습니다."),
    ]

    card_w = SIZE - 120
    card_h = 200
    sy = 160

    for i, (who, stars, review) in enumerate(reviews):
        y = sy + i * (card_h + 24)
        draw.rounded_rectangle([60, y, 60+card_w, y+card_h], radius=14, fill=C["charcoal"])

        # 프로필 원
        cx_circle = 120
        draw.ellipse([cx_circle-24, y+25, cx_circle+24, y+73], fill=C["accent_dark"])
        iw, _ = text_size(draw, who[0], font("sans", 26))
        draw.text((cx_circle-iw//2, y+30), who[0], font=font("sans", 26), fill=C["white"])

        # 이름 + 별점
        draw.text((160, y+25), who, font=font("black", 22), fill=C["white"])
        draw.text((160, y+55), stars, font=font("sans", 20), fill=C["gold"])

        # 리뷰 텍스트
        draw.text((160, y+90), review, font=font("sans", 18), fill=C["light_gray"], spacing=8)

    # 하단
    draw_center(draw, 850, "크몽 평점 4.9 · 재주문률 40%", font("sans", 20), C["accent"])
    draw_pill(draw, SIZE//2, 930, "후기 더 보기 →", font("sans", 20), C["accent"], C["bg_dark"], px=36, py=12)

    canvas = add_logo(canvas, SIZE-100, 20, 70)
    return canvas


# ===================================================================
# POST 09 - 업종별 맞춤 (아이콘 + 포트폴리오)
# ===================================================================
def post_09():
    canvas = new_canvas()
    gradient_bg(canvas, (12,12,16), (20,20,26))
    draw = ImageDraw.Draw(canvas)

    draw_center(draw, 30, "INDUSTRY", font("mont", 18), C["accent"])
    draw_center(draw, 70, "어떤 업종이든", font("black", 60), C["white"])
    draw_center(draw, 145, "맞춤 제작", font("black", 60), C["accent"])

    # 업종 리스트 + 아이콘 (2열)
    industries = [
        ("☕", "카페 · 음식점", PORTFOLIOS["cafe"]),
        ("🏥", "병원 · 클리닉", PORTFOLIOS["clinic"]),
        ("💅", "뷰티 · 네일", PORTFOLIOS["nail"]),
        ("🏋️", "피트니스 · 요가", PORTFOLIOS["pilates"]),
        ("📊", "세무 · 법률", PORTFOLIOS["tax"]),
        ("🏠", "부동산 · 인테리어", PORTFOLIOS_V2["cafe"]),
    ]

    row_h = 100
    sy = 260

    for i, (icon, name, img) in enumerate(industries):
        y = sy + i * row_h

        # 배경 바
        draw.rounded_rectangle([50, y, SIZE-50, y+80], radius=12, fill=C["charcoal"])

        # 아이콘
        draw.text((80, y+15), icon, font=font("sans", 36), fill=C["white"])

        # 업종명
        draw.text((140, y+22), name, font=font("black", 28), fill=C["white"])

        # 미니 포트폴리오 미리보기
        mini = fit_cover(img, 120, 64)
        mmask = Image.new("L", (120, 64), 0)
        mmd = ImageDraw.Draw(mmask)
        mmd.rounded_rectangle([0,0,120,64], radius=8, fill=255)
        canvas.paste(mini, (SIZE-200, y+8), mmask)

        draw = ImageDraw.Draw(canvas)

    # 하단
    draw_center(draw, 880, "그 외 학원 · 펫샵 · 농장 · 펜션 등", font("sans", 20), C["light_gray"])
    draw_center(draw, 920, "모든 업종 맞춤 제작 가능", font("sans", 20), C["accent"])

    draw_pill(draw, SIZE//2, 990, "내 업종 상담 →", font("black", 22), C["accent"], C["bg_dark"], px=36, py=12)

    canvas = add_logo(canvas, SIZE-100, 20, 70)
    return canvas


# ===================================================================
# POST 10 - CTA 최종 (왜 온다인가)
# ===================================================================
def post_10():
    canvas = new_canvas()
    gradient_bg(canvas, (0,40,30), (10,10,14))
    draw = ImageDraw.Draw(canvas)

    # 큰 체크마크 배경
    draw_center(draw, 30, "CHECK LIST", font("mont", 18), C["accent2"])

    draw_center(draw, 80, "홈페이지 제작", font("black", 56), C["white"])
    draw_center(draw, 150, "이것만 확인하세요", font("black", 56), C["accent2"])

    # 체크리스트
    checks = [
        ("반응형 디자인", "PC · 태블릿 · 모바일 완벽 대응"),
        ("CMS 수정 기능", "코딩 없이 직접 텍스트/이미지 수정"),
        ("SEO 최적화", "네이버 · 구글 검색 상위 노출"),
        ("빠른 납기", "상담부터 납품까지 평균 5일"),
        ("합리적 가격", "15만원부터 시작, 추가비용 없음"),
        ("유지보수", "납품 후에도 지속적인 지원"),
    ]

    sy = 250
    for i, (title, desc) in enumerate(checks):
        y = sy + i * 90

        # 체크 아이콘
        draw.ellipse([70, y+5, 110, y+45], fill=C["accent"])
        cw, _ = text_size(draw, "✓", font("mont", 22))
        draw.text((90-cw//2, y+8), "✓", font=font("mont", 22), fill=C["bg_dark"])

        # 텍스트
        draw.text((130, y+2), title, font=font("black", 28), fill=C["white"])
        draw.text((130, y+38), desc, font=font("sans", 18), fill=C["gray"])

    # 하단 CTA 큰 버튼
    btn_y = 830
    draw.rounded_rectangle([120, btn_y, SIZE-120, btn_y+80], radius=40, fill=C["accent"])
    draw_center(draw, btn_y+15, "무료 상담 시작하기", font("black", 34), C["bg_dark"])

    draw_center(draw, 940, "카카오톡 · 크몽 · 전화 상담 가능", font("sans", 18), C["light_gray"])
    draw_center(draw, 975, "ondamarketing.com", font("mont", 16), C["accent"])

    canvas = add_logo(canvas, SIZE//2-40, btn_y+100, 60)
    return canvas


# ===================================================================
# Generate
# ===================================================================
generators = [
    (post_01, "01_hero_showcase"),
    (post_02, "02_portfolio_grid"),
    (post_03, "03_cms_feature"),
    (post_04, "04_pricing_card"),
    (post_05, "05_process_timeline"),
    (post_06, "06_responsive"),
    (post_07, "07_stats"),
    (post_08, "08_reviews"),
    (post_09, "09_industry"),
    (post_10, "10_cta_checklist"),
]

print("=" * 50)
print("ONDA 홈페이지 제작 홍보 소재 10종 생성")
print("=" * 50)

for i, (gen, name) in enumerate(generators):
    print(f"\n[{i+1:2d}/10] {name} 생성 중...")
    try:
        img = gen()
        path = f"{OUT_DIR}/{name}.png"
        img.save(path, "PNG", quality=100)
        print(f"  ✓ 저장: {path}")
    except Exception as e:
        print(f"  ✗ 에러: {e}")
        import traceback
        traceback.print_exc()

print(f"\n{'='*50}")
print(f"완료! → {OUT_DIR}/")
print(f"{'='*50}")
