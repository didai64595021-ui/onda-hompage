// SEO 노출 체크 — 업체 홈페이지가 네이버/구글에서 검색되는지 확인
// site:도메인 검색으로 인덱싱 여부 판단

async function checkSeoVisibility(context, homepageUrl, businessName) {
  if (!homepageUrl) return 'X';
  
  try {
    // 도메인 추출
    const url = new URL(homepageUrl);
    const domain = url.hostname.replace('www.', '');
    
    // 새 페이지에서 검색 (충돌 방지)
    const page = await context.newPage();
    try {
    await page.goto(`https://search.naver.com/search.naver?query=site:${domain}`, {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });
    
    await page.waitForTimeout(2000);
    
    // 검색 결과 있는지 확인
    const content = await page.content();
    
    // "검색결과가 없습니다" 또는 결과 0건이면 SEO 노출 X
    const noResult = content.includes('검색결과가 없습니다') 
      || content.includes('검색결과를 찾을 수 없습니다')
      || content.includes('일치하는 검색결과가 없습니다');
    
    if (noResult) return 'X';
    
    // 검색 결과가 있으면 노출 O
    return 'O';
    } finally {
      await page.close().catch(() => {});
    }
  } catch (e) {
    console.log(`  ⚠️ SEO 체크 실패 (${businessName}): ${e.message}`);
    return 'X';
  }
}

module.exports = { checkSeoVisibility };
