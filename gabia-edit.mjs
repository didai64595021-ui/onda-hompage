import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args:['--disable-dev-shm-usage','--no-sandbox'] });
const ctx = await browser.newContext({ storageState: '/tmp/gabia-state.json', userAgent:'Mozilla/5.0 Chrome/120', viewport:{width:1280,height:800} });
const page = await ctx.newPage();
await page.route('**/*', (r) => {
  const t = r.request().resourceType();
  if (t === 'image' || t === 'font' || t === 'media') return r.abort();
  return r.continue();
});
let alerts = [];
page.on('dialog', async (d) => { alerts.push(d.message()); console.log('dialog:', d.message().slice(0,150)); await d.accept(); });

await page.goto('https://dns.gabia.com/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(2500);
await page.locator('input[name="search_domain"]').fill('vietnamcoco');
await page.locator('input[name="search_domain"]').press('Enter');
await page.waitForTimeout(3000);
await page.locator('tr', { hasText:'vietnamcoco.com' }).first().locator('a:has-text("설정"), button:has-text("설정")').first().click();
await page.waitForTimeout(3000);
await page.locator('button:has-text("레코드 수정")').first().click();
await page.waitForTimeout(3500);
await page.locator('a:has-text("레코드 추가"), button:has-text("레코드 추가")').first().click();
await page.waitForTimeout(2000);

const newRow = page.locator('tr').filter({ has: page.locator('select[name="type"]') }).last();

// step 1: type
await newRow.locator('select[name="type"]').selectOption({ value: 'CNAME' });
await page.waitForTimeout(800);

// step 2: fill (Playwright fill — sets value cleanly via JS)
await newRow.locator('input[name="host"][type="text"]').fill('www');
await newRow.locator('input[name="data"][type="text"]').fill('coco-vietnam-a5q.pages.dev');

// step 3: verify visible BEFORE 확인
const before = await newRow.evaluate(tr => ({
  type: tr.querySelector('select[name="type"]').value,
  host: tr.querySelector('input[name="host"][type="text"]').value,
  data: tr.querySelector('input[name="data"][type="text"]').value,
}));
console.log('BEFORE 확인:', JSON.stringify(before));

// step 4: jQuery 확인 trigger
await newRow.evaluate(tr => {
  const $ = window.jQuery || window.$;
  $(tr.querySelector('.record_submit_btn')).trigger('click');
});
await page.waitForTimeout(2500);

// step 5: AFTER 확인 — visible 값과 hidden 값 + class 확인
const after = await newRow.evaluate(tr => ({
  visType: tr.querySelector('select[name="type"]')?.value,
  visHost: tr.querySelector('input[name="host"][type="text"]')?.value,
  visData: tr.querySelector('input[name="data"][type="text"]')?.value,
  hidStatus: tr.querySelector('.hidden_area input[name="status"]')?.value,
  hidHost: tr.querySelector('.hidden_area input[name="host"]')?.value,
  hidData: tr.querySelector('.hidden_area input[name="data"]')?.value,
  trClass: tr.className,
  dataInputClass: tr.querySelector('input[name="data"][type="text"]')?.className,
}));
console.log('AFTER 확인:', JSON.stringify(after, null, 2));

// step 6: 만약 hidden 비어있으면 직접 강제 세팅 → 저장 시도
if (!after.hidHost) {
  console.log('-- hidden 빈 채로 force 세팅 --');
  await newRow.evaluate(tr => {
    const ha = tr.querySelector('.hidden_area');
    ha.querySelector('input[name="status"]').value = 'add';
    ha.querySelector('input[name="type"]').value = 'CNAME';
    ha.querySelector('input[name="host"]').value = 'www';
    ha.querySelector('input[name="data"]').value = 'coco-vietnam-a5q.pages.dev';
    ha.querySelector('input[name="ttl"]').value = '600';
    // error class 제거
    tr.classList.remove('error-bg');
    tr.querySelectorAll('.error-ip').forEach(el => el.classList.remove('error-ip'));
  });
}

await page.evaluate(() => { if (window.dnsSet) dnsSet.saveRecordEvent(); });
await page.waitForTimeout(7000);

console.log('alerts:', alerts);
console.log('after save url:', page.url());

await page.goto('https://dns.gabia.com/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
await page.locator('input[name="search_domain"]').fill('vietnamcoco');
await page.locator('input[name="search_domain"]').press('Enter');
await page.waitForTimeout(2500);
const rowText = await page.locator('tr', { hasText:'vietnamcoco.com' }).first().textContent();
console.log('row state:', (rowText||'').replace(/\s+/g,' ').slice(0,200));

await browser.close();
