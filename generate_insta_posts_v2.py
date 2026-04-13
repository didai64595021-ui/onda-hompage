#!/usr/bin/env python3
"""
ONDA 홈페이지 제작 서비스 - 인스타그램 홍보 소재 10종 v2
수정: 이모지 제거, 볼드 강화, 로고 제거, 한글 폰트 통일
"""

from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageOps, ImageFilter
import os, math

BASE = "/home/onda/projects/onda-hompage"
FONT_DIR = "/home/onda/projects/gotit-instagram/fonts"
IMG_DIR = f"{BASE}/kmong-images"
OUT_DIR = f"{BASE}/insta-posts"
os.makedirs(OUT_DIR, exist_ok=True)

SIZE = 1080

def font(name, size):
    paths = {
        "sans": f"{FONT_DIR}/NotoSansKR-Variable.ttf",
        "serif": f"{FONT_DIR}/NotoSerifKR-Variable.ttf",
        "black": f"{FONT_DIR}/BlackHanSans-Regular.ttf",
        "mont": f"{FONT_DIR}/Montserrat-Variable.ttf",
        "play": f"{FONT_DIR}/PlayfairDisplay-Variable.ttf",
    }
    return ImageFont.truetype(paths[name], size)

# Load assets
PF = {
    "cafe": Image.open(f"{IMG_DIR}/v3-portfolio/portfolio-cafe-v3.jpg").convert("RGB"),
    "clinic": Image.open(f"{IMG_DIR}/v3-portfolio/portfolio-clinic-v3.jpg").convert("RGB"),
    "nail": Image.open(f"{IMG_DIR}/v3-portfolio/portfolio-nail-v3.jpg").convert("RGB"),
    "pilates": Image.open(f"{IMG_DIR}/v3-portfolio/portfolio-pilates-v3.jpg").convert("RGB"),
    "tax": Image.open(f"{IMG_DIR}/v3-portfolio/portfolio-tax-v3.jpg").convert("RGB"),
}
PF2 = {
    "cafe": Image.open(f"{IMG_DIR}/portfolio/portfolio-cafe-v2.jpg").convert("RGB"),
    "clinic": Image.open(f"{IMG_DIR}/portfolio/portfolio-clinic-v2.jpg").convert("RGB"),
    "nail": Image.open(f"{IMG_DIR}/portfolio/portfolio-nail-v2.jpg").convert("RGB"),
    "pilates": Image.open(f"{IMG_DIR}/portfolio/portfolio-pilates-v2.jpg").convert("RGB"),
    "tax": Image.open(f"{IMG_DIR}/portfolio/portfolio-tax-v2.jpg").convert("RGB"),
}

# Colors
A = (0, 200, 150)  # accent green
A2 = (0, 230, 170)
W = (255, 255, 255)
BG = (14, 14, 18)
BG2 = (24, 24, 30)
CH = (40, 40, 48)
GR = (130, 130, 140)
LG = (190, 190, 200)
GD = (255, 200, 60)

def new_canvas(c=BG):
    return Image.new("RGB", (SIZE, SIZE), c)

def fit_cover(img, tw, th):
    r = img.width / img.height
    tr = tw / th
    if r > tr: nh=th; nw=int(nh*r)
    else: nw=tw; nh=int(nw/r)
    img = img.resize((nw, nh), Image.LANCZOS)
    l=(nw-tw)//2; t=(nh-th)//2
    return img.crop((l,t,l+tw,t+th))

def tsz(draw, text, fnt):
    bb = draw.textbbox((0,0), text, font=fnt)
    return bb[2]-bb[0], bb[3]-bb[1]

def ctext(draw, y, text, fnt, fill):
    tw,th = tsz(draw, text, fnt)
    draw.text(((SIZE-tw)//2, y), text, font=fnt, fill=fill)
    return th

def grad(canvas, c1, c2):
    d = ImageDraw.Draw(canvas)
    for y in range(SIZE):
        r = y/SIZE
        d.rectangle([0,y,SIZE,y+1], fill=(
            int(c1[0]*(1-r)+c2[0]*r),
            int(c1[1]*(1-r)+c2[1]*r),
            int(c1[2]*(1-r)+c2[2]*r)))

def pill(draw, cx, cy, text, fnt, bg, fg, px=28, py=10):
    tw,th = tsz(draw, text, fnt)
    x0=cx-tw//2-px; y0=cy-th//2-py; x1=cx+tw//2+px; y1=cy+th//2+py
    draw.rounded_rectangle([x0,y0,x1,y1], radius=(y1-y0)//2, fill=bg)
    draw.text((cx-tw//2, cy-th//2), text, font=fnt, fill=fg)

def mockup(canvas, img, x, y, w, h, rad=12):
    d = ImageDraw.Draw(canvas)
    # 그림자
    for s in range(15, 0, -3):
        d.rounded_rectangle([x-s+4, y-s+6, x+w+s+4, y+h+s+6], radius=rad+s, fill=(0,0,0))
    # 프레임
    d.rounded_rectangle([x-3, y-3, x+w+3, y+h+3], radius=rad+3, fill=(55,55,60))
    resized = fit_cover(img, w, h)
    mask = Image.new("L", (w,h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,w,h], radius=rad, fill=255)
    canvas.paste(resized, (x,y), mask)
    return canvas


# ===================================================================
# 01 - 히어로: 포트폴리오 3종 쇼케이스
# ===================================================================
def post_01():
    c = new_canvas(); grad(c, (10,10,16), (22,26,36))
    d = ImageDraw.Draw(c)
    pill(d, SIZE//2, 50, "HOMEPAGE", font("mont", 18), A, BG)
    ctext(d, 90, "당신의 사업,", font("black", 76), W)
    ctext(d, 180, "이렇게 바뀝니다", font("black", 76), A)
    c = mockup(c, PF["cafe"], 40, 310, 310, 380)
    c = mockup(c, PF["clinic"], 380, 290, 330, 400)
    c = mockup(c, PF["nail"], 730, 310, 310, 380)
    d = ImageDraw.Draw(c)
    ctext(d, 740, "카페 / 병원 / 네일 / 필라테스 / 세무사", font("black", 26), LG)
    ctext(d, 790, "업종별 맞춤 반응형 홈페이지", font("black", 40), W)
    pill(d, SIZE//2, 875, "15만원부터", font("black", 30), A, BG, px=44, py=16)
    ctext(d, 940, "84개 포트폴리오 / 평균 5일 제작 / CMS 포함", font("black", 20), GR)
    return c

# ===================================================================
# 02 - 포트폴리오 6종 그리드
# ===================================================================
def post_02():
    c = new_canvas(); grad(c, (16,16,22), (8,8,12))
    d = ImageDraw.Draw(c)
    ctext(d, 25, "PORTFOLIO", font("mont", 22), A)
    d.line([(SIZE//2-60,60),(SIZE//2+60,60)], fill=A, width=2)
    ctext(d, 75, "84개 실제 제작 사례", font("black", 52), W)

    imgs = [PF["cafe"], PF["clinic"], PF["nail"], PF["pilates"], PF["tax"], PF2["cafe"]]
    labels = ["카페", "병원", "네일샵", "필라테스", "세무사", "기업"]
    gap=14; cw=(SIZE-gap*4)//3; ch=250
    for i in range(6):
        col=i%3; row=i//3
        x=gap+col*(cw+gap); y=165+row*(ch+gap+40)
        c = mockup(c, imgs[i], x, y, cw, ch, rad=10)
        d = ImageDraw.Draw(c)
        lw,_ = tsz(d, labels[i], font("black", 20))
        d.text((x+(cw-lw)//2, y+ch+8), labels[i], font=font("black", 20), fill=LG)

    d = ImageDraw.Draw(c)
    ctext(d, 800, "그 외 78개 업종 제작 가능", font("black", 26), LG)
    tags = ["부동산", "음식점", "헬스장", "법률", "학원", "인테리어", "펫샵"]
    sx = 55
    for tag in tags:
        tw,_ = tsz(d, tag, font("black", 18))
        d.rounded_rectangle([sx, 860, sx+tw+24, 860+36], radius=18, outline=A, width=2)
        d.text((sx+12, 860+5), tag, font=font("black", 18), fill=A)
        sx += tw + 38
    pill(d, SIZE//2, 950, "포트폴리오 더 보기", font("black", 22), A, BG, px=36, py=12)
    return c

# ===================================================================
# 03 - CMS 직접 수정 기능
# ===================================================================
def post_03():
    c = new_canvas(); grad(c, (8,8,12), (18,22,30))
    d = ImageDraw.Draw(c)
    pill(d, SIZE//2, 45, "CMS", font("mont", 16), A, BG)
    ctext(d, 85, "코딩 없이", font("black", 84), W)
    ctext(d, 185, "직접 수정", font("black", 84), A)

    c = mockup(c, PF["pilates"], 90, 310, SIZE-180, 400, rad=14)
    d = ImageDraw.Draw(c)

    # 편집 포인트 (깨지지 않는 동그라미 + 텍스트)
    pts = [(230, 420, "텍스트 수정"), (540, 390, "이미지 교체"), (760, 510, "색상 변경")]
    for px, py, label in pts:
        d.ellipse([px-18, py-18, px+18, py+18], fill=A)
        d.ellipse([px-6, py-6, px+6, py+6], fill=BG)
        lw,_ = tsz(d, label, font("black", 18))
        d.rounded_rectangle([px-lw//2-10, py+24, px+lw//2+10, py+52], radius=10, fill=A)
        d.text((px-lw//2, py+26), label, font=font("black", 18), fill=BG)

    ctext(d, 760, "글자 / 사진 / 색상 / 레이아웃", font("black", 34), W)
    ctext(d, 810, "클릭 한 번으로 직접 수정하세요", font("black", 26), LG)

    feats = ["코딩 불필요", "실시간 반영", "무제한 수정"]
    fx = 130
    for f in feats:
        tw,_ = tsz(d, f, font("black", 22))
        d.rounded_rectangle([fx-8, 890, fx+tw+8, 890+38], radius=8, fill=(0,60,45))
        d.text((fx, 892), f, font=font("black", 22), fill=A)
        fx += tw + 60
    return c

# ===================================================================
# 04 - 가격표
# ===================================================================
def post_04():
    c = new_canvas(); grad(c, (12,12,16), (20,20,26))
    d = ImageDraw.Draw(c)
    ctext(d, 25, "PRICING", font("mont", 20), A)
    ctext(d, 60, "합리적인 가격", font("black", 54), W)
    ctext(d, 125, "투명한 견적", font("black", 54), A)

    cards = [
        ("BASIC", "15만원~", "원페이지", ["반응형 디자인", "모바일 최적화", "CMS 기본", "1회 수정"], False),
        ("STANDARD", "35만원~", "5페이지", ["반응형 디자인", "CMS 전체", "SEO 최적화", "문의폼/지도", "2회 수정"], True),
        ("PREMIUM", "70만원~", "10페이지+", ["반응형 디자인", "CMS + 위젯", "SEO + 분석", "다국어 지원", "1개월 유지보수"], False),
    ]
    cw=310; gap=22; sx=(SIZE-cw*3-gap*2)//2

    for i, (tier, price, pages, feats, hl) in enumerate(cards):
        x=sx+i*(cw+gap); y=210; h=710
        bg = (0,45,35) if hl else CH
        ol = A if hl else (60,60,68)
        d.rounded_rectangle([x,y,x+cw,y+h], radius=16, fill=bg, outline=ol, width=2)
        if hl:
            d.rounded_rectangle([x+cw//2-36,y-14,x+cw//2+36,y+14], radius=14, fill=A)
            d.text((x+cw//2-24, y-12), "BEST", font=font("mont", 16), fill=BG)

        # tier
        tw,_ = tsz(d, tier, font("mont", 22))
        d.text((x+(cw-tw)//2, y+28), tier, font=font("mont", 22), fill=A if hl else LG)
        # price - 한글이므로 black 폰트
        pw,_ = tsz(d, price, font("black", 48))
        d.text((x+(cw-pw)//2, y+65), price, font=font("black", 48), fill=W)
        # pages
        pgw,_ = tsz(d, pages, font("black", 22))
        d.text((x+(cw-pgw)//2, y+130), pages, font=font("black", 22), fill=GR)
        # line
        d.line([(x+30,y+170),(x+cw-30,y+170)], fill=ol, width=1)
        # features
        fy = y+195
        for feat in feats:
            d.text((x+35, fy), "●", font=font("sans", 14), fill=A if hl else GR)
            d.text((x+60, fy), feat, font=font("black", 22), fill=W if hl else LG)
            fy += 42

    ctext(d, 955, "부가세 별도 / 맞춤 견적 가능 / 급행 추가 15만원", font("black", 18), GR)
    return c

# ===================================================================
# 05 - 제작 프로세스 타임라인
# ===================================================================
def post_05():
    c = new_canvas(); grad(c, (12,12,18), (8,8,12))
    d = ImageDraw.Draw(c)
    ctext(d, 25, "PROCESS", font("mont", 20), A)
    ctext(d, 60, "5일이면 완성", font("black", 64), W)
    ctext(d, 140, "심플한 제작 과정", font("black", 28), LG)

    steps = [
        ("01", "상담", "당일", "요구사항 파악 / 업종 스타일 논의"),
        ("02", "기획", "1일", "레이아웃 설계 / 콘텐츠 구성"),
        ("03", "디자인", "2~3일", "시안 제작 / 피드백 반영"),
        ("04", "개발", "3~4일", "코딩 + CMS / 반응형 적용"),
        ("05", "납품", "5일", "최종 검수 / 도메인 연결"),
    ]
    lx=150; sy=220; sg=140

    for i, (num, title, day, desc) in enumerate(steps):
        y = sy + i*sg
        if i < len(steps)-1:
            d.line([(lx, y+44), (lx, y+sg)], fill=(60,60,68), width=3)
        # 원형 번호
        d.ellipse([lx-24, y, lx+24, y+48], fill=A)
        nw,_ = tsz(d, num, font("mont", 22))
        d.text((lx-nw//2, y+8), num, font=font("mont", 22), fill=BG)
        # 타이틀
        d.text((lx+50, y+2), title, font=font("black", 38), fill=W)
        # 날짜 (한글이므로 black 폰트)
        dw,_ = tsz(d, day, font("black", 20))
        d.rounded_rectangle([lx+260, y+8, lx+260+dw+24, y+38], radius=12, fill=CH)
        d.text((lx+272, y+10), day, font=font("black", 20), fill=A)
        # 설명
        d.text((lx+50, y+50), desc, font=font("black", 20), fill=GR)

    pill(d, SIZE//2, 970, "무료 상담 시작하기", font("black", 26), A, BG, px=44, py=14)
    return c

# ===================================================================
# 06 - 반응형 PC + 모바일
# ===================================================================
def post_06():
    c = new_canvas(); grad(c, (10,10,16), (16,20,28))
    d = ImageDraw.Draw(c)
    pill(d, SIZE//2, 45, "RESPONSIVE", font("mont", 16), A, BG)
    ctext(d, 85, "PC에서도", font("black", 60), W)
    ctext(d, 160, "모바일에서도", font("black", 60), W)
    ctext(d, 235, "완벽하게", font("black", 72), A)

    # PC 목업
    c = mockup(c, PF["cafe"], 50, 350, 600, 420, rad=12)
    d = ImageDraw.Draw(c)
    d.rounded_rectangle([70, 360, 150, 388], radius=10, fill=A)
    d.text((82, 362), "PC", font=font("mont", 18), fill=BG)

    # 모바일 목업
    px, py, pw, ph = 730, 370, 230, 420
    d.rounded_rectangle([px-6, py-6, px+pw+6, py+ph+6], radius=24, fill=(55,55,60))
    img = fit_cover(PF["cafe"], pw, ph)
    mask = Image.new("L", (pw,ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,pw,ph], radius=20, fill=255)
    c.paste(img, (px, py), mask)
    d = ImageDraw.Draw(c)
    d.rounded_rectangle([px+10, py+10, px+100, py+38], radius=10, fill=A)
    d.text((px+16, py+12), "Mobile", font=font("mont", 16), fill=BG)

    ctext(d, 830, "모든 기기에서 최적화된 경험", font("black", 28), LG)
    feats = ["자동 레이아웃", "터치 최적화", "빠른 로딩"]
    fx = 130
    for f in feats:
        tw,_ = tsz(d, f, font("black", 22))
        d.rounded_rectangle([fx-8, 890, fx+tw+8, 890+38], radius=8, fill=(0,60,45))
        d.text((fx, 892), f, font=font("black", 22), fill=A)
        fx += tw + 50
    ctext(d, 960, "구글 모바일 우선 인덱싱 대응", font("black", 20), GR)
    return c

# ===================================================================
# 07 - 숫자로 증명 (이모지 없이)
# ===================================================================
def post_07():
    c = new_canvas(); grad(c, (10,14,12), (16,16,20))
    d = ImageDraw.Draw(c)
    ctext(d, 35, "WHY ONDA?", font("mont", 22), A)
    ctext(d, 75, "숫자로 증명합니다", font("black", 58), W)

    # 전부 한글 폰트(black)로 통일
    stats = [
        ("84+", "제작 사례", "다양한 업종"),
        ("5일", "평균 납기", "빠른 제작"),
        ("100%", "반응형", "모든 기기"),
        ("4.9", "만족도", "크몽 평점"),
    ]
    cw, ch = 460, 280; gap=24
    sx = (SIZE-cw*2-gap)//2; sy=190

    for i, (num, label, sub) in enumerate(stats):
        col=i%2; row=i//2
        x=sx+col*(cw+gap); y=sy+row*(ch+gap)
        d.rounded_rectangle([x,y,x+cw,y+ch], radius=16, fill=CH, outline=(60,60,68), width=1)
        # 숫자 - 한글 포함이면 black, 아니면 mont
        has_kr = any('\uac00' <= ch <= '\ud7a3' for ch in num)
        nfont = font("black", 80) if has_kr else font("mont", 90)
        nw,_ = tsz(d, num, nfont)
        d.text((x+(cw-nw)//2, y+25), num, font=nfont, fill=A)
        # 라벨
        lw,_ = tsz(d, label, font("black", 34))
        d.text((x+(cw-lw)//2, y+145), label, font=font("black", 34), fill=W)
        # 서브
        sw,_ = tsz(d, sub, font("black", 22))
        d.text((x+(cw-sw)//2, y+200), sub, font=font("black", 22), fill=GR)

    ctext(d, 830, "온다마케팅과 함께한 사장님들의 결과", font("black", 24), LG)
    pill(d, SIZE//2, 920, "무료 상담", font("black", 26), A, BG, px=44, py=14)
    return c

# ===================================================================
# 08 - 고객 후기
# ===================================================================
def post_08():
    c = new_canvas(); grad(c, (12,12,16), (8,8,12))
    d = ImageDraw.Draw(c)
    ctext(d, 25, "REVIEW", font("mont", 20), A)
    ctext(d, 65, "사장님들의 실제 후기", font("black", 50), W)

    reviews = [
        ("카페 사장님", "디자인이 정말 마음에 들어요.\n모바일에서도 완벽하고\n직접 수정도 쉬워서 만족합니다."),
        ("필라테스 원장님", "5일만에 원하는 사이트가 나왔어요.\nCMS 덕분에 수정비용 0원이에요."),
        ("세무사님", "전문적인 느낌이 확 나면서도\n깔끔해요. 상담 문의가\n2배로 늘었습니다."),
    ]
    cw = SIZE-120; ch = 200; sy=160

    for i, (who, review) in enumerate(reviews):
        y = sy + i*(ch+22)
        d.rounded_rectangle([60,y,60+cw,y+ch], radius=14, fill=CH)
        # 프로필 원
        cx = 120
        d.ellipse([cx-24, y+25, cx+24, y+73], fill=(0,100,75))
        iw,_ = tsz(d, who[0], font("black", 28))
        d.text((cx-iw//2, y+30), who[0], font=font("black", 28), fill=W)
        # 이름 + 별점
        d.text((160, y+22), who, font=font("black", 24), fill=W)
        # 별점 - 텍스트로
        stars = "★★★★★"
        d.text((160, y+55), stars, font=font("sans", 22), fill=GD)
        # 리뷰
        d.text((160, y+90), review, font=font("black", 20), fill=LG, spacing=8)

    ctext(d, 840, "크몽 평점 4.9 / 재주문률 40%", font("black", 24), A)
    pill(d, SIZE//2, 930, "후기 더 보기", font("black", 22), A, BG, px=36, py=12)
    return c

# ===================================================================
# 09 - 업종별 맞춤 (이모지 제거, 불릿으로 대체)
# ===================================================================
def post_09():
    c = new_canvas(); grad(c, (12,12,16), (18,18,24))
    d = ImageDraw.Draw(c)
    ctext(d, 25, "INDUSTRY", font("mont", 20), A)
    ctext(d, 65, "어떤 업종이든", font("black", 62), W)
    ctext(d, 140, "맞춤 제작", font("black", 62), A)

    industries = [
        ("카페 / 음식점", PF["cafe"]),
        ("병원 / 클리닉", PF["clinic"]),
        ("뷰티 / 네일", PF["nail"]),
        ("피트니스 / 요가", PF["pilates"]),
        ("세무 / 법률", PF["tax"]),
        ("부동산 / 인테리어", PF2["cafe"]),
    ]
    rh = 90; sy=250

    for i, (name, img) in enumerate(industries):
        y = sy + i*rh
        d.rounded_rectangle([50,y,SIZE-50,y+74], radius=12, fill=CH)
        # 불릿 원
        d.ellipse([72, y+20, 106, y+54], fill=A)
        nw,_ = tsz(d, str(i+1), font("mont", 18))
        d.text((89-nw//2, y+23), str(i+1), font=font("mont", 18), fill=BG)
        # 업종명
        d.text((125, y+18), name, font=font("black", 30), fill=W)
        # 미니 포트폴리오
        mini = fit_cover(img, 110, 58)
        mmask = Image.new("L", (110,58), 0)
        ImageDraw.Draw(mmask).rounded_rectangle([0,0,110,58], radius=8, fill=255)
        c.paste(mini, (SIZE-190, y+8), mmask)
        d = ImageDraw.Draw(c)

    ctext(d, 810, "그 외 학원 / 펫샵 / 농장 / 펜션 등", font("black", 22), LG)
    ctext(d, 850, "모든 업종 맞춤 제작 가능", font("black", 24), A)
    pill(d, SIZE//2, 940, "내 업종 상담", font("black", 24), A, BG, px=40, py=14)
    return c

# ===================================================================
# 10 - 체크리스트 CTA
# ===================================================================
def post_10():
    c = new_canvas(); grad(c, (0,35,25), (10,10,14))
    d = ImageDraw.Draw(c)
    ctext(d, 30, "CHECK LIST", font("mont", 20), A2)
    ctext(d, 75, "홈페이지 제작", font("black", 58), W)
    ctext(d, 148, "이것만 확인하세요", font("black", 58), A2)

    checks = [
        ("반응형 디자인", "PC / 태블릿 / 모바일 완벽 대응"),
        ("CMS 수정 기능", "코딩 없이 직접 텍스트/이미지 수정"),
        ("SEO 최적화", "네이버 / 구글 검색 상위 노출"),
        ("빠른 납기", "상담부터 납품까지 평균 5일"),
        ("합리적 가격", "15만원부터 시작, 추가비용 없음"),
        ("유지보수", "납품 후에도 지속적인 지원"),
    ]
    sy = 250
    for i, (title, desc) in enumerate(checks):
        y = sy + i*88
        # 체크 원
        d.ellipse([70,y+4,110,y+44], fill=A)
        cw,_ = tsz(d, "V", font("mont", 22))
        d.text((90-cw//2, y+7), "V", font=font("mont", 22), fill=BG)
        # 텍스트
        d.text((130, y), title, font=font("black", 30), fill=W)
        d.text((130, y+38), desc, font=font("black", 20), fill=GR)

    # CTA 버튼
    d.rounded_rectangle([120, 830, SIZE-120, 910], radius=40, fill=A)
    ctext(d, 845, "무료 상담 시작하기", font("black", 36), BG)
    ctext(d, 940, "카카오톡 / 크몽 / 전화 상담 가능", font("black", 20), LG)
    return c


# ===================================================================
# Generate + Verify
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
print("ONDA 홈페이지 제작 소재 v2 (볼드+로고제거+이모지제거)")
print("=" * 50)

success = 0
for i, (gen, name) in enumerate(generators):
    print(f"\n[{i+1:2d}/10] {name}...")
    try:
        img = gen()
        path = f"{OUT_DIR}/{name}.png"
        img.save(path, "PNG", quality=100)
        # 검증: 파일 크기 + 이미지 크기
        fsize = os.path.getsize(path)
        assert img.size == (SIZE, SIZE), f"크기 불일치: {img.size}"
        assert fsize > 10000, f"파일 너무 작음: {fsize}"
        print(f"  ✓ {fsize//1024}KB ({img.size[0]}x{img.size[1]})")
        success += 1
    except Exception as e:
        print(f"  ✗ {e}")
        import traceback; traceback.print_exc()

print(f"\n{'='*50}")
print(f"결과: {success}/10 성공")
print(f"{'='*50}")
