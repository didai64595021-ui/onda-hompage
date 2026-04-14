#!/bin/bash
# OpenAI 결제 한도 초과로 생성 안 된 21개 썸네일을 기존 이미지로 폴백 채우기
# 카테고리별로 매칭되는 기존 이미지를 복사
set -u
cd /home/onda/projects/onda-hompage/kmong-crawler/new-gigs/03-images

# 카테고리별 기준 이미지 (보유 중 대표)
# 코딩(01~20): 01, 02, 03 활용
# DB수집(21~30): 21, 22, 23 활용
# AI활용(31~45): 24, 25 활용 (보유 끝)
# 디자인(46~54): 26, 27, 28 활용
# 고객관리(55): 29 활용

declare -A FALLBACK
# 누락된 ID → 카테고리 매칭 폴백 ID
FALLBACK[30]=21  # DB수집 -> 21
FALLBACK[31]=24  # AI활용 -> 24
FALLBACK[32]=25  # AI활용 -> 25
FALLBACK[33]=24  # AI활용 -> 24
FALLBACK[34]=25  # AI활용 -> 25
FALLBACK[35]=24  # AI활용 -> 24
FALLBACK[36]=25  # AI활용 -> 25
FALLBACK[38]=24  # AI활용 -> 24
FALLBACK[39]=25  # AI활용 -> 25
FALLBACK[40]=24  # AI활용 -> 24
FALLBACK[41]=25  # AI활용 -> 25
FALLBACK[42]=24  # AI활용 -> 24
FALLBACK[43]=25  # AI활용 -> 25
FALLBACK[44]=24  # AI활용 -> 24
FALLBACK[45]=25  # AI활용 -> 25
FALLBACK[46]=26  # 디자인 -> 26
FALLBACK[47]=27  # 디자인 -> 27
FALLBACK[50]=28  # 디자인 -> 28
FALLBACK[53]=26  # 디자인 -> 26
FALLBACK[54]=27  # 디자인 -> 27
FALLBACK[55]=29  # 고객관리 -> 29

COUNT=0
for ID in "${!FALLBACK[@]}"; do
    SRC="55-$(printf "%02d" ${FALLBACK[$ID]}).png"
    DST="55-$(printf "%02d" $ID).png"
    if [ ! -f "$DST" ] && [ -f "$SRC" ]; then
        cp "$SRC" "$DST"
        COUNT=$((COUNT + 1))
    fi
done

echo "폴백 이미지 $COUNT 개 채움"
ls 55-*.png | wc -l
