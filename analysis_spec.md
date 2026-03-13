# ONDA 안티패턴 엔진 — 데이터 분석 실행 명세서
> 이 문서를 받으면 아래 순서대로 전부 실행하고, 마지막에 결과 JSON 1개를 출력하라.
> 중간에 질문하지 말고, 에러 나면 대안을 실행하라. 모든 대안이 문서에 포함되어 있다.

---

## 환경

- DB: Supabase PostgreSQL
- 접속: 프로젝트 환경변수 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 사용
- 쿼리 실행: supabase-js의 .rpc() 또는 .from().select() 사용. 복잡한 쿼리는 supabase.rpc('exec_sql', { query: '...' }) 또는 postgres 직접 연결로 실행.
- 직접 SQL 실행이 불가능하면: 각 테이블을 .from().select()로 전체 추출한 뒤 JavaScript로 분석 수행.

---

## 실행 순서 (반드시 이 순서대로)

### STEP 0: 연결 확인 + 테이블 존재 확인

```javascript
// 이 테이블들이 존재하는지 확인. 없는 테이블은 건너뛰고 결과에 "table_missing" 표기.
const requiredTables = [
  'daily_snapshots', 'businesses', 'keywords', 
  'daily_inputs', 'sources', 'action_types',
  'learned_rules', 'anomaly_logs', 'hypotheses'
];
// 각 테이블에 SELECT COUNT(*) LIMIT 1 실행하여 존재 확인
```

---

### STEP 1: 전체 데이터 요약 (분석 10)

나머지 분석의 WHERE 조건을 결정하기 위해 반드시 먼저 실행한다.

```sql
-- 1-A: 전체 규모
SELECT 
  (SELECT COUNT(*) FROM businesses WHERE is_managed = true) as managed_businesses,
  (SELECT COUNT(*) FROM businesses WHERE is_managed = false) as unmanaged_businesses,
  (SELECT COUNT(*) FROM keywords WHERE is_managed = true) as managed_keywords,
  (SELECT COUNT(*) FROM daily_snapshots) as total_snapshots,
  (SELECT MIN(snapshot_date) FROM daily_snapshots) as earliest_date,
  (SELECT MAX(snapshot_date) FROM daily_snapshots) as latest_date,
  (SELECT COUNT(*) FROM daily_inputs WHERE quantity > 0) as total_inputs,
  (SELECT COUNT(DISTINCT source_id) FROM daily_inputs WHERE quantity > 0) as active_sources;

-- 1-B: 데이터 품질 (최근 30일)
SELECT
  COUNT(*) as total_rows,
  COUNT(CASE WHEN n2_score IS NULL THEN 1 END) as null_n2,
  COUNT(CASE WHEN n2_change IS NULL THEN 1 END) as null_n2_change,
  COUNT(CASE WHEN rank IS NULL OR rank <= 0 THEN 1 END) as invalid_rank,
  COUNT(CASE WHEN n2_score = 0 THEN 1 END) as zero_n2
FROM daily_snapshots
WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days';

-- 1-C: sources 목록
SELECT id, name FROM sources ORDER BY id;

-- 1-D: action_types 목록
SELECT id, name FROM action_types ORDER BY id;

-- 1-E: industry_id 분포
SELECT 
  industry_id, 
  COUNT(*) as count,
  COUNT(CASE WHEN is_managed THEN 1 END) as managed_count
FROM businesses 
GROUP BY industry_id 
ORDER BY count DESC;

-- 1-F: learned_rules 수 (테이블 존재 시)
SELECT COUNT(*) as count FROM learned_rules;

-- 1-G: anomaly_logs 수 (테이블 존재 시)
SELECT COUNT(*) as count FROM anomaly_logs;
```

**결과 기반 조건 자동 조정:**
- null_n2_change 비율이 50% 이상이면: 분석 1,4,5에서 n2_change 대신 (당일 n2_score - 전일 n2_score) 직접 계산으로 대체. LAG(n2_score) OVER (PARTITION BY business_id, keyword_id ORDER BY snapshot_date) 사용.
- total_snapshots가 100,000 미만이면: 분석 1,5,6,8에서 INTERVAL '90 days'를 전체 기간으로 확장.
- managed_businesses가 10 미만이면: 분석 2,3,4,7의 표본이 부족할 수 있다. HAVING 조건의 최소 표본 수를 3으로 낮춰라.
- unmanaged_businesses가 1,000 미만이면: 분석 1,5의 비관리 업체 표본이 부족. is_managed 조건을 제거하고 전체 업체로 분석.
- active_sources가 3 미만이면: 분석 2의 매체별 비교가 무의미. 있는 매체만으로 분석하고 결과에 "limited_sources" 플래그 추가.

---

### STEP 2: 업종별 요일 가중치 (분석 1)

```sql
SELECT 
  b.industry_id,
  EXTRACT(DOW FROM ds.snapshot_date) as day_of_week,
  COUNT(*) as sample_count,
  AVG(ds.n2_change) as avg_n2_change,
  STDDEV(ds.n2_change) as stddev_n2_change,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ds.n2_change) as p25,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ds.n2_change) as median,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ds.n2_change) as p75,
  MIN(ds.n2_change) as min_change,
  MAX(ds.n2_change) as max_change
FROM daily_snapshots ds
JOIN businesses b ON ds.business_id = b.id
WHERE b.is_managed = false
  AND ds.n2_change IS NOT NULL
  AND ds.snapshot_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY b.industry_id, EXTRACT(DOW FROM ds.snapshot_date)
HAVING COUNT(*) >= 50
ORDER BY b.industry_id, day_of_week;
```

**PERCENTILE_CONT 미지원 시 대안:**
```sql
SELECT 
  b.industry_id,
  EXTRACT(DOW FROM ds.snapshot_date) as day_of_week,
  COUNT(*) as sample_count,
  AVG(ds.n2_change) as avg_n2_change,
  STDDEV(ds.n2_change) as stddev_n2_change,
  MIN(ds.n2_change) as min_change,
  MAX(ds.n2_change) as max_change
FROM daily_snapshots ds
JOIN businesses b ON ds.business_id = b.id
WHERE b.is_managed = false
  AND ds.n2_change IS NOT NULL
  AND ds.snapshot_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY b.industry_id, EXTRACT(DOW FROM ds.snapshot_date)
HAVING COUNT(*) >= 50
ORDER BY b.industry_id, day_of_week;
```
이 경우 p25/median/p75는 null로 두고, avg와 stddev만으로 weight를 산출한다.

**후처리 (JavaScript로 수행):**
각 industry_id에 대해:
1. 7개 요일의 avg_n2_change 평균을 구한다 = overall_avg
2. 각 요일의 weight = (avg_n2_change - overall_avg) / ABS(overall_avg) + 1.0
   - overall_avg가 0이면: weight = 1.0 + (avg_n2_change / stddev_n2_change) * 0.1
3. weight 범위 제한: 0.5 ~ 1.8

---

### STEP 3: 자연 유입 분산 (분석 5)

```sql
SELECT
  b.industry_id,
  COUNT(*) as sample_count,
  AVG(ABS(ds.n2_change)) as avg_abs_change,
  STDDEV(ds.n2_change) as stddev_change,
  PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY ds.n2_change) as p10,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ds.n2_change) as p25,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ds.n2_change) as median,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ds.n2_change) as p75,
  PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY ds.n2_change) as p90
FROM daily_snapshots ds
JOIN businesses b ON ds.business_id = b.id
WHERE b.is_managed = false
  AND ds.n2_change IS NOT NULL
  AND ds.snapshot_date >= CURRENT_DATE - INTERVAL '60 days'
GROUP BY b.industry_id
HAVING COUNT(*) >= 100
ORDER BY b.industry_id;
```

**PERCENTILE_CONT 미지원 시:** avg_abs_change와 stddev만 사용. recommended_noise_pct = (stddev / avg_abs_change) * 15로 대체 산출.

**후처리:**
- recommended_noise_pct = ((p75 - p25) / NULLIF(avg_abs_change, 0)) * 50
- p75, p25가 null이면: recommended_noise_pct = (stddev_change / NULLIF(avg_abs_change, 0)) * 30
- 결과 범위 제한: 5 ~ 40

---

### STEP 4: 매체별 효과 수명 곡선 (분석 2)

이 분석은 daily_inputs와 daily_snapshots를 조인해야 한다. 조인 조건이 복잡하므로 2단계로 나눈다.

**4-A: daily_inputs에서 투입 이벤트 추출**

```sql
SELECT 
  di.business_id,
  di.source_id,
  s.name as source_name,
  di.input_date,
  di.quantity,
  b.industry_id,
  k.id as keyword_id
FROM daily_inputs di
JOIN sources s ON di.source_id = s.id
JOIN businesses b ON di.business_id = b.id
JOIN keywords k ON k.is_managed = true
WHERE b.is_managed = true
  AND di.quantity > 0
ORDER BY di.business_id, di.input_date;
```

**4-B: 각 투입 이벤트 후 0-30일 N2 변동**

SQL 조인이 너무 무거우면 JavaScript로 수행:

```javascript
// 4-A 결과와 daily_snapshots를 메모리에서 조인
// 각 input_event에 대해:
//   lag 0~30일의 daily_snapshots를 찾아서
//   n2_change를 기록

// 그룹핑: source_name × lag_days
// 집계: avg(n2_change), positive_rate, sample_count
```

직접 SQL로 가능하면:

```sql
SELECT
  s.name as source_name,
  (ds.snapshot_date - di.input_date) as lag_days,
  COUNT(*) as sample_count,
  AVG(ds.n2_change) as avg_n2_change,
  STDDEV(ds.n2_change) as stddev_n2_change,
  AVG(CASE WHEN ds.n2_change > 0 THEN 1.0 ELSE 0.0 END) as positive_rate
FROM daily_inputs di
JOIN sources s ON di.source_id = s.id
JOIN businesses b ON di.business_id = b.id
JOIN daily_snapshots ds ON di.business_id = ds.business_id
WHERE b.is_managed = true
  AND di.quantity > 0
  AND ds.snapshot_date BETWEEN di.input_date AND di.input_date + INTERVAL '30 days'
  AND ds.n2_change IS NOT NULL
GROUP BY s.name, (ds.snapshot_date - di.input_date)
HAVING COUNT(*) >= 3
ORDER BY s.name, lag_days;
```

**타임아웃 시:** INTERVAL '30 days'를 '14 days'로 줄이고, HAVING을 >= 2로 낮춰라.
**그래도 안 되면:** daily_inputs와 daily_snapshots를 각각 CSV로 추출하여 JavaScript로 분석.

**후처리 (매체별 수명 단계 자동 산출):**
```javascript
// 각 source_name에 대해 lag_days별 데이터로:
// ramp_up_end = positive_rate가 처음으로 0.55를 넘는 lag_day (없으면 1)
// peak_day = avg_n2_change가 최대인 lag_day
// plateau_start = peak_day 이후 positive_rate가 처음으로 0.55 이하로 떨어지는 lag_day (없으면 peak_day + 7)
// decay_start = peak_day 이후 avg_n2_change가 처음으로 음수가 되는 lag_day (없으면 plateau_start + 5)
// recommended_cooldown = decay_start * 0.7 (반올림, 최소 5일 최대 21일)
```

---

### STEP 5: 업종별 미션 상관관계 (분석 3)

```sql
SELECT
  b.industry_id,
  at.name as action_name,
  COUNT(*) as sample_count,
  AVG(ds_after.n2_score - ds_before.n2_score) as avg_n2_effect,
  STDDEV(ds_after.n2_score - ds_before.n2_score) as stddev_effect,
  AVG(CASE WHEN (ds_after.n2_score - ds_before.n2_score) > 0 THEN 1.0 ELSE 0.0 END) as positive_rate,
  AVG((ds_after.n2_score - ds_before.n2_score) / NULLIF(di.quantity, 0)) as effect_per_unit
FROM daily_inputs di
JOIN businesses b ON di.business_id = b.id
JOIN action_types at ON di.action_type_id = at.id
JOIN daily_snapshots ds_before ON di.business_id = ds_before.business_id
  AND ds_before.snapshot_date = di.input_date
JOIN daily_snapshots ds_after ON di.business_id = ds_after.business_id
  AND ds_after.keyword_id = ds_before.keyword_id
  AND ds_after.snapshot_date = di.input_date + INTERVAL '3 days'
WHERE b.is_managed = true
  AND di.quantity > 0
  AND ds_before.n2_score IS NOT NULL
  AND ds_after.n2_score IS NOT NULL
GROUP BY b.industry_id, at.name
HAVING COUNT(*) >= 3
ORDER BY b.industry_id, avg_n2_effect DESC;
```

**조인 실패 시:** ds_before 조인 조건에서 snapshot_date = input_date 대신 snapshot_date BETWEEN input_date - 1 AND input_date로 완화. ds_after도 동일하게 input_date + 2 ~ input_date + 4 범위로.

**후처리:**
```javascript
// 각 industry_id에 대해:
// recommended_mix 산출:
// 각 action의 effect_per_unit이 음수이면 0으로 치환
// 합계 = SUM(양수인 effect_per_unit)
// 각 action 비율 = effect_per_unit / 합계
// 합계가 0이면: 균등 분배 (1/action_count)
```

---

### STEP 6: 투입량 대비 효과 체감 (분석 7)

```sql
SELECT
  CASE 
    WHEN di.quantity BETWEEN 1 AND 100 THEN '001-100'
    WHEN di.quantity BETWEEN 101 AND 200 THEN '101-200'
    WHEN di.quantity BETWEEN 201 AND 300 THEN '201-300'
    WHEN di.quantity BETWEEN 301 AND 500 THEN '301-500'
    WHEN di.quantity > 500 THEN '500+'
  END as quantity_bucket,
  COUNT(*) as sample_count,
  AVG(ds_after.n2_score - ds_before.n2_score) as avg_n2_delta,
  AVG((ds_after.n2_score - ds_before.n2_score) / NULLIF(di.quantity, 0)) as effect_per_unit,
  AVG(CASE WHEN (ds_after.n2_score - ds_before.n2_score) > 0 THEN 1.0 ELSE 0.0 END) as positive_rate
FROM daily_inputs di
JOIN businesses b ON di.business_id = b.id
JOIN daily_snapshots ds_before ON di.business_id = ds_before.business_id
  AND ds_before.snapshot_date = di.input_date
JOIN daily_snapshots ds_after ON di.business_id = ds_after.business_id
  AND ds_after.keyword_id = ds_before.keyword_id
  AND ds_after.snapshot_date = di.input_date + INTERVAL '3 days'
WHERE b.is_managed = true
  AND di.quantity > 0
  AND ds_before.n2_score IS NOT NULL
  AND ds_after.n2_score IS NOT NULL
GROUP BY quantity_bucket
ORDER BY quantity_bucket;
```

**후처리:**
```javascript
// optimal_range = effect_per_unit이 가장 높은 bucket
// diminishing_returns_start = effect_per_unit이 이전 bucket 대비 처음으로 하락하는 bucket의 하한값
```

---

### STEP 7: N2 하락 대응 최적 타이밍 (분석 4)

이 분석은 연속 하락 구간을 식별해야 하므로 JavaScript로 수행한다.

**데이터 추출:**
```sql
SELECT 
  ds.business_id,
  ds.keyword_id,
  ds.snapshot_date,
  ds.n2_score,
  ds.n2_change
FROM daily_snapshots ds
JOIN businesses b ON ds.business_id = b.id
WHERE b.is_managed = true
  AND ds.n2_change IS NOT NULL
ORDER BY ds.business_id, ds.keyword_id, ds.snapshot_date;
```

**JavaScript 분석:**
```javascript
// 1. business_id + keyword_id 별로 그룹핑
// 2. 시계열 순서대로 순회하며 연속 하락 구간(streak) 식별
//    - n2_change < 0이 연속되는 구간
//    - streak_length, streak_start, streak_end, total_drop 기록
// 3. 각 streak 종료 후 7일 내 N2 회복량 측정
//    - recovery_amount = MAX(n2_score in 7 days after streak_end) - n2_score at streak_end
// 4. streak 전후 3일 내 daily_inputs에서 source_id 변경 여부 확인
//    - 변경 있으면 with_source_change = true
// 5. streak_length별 집계:
//    - occurrences, avg_total_drop, recovery_rate, 
//    - recovery_with_change, recovery_without_change
// 6. optimal_response_day = recovery_rate가 50% 이하로 떨어지기 직전의 streak_length
//    (이 시점에 대응해야 한다는 의미)
```

daily_inputs 데이터도 필요:
```sql
SELECT business_id, input_date, source_id, quantity
FROM daily_inputs
WHERE quantity > 0
ORDER BY business_id, input_date;
```

---

### STEP 8: 경쟁사 동시 작업 패턴 (분석 6)

```sql
SELECT
  ds.keyword_id,
  k.keyword,
  ds.snapshot_date,
  COUNT(*) as business_count,
  AVG(ds.n2_change) as avg_n2_change,
  STDDEV(ds.n2_change) as stddev_n2_change,
  AVG(CASE WHEN ds.n2_change > 0 THEN 1.0 ELSE 0.0 END) as pct_positive,
  AVG(CASE WHEN ds.n2_change < 0 THEN 1.0 ELSE 0.0 END) as pct_negative
FROM daily_snapshots ds
JOIN keywords k ON ds.keyword_id = k.id
WHERE ds.rank <= 10
  AND ds.n2_change IS NOT NULL
  AND ds.snapshot_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY ds.keyword_id, k.keyword, ds.snapshot_date
HAVING COUNT(*) >= 5
ORDER BY ds.snapshot_date;
```

**후처리:**
```javascript
// logic_change_day = pct_positive >= 0.8 OR pct_negative >= 0.8인 날
// logic_change_frequency = logic_change_days / total_days
// avg_logic_changes_per_month = logic_change_frequency * 30
// by_keyword: 키워드별 logic_change_days 카운트
```

---

### STEP 9: 로직 변경 주기 (분석 8)

```sql
SELECT
  snapshot_date,
  AVG(n2_score) as market_avg_n2,
  STDDEV(n2_score) as market_stddev,
  COUNT(*) as business_count
FROM daily_snapshots ds
JOIN businesses b ON ds.business_id = b.id
WHERE b.is_managed = false
  AND ds.n2_score IS NOT NULL
  AND ds.snapshot_date >= CURRENT_DATE - INTERVAL '180 days'
GROUP BY snapshot_date
HAVING COUNT(*) >= 500
ORDER BY snapshot_date;
```

**HAVING 500 미만 데이터밖에 없으면:** HAVING을 100 또는 50으로 낮춰라.

**후처리:**
```javascript
// 1. 전일 대비 market_avg_n2 변동 계산
// 2. 변동의 stddev 계산
// 3. |변동| > 2 * stddev인 날 = suspected_logic_change
// 4. 각 변경일 간 간격 계산
// 5. severity: |변동| > 3*stddev = "major", > 2*stddev = "moderate"
// 6. frequency 산출: total_changes, avg_interval, min_interval, max_interval
```

---

### STEP 10: 현재 A/B 테스트 결과 (분석 9)

```sql
-- hypotheses 테이블 존재 시
SELECT * FROM hypotheses ORDER BY created_at DESC LIMIT 20;
```

테이블 없으면 건너뛰고 result에 "table_missing" 표기.

추가로 테스트 관련 업체 데이터:
```sql
SELECT 
  b.name,
  ds.snapshot_date,
  ds.rank,
  ds.n2_score,
  ds.n2_change,
  ds.blog_review_count,
  ds.visitor_review_count,
  ds.save_count
FROM daily_snapshots ds
JOIN businesses b ON ds.business_id = b.id
WHERE b.is_managed = true
  AND ds.snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY b.name, ds.snapshot_date DESC;
```

---

## 최종 출력 형식

모든 분석 결과를 아래 JSON 구조로 합쳐서 하나의 파일로 출력하라.
파일명: onda_analysis_result.json

```json
{
  "meta": {
    "generated_at": "ISO 8601 타임스탬프",
    "data_range": {
      "earliest": "YYYY-MM-DD",
      "latest": "YYYY-MM-DD"
    },
    "total_snapshots": 0,
    "managed_businesses": 0,
    "unmanaged_businesses": 0,
    "managed_keywords": 0,
    "total_inputs": 0,
    "data_quality": {
      "null_n2_pct": 0,
      "null_n2_change_pct": 0,
      "invalid_rank_pct": 0,
      "adjustments_made": ["목록: 표본 부족으로 HAVING 낮춤 등"]
    }
  },

  "analysis_1_day_weights": {
    "description": "업종별 요일 가중치. weight > 1.0 = 해당 요일에 자연 유입이 평균보다 많음.",
    "data": {
      "<industry_id>": {
        "sample_total": 0,
        "days": {
          "0": { "avg_change": 0, "stddev": 0, "median": null, "weight": 1.0, "sample": 0 },
          "1": {}, "2": {}, "3": {}, "4": {}, "5": {}, "6": {}
        }
      }
    }
  },

  "analysis_2_source_lifecycle": {
    "description": "매체별 효과 수명 곡선. lag_day = 투입 후 경과 일수.",
    "data": {
      "<source_name>": {
        "sample_total": 0,
        "by_lag_day": {
          "0": { "avg_change": 0, "positive_rate": 0, "sample": 0 },
          "1": {}
        },
        "derived": {
          "ramp_up_end_day": 0,
          "peak_day": 0,
          "plateau_start_day": 0,
          "decay_start_day": 0,
          "recommended_cooldown_days": 0
        }
      }
    }
  },

  "analysis_3_mission_effectiveness": {
    "description": "업종별 액션(미션) 유형의 N2 상승 효과. recommended_mix = 최적 투입 비율.",
    "data": {
      "<industry_id>": {
        "actions": {
          "<action_name>": { "avg_effect": 0, "positive_rate": 0, "effect_per_unit": 0, "sample": 0 }
        },
        "recommended_mix": {
          "<action_name>": 0.0
        }
      }
    }
  },

  "analysis_4_drop_recovery": {
    "description": "N2 연속 하락 후 회복 분석. optimal_response_day = 이 일수째에 매체 교체해야 함.",
    "data": {
      "by_streak_length": {
        "2": { "occurrences": 0, "avg_drop": 0, "recovery_rate": 0, "with_source_change": 0, "without_change": 0 },
        "3": {}, "4": {}, "5+": {}
      },
      "optimal_response_day": 0,
      "source_change_uplift_pct": 0
    }
  },

  "analysis_5_natural_variance": {
    "description": "업종별 자연 N2 변동폭. recommended_noise_pct = 안티패턴 엔진의 ±X% 노이즈 범위.",
    "data": {
      "<industry_id>": {
        "sample": 0,
        "avg_abs_change": 0,
        "stddev": 0,
        "p10": null, "p25": null, "median": null, "p75": null, "p90": null,
        "recommended_noise_pct": 0
      }
    }
  },

  "analysis_6_market_patterns": {
    "description": "경쟁사 동시 변동 패턴. logic_change_frequency = 로직 변경 추정 빈도.",
    "data": {
      "logic_change_frequency": 0,
      "avg_logic_changes_per_month": 0,
      "directional_agreement_avg": 0,
      "by_keyword": {
        "<keyword>": { "logic_change_days": 0, "total_days": 0 }
      }
    }
  },

  "analysis_7_volume_effectiveness": {
    "description": "투입량(타수) 구간별 N2 효과. optimal_range = 타당 효율 최고 구간.",
    "data": {
      "<quantity_bucket>": { "avg_n2_delta": 0, "effect_per_unit": 0, "positive_rate": 0, "sample": 0 },
      "optimal_range": "",
      "diminishing_returns_start": 0
    }
  },

  "analysis_8_logic_change_history": {
    "description": "로직 변경 추정 이력. severity: major/moderate.",
    "data": {
      "dates": [
        { "date": "YYYY-MM-DD", "avg_change": 0, "severity": "" }
      ],
      "frequency": {
        "total_suspected_changes": 0,
        "period_days": 0,
        "avg_interval_days": 0,
        "min_interval_days": 0,
        "max_interval_days": 0
      }
    }
  },

  "analysis_9_current_tests": {
    "description": "현재 진행 중인 A/B 테스트 결과.",
    "hypotheses": [],
    "managed_business_recent_30d": []
  },

  "analysis_10_summary": {
    "description": "전체 데이터 요약.",
    "scale": {},
    "quality": {},
    "sources": [],
    "action_types": [],
    "industry_distribution": []
  }
}
```

---

## 에러 핸들링 규칙

1. SQL 실행 에러 발생 시: 해당 분석의 결과에 `"error": "에러 메시지"` 추가하고 다음 분석으로 진행. 전체를 중단하지 마라.

2. 조인이 너무 무거워서 타임아웃 시: 
   - 먼저 INTERVAL을 줄여라 (90일 → 30일)
   - 그래도 안 되면 각 테이블을 개별 추출 후 JavaScript로 메모리에서 조인

3. 테이블이 없을 때: `"status": "table_missing"` 표기하고 건너뛰기

4. 표본이 HAVING 조건 미달일 때: HAVING 값을 절반으로 줄여서 재실행. 그래도 안 되면 HAVING 제거하고 `"warning": "low_sample"` 추가.

5. n2_change 컬럼이 전부 NULL일 때: 직접 계산으로 대체
   ```sql
   (ds.n2_score - LAG(ds.n2_score) OVER (
     PARTITION BY ds.business_id, ds.keyword_id 
     ORDER BY ds.snapshot_date
   )) as n2_change_calc
   ```

6. industry_id가 NULL인 업체가 많을 때: NULL을 industry_id = 0 ("미분류")으로 그룹핑

---

## 완료 조건

- onda_analysis_result.json 파일 1개 생성
- 10개 분석 중 최소 7개 이상 정상 결과 포함
- meta.data_quality에 발생한 조정사항 전부 기록
- 에러 발생한 분석은 error 필드에 사유 기록

이 파일을 전달받으면 안티패턴 엔진의 모든 변수를 실제 데이터로 교체한다.
