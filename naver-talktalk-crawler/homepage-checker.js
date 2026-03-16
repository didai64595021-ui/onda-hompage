// 홈페이지 반응형 여부 + 카톡버튼 유무 체크

// 반응형 체크: 모바일 뷰포트(375px)에서 viewport meta tag 또는 미디어쿼리 존재 확인
async function checkResponsive(page, url) {
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const result = await page.evaluate(() => {
      // 1) viewport meta tag 확인
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      const hasViewportMeta = viewportMeta && viewportMeta.content && viewportMeta.content.includes('width');

      // 2) 미디어쿼리 확인 (스타일시트에서)
      let hasMediaQuery = false;
      try {
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (rule instanceof CSSMediaRule) {
                const media = rule.conditionText || rule.media?.mediaText || '';
                if (media.includes('max-width') || media.includes('min-width')) {
                  hasMediaQuery = true;
                  break;
                }
              }
            }
          } catch {
            // CORS 제한으로 외부 스타일시트 접근 불가 시 무시
          }
          if (hasMediaQuery) break;
        }
      } catch {
        // 스타일시트 접근 실패 무시
      }

      // 3) body가 뷰포트 너비를 초과하는지 확인
      const bodyWidth = document.body ? document.body.scrollWidth : 0;
      const isOverflowing = bodyWidth > 400; // 375px 뷰포트에서 overflow

      return {
        hasViewportMeta: !!hasViewportMeta,
        hasMediaQuery,
        isOverflowing,
      };
    });

    // 반응형 판단: viewport meta가 있거나, 미디어쿼리가 있고 overflow가 없으면 반응형
    const isResponsive = result.hasViewportMeta || (result.hasMediaQuery && !result.isOverflowing);
    return isResponsive;
  } catch (err) {
    // 접속 실패 시 확인 불가 → false
    return false;
  } finally {
    // 뷰포트 복원
    await page.setViewportSize({ width: 412, height: 915 }).catch(() => {});
  }
}

// 카톡버튼 체크: 카카오톡 채팅 버튼/링크 존재 확인
async function checkKakaoButton(page, url) {
  try {
    // 이미 해당 페이지에 있을 수 있으므로 URL 비교
    const currentUrl = page.url();
    if (!currentUrl.includes(new URL(url).hostname)) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }

    const hasKakao = await page.evaluate(() => {
      const html = document.documentElement.innerHTML.toLowerCase();

      // 카카오톡 관련 패턴
      const patterns = [
        'pf.kakao.com',
        'channel.io',
        'kakao',
        'plusfriend',
        'kakaotalk',
        '카카오톡',
        '카톡상담',
        '카톡문의',
        'talk.channel.io',
      ];

      // HTML 소스에서 패턴 검색
      for (const pattern of patterns) {
        if (html.includes(pattern)) return true;
      }

      // 카카오 채널 링크 확인
      const links = document.querySelectorAll('a[href*="pf.kakao"], a[href*="channel.io"], a[href*="kakao"]');
      if (links.length > 0) return true;

      // 카카오 SDK 스크립트 확인
      const scripts = document.querySelectorAll('script[src*="kakao"], script[src*="channel.io"]');
      if (scripts.length > 0) return true;

      return false;
    });

    return hasKakao;
  } catch (err) {
    return false;
  }
}

// 홈페이지 종합 체크 (반응형 + 카톡버튼)
async function checkHomepage(page, url) {
  if (!url) return { responsive: false, kakaoButton: false };

  // URL 정규화
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }

  const responsive = await checkResponsive(page, url);
  const kakaoButton = await checkKakaoButton(page, url);

  return { responsive, kakaoButton };
}

module.exports = { checkResponsive, checkKakaoButton, checkHomepage };
