/**
 * 크몽 gig 상세 조회 — kmong.com/api/v5/gigs/{gigId}
 *  - 매 문의마다 신규 fetch (CTR/ROI 최적화로 소재 자주 변경됨)
 *  - 핵심 필드: title / price / category / packages[] / descriptions[]
 *  - Claude 답변 생성 시 context로 주입 → 실제 상품 스펙 기반 답변
 */
const stripHtml = (s) => String(s || '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * gig 상세 조회 (Playwright page 인스턴스 필요 — 쿠키 세션 사용)
 * @param {Page} page - kmong 로그인된 Playwright page
 * @param {string|number} gigId
 * @returns {Promise<object|null>}
 */
async function fetchGigDetail(page, gigId) {
  if (!gigId) return null;
  const data = await page.evaluate(async (id) => {
    try {
      const r = await fetch(`https://kmong.com/api/v5/gigs/${id}`, { credentials: 'include' });
      if (!r.ok) return { _status: r.status };
      return await r.json();
    } catch (e) { return { _error: e.message }; }
  }, String(gigId));

  if (!data || data._status || data._error) return { gig_id: gigId, _error: data?._error || `HTTP ${data?._status}` };

  // 패키지 추출 — RIGHT[0].packages 또는 LEFT[8].packages_table fallback
  const pkgSrc = data.RIGHT?.[0]?.packages || data.RIGHT?.packages || [];
  const packages = pkgSrc.map((p) => ({
    name: p.title || p.type,
    price: p.price,
    days: p.attributes?.find((a) => a.type === 'DAY' || /작업일|기간/.test(a.title))?.value,
    revisions: p.attributes?.find((a) => a.type === 'REVISION' || /수정/.test(a.title))?.value,
    description: stripHtml(p.description).slice(0, 200),
  }));

  // 본문 섹션 (description 있는 LEFT 원소만) — 핵심 정보/차별점/옵션
  const descBlocks = (data.LEFT || [])
    .filter((x) => x.description)
    .map((x) => ({
      title: x.title || x.navigator_title || '',
      description: stripHtml(x.description).slice(0, 600),
    }))
    .filter((b) => b.description && b.description.length > 20);

  return {
    gig_id: String(gigId),
    title: data.COMMON?.title || '',
    price: data.COMMON?.price || null,
    category: [data.COMMON?.category?.root_category?.name, data.COMMON?.category?.sub_category?.name, data.COMMON?.category?.third_category?.name].filter(Boolean).join(' > '),
    main_image: data.COMMON?.main_image || null,
    packages,
    descriptions: descBlocks.slice(0, 8),
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Claude에 주입할 요약 텍스트 생성 (500~1500자 목표)
 */
function formatGigDetailForPrompt(detail) {
  if (!detail || detail._error) return detail?._error ? `(gig 상세 조회 실패: ${detail._error})` : '';
  const lines = [];
  lines.push(`[크몽 서비스 스펙 — 최신]`);
  lines.push(`제목: ${detail.title}`);
  if (detail.category) lines.push(`카테고리: ${detail.category}`);
  if (detail.price) lines.push(`시작가: ${detail.price.toLocaleString()}원`);

  if (detail.packages?.length) {
    lines.push(`\n패키지:`);
    for (const p of detail.packages) {
      const bits = [`${p.name}`];
      if (p.price) bits.push(`${p.price.toLocaleString()}원`);
      if (p.days) bits.push(`${p.days}일`);
      if (p.revisions != null) bits.push(`수정${p.revisions}회`);
      lines.push(`  • ${bits.join(' / ')} — ${p.description || '(설명 없음)'}`);
    }
  }

  if (detail.descriptions?.length) {
    lines.push(`\n상품 본문 섹션:`);
    for (const d of detail.descriptions.slice(0, 5)) {
      lines.push(`  ${d.title ? `[${d.title}] ` : ''}${d.description.slice(0, 300)}`);
    }
  }
  return lines.join('\n');
}

module.exports = { fetchGigDetail, formatGigDetailForPrompt, stripHtml };
