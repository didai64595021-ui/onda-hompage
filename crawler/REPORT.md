# 📊 UI 잠재고객 크롤러 — 개발 완료 보고서

**작업일:** 2026-03-06 ~ 2026-03-07
**프로젝트:** onda-hompage/crawler
**커밋:** dc9b287 (main)

---

## 🏗️ 구현한 전체 기능 목록

### 1. 크롤러 (crawl.js) — v3 대량 수집 엔진

**하루 2만 API 풀가동 설계**

| 항목 | 수치 |
|------|------|
| 업종 | 110개 (병원14 + 학원12 + 인테리어8 + 법률7 + 부동산5 + 웨딩6 + 숙박5 + 분양5 + 뷰티8 + 피트니스8 + 청소6 + 자동차6 + 반려동물4 + 교육5 + 음식4 + 기타7) |
| 지역 | 68개 (서울25구 + 경기21 + 인천6 + 부산5 + 대구4 + 대전3 + 광주2 + 제주2) |
| 검색 조합 | 7,480개 (매일 셔플 → 중복 최소화) |
| API 한도 | 20,000/일 추적 (api-usage.json) |
| 한도 도달 시 | 자동 중단, 다음날 이어서 |

**수집 데이터:**
- 업체명, 주소, 네이버 플레이스 링크, 홈페이지 URL
- 반응형 여부 (viewport + media query 체크)
- UI 문제점 자동 감지 (비반응형, 전화버튼X, 카톡X, 문의폼X, 지도X, 로딩느림)
- 연락처: 전화/이메일/카카오톡/카카오오픈채팅/인스타그램/네이버예약 (매체별 분리)
- 우선순위 점수 (0~100, 문제 많을수록 높음)
- 추천 패키지 자동 매칭
- TM 스크립트 + 문자 템플릿 자동 생성
- 이메일 템플릿 파일 자동 생성

**중복 방지:**
- history.json에 전체 DB 유지 (업체명+주소 키)
- 매 실행 시 기존 DB 전부 로드 → 중복 스킵
- 신규만 별도 CSV 분리 (new-YYYY-MM-DD.csv)
- 검색어 매일 셔플 → 같은 순서 반복 방지

**실행:** `npm run crawl` (전체) / `npm run test` (테스트 6조합)

---

### 2. 발송기 (sender.js) — 매체별 통합 발송

**지원 매체:**

| 매체 | 발송 방식 | 설정 |
|------|-----------|------|
| 📱 SMS 문자 | CoolSMS API v4 자동 발송 | COOLSMS_API_KEY, COOLSMS_API_SECRET, COOLSMS_SENDER |
| 📧 이메일 | SMTP (Gmail 등) 자동 발송 | SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS |
| 💬 카카오 알림톡 | 비즈메시지 API 자동 발송 | KAKAO_ALIMTALK_KEY, KAKAO_SENDER_KEY |
| 💛 카카오톡 채널 | 수동 (메시지 가이드 생성) | - |
| 📸 인스타 DM | 수동 (메시지 가이드 생성) | - |

**명령어:**
```
node sender.js list [--new] [--score N] [--category X]   리스트 조회
node sender.js preview <업체명>                           전 매체 미리보기
node sender.js send <업체명> [--sms] [--email] [--all]   개별 발송
node sender.js batch [--sms] [--email] [--score N] [--limit N]  일괄 발송
node sender.js status <업체명> <상태>                     TM 상태 변경
node sender.js stats                                      통계
node sender.js export [--status 미연락]                   CSV 추출
node sender.js channels                                   채널 상태 확인
```

**스팸 방지:** SMS 3초 간격, 이메일 5초 간격, 배치당 최대 100건

---

### 3. 스크린샷 캡처 + 진단 리포트 (screenshot.js)

- Puppeteer + Chrome으로 데스크톱/모바일 스크린샷 자동 캡처
- 각 업체별 폴더: desktop.png, mobile.png, mobile-full.png
- **진단 리포트 HTML 자동 생성** — 고객에게 바로 보낼 수 있는 형태
  - 종합 점수 (색상 뱃지)
  - 발견된 문제 목록
  - 전후 스크린샷
  - 체크리스트 (반응형/전화/카톡/폼/지도/속도)
  - 추천 패키지 + 가격
  - CTA (문의 연결)

**실행:** `npm run screenshot` / `npm run screenshot:urgent` (60점 이상만)

---

### 4. 경쟁사 비교 (compare.js)

- 특정 업체 vs 같은 업종/지역 경쟁사 자동 비교
- 경쟁사 사이트 분석 (반응형/전화/카톡/폼/지도/로딩속도)
- 점수 기반 순위 매기기
- **TM 멘트 자동 생성**: "같은 지역 OO치과는 잘 되어있는데, 대표님 사이트는..."

**실행:** `npm run compare -- "업체명"` / `npm run compare -- --category 치과 강남`

---

### 5. 대시보드 (dashboard.js)

- CLI 텍스트 대시보드 + HTML 대시보드 생성
- 수집/발송/TM상태/매출/업종별/패키지별 전체 현황
- 다크모드 HTML (브라우저에서 열기)

**실행:** `npm run dashboard` / `npm run dashboard:html`

---

### 6. 견적서 자동 생성기 (tools/quote-generator.js)

- 크롤링 데이터 기반 맞춤 견적서 HTML
- 고객 정보 + 진단 결과 + 견적 항목 + 결제 안내
- 견적번호/발행일/유효기간 자동 생성
- 패키지별 세부 항목 + 가격 명세
- 3일 내 결제 10% 할인 프로모션 포함
- **일괄 생성 가능** (점수 60+ 전체)

**실행:** `npm run quote -- "업체명"` / `npm run quote:batch`

---

### 7. TM 스크립트 매뉴얼 (tools/tm-manual.js)

- 전화 영업 완전 매뉴얼 HTML
- **3단계 스크립트:** 오프닝(30초) → 문제 제시(1분) → 솔루션 제안(30초)
- **업종별 맞춤 멘트** (병원/학원/인테리어/미용실/필라테스/부동산/법률/웨딩)
- **반론 처리 6가지:** 바빠요/필요없어요/비싸요/다른데서할거예요/새로만들거예요/안받음
- **후속 문자 템플릿 3종:** 즉시/3일후/2주후
- **TM 성과 기준표**

**실행:** `npm run tm-manual`

---

### 8. 고객 CRM (tools/crm.js)

- 리드 → 시안발송 → 견적발송 → 협의중 → 계약 → 작업중 → 완료 → 유지보수 파이프라인
- 고객별 상태/가격/메모/팔로업날짜 관리
- 파이프라인 시각화 (막대 그래프)
- 매출 기록 + 월별 조회
- 유지보수(MRR) 고객 별도 관리
- 상태 변경 히스토리 추적

**실행:** `npm run crm -- pipeline` / `npm run crm -- add "업체명" --status 계약 --price 200000`

---

### 9. 팔로업 시퀀스 (tools/followup-sequence.js)

- TM 후 자동 후속 발송 시퀀스
- **4단계:** D+0 즉시문자 → D+3 리마인드 → D+7 이메일 → D+14 마지막문자
- 업체별 진행 상태 추적
- 일시중지/취소 가능
- 매일 체크 → 오늘 발송할 건 표시

**실행:** `npm run followup -- add "업체명"` / `npm run followup -- check` / `npm run followup -- run`

---

### 10. 포트폴리오 사이트 (tools/portfolio-site.js)

- 서비스 소개 랜딩페이지 HTML 자동 생성
- Hero + 통계 + 문제점 + 프로세스 + 가격표 + CTA + 문의폼
- 완전 반응형 디자인
- SEO 메타태그 포함

**실행:** `npm run portfolio`

---

### 11. 크몽/숨고 상품 페이지 (tools/kmong-listing.js)

- 플랫폼 등록용 상품 설명 HTML **3종**:
  1. 긴급 반응형 수정 5만원
  2. 전화/카톡 버튼 추가 3만원
  3. 전환율 UP 패키지 20만원
- 문제점 → 작업내용 → 가격 → 보장 → FAQ 구조
- 바로 크몽에 복붙 가능

**실행:** `npm run kmong`

---

### 12. UI 템플릿 라이브러리 (tools/template-library.js)

- 자주 쓰는 UI 컴포넌트 **8종** 코드 스니펫:
  - 📞 클릭 전화 버튼 (모바일 고정)
  - 💬 카카오톡 버튼 (모바일 고정)
  - 🎯 CTA 배너 (상단/하단)
  - 📝 문의폼 (반응형)
  - 🗺️ 네이버 지도 임베드
  - 💰 가격표 (반응형)
  - 📊 GA + Meta Pixel 코드
  - 📱 반응형 메타태그
- CLI에서 바로 복사 가능
- HTML 미리보기 생성

**실행:** `npm run templates` / `npm run templates:html` / `node tools/template-library.js phone-btn`

---

### 13. 경쟁사 모니터링 (tools/competitor-monitor.js)

- 타깃 업체 홈페이지 변경 감지
- 반응형/전화/카톡/폼/지도 + HTML 해시 비교
- 자체 개선한 업체 = TM 우선순위 조정
- 히스토리 30건 보관

**실행:** `npm run monitor`

---

### 14. 월간 리포트 (tools/monthly-report.js)

- 크롤링/발송/계약 성과 HTML 리포트
- 다크모드 대시보드 디자인
- 신규수집/DB누적/발송/API사용/계약/매출 카드
- TM 파이프라인 바 차트
- 업종별 수집 + 매출 상세

**실행:** `npm run report` / `npm run report -- 2026-03`

---

### 15. 자동 스케줄링 (scheduler.js + PM2)

- PM2 `ui-prospect-crawler`로 상시 구동
- 매일 **22:00 KST** 자동 크롤링 시작
- 00:00~21:59는 블로그 크롤러에 API 양보
- 2만 API 소진 시 자동 중단
- 매 30분 체크

---

## 📁 파일 구조

```
crawler/
├── crawl.js                   크롤러 v3 (110업종 × 68지역, 2만API)
├── sender.js                  통합 발송기 v2 (SMS/이메일/카카오/인스타)
├── screenshot.js              스크린샷 + 진단 리포트
├── compare.js                 경쟁사 비교
├── dashboard.js               대시보드
├── scheduler.js               PM2 스케줄러
├── package.json               스크립트 30+개
├── tools/
│   ├── quote-generator.js     견적서 생성기
│   ├── tm-manual.js           TM 매뉴얼 + 반론처리
│   ├── crm.js                 고객 CRM
│   ├── followup-sequence.js   팔로업 시퀀스
│   ├── portfolio-site.js      포트폴리오 사이트
│   ├── kmong-listing.js       크몽 상품 페이지
│   ├── template-library.js    UI 템플릿 라이브러리
│   ├── competitor-monitor.js  경쟁사 모니터링
│   └── monthly-report.js      월간 리포트
└── output/
    ├── prospects.csv           전체 CSV
    ├── prospects-all.csv       DB 전체 덤프
    ├── new-YYYY-MM-DD.csv      일별 신규
    ├── history.json            히스토리 DB
    ├── api-usage.json          API 사용량
    ├── send-log.json           발송 로그
    ├── crm.json                CRM 데이터
    ├── monitor.json            모니터링 데이터
    ├── dashboard.html          대시보드
    ├── tm-manual.html          TM 매뉴얼
    ├── portfolio-site.html     포트폴리오
    ├── template-library.html   템플릿 라이브러리
    ├── report-YYYY-MM.html     월간 리포트
    ├── screenshots/            업체별 스크린샷
    ├── reports/                업체별 진단 리포트
    ├── quotes/                 견적서
    ├── emails/                 이메일 템플릿
    ├── listings/               크몽 상품 페이지
    └── comparisons/            경쟁사 비교 결과
```

---

## 🔧 발송 활성화 방법

현재 발송 채널은 API 키 미설정 상태. 아래 환경변수 설정하면 바로 작동:

```bash
# SMS (CoolSMS)
export COOLSMS_API_KEY="your_key"
export COOLSMS_API_SECRET="your_secret"
export COOLSMS_SENDER="010XXXXXXXX"  # 등록된 발신번호

# 이메일 (Gmail)
export SMTP_USER="your@gmail.com"
export SMTP_PASS="앱비밀번호"  # Gmail 앱 비밀번호
export SMTP_FROM="your@gmail.com"

# 카카오 알림톡 (선택)
export KAKAO_ALIMTALK_KEY="your_key"
export KAKAO_SENDER_KEY="your_sender_key"
export KAKAO_TEMPLATE_CODE="your_template"
```

---

## 📊 테스트 결과 (테스트 모드 6조합)

- 신규 수집: 37건 (DB 누적)
- 긴급(60+점): 11건 → 풀리뉴얼/응급팩 대상
- 중간(30~59점): 9건 → 전환형/스타터팩 대상
- 전화 보유: 68% | 이메일: 19% | 카카오톡: 41%
- 견적서 일괄 생성: 11건 정상
- 모든 도구 정상 작동 확인

---

## 💡 다음 단계 제안

1. **CoolSMS + Gmail 앱비밀번호 설정** → 자동 발송 활성화
2. **오늘 22시 풀 크롤링** → 2만 API로 수천 건 수집 예상
3. **크몽/숨고 상품 등록** → listings/ 폴더의 HTML 활용
4. **TM 매뉴얼 숙지 후 아웃바운드 시작** → tm-manual.html
5. **포트폴리오 사이트 배포** → portfolio-site.html을 도메인에 연결
