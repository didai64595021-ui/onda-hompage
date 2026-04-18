#!/usr/bin/env python3
"""
니치 10상품 자율 실행 최종 보고서 생성
- /tmp/niches-auto/results.txt 읽어서 성공/실패 집계
- gig-data-niches.js의 상품 메타 로드해서 전체 구조 요약
- 텔레그램 4096자 내 3부로 분할 출력 가능
"""
import json
import re
import subprocess
from pathlib import Path

RESULT_FILE = Path('/tmp/niches-auto/results.txt')
GIG_DATA = Path('/home/onda/projects/onda-hompage/kmong-crawler/new-gigs/gig-data-niches.js')

# Node로 PRODUCTS 로드 (js → json 변환)
proc = subprocess.run(
    ['node', '-e', f"const {{PRODUCTS}}=require('{GIG_DATA}'); console.log(JSON.stringify(PRODUCTS));"],
    capture_output=True, text=True, check=False
)
products = json.loads(proc.stdout) if proc.returncode == 0 else []

# 결과 로드
rows = {}
if RESULT_FILE.exists():
    for line in RESULT_FILE.read_text().strip().split('\n'):
        parts = line.split('|')
        if len(parts) >= 3:
            rows[parts[0]] = {'status': parts[1], 'url': parts[2],
                              'title': parts[3] if len(parts) > 3 else '',
                              'price': parts[4] if len(parts) > 4 else ''}

# ─────────────────────────
# 보고서 작성 (3부)
# ─────────────────────────
def part1():
    L = []
    L.append("📊 크몽 홈페이지 니치 10상품 자율 완주 보고서 [1/3]")
    L.append("")
    L.append("━ 개요 ━")
    L.append(f"• 생성 상품: {len(products)}개")
    ok = sum(1 for r in rows.values() if r['status'] == 'SUCCESS')
    fail = sum(1 for r in rows.values() if r['status'] == 'FAIL')
    L.append(f"• 임시저장 성공: {ok} / 실패: {fail}")
    L.append(f"• 모드: 임시저장까지만 (실 발행은 사용자 직접)")
    L.append(f"• 정책: feedback_kmong_human_submit.md 준수")
    L.append("")
    L.append("━ 10 SKU 임시저장 URL ━")
    for p in products:
        pid = p['id']
        r = rows.get(pid, {'status': '?', 'url': '-'})
        status_mark = '✅' if r['status'] == 'SUCCESS' else '❌'
        L.append(f"{status_mark} {pid} {p['title']}")
        if r.get('url') and r['url'] != '-':
            L.append(f"   {r['url']}")
        price_list = '/'.join(f"{pk['price']//10000}만" for pk in p['packages'])
        L.append(f"   카테고리: {p['cat2']} · 가격 STANDARD/DELUXE/PREMIUM: {price_list}")
    L.append("")
    L.append("━ CTR 최적화 (제목·썸네일) ━")
    L.append("• 제목 30자 내 숫자·가격·기간 명시 (\"월 0원\", \"연 40만\", \"3일완성\")")
    L.append("• 페인포인트 직격 (\"구독료 탈출\", \"자물쇠 아이콘\", \"검색순위 날아갔어요\")")
    L.append("• 검색 키워드 전방 배치 (빌더명·기술용어)")
    L.append("• 썸네일: OpenAI gpt-image-1 1536x1024 → Sharp 4:3 → 1304x976")
    L.append("  카테고리별 팔레트·아이콘 매핑, 헤드라인·가격배지·타겟배지 일관")
    return '\n'.join(L)


def part2():
    L = []
    L.append("📊 보고서 [2/3] — CVR/ROI 최적화 상세")
    L.append("")
    L.append("━ CVR 최적화 (상세페이지) ━")
    L.append("본문 7단 구조 모든 상품 공통:")
    L.append("1) Hero 페인포인트 1줄 인용")
    L.append("2) 이런 분께 추천 (4~5 페르소나)")
    L.append("3) Before vs After 비교 (가격·속도·수수료 등)")
    L.append("4) 차별화 (5개 체크 포인트)")
    L.append("5) 패키지 안내 (STANDARD/DELUXE/PREMIUM)")
    L.append("6) 작업 가능 범위")
    L.append("7) 보증 + CTA")
    L.append("")
    L.append("모든 상품에 FAQ 3~4개 내장 (auto-reply용 데이터)")
    L.append("")
    L.append("━ ROI/ROAS 자동봇 연동 지점 ━")
    L.append("• auto-reply.js: 각 상품 FAQ 배열 로드 → 문의 자동응답")
    L.append("• auto-quote.js: 각 상품 packages 3티어 → 견적 자동 산출")
    L.append("• ad-scheduler.js: 니치별 키워드 타겟팅 광고 분배")
    L.append("• change-creative.js: 제목·썸네일 A/B 전환 (데이터 7일 수집 후)")
    L.append("• analyze-conversion-funnel.js: 상품별 노출→클릭→문의 퍼널 추적")
    L.append("")
    L.append("━ 카테고리 전략 ━")
    cat_count = {}
    for p in products:
        cat_count[p['cat2']] = cat_count.get(p['cat2'], 0) + 1
    for c, n in sorted(cat_count.items(), key=lambda x: -x[1]):
        L.append(f"• {c}: {n}건")
    L.append("")
    L.append("━ 가격 구조 (실측 시장가 기반) ━")
    L.append("• 웹빌더 이전 5 SKU: STANDARD 25만~ (시장 중앙 33만 대비 진입 매력)")
    L.append("• 문의폼: 10/15/22만 (월 0원 운영, 진입가 대비 마진 구조)")
    L.append("• SSL: 10/15/20만 (연 33만 대체 앵커)")
    L.append("• 예약: 30/50/80만 (B2B·온라인 코칭 좁은 타겟)")
    L.append("• 다국어+이미지: 50/90/150만 (경쟁자 전무, 프리미엄)")
    L.append("• SEO 301: 20/30/40만 (리뉴얼 번들)")
    return '\n'.join(L)


def part3():
    L = []
    L.append("📊 보고서 [3/3] — 사용자 수동 작업 + 다음 단계")
    L.append("")
    L.append("━ 사용자 수동 점검 필수 ━")
    L.append("1. 각 draft URL 접속 → 제목·본문·썸네일·가격 검수")
    L.append("2. 크몽 '제출하기' 버튼은 사용자가 직접 (정책상 자동화 금지)")
    L.append("3. 본문 내 '아직 HTML 포맷팅 안 됨' → TipTap 에디터 수동 보정 필요 시")
    L.append("4. 썸네일은 메인 이미지 1장. 추가 4~9장 서브 갤러리는 별도 업로드")
    L.append("5. 포트폴리오 이미지 5장 (CVR 핵심) 업로드 권장")
    L.append("")
    L.append("━ N03 카페24 fallback 주의 ━")
    L.append("• 카페24 3차 카테고리 매칭 실패로 cat2를 '홈페이지 신규 제작'으로 우회 등록")
    L.append("• 제목에 '카페24·가비아' 키워드 유지되어 검색 유입은 가능")
    L.append("• 원하면 크몽 내 수동 카테고리 재지정으로 639/638로 이동 가능")
    L.append("")
    L.append("━ 남은 자동화 포인트 ━")
    L.append("• 제목·썸네일 A/B 2안씩 준비 (change-creative.js 이후 투입)")
    L.append("• auto-reply에 10상품 FAQ JSON 주입 (다음 세션)")
    L.append("• auto-quote 10상품 가격 로직 추가")
    L.append("• 퍼널 대시보드 10상품 단위 집계 설정")
    L.append("")
    L.append("━ 실측 데이터 참조 ━")
    L.append("• homepage-niches-report.json (23 카테고리·검색어 가격·리뷰)")
    L.append("• competitor-prices-report.json (9 카테고리 1페이지 상세)")
    L.append("• 4축 기준: 리뷰 5,000+ · 독식 60% 미만 · 중앙가 10만+ · 자동화 ★★★+")
    L.append("")
    L.append("━ 참고 자산 ━")
    L.append("• gig-data-niches.js (10상품 전체 데이터)")
    L.append("• generate-niche-images.js (OpenAI 썸네일 파이프라인)")
    L.append("• run-niches-autopilot.sh (자율 실행 스크립트)")
    L.append("• 메인 로그: /tmp/niches-auto/main.log")
    L.append("• 결과: /tmp/niches-auto/results.txt")
    L.append("")
    L.append("━ 다음 세션 Kick-off 제안 ━")
    L.append("1. 크몽 draft 10건 사람 검수 → 수정 지점 리스트업")
    L.append("2. 자동봇(auto-reply/auto-quote) 10상품 FAQ·가격 주입")
    L.append("3. 발행 후 7일 CTR/CVR 관찰 → A/B 2안 투입")
    L.append("4. 4주 후 저성과 상품 피벗/도태")
    return '\n'.join(L)


# ─────────────────────────
# 텔레그램 3부 전송 (직접 호출)
# ─────────────────────────
for part_name, part_fn in [('1', part1), ('2', part2), ('3', part3)]:
    msg = part_fn()
    # 텔레그램 전송
    subprocess.run(['node', '/home/onda/scripts/telegram-sender.js', msg], check=False)

# stdout 에는 통합 보고서 (run-autopilot 에서 리디렉션되어 보관용)
print(part1())
print("\n\n" + "=" * 60 + "\n\n")
print(part2())
print("\n\n" + "=" * 60 + "\n\n")
print(part3())
