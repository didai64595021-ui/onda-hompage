/**
 * Claude Max OAuth 토큰으로 Anthropic API 호출하는 래퍼
 *  - 자격증명: ~/.claude/.credentials-account2.json (ondadaad@gmail.com, Max 20x)
 *  - 토큰 갱신은 /home/onda/scripts/unified-token-guard.sh (매분 cron)가 관리
 *  - 401 시 account1로 fallback
 *  - 모델: sonnet-4-6 기본, opus-4-6 에스컬레이션
 */
const fs = require('fs');
const https = require('https');

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

async function callClaude({ accessToken, model, system, messages, max_tokens = 1024, temperature = 0.3 }) {
  return postJson('api.anthropic.com', '/v1/messages', {
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'oauth-2025-04-20',
    authorization: `Bearer ${accessToken}`,
  }, { model, max_tokens, temperature, system, messages });
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
const MODEL_ALIAS = {
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-6',
  haiku:  'claude-haiku-4-5',
};

// 폴백 체인 — 답변봇은 opus 4.6 고정(사용자 지시). 다른 별칭은 기존 체인 유지.
const FALLBACK_CHAIN = {
  opus:   ['claude-opus-4-6'],
  sonnet: ['claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  haiku:  ['claude-haiku-4-5'],
};

async function askClaude({ system, messages, model = 'sonnet', max_tokens = 1024, temperature = 0.3, retryOn429 = true }) {
  // ondadaad@gmail.com 계정 통일 — account2만 사용
  const chain = FALLBACK_CHAIN[model] || [MODEL_ALIAS[model] || model];

  const token = readToken(CRED_PRIMARY);
  if (!token) return { ok: false, error: 'account2 토큰 없음 (unified-token-guard.sh 실행 확인)' };
  if (tokenExpired(CRED_PRIMARY)) return { ok: false, error: 'account2 토큰 만료 (1분 내 cron 갱신)' };

  let lastStatus = null, lastBody = null;
  // 429 백오프 스케줄 (초): 첫 호출 실패 시 순차 대기. 체인의 각 모델마다 적용.
  const backoffs = retryOn429 ? [8, 20, 45] : [];
  for (const m of chain) {
    let r = await callClaude({ accessToken: token, model: m, system, messages, max_tokens, temperature });
    for (const wait of backoffs) {
      if (r.status !== 429) break;
      await new Promise((res) => setTimeout(res, wait * 1000));
      r = await callClaude({ accessToken: token, model: m, system, messages, max_tokens, temperature });
    }
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.body);
        const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        return { ok: true, text, usage: j.usage, account: 'account2', model: m };
      } catch (e) { return { ok: false, error: `응답 파싱 실패: ${e.message}` }; }
    }
    lastStatus = r.status; lastBody = r.body;
    if (r.status !== 429) break;  // 429가 아닌 에러는 모델 바꿔도 안 해결되니 중단
  }
  return { ok: false, error: `HTTP ${lastStatus}: ${String(lastBody).slice(0, 300)}`, status: lastStatus };
}

module.exports = { askClaude, readToken, tokenExpired };
