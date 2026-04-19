#!/usr/bin/env node
/**
 * 기존 크몽 inbox 전체 대화 순회 → 셀러 답변만 추출 → kmong_historical_replies 저장
 * - 크몽 API: /api/v5/inbox-groups (페이지) + /api/v5/inbox-groups/{id}/messages
 * - 각 메시지의 is_mine=true (셀러 발신) 필터
 * - 직전 고객 메시지 = context (customer_message)
 * - 중복 방지: UNIQUE(inbox_group_id, message_id)
 *
 * 사용:
 *   node crawl-historical-replies.js              # 최근 100개 대화
 *   node crawl-historical-replies.js --all        # 전체 대화 (시간 오래)
 *   node crawl-historical-replies.js --limit 50
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { login } = require('./lib/login');
const { supabase } = require('./lib/supabase');
const adminDb = require('./lib/supabase-admin');
const { notifyTyped } = require('./lib/notify-filter');
const { matchProductId } = require('./lib/product-map');

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const flag = n => process.argv.includes(`--${n}`);

async function fetchInboxPage(page, pageNum) {
  return await page.evaluate(async (p) => {
    const r = await fetch(`https://kmong.com/api/v5/inbox-groups?page=${p}&per_page=20`, { credentials: 'include' });
    return await r.json();
  }, pageNum);
}

async function fetchMessages(page, groupId) {
  return await page.evaluate(async (gid) => {
    const all = [];
    for (let p = 1; p <= 10; p++) {
      const r = await fetch(`https://kmong.com/api/v5/inbox-groups/${gid}/messages?page=${p}`, { credentials: 'include' });
      const j = await r.json();
      if (!j?.messages?.length) break;
      all.push(...j.messages);
      if (j.messages.length < 20) break;
    }
    return all;
  }, groupId);
}

async function main() {
  const start = Date.now();
  const limit = flag('all') ? 9999 : parseInt(arg('limit') || '100', 10);
  console.log(`=== 기존 답변 크롤 === (대화 최대 ${limit}개)`);

  const { browser, page } = await login({ slowMo: 100 });

  let totalGroups = 0, totalReplies = 0, skipped = 0;
  let pageNum = 1;
  try {
    while (totalGroups < limit) {
      const pageData = await fetchInboxPage(page, pageNum);
      const groups = pageData?.inbox_groups || pageData?.data || [];
      if (!groups.length) break;
      console.log(`\n[페이지 ${pageNum}] 대화 ${groups.length}개`);

      for (const g of groups) {
        if (totalGroups >= limit) break;
        totalGroups++;
        // 중요: 'id'가 아니라 'inbox_group_id'가 진짜 ID (2026-04-20 실측)
        const groupId = g.inbox_group_id || g.INBOX_GROUP_ID || g.id;
        if (!groupId) continue;

        const messages = await fetchMessages(page, groupId);
        if (!messages.length) continue;
        messages.sort((a, b) => new Date(a.created_at || a.CREATED_AT) - new Date(b.created_at || b.CREATED_AT));

        // 셀러 발신 메시지만 필터 + 직전 고객 메시지 context
        for (let i = 0; i < messages.length; i++) {
          const m = messages[i];
          const isMine = m.is_mine === true || m.IS_MINE === true || m.is_seller === true;
          if (!isMine) continue;
          const text = (m.message || m.MESSAGE || m.body || m.content || '').trim();
          if (!text || text.length < 20) continue;  // 매우 짧은 답변은 학습 재료 가치 낮음

          // 직전 고객 메시지 찾기
          let customerMsg = null;
          for (let j = i - 1; j >= 0; j--) {
            const pm = messages[j];
            const pmIsMine = pm.is_mine === true || pm.IS_MINE === true || pm.is_seller === true;
            if (!pmIsMine) {
              customerMsg = (pm.message || pm.MESSAGE || pm.body || pm.content || '').trim();
              break;
            }
          }
          if (!customerMsg || customerMsg.length < 10) continue;

          const msgId = String(m.id || m.MESSAGE_ID || `${groupId}-${i}`);
          const gigId = m.extra_data?.gig_id || m.EXTRA_DATA?.GIG_ID || g.button?.gigs?.[0]?.GIG_ID || null;
          const gigTitle = m.extra_data?.gig_title || g.button?.gigs?.[0]?.GIG_TITLE || '';
          const productId = matchProductId(gigTitle);
          const sentAt = m.created_at || m.CREATED_AT || null;

          const row = {
            inbox_group_id: String(groupId),
            message_id: msgId,
            customer_message: customerMsg.slice(0, 5000),
            seller_reply: text.slice(0, 5000),
            gig_id: gigId ? String(gigId) : null,
            product_id: productId,
            sent_at: sentAt ? new Date(sentAt).toISOString() : null,
            word_count: text.length,
            source: 'historical',
          };

          // PostgREST 우선 → admin fallback
          const pg = await supabase.from('kmong_historical_replies').upsert([row], { onConflict: 'inbox_group_id,message_id', ignoreDuplicates: true }).select('id');
          if (pg.error) {
            const admin = await adminDb.insertRow('kmong_historical_replies', row);
            if (!admin.ok && !/duplicate/i.test(admin.error || '')) skipped++;
            else totalReplies++;
          } else if (pg.data?.length) {
            totalReplies++;
          } else {
            skipped++;
          }
        }
      }
      pageNum++;
      // 크몽 API 페이지네이션: next_page_link 있으면 계속, last_page 도달 시 중단
      if (!pageData?.next_page_link) break;
      if (pageData?.last_page && pageNum > pageData.last_page) break;
    }
  } finally { await browser.close(); }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const msg = `📚 기존 답변 크롤 완료\n  대화 ${totalGroups}개 순회 · 답변 ${totalReplies}건 저장 · 스킵 ${skipped}건\n  ${elapsed}초`;
  console.log(msg);
  notifyTyped('report', msg);
}

main().catch(e => { console.error(e); notifyTyped('error', `historical 크롤 크래시: ${e.message}`); process.exit(1); });
