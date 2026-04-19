/**
 * 말투 프로필 생성 — Opus 4.7 CLI가 누적 답변 분석
 * 입력: kmong_historical_replies + kmong_inquiries(sent) 최근 answers
 * 출력: kmong_style_profile (description + characteristics JSONB)
 * 용도: auto-reply.js가 시스템 프롬프트에 주입 → Claude 생성 답변이 같은 말투
 */

const { spawn } = require('child_process');
const { supabase } = require('./supabase');
const adminDb = require('./supabase-admin');

const SYSTEM = `당신은 문체 분석 전문가입니다. 셀러의 과거 실제 답변들을 분석해
"동일한 말투로 새 답변을 쓰려면 알아야 할 것"을 JSON으로 추출합니다.

## 분석 포인트
1. 첫 줄 패턴: 인사 형식, 고객 재진술 여부, 이모지 사용
2. 어조: 존댓말 수준, 친근함 vs 공식적, 단정 vs 제안
3. 문장 길이: 평균/최대, 단락 구분 방식
4. 실적/수치 언급 패턴 (있는지, 어떻게)
5. 가격/기간 답변 방식 (즉답 vs 미루기, 범위 vs 단일)
6. CTA(행동 유도) 형식: 견적요청/상담/전화 중 어떤 걸 선호
7. 리스크 리버설(환불/보증) 언급 빈도
8. 금지/주의 패턴: 자주 쓰는 표현 vs 절대 안 쓰는 표현

## 출력 JSON (다른 텍스트 금지)
{
  "description": "5~10문장 — 이 셀러 말투를 흉내내기 위해 필수로 지켜야 할 특징",
  "characteristics": {
    "greeting": "첫 줄 형식",
    "tone": "...",
    "sentence_length": "평균 N자, 최대 M자, 단락 구분: ...",
    "numeric_claims": "실적 언급 여부와 방식",
    "price_style": "...",
    "cta_style": "...",
    "risk_reversal": "...",
    "emoji_policy": "...",
    "forbidden_patterns": ["안 쓰는 표현 1", ...]
  }
}`;

function runClaude(systemPrompt, userMsg, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const proc = spawn('claude', [
      '-p', '--model', 'opus', '--output-format', 'json',
      '--append-system-prompt', systemPrompt, '--no-session-persistence',
    ], { stdio: ['pipe', 'pipe', 'pipe'], env });
    let stdout = '', stderr = '';
    const t = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => { clearTimeout(t); resolve({ code, stdout, stderr }); });
    proc.stdin.write(userMsg); proc.stdin.end();
  });
}

async function generateStyleProfile(sampleLimit = 50) {
  // 최근 sent 답변 + historical_replies 합쳐서 샘플링
  const { data: hist } = await supabase
    .from('kmong_historical_replies')
    .select('customer_message, seller_reply')
    .order('sent_at', { ascending: false })
    .limit(sampleLimit);
  const { data: sent } = await supabase
    .from('kmong_inquiries')
    .select('message_content, auto_reply_text')
    .eq('auto_reply_status', 'sent')
    .not('auto_reply_text', 'is', null)
    .order('inquiry_date', { ascending: false })
    .limit(20);

  const samples = [
    ...(hist || []).map(r => ({ customer: r.customer_message, seller: r.seller_reply })),
    ...(sent || []).map(r => ({ customer: r.message_content, seller: r.auto_reply_text })),
  ].filter(s => s.seller && s.seller.length >= 30);

  if (samples.length < 5) return { ok: false, error: `샘플 부족: ${samples.length}개 (최소 5개 필요)` };

  const userMsg = `## 과거 셀러 답변 ${samples.length}건 (customer → seller)
${samples.slice(0, 80).map((s, i) => `### ${i + 1}\n[customer] ${String(s.customer || '').slice(0, 300)}\n[seller] ${s.seller.slice(0, 500)}`).join('\n\n')}

위 답변들을 종합 분석해 JSON으로 출력.`;

  const r = await runClaude(SYSTEM, userMsg);
  if (r.code !== 0) return { ok: false, error: 'CLI exit ' + r.code + ': ' + r.stderr.slice(0, 200) };
  let env;
  try { env = JSON.parse(r.stdout); } catch (e) { return { ok: false, error: 'envelope: ' + e.message }; }
  if (env.is_error) return { ok: false, error: 'is_error: ' + env.result };
  let parsed;
  try {
    const m = env.result.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : env.result);
  } catch (e) { return { ok: false, error: 'JSON: ' + e.message }; }

  // Upsert profile (profile_name='default')
  const row = {
    profile_name: 'default',
    description: parsed.description,
    characteristics: parsed.characteristics,
    sample_count: samples.length,
    generated_by: 'claude-opus-4-7',
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  // 기존 default profile 삭제 후 insert (PostgREST UPSERT 불안정 우회)
  await supabase.from('kmong_style_profile').delete().eq('profile_name', 'default');
  const pg = await supabase.from('kmong_style_profile').insert([row]).select('id').single();
  if (pg.error) {
    const admin = await adminDb.insertRow('kmong_style_profile', row);
    if (!admin.ok) return { ok: false, error: admin.error };
    return { ok: true, id: admin.row?.id, profile: parsed, sample_count: samples.length, cost_usd: env.total_cost_usd };
  }
  return { ok: true, id: pg.data?.id, profile: parsed, sample_count: samples.length, cost_usd: env.total_cost_usd };
}

async function loadActiveProfile() {
  const { data } = await supabase
    .from('kmong_style_profile')
    .select('description, characteristics, sample_count')
    .eq('is_active', true)
    .eq('profile_name', 'default')
    .single();
  return data;
}

module.exports = { generateStyleProfile, loadActiveProfile };
