/**
 * 경쟁사 자동 모니터링 — 타깃 업체 홈페이지 변경 감지
 * 계약 전 업체가 자체적으로 개선했는지 주기적 체크
 * 
 * node tools/competitor-monitor.js check     전체 모니터링 실행
 * node tools/competitor-monitor.js add <URL>  모니터링 추가
 * node tools/competitor-monitor.js list       목록
 */
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const MONITOR_PATH = path.join(OUTPUT_DIR, 'monitor.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function load() { try { return JSON.parse(fs.readFileSync(MONITOR_PATH,'utf8')); } catch { return { sites:{} }; } }
function save(d) { fs.writeFileSync(MONITOR_PATH, JSON.stringify(d,null,2), 'utf8'); }

async function checkSite(url) {
  try {
    const res = await axios.get(url, { timeout: 8000, headers:{'User-Agent':UA}, maxRedirects:3, validateStatus:s=>s<400 });
    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);
    const viewport = $('meta[name="viewport"]').attr('content')||'';
    const hasViewport = viewport.includes('device-width');
    let hasMedia = false;
    $('style').each((_,el)=>{ if($(el).text().includes('@media')) hasMedia=true; });
    
    return {
      responsive: hasViewport || hasMedia,
      hasPhoneBtn: $('a[href^="tel:"]').length > 0,
      hasKakao: html.toLowerCase().includes('pf.kakao.com'),
      hasForm: $('form').length > 0,
      hasMap: html.toLowerCase().includes('map.naver.com') || html.toLowerCase().includes('maps.google') || $('iframe[src*="map"]').length > 0,
      hash: crypto.createHash('md5').update(html.slice(0,10000)).digest('hex'),
      checkedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { error: e.message, checkedAt: new Date().toISOString() };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const db = load();
  if (!db.sites) db.sites = {};

  if (!cmd || cmd === 'help') {
    console.log(`
🔍 경쟁사 모니터링

  check              전체 사이트 변경 감지
  add <URL> [이름]   모니터링 추가
  list               목록
  remove <URL>       제거
`);
    return;
  }

  if (cmd === 'add') {
    const url = args[1]; const name = args[2] || url;
    if (!url) { console.log('❌ URL 필요'); return; }
    const result = await checkSite(url);
    db.sites[url] = { url, name, ...result, history: [result] };
    save(db);
    console.log(`✅ 추가: ${name} (${url})`);
    console.log(`   반응형:${result.responsive?'Y':'N'} 전화:${result.hasPhoneBtn?'Y':'N'} 카톡:${result.hasKakao?'Y':'N'} 폼:${result.hasForm?'Y':'N'} 지도:${result.hasMap?'Y':'N'}`);
    return;
  }

  if (cmd === 'list') {
    const sites = Object.values(db.sites);
    console.log(`\n🔍 모니터링 사이트 (${sites.length}건):\n`);
    sites.forEach((s,i) => {
      console.log(`${i+1}. ${s.name} — ${s.url}`);
      console.log(`   반응형:${s.responsive?'✅':'❌'} 전화:${s.hasPhoneBtn?'✅':'❌'} 카톡:${s.hasKakao?'✅':'❌'} 폼:${s.hasForm?'✅':'❌'} 지도:${s.hasMap?'✅':'❌'}`);
      console.log(`   최근체크: ${s.checkedAt||'없음'}`);
      console.log('');
    });
    return;
  }

  if (cmd === 'remove') {
    const url = args[1];
    if (db.sites[url]) { delete db.sites[url]; save(db); console.log(`✅ 제거: ${url}`); }
    else console.log('❌ 없음');
    return;
  }

  if (cmd === 'check') {
    const sites = Object.values(db.sites);
    console.log(`\n🔍 모니터링 체크: ${sites.length}개 사이트\n`);
    
    const changes = [];
    for (const site of sites) {
      console.log(`  체크: ${site.name}`);
      const result = await checkSite(site.url);
      
      if (result.error) {
        console.log(`    ❌ 접속 실패: ${result.error}`);
        continue;
      }

      // 변경 감지
      const diffs = [];
      if (site.responsive !== result.responsive) diffs.push(`반응형: ${site.responsive?'Y':'N'} → ${result.responsive?'Y':'N'}`);
      if (site.hasPhoneBtn !== result.hasPhoneBtn) diffs.push(`전화버튼: ${site.hasPhoneBtn?'Y':'N'} → ${result.hasPhoneBtn?'Y':'N'}`);
      if (site.hasKakao !== result.hasKakao) diffs.push(`카톡: ${site.hasKakao?'Y':'N'} → ${result.hasKakao?'Y':'N'}`);
      if (site.hasForm !== result.hasForm) diffs.push(`폼: ${site.hasForm?'Y':'N'} → ${result.hasForm?'Y':'N'}`);
      if (site.hasMap !== result.hasMap) diffs.push(`지도: ${site.hasMap?'Y':'N'} → ${result.hasMap?'Y':'N'}`);
      if (site.hash !== result.hash) diffs.push('HTML 콘텐츠 변경됨');
      
      if (diffs.length > 0) {
        console.log(`    🔄 변경 감지!`);
        diffs.forEach(d => console.log(`       ${d}`));
        changes.push({ name: site.name, url: site.url, diffs });
      } else {
        console.log(`    ✅ 변경 없음`);
      }

      // 업데이트
      db.sites[site.url] = { ...site, ...result, history: [...(site.history||[]).slice(-30), result] };
    }
    
    save(db);
    
    if (changes.length > 0) {
      console.log(`\n⚠️ 변경 감지된 사이트: ${changes.length}건`);
      changes.forEach(c => {
        console.log(`\n  🔄 ${c.name} (${c.url})`);
        c.diffs.forEach(d => console.log(`     ${d}`));
      });
      console.log('\n💡 자체 개선한 업체는 TM 우선순위 조정 필요');
    } else {
      console.log('\n✅ 변경된 사이트 없음');
    }
    return;
  }
}

main().catch(e => console.error('❌:', e));
