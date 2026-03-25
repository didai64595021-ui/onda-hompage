#!/usr/bin/env python3
"""마드모아젤헤어 제안서 PDF 수정: 목차 삽입 + 페이지 번호 추가"""

import fitz  # PyMuPDF
import os

SRC = "/home/onda/.openclaw/media/inbound/제목을_입력해주세요.---0124bb6e-ec2e-4007-a288-5d6022a24f02.pdf"
DST = "/home/onda/projects/onda-hompage/output/마드모아젤헤어_제안서_수정.pdf"

# 색상 정의
BLUE = fitz.pdfcolor["blue"]
ACCENT = (0.169, 0.341, 0.592)  # #2B5797
GRAY = (0.4, 0.4, 0.4)  # #666666
LIGHT_GRAY = (0.85, 0.85, 0.85)
WHITE = (1, 1, 1)
DARK_TEXT = (0.2, 0.2, 0.2)


def find_font(doc):
    """한글 폰트 경로 탐색"""
    candidates = [
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    # fallback: search system
    import subprocess
    result = subprocess.run(
        ["fc-list", ":lang=ko", "file"], capture_output=True, text=True
    )
    for line in result.stdout.strip().split("\n"):
        path = line.split(":")[0].strip()
        if path.endswith((".ttf", ".ttc", ".otf")) and os.path.exists(path):
            return path
    return None


def create_toc_page(doc, width, height, font_path):
    """목차 페이지를 새로 생성하여 doc에 삽입 (2번째 페이지로)"""
    # 새 페이지 삽입 (인덱스 1 = 2번째 위치)
    page = doc.new_page(pno=1, width=width, height=height)

    # 폰트 등록
    font_name = "korean"
    page.insert_font(fontname=font_name, fontfile=font_path)

    # --- 배경: 흰색 ---
    page.draw_rect(page.rect, color=None, fill=WHITE)

    # --- 왼쪽 장식 바 ---
    bar_rect = fitz.Rect(0, 0, 8, height)
    page.draw_rect(bar_rect, color=None, fill=ACCENT)

    # --- 제목 영역 ---
    title_y = 60
    # 작은 라벨
    page.insert_text(
        fitz.Point(60, title_y),
        "TABLE OF CONTENTS",
        fontname=font_name, fontsize=10, color=GRAY,
    )
    # 큰 제목
    page.insert_text(
        fitz.Point(60, title_y + 36),
        "목 차",
        fontname=font_name, fontsize=32, color=ACCENT,
    )

    # 제목 아래 구분선
    line_y = title_y + 52
    page.draw_line(
        fitz.Point(60, line_y), fitz.Point(width - 60, line_y),
        color=ACCENT, width=2,
    )

    # --- 목차 항목 ---
    toc_items = [
        ("01", "인사말", "3"),
        ("02", "2026년, 플레이스 마케팅 환경 변화", "4"),
        ("03", "데이터 기반 순위 방어 체계", "5"),
        ("04", "마드모아젤헤어 현황 진단", "6~7"),
        ("05", "Q&A: 원인 분석 및 회복 플랜", "8~10"),
        ("06", "순위 상승 로직 운용 사례", "11~14"),
        ("07", "작업 키워드 전략", "15"),
        ("08", "AI 로직 연구소 + 셀프 마케팅", "16~17"),
        ("09", "견적 안내", "18~21"),
        ("10", "마치며", "22"),
    ]

    start_y = line_y + 40
    row_height = 38
    left_margin = 60
    right_margin = width - 60

    for i, (num, title, pages) in enumerate(toc_items):
        y = start_y + i * row_height

        # 번호 (파란 원형 배경)
        circle_x = left_margin + 14
        circle_y = y + 1
        circle_r = 13
        page.draw_circle(
            fitz.Point(circle_x, circle_y),
            circle_r, color=None, fill=ACCENT,
        )
        # 번호 텍스트 (흰색)
        num_w = fitz.get_text_length(num, fontname="helv", fontsize=10)
        page.insert_text(
            fitz.Point(circle_x - num_w / 2, circle_y + 4),
            num,
            fontname=font_name, fontsize=10, color=WHITE,
        )

        # 제목 텍스트
        title_x = left_margin + 40
        page.insert_text(
            fitz.Point(title_x, y + 5),
            title,
            fontname=font_name, fontsize=13, color=DARK_TEXT,
        )

        # 점선 (제목 끝 ~ 페이지 번호 앞)
        title_text_w = fitz.get_text_length(title, fontname="helv", fontsize=13)
        dots_start = title_x + title_text_w + 20
        page_num_w = fitz.get_text_length(pages, fontname="helv", fontsize=12)
        dots_end = right_margin - page_num_w - 15

        if dots_end > dots_start:
            dot_y = y + 3
            x = dots_start
            while x < dots_end:
                page.draw_circle(
                    fitz.Point(x, dot_y), 0.8,
                    color=None, fill=LIGHT_GRAY,
                )
                x += 6

        # 페이지 번호 (오른쪽 정렬)
        page.insert_text(
            fitz.Point(right_margin - page_num_w, y + 5),
            pages,
            fontname=font_name, fontsize=12, color=ACCENT,
        )

        # 행 구분 연한 선 (마지막 제외)
        if i < len(toc_items) - 1:
            sep_y = y + row_height - 6
            page.draw_line(
                fitz.Point(left_margin + 40, sep_y),
                fitz.Point(right_margin, sep_y),
                color=LIGHT_GRAY, width=0.3,
            )

    # --- 하단 로고 텍스트 ---
    footer_y = height - 35
    page.insert_text(
        fitz.Point(60, footer_y),
        "ONDA MARKETING",
        fontname=font_name, fontsize=9, color=GRAY,
    )

    return page


def add_page_numbers(doc, font_path, total_pages):
    """모든 페이지에 오른쪽 상단 페이지 번호 추가"""
    font_name = "korean"

    for i in range(total_pages):
        page = doc[i]
        page.insert_font(fontname=font_name, fontfile=font_path)

        page_num_text = f"{i + 1} / {total_pages}"
        fontsize = 9

        text_w = fitz.get_text_length(page_num_text, fontname="helv", fontsize=fontsize)
        x = page.rect.width - text_w - 25
        y = 22

        # 반투명 배경 박스
        bg_rect = fitz.Rect(x - 6, y - 12, x + text_w + 6, y + 4)
        page.draw_rect(bg_rect, color=None, fill=(1, 1, 1), fill_opacity=0.7)

        page.insert_text(
            fitz.Point(x, y),
            page_num_text,
            fontname=font_name, fontsize=fontsize, color=GRAY,
        )


def main():
    doc = fitz.open(SRC)
    print(f"원본 페이지 수: {len(doc)}")

    width = doc[0].rect.width
    height = doc[0].rect.height
    print(f"페이지 크기: {width} x {height}")

    font_path = find_font(doc)
    if not font_path:
        raise RuntimeError("한글 폰트를 찾을 수 없습니다")
    print(f"폰트: {font_path}")

    # 1) 목차 페이지 삽입 (2번째 페이지)
    create_toc_page(doc, width, height, font_path)
    print(f"목차 삽입 후 페이지 수: {len(doc)}")

    # 2) 전체 페이지에 번호 추가
    add_page_numbers(doc, font_path, len(doc))
    print("페이지 번호 추가 완료")

    # 3) 저장
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    doc.save(DST, garbage=4, deflate=True)
    doc.close()
    print(f"저장 완료: {DST}")
    print(f"파일 크기: {os.path.getsize(DST):,} bytes")


if __name__ == "__main__":
    main()
