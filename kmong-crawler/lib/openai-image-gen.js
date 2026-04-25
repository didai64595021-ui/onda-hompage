/**
 * OpenAI gpt-image-1 wrapper — 메인 이미지 생성 (비승인 사유 회피용)
 *
 * 원칙:
 *  - 텍스트 오버레이 없는 클린 일러스트/사진 톤 (크몽 가이드)
 *  - 가격/할인/순위/매출 보장 같은 금지 키워드 절대 금지
 *  - 결과는 disk에 PNG 저장하고 경로 반환
 */

const fs = require('fs');
const path = require('path');

const FORBIDDEN = [
  '최저가', '이벤트', '매출 보장', '환불', '5점', '100%', '만족',
  '무료', '할인', '가성비', '저렴',
  '1위', 'BEST', '베스트', '추천', 'No.1', '최초', '유일', '무한', '누적',
  '원', '万', '万원', '万', '%', '카톡', '전화', '이메일', 'http',
];

function sanitizePrompt(text) {
  let s = text || '';
  for (const w of FORBIDDEN) s = s.split(w).join('');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * @param {object} opts
 * @param {string} opts.prompt - 본문 프롬프트 (필수)
 * @param {string} [opts.size='1536x1024'] - 1024x1024|1024x1536|1536x1024 (gpt-image-1)
 * @param {string} [opts.outDir='/tmp']
 * @param {string} [opts.filenamePrefix='gen']
 * @returns {Promise<{ok, file_path?, error?}>}
 */
async function generateMainImage(opts) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY 누락' };
  if (!opts?.prompt) return { ok: false, error: 'prompt 필수' };

  const size = opts.size || '1536x1024';
  const outDir = opts.outDir || '/tmp';
  const prefix = opts.filenamePrefix || 'gen';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filePath = path.join(outDir, `${prefix}-${stamp}.png`);

  // gpt-image-1 가이드 — 명시적으로 "텍스트 없음" 강조
  const finalPrompt = [
    sanitizePrompt(opts.prompt),
    '',
    'Style: clean professional flat illustration, modern minimal, soft pastel palette, no text or numbers anywhere in the image, no logos, no watermarks, no overlay text, no captions, no Korean Chinese or Latin text characters, pure visual composition only.',
  ].join('\n');

  console.log('[openai-image] 생성 요청:', JSON.stringify({ size, len: finalPrompt.length }));

  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: finalPrompt,
      size,
      n: 1,
      quality: 'high',
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    return { ok: false, error: `HTTP ${r.status}: ${t.slice(0, 400)}` };
  }
  const json = await r.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: 'b64_json 누락', raw: JSON.stringify(json).slice(0, 400) };

  fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
  console.log('[openai-image] 저장:', filePath, fs.statSync(filePath).size, 'bytes');
  return { ok: true, file_path: filePath };
}

module.exports = { generateMainImage, sanitizePrompt };
