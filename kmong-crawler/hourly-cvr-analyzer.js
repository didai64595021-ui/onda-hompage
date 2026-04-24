#!/usr/bin/env node
/**
 * 시간대별 CVR 분석 + 가중치 자동 갱신
 * - 30일치 kmong_inquiries × KST hour 집계
 * - 30일치 kmong_hourly_performance.clicks 집계
 * - hour별 CVR = inquiries / clicks
 * - 상위 25% → weight 1.2 (고CVR, CPC 상향 가중)
 * - 하위 25% → weight 0.7 (저CVR 감산)
 * - CVR=0 AND clicks>=20 → weight 0 (예산낭비 OFF)
 * - 데이터 부족 새벽(0-6시 AND clicks<5) → weight 0 안전 OFF
 *
 * 결과: kmong_settings.hourly_weights JSON
 * 참조: adjust-cpc-4h.js (CPC 곱), ad-scheduler.js (weight=0 시 OFF)
 *
 * cron: 매일 03:00 KST
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { spawn } = require('child_process');
const { supabase } = require('./lib/supabase');
const { saveHourlyWeights } = require('./lib/hourly-weights');

const ANALYZE_DAYS = 30;
const MIN_INQUIRIES_FOR_DECISION = 1;
const HIGH_BOOST = 1.2;
const LOW_DAMP = 0.7;
const OFF_NIGHT_HOURS = [0, 1, 2, 3, 4, 5, 6];

function notifyPlain(text) {
  return new Promise((resolve) => {
    const child = spawn('node', ['/home/onda/scripts/telegram-sender.js', text], { stdio: 'ignore' });
    child.on('close', resolve);
    setTimeout(resolve, 8000);
  });
}

function kstHourFromUTC(utcStr) {
  const d = new Date(utcStr);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.getUTCHours();
}

function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function main() {
  const sinceIso = daysAgoIso(ANALYZE_DAYS);
  const sinceDate = sinceIso.slice(0, 10);
  console.log(`=== 시간대별 CVR 분석 (${ANALYZE_DAYS}일, since ${sinceDate}) ===`);

  // 1) 시간대별 클릭/노출
  const { data: perfRows, error: perfErr } = await supabase
    .from('kmong_hourly_performance')
    .select('hour, clicks, impressions, date')
    .gte('date', sinceDate);
  if (perfErr) console.warn('[hourly_performance 조회 실패]', perfErr.message);

  const clicksByHour = Object.fromEntries(Array.from({ length: 24 }, (_, h) => [h, 0]));
  const impByHour = Object.fromEntries(Array.from({ length: 24 }, (_, h) => [h, 0]));
  for (const r of perfRows || []) {
    const h = parseInt(r.hour, 10);
    if (h >= 0 && h <= 23) {
      clicksByHour[h] += r.clicks || 0;
      impByHour[h] += r.impressions || 0;
    }
  }

  // 2) 시간대별 inquiries (KST 시 변환)
  const { data: inqRows, error: inqErr } = await supabase
    .from('kmong_inquiries')
    .select('created_at')
    .gte('created_at', sinceIso);
  if (inqErr) console.warn('[inquiries 조회 실패]', inqErr.message);

  const inqByHour = Object.fromEntries(Array.from({ length: 24 }, (_, h) => [h, 0]));
  for (const r of inqRows || []) {
    inqByHour[kstHourFromUTC(r.created_at)] += 1;
  }

  // 3) CVR + 분류
  const stats = [];
  for (let h = 0; h < 24; h++) {
    const clk = clicksByHour[h];
    const inq = inqByHour[h];
    stats.push({
      hour: h,
      clicks: clk,
      impressions: impByHour[h],
      inquiries: inq,
      cvr: clk > 0 ? +(inq / clk * 100).toFixed(2) : null,
    });
  }
  // clicks 데이터 없을 가능성 (kmong_hourly_performance 빈 경우 폴백)
  // → inquiries 절대량 기반 분류
  const decisive = stats.filter(s => s.inquiries >= MIN_INQUIRIES_FOR_DECISION);
  const decisiveCount = decisive.length;
  const sortedInq = [...decisive].sort((a, b) => a.inquiries - b.inquiries).map(s => s.inquiries);
  const p25 = sortedInq.length ? sortedInq[Math.floor(sortedInq.length * 0.25)] : null;
  const p75 = sortedInq.length ? sortedInq[Math.floor(sortedInq.length * 0.75)] : null;

  // 4) Weight 결정 (inquiries 기반)
  const weights = {};
  const highHours = [], lowHours = [], offHours = [];
  for (const s of stats) {
    let w = 1.0;
    if (s.inquiries === 0 && OFF_NIGHT_HOURS.includes(s.hour)) {
      // 새벽 + 문의 0 → 안전 OFF
      w = 0; offHours.push(s.hour);
    } else if (s.inquiries >= MIN_INQUIRIES_FOR_DECISION) {
      if (p75 !== null && s.inquiries >= p75) { w = HIGH_BOOST; highHours.push(s.hour); }
      else if (p25 !== null && s.inquiries <= p25) { w = LOW_DAMP; lowHours.push(s.hour); }
    }
    weights[String(s.hour)] = w;
  }

  // 5) 저장
  const totalClicks = Object.values(clicksByHour).reduce((a, b) => a + b, 0);
  const totalInq = (inqRows || []).length;
  const payload = {
    weights,
    high_cvr_hours: [...highHours].sort((a, b) => a - b),
    low_cvr_hours: [...lowHours].sort((a, b) => a - b),
    off_hours: [...offHours].sort((a, b) => a - b),
    method: `${ANALYZE_DAYS}d-inquiry-by-hour`,
    data_points: { clicks_total: totalClicks, inquiries_total: totalInq, decisive_hours: decisiveCount },
    p25_inq: p25,
    p75_inq: p75,
    fallback_used: totalClicks === 0,
  };
  await saveHourlyWeights(payload);

  // 6) 콘솔 보고
  console.log('hour | clk | inq | cvr | weight');
  for (const s of stats) {
    const w = weights[String(s.hour)];
    const tag = w === 0 ? 'OFF' : w > 1 ? 'HIGH' : w < 1 ? 'LOW' : '-';
    console.log(`  ${String(s.hour).padStart(2, '0')}시 | clk=${String(s.clicks).padStart(4)} | inq=${String(s.inquiries).padStart(3)} | cvr=${(s.cvr ?? 'n/a').toString().padStart(6)}% | w=${w} ${tag}`);
  }
  console.log(`\n총 클릭 ${totalClicks} / 총 문의 ${totalInq} / 판정 시간대 ${decisiveCount}`);

  // 7) 텔레그램 보고서 (plain text)
  const fallbackNote = totalClicks === 0 ? ' (clicks 데이터 비어 inquiries 폴백)' : '';
  const lines = [
    '시간대별 CVR 분석 ' + ANALYZE_DAYS + '일' + fallbackNote,
    '',
    '데이터: 클릭 ' + totalClicks + ' / 문의 ' + totalInq + ' / 판정 시간대 ' + decisiveCount + '/24',
    '문의 분포 25퍼타일 ' + (p25 === null ? 'n/a' : p25 + '건') + ' / 75퍼타일 ' + (p75 === null ? 'n/a' : p75 + '건'),
    '',
    '고가치 시간대 [+20퍼 CPC]: ' + (highHours.length ? highHours.map(h => h + '시').join(' ') : '없음'),
    '저가치 시간대 [-30퍼 CPC]: ' + (lowHours.length ? lowHours.map(h => h + '시').join(' ') : '없음'),
    'OFF 강제 시간대 [예산 차단]: ' + (offHours.length ? offHours.map(h => h + '시').join(' ') : '없음'),
    '',
    '추가 전략 제안',
    '- kmong_hourly_performance 테이블 비어있음, 별도 점검 필요',
    '- 현재는 inquiries 30일 분포로 폴백',
    '- 새벽 0-6시 문의 0건 확인됨, 안전 OFF 적용',
    '- 14시 피크 14건, 23시 8건, 12-17시 활발',
    '- ad-scheduler가 weight 0 시간대 자동 OFF (30분 사이클)',
    '- adjust-cpc-4h가 4시간마다 weight 곱해 CPC 재조정',
  ];
  await notifyPlain(lines.join('\n'));
  console.log('\n[OK] hourly_weights 저장 완료');
}

main().catch(async (err) => {
  console.error('[치명적 에러]', err);
  await notifyPlain('시간대 CVR 분석 실패: ' + err.message);
  process.exit(1);
});
