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
9. 관리자 수정 패턴: AI 초안에서 사람이 자주 줄이거나 바꾸는 표현

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
    "copy_paste_style": "크몽 대화창에 바로 붙여넣을 때의 길이/줄바꿈/호흡",
    "user_corrections": ["관리자가 자주 고친 패턴 1", "..."],
    "forbidden_patterns": ["안 쓰는 표현 1", "..."]
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
  // 최근 사람이 실제로 보낸 답변 + ERP에서 수정/승인된 답변을 합쳐 샘플링한다.
  // admin-edited/copy-approved 피드백은 최신 말투 신호라서 프롬프트에서 별도 강조한다.
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
  const { data: feedback } = await supabase
    .from('kmong_reply_feedback')
    .select('action, original_reply, edited_reply, diff_summary, inquiry_snapshot, created_at')
    .in('action', ['edit', 'approve', 'send'])
    .order('created_at', { ascending: false })
    .limit(40);

  const samples = [
    ...(feedback || []).map(r => ({
      kind: r.action === 'edit' ? 'admin_edited' : 'admin_approved',
      customer: r.inquiry_snapshot?.message_content || r.inquiry_snapshot?.message || '',
      seller: r.edited_reply || r.original_reply,
      original: r.original_reply,
      diff: r.diff_summary,
    })),
    ...(hist || []).map(r => ({ kind: 'historical_sent', customer: r.customer_message, seller: r.seller_reply })),
    ...(sent || []).map(r => ({ kind: 'bot_sent', customer: r.message_content, seller: r.auto_reply_text })),
  ].filter(s => s.seller && s.seller.length >= 30);

  if (samples.length < 5) return { ok: false, error: `샘플 부족: ${samples.length}개 (최소 5개 필요)` };

  const corrections = samples
    .filter(s => s.kind === 'admin_edited' && s.original && s.original !== s.seller)
    .slice(0, 20);

  const userMsg = `## 셀러 답변 샘플 ${samples.length}건 (customer → seller)
우선순위: admin_edited > admin_approved > historical_sent > bot_sent.
admin_edited는 사람이 실제 크몽 복붙용으로 고친 결과이므로 말투 판단에서 가장 강하게 반영하세요.

${samples.slice(0, 90).map((s, i) => `### ${i + 1} [${s.kind}]
[customer] ${String(s.customer || '').slice(0, 300)}
[seller] ${s.seller.slice(0, 500)}`).join('\n\n')}

${corrections.length ? `## 관리자 수정쌍 ${corrections.length}건 (original → edited)
${corrections.map((s, i) => `### 수정 ${i + 1}
[original] ${String(s.original || '').slice(0, 350)}
[edited] ${String(s.seller || '').slice(0, 350)}
${s.diff ? `[diff] ${String(s.diff).slice(0, 200)}` : ''}`).join('\n\n')}` : ''}

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
