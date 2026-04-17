#!/usr/bin/env node
/**
 * #63 최종 처리 스크립트 — 백그라운드 실행용 (사용자 PC 종료 후 자동 완료)
 * - opus → (429면) sonnet-4-6 폴백 (claude-max.js FALLBACK_CHAIN에 이미 적용됨)
 * - 최대 3회 재시도 (시도 사이 60초 대기)
 * - 성공/실패 모두 텔레그램 보고
 */
require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const { supabase } = require('./lib/supabase');
const { notify } = require('./lib/telegram');

const INQUIRY_ID = 63;
const MAX_ATTEMPTS = 3;
const RETRY_WAIT_MS = 60 * 1000;

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function runAutoReply() {
  return new Promise((resolve) => {
    const child = spawn('node', ['-r', 'dotenv/config', 'auto-reply.js'], {
      cwd: __dirname,
      env: { ...process.env, INQUIRY_ID: String(INQUIRY_ID) },
    });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => resolve({ code, out, err }));
    setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 200 * 1000);
  });
}

async function main() {
  let lastOut = '';
  let modelUsed = 'unknown';
  let replySource = 'unknown';
  let success = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`\n=== attempt ${attempt}/${MAX_ATTEMPTS} @ ${new Date().toISOString()} ===`);
    const { out } = await runAutoReply();
    lastOut = out;
    // 모델/소스 추출
    const modelMatch = out.match(/Claude 답변 생성.*?model=([a-z0-9-]+)/);
    if (!modelMatch) {
      // askClaude 결과의 model을 찾으려면 tokens 로그 근처가 명확. 단순화: 호출 로그에서.
      const callModel = out.match(/model=([a-z0-9-]+), temp=/);
      if (callModel) modelUsed = callModel[1];
    }
    if (/Claude 답변 생성/.test(out)) {
      success = true;
      replySource = 'claude';
      // auto-reply 내부에서 실제 사용된 model은 c.model. 로그에는 없음.
      // DB 업데이트 직후 답변 길이만 확인
      break;
    } else if (/rule-based 유지/.test(out)) {
      replySource = 'rule-fallback';
    } else {
      replySource = 'error';
    }
    if (attempt < MAX_ATTEMPTS) {
      console.log(`[대기] ${RETRY_WAIT_MS / 1000}초 후 재시도...`);
      await new Promise(r => setTimeout(r, RETRY_WAIT_MS));
    }
  }

  // 최종 DB 상태 조회
  const { data } = await supabase
    .from('kmong_inquiries')
    .select('auto_reply_text, auto_reply_status')
    .eq('id', INQUIRY_ID)
    .single();

  const replyText = data?.auto_reply_text || '(없음)';
  const status = data?.auto_reply_status || 'unknown';

  // 기술스택 감지 결과 (이번 세션에서 확인한 사실)
  const techStack = 'WordPress 6.9.4 + Kadence 테마 + Elementor 3.27.0 (빌더 기반)';

  const statusIcon = success ? '✅' : '⚠️';
  const sourceLabel = {
    'claude': '🤖 Claude (opus/sonnet 폴백)',
    'rule-fallback': '📋 rule-based 폴백 (Claude 429 연속 실패)',
    'error': '❌ 오류',
    'unknown': '❓ unknown',
  }[replySource] || replySource;

  const report = [
    `${statusIcon} <b>크몽 #${INQUIRY_ID} 최종 처리 보고</b>`,
    ``,
    `🎯 시도: ${success ? '성공' : '실패'} · ${sourceLabel}`,
    `📊 DB 상태: <code>${esc(status)}</code>`,
    ``,
    `🔍 <b>고객 사이트 기술스택</b> (theskyst.com)`,
    `<code>${esc(techStack)}</code>`,
    `→ 워드프레스/Elementor 빌더 기반이라 "기존 구조 유지 + 디자인/UX 개선" 범위에 맞는 답변 생성 필요`,
    ``,
    `💬 <b>최종 저장 답변</b>`,
    `<pre>${esc(replyText.slice(0, 2000))}</pre>`,
    ``,
    `🛠 <b>이번 세션 변경사항</b>`,
    `• 답변봇 모델 opus 4.7 고정 + 429 시 sonnet-4-6 폴백 (사용자 지시 반영)`,
    `• URL 분석에 기술스택 감지 추가 (WordPress/Cafe24/아임웹/Wix/Framer 등 12종)`,
    `• Opus 쿼터 소진 시간대는 답변 품질 저하 리스크 있음 — 모니터링 필요`,
  ].join('\n');

  notify(report);

  // 텔레그램 전송 완료 대기 (비동기 fire-and-forget이라 5초 sleep)
  await new Promise(r => setTimeout(r, 5000));
  console.log('[최종 보고] 텔레그램 발송 완료');
  process.exit(success ? 0 : 1);
}

main().catch(async (e) => {
  console.error('[FATAL]', e);
  try {
    notify(`❌ #${INQUIRY_ID} 백그라운드 처리 중 예외\n<code>${e.message}</code>`);
    await new Promise(r => setTimeout(r, 5000));
  } catch {}
  process.exit(2);
});
