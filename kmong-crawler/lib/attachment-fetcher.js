/**
 * 크몽 메시지 첨부파일 원본 다운로드
 *  - preview_url은 160x120 썸네일이라 Vision 분석 불가능
 *  - 인증된 download_url("api/v5/inbox-groups/{gid}/messages/{mid}/files/{fid}")을
 *    Playwright context.request.get()으로 fetch하면 원본 바이너리 수신
 *  - 로컬에 저장하고 local_path 반환 → auto-reply.js가 base64로 읽음
 */
const fs = require('fs');
const path = require('path');

const ATTACH_DIR = path.join(__dirname, '..', 'inbox-attachments');
const MAX_BYTES = 5 * 1024 * 1024;  // 5MB 상한 (Vision 부담 방지)

function sanitizeName(s) {
  return String(s || 'file').replace(/[^\w가-힣.\-]+/g, '_').slice(0, 80);
}

async function downloadAttachments(page, files, inboxGroupId) {
  if (!Array.isArray(files) || files.length === 0) return [];
  if (!fs.existsSync(ATTACH_DIR)) fs.mkdirSync(ATTACH_DIR, { recursive: true });

  const out = [];
  for (const f of files) {
    // download_url 정규화: "api/v5/..." → "https://kmong.com/api/v5/..."
    let dlUrl = f.download_url || '';
    if (!dlUrl) continue;
    if (!dlUrl.startsWith('http')) {
      dlUrl = 'https://kmong.com/' + dlUrl.replace(/^\//, '');
    }

    const fileName = f.file_name || `file_${f.FID || Date.now()}`;
    const safeName = sanitizeName(fileName);
    const localPath = path.join(ATTACH_DIR, `${f.MID || 'm'}_${f.FID || 'f'}_${safeName}`);

    // 이미 있으면 재사용
    if (fs.existsSync(localPath)) {
      out.push({ file_name: fileName, FID: f.FID, MID: f.MID, preview_url: f.preview_url || null, local_path: localPath, cached: true });
      continue;
    }

    try {
      const resp = await page.context().request.get(dlUrl);
      if (resp.status() !== 200) {
        console.warn(`  ⚠ 첨부 다운로드 실패 ${fileName}: HTTP ${resp.status()}`);
        continue;
      }
      const body = await resp.body();
      if (body.length > MAX_BYTES) {
        console.warn(`  ⚠ 첨부 크기 초과 ${fileName}: ${body.length} bytes (>${MAX_BYTES})`);
        continue;
      }
      fs.writeFileSync(localPath, body);
      out.push({ file_name: fileName, FID: f.FID, MID: f.MID, preview_url: f.preview_url || null, local_path: localPath, bytes: body.length });
      console.log(`  💾 첨부 저장: ${fileName} (${body.length} bytes)`);
    } catch (e) {
      console.warn(`  ⚠ 첨부 다운로드 예외 ${fileName}: ${e.message}`);
    }
  }
  return out;
}

module.exports = { downloadAttachments, ATTACH_DIR };
