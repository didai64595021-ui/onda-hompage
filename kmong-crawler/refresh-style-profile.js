#!/usr/bin/env node
/**
 * 말투 프로필 갱신 — 수동/cron 둘 다 가능
 * 크롤 완료 후 + 매주 월요일 갱신 권장
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { generateStyleProfile } = require('./lib/style-profile');
const { notifyTyped } = require('./lib/notify-filter');

(async () => {
  const r = await generateStyleProfile(80);
  if (!r.ok) {
    notifyTyped('error', `말투 프로필 생성 실패: ${r.error}`);
    process.exit(1);
  }
  const c = r.profile.characteristics || {};
  const msg = [
    `📝 <b>말투 프로필 갱신 (id=${r.id})</b>`,
    `  샘플 ${r.sample_count}건 분석`,
    `  Opus 비용 $${r.cost_usd?.toFixed(4)}`,
    '',
    `<b>요약</b>: ${r.profile.description?.slice(0, 300)}`,
    '',
    `<b>특징</b>:`,
    `  인사: ${c.greeting || '-'}`,
    `  어조: ${c.tone || '-'}`,
    `  문장: ${c.sentence_length || '-'}`,
    `  실적: ${c.numeric_claims || '-'}`,
    `  가격: ${c.price_style || '-'}`,
    `  CTA: ${c.cta_style || '-'}`,
    `  이모지: ${c.emoji_policy || '-'}`,
  ].join('\n');
  console.log(msg);
  notifyTyped('report', msg);
})().catch(e => { console.error(e); notifyTyped('error', `프로필 갱신 크래시: ${e.message}`); process.exit(1); });
