/**
 * Claude Max OAuth 토큰으로 Anthropic API 호출하는 래퍼
 *  - 자격증명: ~/.claude/.credentials-account2.json (ondadaad@gmail.com, Max 20x)
 *  - 토큰 갱신은 /home/onda/scripts/unified-token-guard.sh (매분 cron)가 관리
 *  - 401 시 account1로 fallback
 *  - 모델: sonnet-4-6 기본, opus-4-6 에스컬레이션
 */
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

// Claude CLI spawn (Opus 4.7 — Max 한도) 폴백: OAuth API 429 회피용
// 단, content가 array(multipart with images)면 CLI는 text만 지원 → 폴백 X
function callClaudeViaCLI({ system, messages, model, max_tokens, timeoutMs = 180000 }) {
  return new Promise((resolve) => {
    // multipart image 포함 여부 체크
    const hasMultipart = messages.some(m => Array.isArray(m.content) && m.content.some(p => p && p.type !== 'text'));
    if (hasMultipart) return resolve({ status: 0, body: 'CLI 폴백 불가: multipart content(이미지)', cliSkipped: true });

    const prompt = messages.map(m => {
      const txt = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.filter(p => p?.type === 'text').map(p => p.text).join('\n') : '');
      return `[${m.role}]\n${txt}`;
    }).join('\n\n');

    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;  // OAuth Max 한도 사용 유도
    const args = ['-p', '--model', model || 'opus', '--output-format', 'json', '--no-session-persistence'];
    if (system) args.push('--append-system-prompt', system);

    const proc = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'], env });
    let stdout = '', stderr = '';
    const t = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      clearTimeout(t);
      if (code !== 0) return resolve({ status: 500, body: stderr.slice(0, 300) || 'CLI exit ' + code });
      try {
        const env = JSON.parse(stdout);
        if (env.is_error) return resolve({ status: 500, body: env.result?.slice(0, 300) || 'is_error' });
        // OAuth API body 형식 흉내: { content: [{type:'text', text: ...}] }
        return resolve({ status: 200, body: JSON.stringify({ content: [{ type: 'text', text: env.result }], usage: env.usage }), cliSource: true });
      } catch (e) { return resolve({ status: 500, body: 'parse fail: ' + e.message }); }
    });
    proc.stdin.write(prompt); proc.stdin.end();
  });
}

const CRED_PRIMARY = '/home/onda/.claude/.credentials-account2.json';
const CRED_FALLBACK = '/home/onda/.claude/.credentials-account1.json';

function readToken(credPath) {
  try {
    const j = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    return j?.claudeAiOauth?.accessToken || null;
  } catch { return null; }
}

function tokenExpired(credPath) {
  try {
    const j = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    const exp = j?.claudeAiOauth?.expiresAt || 0;
    // 60초 여유 버퍼
    return !exp || Date.now() > exp - 60000;
  } catch { return true; }
}

function postJson(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body), 'utf-8');
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, ...headers },
    }, (res) => {
      let buf = ''; res.on('data', (c) => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

// 일부 최신 모델(opus-4-7 이상)은 temperature 파라미터를 지원하지 않음 — 400 에러 반환
//   2026-04-17 실측: opus-4-7이 'temperature is deprecated' 400 던짐 → 답변 전부 룰 폴백
//   전략: 모델별로 temperature 포함 여부를 결정하고, 400 발생 시 자동으로 제거해 재시도
const NO_TEMPERATURE_MODELS = /^(claude-opus-4-7|claude-haiku-4-7|claude-sonnet-4-7)/;

// 2026-04-19 v2: Max OAuth가 api.anthropic.com 직접 호출 시 즉시 429 반환 문제 확인
//   Max 구독은 Claude Code 세션용 — 외부 스크립트는 ANTHROPIC_API_KEY 필수
//   API key가 env에 있으면 우선 사용, 없으면 OAuth 폴백
function buildHeaders(accessToken, useApiKey) {
  if (useApiKey) {
    return {
      'anthropic-version': '2023-06-01',
      'x-api-key': accessToken,
    };
  }
  return {
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'oauth-2025-04-20',
    authorization: `Bearer ${accessToken}`,
  };
}

async function callClaude({ accessToken, useApiKey, model, system, messages, max_tokens = 16384, temperature = 0.3 }) {
  const body = { model, max_tokens, system, messages };
  if (!NO_TEMPERATURE_MODELS.test(model)) body.temperature = temperature;

  const r = await postJson('api.anthropic.com', '/v1/messages', buildHeaders(accessToken, useApiKey), body);

  if (r.status === 400 && body.temperature != null && /temperature.*deprecated/i.test(String(r.body))) {
    delete body.temperature;
    return postJson('api.anthropic.com', '/v1/messages', buildHeaders(accessToken, useApiKey), body);
  }
  return r;
}

/**
 * Claude Max OAuth로 메시지 요청
 * @param {object} opts
 * @param {string} opts.system - 시스템 프롬프트
 * @param {Array<{role: 'user'|'assistant', content: string}>} opts.messages
 * @param {string} [opts.model] - 'sonnet' | 'opus' | 모델ID. 기본 sonnet-4-6
 * @param {number} [opts.max_tokens]
 * @param {number} [opts.temperature]
 * @returns {Promise<{ok: boolean, text?: string, usage?: object, error?: string, account?: string}>}
 */
// 2026-04-19: 전체 opus-4-7 통일 (사용자 지시 "모두 4.7 opus max토큰")
const MODEL_ALIAS = {
  sonnet: 'claude-opus-4-7',
  opus:   'claude-opus-4-7',
  haiku:  'claude-opus-4-7',
};

// 폴백 체인 — opus-4-7 단일. 429는 callClaude 내부 재시도로 처리.
const FALLBACK_CHAIN = {
  opus:   ['claude-opus-4-7'],
  sonnet: ['claude-opus-4-7'],
  haiku:  ['claude-opus-4-7'],
};

async function askClaude({ system, messages, model = 'opus', max_tokens = 16384, temperature = 0.3, retryOn429 = true }) {
  const chain = FALLBACK_CHAIN[model] || [MODEL_ALIAS[model] || model];

  // API key가 env에 있으면 우선 사용 (Max OAuth는 Claude Code 세션용으로 외부 호출 시 즉시 429)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const useApiKey = !!apiKey;
  let credential;
  let credSource;
  if (useApiKey) {
    credential = apiKey;
    credSource = 'api-key';
  } else {
    credential = readToken(CRED_PRIMARY);
    if (!credential) return { ok: false, error: 'ANTHROPIC_API_KEY 없고 account2 OAuth 토큰도 없음' };
    if (tokenExpired(CRED_PRIMARY)) return { ok: false, error: 'account2 토큰 만료 — API key 권장 (Max OAuth는 외부 API 호출 불가)' };
    credSource = 'oauth-account2';
  }

  let lastStatus = null, lastBody = null;
  const backoffs = retryOn429 ? [8, 20, 45] : [];
  for (const m of chain) {
    let r = await callClaude({ accessToken: credential, useApiKey, model: m, system, messages, max_tokens, temperature });
    for (const wait of backoffs) {
      if (r.status !== 429) break;
      await new Promise((res) => setTimeout(res, wait * 1000));
      r = await callClaude({ accessToken: credential, useApiKey, model: m, system, messages, max_tokens, temperature });
    }
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.body);
        const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        return { ok: true, text, usage: j.usage, account: credSource, model: m };
      } catch (e) { return { ok: false, error: `응답 파싱 실패: ${e.message}` }; }
    }
    // ★ 429 지속 → Claude CLI 폴백 (OAuth Max 한도 다른 버킷)
    if (r.status === 429) {
      const cliR = await callClaudeViaCLI({ system, messages, model: m, max_tokens });
      if (cliR.status === 200) {
        try {
          const j = JSON.parse(cliR.body);
          const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
          return { ok: true, text, usage: j.usage, account: 'cli-oauth', model: m };
        } catch (e) { /* fallthrough */ }
      }
    }
    lastStatus = r.status; lastBody = r.body;
    if (r.status !== 429 && r.status !== 400) break;
  }
  return { ok: false, error: `HTTP ${lastStatus} (${credSource}): ${String(lastBody).slice(0, 300)}`, status: lastStatus };
}

module.exports = { askClaude, readToken, tokenExpired };
