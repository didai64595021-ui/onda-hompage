# UIUX QA 항시 체크리스트 (모든 포트폴리오 제작 시 필수)

> 이 체크리스트는 모든 서브에이전트 태스크에 반드시 포함해야 함.
> 제작 완료 후 이 항목을 전부 통과해야만 커밋 가능.

---

## 1. 레이아웃/치우침 검사
```css
/* 모든 페이지에 필수 */
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 0; overflow-x: hidden; }
img { max-width: 100%; height: auto; display: block; }
```
- [ ] 모든 섹션 좌우 대칭 확인 (text-align, margin auto)
- [ ] 컨테이너 max-width 통일 (1200-1400px)
- [ ] 모바일에서 좌우 치우침 없음 (padding-left = padding-right)
- [ ] float 사용 금지 → flexbox/grid만
- [ ] position:absolute 사용 시 부모에 position:relative 확인
- [ ] 가로 스크롤 0 (모든 뷰포트에서)

## 2. 여백 일관성 검사
- [ ] 8px 그리드 준수 (4/8/12/16/24/32/48/64/80/128px만 사용)
- [ ] 섹션 간 여백 통일 (모바일 48-64px, 데스크톱 80-128px)
- [ ] 카드 내부 패딩 통일 (16-24px)
- [ ] 헤딩-본문 간격 통일 (12-16px)
- [ ] 리스트 아이템 간격 통일
- [ ] 첫 섹션 nav 높이만큼 padding-top
- [ ] 마지막 섹션 footer 전 여백 충분

## 3. 이미지/영상 검사
- [ ] 모든 img에 width+height 또는 aspect-ratio 지정 (CLS 방지)
- [ ] Unsplash URL 실제 접근 가능 확인 (?w=800&q=80 파라미터)
- [ ] background-image 사용 시 fallback 배경색 지정
- [ ] background-clip:text → 모바일 폴백 필수 (지원 안 되는 브라우저)
- [ ] lazy loading: loading="lazy" 적용 (첫 화면 제외)
- [ ] 비디오: autoplay muted playsinline loop 전부 지정
- [ ] iframe: width:100% + aspect-ratio:16/9
- [ ] 이미지 깨짐 시 alt 텍스트 표시 확인
- [ ] object-fit: cover 적용 (이미지 찌그러짐 방지)

## 4. 폰트/타이포 검사
- [ ] font-family에 fallback 폰트 체인 필수 (예: 'Sora', 'Pretendard', sans-serif)
- [ ] Google Fonts/CDN preconnect 적용
- [ ] font-display: swap 적용 (FOIT 방지)
- [ ] 폰트 크기 최소 12px (모바일 본문 14-16px)
- [ ] line-height: 본문 1.6-1.8, 헤딩 1.1-1.3
- [ ] letter-spacing: 한글은 -0.01em~0 (영문보다 좁게)
- [ ] 텍스트 겹침 없음 확인 (position 충돌, z-index 누락)
- [ ] 긴 텍스트 overflow 처리 (ellipsis 또는 break)

## 5. 줄바꿈/텍스트 검사
- [ ] word-break: keep-all (한글 단어 단위 줄바꿈)
- [ ] overflow-wrap: break-word (긴 URL/영문 대응)
- [ ] white-space: nowrap 사용 시 모바일 대응 확인
- [ ] 제목이 2줄 넘어갈 때 레이아웃 깨짐 없음
- [ ] 모바일에서 텍스트 잘림 없음 (clamp 사용 시 min 확인)
- [ ] 숫자/날짜 줄바꿈 방지 (white-space:nowrap 또는 &nbsp;)

## 6. 반응형 검사 (필수 브레이크포인트)
- [ ] 375px (iPhone SE) — 터치 44px, 1열 레이아웃
- [ ] 414px (iPhone Plus) — 스크롤 없이 콘텐츠 접근
- [ ] 768px (iPad) — 2열 전환
- [ ] 1024px (iPad Pro/노트북) — 사이드바 등장
- [ ] 1440px (데스크톱) — max-width 컨테이너 중앙
- [ ] 1920px (와이드) — 빈 공간 과다 아님
- [ ] 각 브레이크포인트에서 치우침/겹침/잘림 없음

## 7. 네비게이션 검사
- [ ] 모든 페이지 간 링크 동작
- [ ] 현재 페이지 active 표시
- [ ] 모바일 햄버거 메뉴 열림/닫힘
- [ ] 메뉴 열린 상태에서 배경 스크롤 차단
- [ ] 스크롤 시 네비 동작 정상 (고정/숨김/투명 등)
- [ ] 앵커 링크 스크롤 부드러움 (scroll-behavior:smooth)

## 8. 인터랙션 검사
- [ ] 호버 효과: 모바일에서 :hover 비활성화 또는 대체 처리
- [ ] 애니메이션: prefers-reduced-motion 존중
- [ ] 스크롤 애니메이션: 한 번만 실행 (무한 반복 아님, 의도적 제외)
- [ ] 모달: ESC키/오버레이 클릭으로 닫기
- [ ] 폼: 유효성 검증 + 포커스 스타일
- [ ] 버튼: cursor:pointer + 호버/포커스 스타일

## 9. 성능 검사
- [ ] CSS는 <head> 안 <style> 또는 외부 CSS
- [ ] JS는 </body> 직전 또는 defer
- [ ] 폰트 preload 또는 preconnect
- [ ] 불필요한 !important 남용 금지

## 10. 접근성 검사
- [ ] 모든 img에 alt 텍스트
- [ ] 폼 input에 label 연결
- [ ] 색상 대비 WCAG AA (4.5:1 본문, 3:1 대형텍스트)
- [ ] 포커스 표시 (outline 제거 금지, 커스텀 가능)
- [ ] lang="ko" 설정

---

## 자동 검증 스크립트 (서브에이전트가 실행)
```bash
#!/bin/bash
# UIUX QA 자동 검증
DIR="$1"
ERRORS=0

for f in "$DIR"/*.html; do
  name=$(basename "$f")
  
  # 1. box-sizing
  grep -q "box-sizing" "$f" || { echo "❌ $name: box-sizing 없음"; ERRORS=$((ERRORS+1)); }
  
  # 2. overflow-x
  grep -q "overflow-x" "$f" || { echo "❌ $name: overflow-x 없음"; ERRORS=$((ERRORS+1)); }
  
  # 3. word-break
  grep -q "word-break" "$f" || { echo "❌ $name: word-break 없음"; ERRORS=$((ERRORS+1)); }
  
  # 4. max-width 컨테이너
  grep -q "max-width" "$f" || { echo "⚠️ $name: max-width 없음"; }
  
  # 5. font fallback
  grep -q "sans-serif\|serif" "$f" || { echo "❌ $name: font fallback 없음"; ERRORS=$((ERRORS+1)); }
  
  # 6. img alt
  imgs_no_alt=$(grep -c '<img[^>]*[^/]>' "$f" 2>/dev/null || echo 0)
  imgs_with_alt=$(grep -c '<img[^>]*alt=' "$f" 2>/dev/null || echo 0)
  
  # 7. Lorem ipsum
  grep -qi "lorem\|ipsum" "$f" && { echo "❌ $name: Lorem ipsum 발견!"; ERRORS=$((ERRORS+1)); }
  
  # 8. viewport meta
  grep -q "viewport" "$f" || { echo "❌ $name: viewport meta 없음"; ERRORS=$((ERRORS+1)); }
  
  # 9. lang="ko"
  grep -q 'lang="ko"' "$f" || { echo "⚠️ $name: lang='ko' 없음"; }
  
  # 10. 최소 줄수
  lines=$(wc -l < "$f")
  [ "$lines" -lt 400 ] && { echo "⚠️ $name: ${lines}줄 (최소 800줄 권장)"; }
  
  echo "✅ $name: 기본 검사 통과 (${lines}줄)"
done

echo "===== 총 에러: $ERRORS ====="
[ $ERRORS -eq 0 ] && echo "🎉 전체 통과!" || echo "🔴 수정 필요!"
```
