#!/usr/bin/env python3
"""마드모아젤헤어 제안서: 목차 삽입 + 페이지 번호 추가"""
import fitz  # PyMuPDF

SRC = "/home/onda/.openclaw/media/inbound/마드모아젤헤어---8bd41930-bbf9-4dad-8cc2-67de71565daf.pdf"
DST = "/home/onda/projects/onda-hompage/output/마드모아젤헤어_제안서_v2.pdf"

# Korean-capable font
KO_FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"

# Colors
BLUE = fitz.pdfcolor["white"]  # placeholder, set manually
BLUE_RGB = (0x2B / 255, 0x57 / 255, 0x97 / 255)  # #2B5797
GRAY_RGB = (0x66 / 255, 0x66 / 255, 0x66 / 255)  # #666666
WHITE_RGB = (1, 1, 1)
LIGHT_GRAY_RGB = (0.95, 0.95, 0.95)

# TOC items (title, page_str) - page numbers AFTER toc insertion
TOC_ITEMS = [
    ("인사말", "3"),
    ("2026년, 플레이스 마케팅 환경 변화", "4"),
    ("데이터 기반 순위 방어 체계", "5"),
    ("마드모아젤헤어 현황 진단", "6~7"),
    ("Q&A: 원인 분석 및 회복 플랜", "8~10"),
    ("순위 상승 로직 운용 사례", "11~14"),
    ("작업 키워드 전략", "15"),
    ("AI 로직 연구소 + 셀프 마케팅", "16~17"),
    ("견적 안내", "18~21"),
    ("마치며", "22~23"),
]

TOTAL_PAGES = 23  # after TOC insertion


def build_toc_page(doc):
    """Create a TOC page and insert it at index 1 (after cover)."""
    # Page dimensions matching existing pages
    w, h = 842.25, 595.5
    page = doc.new_page(pno=1, width=w, height=h)

    # Register Korean font
    font = fitz.Font(fontfile=KO_FONT)
    page.insert_font(fontname="ko", fontbuffer=font.buffer)

    # --- Background: white (default) ---

    # --- Decorative left accent bar ---
    page.draw_rect(fitz.Rect(0, 0, 8, h), color=None, fill=BLUE_RGB)

    # --- Title area ---
    # "TABLE OF CONTENTS" - English title
    page.insert_text(
        fitz.Point(60, 100),
        "TABLE OF CONTENTS",
        fontname="helv",
        fontsize=28,
        color=BLUE_RGB,
    )

    # Underline decoration
    page.draw_line(fitz.Point(60, 110), fitz.Point(350, 110), color=BLUE_RGB, width=2)

    # "목 차" subtitle
    page.insert_text(
        fitz.Point(60, 140),
        "목 차",
        fontname="ko",
        fontsize=14,
        color=GRAY_RGB,
    )

    # --- TOC Items ---
    start_y = 190
    item_height = 36
    left_margin = 70
    page_num_x = 750  # right-aligned area for page numbers
    content_width = page_num_x - left_margin - 40  # space for dot leaders

    for idx, (title, page_str) in enumerate(TOC_ITEMS):
        y = start_y + idx * item_height
        num = idx + 1

        # Alternating row background
        if idx % 2 == 0:
            page.draw_rect(
                fitz.Rect(left_margin - 10, y - 18, 790, y + 16),
                color=None,
                fill=LIGHT_GRAY_RGB,
            )

        # Number badge (circle with number)
        badge_cx = left_margin + 12
        badge_cy = y - 3
        page.draw_circle(fitz.Point(badge_cx, badge_cy), 11, color=None, fill=BLUE_RGB)
        # Number text (white, centered in circle)
        num_str = str(num)
        num_offset_x = badge_cx - 3.5 if num < 10 else badge_cx - 7
        page.insert_text(
            fitz.Point(num_offset_x, badge_cy + 4),
            num_str,
            fontname="helv",
            fontsize=10,
            color=WHITE_RGB,
        )

        # Title text
        title_x = left_margin + 35
        page.insert_text(
            fitz.Point(title_x, y),
            title,
            fontname="ko",
            fontsize=12,
            color=(0.15, 0.15, 0.15),
        )

        # Estimate title width for CJK text (fitz.get_text_length doesn't support custom fonts)
        # CJK chars are roughly fontsize wide, ASCII roughly fontsize*0.6
        title_width = 0
        for ch in title:
            if ord(ch) > 0x7F:
                title_width += 12  # CJK: ~1em
            else:
                title_width += 7  # ASCII: ~0.6em

        # Dot leader
        dot_start_x = title_x + title_width + 10
        dot_end_x = page_num_x - 20
        if dot_start_x < dot_end_x:
            dots = ""
            dot_w = fitz.get_text_length("·", fontname="helv", fontsize=10)
            if dot_w > 0:
                num_dots = int((dot_end_x - dot_start_x) / (dot_w + 1.5))
                dots = " ".join(["·"] * num_dots)
            else:
                num_dots = int((dot_end_x - dot_start_x) / 5)
                dots = " · " * (num_dots // 3)

            page.insert_text(
                fitz.Point(dot_start_x, y),
                dots,
                fontname="helv",
                fontsize=8,
                color=(0.7, 0.7, 0.7),
            )

        # Page number (right-aligned)
        page.insert_text(
            fitz.Point(page_num_x, y),
            page_str,
            fontname="helv",
            fontsize=12,
            color=BLUE_RGB,
        )

    # --- Bottom decorative line ---
    page.draw_line(
        fitz.Point(60, h - 50), fitz.Point(w - 60, h - 50),
        color=BLUE_RGB, width=0.5
    )

    # Footer text
    page.insert_text(
        fitz.Point(60, h - 35),
        "ONDA MARKETING",
        fontname="helv",
        fontsize=8,
        color=GRAY_RGB,
    )

    return page


def add_page_numbers(doc):
    """Add page numbers to all pages: 'N / 23' at top-right."""
    total = len(doc)
    for i in range(total):
        page = doc[i]
        w = page.rect.width
        text = f"{i + 1} / {total}"

        # Position: top-right with some margin
        text_width = fitz.get_text_length(text, fontname="helv", fontsize=9)
        x = w - text_width - 30
        y = 25

        # Semi-transparent background for readability
        bg_rect = fitz.Rect(x - 5, y - 12, x + text_width + 5, y + 4)
        page.draw_rect(bg_rect, color=None, fill=WHITE_RGB, overlay=True)
        page.draw_rect(bg_rect, color=None, fill=(1, 1, 1, 0.7), overlay=True)

        page.insert_text(
            fitz.Point(x, y),
            text,
            fontname="helv",
            fontsize=9,
            color=GRAY_RGB,
            overlay=True,
        )


def main():
    doc = fitz.open(SRC)
    print(f"Original: {len(doc)} pages")

    # Step 1: Insert TOC page after cover (at index 1)
    build_toc_page(doc)
    print(f"After TOC insertion: {len(doc)} pages")

    # Step 2: Add page numbers to all pages
    add_page_numbers(doc)
    print("Page numbers added")

    # Save
    doc.save(DST, garbage=4, deflate=True)
    doc.close()
    print(f"Saved: {DST}")


if __name__ == "__main__":
    main()
