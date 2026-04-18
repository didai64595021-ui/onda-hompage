#!/usr/bin/env node
/**
 * 대시보드 광고 명령 독립 처리기
 * - kmong_ad_commands 테이블에서 pending 명령 조회
 * - toggle-ad.js로 광고 ON/OFF 실행
 * - 텔레그램 봇 없이 독립 동작
 *
 * PM2 크론: 매 5분
 */

const { supabase } = require('./lib/supabase');
const { toggleAd } = require('./toggle-ad');
const { changeCreative } = require('./change-creative');
const { editGig } = require('./edit-gig');
const { addPortfolio } = require('./manage-portfolio');
const { notifyTyped } = require('./lib/notify-filter');
const notify = (m) => notifyTyped('command', m); // 이 파일의 알림은 대시보드 명령 결과

const TOGGLE_TIMEOUT_MS = 30000; // toggleAd 30초 타임아웃
const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // processing 5분 이상 = stuck
const INTER_COMMAND_DELAY_MS = 1000; // 명령 간 1초 딜레이

/**
 * Promise에 타임아웃 래핑
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 타임아웃 (${ms / 1000}초)`)), ms)
    ),
  ]);
}

/**
 * 5분 이상 processing 상태인 stuck 명령을 failed로 전환
 */
async function cleanupStuckCommands() {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();
  const { data: stuck, error } = await supabase
    .from('kmong_ad_commands')
    .select('id, product_id, action, created_at')
    .eq('status', 'processing')
    .lt('created_at', cutoff);

  if (error) {
    console.error(`[stuck 조회 실패] ${error.message}`);
    return;
  }

  if (stuck && stuck.length > 0) {
    for (const cmd of stuck) {
      await supabase
        .from('kmong_ad_commands')
        .update({
          status: 'failed',
          result_message: `stuck 자동 실패 처리 (processing ${Math.round(STUCK_THRESHOLD_MS / 60000)}분 초과)`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', cmd.id);
      console.log(`[stuck 정리] ID:${cmd.id} ${cmd.product_id} → failed (5분 초과)`);
    }
    notify(`⚠️ stuck 명령 ${stuck.length}건 자동 실패 처리`);
  }
}

/**
 * 딜레이 헬퍼
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processCommands() {
  const startTime = Date.now();

  try {
    console.log('=== 대시보드 명령 처리기 시작 ===');

    // stuck 명령 정리 (5분 이상 processing)
    await cleanupStuckCommands();

    // pending 명령 조회 (오래된 것부터)
    const { data: commands, error } = await supabase
      .from('kmong_ad_commands')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) throw new Error(`명령 조회 실패: ${error.message}`);

    if (!commands || commands.length === 0) {
      console.log('[정보] 처리할 pending 명령 없음');
      return;
    }

    console.log(`[대기] ${commands.length}건 명령 처리 시작`);

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      console.log(`[처리] ID:${cmd.id} | ${cmd.product_id} → ${cmd.action}`);

      // processing 상태로 변경
      await supabase
        .from('kmong_ad_commands')
        .update({ status: 'processing' })
        .eq('id', cmd.id);

      if (cmd.action === 'on' || cmd.action === 'off') {
        try {
          const result = await withTimeout(
            toggleAd(cmd.product_id, cmd.action),
            TOGGLE_TIMEOUT_MS,
            `toggleAd(${cmd.product_id}, ${cmd.action})`
          );

          await supabase
            .from('kmong_ad_commands')
            .update({
              status: result.success ? 'done' : 'failed',
              result_message: result.message,
              completed_at: new Date().toISOString(),
            })
            .eq('id', cmd.id);

          const icon = result.success ? '✅' : '❌';
          console.log(`${icon} ${cmd.product_id} → ${cmd.action.toUpperCase()}: ${result.message}`);
          notify(`📱 대시보드 명령: ${cmd.product_id} → ${cmd.action.toUpperCase()}\n${result.message}`);

        } catch (err) {
          await supabase
            .from('kmong_ad_commands')
            .update({
              status: 'failed',
              result_message: err.message,
              completed_at: new Date().toISOString(),
            })
            .eq('id', cmd.id);

          console.error(`[실패] ${cmd.product_id}: ${err.message}`);
          notify(`❌ 대시보드 명령 실패: ${cmd.product_id} → ${cmd.action}\n${err.message}`);
        }
      } else if (cmd.action === 'change_creative') {
        // 소재 변경: product_id + result_message에 새 타이틀
        try {
          const result = await withTimeout(
            changeCreative(cmd.product_id, cmd.result_message || ''),
            60000, `changeCreative(${cmd.product_id})`
          );
          await supabase.from('kmong_ad_commands').update({
            status: result.success ? 'done' : 'failed',
            result_message: result.message,
            completed_at: new Date().toISOString(),
          }).eq('id', cmd.id);
          notify(`🎨 소재 변경: ${cmd.product_id}\n${result.message}`);
        } catch (err) {
          await supabase.from('kmong_ad_commands').update({
            status: 'failed', result_message: err.message,
            completed_at: new Date().toISOString(),
          }).eq('id', cmd.id);
        }

      } else if (cmd.action === 'edit_gig') {
        // 서비스 수정: result_message에 JSON { title?, tags?, description? }
        try {
          const changes = JSON.parse(cmd.result_message || '{}');
          const result = await withTimeout(
            editGig(cmd.product_id, changes),
            90000, `editGig(${cmd.product_id})`
          );
          await supabase.from('kmong_ad_commands').update({
            status: result.success ? 'done' : 'failed',
            result_message: result.message,
            completed_at: new Date().toISOString(),
          }).eq('id', cmd.id);
          notify(`📝 서비스 수정: ${cmd.product_id}\n${result.message}`);
        } catch (err) {
          await supabase.from('kmong_ad_commands').update({
            status: 'failed', result_message: err.message,
            completed_at: new Date().toISOString(),
          }).eq('id', cmd.id);
        }

      } else if (cmd.action === 'add_portfolio') {
        // 포트폴리오 등록: result_message에 JSON { title, description? }
        try {
          const opts = JSON.parse(cmd.result_message || '{}');
          const result = await withTimeout(
            addPortfolio(opts),
            60000, 'addPortfolio'
          );
          await supabase.from('kmong_ad_commands').update({
            status: result.success ? 'done' : 'failed',
            result_message: result.message,
            completed_at: new Date().toISOString(),
          }).eq('id', cmd.id);
          notify(`📁 포트폴리오: ${result.message}`);
        } catch (err) {
          await supabase.from('kmong_ad_commands').update({
            status: 'failed', result_message: err.message,
            completed_at: new Date().toISOString(),
          }).eq('id', cmd.id);
        }

      } else {
        // 알 수 없는 action
        await supabase
          .from('kmong_ad_commands')
          .update({
            status: 'failed',
            result_message: `알 수 없는 action: ${cmd.action}`,
            completed_at: new Date().toISOString(),
          })
          .eq('id', cmd.id);
      }

      // 크몽 서버 부하 방지: 명령 간 1초 딜레이
      if (i < commands.length - 1) {
        await delay(INTER_COMMAND_DELAY_MS);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== 명령 처리 완료: ${commands.length}건 (${elapsed}초) ===`);

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notifyTyped('error', `명령 처리기 실패: ${err.message}`);
    process.exit(1);
  }
}

processCommands();
