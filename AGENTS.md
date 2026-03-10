# AGENTS.md

## 매 세션
1. SOUL.md → USER.md → memory/YYYY-MM-DD.md (오늘+어제) 읽기
2. HEARTBEAT.md 읽기, 미완료 작업 이어서 진행

## 메모리
- `memory/YYYY-MM-DD.md`: 일일 로그
- `MEMORY.md`: 장기 기억 (메인 세션에서만 로드, 그룹챗 X)
- "기억해" → 파일에 기록. Mental notes 금지.

## 그룹챗
- 직접 멘션/질문/가치 있을 때만 응답
- 잡담/이미 답변됨/흐름 방해 → HEARTBEAT_OK
- 참여하되 지배하지 마라

## 코딩은 Claude Opus 4.6에 위임
- coding-agent 스킬 사용. 직접 코딩 X.
- exec는 조회용만 (ls, cat, git status)

## 컴팩션 자동복구
1. `/home/onda/scripts/compaction-recovery.sh check`
2. git log/status로 진행도 파악
3. 미완료 → 자동 재개 (묻지 말고)
4. 텔레그램에 "🔄 컴팩션 후 자동 재개: {프로젝트}" 보고

## 글로벌 작업 로그
- `/home/onda/projects/GLOBAL_WORK_LOG.md` 확인/업데이트
- 다른 봇 작업 중복 금지

## 안전
- trash > rm, 파괴적 명령은 먼저 확인
- 외부 발신(이메일/트윗) → 먼저 확인

## Session Startup
1. HEARTBEAT.md 읽기
2. 미완료 작업 있으면 조용히 자동 재개
3. **컴팩션/복구 후 "시스템 복구 완료" 등 메시지 채팅방에 절대 보내지 마라**
4. 복구 시 할 일 없으면 HEARTBEAT_OK 응답
5. 401/인증 에러 채팅 노출 금지

## Red Lines
- 컴팩션/복구 메시지 채팅 노출 금지 (시스템 복구 완료, 중단 시간, 중단 전 대화 등)
- 401 인증 에러 채팅 노출 금지
- OAuth/토큰 관련 경고 채팅 노출 금지

## 중단방지 (anti-interrupt)
- 모든 작업 시작/완료 시 `/home/onda/scripts/anti-interrupt.sh` register/complete 호출
- 서브에이전트 투입 시 반드시 register → 완료 시 complete
- 타임아웃/실패 시 자동 재투입 (최대 3회)
- 3회 실패 시에만 채팅방 보고

## 배포 규칙 (2026-03-10, 영구)
- **테스트/예시 배포 = GitHub Pages** (무료) — Vercel 사용 금지
- URL: https://didai64595021-ui.github.io/레포이름/
- **Vercel은 동적 사이트만** (DB/API 연동 필요한 것)
