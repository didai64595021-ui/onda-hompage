# 네이버 톡톡 확인 API 가이드

## 핵심 로직
네이버 플레이스 GraphQL API를 iwinv 프록시(한국 IP) 경유로 호출하여 톡톡 유무 확인.
Chrome/OCR 불필요. 100% 정확도.

## API 엔드포인트

### 1. place_id로 톡톡 확인 (placeDetail)
```
POST http://49.247.137.28:3100/proxy
Headers:
  Content-Type: application/json
  x-api-key: onda-proxy-2026-secret

Body:
{
  "targetUrl": "https://pcmap-api.place.naver.com/place/graphql",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json",
    "Referer": "https://pcmap.place.naver.com/place/{PLACE_ID}/home"
  },
  "postBody": "[{\"query\":\"{ placeDetail(input: {id: \\\"{PLACE_ID}\\\"}) { base { id name talktalkUrl phone category address roadAddress } } }\"}]"
}

응답:
[{
  "data": {
    "placeDetail": {
      "base": {
        "id": "11531189",
        "name": "압구정서울성형외과의원",
        "talktalkUrl": "http://talk.naver.com/wcc2vx?frm=mnmb",  // null이면 톡톡 X
        "phone": "02-547-5100",
        "category": "성형외과",
        "address": "서울 강남구 신사동 598",
        "roadAddress": "서울 강남구 논현로 840"
      }
    }
  }
}]
```

### 2. 업체명으로 검색 + 톡톡 확인 (places)
```
Body:
{
  "targetUrl": "https://pcmap-api.place.naver.com/place/graphql",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json",
    "Referer": "https://pcmap.place.naver.com/"
  },
  "postBody": "[{\"query\":\"{ places(input: {query: \\\"{업체명 주소}\\\"}) { items { id name talktalkUrl } } }\"}]"
}

응답:
[{
  "data": {
    "places": {
      "items": [
        {"id": "11531189", "name": "압구정서울성형외과의원", "talktalkUrl": "http://talk.naver.com/wcc2vx?frm=mnmb"},
        {"id": "19534483", "name": "글로벌서울성형외과의원", "talktalkUrl": null}
      ]
    }
  }
}]
```

## 판별 로직
- `talktalkUrl` 값 있음 → **톡톡 O** (talkUrl 저장)
- `talktalkUrl` = null → **톡톡 X**
- 검색 결과 없음 → **네이버 미등록** (X 확정)

## 속도/제한
- 권장 딜레이: 300~500ms/건
- 프록시 타임아웃: 20초
- 에러 시 재시도: 최대 3회 (exponential backoff)
- 429 시 30초 대기

## 스크립트
- `api_rescan.js` — 전체 DB 재스캔 (PHASE 1: placeUrl있는것, PHASE 2: 검색)
- 옵션: `--test N`, `--phase 1|2`, `--skip-done`
- tmux에서 실행 권장: `tmux new-session -d -s scan "node api_rescan.js 2>&1 | tee /tmp/scan.log"`

## 새 크롤링 시 사용법
1. 업체 목록 수집 (네이버 검색 등)
2. places API로 검색 → place_id + talktalkUrl 동시 획득
3. talktalkUrl 있는 업체만 발송 대상으로 저장

## iwinv 프록시
- Host: 49.247.137.28:3100
- API Key: onda-proxy-2026-secret
- 한국 IP → 네이버 캡차 없음
- POST body 포워딩 지원 (postBody 필드)
