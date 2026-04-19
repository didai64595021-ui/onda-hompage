#!/usr/bin/env node
/**
 * 문의 자동응답 봇 dry-run 테스트
 * - 여러 서비스 × 여러 시나리오 가상 문의 주입
 * - auto-reply.js 실행 → Opus가 답변 생성 → 텔레그램 카드 발송
 * - 테스트 끝나면 가상 문의 cleanup 옵션
 *
 * 사용:
 *   node dryrun-inbox-test.js --inject         # 7건 주입 + auto-reply 실행
 *   node dryrun-inbox-test.js --cleanup        # 테스트 문의 삭제 (customer_name='DRYRUN_TEST_*')
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { spawn } = require('child_process');
const { supabase } = require('./lib/supabase');

const SCENARIOS = [
  { product_id: 'responsive', customer_name: 'DRYRUN_TEST_1', message_content: '안녕하세요, 저희 사무실 PC 홈페이지가 있는데 모바일에서 보면 글자가 밀리고 메뉴가 안 눌려요. 반응형으로 바꾸려면 얼마나 들까요? 페이지는 회사소개/서비스/포트폴리오/문의 4개입니다.' },
  { product_id: 'pc-mobile', customer_name: 'DRYRUN_TEST_2', message_content: '기존 홈페이지 그대로 두고 모바일 버전만 새로 만들고 싶은데 기간이 얼마나 걸리나요? 다음주까지 오픈해야 해서 급합니다.' },
  { product_id: 'mobile-fix', customer_name: 'DRYRUN_TEST_3', message_content: '갤럭시 폰에서 홈페이지 첫 화면 히어로 이미지가 아예 안 뜨고, 아이폰에서는 뜨긴 하는데 잘려 보여요. 내일 미팅 있어서 오늘 중으로 해결 가능할까요?' },
  { product_id: 'no-homepage', customer_name: 'DRYRUN_TEST_4', message_content: '홈페이지 문의드려요.' },
  { product_id: 'corp-seo', customer_name: 'DRYRUN_TEST_5', message_content: '기업 홈페이지 리뉴얼 + 네이버/구글 상위 노출까지 같이 해주시나요? 저희 업종은 산업용 기계 제조 B2B고 경쟁사 3곳이 상위에 있어서 SEO가 꼭 필요합니다. 예산은 300만원 정도 생각하고 있어요.' },
  { product_id: 'responsive', customer_name: 'DRYRUN_TEST_6', message_content: '다른 곳에서 150만원에 견적받았는데 여기는 얼마인가요? 가격만 말씀해주시면 됩니다. 디자인 다른 곳이 더 예쁘긴 했는데 수정 2회만 된대서요.' },
  { product_id: 'pc-mobile', customer_name: 'DRYRUN_TEST_7', message_content: '견적 좀 깎아주실 수 있나요? 저희 스타트업이라 자금이 많지 않은데 꼭 여기랑 하고 싶어요. 패키지 어떤 게 적당할까요?' },
];

async function inject() {
  console.log(`[주입] ${SCENARIOS.length}건 가상 문의 insert`);
  const rows = SCENARIOS.map((s, i) => ({
    ...s,
    inquiry_date: new Date(Date.now() - (SCENARIOS.length - i) * 60000).toISOString(),
    inquiry_type: 'test',
    status: 'new',
    auto_reply_status: 'pending',
  }));
  const { data, error } = await supabase.from('kmong_inquiries').insert(rows).select('id, product_id, customer_name');
  if (error) { console.error('[insert 실패]', error.message); process.exit(1); }
  console.log(`[주입 완료] id: ${data.map(r => r.id).join(', ')}`);

  console.log('\n[auto-reply] 실행 — Opus가 각 문의 답변 생성 후 텔레그램 카드 발송 (~3-5분)');
  const proc = spawn('node', ['auto-reply.js'], {
    cwd: __dirname, stdio: 'inherit', env: process.env,
  });
  proc.on('close', (code) => console.log(`\n[auto-reply 종료] code=${code}`));
}

async function cleanup() {
  console.log('[정리] DRYRUN_TEST_* 문의 삭제');
  const { data, error } = await supabase.from('kmong_inquiries')
    .delete()
    .like('customer_name', 'DRYRUN_TEST_%')
    .select('id');
  if (error) { console.error('[실패]', error.message); process.exit(1); }
  console.log(`[완료] ${data?.length || 0}건 삭제`);
}

(async () => {
  if (process.argv.includes('--cleanup')) return cleanup();
  if (process.argv.includes('--inject')) return inject();
  console.log('사용: node dryrun-inbox-test.js [--inject|--cleanup]');
})();
