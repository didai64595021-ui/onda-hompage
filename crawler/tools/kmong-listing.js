/**
 * 크몽/숨고 상품 페이지 HTML 생성기
 * 플랫폼 등록용 상품 설명 HTML 자동 생성
 * 
 * node tools/kmong-listing.js
 */
const fs = require('fs');
const path = require('path');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

const listings = [
  {
    title: '[긴급] 모바일 안깨지게 반응형 수정 5만원 | 24시간 내 완료',
    filename: 'kmong-responsive.html',
    content: generateListing({
      headline: '모바일에서 홈페이지가 깨지나요?',
      subheadline: '5만원에 24시간 내 깔끔하게 수정해드립니다',
      problems: [
        '글자가 너무 작아서 확대해야 보임',
        '버튼이 작아서 터치가 안 됨',
        '가로 스크롤이 생김',
        '이미지가 잘리거나 깨짐',
      ],
      includes: [
        '메인 1페이지 모바일 반응형 수정',
        '전후 비교 스크린샷 제공',
        '모바일 3개 기기 테스트 (갤럭시/아이폰/태블릿)',
        '1회 수정 포함',
      ],
      price: '50,000원~',
      delivery: '24시간',
    }),
  },
  {
    title: '전화/카톡 버튼 추가 | 클릭 한 번에 문의 연결',
    filename: 'kmong-buttons.html',
    content: generateListing({
      headline: '고객이 전화번호를 못 찾아 이탈하고 있어요',
      subheadline: '클릭 한 번에 전화/카톡 연결되는 버튼을 추가해드립니다',
      problems: [
        '전화번호가 이미지 안에 있어서 클릭이 안 됨',
        '카카오톡 상담 버튼이 없음',
        '문의하려면 번호를 외워서 수동 입력해야 함',
        '모바일에서 연락 수단을 찾기 어려움',
      ],
      includes: [
        '클릭 전화 연결 버튼 (모바일 고정)',
        '카카오톡 채널 상담 버튼',
        '모바일 최적화 배치',
        '1회 수정 포함',
      ],
      price: '30,000원~',
      delivery: '12시간',
    }),
  },
  {
    title: '소상공인 홈페이지 전환율 UP 패키지 | 버튼+폼+지도',
    filename: 'kmong-conversion.html',
    content: generateListing({
      headline: '방문자가 있는데 문의가 안 들어오나요?',
      subheadline: '전환율을 높이는 필수 요소를 한 번에 세팅해드립니다',
      problems: [
        '방문자는 있는데 전화/문의가 안 옴',
        '경쟁 업체보다 홈페이지가 후져 보임',
        '오시는 길 지도가 없어서 위치 확인이 어려움',
        '모바일에서 사이트가 불편해 이탈',
      ],
      includes: [
        '클릭 전화 + 카카오톡 버튼',
        '온라인 문의폼 추가',
        '오시는 길 네이버 지도 삽입',
        'CTA 버튼 배치 최적화',
        '모바일 3개 기기 테스트',
        '1회 수정 포함',
      ],
      price: '200,000원~',
      delivery: '48시간',
    }),
  },
];

function generateListing({ headline, subheadline, problems, includes, price, delivery }) {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;color:#333;line-height:1.7;max-width:700px;margin:0 auto;padding:20px}
h1{font-size:24px;text-align:center;margin-bottom:8px;color:#1e293b}
.sub{text-align:center;color:#64748b;font-size:16px;margin-bottom:32px}
h2{font-size:20px;margin:28px 0 12px;color:#2563eb}
.problem{background:#fef2f2;border-left:3px solid #ef4444;padding:10px 16px;margin:6px 0;border-radius:0 6px 6px 0;font-size:15px}
.include{background:#f0fdf4;border-left:3px solid #22c55e;padding:10px 16px;margin:6px 0;border-radius:0 6px 6px 0;font-size:15px}
.price-box{background:linear-gradient(135deg,#2563eb11,#7c3aed11);border:2px solid #2563eb;border-radius:12px;padding:24px;text-align:center;margin:24px 0}
.price-box .amount{font-size:36px;font-weight:bold;color:#2563eb}
.price-box .delivery{color:#64748b;margin-top:4px}
.guarantee{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;font-size:14px}
.faq{margin:8px 0}
.faq summary{font-weight:600;cursor:pointer;padding:8px 0}
.faq p{padding:4px 0 12px;color:#64748b;font-size:14px}
</style></head><body>

<h1>${headline}</h1>
<p class="sub">${subheadline}</p>

<h2>❌ 이런 문제가 있으신가요?</h2>
${problems.map(p=>`<div class="problem">${p}</div>`).join('\n')}

<h2>✅ 작업 내용</h2>
${includes.map(i=>`<div class="include">${i}</div>`).join('\n')}

<div class="price-box">
  <div class="amount">${price}</div>
  <div class="delivery">⏱ 납품 ${delivery} 이내</div>
</div>

<div class="guarantee">
  <strong>🛡️ 만족 보장</strong><br>
  ✅ 전후 비교 시안 무료 제공<br>
  ✅ 마음에 안 드시면 100% 환불<br>
  ✅ 모바일 3개 기기 테스트 포함<br>
  ✅ 1회 수정 무료
</div>

<h2>❓ 자주 묻는 질문</h2>
<details class="faq"><summary>어떤 사이트든 가능한가요?</summary><p>네, HTML/CSS 기반 사이트, 워드프레스, 카페24, 고도몰, 아임웹 등 대부분의 플랫폼에서 작업 가능합니다.</p></details>
<details class="faq"><summary>FTP/관리자 접근 권한이 필요한가요?</summary><p>네, 작업을 위해 FTP 또는 호스팅 관리자 권한이 필요합니다. 안전하게 작업 후 반환드립니다.</p></details>
<details class="faq"><summary>추가 수정은 어떻게 되나요?</summary><p>1회 수정은 무료 포함이며, 이후 추가 수정은 건당 2~5만원입니다.</p></details>
<details class="faq"><summary>작업 결과물은 어떻게 확인하나요?</summary><p>전후 비교 스크린샷 + 실제 사이트 URL로 직접 확인하실 수 있습니다.</p></details>

</body></html>`;
}

// 생성
fs.mkdirSync(path.join(OUTPUT_DIR, 'listings'), { recursive: true });
listings.forEach(l => {
  const fp = path.join(OUTPUT_DIR, 'listings', l.filename);
  fs.writeFileSync(fp, l.content, 'utf8');
  console.log(`✅ ${l.title}`);
  console.log(`   → ${fp}\n`);
});
console.log(`📁 전체: ${path.join(OUTPUT_DIR, 'listings')}`);
