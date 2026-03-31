# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

## 이미지 생성 (Image Generation)

이미지 생성 요청 시 **반드시 OpenAI API**를 사용할 것:
- **모델**: `openai/gpt-image-1` (기본) 또는 `openai/dall-e-3`
- **Gemini 이미지 생성 사용 금지** — OpenAI가 품질이 훨씬 좋음
- 환경변수 `OPENAI_API_KEY`가 `.env`에 설정됨
- 이미지 생성 tool 호출 시 provider를 `openai`로 명시

