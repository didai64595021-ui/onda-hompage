/**
 * 크몽 답변 봇 전용 — 실제 존재하는 ONDA 포트폴리오 레퍼런스 DB
 *  - primary_intent=portfolio_request 또는 고객이 업종별 사례 요청 시 Claude에 주입
 *  - Claude가 가상의 "제조업체/서비스업 사례" 같은 할루시네이션 문구를 쓰는 걸 방지
 *  - 새 포트폴리오가 배포되면 여기만 갱신하면 됨 (live DB 없이 정적 유지)
 *
 *  선별 기준: 실제 배포 URL이 있고 확인 가능한 사이트만 등록
 */

const PORTFOLIOS = [
  // 법무/세무/전문직
  { url: 'https://threeway1.com/', industry: '법무', title: '쓰리웨이 법무법인', highlights: ['전문직 브랜딩', '상담 CTA 강조'] },
  { url: 'https://theskyst.com/', industry: '제조/산업', title: '더스카이스트', highlights: ['B2B 제조 브랜드', '제품 라이업'] },
  { url: 'https://solum-materials.com/', industry: '제조/산업', title: '솔레르티아 소재', highlights: ['소재 제조', 'R&D 실적'] },

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
  if (!t) return PORTFOLIOS.slice(0, limit);

  // 업종 매칭
  const matchedIndustries = [];
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some(k => t.includes(k.toLowerCase()))) matchedIndustries.push(industry);
  }

  const matched = matchedIndustries.length
    ? PORTFOLIOS.filter(p => matchedIndustries.includes(p.industry))
    : [];

  // 매칭 포트폴리오가 부족하면 전체에서 보충
  const rest = PORTFOLIOS.filter(p => !matched.includes(p));
  return [...matched, ...rest].slice(0, limit);
}

/**
 * Claude 프롬프트에 주입할 블록 생성
 *  - 포트폴리오 URL + 업종 + 하이라이트를 나열 → 답변에 그대로 인용 가능
 */
function formatPortfoliosForPrompt(portfolios) {
  if (!portfolios || portfolios.length === 0) return '';
  const lines = ['[ONDA 실존 포트폴리오 레퍼런스 — 답변 시 이 URL만 인용 가능, 가상 사례 창작 금지]'];
  portfolios.forEach((p, i) => {
    lines.push(`  ${i + 1}. ${p.title} (${p.industry}) — ${p.url}`);
    if (p.highlights && p.highlights.length) lines.push(`     특징: ${p.highlights.join(', ')}`);
  });
  lines.push(`⚠️ 규칙: 위에 없는 사이트·사례를 만들어내지 말 것. 부족하면 "맞춤 사례 선별해서 안내드리겠습니다" 로 처리.`);
  return lines.join('\n');
}

module.exports = { PORTFOLIOS, findRelevantPortfolios, formatPortfoliosForPrompt };
