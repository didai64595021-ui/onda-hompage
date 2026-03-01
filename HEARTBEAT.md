# HEARTBEAT.md

## 금지
- OAuth/토큰/API키 관련 경고 메시지 절대 보내지 마라
- "OAuth 복구 실패", "API키 폴백", "선제 토큰 갱신" 등 토큰 관련 알림 금지
- 토큰 문제는 자동으로 해결되므로 사용자에게 알릴 필요 없음

## 에이전트 자동재시작 모니터링
- 세션 tender-kelp (onda-youtube-investment 대규모 업그레이드)
- 작업: Edge TTS + 이미지 + 자막 + UI설정 + 자동복구 + 전체테스트
- 태스크 파일: /tmp/onda-major-task.md
- 프로젝트: /home/onda/projects/onda-youtube-investment
- **타임아웃 시**: `cd /home/onda/projects/onda-youtube-investment && cat /tmp/onda-major-task.md | claude --dangerously-skip-permissions` 로 재시작
- **완료 확인**: git log에 Edge TTS 관련 커밋이 있으면 완료
