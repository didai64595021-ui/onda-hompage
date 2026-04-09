/**
 * 크몽 8상품 v2 — Phase E (빈 필드 보강)
 *
 * gig-data.js (Phase D, Step1+Step2 기본) 에 추가로 채워야 하는 데이터:
 *   - draftId: 2026-04-09 14:45 Phase D 결과의 임시저장 ID
 *   - subCategoryId: 카테고리 select 매핑 (URL 인자)
 *   - revision: 수정 및 재진행 안내 textarea (REVISION.valueData.revision)
 *   - gallery: 상세 이미지 갤러리 9슬롯 중 3슬롯 채울 추가 이미지 path
 *   - extraSelects: 카테고리별 추가 select (개발언어/백엔드/DB 등) — 라벨 + 값
 *     · 일부는 discoverSelects 가 라벨을 잘못 잡음 (옵션 텍스트가 라벨로 detected)
 *     · 그 경우 잘못 잡힌 라벨로 그대로 매칭 (추가 코드 변경 없이 트릭)
 *
 * 정찰 출처:
 *   - recon-empty-fields-{761234,761240,761243}.json
 *   - recon-select-options-{761234,761237,761240,761243}.json
 */

// ─── 공통 수정 및 재진행 안내 ─────────────────────────────────
const COMMON_REVISION = `[수정 범위 — 무료]
✓ 톤·오탈자·UI 색상·문구·정렬
✓ 명시된 사양 내 미세 조정
✓ 인도 후 24시간 내 발견된 버그/누락
✓ 일정 변경 (상호 협의)
✓ 사이트 구조 변경 등 외부 요인에 의한 패치 (A/S 기간 내)

[수정 범위 — 추가 요금]
✗ 기획서 외 신규 기능 추가
✗ 사양 변경 (DB 구조·UI 전면 개편)
✗ 외부 API 신규 연동
✗ 데이터 구조 변경
✗ 변심에 의한 디자인 전면 변경
✗ 정기 유지보수 (별도 견적)

[수정 횟수]
- Standard: 명시된 횟수 + 인도 후 단기 패치
- Deluxe: 추가 수정 + 중기 무상 유지
- Premium: 수정 무제한 + 장기 무상 유지

[재진행 / 환불 기준]
- 작업 착수 전: 100% 환불 가능
- 1차 데모 전 (작업 50% 미만): 부분 환불
- 1차 데모 후: 작업 진행도 기준 상호 협의
- 단순 변심 환불: 진행도에 따라 차등

[A/S 기간 — 패키지 참조]
인도 후 무상 유지 기간은 패키지마다 다릅니다. Standard 7~30일 / Deluxe 14~90일 / Premium 30일~6개월. 기간 내 사이트 구조 변경, 외부 API 변동 등 외부 요인에 의한 패치는 무료입니다.

[연락]
채팅·전화·화상 모두 가능. 평일 09~21시 24시간 내 답변 보장. 긴급 건은 주말도 가능합니다.`;

// ─── 상품별 extras ──────────────────────────────────────────
const EXTRA = {
  // 01 PDF 1장 AI 상담봇 — 667
  // Phase E1 후 selectMap 라벨이 정상화됨 ("사용하는 AI 툴" 로 detect)
  // 활용 목적은 이미 multi-select 형태로 들어가 있어 추가 필요 없음
  '01': {
    draftId: '761234',
    subCategoryId: '667',
    revision: COMMON_REVISION,
    gallery: ['04-openai.png', '02-openai.png', '06-openai.png'],
    extraSelects: [
      { label: '사용하는 AI 툴', value: 'ChatGPT' },
    ],
  },

  // 02 사내문서 검색 RAG 챗봇 — 667
  '02': {
    draftId: '761236',
    subCategoryId: '667',
    revision: COMMON_REVISION,
    gallery: ['06-openai.png', '04-openai.png', '02-openai.png'],
    extraSelects: [
      { label: '사용하는 AI 툴', value: 'ChatGPT' },
      { label: '활용 목적', value: '사내 문서 검색용 GPT' },
    ],
  },

  // 03 5만원 단발 업무자동화 — 663 (빈 select 없음)
  '03': {
    draftId: '761237',
    subCategoryId: '663',
    revision: COMMON_REVISION,
    gallery: ['03-openai.png', '01-openai.png', '02-openai.png'],
    extraSelects: [],
  },

  // 04 직원 3명분 GPT 자동화 — 663 (빈 select 없음)
  '04': {
    draftId: '761239',
    subCategoryId: '663',
    revision: COMMON_REVISION,
    gallery: ['03-openai.png', '02-openai.png', '06-openai.png'],
    extraSelects: [],
  },

  // 05 5만원 1일 매크로 — 605 (9개 select)
  '05': {
    draftId: '761240',
    subCategoryId: '605',
    revision: COMMON_REVISION,
    gallery: ['01-openai.png', '03-openai.png', '02-openai.png'],
    extraSelects: [
      { label: '개발 언어', value: 'Python' },
      { label: '프런트엔드', value: 'Bootstrap' },        // 단발 매크로 — 거의 무관, fallback
      { label: '백엔드', value: 'Flask' },                // 가장 가벼움
      { label: '데이터베이스', value: 'MySQL' },          // SQLite 옵션 없음 → MySQL
      { label: '클라우드', value: 'Heroku' },             // 사용자 PC 매크로 — fallback
      { label: '기타·소프트웨어', value: 'Make' },         // 자동화 친화
      { label: '기능 추가', value: '0개', nth: 0 },        // STD
      { label: '기능 추가', value: '2개', nth: 1 },        // DLX
      { label: '기능 추가', value: '5개', nth: 2 },        // PRM
    ],
  },

  // 06 풀스택 자동화 1주 — 605 (9개 select)
  '06': {
    draftId: '761242',
    subCategoryId: '605',
    revision: COMMON_REVISION,
    gallery: ['02-openai.png', '03-openai.png', '01-openai.png'],
    extraSelects: [
      { label: '개발 언어', value: 'Python' },
      { label: '프런트엔드', value: 'Tailwind CSS' },
      { label: '백엔드', value: 'FastAPI' },
      { label: '데이터베이스', value: 'PostgreSQL' },
      { label: '클라우드', value: 'Amazon RDS' },
      { label: '기타·소프트웨어', value: 'Make' },
      { label: '기능 추가', value: '5개', nth: 0 },        // STD
      { label: '기능 추가', value: '10개', nth: 1 },       // DLX
      { label: '기능 추가', value: '20개', nth: 2 },       // PRM
    ],
  },

  // 07 1회 데이터 수집 — 645 (6개 select)
  '07': {
    draftId: '761243',
    subCategoryId: '645',
    revision: COMMON_REVISION,
    gallery: ['02-openai.png', '03-openai.png', '01-openai.png'],
    extraSelects: [
      { label: '개발 언어', value: 'Python' },
      { label: '프런트엔드', value: 'Bootstrap' },
      { label: '백엔드', value: 'Flask' },
      { label: '데이터베이스', value: 'PostgreSQL' },
      { label: '클라우드', value: 'Amazon S3' },          // CSV 저장 대안
      { label: '기타·소프트웨어', value: 'Chrome Extension' },
    ],
  },

  // 08 경쟁사 SKU 정기 수집 — 645 (6개 select)
  '08': {
    draftId: '761245',
    subCategoryId: '645',
    revision: COMMON_REVISION,
    gallery: ['02-openai.png', '06-openai.png', '03-openai.png'],
    extraSelects: [
      { label: '개발 언어', value: 'Python' },
      { label: '프런트엔드', value: 'React' },
      { label: '백엔드', value: 'FastAPI' },
      { label: '데이터베이스', value: 'PostgreSQL' },
      { label: '클라우드', value: 'Amazon RDS' },
      { label: '기타·소프트웨어', value: 'Make' },
    ],
  },
};

module.exports = { EXTRA, COMMON_REVISION };
