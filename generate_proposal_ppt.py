#!/usr/bin/env python3
"""마드모아젤헤어 프리미엄 제안서 PPT 생성 스크립트 (18슬라이드)"""

import os
from pptx import Presentation
from pptx.util import Cm, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

# ── 슬라이드 크기 ──
SLIDE_W = Cm(33.867)
SLIDE_H = Cm(19.05)

# ── 여백 ──
ML = Cm(2.5)
MR = Cm(2.5)
MT = Cm(1.5)
MB = Cm(1.5)
CW = Cm(28.867)
CH = Cm(16.05)

# ── 제목 ──
TITLE_TOP = Cm(1.8)
TITLE_H = Cm(1.3)

# ── 액센트 언더라인 ──
ACCENT_TOP = Cm(3.3)
ACCENT_H = Cm(0.1)
ACCENT_W = Cm(4.0)

# ── 본문 시작 ──
BODY_TOP = Cm(4.0)

# ── 푸터 ──
FOOTER_TOP = Cm(17.8)

# ── 로고 ──
LOGO_W = Cm(4.0)
LOGO_H = Cm(1.2)
LOGO_LEFT = SLIDE_W - MR - LOGO_W
LOGO_TOP = Cm(0.5)

# ── 색상 ──
NAVY = RGBColor(0x1B, 0x2A, 0x4A)
BLUE = RGBColor(0x25, 0x63, 0xEB)
GOLD = RGBColor(0xD4, 0xA8, 0x53)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
DARK_TEXT = RGBColor(0x1A, 0x1A, 0x2E)
LIGHT_BG = RGBColor(0xF8, 0xF9, 0xFA)
TABLE_HDR = RGBColor(0x1B, 0x2A, 0x4A)
TABLE_ALT = RGBColor(0xF0, 0xF4, 0xFF)
TABLE_WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GREEN = RGBColor(0x10, 0xB9, 0x81)
RED = RGBColor(0xEF, 0x44, 0x44)
PH_BG = RGBColor(0xF3, 0xF4, 0xF6)
PH_BORDER = RGBColor(0x9C, 0xA3, 0xAF)
ONDA_GREEN = RGBColor(0x0F, 0xA0, 0x6E)

LOGO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "onda_logo.jpg")
OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "마드모아젤헤어_제안서.pptx")
TOTAL_SLIDES = 18


# ═══════════════════════════════════════════
# 유틸 함수
# ═══════════════════════════════════════════

def set_slide_bg(slide, color):
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color


def add_top_line(slide, color=BLUE):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Cm(0), Cm(0), SLIDE_W, Cm(0.12))
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def add_footer(slide, page_num, total=TOTAL_SLIDES):
    txBox = slide.shapes.add_textbox(SLIDE_W - Cm(6), FOOTER_TOP, Cm(5.5), Cm(0.8))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = f"온다마케팅 | {page_num}/{total}"
    p.font.size = Pt(9)
    p.font.color.rgb = RGBColor(0x99, 0x99, 0x99)
    p.alignment = PP_ALIGN.RIGHT


def add_logo(slide, logo_path=LOGO_PATH):
    if os.path.exists(logo_path):
        slide.shapes.add_picture(logo_path, LOGO_LEFT, LOGO_TOP, LOGO_W, LOGO_H)


def add_title(slide, text, color=DARK_TEXT, font_size=Pt(28)):
    txBox = slide.shapes.add_textbox(ML, TITLE_TOP, CW, TITLE_H)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = font_size
    p.font.bold = True
    p.font.color.rgb = color


def add_accent_line(slide, color=BLUE):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, ML, ACCENT_TOP, ACCENT_W, ACCENT_H)
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def add_textbox(slide, left, top, width, height, text, font_size=Pt(12),
                bold=False, color=DARK_TEXT, alignment=PP_ALIGN.LEFT, line_spacing=1.5):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = font_size
    p.font.bold = bold
    p.font.color.rgb = color
    p.alignment = alignment
    p.space_after = Pt(4)
    return txBox


def add_multiline_textbox(slide, left, top, width, height, lines, default_size=Pt(12),
                          default_color=DARK_TEXT, alignment=PP_ALIGN.LEFT):
    """lines: list of (text, font_size, bold, color) or str"""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, line in enumerate(lines):
        if isinstance(line, str):
            text, sz, bold, clr = line, default_size, False, default_color
        else:
            text = line[0]
            sz = line[1] if len(line) > 1 else default_size
            bold = line[2] if len(line) > 2 else False
            clr = line[3] if len(line) > 3 else default_color
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = text
        p.font.size = sz
        p.font.bold = bold
        p.font.color.rgb = clr
        p.alignment = alignment
        p.space_after = Pt(4)
    return txBox


def add_highlight_box(slide, left, top, width, height, text, bg_color, border_color,
                      text_color=DARK_TEXT, font_size=Pt(12), bold=False, alignment=PP_ALIGN.LEFT):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = bg_color
    shape.line.color.rgb = border_color
    shape.line.width = Pt(1.5)
    shape.adjustments[0] = 0.05
    tf = shape.text_frame
    tf.word_wrap = True
    tf.margin_left = Cm(0.5)
    tf.margin_right = Cm(0.5)
    tf.margin_top = Cm(0.3)
    tf.margin_bottom = Cm(0.3)
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = font_size
    p.font.bold = bold
    p.font.color.rgb = text_color
    p.alignment = alignment
    return shape


def add_placeholder_image(slide, left, top, width, height, label="이미지 자리"):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = PH_BG
    shape.line.color.rgb = PH_BORDER
    shape.line.width = Pt(1)
    shape.line.dash_style = 2  # dash
    tf = shape.text_frame
    tf.word_wrap = True
    tf.margin_left = Cm(0.3)
    tf.margin_right = Cm(0.3)
    p = tf.paragraphs[0]
    p.text = label
    p.font.size = Pt(11)
    p.font.color.rgb = PH_BORDER
    p.alignment = PP_ALIGN.CENTER
    # 수직 중앙
    txBody = shape._element.txBody
    bodyPr = txBody.find(qn('a:bodyPr'))
    bodyPr.set('anchor', 'ctr')
    return shape


def _set_cell(cell, text, font_size=Pt(11), bold=False, color=DARK_TEXT,
              bg_color=None, alignment=PP_ALIGN.CENTER):
    cell.text = ""
    p = cell.text_frame.paragraphs[0]
    p.text = text
    p.font.size = font_size
    p.font.bold = bold
    p.font.color.rgb = color
    p.alignment = alignment
    cell.text_frame.margin_left = Cm(0.15)
    cell.text_frame.margin_right = Cm(0.15)
    cell.text_frame.margin_top = Cm(0.1)
    cell.text_frame.margin_bottom = Cm(0.1)
    cell.vertical_anchor = MSO_ANCHOR.MIDDLE
    if bg_color:
        cell.fill.solid()
        cell.fill.fore_color.rgb = bg_color


def create_styled_table(slide, left, top, width, rows, cols, data, col_widths=None):
    table_shape = slide.shapes.add_table(rows, cols, left, top, width, Cm(rows * 0.9))
    table = table_shape.table

    if col_widths:
        for i, w in enumerate(col_widths):
            table.columns[i].width = w

    for r in range(rows):
        for c in range(cols):
            cell = table.cell(r, c)
            text = data[r][c] if r < len(data) and c < len(data[r]) else ""
            if r == 0:
                _set_cell(cell, text, Pt(11), True, WHITE, TABLE_HDR)
            else:
                bg = TABLE_ALT if r % 2 == 0 else TABLE_WHITE
                _set_cell(cell, text, Pt(10), False, DARK_TEXT, bg)

    # 테두리 제거
    for r in range(rows):
        for c in range(cols):
            cell = table.cell(r, c)
            tc = cell._tc
            tcPr = tc.tcPr
            if tcPr is None:
                tcPr = tc.get_or_add_tcPr()
            for edge in ['a:lnL', 'a:lnR', 'a:lnT', 'a:lnB']:
                ln = tcPr.find(qn(edge))
                if ln is None:
                    ln = tcPr.makeelement(qn(edge), {})
                    tcPr.append(ln)
                ln.set('w', '0')
                noFill = ln.makeelement(qn('a:noFill'), {})
                for child in list(ln):
                    ln.remove(child)
                ln.append(noFill)

    return table_shape


def add_card(slide, left, top, width, height, bar_color, icon, title, desc,
             bg_color=WHITE, text_color=DARK_TEXT):
    """카드 UI: 상단 컬러바 + 아이콘 + 제목 + 설명"""
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    card.fill.solid()
    card.fill.fore_color.rgb = bg_color
    card.line.color.rgb = RGBColor(0xE5, 0xE7, 0xEB)
    card.line.width = Pt(0.75)
    card.adjustments[0] = 0.03
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, Cm(0.25))
    bar.fill.solid()
    bar.fill.fore_color.rgb = bar_color
    bar.line.fill.background()
    add_textbox(slide, left + Cm(0.3), top + Cm(0.5), width - Cm(0.6), Cm(1.2),
                icon, Pt(24), False, bar_color, PP_ALIGN.CENTER)
    add_textbox(slide, left + Cm(0.3), top + Cm(1.8), width - Cm(0.6), Cm(1.0),
                title, Pt(12), True, text_color, PP_ALIGN.CENTER)
    add_textbox(slide, left + Cm(0.3), top + Cm(2.9), width - Cm(0.6), height - Cm(3.2),
                desc, Pt(9), False, text_color, PP_ALIGN.LEFT)


def add_qa_icon(slide, left, top, letter, bg_color):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, Cm(1.5), Cm(1.5))
    shape.fill.solid()
    shape.fill.fore_color.rgb = bg_color
    shape.line.fill.background()
    shape.adjustments[0] = 0.15
    tf = shape.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.text = letter
    p.font.size = Pt(24)
    p.font.bold = True
    p.font.color.rgb = WHITE
    p.alignment = PP_ALIGN.CENTER
    txBody = shape._element.txBody
    bodyPr = txBody.find(qn('a:bodyPr'))
    bodyPr.set('anchor', 'ctr')


# ═══════════════════════════════════════════
# 슬라이드 빌더
# ═══════════════════════════════════════════

def slide_01_cover(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, NAVY)
    add_top_line(slide, GOLD)
    if os.path.exists(LOGO_PATH):
        lw, lh = Cm(10), Cm(3)
        slide.shapes.add_picture(LOGO_PATH, (SLIDE_W - lw) // 2, Cm(3.5), lw, lh)
    add_textbox(slide, ML, Cm(7.0), CW, Cm(0.8), "네이버 종합광고 실행사",
                Pt(13), False, WHITE, PP_ALIGN.CENTER)
    add_textbox(slide, ML, Cm(8.2), CW, Cm(2.0), "마드모아젤헤어",
                Pt(40), True, WHITE, PP_ALIGN.CENTER)
    add_textbox(slide, ML, Cm(10.5), CW, Cm(1.2), "플레이스 순위 회복 및 방어 전략 제안서",
                Pt(20), False, GOLD, PP_ALIGN.CENTER)
    add_textbox(slide, ML, Cm(12.2), CW, Cm(0.8),
                "세종시 4개 지점 통합 진단 | 안전보장형 운영 제안",
                Pt(13), False, RGBColor(0xB0, 0xB8, 0xC8), PP_ALIGN.CENTER)
    add_textbox(slide, SLIDE_W - Cm(5), Cm(17.5), Cm(4.5), Cm(0.6), "2026.03",
                Pt(10), False, WHITE, PP_ALIGN.RIGHT)


def slide_02_greeting(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, WHITE)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "인사말")
    add_accent_line(slide)

    body = ("안녕하세요. 마드모아젤헤어 마케팅 미팅에 참여하게 되어 감사드립니다.\n"
            "저희는 네이버 플레이스, 인스타그램 등 온라인 채널을 통합 운영하는\n"
            "종합광고 실행사 온다마케팅입니다.")
    add_textbox(slide, ML, BODY_TOP, CW, Cm(3.5), body, Pt(14), False, DARK_TEXT)

    add_highlight_box(slide, ML, Cm(8.5), CW, Cm(3.5),
                      "본 제안서는 귀사의 현재 플레이스 현황에 대한 진단과 함께,\n"
                      "2026년 변화된 알고리즘 환경에 맞는 대응 전략을 담고 있습니다.",
                      RGBColor(0xEF, 0xF6, 0xFF), BLUE, DARK_TEXT, Pt(13))

    add_footer(slide, 2)


def slide_03_rule_change(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, LIGHT_BG)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "2026년, 플레이스 마케팅의 규칙이 바뀌었습니다", font_size=Pt(24))
    add_accent_line(slide)

    col_w = Cm(12.5)
    gap = Cm(1.5)

    past_items = ("• 트래픽 양 = 순위\n"
                  "• 3~6개월 단위 로직 변경\n"
                  "• 배포형 블로그로 순위 상승 가능\n"
                  "• 공격적 작업 = 빠른 성과")
    add_highlight_box(slide, ML, BODY_TOP + Cm(0.5), col_w, Cm(6.5),
                      "과거 (2025년 이전)\n\n" + past_items,
                      WHITE, RGBColor(0xCC, 0xCC, 0xCC), DARK_TEXT, Pt(11))

    arrow = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, ML + col_w + Cm(0.2),
                                   BODY_TOP + Cm(3.0), Cm(1.1), Cm(1.0))
    arrow.fill.solid()
    arrow.fill.fore_color.rgb = BLUE
    arrow.line.fill.background()

    now_items = ("• 트래픽 패턴 감지 → 제재/패널티\n"
                 "• 1~2주 단위 세부 로직 변동\n"
                 "• 배포형 블로그 대량 삭제 + 순위 급락\n"
                 "• 공격적 작업 = 공격적 하락 수반")
    add_highlight_box(slide, ML + col_w + gap, BODY_TOP + Cm(0.5), col_w, Cm(6.5),
                      "현재 (2026년 이후)\n\n" + now_items,
                      WHITE, BLUE, DARK_TEXT, Pt(11))

    add_highlight_box(slide, ML, Cm(12.5), CW, Cm(2.5),
                      "핵심: 순위를 '올리는 것'보다, '지키는 것'이 더 어렵고 더 중요한 시대",
                      RGBColor(0xFE, 0xF9, 0xF0), GOLD, DARK_TEXT, Pt(14), True)

    add_footer(slide, 3)


def slide_04_defense_system(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, WHITE)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "데이터 기반 순위 방어 체계")
    add_accent_line(slide)

    card_w = (CW - Cm(1)) / 3
    card_h = Cm(8.5)

    cards = [
        ("🔬", "셀프마케팅 +\nAI로직연구소",
         "실시간 로직 모니터링과\nAI 기반 분석으로\n최적 매체를 자동 추천합니다."),
        ("🛡️", "순위 방어 +\n상승 로직",
         "패턴 감지를 회피하는\n안전한 방식으로 순위를\n방어하고 상승시킵니다."),
        ("📈", "안전하고\n꾸준한 상승",
         "급격한 변동 없이\n안정적인 순위 상승을\n지속적으로 만들어냅니다."),
    ]

    for i, (icon, title, desc) in enumerate(cards):
        x = ML + (card_w + Cm(0.5)) * i
        add_card(slide, x, BODY_TOP + Cm(0.5), card_w, card_h, BLUE, icon, title, desc)

    add_textbox(slide, ML, Cm(14.0), CW, Cm(1.5),
                "단순 트래픽 유입 대행에서 벗어나, 실시간 데이터 분석 기반 순위 방어 체계 구축",
                Pt(12), False, RGBColor(0x66, 0x66, 0x66), PP_ALIGN.CENTER)

    add_footer(slide, 4)


def slide_05_diagnosis(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, WHITE)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "마드모아젤헤어 4개 지점 현황 진단")
    add_accent_line(slide)

    data = [
        ["지점", "순위 변동", "N2 변동", "블로그 삭제", "저품질"],
        ["마크원애비뉴점", "하락", "-0.08 이상", "해당", "없음"],
        ["나성1호점", "1위→14위", "-0.08 이상", "해당", "없음"],
        ["나성2호점", "14위→21위", "-0.10", "해당", "없음"],
        ["반곡점", "하락", "-0.08 이상", "해당", "없음"],
    ]

    col_ws = [Cm(6), Cm(6), Cm(5.5), Cm(5.5), Cm(5.867)]
    ts = create_styled_table(slide, ML, BODY_TOP + Cm(0.3), CW, 5, 5, data, col_ws)
    tbl = ts.table

    for r in range(1, 5):
        _set_cell(tbl.cell(r, 1), data[r][1], Pt(10), True, RED,
                  TABLE_ALT if r % 2 == 0 else TABLE_WHITE)
        _set_cell(tbl.cell(r, 4), data[r][4], Pt(10), True, GREEN,
                  TABLE_ALT if r % 2 == 0 else TABLE_WHITE)

    add_textbox(slide, ML, Cm(9.5), CW, Cm(1.2),
                "공통사항: N1 변동 없음. 블로그 리뷰 약 300~400건 삭제/누락.",
                Pt(11), False, RGBColor(0x66, 0x66, 0x66))

    add_highlight_box(slide, ML, Cm(11.5), CW, Cm(2.5),
                      "✅ 종합 판단: 4개 지점 모두 저품질 상태 아님 → 회복 가능",
                      RGBColor(0xEC, 0xFD, 0xF5), GREEN, DARK_TEXT, Pt(14), True)

    add_footer(slide, 5)


def slide_06_qa1(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, LIGHT_BG)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "Q&A")
    add_accent_line(slide)

    add_qa_icon(slide, ML, BODY_TOP + Cm(0.3), "Q", BLUE)
    add_textbox(slide, ML + Cm(2.0), BODY_TOP + Cm(0.3), CW - Cm(2.0), Cm(1.5),
                "전 지점 N2 동시 하락, 원인이 무엇입니까?", Pt(18), True, DARK_TEXT)

    add_qa_icon(slide, ML, BODY_TOP + Cm(2.5), "A", NAVY)
    add_textbox(slide, ML + Cm(2.0), BODY_TOP + Cm(2.5), CW - Cm(2.0), Cm(3.5),
                "가장 직접적인 원인은 3월 초 배포형 블로그 및 비실명 계정의\n"
                "대대적인 삭제 조치입니다. 블로그 리뷰 300~400건이 일괄 삭제되며\n"
                "N2 점수가 동반 하락했습니다.",
                Pt(12), False, DARK_TEXT)

    points = [
        "✓ N1(SEO) 점수 변동 없음",
        "✓ 4개 지점 모두 저품질 해당 없음",
        "✓ 정상적인 회복 가능",
    ]
    y = BODY_TOP + Cm(7.0)
    for pt in points:
        add_textbox(slide, ML + Cm(2.0), y, CW - Cm(2.0), Cm(0.8), pt, Pt(13), False, GREEN)
        y += Cm(1.0)

    add_footer(slide, 6)


def slide_07_qa2(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, WHITE)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "Q&A")
    add_accent_line(slide)

    add_qa_icon(slide, ML, BODY_TOP + Cm(0.3), "Q", BLUE)
    add_textbox(slide, ML + Cm(2.0), BODY_TOP + Cm(0.3), CW - Cm(2.0), Cm(1.5),
                "블로그 대량 삭제, 어떻게 상쇄합니까?", Pt(18), True, DARK_TEXT)

    add_qa_icon(slide, ML, BODY_TOP + Cm(2.5), "A", NAVY)
    add_textbox(slide, ML + Cm(2.0), BODY_TOP + Cm(2.5), CW - Cm(2.0), Cm(5.0),
                "단순 재배포는 오히려 독입니다.\n"
                "현재는 2주 단위, 빠르면 1주 단위로 내부 가중치가 변동되고 있습니다.\n\n"
                "CLOVA AI 도입 이후 유입 경로, fingerprint 유사성,\n"
                "패턴이 있는 방식의 작업은 효율이 급락하고\n"
                "순위 하락으로 이어지고 있습니다.",
                Pt(12), False, DARK_TEXT)

    add_highlight_box(slide, ML, Cm(12.0), CW, Cm(2.5),
                      "6장에 첨부한 당사 관리 업체의 실제 데이터를 통해 확인 가능",
                      RGBColor(0xEF, 0xF6, 0xFF), BLUE, DARK_TEXT, Pt(13), True)

    add_footer(slide, 7)


def slide_08_qa3(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, LIGHT_BG)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "Q&A")
    add_accent_line(slide)

    add_qa_icon(slide, ML, BODY_TOP + Cm(0.3), "Q", BLUE)
    add_textbox(slide, ML + Cm(2.0), BODY_TOP + Cm(0.3), CW - Cm(2.0), Cm(1.5),
                "급락 지점의 1단계 회복 플랜은?", Pt(18), True, DARK_TEXT)

    add_qa_icon(slide, ML, BODY_TOP + Cm(2.5), "A", NAVY)
    add_textbox(slide, ML + Cm(2.0), BODY_TOP + Cm(2.5), CW - Cm(2.0), Cm(3.5),
                "패턴이 드러날 수밖에 없는 단순 트래픽 작업은\n"
                "동일한 리스크를 반복하게 됩니다.\n\n"
                "그러나 경쟁사 전부가 트래픽을 넣고 있는 상황에서\n"
                "트래픽 없는 순위 상승 역시 불가능합니다.",
                Pt(12), False, DARK_TEXT)

    add_textbox(slide, ML + Cm(2.0), BODY_TOP + Cm(6.5), CW - Cm(2.0), Cm(1.5),
                "핵심: 패턴화되지 않는 작업, AI가 감지할 수 없는 방식으로 트래픽 설계",
                Pt(13), True, BLUE)

    add_highlight_box(slide, ML, Cm(12.5), CW, Cm(2.5),
                      "안정적인 작업 속도를 유지하면서, 회복과 방어를 동시에 진행하겠습니다",
                      RGBColor(0xFE, 0xF9, 0xF0), GOLD, DARK_TEXT, Pt(14), True)

    add_footer(slide, 8)


def slide_09_case_ranking(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, NAVY)
    add_top_line(slide, GOLD)

    add_textbox(slide, ML, TITLE_TOP, CW, TITLE_H, "순위 상승 로직 운용 사례",
                Pt(28), True, WHITE, PP_ALIGN.LEFT)
    add_textbox(slide, ML, Cm(3.3), CW, Cm(0.8),
                "안정적으로 순위 상승을 이끌어내는 로직을 운용 중입니다",
                Pt(14), False, GOLD)

    col_w = Cm(13.5)
    gap = Cm(1.867)

    lx = ML
    add_textbox(slide, lx, Cm(4.5), col_w, Cm(0.8), "정형외과 키워드",
                Pt(14), False, WHITE)
    add_textbox(slide, lx, Cm(5.3), col_w, Cm(1.8), "8위 → 2위",
                Pt(36), True, GOLD, PP_ALIGN.LEFT)
    add_textbox(slide, lx, Cm(7.2), col_w, Cm(0.8), "N2 0.4816 (상승세)",
                Pt(12), False, WHITE)
    add_placeholder_image(slide, lx, Cm(8.5), Cm(12), Cm(7), "순위 변화 그래프 A")

    rx = ML + col_w + gap
    add_textbox(slide, rx, Cm(4.5), col_w, Cm(0.8), "피부과 키워드",
                Pt(14), False, WHITE)
    add_textbox(slide, rx, Cm(5.3), col_w, Cm(1.8), "1위 유지",
                Pt(36), True, GOLD, PP_ALIGN.LEFT)
    add_textbox(slide, rx, Cm(7.2), col_w, Cm(0.8), "N2 0.5189",
                Pt(12), False, WHITE)
    add_placeholder_image(slide, rx, Cm(8.5), Cm(12), Cm(7), "순위 변화 그래프 B")

    add_footer(slide, 9)


def slide_10_recovery(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, WHITE)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "3월 블로그 삭제 이후 회복 사례")
    add_accent_line(slide)

    card_w = (CW - Cm(1)) / 3
    card_h = Cm(11.5)
    cases = [
        ("부산피부과", "14위", "N2 0.4959 (회복 중)", "블로그 6,121건 | 리뷰 2,588건"),
        ("대구성형외과", "14위", "N2 0.4148", "블로그 330건 | 리뷰 726건"),
        ("신림성형외과", "3위", "N2 0.4371", "블로그 627건 | 리뷰 363건"),
    ]

    for i, (name, rank, n2, stats) in enumerate(cases):
        x = ML + (card_w + Cm(0.5)) * i
        y = BODY_TOP + Cm(0.3)
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, card_w, card_h)
        card.fill.solid()
        card.fill.fore_color.rgb = LIGHT_BG
        card.line.color.rgb = RGBColor(0xE5, 0xE7, 0xEB)
        card.line.width = Pt(0.75)
        card.adjustments[0] = 0.03
        add_textbox(slide, x + Cm(0.3), y + Cm(0.4), card_w - Cm(0.6), Cm(0.8),
                    name, Pt(14), True, DARK_TEXT, PP_ALIGN.CENTER)
        add_textbox(slide, x + Cm(0.3), y + Cm(1.3), card_w - Cm(0.6), Cm(1.2),
                    rank, Pt(28), True, BLUE, PP_ALIGN.CENTER)
        add_textbox(slide, x + Cm(0.3), y + Cm(2.6), card_w - Cm(0.6), Cm(0.8),
                    n2, Pt(11), False, DARK_TEXT, PP_ALIGN.CENTER)
        add_textbox(slide, x + Cm(0.3), y + Cm(3.5), card_w - Cm(0.6), Cm(0.8),
                    stats, Pt(9), False, RGBColor(0x66, 0x66, 0x66), PP_ALIGN.CENTER)
        add_placeholder_image(slide, x + Cm(0.5), y + Cm(4.8), card_w - Cm(1.0), Cm(6.0),
                              f"사례 {chr(67+i)} 스크린샷")

    add_footer(slide, 10)


def slide_11_hair_salon(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, LIGHT_BG)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "미용실 업종 레퍼런스")
    add_accent_line(slide)

    add_textbox(slide, ML, Cm(3.5), CW, Cm(0.8),
                "귀사와 동일한 업종에서의 실제 운영 실적", Pt(13), False,
                RGBColor(0x66, 0x66, 0x66))

    col_w = Cm(13.5)
    gap = Cm(1.867)

    lx = ML
    ly = Cm(5.0)
    card_f = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, lx, ly, col_w, Cm(9.0))
    card_f.fill.solid()
    card_f.fill.fore_color.rgb = WHITE
    card_f.line.color.rgb = RGBColor(0xE5, 0xE7, 0xEB)
    card_f.adjustments[0] = 0.03
    add_textbox(slide, lx + Cm(0.5), ly + Cm(0.4), col_w - Cm(1), Cm(1.5),
                "15위 → 2위", Pt(36), True, BLUE, PP_ALIGN.CENTER)
    add_textbox(slide, lx + Cm(0.5), ly + Cm(2.0), col_w - Cm(1), Cm(0.8),
                "1주 만에 13계단 상승", Pt(13), False, DARK_TEXT, PP_ALIGN.CENTER)
    add_textbox(slide, lx + Cm(0.5), ly + Cm(2.8), col_w - Cm(1), Cm(0.8),
                "N2 0.4541", Pt(11), False, RGBColor(0x66, 0x66, 0x66), PP_ALIGN.CENTER)
    add_placeholder_image(slide, lx + Cm(0.5), ly + Cm(4.0), col_w - Cm(1), Cm(4.5),
                          "사례 F 스크린샷")

    rx = ML + col_w + gap
    card_g = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, rx, ly, col_w, Cm(9.0))
    card_g.fill.solid()
    card_g.fill.fore_color.rgb = WHITE
    card_g.line.color.rgb = RGBColor(0xE5, 0xE7, 0xEB)
    card_g.adjustments[0] = 0.03
    add_textbox(slide, rx + Cm(0.5), ly + Cm(0.4), col_w - Cm(1), Cm(1.5),
                "81위 → 40위", Pt(36), True, BLUE, PP_ALIGN.CENTER)
    add_textbox(slide, rx + Cm(0.5), ly + Cm(2.0), col_w - Cm(1), Cm(0.8),
                "2주간 41계단 상승", Pt(13), False, DARK_TEXT, PP_ALIGN.CENTER)
    add_textbox(slide, rx + Cm(0.5), ly + Cm(2.8), col_w - Cm(1), Cm(0.8),
                "N2 0.4460", Pt(11), False, RGBColor(0x66, 0x66, 0x66), PP_ALIGN.CENTER)
    add_placeholder_image(slide, rx + Cm(0.5), ly + Cm(4.0), col_w - Cm(1), Cm(4.5),
                          "사례 G 스크린샷")

    add_highlight_box(slide, ML, Cm(14.8), CW, Cm(2.0),
                      "7건 사례 종합: 순위 상승 로직 보유(A,B,F,G) + 회복 실적(C,D,E) + 미용실 성과(F,G)",
                      RGBColor(0xEF, 0xF6, 0xFF), BLUE, DARK_TEXT, Pt(12), True)

    add_footer(slide, 11)


def slide_12_cascade(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, WHITE)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "메인 키워드 하나면 충분합니다")
    add_accent_line(slide)

    add_textbox(slide, ML, BODY_TOP, CW, Cm(1.5),
                "플레이스 마케팅은 '키워드'를 올리는 작업이 아니라\n"
                "플레이스 자체의 점수를 올리는 작업",
                Pt(13), False, RGBColor(0x66, 0x66, 0x66))

    card_w = Cm(13.5)
    gap = Cm(1.867)

    for i, (kw, vol, change) in enumerate([
        ("나성동미용실", "3,980건", "8위 → 6위"),
        ("세종미용실", "9,170건", "16위 → 13위"),
    ]):
        x = ML + (card_w + gap) * i
        box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, Cm(6.5), card_w, Cm(3.5))
        box.fill.solid()
        box.fill.fore_color.rgb = LIGHT_BG
        box.line.color.rgb = RGBColor(0xE5, 0xE7, 0xEB)
        box.adjustments[0] = 0.03
        add_textbox(slide, x + Cm(0.5), Cm(6.8), card_w - Cm(1), Cm(0.8),
                    f"{kw} ({vol})", Pt(12), False, DARK_TEXT, PP_ALIGN.CENTER)
        add_textbox(slide, x + Cm(0.5), Cm(7.8), card_w - Cm(1), Cm(1.5),
                    change, Pt(28), True, GREEN, PP_ALIGN.CENTER)

    add_placeholder_image(slide, ML, Cm(11.0), CW, Cm(4.5), "낙수효과 순위 변동 스크린샷")

    add_textbox(slide, ML, Cm(16.0), CW, Cm(1.2),
                "연관도 낮은 키워드(다정동/새롬동)에서 순위가 낮은 것은 업체 소재지 연관도 차이이며 정상",
                Pt(10), False, RGBColor(0x99, 0x99, 0x99))

    add_footer(slide, 12)


def slide_13_safe_guarantee(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, NAVY)
    add_top_line(slide, GOLD)

    add_textbox(slide, ML, TITLE_TOP, CW, TITLE_H, "제안 서비스: 안전보장형",
                Pt(28), True, WHITE)
    add_textbox(slide, ML, Cm(3.3), CW, Cm(0.8), "관리형과 순위보장형의 중간 형태",
                Pt(14), False, GOLD)

    data = [
        ["내부 로직 항목", "세부 내용"],
        ["키워드 세분화", "10유입 단위로 분할하여 패턴 감지 회피"],
        ["유입경로 다양화", "매일 다른 키워드를 세팅하여 유입 경로 다변화"],
        ["매체·미션 다양화", "단일 매체/미션 반복 지양, 다양한 조합 운영"],
    ]

    col_ws = [Cm(10), Cm(18.867)]
    ts = create_styled_table(slide, ML, Cm(5.0), CW, 4, 2, data, col_ws)
    tbl = ts.table

    for c in range(2):
        _set_cell(tbl.cell(0, c), data[0][c], Pt(12), True, WHITE, GOLD)

    for r in range(1, 4):
        for c in range(2):
            bg = RGBColor(0x24, 0x36, 0x5A) if r % 2 == 1 else RGBColor(0x1F, 0x30, 0x50)
            _set_cell(tbl.cell(r, c), data[r][c], Pt(11), c == 0, WHITE, bg)

    add_textbox(slide, ML, Cm(10.0), CW, Cm(1.5),
                "위 항목은 내부 로직의 일부 예시이며, 실제 적용 범위는 이보다 넓습니다.",
                Pt(11), False, RGBColor(0xA0, 0xAE, 0xC0))

    add_footer(slide, 13)


def slide_14_core_value(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, WHITE)
    add_top_line(slide)
    add_logo(slide)

    add_textbox(slide, ML, Cm(5.5), CW, Cm(1.2),
                "다른 업체들의 순위가 일제히 떨어질 때",
                Pt(22), False, DARK_TEXT, PP_ALIGN.CENTER)
    add_textbox(slide, ML, Cm(7.0), CW, Cm(1.5),
                "귀사의 순위를 지킬 수 있는",
                Pt(28), True, DARK_TEXT, PP_ALIGN.CENTER)
    add_textbox(slide, ML, Cm(8.8), CW, Cm(1.8),
                "가장 확실한 방법",
                Pt(36), True, BLUE, PP_ALIGN.CENTER)

    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                  (SLIDE_W - Cm(5)) // 2, Cm(11.0), Cm(5), Cm(0.08))
    line.fill.solid()
    line.fill.fore_color.rgb = GOLD
    line.line.fill.background()

    add_textbox(slide, ML, Cm(12.0), CW, Cm(1.0),
                "안정적으로 유지되는 순위가 실질적인 매출을 만듭니다",
                Pt(14), False, DARK_TEXT, PP_ALIGN.CENTER)

    add_footer(slide, 14)


def slide_15_ai_lab(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, LIGHT_BG)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "셀프마케팅 + AI로직연구소")
    add_accent_line(slide)

    add_textbox(slide, ML, Cm(3.5), CW, Cm(0.8),
                "출시 예정 | 귀사도 바로 사용 가능",
                Pt(13), False, RGBColor(0x66, 0x66, 0x66))

    data = [
        ["기능", "설명"],
        ["실시간 로직 모니터링", "경쟁사/동종업계 순위 및 추세를 3.5일 간격으로 감지"],
        ["맞춤 매체 추천", "현재 가장 안전하고 효율 좋은 트래픽 매체 안내"],
        ["자동 등록 및 전환", "충전 시 자동으로 매체 등록 및 전환"],
    ]

    tbl_w = Cm(18)
    col_ws = [Cm(6), Cm(12)]
    create_styled_table(slide, ML, Cm(5.0), tbl_w, 4, 2, data, col_ws)

    add_placeholder_image(slide, ML + tbl_w + Cm(1), Cm(5.0), CW - tbl_w - Cm(1), Cm(8.0),
                          "솔루션 화면")

    add_footer(slide, 15)


def slide_16_pricing(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, WHITE)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "견적 안내")
    add_accent_line(slide)

    data = [
        ["지점", "현재순위", "보장형(첫달)", "보장형(2개월~)", "안전보장형(권장)"],
        ["마크원애비뉴점", "13위", "1,800,000원", "1,200,000원", "900,000원"],
        ["나성1호점", "15위", "1,900,000원", "1,200,000원", "900,000원"],
        ["나성2호점", "20위", "2,100,000원", "1,200,000원", "900,000원"],
        ["반곡점", "21위", "2,200,000원", "1,200,000원", "900,000원"],
        ["4지점 합계", "—", "8,000,000원", "4,800,000원", "3,600,000원"],
    ]

    col_ws = [Cm(5.5), Cm(4), Cm(6), Cm(6.5), Cm(6.867)]
    ts = create_styled_table(slide, ML, BODY_TOP + Cm(0.3), CW, 6, 5, data, col_ws)
    tbl = ts.table

    for r in range(1, 6):
        bg = GOLD if r < 5 else NAVY
        tc = DARK_TEXT if r < 5 else WHITE
        _set_cell(tbl.cell(r, 4), data[r][4], Pt(11), r >= 5, tc, bg)

    for c in range(4):
        _set_cell(tbl.cell(5, c), data[5][c], Pt(11), True, WHITE, NAVY)

    add_textbox(slide, ML, Cm(11.5), CW, Cm(1.2),
                "4개 지점 동시 진행 시 지점당 900,000원 (개별 1,000,000원)",
                Pt(11), False, RGBColor(0x66, 0x66, 0x66))

    add_footer(slide, 16)


def slide_17_comparison(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, LIGHT_BG)
    add_top_line(slide)
    add_logo(slide)
    add_title(slide, "운영 조건 비교")
    add_accent_line(slide)

    data = [
        ["항목", "보장형", "안전보장형(권장)"],
        ["작업 방식", "공격적 트래픽 투입", "내부 로직 중심 안정적 관리"],
        ["순위 상승 속도", "빠름", "점진적 / 안정적"],
        ["하락 리스크", "높음 (로직 변경 시 급락)", "낮음 (패턴 감지 회피)"],
        ["결제 방식", "노출 후 결제", "월 관리비"],
        ["최소 계약 기간", "없음", "없음"],
        ["리포팅 주기", "1주일", "1주일 (대시보드 상시 확인)"],
        ["월 비용 (4지점)", "첫달 800만 / 유지 480만", "360만원 (균일)"],
    ]

    col_ws = [Cm(6), Cm(11), Cm(11.867)]
    ts = create_styled_table(slide, ML, BODY_TOP + Cm(0.3), CW, 8, 3, data, col_ws)
    tbl = ts.table

    _set_cell(tbl.cell(3, 1), data[3][1], Pt(10), True, RED,
              TABLE_ALT if 3 % 2 == 0 else TABLE_WHITE)
    _set_cell(tbl.cell(3, 2), data[3][2], Pt(10), True, GREEN,
              TABLE_ALT if 3 % 2 == 0 else TABLE_WHITE)

    add_highlight_box(slide, ML, Cm(13.5), CW, Cm(2.5),
                      "온다마케팅은 안전보장형을 권장드립니다.\n"
                      "어떤 방식을 선택하시더라도 최선의 결과를 만들겠습니다.",
                      RGBColor(0xEF, 0xF6, 0xFF), BLUE, DARK_TEXT, Pt(13), True)

    add_footer(slide, 17)


def slide_18_closing(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_bg(slide, NAVY)
    add_top_line(slide, GOLD)

    if os.path.exists(LOGO_PATH):
        lw, lh = Cm(10), Cm(3)
        slide.shapes.add_picture(LOGO_PATH, (SLIDE_W - lw) // 2, Cm(4.0), lw, lh)

    add_textbox(slide, ML, Cm(8.5), CW, Cm(2.0), "감사합니다",
                Pt(40), True, WHITE, PP_ALIGN.CENTER)

    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                  (SLIDE_W - Cm(5)) // 2, Cm(11.0), Cm(5), Cm(0.08))
    line.fill.solid()
    line.fill.fore_color.rgb = GOLD
    line.line.fill.background()

    add_textbox(slide, ML, Cm(12.0), CW, Cm(1.2),
                "어떤 방식을 선택하시더라도 최선의 결과를 만들겠습니다",
                Pt(16), False, GOLD, PP_ALIGN.CENTER)
    add_textbox(slide, ML, Cm(14.0), CW, Cm(0.8), "온다마케팅",
                Pt(12), False, WHITE, PP_ALIGN.CENTER)


# ═══════════════════════════════════════════
# 메인
# ═══════════════════════════════════════════

def main():
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H

    slide_01_cover(prs)
    slide_02_greeting(prs)
    slide_03_rule_change(prs)
    slide_04_defense_system(prs)
    slide_05_diagnosis(prs)
    slide_06_qa1(prs)
    slide_07_qa2(prs)
    slide_08_qa3(prs)
    slide_09_case_ranking(prs)
    slide_10_recovery(prs)
    slide_11_hair_salon(prs)
    slide_12_cascade(prs)
    slide_13_safe_guarantee(prs)
    slide_14_core_value(prs)
    slide_15_ai_lab(prs)
    slide_16_pricing(prs)
    slide_17_comparison(prs)
    slide_18_closing(prs)

    prs.save(OUTPUT)

    # 검증
    prs2 = Presentation(OUTPUT)
    assert len(prs2.slides) == 18, f"슬라이드 수 오류: {len(prs2.slides)}"
    size_kb = os.path.getsize(OUTPUT) / 1024
    print(f"✅ {len(prs2.slides)}슬라이드 생성 완료")
    print(f"✅ 파일 크기: {size_kb:.0f}KB")
    print(f"✅ 출력: {OUTPUT}")


if __name__ == "__main__":
    main()
