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
const { notify } = require('./lib/telegram');

async function processCommands() {
  const startTime = Date.now();

  try {
    console.log('=== 대시보드 명령 처리기 시작 ===');

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

    for (const cmd of commands) {
      console.log(`[처리] ID:${cmd.id} | ${cmd.product_id} → ${cmd.action}`);

      // processing 상태로 변경
      await supabase
        .from('kmong_ad_commands')
        .update({ status: 'processing' })
        .eq('id', cmd.id);

      if (cmd.action === 'on' || cmd.action === 'off') {
        try {
          const result = await toggleAd(cmd.product_id, cmd.action);

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
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== 명령 처리 완료: ${commands.length}건 (${elapsed}초) ===`);

  } catch (err) {
    console.error(`[에러] ${err.message}`);
    notify(`명령 처리기 실패: ${err.message}`);
    process.exit(1);
  }
}

processCommands();
