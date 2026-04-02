const { createClient } = require('/home/onda/projects/onda-logic-monitor/node_modules/@supabase/supabase-js');

const SUPABASE_URL = 'https://byaipfmwicukyzruqtsj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper: fetch all rows with pagination
async function fetchAll(table, select = '*', filters = {}, order = null, pageSize = 1000) {
  let allData = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(select, { count: 'exact' }).range(from, from + pageSize - 1);
    for (const [key, val] of Object.entries(filters)) {
      if (typeof val === 'object' && val !== null) {
        if (val.op === 'gte') q = q.gte(key, val.value);
        else if (val.op === 'lte') q = q.lte(key, val.value);
        else if (val.op === 'gt') q = q.gt(key, val.value);
        else if (val.op === 'eq') q = q.eq(key, val.value);
        else if (val.op === 'neq') q = q.neq(key, val.value);
        else if (val.op === 'not_null') q = q.not(key, 'is', null);
        else if (val.op === 'in') q = q.in(key, val.value);
      } else {
        q = q.eq(key, val);
      }
    }
    if (order) q = q.order(order.col, { ascending: order.asc !== false });
    const { data, error, count } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
    // Safety: cap at 200k rows
    if (allData.length > 200000) { console.log(`  [WARN] ${table}: capped at ${allData.length} rows`); break; }
  }
  return allData;
}

// Helper: check if table exists
async function tableExists(table) {
  try {
    const { data, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error && (error.message.includes('does not exist') || error.code === '42P01' || error.message.includes('relation'))) return false;
    if (error) { console.log(`  [WARN] ${table}: ${error.message}`); return false; }
    return true;
  } catch (e) { return false; }
}

// Stats helpers
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function stddev(arr) { if (arr.length < 2) return 0; const m = avg(arr); return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1)); }
function percentile(arr, p) { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const i = p * (s.length - 1); const lo = Math.floor(i); const hi = Math.ceil(i); return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Date helpers
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().slice(0, 10); }
function dateStr(d) { return typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10); }
function getDOW(d) { return new Date(d).getDay(); }

const result = {
  meta: {}, analysis_1_day_weights: {}, analysis_2_source_lifecycle: {},
  analysis_3_mission_effectiveness: {}, analysis_4_drop_recovery: {},
  analysis_5_natural_variance: {}, analysis_6_market_patterns: {},
  analysis_7_volume_effectiveness: {}, analysis_8_logic_change_history: {},
  analysis_9_current_tests: {}, analysis_10_summary: {}
};

const adjustments = [];

async function main() {
  console.log('=== ONDA Anti-Pattern Engine Analysis ===\n');

  // ===== STEP 0: Connection & Table Check =====
  console.log('STEP 0: Checking tables...');
  const requiredTables = ['daily_snapshots','businesses','keywords','daily_inputs','sources','action_types','learned_rules','anomaly_logs','hypotheses'];
  const tableStatus = {};
  for (const t of requiredTables) {
    tableStatus[t] = await tableExists(t);
    console.log(`  ${t}: ${tableStatus[t] ? 'OK' : 'MISSING'}`);
  }

  // ===== STEP 1: Overall Summary (analysis_10) =====
  console.log('\nSTEP 1: Data summary...');
  let businesses = [], keywords = [], sources = [], actionTypes = [];
  let learnedRulesCount = 0, anomalyLogsCount = 0;

  try {
    if (tableStatus.businesses) businesses = await fetchAll('businesses');
    if (tableStatus.keywords) keywords = await fetchAll('keywords');
    if (tableStatus.sources) sources = await fetchAll('sources');
    if (tableStatus.action_types) actionTypes = await fetchAll('action_types');
  } catch (e) { console.log('  [ERR] Loading dimension tables:', e.message); }

  const managedBiz = businesses.filter(b => b.is_managed === true);
  const unmanagedBiz = businesses.filter(b => b.is_managed !== true);
  const managedKw = keywords.filter(k => k.is_managed === true);

  console.log(`  Businesses: ${businesses.length} (managed: ${managedBiz.length}, unmanaged: ${unmanagedBiz.length})`);
  console.log(`  Keywords: ${keywords.length} (managed: ${managedKw.length})`);
  console.log(`  Sources: ${sources.length}, ActionTypes: ${actionTypes.length}`);

  // Get snapshot count and date range
  let totalSnapshots = 0, earliestDate = null, latestDate = null;
  try {
    const { count } = await supabase.from('daily_snapshots').select('*', { count: 'exact', head: true });
    totalSnapshots = count || 0;
    const { data: minD } = await supabase.from('daily_snapshots').select('snapshot_date').order('snapshot_date', { ascending: true }).limit(1);
    const { data: maxD } = await supabase.from('daily_snapshots').select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1);
    earliestDate = minD?.[0]?.snapshot_date || null;
    latestDate = maxD?.[0]?.snapshot_date || null;
  } catch (e) { console.log('  [ERR] snapshot stats:', e.message); }
  console.log(`  Snapshots: ${totalSnapshots}, range: ${earliestDate} ~ ${latestDate}`);

  // Inputs count
  let totalInputs = 0, activeSources = 0;
  try {
    if (tableStatus.daily_inputs) {
      const { count } = await supabase.from('daily_inputs').select('*', { count: 'exact', head: true }).gt('quantity', 0);
      totalInputs = count || 0;
      const inputs_sample = await fetchAll('daily_inputs', 'source_id', { quantity: { op: 'gt', value: 0 } });
      activeSources = new Set(inputs_sample.map(i => i.source_id)).size;
    }
  } catch (e) { console.log('  [ERR] inputs stats:', e.message); }

  // Data quality (recent 30d)
  let qualityData = { total_rows: 0, null_n2: 0, null_n2_change: 0, invalid_rank: 0, zero_n2: 0 };
  const thirtyDaysAgo = addDays(new Date(), -30);
  try {
    const recentSnaps = await fetchAll('daily_snapshots', 'n2_score,n2_change,rank', {
      snapshot_date: { op: 'gte', value: thirtyDaysAgo }
    });
    qualityData.total_rows = recentSnaps.length;
    qualityData.null_n2 = recentSnaps.filter(r => r.n2_score === null).length;
    qualityData.null_n2_change = recentSnaps.filter(r => r.n2_change === null).length;
    qualityData.invalid_rank = recentSnaps.filter(r => r.rank === null || r.rank <= 0).length;
    qualityData.zero_n2 = recentSnaps.filter(r => r.n2_score === 0).length;
    console.log(`  Quality (30d): ${qualityData.total_rows} rows, null_n2_change: ${qualityData.null_n2_change}`);
  } catch (e) { console.log('  [ERR] quality check:', e.message); }

  // learned_rules / anomaly_logs
  try {
    if (tableStatus.learned_rules) {
      const { count } = await supabase.from('learned_rules').select('*', { count: 'exact', head: true });
      learnedRulesCount = count || 0;
    }
    if (tableStatus.anomaly_logs) {
      const { count } = await supabase.from('anomaly_logs').select('*', { count: 'exact', head: true });
      anomalyLogsCount = count || 0;
    }
  } catch (e) {}

  // Industry distribution
  const industryDist = {};
  businesses.forEach(b => {
    const ind = b.industry_id || 0;
    if (!industryDist[ind]) industryDist[ind] = { industry_id: ind, count: 0, managed_count: 0 };
    industryDist[ind].count++;
    if (b.is_managed) industryDist[ind].managed_count++;
  });

  // Determine adjustments
  const nullChangeRate = qualityData.total_rows > 0 ? qualityData.null_n2_change / qualityData.total_rows : 0;
  const useCalcN2Change = nullChangeRate >= 0.5;
  const expandPeriod = totalSnapshots < 100000;
  const lowerHaving = managedBiz.length < 10;
  const removeManaged = unmanagedBiz.length < 1000;
  const limitedSources = activeSources < 3;

  if (useCalcN2Change) adjustments.push('null_n2_change >= 50%: using calculated n2_change via LAG');
  if (expandPeriod) adjustments.push('total_snapshots < 100k: expanded interval to full period');
  if (lowerHaving) adjustments.push('managed_businesses < 10: lowered HAVING minimum to 3');
  if (removeManaged) adjustments.push('unmanaged_businesses < 1000: removed is_managed filter for unmanaged analyses');
  if (limitedSources) adjustments.push('active_sources < 3: limited_sources flag');
  console.log(`  Adjustments: ${adjustments.length > 0 ? adjustments.join('; ') : 'none'}`);

  // Build meta
  result.meta = {
    generated_at: new Date().toISOString(),
    data_range: { earliest: earliestDate, latest: latestDate },
    total_snapshots: totalSnapshots,
    managed_businesses: managedBiz.length,
    unmanaged_businesses: unmanagedBiz.length,
    managed_keywords: managedKw.length,
    total_inputs: totalInputs,
    data_quality: {
      null_n2_pct: qualityData.total_rows > 0 ? +(qualityData.null_n2 / qualityData.total_rows * 100).toFixed(2) : 0,
      null_n2_change_pct: qualityData.total_rows > 0 ? +(qualityData.null_n2_change / qualityData.total_rows * 100).toFixed(2) : 0,
      invalid_rank_pct: qualityData.total_rows > 0 ? +(qualityData.invalid_rank / qualityData.total_rows * 100).toFixed(2) : 0,
      adjustments_made: adjustments
    }
  };

  result.analysis_10_summary = {
    description: "전체 데이터 요약.",
    scale: {
      managed_businesses: managedBiz.length,
      unmanaged_businesses: unmanagedBiz.length,
      managed_keywords: managedKw.length,
      total_snapshots: totalSnapshots,
      total_inputs: totalInputs,
      active_sources: activeSources,
      learned_rules: tableStatus.learned_rules ? learnedRulesCount : 'table_missing',
      anomaly_logs: tableStatus.anomaly_logs ? anomalyLogsCount : 'table_missing'
    },
    quality: qualityData,
    sources: sources.map(s => ({ id: s.id, name: s.name })),
    action_types: actionTypes.map(a => ({ id: a.id, name: a.name })),
    industry_distribution: Object.values(industryDist).sort((a, b) => b.count - a.count)
  };

  // ===== Load core data for analyses =====
  console.log('\nLoading core data for analyses...');

  // Build lookup maps
  const bizMap = {};
  businesses.forEach(b => { bizMap[b.id] = b; });
  const kwMap = {};
  keywords.forEach(k => { kwMap[k.id] = k; });
  const sourceMap = {};
  sources.forEach(s => { sourceMap[s.id] = s; });
  const actionMap = {};
  actionTypes.forEach(a => { actionMap[a.id] = a; });

  // Load daily_snapshots (for managed and/or unmanaged businesses)
  // We need different subsets for different analyses, let's load all with needed columns
  let allSnapshots = [];
  try {
    const intervalStart = expandPeriod ? earliestDate : addDays(new Date(), -180);
    console.log(`  Loading snapshots from ${intervalStart}...`);
    allSnapshots = await fetchAll('daily_snapshots', 'business_id,keyword_id,snapshot_date,n2_score,n2_change,rank,blog_review_count,visitor_review_count,save_count', {
      snapshot_date: { op: 'gte', value: intervalStart }
    });
    console.log(`  Loaded ${allSnapshots.length} snapshots`);
  } catch (e) {
    console.log('  [ERR] Loading snapshots:', e.message);
  }

  // If n2_change is mostly NULL, calculate it
  if (useCalcN2Change && allSnapshots.length > 0) {
    console.log('  Calculating n2_change from n2_score differences...');
    // Group by business_id + keyword_id, sort by date, compute lag
    const groups = {};
    allSnapshots.forEach(s => {
      const key = `${s.business_id}_${s.keyword_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    for (const arr of Object.values(groups)) {
      arr.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].n2_change === null && i > 0 && arr[i].n2_score !== null && arr[i - 1].n2_score !== null) {
          arr[i].n2_change = arr[i].n2_score - arr[i - 1].n2_score;
        }
      }
    }
    adjustments.push('n2_change recalculated via LAG for NULL values');
    console.log('  Done calculating n2_change');
  }

  // Load daily_inputs
  let allInputs = [];
  try {
    if (tableStatus.daily_inputs) {
      allInputs = await fetchAll('daily_inputs', 'business_id,source_id,input_date,quantity,action_type_id', {
        quantity: { op: 'gt', value: 0 }
      });
      console.log(`  Loaded ${allInputs.length} inputs`);
    }
  } catch (e) { console.log('  [ERR] Loading inputs:', e.message); }

  // ===== STEP 2: Day-of-week weights by industry (analysis_1) =====
  console.log('\nSTEP 2: Day-of-week weights (analysis_1)...');
  try {
    const intervalStart90 = expandPeriod ? earliestDate : addDays(new Date(), -90);
    const unmanagedIds = removeManaged ? null : new Set(unmanagedBiz.map(b => b.id));
    const filtered = allSnapshots.filter(s => {
      if (!removeManaged && !unmanagedIds.has(s.business_id)) return false;
      if (s.n2_change === null) return false;
      if (s.snapshot_date < intervalStart90) return false;
      return true;
    });
    console.log(`  Filtered: ${filtered.length} rows`);

    // Group by industry_id + DOW
    const groups = {};
    filtered.forEach(s => {
      const biz = bizMap[s.business_id];
      const ind = biz ? (biz.industry_id || 0) : 0;
      const dow = getDOW(s.snapshot_date);
      const key = `${ind}_${dow}`;
      if (!groups[key]) groups[key] = { industry_id: ind, dow, values: [] };
      groups[key].values.push(s.n2_change);
    });

    const minHaving = lowerHaving ? 3 : 50;
    const byIndustry = {};
    for (const g of Object.values(groups)) {
      if (g.values.length < minHaving) continue;
      if (!byIndustry[g.industry_id]) byIndustry[g.industry_id] = { sample_total: 0, days: {} };
      const entry = {
        avg_change: +avg(g.values).toFixed(4),
        stddev: +stddev(g.values).toFixed(4),
        median: percentile(g.values, 0.5),
        weight: 1.0,
        sample: g.values.length
      };
      if (entry.median !== null) entry.median = +entry.median.toFixed(4);
      byIndustry[g.industry_id].days[g.dow] = entry;
      byIndustry[g.industry_id].sample_total += g.values.length;
    }

    // Compute weights
    for (const [indId, ind] of Object.entries(byIndustry)) {
      const dayEntries = Object.values(ind.days);
      if (dayEntries.length === 0) continue;
      const overallAvg = avg(dayEntries.map(d => d.avg_change));
      for (const [dow, d] of Object.entries(ind.days)) {
        if (overallAvg === 0) {
          d.weight = d.stddev > 0 ? +(1.0 + (d.avg_change / d.stddev) * 0.1).toFixed(4) : 1.0;
        } else {
          d.weight = +clamp((d.avg_change - overallAvg) / Math.abs(overallAvg) + 1.0, 0.5, 1.8).toFixed(4);
        }
      }
    }

    if (lowerHaving) adjustments.push('analysis_1: HAVING lowered to 3');
    result.analysis_1_day_weights = {
      description: "업종별 요일 가중치. weight > 1.0 = 해당 요일에 자연 유입이 평균보다 많음.",
      data: byIndustry
    };
    console.log(`  Done: ${Object.keys(byIndustry).length} industries`);
  } catch (e) {
    console.log('  [ERR]', e.message);
    result.analysis_1_day_weights = { description: "업종별 요일 가중치.", error: e.message };
  }

  // ===== STEP 3: Natural variance (analysis_5) =====
  console.log('\nSTEP 3: Natural variance (analysis_5)...');
  try {
    const intervalStart60 = expandPeriod ? earliestDate : addDays(new Date(), -60);
    const unmanagedIds = removeManaged ? null : new Set(unmanagedBiz.map(b => b.id));
    const filtered = allSnapshots.filter(s => {
      if (!removeManaged && !unmanagedIds.has(s.business_id)) return false;
      if (s.n2_change === null) return false;
      if (s.snapshot_date < intervalStart60) return false;
      return true;
    });

    const byIndustry = {};
    filtered.forEach(s => {
      const biz = bizMap[s.business_id];
      const ind = biz ? (biz.industry_id || 0) : 0;
      if (!byIndustry[ind]) byIndustry[ind] = [];
      byIndustry[ind].push(s.n2_change);
    });

    const minHaving = lowerHaving ? 3 : 100;
    const data = {};
    for (const [ind, vals] of Object.entries(byIndustry)) {
      if (vals.length < minHaving) continue;
      const absVals = vals.map(v => Math.abs(v));
      const avgAbs = avg(absVals);
      const sd = stddev(vals);
      const p10v = percentile(vals, 0.10);
      const p25v = percentile(vals, 0.25);
      const medianV = percentile(vals, 0.50);
      const p75v = percentile(vals, 0.75);
      const p90v = percentile(vals, 0.90);

      let recNoise;
      if (p75v !== null && p25v !== null && avgAbs > 0) {
        recNoise = ((p75v - p25v) / avgAbs) * 50;
      } else {
        recNoise = avgAbs > 0 ? (sd / avgAbs) * 30 : 15;
      }
      recNoise = clamp(recNoise, 5, 40);

      data[ind] = {
        sample: vals.length,
        avg_abs_change: +avgAbs.toFixed(4),
        stddev: +sd.toFixed(4),
        p10: p10v !== null ? +p10v.toFixed(4) : null,
        p25: p25v !== null ? +p25v.toFixed(4) : null,
        median: medianV !== null ? +medianV.toFixed(4) : null,
        p75: p75v !== null ? +p75v.toFixed(4) : null,
        p90: p90v !== null ? +p90v.toFixed(4) : null,
        recommended_noise_pct: +recNoise.toFixed(2)
      };
    }

    result.analysis_5_natural_variance = {
      description: "업종별 자연 N2 변동폭. recommended_noise_pct = 안티패턴 엔진의 ±X% 노이즈 범위.",
      data
    };
    console.log(`  Done: ${Object.keys(data).length} industries`);
  } catch (e) {
    console.log('  [ERR]', e.message);
    result.analysis_5_natural_variance = { description: "업종별 자연 N2 변동폭.", error: e.message };
  }

  // ===== STEP 4: Source lifecycle (analysis_2) =====
  console.log('\nSTEP 4: Source lifecycle (analysis_2)...');
  try {
    const managedIds = new Set(managedBiz.map(b => b.id));
    const managedInputs = allInputs.filter(i => managedIds.has(i.business_id));
    console.log(`  Managed inputs: ${managedInputs.length}`);

    // Build snapshot lookup: business_id -> date -> [{keyword_id, n2_change, n2_score}]
    const snapByBizDate = {};
    allSnapshots.forEach(s => {
      if (s.n2_change === null) return;
      const key = `${s.business_id}_${dateStr(s.snapshot_date)}`;
      if (!snapByBizDate[key]) snapByBizDate[key] = [];
      snapByBizDate[key].push(s);
    });

    // For each input, find snapshots lag 0-30 days
    const maxLag = 30;
    const bySourceLag = {}; // source_name -> lag_day -> [n2_change values]
    let matchCount = 0;

    for (const inp of managedInputs) {
      const srcName = sourceMap[inp.source_id]?.name || `source_${inp.source_id}`;
      const inputDate = dateStr(inp.input_date);
      for (let lag = 0; lag <= maxLag; lag++) {
        const targetDate = addDays(inputDate, lag);
        const key = `${inp.business_id}_${targetDate}`;
        const snaps = snapByBizDate[key];
        if (!snaps) continue;
        for (const s of snaps) {
          if (!bySourceLag[srcName]) bySourceLag[srcName] = {};
          if (!bySourceLag[srcName][lag]) bySourceLag[srcName][lag] = [];
          bySourceLag[srcName][lag].push(s.n2_change);
          matchCount++;
        }
      }
    }
    console.log(`  Matched ${matchCount} source-lag data points`);

    const minSample = lowerHaving ? 2 : 3;
    const data = {};
    for (const [srcName, lagData] of Object.entries(bySourceLag)) {
      const byLagDay = {};
      let sampleTotal = 0;
      for (const [lag, vals] of Object.entries(lagData)) {
        if (vals.length < minSample) continue;
        const posRate = vals.filter(v => v > 0).length / vals.length;
        byLagDay[lag] = {
          avg_change: +avg(vals).toFixed(4),
          positive_rate: +posRate.toFixed(4),
          sample: vals.length
        };
        sampleTotal += vals.length;
      }
      if (Object.keys(byLagDay).length === 0) continue;

      // Derive lifecycle stages
      const lagDays = Object.keys(byLagDay).map(Number).sort((a, b) => a - b);
      let rampUpEnd = 1, peakDay = 0, peakChange = -Infinity;
      for (const ld of lagDays) {
        if (byLagDay[ld].positive_rate > 0.55 && rampUpEnd === 1) rampUpEnd = ld;
        if (byLagDay[ld].avg_change > peakChange) { peakChange = byLagDay[ld].avg_change; peakDay = ld; }
      }
      let plateauStart = peakDay + 7, decayStart = plateauStart + 5;
      for (const ld of lagDays) {
        if (ld > peakDay && byLagDay[ld].positive_rate <= 0.55) { plateauStart = ld; break; }
      }
      for (const ld of lagDays) {
        if (ld > peakDay && byLagDay[ld].avg_change < 0) { decayStart = ld; break; }
      }
      const cooldown = clamp(Math.round(decayStart * 0.7), 5, 21);

      data[srcName] = {
        sample_total: sampleTotal,
        by_lag_day: byLagDay,
        derived: {
          ramp_up_end_day: rampUpEnd,
          peak_day: peakDay,
          plateau_start_day: plateauStart,
          decay_start_day: decayStart,
          recommended_cooldown_days: cooldown
        }
      };
    }

    if (limitedSources) result.analysis_2_source_lifecycle = { description: "매체별 효과 수명 곡선.", data, warning: "limited_sources" };
    else result.analysis_2_source_lifecycle = { description: "매체별 효과 수명 곡선. lag_day = 투입 후 경과 일수.", data };
    console.log(`  Done: ${Object.keys(data).length} sources`);
  } catch (e) {
    console.log('  [ERR]', e.message);
    result.analysis_2_source_lifecycle = { description: "매체별 효과 수명 곡선.", error: e.message };
  }

  // ===== STEP 5: Mission effectiveness by industry (analysis_3) =====
  console.log('\nSTEP 5: Mission effectiveness (analysis_3)...');
  try {
    const managedIds = new Set(managedBiz.map(b => b.id));
    const managedInputs = allInputs.filter(i => managedIds.has(i.business_id));

    // Build snapshot lookup: business_id_keyword_id_date -> n2_score
    const snapLookup = {};
    allSnapshots.forEach(s => {
      if (s.n2_score === null) return;
      const key = `${s.business_id}_${s.keyword_id}_${dateStr(s.snapshot_date)}`;
      snapLookup[key] = s.n2_score;
    });
    // Also index by business_id_date for finding any keyword
    const snapByBizDate2 = {};
    allSnapshots.forEach(s => {
      if (s.n2_score === null) return;
      const key = `${s.business_id}_${dateStr(s.snapshot_date)}`;
      if (!snapByBizDate2[key]) snapByBizDate2[key] = [];
      snapByBizDate2[key].push(s);
    });

    // For each input, find before (input_date) and after (input_date + 3) scores
    const byIndustryAction = {};
    let matchCount = 0;

    for (const inp of managedInputs) {
      const biz = bizMap[inp.business_id];
      if (!biz) continue;
      const ind = biz.industry_id || 0;
      const actName = actionMap[inp.action_type_id]?.name || `action_${inp.action_type_id}`;
      const inputDateStr = dateStr(inp.input_date);
      const afterDateStr = addDays(inputDateStr, 3);

      // Get before/after snapshots for this business
      const beforeSnaps = snapByBizDate2[`${inp.business_id}_${inputDateStr}`] || [];
      const afterSnaps = snapByBizDate2[`${inp.business_id}_${afterDateStr}`] || [];
      // Also try ±1 day
      if (beforeSnaps.length === 0) {
        const alt = snapByBizDate2[`${inp.business_id}_${addDays(inputDateStr, -1)}`] || [];
        beforeSnaps.push(...alt);
      }
      if (afterSnaps.length === 0) {
        const alt1 = snapByBizDate2[`${inp.business_id}_${addDays(inputDateStr, 2)}`] || [];
        const alt2 = snapByBizDate2[`${inp.business_id}_${addDays(inputDateStr, 4)}`] || [];
        afterSnaps.push(...alt1, ...alt2);
      }

      // Match by keyword_id
      for (const bs of beforeSnaps) {
        const asMatch = afterSnaps.find(a => a.keyword_id === bs.keyword_id);
        if (!asMatch) continue;
        const effect = asMatch.n2_score - bs.n2_score;
        const effectPerUnit = inp.quantity > 0 ? effect / inp.quantity : 0;

        const key = `${ind}_${actName}`;
        if (!byIndustryAction[key]) byIndustryAction[key] = { industry_id: ind, action_name: actName, effects: [], effectsPerUnit: [] };
        byIndustryAction[key].effects.push(effect);
        byIndustryAction[key].effectsPerUnit.push(effectPerUnit);
        matchCount++;
      }
    }
    console.log(`  Matched ${matchCount} before/after pairs`);

    const minSample = lowerHaving ? 3 : 3;
    const data = {};
    // Group by industry
    const byInd = {};
    for (const g of Object.values(byIndustryAction)) {
      if (g.effects.length < minSample) continue;
      if (!byInd[g.industry_id]) byInd[g.industry_id] = { actions: {} };
      const posRate = g.effects.filter(e => e > 0).length / g.effects.length;
      const epu = avg(g.effectsPerUnit);
      byInd[g.industry_id].actions[g.action_name] = {
        avg_effect: +avg(g.effects).toFixed(4),
        positive_rate: +posRate.toFixed(4),
        effect_per_unit: +epu.toFixed(6),
        sample: g.effects.length
      };
    }

    // Recommended mix
    for (const [ind, d] of Object.entries(byInd)) {
      const mix = {};
      const positiveEpus = {};
      let sumPositive = 0;
      for (const [act, info] of Object.entries(d.actions)) {
        const epu = Math.max(0, info.effect_per_unit);
        positiveEpus[act] = epu;
        sumPositive += epu;
      }
      const actionCount = Object.keys(d.actions).length;
      for (const act of Object.keys(d.actions)) {
        mix[act] = sumPositive > 0 ? +(positiveEpus[act] / sumPositive).toFixed(4) : +(1 / actionCount).toFixed(4);
      }
      d.recommended_mix = mix;
    }

    result.analysis_3_mission_effectiveness = {
      description: "업종별 액션(미션) 유형의 N2 상승 효과. recommended_mix = 최적 투입 비율.",
      data: byInd
    };
    console.log(`  Done: ${Object.keys(byInd).length} industries`);
  } catch (e) {
    console.log('  [ERR]', e.message);
    result.analysis_3_mission_effectiveness = { description: "업종별 액션(미션) 유형의 N2 상승 효과.", error: e.message };
  }

  // ===== STEP 6: Volume effectiveness (analysis_7) =====
  console.log('\nSTEP 6: Volume effectiveness (analysis_7)...');
  try {
    const managedIds = new Set(managedBiz.map(b => b.id));
    const managedInputs = allInputs.filter(i => managedIds.has(i.business_id));

    const snapByBizDate3 = {};
    allSnapshots.forEach(s => {
      if (s.n2_score === null) return;
      const key = `${s.business_id}_${dateStr(s.snapshot_date)}`;
      if (!snapByBizDate3[key]) snapByBizDate3[key] = [];
      snapByBizDate3[key].push(s);
    });

    const buckets = { '001-100': [], '101-200': [], '201-300': [], '301-500': [], '500+': [] };
    function getBucket(q) {
      if (q <= 100) return '001-100';
      if (q <= 200) return '101-200';
      if (q <= 300) return '201-300';
      if (q <= 500) return '301-500';
      return '500+';
    }

    for (const inp of managedInputs) {
      const inputDateStr = dateStr(inp.input_date);
      const afterDateStr = addDays(inputDateStr, 3);
      const beforeSnaps = snapByBizDate3[`${inp.business_id}_${inputDateStr}`] || [];
      const afterSnaps = snapByBizDate3[`${inp.business_id}_${afterDateStr}`] || [];

      for (const bs of beforeSnaps) {
        const asMatch = afterSnaps.find(a => a.keyword_id === bs.keyword_id);
        if (!asMatch) continue;
        const delta = asMatch.n2_score - bs.n2_score;
        const epu = inp.quantity > 0 ? delta / inp.quantity : 0;
        const bucket = getBucket(inp.quantity);
        buckets[bucket].push({ delta, epu, positive: delta > 0 ? 1 : 0 });
      }
    }

    const data = {};
    let prevEpu = null, dimStart = null, optimalRange = null, maxEpu = -Infinity;
    const bucketOrder = ['001-100', '101-200', '201-300', '301-500', '500+'];
    for (const bucket of bucketOrder) {
      const vals = buckets[bucket];
      if (vals.length === 0) continue;
      const avgDelta = avg(vals.map(v => v.delta));
      const epu = avg(vals.map(v => v.epu));
      const posRate = avg(vals.map(v => v.positive));
      data[bucket] = {
        avg_n2_delta: +avgDelta.toFixed(4),
        effect_per_unit: +epu.toFixed(6),
        positive_rate: +posRate.toFixed(4),
        sample: vals.length
      };
      if (epu > maxEpu) { maxEpu = epu; optimalRange = bucket; }
      if (prevEpu !== null && epu < prevEpu && dimStart === null) {
        dimStart = parseInt(bucket) || 500;
      }
      prevEpu = epu;
    }
    data.optimal_range = optimalRange || 'N/A';
    data.diminishing_returns_start = dimStart || 0;

    result.analysis_7_volume_effectiveness = {
      description: "투입량(타수) 구간별 N2 효과. optimal_range = 타당 효율 최고 구간.",
      data
    };
    console.log(`  Done: ${bucketOrder.filter(b => buckets[b].length > 0).length} buckets`);
  } catch (e) {
    console.log('  [ERR]', e.message);
    result.analysis_7_volume_effectiveness = { description: "투입량(타수) 구간별 N2 효과.", error: e.message };
  }

  // ===== STEP 7: Drop recovery (analysis_4) =====
  console.log('\nSTEP 7: Drop recovery (analysis_4)...');
  try {
    const managedIds = new Set(managedBiz.map(b => b.id));
    const managedSnaps = allSnapshots.filter(s => managedIds.has(s.business_id) && s.n2_change !== null);
    console.log(`  Managed snapshots with n2_change: ${managedSnaps.length}`);

    // Group by business_id + keyword_id, sort by date
    const groups = {};
    managedSnaps.forEach(s => {
      const key = `${s.business_id}_${s.keyword_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    for (const arr of Object.values(groups)) {
      arr.sort((a, b) => dateStr(a.snapshot_date).localeCompare(dateStr(b.snapshot_date)));
    }

    // Build input lookup: business_id -> [{input_date, source_id}]
    const inputsByBiz = {};
    allInputs.forEach(i => {
      if (!inputsByBiz[i.business_id]) inputsByBiz[i.business_id] = [];
      inputsByBiz[i.business_id].push(i);
    });

    // Find streaks and recovery
    const streakResults = {}; // streak_length -> stats
    const allStreaks = [];

    for (const [key, snaps] of Object.entries(groups)) {
      const bizId = snaps[0].business_id;
      let streakStart = -1, streakLength = 0, totalDrop = 0;

      for (let i = 0; i < snaps.length; i++) {
        if (snaps[i].n2_change < 0) {
          if (streakLength === 0) streakStart = i;
          streakLength++;
          totalDrop += snaps[i].n2_change;
        } else {
          if (streakLength >= 2) {
            // Streak ended at i-1, measure recovery in next 7 days
            const streakEndDate = dateStr(snaps[i - 1].snapshot_date);
            const endScore = snaps[i - 1].n2_score;
            let maxRecoveryScore = endScore || 0;
            for (let j = i; j < Math.min(i + 7, snaps.length); j++) {
              if (snaps[j].n2_score !== null && snaps[j].n2_score > maxRecoveryScore) {
                maxRecoveryScore = snaps[j].n2_score;
              }
            }
            const recovery = endScore !== null ? maxRecoveryScore - endScore : 0;
            const recovered = recovery > 0;

            // Check source change within 3 days of streak end
            let sourceChange = false;
            const bizInputs = inputsByBiz[bizId] || [];
            const streakStartDate = dateStr(snaps[streakStart].snapshot_date);
            for (const inp of bizInputs) {
              const inpDate = dateStr(inp.input_date);
              const dayDiff = daysBetween(streakEndDate, inpDate);
              if (dayDiff >= -3 && dayDiff <= 3) {
                sourceChange = true;
                break;
              }
            }

            allStreaks.push({ length: Math.min(streakLength, 5), totalDrop, recovered, sourceChange, recovery });
          }
          streakLength = 0;
          totalDrop = 0;
        }
      }
      // Handle streak at end of series
      if (streakLength >= 2) {
        allStreaks.push({ length: Math.min(streakLength, 5), totalDrop, recovered: false, sourceChange: false, recovery: 0 });
      }
    }

    // Aggregate by streak length
    const byLength = {};
    const lengthLabels = { 2: '2', 3: '3', 4: '4', 5: '5+' };
    for (const s of allStreaks) {
      const label = s.length >= 5 ? '5+' : String(s.length);
      if (!byLength[label]) byLength[label] = { occ: 0, drops: [], recoveries: 0, withChange: 0, withoutChange: 0 };
      byLength[label].occ++;
      byLength[label].drops.push(s.totalDrop);
      if (s.recovered) byLength[label].recoveries++;
      if (s.sourceChange) byLength[label].withChange++;
      else byLength[label].withoutChange++;
    }

    const byStreakLength = {};
    let optimalDay = 2;
    for (const label of ['2', '3', '4', '5+']) {
      const d = byLength[label];
      if (!d) { byStreakLength[label] = { occurrences: 0, avg_drop: 0, recovery_rate: 0, with_source_change: 0, without_change: 0 }; continue; }
      const recRate = d.occ > 0 ? d.recoveries / d.occ : 0;
      byStreakLength[label] = {
        occurrences: d.occ,
        avg_drop: +avg(d.drops).toFixed(4),
        recovery_rate: +recRate.toFixed(4),
        with_source_change: d.withChange,
        without_change: d.withoutChange
      };
      if (recRate > 0.5) optimalDay = parseInt(label) || 5;
    }

    // Source change uplift
    const withChangeRecoveries = allStreaks.filter(s => s.sourceChange && s.recovered).length;
    const withChangeTotal = allStreaks.filter(s => s.sourceChange).length;
    const withoutChangeRecoveries = allStreaks.filter(s => !s.sourceChange && s.recovered).length;
    const withoutChangeTotal = allStreaks.filter(s => !s.sourceChange).length;
    const withChangeRate = withChangeTotal > 0 ? withChangeRecoveries / withChangeTotal : 0;
    const withoutChangeRate = withoutChangeTotal > 0 ? withoutChangeRecoveries / withoutChangeTotal : 0;
    const uplift = withoutChangeRate > 0 ? ((withChangeRate - withoutChangeRate) / withoutChangeRate * 100) : 0;

    result.analysis_4_drop_recovery = {
      description: "N2 연속 하락 후 회복 분석. optimal_response_day = 이 일수째에 매체 교체해야 함.",
      data: {
        by_streak_length: byStreakLength,
        optimal_response_day: optimalDay,
        source_change_uplift_pct: +uplift.toFixed(2)
      }
    };
    console.log(`  Done: ${allStreaks.length} streaks found`);
  } catch (e) {
    console.log('  [ERR]', e.message);
    result.analysis_4_drop_recovery = { description: "N2 연속 하락 후 회복 분석.", error: e.message };
  }

  // ===== STEP 8: Market patterns (analysis_6) =====
  console.log('\nSTEP 8: Market patterns (analysis_6)...');
  try {
    const intervalStart90 = expandPeriod ? earliestDate : addDays(new Date(), -90);
    const top10Snaps = allSnapshots.filter(s =>
      s.rank !== null && s.rank > 0 && s.rank <= 10 &&
      s.n2_change !== null &&
      s.snapshot_date >= intervalStart90
    );

    // Group by keyword_id + date
    const byKwDate = {};
    top10Snaps.forEach(s => {
      const key = `${s.keyword_id}_${dateStr(s.snapshot_date)}`;
      if (!byKwDate[key]) byKwDate[key] = { keyword_id: s.keyword_id, date: dateStr(s.snapshot_date), changes: [] };
      byKwDate[key].changes.push(s.n2_change);
    });

    const minCount = lowerHaving ? 3 : 5;
    let logicChangeDays = 0, totalDays = 0;
    const byKeyword = {};

    for (const g of Object.values(byKwDate)) {
      if (g.changes.length < minCount) continue;
      totalDays++;
      const pctPos = g.changes.filter(c => c > 0).length / g.changes.length;
      const pctNeg = g.changes.filter(c => c < 0).length / g.changes.length;
      const isLogicChange = pctPos >= 0.8 || pctNeg >= 0.8;
      if (isLogicChange) logicChangeDays++;

      const kw = kwMap[g.keyword_id]?.keyword || `kw_${g.keyword_id}`;
      if (!byKeyword[kw]) byKeyword[kw] = { logic_change_days: 0, total_days: 0 };
      byKeyword[kw].total_days++;
      if (isLogicChange) byKeyword[kw].logic_change_days++;
    }

    const freq = totalDays > 0 ? logicChangeDays / totalDays : 0;
    result.analysis_6_market_patterns = {
      description: "경쟁사 동시 변동 패턴. logic_change_frequency = 로직 변경 추정 빈도.",
      data: {
        logic_change_frequency: +freq.toFixed(4),
        avg_logic_changes_per_month: +(freq * 30).toFixed(2),
        directional_agreement_avg: +freq.toFixed(4),
        by_keyword: byKeyword
      }
    };
    console.log(`  Done: ${logicChangeDays} logic change days / ${totalDays} total`);
  } catch (e) {
    console.log('  [ERR]', e.message);
    result.analysis_6_market_patterns = { description: "경쟁사 동시 변동 패턴.", error: e.message };
  }

  // ===== STEP 9: Logic change history (analysis_8) =====
  console.log('\nSTEP 9: Logic change history (analysis_8)...');
  try {
    const intervalStart180 = expandPeriod ? earliestDate : addDays(new Date(), -180);
    const unmanagedIds = removeManaged ? null : new Set(unmanagedBiz.map(b => b.id));
    const filtered = allSnapshots.filter(s => {
      if (!removeManaged && !unmanagedIds.has(s.business_id)) return false;
      if (s.n2_score === null) return false;
      if (s.snapshot_date < intervalStart180) return false;
      return true;
    });

    // Group by date
    const byDate = {};
    filtered.forEach(s => {
      const d = dateStr(s.snapshot_date);
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(s.n2_score);
    });

    // Require minimum count
    let minHaving = 500;
    let dates = Object.entries(byDate).filter(([_, v]) => v.length >= minHaving);
    if (dates.length < 10) { minHaving = 100; dates = Object.entries(byDate).filter(([_, v]) => v.length >= minHaving); }
    if (dates.length < 10) { minHaving = 50; dates = Object.entries(byDate).filter(([_, v]) => v.length >= minHaving); }
    if (dates.length < 10) { minHaving = 1; dates = Object.entries(byDate).filter(([_, v]) => v.length >= minHaving); adjustments.push('analysis_8: HAVING lowered to 1'); }

    dates.sort((a, b) => a[0].localeCompare(b[0]));
    const dailyAvgs = dates.map(([d, vals]) => ({ date: d, avg: avg(vals), count: vals.length }));

    // Compute day-over-day changes
    const changes = [];
    for (let i = 1; i < dailyAvgs.length; i++) {
      changes.push({ date: dailyAvgs[i].date, change: dailyAvgs[i].avg - dailyAvgs[i - 1].avg });
    }

    const changeVals = changes.map(c => c.change);
    const changeStddev = stddev(changeVals);

    // Suspected logic changes
    const suspected = changes.filter(c => Math.abs(c.change) > 2 * changeStddev);
    const logicChangeDates = suspected.map(c => ({
      date: c.date,
      avg_change: +c.change.toFixed(4),
      severity: Math.abs(c.change) > 3 * changeStddev ? 'major' : 'moderate'
    }));

    // Frequency
    const intervals = [];
    for (let i = 1; i < logicChangeDates.length; i++) {
      intervals.push(daysBetween(logicChangeDates[i - 1].date, logicChangeDates[i].date));
    }

    const periodDays = dailyAvgs.length > 1 ? daysBetween(dailyAvgs[0].date, dailyAvgs[dailyAvgs.length - 1].date) : 0;

    result.analysis_8_logic_change_history = {
      description: "로직 변경 추정 이력. severity: major/moderate.",
      data: {
        dates: logicChangeDates,
        frequency: {
          total_suspected_changes: logicChangeDates.length,
          period_days: periodDays,
          avg_interval_days: intervals.length > 0 ? +avg(intervals).toFixed(1) : 0,
          min_interval_days: intervals.length > 0 ? Math.min(...intervals) : 0,
          max_interval_days: intervals.length > 0 ? Math.max(...intervals) : 0
        }
      }
    };
    console.log(`  Done: ${logicChangeDates.length} suspected changes in ${periodDays} days`);
  } catch (e) {
    console.log('  [ERR]', e.message);
    result.analysis_8_logic_change_history = { description: "로직 변경 추정 이력.", error: e.message };
  }

  // ===== STEP 10: Current A/B tests (analysis_9) =====
  console.log('\nSTEP 10: Current tests (analysis_9)...');
  try {
    let hypotheses = [];
    if (tableStatus.hypotheses) {
      try {
        const { data, error } = await supabase.from('hypotheses').select('*').order('created_at', { ascending: false }).limit(20);
        if (!error && data) hypotheses = data;
      } catch (e) { hypotheses = []; }
    }

    // Managed business recent 30d
    const managedIds = new Set(managedBiz.map(b => b.id));
    const thirtyAgo = addDays(new Date(), -30);
    const recentManaged = allSnapshots.filter(s =>
      managedIds.has(s.business_id) && dateStr(s.snapshot_date) >= thirtyAgo
    ).map(s => ({
      business_name: bizMap[s.business_id]?.name || `biz_${s.business_id}`,
      snapshot_date: dateStr(s.snapshot_date),
      rank: s.rank,
      n2_score: s.n2_score,
      n2_change: s.n2_change,
      blog_review_count: s.blog_review_count,
      visitor_review_count: s.visitor_review_count,
      save_count: s.save_count
    })).sort((a, b) => `${a.business_name}_${b.snapshot_date}`.localeCompare(`${b.business_name}_${a.snapshot_date}`));

    result.analysis_9_current_tests = {
      description: "현재 진행 중인 A/B 테스트 결과.",
      hypotheses: tableStatus.hypotheses ? hypotheses : 'table_missing',
      managed_business_recent_30d: recentManaged.slice(0, 500) // Cap output size
    };
    console.log(`  Done: ${hypotheses.length} hypotheses, ${recentManaged.length} recent snapshots`);
  } catch (e) {
    console.log('  [ERR]', e.message);
    result.analysis_9_current_tests = { description: "현재 진행 중인 A/B 테스트 결과.", error: e.message };
  }

  // Update adjustments in meta
  result.meta.data_quality.adjustments_made = adjustments;

  // Write output
  const outputPath = '/home/onda/projects/onda-hompage/onda_analysis_result.json';
  const fs = require('fs');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n=== DONE: Written to ${outputPath} ===`);

  // Count successful analyses
  const analysisKeys = Object.keys(result).filter(k => k.startsWith('analysis_'));
  const successCount = analysisKeys.filter(k => !result[k].error).length;
  console.log(`Successful analyses: ${successCount}/${analysisKeys.length}`);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
