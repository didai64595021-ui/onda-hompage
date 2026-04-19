#!/bin/bash
# install-hooks.sh — post-commit 훅 설치 (git clone 후 또는 훅이 사라졌을 때 실행)
# git은 .git/hooks/* 를 tracking 안 하므로, 저장소 내부에 원본 보관 → 설치 스크립트로 복원
set -e
ROOT="/home/onda/projects/onda-hompage"
HOOK_DIR="$ROOT/.git/hooks"
SRC="$ROOT/kmong-crawler/hooks/post-commit"

mkdir -p "$HOOK_DIR"

if [ ! -f "$SRC" ]; then
  echo "❌ source hook not found: $SRC"
  exit 1
fi

cp "$SRC" "$HOOK_DIR/post-commit"
chmod +x "$HOOK_DIR/post-commit"
echo "✅ installed: $HOOK_DIR/post-commit"
ls -la "$HOOK_DIR/post-commit"
