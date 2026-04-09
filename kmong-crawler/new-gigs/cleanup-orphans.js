#!/usr/bin/env node
/**
 * 크몽 orphan draft 정리 — 승인 전 탭에서 카드 단위 일괄 삭제
 *
 * 안전:
 *  - /my-gigs?statusType=WAITING (= 임시저장/검토중) 탭에서만 작동
 *  - 카드 제목이 CLAUDE_TITLE_PATTERNS 일치 시에만 삭제
 *  - 일치 안 하면 안전상 스킵
 *  - 운영 중인 광고 (statusType=SELLING) 절대 손대지 않음
 *  - --dry 로 먼저 확인, --execute 로 실제 삭제
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { login } = require('../lib/login');

const SS = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SS)) fs.mkdirSync(SS, { recursive: true });

// Claude가 만든 임시 등록 제목 패턴
const CLAUDE_TITLE_PATTERNS = [
  /정찰임시/,
  /진단용/,
  /테스트 임시/,
  /텔레그램 카톡 24시간 시세 뉴스 키워드 알림봇/,
  /스마트스토어 쿠팡 가격 재고 24시간 자동 모니터링/,
  /사내문서 엑셀 PDF \+ GPT 업무자동화 노코드/,
  /PDF 1개로 만드는 24시간 AI 상담봇/,
  /사내문서 노션 구글드라이브 통합 RAG 챗봇/,
  /AI 챗봇 \+ 카카오 채널 \+ 업무자동화 풀스택/,
];

const args = process.argv.slice(2);
const isExecute = args.includes('--execute');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isClaudeTitle(title) {
  return CLAUDE_TITLE_PATTERNS.some(p => p.test(title));
}

function isClaudeText(text) {
  return CLAUDE_TITLE_PATTERNS.some(p => p.test(text));
}

function extractClaudeKey(card) {
  // 카드의 title 또는 text에서 Claude 패턴 매치 substring 반환 (검색 키)
  const sources = [card.title || '', card.text || ''];
  for (const src of sources) {
    for (const p of CLAUDE_TITLE_PATTERNS) {
      const m = src.match(p);
      if (m) return m[0];
    }
  }
  return null;
}

// 한 번의 카드 처리: 더보기 → 삭제 → 확인
// 카드는 인덱스 기반이 아닌 "제목 매칭" 으로 찾기 (페이지 re-render 후 인덱스 변동)
async function deleteCardByTitle(page, targetTitle) {
  // 카드 컨테이너 찾기 — "편집하기" 버튼의 부모 카드
  const result = await page.evaluate((targetTitle) => {
    const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
    for (const eb of editBtns) {
      let card = eb;
      for (let i = 0; i < 10; i++) {
        card = card.parentElement;
        if (!card) break;
        const r = card.getBoundingClientRect();
        if (card.querySelector('img') && r.height > 80 && r.height < 250) break;
      }
      if (!card) continue;
      const text = (card.innerText || '');
      if (text.includes(targetTitle)) {
        // 카드의 "더보기" 버튼 찾기
        const moreBtn = [...card.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '더보기');
        if (moreBtn) {
          moreBtn.scrollIntoView({ block: 'center' });
          moreBtn.click();
          return { ok: true };
        }
      }
    }
    return { ok: false, reason: 'card not found' };
  }, targetTitle);

  if (!result.ok) return result;
  await sleep(1000);

  // 메뉴 열린 후 "삭제" 클릭
  const delClicked = await page.evaluate(() => {
    // popover/menu 안의 "삭제" 텍스트 element
    const candidates = [...document.querySelectorAll('button, [role="menuitem"], a, li, div')].filter(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const t = (el.innerText || '').trim();
      return t === '삭제' || t === '삭제하기';
    });
    if (candidates.length === 0) return false;
    // 가장 작은 (메뉴 항목)
    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (ar.width * ar.height) - (br.width * br.height);
    });
    candidates[0].click();
    return true;
  });

  if (!delClicked) return { ok: false, reason: '삭제 메뉴 항목 미발견' };
  await sleep(1500);

  // 확인 다이얼로그 (kmong 보통 confirm 모달)
  const confirmClicked = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('button')].filter(b => {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const t = (b.innerText || '').trim();
      return /^(삭제|삭제하기|확인|예|네)$/.test(t);
    });
    if (cands.length === 0) return false;
    // 모달 내 = z-index 높음 또는 fixed
    // 가장 좁은 (= primary action)
    cands.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.y) - (ar.y); // 가장 아래
    });
    cands[0].click();
    return true;
  });

  if (!confirmClicked) return { ok: false, reason: '확인 다이얼로그 미발견' };
  await sleep(2500);
  return { ok: true };
}

(async () => {
  let browser;
  const report = { at: new Date().toISOString(), mode: isExecute ? 'execute' : 'dry', deleted: [], skipped: [], errors: [] };
  try {
    console.log(`[cleanup] mode=${isExecute ? 'EXECUTE' : 'DRY'}`);
    const r = await login({ slowMo: 150 });
    browser = r.browser;
    const page = r.page;

    // 페이지별 순회 (페이지 1, 2, ...)
    let pageNo = 1;
    let totalProcessed = 0;
    const maxPages = 5;
    const maxIterPerPage = 30; // 한 페이지에서 max 30번 시도

    while (pageNo <= maxPages) {
      console.log(`\n[페이지 ${pageNo}] 접속`);
      await page.goto(`https://kmong.com/my-gigs?statusType=WAITING&page=${pageNo}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(4000);
      // 스크롤
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 1000));
        await sleep(500);
      }

      // 페이지의 모든 카드 dump (제목 + 전체 텍스트)
      let cards = await page.evaluate(() => {
        const out = [];
        const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
        editBtns.forEach(eb => {
          let card = eb;
          for (let i = 0; i < 10; i++) {
            card = card.parentElement;
            if (!card) break;
            const r = card.getBoundingClientRect();
            if (card.querySelector('img') && r.height > 80 && r.height < 250) break;
          }
          if (!card) return;
          const text = (card.innerText || '').trim();
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          const title = lines.find(l => l.length > 8 && l.length < 60 && !/판매중|승인|편집|임시|^\d/.test(l)) || lines[0] || '';
          out.push({ title, text: text.slice(0, 500) });
        });
        return out;
      });

      console.log(`  ${cards.length}개 카드 발견`);
      if (cards.length === 0) {
        console.log(`  더 이상 카드 없음 — 종료`);
        break;
      }

      // 처리할 카드 분류 — 제목 또는 카드 전체 텍스트에서 Claude 패턴 매칭
      const toDelete = cards.filter(c => isClaudeTitle(c.title) || isClaudeText(c.text));
      const protect = cards.filter(c => !(isClaudeTitle(c.title) || isClaudeText(c.text)));
      console.log(`  Claude: ${toDelete.length}, 보호: ${protect.length}`);
      protect.forEach(c => console.log(`    🚫 보호: "${c.title.slice(0, 50)}"`));

      if (!isExecute) {
        toDelete.forEach(c => console.log(`    ⊘ would-delete: "${c.title.slice(0, 50)}"`));
        report.skipped.push(...toDelete);
        // dry mode: 다음 페이지
        pageNo++;
        continue;
      }

      // 실 삭제: 같은 페이지에서 카드 1개씩 삭제 (re-render 처리)
      let iter = 0;
      while (iter < maxIterPerPage) {
        // 매 반복마다 카드 다시 dump (인덱스 변동)
        const remaining = await page.evaluate(() => {
          const editBtns = [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기');
          const items = [];
          editBtns.forEach(eb => {
            let card = eb;
            for (let i = 0; i < 10; i++) {
              card = card.parentElement;
              if (!card) break;
              const r = card.getBoundingClientRect();
              if (card.querySelector('img') && r.height > 80 && r.height < 250) break;
            }
            if (!card) return;
            const text = (card.innerText || '').trim();
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            const title = lines.find(l => l.length > 8 && l.length < 60 && !/판매중|승인|편집|임시|^\d/.test(l)) || lines[0] || '';
            items.push({ title, text: text.slice(0, 500) });
          });
          return items;
        });

        // 처음 매칭되는 Claude 카드 1개 → 패턴 매치 substring을 검색 키로
        const matchingCard = remaining.find(c => extractClaudeKey(c));
        const target = matchingCard ? extractClaudeKey(matchingCard) : null;
        if (!target) {
          console.log(`  남은 Claude 카드 없음 — 페이지 처리 완료`);
          break;
        }

        console.log(`\n  [${iter + 1}] 삭제 시도: "${target.slice(0, 50)}"`);
        const r = await deleteCardByTitle(page, target);
        if (r.ok) {
          console.log(`    ✓ 삭제 완료`);
          report.deleted.push({ title: target });
          totalProcessed++;
          await sleep(1500); // 페이지 안정화
        } else {
          console.log(`    ✗ 실패: ${r.reason}`);
          report.errors.push({ title: target, reason: r.reason });
          await page.screenshot({ path: path.join(SS, `cleanup-fail-${Date.now()}.png`), fullPage: false }).catch(() => {});
          break; // 같은 페이지 처리 중단
        }
        iter++;
      }

      // 다음 페이지로 (페이지 1 처리 후 페이지 1을 다시 봐도 됨 — 방금 삭제로 변화)
      // 안전: 페이지 1만 반복 처리 (lazy load)
      if (totalProcessed === 0 && pageNo === 1) break;
      // 새로 페이지 1로 가서 잔여 확인
      await sleep(1500);
      pageNo = 1; // 항상 페이지 1부터 다시 (삭제 후 페이지 변동)
      // 무한루프 방지: 처리된 것 없으면 종료
      if (report.deleted.length + report.skipped.length + report.errors.length > 50) {
        console.log('  안전 한도 도달 — 종료');
        break;
      }
      // 한 페이지 완료 시 다음 페이지 로직: 잔여 카드가 없으면 break
      const stillThere = await page.evaluate(() => {
        return [...document.querySelectorAll('button')].filter(b => (b.innerText || '').trim() === '편집하기').length;
      });
      if (stillThere === 0) {
        console.log('  잔여 카드 0 — 완료');
        break;
      }
      if (pageNo > maxPages) break;
    }

    console.log(`\n=== 요약 ===`);
    console.log(`삭제: ${report.deleted.length}`);
    console.log(`스킵(dry): ${report.skipped.length}`);
    console.log(`오류: ${report.errors.length}`);
    fs.writeFileSync(path.join(__dirname, 'cleanup-report.json'), JSON.stringify(report, null, 2));
  } catch (e) {
    console.error('[cleanup 실패]', e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
