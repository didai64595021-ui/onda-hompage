/**
 * gig-data-niches.js — N02~N10 본문에 중립어 find/replace 적용
 *
 * 변경 대상: 기술용어(Next.js/CF Pages/301/SEO/CDN 등) → 자영업자 이해 가능한 말
 *            저작권 자백 문구 → 중립어
 *            공격적 비교 → 부드러운 대비
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'gig-data-niches.js');
let src = fs.readFileSync(FILE, 'utf8');

// 단방향 find → replace (문맥상 대부분 안전)
const REPLACE = [
  // 기술용어 → 자연어
  ['Next.js/HTML로 구조 변환', '더 빠르고 가벼운 홈페이지로 재구성'],
  ['Next.js 구조 변환', '더 빠른 홈페이지로 재구성'],
  ['Next.js 정적 사이트로 변환', '더 빠른 홈페이지로 전환'],
  ['Next.js 포트폴리오 템플릿', '포트폴리오 템플릿'],
  ['Next.js', '새 홈페이지'],
  ['CF Pages 무료', '무료 호스팅'],
  ['CF Pages', '무료 호스팅'],
  ['CF Images CDN 자동 최적화', '이미지 자동 최적화'],
  ['CF Images', '이미지 서비스'],
  ['CF 전용 CDN, 2배 빠름', '전용 서버로 2배 빠르게'],
  ['CF 전용 엣지', '전용 서버'],
  ['CF 한국 엣지', '한국 전용 서버'],
  ['CF 엣지', '전용 서버'],
  ['CDN', '빠른 서버'],
  ['GitHub Actions로 사이트 자동 재배포', '수정한 내용이 사이트에 자동 반영'],
  ['GitHub Actions', '자동 업데이트 시스템'],
  ['301 리디렉트로 SEO 순위 보존', '기존 주소 그대로 유지해서 검색 순위 보존'],
  ['301 리디렉트로 SEO 순위 보존.', '기존 주소 그대로 유지해서 검색 순위 보존.'],
  ['301 리디렉트', '주소 연결로 검색 순위 유지'],
  ['PageSpeed 90+', '속도 두 배 빠르게'],
  ['PageSpeed', '속도'],
  ['hreflang·sitemap', '검색 엔진 설정'],
  ['메타태그·OG·hreflang·sitemap SEO 풀 세팅', '검색 엔진 최적화 풀 세팅'],
  ['메타·hreflang·sitemap 풀 커스텀', '검색 엔진 최적화 맞춤 세팅'],
  ['SEO 풀 세팅', '검색 엔진 최적화'],
  ['한국어 SEO', '한국 검색 최적화'],
  ['SEO', '검색 노출'],
  ['MX·SPF·DKIM 그대로 두고', '이메일 설정 그대로 두고'],
  ['MX·SPF·DKIM', '이메일 설정'],
  ['MX·SPF', '이메일 설정'],
  ['DNS 이관', '주소 연결'],
  ['DNS', '주소 연결'],
  ['PG 락인', '결제 시스템 묶임'],
  ['Sectigo', '유료 보안 인증서'],
  ["Let's Encrypt 자동 갱신", '무료 보안 인증서 자동 갱신'],
  ['Let\'s Encrypt', '무료 보안 인증서'],
  ['Google Analytics·네이버 서치어드바이저', '구글·네이버 검색 통계'],
  ['GA·서치어드바이저', '구글·네이버 통계'],
  ['WebP', '가벼운 이미지'],
  ['Toggle/Gallery/Table 모두 변환 지원', '노션의 Toggle·갤러리·표 모두 변환'],
  // 저작권 자백 문구
  ['그대로 이사시켜드립니다', '최대한 유지하면서 이사해드립니다'],
  ['그대로 이사', '최대한 유지하면서 이사'],
  ['자동 크롤', '내용 수집'],
  ['자동 이전', '이전 처리'],
  ['이미지 자동 크롤', '이미지 수집'],
  ['섹션·이미지·글 자동 크롤', '섹션·이미지·글 수집'],
  ['자동 크롤링', '내용 수집'],
  ['자동 크롤로', '수집해서'],
];

let changed = 0;
for (const [from, to] of REPLACE) {
  const before = src;
  src = src.split(from).join(to);
  if (src !== before) changed++;
}

fs.writeFileSync(FILE, src);
console.log(`[neutralize] ${changed}/${REPLACE.length} 치환 적용`);
