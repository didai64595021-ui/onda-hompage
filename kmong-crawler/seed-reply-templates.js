#!/usr/bin/env node
/**
 * 자동응답 봇 전문가 수준 seed 데이터 생성
 * - Opus 4.7 CLI로 크몽 홈페이지 제작 업종 실제 문의 시나리오 15개 별 최고 수준 응답 생성
 * - kmong_reply_templates에 seed insert (cold-start 해결)
 * - few-shot 재료로도 쓰이므로 품질이 모델 학습 시간 단축의 핵심
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { spawn } = require('child_process');
const { supabase } = require('./lib/supabase');
const adminDb = require('./lib/supabase-admin');
const { notifyTyped } = require('./lib/notify-filter');

const SYSTEM = `당신은 크몽 홈페이지 제작/수정/반응형/SEO 업종에서 **월 매출 상위 1%** 운영하는 전문가입니다.
10년+ 운영 경험 + 누적 200건+ 실적 기준으로, 다음 각 시나리오의 표준 응답 템플릿을 작성합니다.

## 공통 원칙 (Claude 학습 재료로 쓸 것이므로 일관성 중요)
1. 첫 줄: 인사 X, 문의 요약 재진술 (고객 공감). 예: "PC사이트 모바일 대응 필요하신 거 맞으실까요?"
2. 2~3줄: 핵심 답변 + 근거 수치/실적 1개 (예: "누적 200건·재구매 30%")
3. 본론: 구체적 solution (기간/금액/기능) — 변수 placeholder {{price}}, {{days}}, {{gig_title}} 사용
4. 리스크 리버설 1개 (환불/수정 보증)
5. 마지막: CTA — 견적 요청/전화 상담 유도 (압박 X)
6. 이모지 최소 (0~1개), 형식적 인사말 금지, 줄 3~5줄 적정
7. 한국어 존댓말, 사장님 타겟

## 시나리오 15개 (각각 1개 템플릿)
1. price_inquiry — "얼마예요?" (막연 가격)
2. price_detail_request — 상세 견적 요청 (페이지 수/기능 구체)
3. duration_inquiry — "며칠 걸려요?"
4. feature_check — "X 기능 가능해요?" (Y/N)
5. portfolio_request — 샘플/레퍼런스
6. compare_seller — 다른 셀러와 차이
7. discount_request — 할인 요청
8. urgent_request — "당장 해야"
9. vague_initial — 막연한 "문의드려요"
10. revision_scope — 수정 범위/횟수
11. refund_policy — 환불 조건
12. mobile_responsive — 반응형/모바일 특화
13. seo_marketing — SEO/검색노출
14. existing_site_migration — 기존 사이트 이전
15. maintenance_contract — 유지보수 계약

## 출력 (JSON 배열 한 덩어리만)
[
  {
    "template_name": "가격 문의 표준 응답",
    "template_type": "price_inquiry",
    "service_category": "homepage",
    "template_text": "실제 응답 전문 (3~5줄)",
    "variables": ["price_min","price_max","days","gig_title"]
  },
  ...
]

총 15개. 다른 설명 문장 없이 JSON 배열만.`;

function runClaude(prompt, timeoutMs = 300000) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const proc = spawn('claude', [
      '-p', '--model', 'opus', '--output-format', 'json',
      '--append-system-prompt', SYSTEM, '--no-session-persistence',
    ], { stdio: ['pipe', 'pipe', 'pipe'], env });
    let stdout = '', stderr = '';
    const t = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => { clearTimeout(t); resolve({ code, stdout, stderr }); });
    proc.stdin.write(prompt); proc.stdin.end();
  });
}

async function main() {
  console.log('=== 전문가 seed 응답 템플릿 생성 ===');
  console.log('Opus 4.7로 15개 시나리오 템플릿 생성 중... (2~5분 소요)');

  const r = await runClaude('위 시스템 프롬프트에 따라 15개 시나리오 템플릿 JSON 배열로 생성해주세요.');
  if (r.code !== 0) { console.error('[CLI 실패]', r.stderr.slice(0, 300)); process.exit(1); }

  let envelope;
  try { envelope = JSON.parse(r.stdout); } catch (e) { console.error('envelope 파싱:', e.message); process.exit(1); }
  if (envelope.is_error) { console.error('CLI 에러:', envelope.result); process.exit(1); }

  let templates;
  try {
    const m = envelope.result.match(/\[[\s\S]*\]/);
    templates = JSON.parse(m ? m[0] : envelope.result);
  } catch (e) { console.error('JSON 파싱:', e.message, '\nraw:', envelope.result.slice(0, 500)); process.exit(1); }

  if (!Array.isArray(templates) || templates.length === 0) { console.error('[실패] 템플릿 배열 비어있음'); process.exit(1); }
  console.log(`[Opus] ${templates.length}개 생성, 비용 $${envelope.total_cost_usd?.toFixed(4)}`);

  // 기존 template_type 중복 시 skip
  const { data: existing } = await supabase.from('kmong_reply_templates').select('template_type');
  const existingTypes = new Set((existing || []).map(r => r.template_type));

  let inserted = 0, skipped = 0;
  for (const t of templates) {
    if (!t.template_type || !t.template_text) { skipped++; continue; }
    if (existingTypes.has(t.template_type)) { console.log(`  [skip] ${t.template_type} 이미 있음`); skipped++; continue; }
    const row = {
      template_name: t.template_name || t.template_type,
      template_type: t.template_type,
      service_category: t.service_category || 'homepage',
      template_text: t.template_text,
      variables: t.variables || [],
      is_active: true,
      total_sent: 0, total_replied: 0, total_quoted: 0, total_paid: 0,
      reply_rate: 0, quote_rate: 0, conversion_rate: 0,
    };
    // PostgREST 우선
    const pg = await supabase.from('kmong_reply_templates').insert([row]).select('id').single();
    if (pg.error) {
      const admin = await adminDb.insertRow('kmong_reply_templates', row);
      if (!admin.ok) { console.log(`  [fail] ${t.template_type}: ${admin.error}`); continue; }
    }
    console.log(`  [ok] ${t.template_type} — ${t.template_text.slice(0, 50).replace(/\n/g, ' ')}...`);
    inserted++;
  }

  const msg = `📚 전문가 seed 템플릿 생성 완료\n  신규 ${inserted}개 · 중복 skip ${skipped}개\n  Opus 비용 $${envelope.total_cost_usd?.toFixed(4)}\n  봇이 다음 문의부터 few-shot 재료로 활용`;
  console.log(msg);
  notifyTyped('report', msg);
}

main().catch(e => { console.error(e); process.exit(1); });
