/**
 * 크몽 비승인 사유 추출 — 두 경로
 *  1) /my-gigs?statusType=REJECT — 비승인 카드 텍스트 + 카드 클릭/모달 사유
 *  2) 헤더 종 알림 드롭다운 — 비승인 알림 텍스트
 *
 * 셀렉터는 크몽 페이지 변경에 약하므로 카드 innerText 전체를 그대로 보존.
 * 실제 사유 분류·요약은 lib/rejection-fixer.js의 LLM이 담당.
 */

const { matchProductId } = require('./product-map');

const MY_GIGS_REJECT_URL = 'https://kmong.com/my-gigs?statusType=REJECT';
const NOTIFICATIONS_URL = 'https://kmong.com/notifications';

/**
 * /my-gigs?statusType=REJECT 카드 단위 추출
 */
async function extractFromMyGigs(page) {
  console.log('[비승인 추출] /my-gigs?statusType=REJECT 진입');
  await page.goto(MY_GIGS_REJECT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);
  for (let i = 0; i < 5; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await page.waitForTimeout(400); }

  const cards = await page.evaluate(() => {
    const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
    const out = [];
    for (const eb of editBtns) {
      let card = eb.closest('article');
      if (!card) {
        let cur = eb;
        for (let i = 0; i < 6; i++) { cur = cur.parentElement; if (!cur) break; if ((cur.innerText || '').match(/#\d{6,}/)) { card = cur; break; } }
      }
      if (!card) continue;
      const text = (card.innerText || '').trim();
      const idMatch = text.match(/#(\d{6,})/);
      const titleLine = text.split('\n').find(l => l.trim().length > 5 && !/^(편집|상태|분류|판매중|임시|비승인|판매 중지|#)/.test(l.trim()));
      out.push({
        draft_id: idMatch ? idMatch[1] : null,
        title: titleLine ? titleLine.trim().slice(0, 200) : '(제목 없음)',
        card_text: text.slice(0, 4000),
        source: 'my-gigs',
      });
    }
    return out;
  });

  // 카드별 더 자세한 사유: "편집" 페이지에 들어가면 상단에 비승인 안내가 뜨는 경우가 많음
  // 위험: N개 카드를 모두 클릭하면 시간 폭증. 카드 텍스트만으로 사유가 충분하면 LLM이 그걸 사용.
  // 추가 detail이 필요하면 별도 함수로 분리(아래 fetchRejectionDetail).

  return cards.map((c) => ({
    ...c,
    product_id: matchProductId(c.title) || 'unknown',
    captured_at: new Date().toISOString(),
  }));
}

/**
 * 카드 텍스트로 사유가 부족할 때 호출 — 편집 페이지로 들어가 비승인 안내문 추출
 */
async function fetchRejectionDetail(page, draftId) {
  if (!draftId) return null;
  try {
    const url = `https://kmong.com/gig/edit/${draftId}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    const detail = await page.evaluate(() => {
      // 비승인 사유는 페이지 상단 alert/banner류에 들어가는 경우가 많음
      const txt = document.body.innerText || '';
      const idx = txt.search(/비승인|반려|사유|승인되지 않/);
      if (idx === -1) return null;
      return txt.slice(Math.max(0, idx - 50), idx + 800);
    });
    return detail;
  } catch (e) {
    return null;
  }
}

/**
 * 종 알림 — 헤더 우측 상단
 * 셀렉터가 자주 바뀜. 알림 페이지에 직접 가는 게 안정적.
 */
async function extractFromBell(page) {
  console.log('[비승인 추출] /notifications 진입');
  try {
    await page.goto(NOTIFICATIONS_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    const items = await page.evaluate(() => {
      const root = document.body;
      // 알림 한 건 = 시간/제목/본문 묶음. 단순화: 본문 텍스트 줄바꿈 단위 추출 후 비승인/반려 키워드 포함 줄만.
      const lines = (root.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
      const out = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (/비승인|반려|승인되지/.test(l)) {
          // 앞뒤 2줄을 컨텍스트로 묶음
          const ctx = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join(' / ');
          out.push(ctx);
        }
      }
      return out;
    });
    return items.map((text) => ({
      draft_id: (text.match(/#?(\d{6,})/) || [])[1] || null,
      title: text.slice(0, 100),
      card_text: text.slice(0, 1500),
      source: 'bell',
      product_id: matchProductId(text) || 'unknown',
      captured_at: new Date().toISOString(),
    }));
  } catch (e) {
    console.log('[비승인 추출] 종 알림 페이지 접근 실패:', e.message);
    return [];
  }
}

/**
 * 두 경로 결합 → 중복 제거 (draft_id || product_id 기준)
 */
async function extractRejections(page) {
  const my = await extractFromMyGigs(page);
  const bell = await extractFromBell(page);
  const combined = [...my, ...bell];
  const seen = new Set();
  const unique = [];
  for (const r of combined) {
    const k = r.draft_id || `${r.product_id}|${r.title.slice(0, 30)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(r);
  }
  return unique;
}

module.exports = { extractRejections, extractFromMyGigs, extractFromBell, fetchRejectionDetail };
