/**
 * 모든 gig 의 빈 필드를 API 직접 PUT 으로 100% 강제 fill
 *
 * 대상:
 *   1) gigMetaGroups 의 모든 group 에서 maxSelectCount=1 인데 아무도 isSelected 안된 것 → 첫 옵션 선택
 *   2) maxSelectCount > 1 (multi) 인데 아무도 선택 안된 것 → 첫 1~3개 옵션 선택
 *   3) 이미 채워진 group 은 건드리지 않음 (idempotent)
 *
 * 전략: 각 gig 마다
 *   - 저장 버튼 한번 눌러서 PUT body 캡처
 *   - body 내 gigMetaGroups 전수 스캔, 빈 group 에 기본 선택 주입
 *   - 수정된 body 로 PUT
 *   - reload 검증
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('../lib/login');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// gig 별 선호 선택값 (group name → [preferred values in priority order])
const PREFERRED = {
  // 공통 기본값
  '기술 수준': ['중급', '중급:설계 / 코딩', '초급', '고급'],
  '팀 규모': ['1인'],
  '상주 여부': ['상주 불가능'],
  // 홈페이지 이전 gig 관련
  '업종': ['서비스업', '생활편의·여행', '기타', '가구·인테리어'],
  '카테고리': ['기업 홈페이지', '개인 홈페이지', '포트폴리오 홈페이지', '다국어 홈페이지'],
  '개발 언어': ['JavaScript', 'PHP', 'Python'],
  '프런트엔드': ['React', 'Vue', 'HTML/CSS'],
  '백엔드': ['Node.js', 'PHP', 'Express.js', '.NET'],
  '데이터베이스': ['MySQL', 'PostgreSQL', 'MongoDB'],
  '클라우드': ['AWS', 'Cloudflare', 'GCP'],
  '기타·소프트웨어': ['Git', 'GitHub', 'Figma'],
  // N10 301 리뉴얼
  '채널': ['블로그', '웹사이트', '카페'],
  '서비스': ['SEO 향상', '웹마스터 도구', '메타 데이터'],
};

function pickTarget(groupName, items) {
  const preferred = PREFERRED[groupName] || [];
  for (const p of preferred) {
    const found = items.find(i => i.name === p);
    if (found) return found;
  }
  // 부분 매칭
  for (const p of preferred) {
    const found = items.find(i => i.name.includes(p) || p.includes(i.name));
    if (found) return found;
  }
  return items[0]; // 옵션 하나라도
}

async function forceFillGig(gigMeta) {
  const { id, draftId, sub, third } = gigMeta;
  const { browser, page } = await login({ slowMo: 60 });
  let capturedBody = null;
  let capturedUrl = null;
  page.on('request', req => {
    const u = req.url();
    if (u.includes('api.kmong.com') && u.includes('/draft') && req.method() === 'PUT' && !capturedBody) {
      capturedBody = req.postData() || '';
      capturedUrl = u;
    }
  });

  try {
    const editUrl = `https://kmong.com/my-gigs/edit/${draftId}?rootCategoryId=6&subCategoryId=${sub}${third ? `&thirdCategoryId=${third}` : ''}`;
    console.log(`\n===== ${id} (draft ${draftId}) =====`);
    await page.goto('https://kmong.com/my-gigs/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3500);
    await page.evaluate(u => { window.location.href = u; }, editUrl);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(3500);

    console.log('[1] body 캡처 (1차 저장)');
    const btn = page.locator('button:has-text("임시 저장하기")').last();
    if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log('   ✗ 저장 버튼 미발견');
      return { id, ok: false };
    }
    await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await sleep(400);
    await btn.click({ force: true });
    await sleep(7000);

    if (!capturedBody) { console.log('   ✗ body 캡처 실패'); return { id, ok: false }; }
    console.log(`   ✓ ${capturedBody.length} bytes`);

    console.log('[2] body 내 빈 group 스캔');
    const body = JSON.parse(capturedBody);
    const meta = body.items.find(it => it.type === 'METADATA' || it.key === 'METADATA');
    if (!meta) { console.log('   ✗ METADATA 없음'); return { id, ok: false }; }
    const groups = meta.valueData.gigMetaGroups || [];
    const changes = [];
    for (const g of groups) {
      const name = g.name;
      const anySelected = g.gigMetaGroupItems.some(i => i.isSelected);
      if (anySelected) continue;
      // 빈 group — 선택 주입
      const target = pickTarget(name, g.gigMetaGroupItems);
      if (!target) continue;
      target.isSelected = true;
      changes.push({ group: name, picked: target.name });
    }
    console.log(`   변경: ${changes.length}건`);
    changes.forEach(c => console.log(`     ${c.group} ← "${c.picked}"`));

    if (changes.length === 0) {
      console.log('   ✓ 이미 모든 group 채워짐 — PUT 스킵');
      return { id, ok: true, skipped: true, changes };
    }

    console.log('[3] 수정된 body 로 PUT');
    const res = await page.evaluate(async ({ url, body }) => {
      try {
        const r = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*' },
          credentials: 'include',
          body,
        });
        return { ok: r.ok, status: r.status, text: (await r.text()).slice(0, 300) };
      } catch (e) { return { ok: false, error: e.message }; }
    }, { url: capturedUrl, body: JSON.stringify(body) });
    console.log(`   PUT: ${JSON.stringify(res)}`);

    console.log('[4] reload + 재검증');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await sleep(5000);
    const verify = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('input[id^="react-select-"][id$="-input"]').forEach(el => {
        let label = '';
        let cur = el;
        for (let i = 0; i < 12 && cur; i++) {
          cur = cur.parentElement;
          if (!cur) break;
          const lbls = [...cur.querySelectorAll(':scope > label, :scope > div > label')];
          for (const l of lbls) {
            const t = (l.innerText || '').trim().replace(/\*\s*$/, '').trim();
            if (t && t.length < 40) { label = t.split('\n')[0]; break; }
          }
          if (label) break;
        }
        let ctrl = el;
        for (let i = 0; i < 10 && ctrl; i++) {
          ctrl = ctrl.parentElement;
          if (ctrl && typeof ctrl.className === 'string' && ctrl.className.includes('control')) break;
        }
        const full = (ctrl?.innerText || '').trim();
        const value = full.replace(label, '').trim();
        const lines = value.split(/\n+|,\s*/).map(s => s.trim()).filter(Boolean).filter(v => !['선택해주세요','선택','Select'].includes(v));
        out.push({ label, values: lines, empty: lines.length === 0 });
      });
      return out;
    });
    const empties = verify.filter(v => v.empty && v.label);
    console.log(`   검증: 전체 ${verify.length} 빈 ${empties.length}`);
    if (empties.length > 0) empties.forEach(e => console.log(`     남은 빈: ${e.label}`));

    return { id, ok: true, changes, empties: empties.map(e => e.label) };
  } finally {
    await browser.close().catch(() => {});
  }
}

(async () => {
  const gigs = [
    { id: 'N01', draftId: '764206', sub: '639', third: '63901' },
    { id: 'N02', draftId: '764211', sub: '601', third: '60113' },
    { id: 'N04', draftId: '764212', sub: '660', third: '66001' },
    { id: 'N05', draftId: '764213', sub: '601', third: '60113' },
    { id: 'N08', draftId: '764215', sub: '601', third: '60113' },
    { id: 'N09', draftId: '764216', sub: '601', third: '60113' },
    { id: 'N10', draftId: '764217', sub: '634', third: '' },
  ];
  const results = [];
  for (const g of gigs) {
    const r = await forceFillGig(g);
    results.push(r);
  }
  console.log('\n\n===== 최종 요약 =====');
  results.forEach(r => {
    const status = r.ok ? (r.empties?.length ? `⚠ 잔여빈 ${r.empties.length}` : '✅ 완전') : '❌';
    console.log(`${r.id}: ${status} ${r.skipped ? '(skip)' : `변경 ${r.changes?.length || 0}건`}`);
  });
  require('fs').writeFileSync(require('path').join(__dirname, 'force-fill-all-result.json'), JSON.stringify(results, null, 2));
})();
