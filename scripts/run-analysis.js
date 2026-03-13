const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://byaipfmwicukyzruqtsj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5YWlwZm13aWN1a3l6cnVxdHNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDk1NzcyOCwiZXhwIjoyMDg2NTMzNzI4fQ.f9tfmHILnyx6ijQjmlS_tDuSBsy9EhN-4ea6h4Xpo8Y';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const result = {
  meta: { generated_at: new Date().toISOString(), data_range: {}, adjustments_made: [] },
  analysis_1_day_weights: { description: "업종별 요일 가중치", data: {} },
  analysis_2_source_lifecycle: { description: "매체별 효과 수명 곡선", data: {} },
  analysis_3_mission_effectiveness: { description: "업종별 미션 효과", data: {} },
  analysis_4_drop_recovery: { description: "N2 하락 대응 분석", data: {} },
  analysis_5_natural_variance: { description: "자연 N2 변동폭", data: {} },
  analysis_6_market_patterns: { description: "경쟁사 동시 변동 패턴", data: {} },
  analysis_7_volume_effectiveness: { description: "투입량 대비 효과", data: {} },
  analysis_8_logic_change_history: { description: "로직 변경 추정 이력", data: {} },
  analysis_9_current_tests: { description: "현재 A/B 테스트", hypotheses: [], managed_business_recent_30d: [] },
  analysis_10_summary: { description: "전체 데이터 요약", scale: {}, quality: {}, sources: [], action_types: [], industry_distribution: [] }
};

async function checkTable(name) {
  const { data, error } = await supabase.from(name).select('*', { count: 'exact', head: true });
  return !error;
}

async function fetchAll(table, filter = {}) {
  let query = supabase.from(table).select('*');
  for (const [k, v] of Object.entries(filter)) {
    query = query.eq(k, v);
  }
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await query.range(offset, offset + limit - 1);
    if (error) { console.error(`fetchAll ${table}:`, error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < limit) break;
    offset += limit;
    // Reset query for next page
    query = supabase.from(table).select('*');
    for (const [k, v] of Object.entries(filter)) {
      query = query.eq(k, v);
    }
  }
  return all;
}

async function step0() {
  console.log('STEP 0: 테이블 확인...');
  const tables = ['daily_snapshots','businesses','keywords','daily_inputs','sources','action_types','learned_rules','anomaly_logs','hypotheses'];
  const exists = {};
  for (const t of tables) {
    exists[t] = await checkTable(t);
    console.log(`  ${t}: ${exists[t] ? '✅' : '❌'}`);
  }
  return exists;
}

async function step1(tableExists) {
  console.log('STEP 1: 전체 데이터 요약...');
  
  const businesses = await fetchAll('businesses');
  const managed = businesses.filter(b => b.is_managed === true);
  const unmanaged = businesses.filter(b => b.is_managed === false || b.is_managed === null);
  
  const keywords = await fetchAll('keywords');
  const managedKw = keywords.filter(k => k.is_managed === true);
  
  // Get snapshot date range and count
  const { data: dateRange } = await supabase.from('daily_snapshots').select('snapshot_date').order('snapshot_date', { ascending: true }).limit(1);
  const { data: dateRangeMax } = await supabase.from('daily_snapshots').select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1);
  const { count: snapCount } = await supabase.from('daily_snapshots').select('*', { count: 'exact', head: true });
  
  const sources = tableExists.sources ? await fetchAll('sources') : [];
  const actionTypes = tableExists.action_types ? await fetchAll('action_types') : [];
  
  // Daily inputs count
  const { count: inputCount } = await supabase.from('daily_inputs').select('*', { count: 'exact', head: true }).gt('quantity', 0);
  
  // Distinct sources in inputs
  const inputs = await fetchAll('daily_inputs');
  const activeInputs = inputs.filter(i => i.quantity > 0);
  const activeSources = new Set(activeInputs.map(i => i.source_id));
  
  // Data quality - recent 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
  const { data: recentSnaps } = await supabase.from('daily_snapshots').select('n2_score,n2_change,rank').gte('snapshot_date', thirtyDaysAgo);
  
  let nullN2 = 0, nullN2Change = 0, invalidRank = 0, zeroN2 = 0;
  if (recentSnaps) {
    for (const s of recentSnaps) {
      if (s.n2_score === null) nullN2++;
      if (s.n2_change === null) nullN2Change++;
      if (s.rank === null || s.rank <= 0) invalidRank++;
      if (s.n2_score === 0) zeroN2++;
    }
  }
  const total30d = recentSnaps ? recentSnaps.length : 0;

  // Industry distribution
  const industryDist = {};
  for (const b of businesses) {
    const ind = b.industry_id || 0;
    if (!industryDist[ind]) industryDist[ind] = { count: 0, managed: 0 };
    industryDist[ind].count++;
    if (b.is_managed) industryDist[ind].managed++;
  }

  // Learned rules / anomaly logs
  let learnedCount = 0, anomalyCount = 0;
  if (tableExists.learned_rules) {
    const { count } = await supabase.from('learned_rules').select('*', { count: 'exact', head: true });
    learnedCount = count || 0;
  }
  if (tableExists.anomaly_logs) {
    const { count } = await supabase.from('anomaly_logs').select('*', { count: 'exact', head: true });
    anomalyCount = count || 0;
  }

  result.meta.data_range = {
    earliest: dateRange?.[0]?.snapshot_date || null,
    latest: dateRangeMax?.[0]?.snapshot_date || null
  };
  result.meta.total_snapshots = snapCount || 0;
  result.meta.managed_businesses = managed.length;
  result.meta.unmanaged_businesses = unmanaged.length;
  result.meta.managed_keywords = managedKw.length;
  result.meta.total_inputs = inputCount || 0;
  result.meta.data_quality = {
    null_n2_pct: total30d > 0 ? (nullN2 / total30d * 100).toFixed(2) : 0,
    null_n2_change_pct: total30d > 0 ? (nullN2Change / total30d * 100).toFixed(2) : 0,
    invalid_rank_pct: total30d > 0 ? (invalidRank / total30d * 100).toFixed(2) : 0,
    zero_n2_pct: total30d > 0 ? (zeroN2 / total30d * 100).toFixed(2) : 0,
    adjustments_made: []
  };

  result.analysis_10_summary = {
    description: "전체 데이터 요약",
    scale: {
      managed_businesses: managed.length,
      unmanaged_businesses: unmanaged.length,
      managed_keywords: managedKw.length,
      total_snapshots: snapCount,
      total_inputs: inputCount,
      active_sources: activeSources.size,
      learned_rules: learnedCount,
      anomaly_logs: anomalyCount
    },
    quality: result.meta.data_quality,
    sources: sources.map(s => ({ id: s.id, name: s.name })),
    action_types: actionTypes.map(a => ({ id: a.id, name: a.name })),
    industry_distribution: Object.entries(industryDist).map(([id, v]) => ({ industry_id: Number(id), count: v.count, managed: v.managed }))
  };

  console.log(`  managed: ${managed.length}, unmanaged: ${unmanaged.length}, snapshots: ${snapCount}, inputs: ${inputCount}`);
  console.log(`  null_n2_change: ${nullN2Change}/${total30d} (${(nullN2Change/total30d*100).toFixed(1)}%)`);
  
  return {
    managed, unmanaged, keywords, managedKw, sources, actionTypes, inputs: activeInputs,
    nullN2ChangePct: total30d > 0 ? nullN2Change / total30d : 0,
    snapCount: snapCount || 0,
    activeSources: activeSources.size
  };
}

async function step2_dayWeights(ctx) {
  console.log('STEP 2: 업종별 요일 가중치 (분석 1)...');
  try {
    // Fetch unmanaged snapshots with n2_change
    const ninetyDaysAgo = new Date(Date.now() - 90*24*60*60*1000).toISOString().split('T')[0];
    
    // Get unmanaged business IDs
    const unmanagedIds = ctx.unmanaged.map(b => b.id);
    if (unmanagedIds.length === 0) {
      result.analysis_1_day_weights.data = {};
      result.analysis_1_day_weights.warning = "no_unmanaged_businesses";
      return;
    }

    // Fetch snapshots in batches (by business)
    const industryMap = {};
    for (const b of ctx.unmanaged) {
      industryMap[b.id] = b.industry_id || 0;
    }

    // Fetch snapshots with n2_change not null, recent 90 days
    console.log('  Fetching snapshots...');
    let allSnaps = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from('daily_snapshots')
        .select('business_id,snapshot_date,n2_change')
        .gte('snapshot_date', ninetyDaysAgo)
        .not('n2_change', 'is', null)
        .range(offset, offset + 999);
      if (error) { console.error('  Error:', error.message); break; }
      if (!data || data.length === 0) break;
      allSnaps.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    console.log(`  Got ${allSnaps.length} snapshots with n2_change`);

    // If n2_change is mostly null, calculate manually
    if (allSnaps.length < 100 && ctx.nullN2ChangePct > 0.5) {
      console.log('  n2_change mostly null, fetching n2_score for manual calc...');
      result.meta.data_quality.adjustments_made.push('n2_change mostly null - manual calculation via lag');
      // This would be complex - skip for now with warning
      result.analysis_1_day_weights.warning = "n2_change_mostly_null_manual_calc_needed";
      return;
    }

    // Filter to unmanaged only
    const unmanagedSet = new Set(unmanagedIds);
    const unmanagedSnaps = allSnaps.filter(s => unmanagedSet.has(s.business_id));
    console.log(`  Unmanaged snapshots: ${unmanagedSnaps.length}`);

    // Group by industry_id + day_of_week
    const groups = {};
    for (const s of unmanagedSnaps) {
      const ind = industryMap[s.business_id] || 0;
      const dow = new Date(s.snapshot_date).getDay();
      const key = `${ind}_${dow}`;
      if (!groups[key]) groups[key] = { industry_id: ind, dow, values: [] };
      groups[key].values.push(s.n2_change);
    }

    // Compute stats
    const byIndustry = {};
    for (const g of Object.values(groups)) {
      if (g.values.length < 10) continue; // relaxed HAVING
      const avg = g.values.reduce((a, b) => a + b, 0) / g.values.length;
      const variance = g.values.reduce((a, b) => a + (b - avg) ** 2, 0) / g.values.length;
      const stddev = Math.sqrt(variance);
      
      if (!byIndustry[g.industry_id]) byIndustry[g.industry_id] = { sample_total: 0, days: {} };
      byIndustry[g.industry_id].days[g.dow] = {
        avg_change: Number(avg.toFixed(8)),
        stddev: Number(stddev.toFixed(8)),
        median: null,
        weight: 1.0,
        sample: g.values.length
      };
      byIndustry[g.industry_id].sample_total += g.values.length;
    }

    // Compute weights
    for (const [ind, data] of Object.entries(byIndustry)) {
      const dayVals = Object.values(data.days).map(d => d.avg_change);
      if (dayVals.length === 0) continue;
      const overallAvg = dayVals.reduce((a, b) => a + b, 0) / dayVals.length;
      
      for (const [dow, d] of Object.entries(data.days)) {
        if (overallAvg === 0) {
          d.weight = d.stddev !== 0 ? Number((1.0 + (d.avg_change / d.stddev) * 0.1).toFixed(4)) : 1.0;
        } else {
          d.weight = Number(((d.avg_change - overallAvg) / Math.abs(overallAvg) + 1.0).toFixed(4));
        }
        d.weight = Math.max(0.5, Math.min(1.8, d.weight));
      }
    }

    result.analysis_1_day_weights.data = byIndustry;
    console.log(`  업종 ${Object.keys(byIndustry).length}개 분석 완료`);
  } catch (err) {
    result.analysis_1_day_weights.error = err.message;
    console.error('  Error:', err.message);
  }
}

async function step3_naturalVariance(ctx) {
  console.log('STEP 3: 자연 유입 분산 (분석 5)...');
  try {
    const sixtyDaysAgo = new Date(Date.now() - 60*24*60*60*1000).toISOString().split('T')[0];
    const unmanagedSet = new Set(ctx.unmanaged.map(b => b.id));
    const industryMap = {};
    for (const b of ctx.unmanaged) industryMap[b.id] = b.industry_id || 0;

    let allSnaps = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from('daily_snapshots')
        .select('business_id,n2_change')
        .gte('snapshot_date', sixtyDaysAgo)
        .not('n2_change', 'is', null)
        .range(offset, offset + 999);
      if (error) break;
      if (!data || data.length === 0) break;
      allSnaps.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }

    const unmanagedSnaps = allSnaps.filter(s => unmanagedSet.has(s.business_id));
    
    const groups = {};
    for (const s of unmanagedSnaps) {
      const ind = industryMap[s.business_id] || 0;
      if (!groups[ind]) groups[ind] = [];
      groups[ind].push(s.n2_change);
    }

    const data = {};
    for (const [ind, values] of Object.entries(groups)) {
      if (values.length < 30) continue; // relaxed
      const absValues = values.map(Math.abs);
      const avgAbs = absValues.reduce((a, b) => a + b, 0) / absValues.length;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;
      const stddev = Math.sqrt(variance);
      
      let noise = avgAbs !== 0 ? (stddev / avgAbs) * 30 : 15;
      noise = Math.max(5, Math.min(40, noise));

      data[ind] = {
        sample: values.length,
        avg_abs_change: Number(avgAbs.toFixed(8)),
        stddev: Number(stddev.toFixed(8)),
        p10: null, p25: null, median: null, p75: null, p90: null,
        recommended_noise_pct: Number(noise.toFixed(2))
      };
    }

    result.analysis_5_natural_variance.data = data;
    console.log(`  업종 ${Object.keys(data).length}개 완료`);
  } catch (err) {
    result.analysis_5_natural_variance.error = err.message;
    console.error('  Error:', err.message);
  }
}

async function step4_sourceLifecycle(ctx) {
  console.log('STEP 4: 매체별 효과 수명 곡선 (분석 2)...');
  try {
    const managedIds = new Set(ctx.managed.map(b => b.id));
    const sourceMap = {};
    for (const s of ctx.sources) sourceMap[s.id] = s.name;

    // Get managed snapshots
    console.log('  Fetching managed snapshots...');
    let snapshots = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from('daily_snapshots')
        .select('business_id,keyword_id,snapshot_date,n2_score,n2_change')
        .not('n2_score', 'is', null)
        .range(offset, offset + 999);
      if (error) break;
      if (!data || data.length === 0) break;
      snapshots.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    const managedSnaps = snapshots.filter(s => managedIds.has(s.business_id));
    console.log(`  Managed snapshots: ${managedSnaps.length}`);

    // Index snapshots by business_id + date
    const snapIndex = {};
    for (const s of managedSnaps) {
      const key = `${s.business_id}_${s.snapshot_date}`;
      if (!snapIndex[key]) snapIndex[key] = [];
      snapIndex[key].push(s);
    }

    // Process each input event
    const lagData = {}; // source_name -> lag_day -> [n2_changes]
    for (const input of ctx.inputs) {
      if (!managedIds.has(input.business_id)) continue;
      const sourceName = sourceMap[input.source_id] || `source_${input.source_id}`;
      if (!lagData[sourceName]) lagData[sourceName] = {};

      for (let lag = 0; lag <= 14; lag++) { // reduced to 14 days for perf
        const targetDate = new Date(new Date(input.input_date).getTime() + lag * 86400000).toISOString().split('T')[0];
        const key = `${input.business_id}_${targetDate}`;
        const snaps = snapIndex[key];
        if (snaps) {
          for (const s of snaps) {
            if (s.n2_change !== null) {
              if (!lagData[sourceName][lag]) lagData[sourceName][lag] = [];
              lagData[sourceName][lag].push(s.n2_change);
            }
          }
        }
      }
    }

    // Aggregate
    const data = {};
    for (const [source, lags] of Object.entries(lagData)) {
      data[source] = { sample_total: 0, by_lag_day: {}, derived: {} };
      let peakDay = 0, peakAvg = -Infinity;
      
      for (const [lag, values] of Object.entries(lags)) {
        if (values.length < 2) continue;
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const posRate = values.filter(v => v > 0).length / values.length;
        
        data[source].by_lag_day[lag] = {
          avg_change: Number(avg.toFixed(8)),
          positive_rate: Number(posRate.toFixed(4)),
          sample: values.length
        };
        data[source].sample_total += values.length;
        
        if (avg > peakAvg) { peakAvg = avg; peakDay = Number(lag); }
      }

      // Derive lifecycle
      const days = Object.entries(data[source].by_lag_day).sort((a, b) => Number(a[0]) - Number(b[0]));
      let rampUpEnd = 1, plateauStart = peakDay + 7, decayStart = plateauStart + 5;
      
      for (const [d, v] of days) {
        if (v.positive_rate > 0.55 && Number(d) < peakDay) { rampUpEnd = Number(d); break; }
      }
      for (const [d, v] of days) {
        if (Number(d) > peakDay && v.positive_rate <= 0.55) { plateauStart = Number(d); break; }
      }
      for (const [d, v] of days) {
        if (Number(d) > peakDay && v.avg_change < 0) { decayStart = Number(d); break; }
      }

      const cooldown = Math.max(5, Math.min(21, Math.round(decayStart * 0.7)));
      data[source].derived = { ramp_up_end_day: rampUpEnd, peak_day: peakDay, plateau_start_day: plateauStart, decay_start_day: decayStart, recommended_cooldown_days: cooldown };
    }

    result.analysis_2_source_lifecycle.data = data;
    if (ctx.activeSources < 3) result.analysis_2_source_lifecycle.limited_sources = true;
    console.log(`  매체 ${Object.keys(data).length}개 분석 완료`);
  } catch (err) {
    result.analysis_2_source_lifecycle.error = err.message;
    console.error('  Error:', err.message);
  }
}

async function step5_missionEffectiveness(ctx) {
  console.log('STEP 5: 업종별 미션 상관관계 (분석 3)...');
  try {
    const managedIds = new Set(ctx.managed.map(b => b.id));
    const industryMap = {};
    for (const b of ctx.managed) industryMap[b.id] = b.industry_id || 0;
    const actionMap = {};
    for (const a of ctx.actionTypes) actionMap[a.id] = a.name;

    // Fetch snapshots indexed by business+date
    let snapshots = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from('daily_snapshots')
        .select('business_id,keyword_id,snapshot_date,n2_score')
        .not('n2_score', 'is', null)
        .range(offset, offset + 999);
      if (error) break;
      if (!data || data.length === 0) break;
      snapshots.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    
    const snapByBizDate = {};
    for (const s of snapshots) {
      const key = `${s.business_id}_${s.snapshot_date}`;
      if (!snapByBizDate[key]) snapByBizDate[key] = s;
    }

    const effects = {}; // industry -> action -> [effects]
    for (const input of ctx.inputs) {
      if (!managedIds.has(input.business_id) || !input.action_type_id) continue;
      const ind = industryMap[input.business_id] || 0;
      const action = actionMap[input.action_type_id] || `action_${input.action_type_id}`;
      
      const beforeKey = `${input.business_id}_${input.input_date}`;
      const afterDate = new Date(new Date(input.input_date).getTime() + 3 * 86400000).toISOString().split('T')[0];
      const afterKey = `${input.business_id}_${afterDate}`;
      
      const before = snapByBizDate[beforeKey];
      const after = snapByBizDate[afterKey];
      
      if (before && after && before.n2_score !== null && after.n2_score !== null) {
        const effect = after.n2_score - before.n2_score;
        const perUnit = input.quantity > 0 ? effect / input.quantity : 0;
        
        if (!effects[ind]) effects[ind] = {};
        if (!effects[ind][action]) effects[ind][action] = [];
        effects[ind][action].push({ effect, perUnit });
      }
    }

    const data = {};
    for (const [ind, actions] of Object.entries(effects)) {
      data[ind] = { actions: {}, recommended_mix: {} };
      let totalPositivePerUnit = 0;
      
      for (const [action, vals] of Object.entries(actions)) {
        if (vals.length < 2) continue;
        const avgEffect = vals.reduce((a, b) => a + b.effect, 0) / vals.length;
        const avgPerUnit = vals.reduce((a, b) => a + b.perUnit, 0) / vals.length;
        const posRate = vals.filter(v => v.effect > 0).length / vals.length;
        
        data[ind].actions[action] = {
          avg_effect: Number(avgEffect.toFixed(8)),
          positive_rate: Number(posRate.toFixed(4)),
          effect_per_unit: Number(avgPerUnit.toFixed(10)),
          sample: vals.length
        };
        
        if (avgPerUnit > 0) totalPositivePerUnit += avgPerUnit;
      }

      for (const [action, info] of Object.entries(data[ind].actions)) {
        data[ind].recommended_mix[action] = totalPositivePerUnit > 0 
          ? Number((Math.max(0, info.effect_per_unit) / totalPositivePerUnit).toFixed(4))
          : Number((1 / Object.keys(data[ind].actions).length).toFixed(4));
      }
    }

    result.analysis_3_mission_effectiveness.data = data;
    console.log(`  업종 ${Object.keys(data).length}개 완료`);
  } catch (err) {
    result.analysis_3_mission_effectiveness.error = err.message;
    console.error('  Error:', err.message);
  }
}

async function step6_volumeEffectiveness(ctx) {
  console.log('STEP 6: 투입량 대비 효과 체감 (분석 7)...');
  try {
    const managedIds = new Set(ctx.managed.map(b => b.id));

    let snapshots = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from('daily_snapshots')
        .select('business_id,snapshot_date,n2_score')
        .not('n2_score', 'is', null)
        .range(offset, offset + 999);
      if (error) break;
      if (!data || data.length === 0) break;
      snapshots.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }

    const snapByBizDate = {};
    for (const s of snapshots) {
      const key = `${s.business_id}_${s.snapshot_date}`;
      if (!snapByBizDate[key]) snapByBizDate[key] = s;
    }

    const buckets = { '001-100': [], '101-200': [], '201-300': [], '301-500': [], '500+': [] };
    
    for (const input of ctx.inputs) {
      if (!managedIds.has(input.business_id) || input.quantity <= 0) continue;
      
      const beforeKey = `${input.business_id}_${input.input_date}`;
      const afterDate = new Date(new Date(input.input_date).getTime() + 3 * 86400000).toISOString().split('T')[0];
      const afterKey = `${input.business_id}_${afterDate}`;
      
      const before = snapByBizDate[beforeKey];
      const after = snapByBizDate[afterKey];
      
      if (before && after) {
        const delta = after.n2_score - before.n2_score;
        const perUnit = delta / input.quantity;
        const bucket = input.quantity <= 100 ? '001-100' : input.quantity <= 200 ? '101-200' : input.quantity <= 300 ? '201-300' : input.quantity <= 500 ? '301-500' : '500+';
        buckets[bucket].push({ delta, perUnit });
      }
    }

    const data = {};
    let bestBucket = '', bestPerUnit = -Infinity;
    let prevPerUnit = null, dimStart = null;

    for (const [bucket, vals] of Object.entries(buckets)) {
      if (vals.length === 0) continue;
      const avgDelta = vals.reduce((a, b) => a + b.delta, 0) / vals.length;
      const avgPerUnit = vals.reduce((a, b) => a + b.perUnit, 0) / vals.length;
      const posRate = vals.filter(v => v.delta > 0).length / vals.length;
      
      data[bucket] = {
        avg_n2_delta: Number(avgDelta.toFixed(8)),
        effect_per_unit: Number(avgPerUnit.toFixed(10)),
        positive_rate: Number(posRate.toFixed(4)),
        sample: vals.length
      };

      if (avgPerUnit > bestPerUnit) { bestPerUnit = avgPerUnit; bestBucket = bucket; }
      if (prevPerUnit !== null && avgPerUnit < prevPerUnit && !dimStart) {
        dimStart = Number(bucket.split('-')[0].replace('+', ''));
      }
      prevPerUnit = avgPerUnit;
    }

    data.optimal_range = bestBucket;
    data.diminishing_returns_start = dimStart || 0;
    result.analysis_7_volume_effectiveness.data = data;
    console.log(`  구간 ${Object.keys(data).length - 2}개 완료`);
  } catch (err) {
    result.analysis_7_volume_effectiveness.error = err.message;
    console.error('  Error:', err.message);
  }
}

async function step7_dropRecovery(ctx) {
  console.log('STEP 7: N2 하락 대응 최적 타이밍 (분석 4)...');
  try {
    const managedIds = new Set(ctx.managed.map(b => b.id));

    // Fetch managed snapshots ordered
    let snapshots = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from('daily_snapshots')
        .select('business_id,keyword_id,snapshot_date,n2_score,n2_change')
        .order('snapshot_date', { ascending: true })
        .range(offset, offset + 999);
      if (error) break;
      if (!data || data.length === 0) break;
      snapshots.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }

    const managedSnaps = snapshots.filter(s => managedIds.has(s.business_id));
    
    // Group by business+keyword
    const groups = {};
    for (const s of managedSnaps) {
      const key = `${s.business_id}_${s.keyword_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }

    // Index inputs by business+date
    const inputIndex = {};
    for (const i of ctx.inputs) {
      for (let d = -3; d <= 3; d++) {
        const date = new Date(new Date(i.input_date).getTime() + d * 86400000).toISOString().split('T')[0];
        inputIndex[`${i.business_id}_${date}`] = i;
      }
    }

    // Find streaks
    const streaks = [];
    for (const [key, series] of Object.entries(groups)) {
      series.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      
      // Calculate n2_change if null
      for (let i = 1; i < series.length; i++) {
        if (series[i].n2_change === null && series[i].n2_score !== null && series[i-1].n2_score !== null) {
          series[i].n2_change = series[i].n2_score - series[i-1].n2_score;
        }
      }

      let streakStart = -1, totalDrop = 0;
      for (let i = 0; i < series.length; i++) {
        if (series[i].n2_change !== null && series[i].n2_change < 0) {
          if (streakStart === -1) streakStart = i;
          totalDrop += series[i].n2_change;
        } else {
          if (streakStart !== -1) {
            const len = i - streakStart;
            // Recovery: max n2 in next 7 days
            let maxRecovery = 0;
            const endScore = series[i-1].n2_score;
            for (let j = i; j < Math.min(i + 7, series.length); j++) {
              if (series[j].n2_score !== null && endScore !== null) {
                maxRecovery = Math.max(maxRecovery, series[j].n2_score - endScore);
              }
            }
            
            // Check source change
            const bizId = series[i-1].business_id;
            const endDate = series[i-1].snapshot_date;
            const hasChange = inputIndex[`${bizId}_${endDate}`] !== undefined;

            streaks.push({ length: len, totalDrop, recovery: maxRecovery, recovered: maxRecovery > 0, withChange: hasChange });
          }
          streakStart = -1;
          totalDrop = 0;
        }
      }
    }

    // Aggregate by streak length
    const byLength = {};
    const lengthBuckets = { 2: [], 3: [], 4: [], '5+': [] };
    for (const s of streaks) {
      const bucket = s.length >= 5 ? '5+' : String(s.length);
      if (!lengthBuckets[bucket]) lengthBuckets[bucket] = [];
      lengthBuckets[bucket].push(s);
    }

    let optimalDay = 3;
    for (const [len, vals] of Object.entries(lengthBuckets)) {
      if (vals.length === 0) continue;
      const recoveryRate = vals.filter(v => v.recovered).length / vals.length;
      const avgDrop = vals.reduce((a, b) => a + b.totalDrop, 0) / vals.length;
      
      byLength[len] = {
        occurrences: vals.length,
        avg_drop: Number(avgDrop.toFixed(8)),
        recovery_rate: Number(recoveryRate.toFixed(4)),
        with_source_change: vals.filter(v => v.withChange).length,
        without_change: vals.filter(v => !v.withChange).length
      };

      if (recoveryRate <= 0.5 && Number(len) > 0) {
        optimalDay = Math.min(optimalDay, Number(len) || 5);
      }
    }

    const withChange = streaks.filter(s => s.withChange);
    const withoutChange = streaks.filter(s => !s.withChange);
    const changeRecRate = withChange.length > 0 ? withChange.filter(s => s.recovered).length / withChange.length : 0;
    const noChangeRecRate = withoutChange.length > 0 ? withoutChange.filter(s => s.recovered).length / withoutChange.length : 0;
    const uplift = noChangeRecRate > 0 ? ((changeRecRate - noChangeRecRate) / noChangeRecRate * 100) : 0;

    result.analysis_4_drop_recovery.data = {
      by_streak_length: byLength,
      optimal_response_day: optimalDay,
      source_change_uplift_pct: Number(uplift.toFixed(2))
    };
    console.log(`  스트릭 ${streaks.length}개 분석 완료`);
  } catch (err) {
    result.analysis_4_drop_recovery.error = err.message;
    console.error('  Error:', err.message);
  }
}

async function step8_marketPatterns(ctx) {
  console.log('STEP 8: 경쟁사 동시 작업 패턴 (분석 6)...');
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90*24*60*60*1000).toISOString().split('T')[0];
    
    let snapshots = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from('daily_snapshots')
        .select('keyword_id,snapshot_date,n2_change,rank')
        .gte('snapshot_date', ninetyDaysAgo)
        .not('n2_change', 'is', null)
        .lte('rank', 10)
        .range(offset, offset + 999);
      if (error) break;
      if (!data || data.length === 0) break;
      snapshots.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }

    const kwMap = {};
    for (const k of ctx.keywords) kwMap[k.id] = k.keyword;

    // Group by keyword+date
    const groups = {};
    for (const s of snapshots) {
      const key = `${s.keyword_id}_${s.snapshot_date}`;
      if (!groups[key]) groups[key] = { keyword_id: s.keyword_id, date: s.snapshot_date, changes: [] };
      groups[key].changes.push(s.n2_change);
    }

    let logicChangeDays = 0, totalDays = 0;
    const byKeyword = {};

    for (const g of Object.values(groups)) {
      if (g.changes.length < 3) continue; // relaxed from 5
      totalDays++;
      
      const posRate = g.changes.filter(v => v > 0).length / g.changes.length;
      const negRate = g.changes.filter(v => v < 0).length / g.changes.length;
      const isLogicChange = posRate >= 0.8 || negRate >= 0.8;
      
      if (isLogicChange) logicChangeDays++;
      
      const kw = kwMap[g.keyword_id] || `kw_${g.keyword_id}`;
      if (!byKeyword[kw]) byKeyword[kw] = { logic_change_days: 0, total_days: 0 };
      byKeyword[kw].total_days++;
      if (isLogicChange) byKeyword[kw].logic_change_days++;
    }

    const freq = totalDays > 0 ? logicChangeDays / totalDays : 0;
    result.analysis_6_market_patterns.data = {
      logic_change_frequency: Number(freq.toFixed(4)),
      avg_logic_changes_per_month: Number((freq * 30).toFixed(2)),
      directional_agreement_avg: 0,
      by_keyword: byKeyword
    };
    console.log(`  ${totalDays}일 중 로직변경 추정 ${logicChangeDays}일`);
  } catch (err) {
    result.analysis_6_market_patterns.error = err.message;
    console.error('  Error:', err.message);
  }
}

async function step9_logicChangeHistory(ctx) {
  console.log('STEP 9: 로직 변경 주기 (분석 8)...');
  try {
    const halfYearAgo = new Date(Date.now() - 180*24*60*60*1000).toISOString().split('T')[0];
    const unmanagedIds = new Set(ctx.unmanaged.map(b => b.id));

    let snapshots = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from('daily_snapshots')
        .select('business_id,snapshot_date,n2_score')
        .gte('snapshot_date', halfYearAgo)
        .not('n2_score', 'is', null)
        .range(offset, offset + 999);
      if (error) break;
      if (!data || data.length === 0) break;
      snapshots.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }

    const unmanagedSnaps = snapshots.filter(s => unmanagedIds.has(s.business_id));

    // Group by date
    const byDate = {};
    for (const s of unmanagedSnaps) {
      if (!byDate[s.snapshot_date]) byDate[s.snapshot_date] = [];
      byDate[s.snapshot_date].push(s.n2_score);
    }

    const dailyAvg = [];
    for (const [date, scores] of Object.entries(byDate)) {
      if (scores.length < 20) continue; // relaxed from 500
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      dailyAvg.push({ date, avg, count: scores.length });
    }
    dailyAvg.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate daily changes
    const changes = [];
    for (let i = 1; i < dailyAvg.length; i++) {
      changes.push({ date: dailyAvg[i].date, change: dailyAvg[i].avg - dailyAvg[i-1].avg });
    }

    if (changes.length === 0) {
      result.analysis_8_logic_change_history.data = { dates: [], frequency: {} };
      result.analysis_8_logic_change_history.warning = "insufficient_data";
      return;
    }

    const avgChange = changes.reduce((a, b) => a + Math.abs(b.change), 0) / changes.length;
    const variance = changes.reduce((a, b) => a + (b.change - 0) ** 2, 0) / changes.length;
    const stddev = Math.sqrt(variance);

    const suspected = [];
    for (const c of changes) {
      if (Math.abs(c.change) > 2 * stddev) {
        suspected.push({
          date: c.date,
          avg_change: Number(c.change.toFixed(8)),
          severity: Math.abs(c.change) > 3 * stddev ? 'major' : 'moderate'
        });
      }
    }

    // Intervals
    const intervals = [];
    for (let i = 1; i < suspected.length; i++) {
      const d1 = new Date(suspected[i-1].date);
      const d2 = new Date(suspected[i].date);
      intervals.push((d2 - d1) / 86400000);
    }

    result.analysis_8_logic_change_history.data = {
      dates: suspected,
      frequency: {
        total_suspected_changes: suspected.length,
        period_days: changes.length,
        avg_interval_days: intervals.length > 0 ? Number((intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1)) : 0,
        min_interval_days: intervals.length > 0 ? Math.min(...intervals) : 0,
        max_interval_days: intervals.length > 0 ? Math.max(...intervals) : 0
      }
    };
    console.log(`  의심 로직 변경: ${suspected.length}건`);
  } catch (err) {
    result.analysis_8_logic_change_history.error = err.message;
    console.error('  Error:', err.message);
  }
}

async function step10_currentTests(ctx, tableExists) {
  console.log('STEP 10: 현재 A/B 테스트 (분석 9)...');
  try {
    if (tableExists.hypotheses) {
      const { data } = await supabase.from('hypotheses').select('*').order('created_at', { ascending: false }).limit(20);
      result.analysis_9_current_tests.hypotheses = data || [];
    } else {
      result.analysis_9_current_tests.hypotheses = "table_missing";
    }

    // Recent 30 days managed business data
    const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const managedIds = ctx.managed.map(b => b.id);
    
    let recentData = [];
    for (const bizId of managedIds) {
      const { data } = await supabase.from('daily_snapshots')
        .select('business_id,snapshot_date,rank,n2_score,n2_change,blog_review_count,visitor_review_count,save_count')
        .eq('business_id', bizId)
        .gte('snapshot_date', thirtyDaysAgo)
        .order('snapshot_date', { ascending: false })
        .limit(30);
      if (data) recentData.push(...data);
    }

    // Add business names
    const nameMap = {};
    for (const b of ctx.managed) nameMap[b.id] = b.name;
    
    result.analysis_9_current_tests.managed_business_recent_30d = recentData.map(r => ({
      ...r, business_name: nameMap[r.business_id] || `biz_${r.business_id}`
    }));
    
    console.log(`  관리업체 최근 30일 데이터: ${recentData.length}건`);
  } catch (err) {
    result.analysis_9_current_tests.error = err.message;
    console.error('  Error:', err.message);
  }
}

async function main() {
  console.log('=== ONDA 안티패턴 엔진 분석 시작 ===\n');
  
  const tableExists = await step0();
  const ctx = await step1(tableExists);
  
  await step2_dayWeights(ctx);
  await step3_naturalVariance(ctx);
  await step4_sourceLifecycle(ctx);
  await step5_missionEffectiveness(ctx);
  await step6_volumeEffectiveness(ctx);
  await step7_dropRecovery(ctx);
  await step8_marketPatterns(ctx);
  await step9_logicChangeHistory(ctx);
  await step10_currentTests(ctx, tableExists);

  // Save result
  fs.writeFileSync('/home/onda/projects/onda-hompage/onda_analysis_result.json', JSON.stringify(result, null, 2));
  console.log('\n=== 완료! onda_analysis_result.json 저장됨 ===');
}

main().catch(err => {
  console.error('FATAL:', err);
  result.meta.fatal_error = err.message;
  fs.writeFileSync('/home/onda/projects/onda-hompage/onda_analysis_result.json', JSON.stringify(result, null, 2));
});
