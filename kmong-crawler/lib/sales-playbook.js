/**
 * 크몽 답변 봇 — 업종별 sales playbook DB
 *  - 고객 업종/업태에 맞는 세일즈 포인트, 흔한 우려, 성공 CTA, 추천 옵션을 프롬프트에 주입
 *  - Claude 답변이 일반론에서 "해당 업종 전문가가 얘기하는 수준"으로 진화
 *
 *  신규 업종 추가는 PLAYBOOKS 배열에 엔트리 하나만 추가하면 됨
 */

const PLAYBOOKS = [
  {
    key: '치과',
    industry_keywords: ['치과', '덴탈', '임플란트', '교정', '치주', '보철'],
    selling_points: [
      '진료과목 모바일 한눈 노출 (환자 검색 1순위)',
      '네이버 예약 연동으로 예약 전환율 30%↑',
      '원장 소개 + 진료 후기 섹션 (신뢰도 핵심)',
      '카카오톡 상담 채널 (젊은 환자층 선호)',
    ],
    common_concerns: [
      '의료법 표시광고 규정 위반 우려 → 우리가 문구 사전 검토',
      '이전 병원 홈페이지 관리비가 월 30만원대 → 우리는 호스팅 무료',
      '예약 많아지면 일정 관리 부담 → 네이버 예약 연동으로 자동화',
    ],
    recommended_options: ['네이버 예약 버튼', '카카오톡 채널 연동', 'SEO 심화 등록'],
    success_cta: '지역명 + 진료과목 상위노출을 위해 SEO 심화 옵션(+5만원)이 가장 많은 병원이 선택하세요',
    avoid: ['과장된 의료효과 문구', '구체 가격 할인 문구'],
  },
  {
    key: '미용실/헤어',
    industry_keywords: ['미용실', '헤어', '살롱', '뷰티샵', '네일', '왁싱'],
    selling_points: [
      '인스타그램 피드 연동 (고객 80%가 인스타 보고 예약)',
      '디자이너별 프로필 페이지로 브랜딩',
      '네이버 예약 + 카카오톡 채널 연동',
      '가격표 페이지 (메뉴북 형태)',
    ],
    common_concerns: [
      '디자이너 바뀔 때마다 수정 번거로움 → CMS로 셀프 업데이트',
      '인스타 트렌드 빠른 변화 → 피드 자동 연동',
      '지역 경쟁 치열 → 지역명 SEO 필수',
    ],
    recommended_options: ['인스타그램 피드 연동', '네이버 예약 버튼', 'SEO 심화 등록'],
    success_cta: '인스타 연동 + 네이버 예약까지 풀세트로 가야 유입-예약 전환이 끊기지 않아요',
    avoid: ['획일적 템플릿 느낌'],
  },
  {
    key: '법무/세무',
    industry_keywords: ['법무', '변호사', '로펌', '법률', '세무', '회계', '세무사', '특허'],
    selling_points: [
      '전문직 품격 디자인 (템플릿 티 안 나는 코딩 방식)',
      '상담 신청 팝업 + 전화/카톡 CTA 고정',
      '성공 사례 케이스 페이지 (전문성 어필)',
      '블로그 연동으로 SEO + 전문성 동시 강화',
    ],
    common_concerns: [
      '광고 규제(변호사법) 저촉 우려 → 문구 가이드 함께 제공',
      '타 법무/세무 홈페이지가 거의 똑같은 템플릿 → 우리는 100% 커스텀 디자인',
      '모바일 상담 유입 많음 → 모바일 최적화 + 카톡 연동 필수',
    ],
    recommended_options: ['상단 공지/이벤트 배너', 'SEO 심화 등록', '카카오톡 채널 연동'],
    success_cta: '전문가 브랜딩은 템플릿이 아닌 코딩 방식에서 격차가 생깁니다 — DELUXE+SEO 심화 조합 추천',
    avoid: ['과한 그래픽/애니메이션 (품격 훼손)'],
  },
  {
    key: '제조/B2B',
    industry_keywords: ['제조', '공장', '산업', '소재', '부품', '기계', '장비', '설비'],
    selling_points: [
      '제품 카탈로그 그리드 (다품목 한눈에)',
      '기업 연혁/인증/실적 타임라인',
      '기업 문의 폼 (전화 아닌 이메일 선호 업종)',
      '영문 페이지 지원으로 해외 수출 대응',
    ],
    common_concerns: [
      '제품 사진 화질 고민 → 고해상도 자동 최적화 + CDN',
      '기술 사양표 업데이트 잦음 → CMS로 직접 수정',
      'B2B 영업담당 모바일 활용 많음 → 모바일 최적화 필수',
    ],
    recommended_options: ['서브페이지 추가 (제품별)', 'SEO 심화 등록', '상단 공지/이벤트 배너'],
    success_cta: '제품 라인업이 많은 B2B는 PREMIUM(5P+CMS+유지보수) 가 가장 효율적',
    avoid: ['B2C 감성 디자인', '과한 색감'],
  },
  {
    key: '음식점/카페',
    industry_keywords: ['음식점', '카페', '식당', '레스토랑', '베이커리', '펍', '주점'],
    selling_points: [
      '메뉴 페이지 + 고해상도 음식 사진',
      '오시는 길 + 영업시간 모바일 상단 고정',
      '인스타그램 피드 연동 (매장 분위기 전달)',
      '네이버 예약/카카오톡 (단체 예약 문의)',
    ],
    common_concerns: [
      '메뉴 자주 바뀜 → CMS로 셀프 수정',
      '계절 이벤트 배너 → 공지 배너 옵션',
      '배달 플랫폼과 중복 노출 → 홈페이지에서만 가능한 혜택 강조',
    ],
    recommended_options: ['인스타그램 피드 연동', '상단 공지/이벤트 배너', '네이버 예약 버튼'],
    success_cta: '자영업은 STANDARD + 옵션 조합(15~17만원)으로 시작해서 반응 보고 확장하세요',
    avoid: ['정보 과잉 (심플 우선)'],
  },
  {
    key: '학원/교육',
    industry_keywords: ['학원', '교육', '아카데미', '과외', '레슨', '스쿨'],
    selling_points: [
      '강사 프로필 + 커리큘럼 섹션',
      '수강 후기/성적 변화 사례',
      '상담 신청 폼 + 카톡 상담 연동',
      '정기 이벤트/모집 배너',
    ],
    common_concerns: [
      '시즌별 모집 정보 잦은 업데이트 → CMS',
      '학부모 모바일 접속 90% → 모바일 최적화',
      '경쟁 학원 비교당함 → 차별화 포인트 시각 강조',
    ],
    recommended_options: ['상단 공지/이벤트 배너', '카카오톡 채널 연동', '네이버 예약 버튼'],
    success_cta: '학기 시작 전 모집 대응이 매출 핵심 — 배너+CMS로 실시간 공지 업데이트 가능',
    avoid: ['정보 숨기기 (수강료 투명성 중요)'],
  },
  {
    key: '커머스/쇼핑몰',
    industry_keywords: ['쇼핑몰', '이커머스', '판매', '몰', '스토어'],
    selling_points: [
      '상품 상세 페이지 + 장바구니',
      '결제/배송 안내',
      '상품 카테고리 구조',
      '후기/상품평 섹션',
    ],
    common_concerns: [
      '카페24/아임웹 대비 구축 난이도 → 대신 수수료 0%, 호스팅 무료',
      '결제 연동 복잡 → 나이스페이/토스페이 연동 옵션',
      '상품 관리 효율 → CMS + 관리자 페이지',
    ],
    recommended_options: ['서브페이지 추가 (카테고리별)', 'SEO 심화 등록', '인스타그램 피드 연동'],
    success_cta: '결제 수수료 3.3%를 3년 돌리면 호스팅비 차이는 무색 — 우리 방식으로 수수료 절감 효과 큼',
    avoid: ['카페24 직접 비교 (우리 스탠스: 대안 제공)'],
  },
];

/**
 * 고객 메시지/facts 에서 업종 감지 → 해당 playbook 반환
 * @param {string} contextText - 고객 메시지 + customer_facts 결합
 * @returns {object|null}
 */
function findPlaybook(contextText) {
  const t = String(contextText || '').toLowerCase();
  if (!t) return null;
  for (const pb of PLAYBOOKS) {
    if (pb.industry_keywords.some(k => t.includes(k.toLowerCase()))) {
      return pb;
    }
  }
  return null;
}

/**
 * 프롬프트 주입용 포맷
 */
function formatPlaybookForPrompt(playbook) {
  if (!playbook) return '';
  const lines = [];
  lines.push(`[업종 sales playbook: ${playbook.key}]`);
  lines.push(`• 이 업종 세일즈 포인트 (답변에 1~2개 자연스럽게 언급):`);
  playbook.selling_points.slice(0, 3).forEach(s => lines.push(`    - ${s}`));
  lines.push(`• 흔한 우려 사전 해소:`);
  playbook.common_concerns.slice(0, 3).forEach(c => lines.push(`    - ${c}`));
  if (playbook.recommended_options.length) {
    lines.push(`• 추천 옵션 (가격/기능 문의 시 언급): ${playbook.recommended_options.join(', ')}`);
  }
  if (playbook.success_cta) lines.push(`• 성공 CTA 문구: "${playbook.success_cta}"`);
  if (playbook.avoid && playbook.avoid.length) lines.push(`• 피할 것: ${playbook.avoid.join(', ')}`);
  return lines.join('\n');
}

module.exports = { findPlaybook, formatPlaybookForPrompt, PLAYBOOKS };
