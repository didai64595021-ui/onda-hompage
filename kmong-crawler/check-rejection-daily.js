#!/usr/bin/env node
/**
 * 비승인 사유 자동처리 (일 1회, KST 08:00)
 *
 * 흐름:
 *  1) login → /my-gigs?REJECT + /notifications 두 경로에서 비승인 추출
 *  2) 각 비승인에 대해 Opus 4.7으로 사유 분석 + 수정안 생성
 *  3) DB 로그 (kmong_gig_rejection_log INSERT)
 *  4) 텔레그램 보고: 사유 + 수정 diff + "60초 안에 cancel 요청 없으면 자동 적용"
 *  5) 60초 대기 (그동안 cancel_requested=true 로 SQL/텔레그램 cancel 가능)
 *  6) requires_human=false AND cancel_requested=false → editGig + 재제출
 *  7) 결과 보고 + DB applied/resubmitted/apply_result 업데이트
 *
 * cron: 0 8 * * * (KST 08:00 / UTC 23:00 전날)
 * 옵션: --dry-run (적용 X), --no-wait (60초 가드 스킵)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { spawn } = require('child_process');
const { supabase } = require('./lib/supabase');
const { login } = require('./lib/login');
const { extractRejections, fetchRejectionDetail } = require('./lib/rejection-extractor');
const { proposeRejectionFix } = require('./lib/rejection-fixer');
const { fetchGigDetail } = require('./lib/gig-detail');
const { editGig } = require('./edit-gig');

const CANCEL_WAIT_SEC = 60;

function parseArgs() {
  const a = process.argv.slice(2);
  return {
    apply: !a.includes('--dry-run'),
    waitCancel: !a.includes('--no-wait'),
  };
}

function notifyPlain(text) {
  return new Promise((resolve) => {
    const child = spawn('node', ['/home/onda/scripts/telegram-sender.js', text], { stdio: 'ignore' });
    child.on('close', resolve);
    setTimeout(resolve, 8000);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function logRejection(row) {
  const { data, error } = await supabase
    .from('kmong_gig_rejection_log').insert([row]).select('id').single();
  if (error) console.log('[WARN] rejection log insert 실패:', error.message);
  return data?.id;
}

async function isCancelled(id) {
  if (!id) return false;
  const { data } = await supabase
    .from('kmong_gig_rejection_log').select('cancel_requested').eq('id', id).single();
  return !!data?.cancel_requested;
}

function fixProposalToChanges(proposal) {
  const changes = {};
  for (const f of proposal.fix_proposal || []) {
    if (f.field === 'title' && f.after) changes.title = f.after;
    if (f.field === 'description' && f.after) changes.description = f.after;
    // 패키지/가격은 editGig가 아직 직접 처리 안 하므로 일단 제목/설명만
  }
  return changes;
}

function fixDiffSummary(proposal) {
  const lines = [];
  for (const f of (proposal.fix_proposal || []).slice(0, 4)) {
    lines.push(`  ${f.field}: ${String(f.before || '').slice(0, 40)} → ${String(f.after || '').slice(0, 40)}`);
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs();
  const start = Date.now();
  console.log(`=== check-rejection-daily ${args.apply ? '(자동적용)' : '(dry-run)'} ===`);

  const { browser, page } = await login({ slowMo: 100 });
  let rejections = [];
  try {
    rejections = await extractRejections(page);
    console.log(`[추출] 비승인 ${rejections.length}건`);
    if (rejections.length === 0) {
      await notifyPlain(`비승인 자동처리: 새 비승인 없음 (${((Date.now() - start) / 1000).toFixed(1)}초)`);
      return;
    }

    // 사유 부족 시 편집 페이지에서 detail 보강
    for (const r of rejections) {
      if (r.source === 'my-gigs' && r.draft_id && (!r.card_text || r.card_text.length < 100)) {
        const det = await fetchRejectionDetail(page, r.draft_id);
        if (det) r.card_text += '\n[편집페이지 안내]\n' + det;
      }
    }

    // gig_detail 로 현재 컨텐츠 보강 (LLM 컨텍스트)
    for (const r of rejections) {
      if (r.draft_id) {
        try { r.gig_detail = await fetchGigDetail(page, r.draft_id); } catch {}
      }
    }
  } finally {
    await browser.close();
  }

  // LLM 수정안 생성 + DB 로그 + 텔레그램 보고
  const planned = [];
  for (const r of rejections) {
    const prop = await proposeRejectionFix({
      reason_text: r.card_text,
      gig_title: r.title,
      gig_detail: r.gig_detail,
    });
    if (!prop.ok) {
      console.log('[fixer 실패]', prop.error);
      continue;
    }
    const logId = await logRejection({
      product_id: r.product_id,
      draft_id: r.draft_id,
      gig_title: r.title,
      source: r.source,
      reason_raw: r.card_text,
      reason_summary: prop.proposal.reason_summary,
      fix_proposal: prop.proposal,
    });
    planned.push({ rejection: r, proposal: prop.proposal, logId });
  }

  // 보고 1차 — 무엇을 할 것인지
  const reportLines = [
    `🔔 비승인 자동처리 ${args.apply ? '(자동적용 모드)' : '(dry-run)'} - ${rejections.length}건`,
    '',
  ];
  for (const p of planned) {
    const pp = p.proposal;
    reportLines.push(`#${p.logId} ${p.rejection.title.slice(0, 40)} (${p.rejection.product_id})`);
    reportLines.push(`  사유: ${pp.reason_summary}`);
    reportLines.push(`  type: ${pp.fix_type} / confidence: ${pp.confidence} / human필요: ${pp.requires_human ? 'YES' : 'NO'}`);
    if (pp.fix_proposal?.length) reportLines.push(fixDiffSummary(pp));
    reportLines.push('');
  }
  if (args.apply && args.waitCancel) {
    reportLines.push(`⏳ ${CANCEL_WAIT_SEC}초 안에 취소하려면:`);
    reportLines.push(`   SQL: UPDATE kmong_gig_rejection_log SET cancel_requested=true WHERE id IN (...)`);
    reportLines.push(`   (Telegram cancel 명령은 추후 추가)`);
  }
  await notifyPlain(reportLines.join('\n'));

  // 자동 적용 분기
  if (!args.apply) {
    console.log('[dry-run] 적용 스킵');
    return;
  }

  // 60초 가드
  if (args.waitCancel) {
    console.log(`[가드] ${CANCEL_WAIT_SEC}초 cancel 대기...`);
    await sleep(CANCEL_WAIT_SEC * 1000);
  }

  // 적용 가능한 것만 — requires_human=false AND not cancelled AND fix_proposal 비어있지 않음
  const appliedReports = [];
  for (const p of planned) {
    if (p.proposal.requires_human) {
      appliedReports.push(`#${p.logId} skip: 사람 검토 필요 (${p.proposal.fix_type})`);
      continue;
    }
    if (await isCancelled(p.logId)) {
      appliedReports.push(`#${p.logId} skip: 사용자가 취소 요청`);
      continue;
    }
    const changes = fixProposalToChanges(p.proposal);
    if (Object.keys(changes).length === 0) {
      appliedReports.push(`#${p.logId} skip: 적용할 changes 없음 (image/price 류는 사람 처리)`);
      continue;
    }
    try {
      const res = await editGig(p.rejection.product_id, changes);
      const ok = res?.success !== false;
      await supabase
        .from('kmong_gig_rejection_log')
        .update({
          applied: ok,
          applied_at: new Date().toISOString(),
          apply_result: { ok, message: res?.message, changes_applied: Object.keys(changes) },
          resubmitted: ok,
          resubmitted_at: ok ? new Date().toISOString() : null,
        })
        .eq('id', p.logId);
      appliedReports.push(`#${p.logId} ${ok ? 'OK' : 'FAIL'}: ${res?.message || ''}`);
    } catch (e) {
      console.log('[적용 예외]', e.message);
      await supabase
        .from('kmong_gig_rejection_log')
        .update({
          applied: false, applied_at: new Date().toISOString(),
          apply_result: { ok: false, error: e.message },
        })
        .eq('id', p.logId);
      appliedReports.push(`#${p.logId} ERR: ${e.message}`);
    }
  }

  // 보고 2차 — 결과
  await notifyPlain([
    `✅ 비승인 자동처리 결과 (${((Date.now() - start) / 1000).toFixed(1)}초)`,
    ...appliedReports,
  ].join('\n'));

  console.log(`[OK] ${((Date.now() - start) / 1000).toFixed(1)}초`);
}

main().catch(async (err) => {
  console.error('[치명적]', err);
  await notifyPlain('비승인 자동처리 치명적 실패: ' + err.message);
  process.exit(1);
});
