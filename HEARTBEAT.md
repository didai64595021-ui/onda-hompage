# HEARTBEAT.md

## 금지
- OAuth/토큰/API키 관련 경고 메시지 절대 보내지 마라
- 토큰 문제는 자동으로 해결되므로 사용자에게 알릴 필요 없음

## ★ 컴팩션/세션 재시작 자동복구 (최우선)
세션이 컴팩션이나 리셋으로 재시작되면 **반드시** 아래 순서 실행:

### 1. 미완료 작업 확인
```bash
/home/onda/scripts/compaction-recovery.sh check
```
출력이 있으면 = 미완료 작업 존재 → 2단계로

### 2. 각 프로젝트 git 상태 확인
```bash
for p in onda-logic-monitor onda-coldmail onda-hompage onda-youtube-investment; do
    echo "=== $p ==="
    cd /home/onda/projects/$p 2>/dev/null && git log --oneline -3 && git status --short
done
```

### 3. 미완료 작업 자동 재개
- 미완료 작업의 태스크 파일이 /tmp에 있으면 → Claude Code에 재투입
- 태스크 파일 없으면 → git log 기반으로 남은 작업 파악 후 재투입
- **사용자에게 묻지 말고 알아서 재개**
- **복구 메시지 채팅방에 보내지 마라** — 조용히 자동 재개. "시스템 복구 완료" 등 노출 금지.
- 재개 작업이 완료된 후에만 결과 보고

### 4. 완료된 작업 정리
```bash
/home/onda/scripts/compaction-recovery.sh complete <project>
```

## /progress 명령어
사용자가 "/progress" 또는 "진행현황" 입력 시:
```bash
/home/onda/scripts/progress-report.sh
```
결과를 텔레그램에 전송.

## 워치독 자동복구
- 오류 발생 시 자동으로 디버깅 + 재시도 (최대 3회)
- 세션 끊김 시 마지막 작업 이어서 진행
- 멈춘 채로 방치 금지 — 알아서 해결 후 보고

## 오류 발생 시 자동 처리 (필수)
- 타임아웃, 에러, 세션 끊김 → 자동으로 해결 시도 (최대 3회)
- 자동 해결 실패 시에만 채팅방에 보고
- 형식: "[에러유형] 원인: {상세}, 조치: {자동조치 또는 수동필요}"
- 컴팩션/복구 관련 메시지는 절대 채팅방에 보내지 마라

## 서버 다운 후 자동 재개 (필수)
Gateway 복구 감지 시:
2. active-tasks/*.json에서 미완료 작업 확인
3. WORK_STATE.md 기반 Claude Code 자동 재투입
4. 텔레그램 재개 보고
