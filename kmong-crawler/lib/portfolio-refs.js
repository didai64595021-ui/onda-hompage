/**
 * 크몽 답변 봇 전용 — 실제 존재하는 ONDA 포트폴리오 레퍼런스 DB
 *  - primary_intent=portfolio_request 또는 고객이 업종별 사례 요청 시 Claude에 주입
 *  - Claude가 가상의 "제조업체/서비스업 사례" 같은 할루시네이션 문구를 쓰는 걸 방지
 *  - 새 포트폴리오가 배포되면 여기만 갱신하면 됨 (live DB 없이 정적 유지)
 *
 *  선별 기준: 실제 배포 URL이 있고 확인 가능한 사이트만 등록
 */

// ⚠️ 이 리스트는 실제로 ONDA가 작업한 사이트만 등록. 고객이 공유한 참고 사이트 ≠ 우리 포트폴리오.
// 2026-04-20: theskyst.com, solum-materials.com 제거 — 고객이 공유한 타사 레퍼런스 사이트였음 (할루시 방지)
const PORTFOLIOS = [
  // 법무/세무/전문직
  { url: 'https://threeway1.com/', industry: '법무', title: '쓰리웨이 법무법인', highlights: ['전문직 브랜딩', '상담 CTA 강조'] },

  // 의료/병원
  { url: 'https://saeumdental.co.kr/', industry: '치과', title: '새움치과', highlights: ['모바일 반응형', '진료과목 구조화', '온라인 상담'] },
];

// 업종 키워드 → 포트폴리오 매칭용 역인덱스
const INDUSTRY_KEYWORDS = {
  '법무': ['법무', '변호사', '로펌', '법률'],
  '세무': ['세무', '세무사', '회계', '회계법인'],
  '치과': ['치과', '덴탈'],
  '의료': ['병원', '의원', '클리닉', '한의원', '피부과', '성형'],
  '미용': ['미용실', '헤어', '살롱', '뷰티'],
  '카페/음식': ['카페', '레스토랑', '음식점', '식당', '베이커리'],
  '제조/산업': ['제조', '공장', '산업', '소재', '부품', '기계'],
  '교육': ['학원', '교육', '아카데미', '과외'],
  '커머스': ['쇼핑몰', '이커머스', '판매', '브랜드'],
};

/**
 * 고객 메시지/대화에서 업종을 추론 → 관련 포트폴리오 반환
 * @param {string} text - 고객 메시지 또는 customer_facts 결합
 * @param {number} [limit=3] - 최대 반환 개수
 */
function findRelevantPortfolios(text, limit = 3) {
  const t = String(text || '').toLowerCase();
  if (!t) return [];  // 맥락 없으면 빈 배열 (이전: 전체 반환 → 엉뚱한 업종 노출 위험)

  // 업종 매칭
  const matchedIndustries = [];
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some(k => t.includes(k.toLowerCase()))) matchedIndustries.push(industry);
  }

  // ★ 엄격 매칭 — 매칭 업종이 없으면 빈 배열 반환 (가상 연결 금지)
  //   이전: 매칭 없으면 전체 포트폴리오를 노출 → Opus가 엉뚱한 업종을 "레퍼런스"로 오용
  if (matchedIndustries.length === 0) return [];

  return PORTFOLIOS.filter(p => matchedIndustries.includes(p.industry)).slice(0, limit);
}

/**
 * Claude 프롬프트에 주입할 블록 생성
 *  - 포트폴리오 URL + 업종 + 하이라이트를 나열 → 답변에 그대로 인용 가능
 */
function formatPortfoliosForPrompt(portfolios) {
  if (!portfolios || portfolios.length === 0) {
    // 해당 업종 ONDA 작업물이 없을 때 — 할루시네이션 방지 경고 블록
    return [
      '[ONDA 실존 포트폴리오 레퍼런스]',
      '⚠️ 해당 업종 실존 포트폴리오 **없음**.',
      '  → "저희가 작업한 사례" / "저희 포트폴리오" 주장 절대 금지.',
      '  → "맞춤 사례 선별해서 안내드리겠습니다" 또는 "해당 업종 레퍼런스는 상담 진행 시 별도로 정리해서 공유드리겠습니다" 로 안전 처리.',
      '  → 고객이 보내준 URL은 "참고 자료로 잘 확인했습니다" 식으로 수용만 하고, 절대 우리 작업인 것처럼 혼동시키지 말 것.',
    ].join('\n');
  }
  const lines = ['[ONDA 실존 포트폴리오 레퍼런스 — 답변 시 이 URL만 인용 가능, 가상 사례 창작 금지]'];
  portfolios.forEach((p, i) => {
    lines.push(`  ${i + 1}. ${p.title} (${p.industry}) — ${p.url}`);
    if (p.highlights && p.highlights.length) lines.push(`     특징: ${p.highlights.join(', ')}`);
  });
  lines.push(`⚠️ 규칙: 위에 없는 사이트·사례를 만들어내지 말 것. 부족하면 "맞춤 사례 선별해서 안내드리겠습니다" 로 처리.`);
  lines.push(`⚠️ 고객이 공유한 URL은 우리 작업물이 아님. "저희가 작업한 곳"으로 주장하지 말 것. 위 블록에 명시된 URL만 우리 실적.`);
  return lines.join('\n');
}

module.exports = { PORTFOLIOS, findRelevantPortfolios, formatPortfoliosForPrompt };
