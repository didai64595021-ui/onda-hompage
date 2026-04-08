# 플레이스 크롤러 변경 내역 — 2026-04-07

> 대상 파일: `crawler_engine.py`
> 커밋: `0ce13a0` (auto-snapshot 2026-04-07 12:00)
> 변경량: +28 / −10 (38줄)

## 한 줄 요약
**PHASE 2 상세 크롤링 병렬화** + **thread-safe 통계 카운터** 도입.

## 핵심 변경
1. **상세 크롤링 멀티 워커 지원**
   - `CrawlerEngine.__init__`에 신규 파라미터 2종 추가
     - `detail_workers=4` — PHASE 2 동시 워커 수 (1=직렬, 기본 4)
     - `save_every=10` — xlsx/progress 저장 주기 (N건마다 1회)
   - `threading`, `concurrent.futures.ThreadPoolExecutor`, `as_completed` import 추가

2. **HTTP 연결 풀 자동 확장**
   - 기존: `pool_connections=20, pool_maxsize=20` 고정
   - 변경: `_pool_size = max(20, detail_workers * 4)` — 워커 수 비례 자동 확장
   - 사유: 병렬 워커가 늘어나면 connection starvation 방지

3. **동시성 락 3종 추가** (`__init__` 내부)
   - `_stats_lock` — 통계 카운터 보호
   - `_save_lock` — 파일 저장 보호
   - `_cb_lock` — 콜백 호출 보호

4. **`_stat_inc(key, n=1)` thread-safe 헬퍼 신규**
   ```python
   def _stat_inc(self, key, n=1):
       with self._stats_lock:
           self.stats[key] = self.stats.get(key, 0) + n
   ```

5. **`_detail_crawl_one()` thread-safe 전환**
   - docstring에 `(thread-safe)` 명시
   - `self.stats["X"] += 1` 직접 증가 → `self._stat_inc("X")` 호출로 일괄 교체
   - 교체된 카운터 키: `phone` (3곳), `hp` (2곳), `email` (2곳) — 총 7곳

## 영향 범위
- **호환성**: 기존 호출부는 그대로 동작 (신규 파라미터는 모두 기본값 보유)
- **성능**: `detail_workers=4` 기본값으로 PHASE 2 처리량 약 4배 향상 기대
- **안정성**: race condition으로 인한 카운터 누락/덮어쓰기 위험 제거

## 주의사항 / 후속 작업 (보고서 작성 시점 기준 미반영)
- `_detail_crawl_one()`을 실제로 `ThreadPoolExecutor`로 호출하는 호출부 코드는 이번 diff에 포함되지 않음 — **인프라(락+헬퍼)만 깔린 상태**
  → 다음 단계: PHASE 2 메인 루프에서 `executor.submit(self._detail_crawl_one, ...)` 적용 여부 확인 필요
- `_save_lock`, `_cb_lock`도 정의만 되어 있고 실제 사용처는 이번 diff에 없음 — 후속 커밋에서 적용 예정으로 추정
- `naver-place-crawler.zip` (04-03자 125KB)은 **본 변경 미반영** — 배포가 필요하면 재패키징 필요

## 폴더 현재 상태 (참고)
| 파일 | 상태 |
|---|---|
| crawler_engine.py | 04-07 변경 (본 보고서 대상) |
| fill_crawl_gui.py | 04-03 |
| naver-place-crawler.zip | 04-03 (재빌드 필요) |
| test_selenium_debug.py | 04-03 |
| __pycache__/ | 04-03 (.gitignore 권장) |
| 부산피부과/포항성형외과 *.csv (4개) | 03-23 테스트 잔여물 |
