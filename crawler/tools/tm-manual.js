/**
 * TM 스크립트 매뉴얼 + 반론처리 가이드 생성
 * 
 * node tools/tm-manual.js              전체 매뉴얼 HTML 생성
 * node tools/tm-manual.js "업체명"     특정 업체 맞춤 스크립트
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function generateTMManual() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TM 스크립트 매뉴얼 — 웹사이트 개선 서비스</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,sans-serif;background:#f8f9fa;color:#333;line-height:1.7}
  .container{max-width:900px;margin:0 auto;padding:24px}
  h1{font-size:28px;color:#1e293b;margin-bottom:24px;text-align:center}
  h2{font-size:22px;color:#2563eb;margin:32px 0 16px;padding-bottom:8px;border-bottom:2px solid #e2e8f0}
  h3{font-size:18px;color:#475569;margin:20px 0 12px}
  .card{background:white;border-radius:12px;padding:24px;margin:16px 0;box-shadow:0 2px 8px rgba(0,0,0,.06)}
  .script{background:#f0f9ff;border-left:4px solid #2563eb;padding:16px;margin:12px 0;border-radius:0 8px 8px 0;font-size:15px}
  .objection{background:#fef2f2;border-left:4px solid #ef4444;padding:16px;margin:12px 0;border-radius:0 8px 8px 0}
  .response{background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;margin:12px 0;border-radius:0 8px 8px 0}
  .tip{background:#fffbeb;border-left:4px solid #f59e0b;padding:12px;margin:12px 0;border-radius:0 8px 8px 0;font-size:14px}
  .tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold;margin:2px}
  .tag-time{background:#dbeafe;color:#2563eb}
  .tag-goal{background:#dcfce7;color:#16a34a}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:14px}
  th{background:#f1f5f9;font-weight:600}
</style>
</head>
<body>
<div class="container">
<h1>📞 TM 스크립트 매뉴얼</h1>

<div class="card">
  <h2>1단계: 오프닝 (30초)</h2>
  <span class="tag tag-time">⏱ 30초</span>
  <span class="tag tag-goal">🎯 대표 연결 + 관심 유도</span>
  
  <h3>직원 연결 시</h3>
  <div class="script">
    "안녕하세요, [업체명] 홈페이지 관련해서 연락드렸는데요. 대표님 자리에 계실까요?"
  </div>
  
  <h3>대표 연결 시</h3>
  <div class="script">
    "안녕하세요 대표님. 저는 로컬 업체 웹사이트 모바일 최적화를 돕고 있는 [이름]입니다.<br><br>
    대표님 사이트 모바일에서 확인해보니 <strong>[문제점1], [문제점2]</strong> 상태라서요.<br><br>
    전후 비교 시안 짧게 보내드리면 <strong>[가격]</strong>에 바로 정리 가능한데, 30초만 괜찮으세요?"
  </div>
  
  <div class="tip">
    💡 <strong>핵심:</strong> "확인해보니" = 이미 봤다는 뉘앙스로 신뢰감 형성. 가격을 먼저 말해서 부담 낮춤.
  </div>
</div>

<div class="card">
  <h2>2단계: 문제 제시 (1분)</h2>
  <span class="tag tag-time">⏱ 1분</span>
  <span class="tag tag-goal">🎯 문제 인식 + 긴급성</span>
  
  <h3>업종별 맞춤 멘트</h3>
  <table>
    <tr><th>업종</th><th>핵심 멘트</th></tr>
    <tr><td>병원/의원</td><td>"환자분들 70%가 모바일로 검색하시는데, 지금 사이트에서 전화 버튼 누르기가 어려워서 다른 병원으로 넘어갈 수 있어요."</td></tr>
    <tr><td>학원</td><td>"학부모님들이 학원 비교할 때 모바일로 많이 보시잖아요. 지금 사이트가 모바일에서 글자가 작아서 정보 확인이 어려운 상태예요."</td></tr>
    <tr><td>인테리어</td><td>"인테리어 문의하시는 분들이 시공 사례 보려고 들어오시는데, 모바일에서 사진이 잘 안 보이고 문의 버튼이 없어서 이탈하고 있어요."</td></tr>
    <tr><td>미용실/뷰티</td><td>"예약하려는 고객이 가격표 확인하고 바로 전화하고 싶은데, 지금 모바일에서 전화 버튼이 바로 안 보여요."</td></tr>
    <tr><td>필라테스/PT</td><td>"체험 신청하려는 분이 들어왔는데 문의폼이 없으면 그냥 나가세요. 카톡 버튼 하나만 있어도 달라져요."</td></tr>
    <tr><td>부동산/분양</td><td>"매물 보러 들어온 고객이 연락처를 못 찾으면 바로 다음 중개사로 가요. 클릭 한 번에 전화되게 해야 해요."</td></tr>
    <tr><td>법률사무소</td><td>"법률 상담 찾는 분들은 급한 경우가 많아요. 모바일에서 바로 전화 가능해야 상담 연결률이 올라가요."</td></tr>
    <tr><td>웨딩</td><td>"웨딩 준비하는 커플이 여러 업체 비교하는데, 모바일에서 이쁘게 안 보이면 첫인상에서 밀려요."</td></tr>
  </table>
</div>

<div class="card">
  <h2>3단계: 솔루션 제안 (30초)</h2>
  <span class="tag tag-time">⏱ 30초</span>
  <span class="tag tag-goal">🎯 가격 제시 + 행동 유도</span>
  
  <div class="script">
    "저희가 이런 문제를 <strong>[패키지명]</strong>으로 <strong>[가격]</strong>에 해결해드리고 있어요.<br><br>
    24시간 내 작업 완료되고, <strong>전후 비교 시안을 먼저 무료로</strong> 보내드려요.<br><br>
    시안 보시고 마음에 드시면 그때 결정하시면 됩니다. 혹시 카톡이나 문자로 보내드릴까요?"
  </div>
  
  <div class="tip">
    💡 <strong>핵심:</strong> "시안 먼저 무료" = 리스크 제로. "마음에 드시면 그때 결정" = 압박 없음.
  </div>
</div>

<div class="card">
  <h2>🔴 반론 처리</h2>
  
  <div class="objection">
    <strong>❌ "바빠서요" / "지금 안돼요"</strong>
  </div>
  <div class="response">
    ✅ "네 알겠습니다! 그럼 전후 비교 시안만 문자로 짧게 보내드릴게요. 나중에 편하실 때 확인해주세요. 번호 이대로 보내드리면 될까요?"
  </div>
  
  <div class="objection">
    <strong>❌ "필요 없어요"</strong>
  </div>
  <div class="response">
    ✅ "네 이해합니다. 혹시 모바일에서 직접 한번 확인해보셨어요? 대표님 사이트 [URL]인데, 모바일로 열어보시면 [문제점]이 바로 보이실 거예요. 무료 시안만이라도 받아보시겠어요?"
  </div>
  
  <div class="objection">
    <strong>❌ "돈이 없어요" / "비싸요"</strong>
  </div>
  <div class="response">
    ✅ "전체 리뉴얼은 보통 300~500만원인데, 저희는 꼭 필요한 것만 5만원부터 부분 수정이 가능해요. 전화 버튼 하나만 추가해도 문의가 바로 늘어나거든요."
  </div>
  
  <div class="objection">
    <strong>❌ "다른 데서 할 거예요" / "업체 있어요"</strong>
  </div>
  <div class="response">
    ✅ "네! 견적 비교용으로 저희 시안도 같이 보시면 좋을 것 같아요. 무료니까 부담 없으시고, 24시간 내 보내드려요."
  </div>
  
  <div class="objection">
    <strong>❌ "홈페이지 새로 만들 거예요"</strong>
  </div>
  <div class="response">
    ✅ "아 그러시군요! 새로 만드시기 전까지 지금 사이트에서 고객이 이탈하고 있으니, 급한 것만 5만원에 임시로 정리해드릴까요? 새 사이트 나올 때까지 버퍼 역할이요."
  </div>
  
  <div class="objection">
    <strong>❌ (전화 안 받음 / 부재중)</strong>
  </div>
  <div class="response">
    ✅ 문자 발송: "[업체명] 대표님, 모바일 홈페이지 무료 진단 결과 보내드립니다. 확인 부탁드려요. [이름] 010-XXXX-XXXX"<br>
    → 2~3일 뒤 재전화
  </div>
</div>

<div class="card">
  <h2>📱 후속 문자 템플릿</h2>
  
  <h3>통화 직후 (즉시)</h3>
  <div class="script">
    "[업체명] 대표님, 방금 통화 감사합니다. 말씀드린 모바일 전후 비교 시안 첨부합니다. 24시간 내 작업 가능합니다. [이름] 010-XXXX-XXXX"
  </div>
  
  <h3>미응답 후 (3일 뒤)</h3>
  <div class="script">
    "안녕하세요 대표님. 며칠 전 홈페이지 모바일 개선 관련 연락드렸던 [이름]입니다. 혹시 시안 확인하셨나요? 이번 주 내 결정하시면 10% 할인 적용해드립니다."
  </div>
  
  <h3>장기 미응답 (2주 뒤)</h3>
  <div class="script">
    "[업체명] 대표님, [이름]입니다. 홈페이지 개선 건 아직 관심 있으시면 편하실 때 연락주세요. 무료 시안은 언제든 보내드릴 수 있습니다. 좋은 하루 되세요!"
  </div>
</div>

<div class="card">
  <h2>📊 TM 성과 기준</h2>
  <table>
    <tr><th>지표</th><th>목표</th><th>기준</th></tr>
    <tr><td>일일 콜수</td><td>50~100건</td><td>09:00~12:00 집중</td></tr>
    <tr><td>대표 연결률</td><td>30~40%</td><td>직원 통해 연결</td></tr>
    <tr><td>시안 발송률</td><td>50~60%</td><td>연결된 대표 중</td></tr>
    <tr><td>견적 전환률</td><td>10~15%</td><td>시안 발송 중</td></tr>
    <tr><td>계약 전환률</td><td>3~8%</td><td>전체 콜 대비</td></tr>
  </table>
</div>

</div>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const manualPath = path.join(OUTPUT_DIR, 'tm-manual.html');
  fs.writeFileSync(manualPath, generateTMManual(), 'utf8');
  console.log(`✅ TM 매뉴얼 생성: ${manualPath}`);
  
  // 특정 업체 맞춤 스크립트
  if (args.length > 0 && !args[0].startsWith('--')) {
    const csvPath = path.join(OUTPUT_DIR, 'prospects.csv');
    if (!fs.existsSync(csvPath)) return;
    // CSV 파싱 생략 (기존 함수 재사용)
    console.log('💡 맞춤 스크립트는 sender.js preview 명령어를 사용하세요.');
  }
}

main().catch(e => console.error('❌:', e));
