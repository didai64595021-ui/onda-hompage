/**
 * 시간대(0~23 KST) 가중치 load/save
 * kmong_settings.hourly_weights JSON 단일 행으로 보관
 *
 * weight 의미:
 *   1.0 = 기본
 *   >1.0 (예: 1.2) = 고CVR 시간대, CPC 상향 가중
 *   <1.0 (예: 0.7) = 저CVR 시간대, CPC 하향 가중
 *   0   = 광고 OFF 강제 (예산 낭비 차단, 새벽 등)
 *
 * 참조처:
 *   - adjust-cpc-4h.js: 현재 시간 weight로 제안 CPC 곱
 *   - ad-scheduler.js: weight=0 시간대는 enabled 무관하게 OFF
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { supabase } = require('./supabase');

const SETTINGS_KEY = 'hourly_weights';

const DEFAULT_PAYLOAD = {
  weights: Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h), 1.0])),
  high_cvr_hours: [],
  low_cvr_hours: [],
  off_hours: [],
  method: 'default',
  data_points: 0,
  updated_at: null,
};

function getKstHour() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.getUTCHours();
}

async function loadHourlyWeights() {
  const { data, error } = await supabase
    .from('kmong_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .single();
  if (error || !data?.value) return { ...DEFAULT_PAYLOAD };
  try {
    return JSON.parse(data.value);
  } catch (e) {
    console.warn('[hourly-weights] JSON 파싱 실패, 기본값 사용:', e.message);
    return { ...DEFAULT_PAYLOAD };
  }
}

async function saveHourlyWeights(payload) {
  const value = JSON.stringify({ ...payload, updated_at: new Date().toISOString() });
  const { error } = await supabase
    .from('kmong_settings')
    .upsert({ key: SETTINGS_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`hourly_weights upsert 실패: ${error.message}`);
  return true;
}

async function getCurrentHourWeight() {
  const payload = await loadHourlyWeights();
  const h = getKstHour();
  const w = payload.weights?.[String(h)];
  return typeof w === 'number' ? w : 1.0;
}

async function isHourOff(hour) {
  const payload = await loadHourlyWeights();
  const h = hour === undefined ? getKstHour() : hour;
  const w = payload.weights?.[String(h)];
  return typeof w === 'number' && w === 0;
}

module.exports = {
  SETTINGS_KEY,
  DEFAULT_PAYLOAD,
  loadHourlyWeights,
  saveHourlyWeights,
  getCurrentHourWeight,
  isHourOff,
  getKstHour,
};
