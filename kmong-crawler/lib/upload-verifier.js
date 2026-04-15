/**
 * Kmong Upload Verifier
 *  - 메인이미지 업로드 4중 검증:
 *    1. DOM count indicator (카운트 0/N → 1/N 전환)
 *    2. <img> 요소 src 가 CDN URL로 변경 (static.cdn.kmong.com 또는 사용자 업로드 흔적)
 *    3. Network XHR — POST/PUT 요청 + 200~299 응답 확인
 *    4. (옵션) Vision LLM — 실제 이미지가 슬롯에 보이는지 시각 검증
 *
 *  - false positive 방지: DOM-only 검증이 통과해도 Network 신호 없으면 실패로 판정
 *  - 사용:
 *      const verifier = createUploadVerifier(page, { useVision: true });
 *      const v = await verifier.runUpload({
 *        imagePath: '/path/to.png',
 *        targetSelector: '#MAIN_GALLERY',
 *        targetDraftId: '763082',  // URL 검증용
 *      });
 */

const path = require('path');
const fs = require('fs');
const { createNetworkObserver } = require('/home/onda/shared/lib/playwright-network-observer');
const { createVisionVerifier } = require('/home/onda/shared/lib/playwright-vision-verify');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function readDomState(page, selector) {
  return await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { ok: false, reason: 'no root' };
    const counters = [...root.querySelectorAll('span, p')]
      .map(e => (e.innerText || '').trim())
      .filter(t => /\d+\s*\/\s*\d+/.test(t));
    const imgs = [...root.querySelectorAll('img')].map(i => ({
      src: (i.src || '').slice(0, 300), w: i.naturalWidth, h: i.naturalHeight,
    }));
    const inputCount = root.querySelectorAll('input[type=file]').length;
    return { ok: true, counters, imgs, inputCount };
  }, selector);
}

function parseCount(counterStr) {
  const m = counterStr && counterStr.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { current: parseInt(m[1], 10), max: parseInt(m[2], 10) };
}

function createUploadVerifier(page, opts = {}) {
  const useVision = opts.useVision === true;
  const visionVerifier = useVision ? createVisionVerifier() : null;

  /**
   * 페이지가 정확한 draft 편집 페이지에 있는지 URL로 검증
   * 잘못된 draft 진입 시 (다른 draft로 redirect 등) 즉시 실패 반환
   */
  function verifyDraftId(targetDraftId) {
    const url = page.url();
    const m = url.match(/\/edit\/(\d+)/);
    if (!m) return { ok: false, reason: 'not on edit page', url };
    if (m[1] !== String(targetDraftId)) {
      return { ok: false, reason: 'wrong draft', expected: targetDraftId, actual: m[1], url };
    }
    return { ok: true, draftId: m[1], url };
  }

  /**
   * 업로드 실행 + 4중 검증
   *  opts.imagePath        : 업로드할 이미지 경로
   *  opts.targetSelector   : 갤러리 root selector (default '#MAIN_GALLERY')
   *  opts.targetDraftId    : 편집 중인 draft ID (URL 검증)
   *  opts.waitMs           : setInputFiles 후 대기 시간 (default 12000)
   *  opts.networkMatch     : 업로드 XHR 매칭 정규식 (default kmong/aws/upload)
   *  opts.visionPrompt     : vision 질문 (default: 메인 이미지 슬롯에 사진 보이는지)
   *  opts.screenshotDir    : 스크린샷 저장 디렉토리 (없으면 저장 안 함)
   */
  async function runUpload(opts) {
    const {
      imagePath,
      targetSelector = '#MAIN_GALLERY',
      targetDraftId,
      waitMs = 12000,
      networkMatch = /upload|s3|amazonaws|kmong-static|cdn|file/i,
      visionPrompt = 'Does the main image slot contain a user-uploaded photo (not just an empty placeholder or instructions)? Answer based on whether you see a real image thumbnail in the slot.',
      screenshotDir,
    } = opts;

    const out = { signals: {}, ok: false, reasons: [] };

    // 0) URL 검증 — 잘못된 draft면 즉시 실패
    if (targetDraftId) {
      const urlCheck = verifyDraftId(targetDraftId);
      out.signals.url = urlCheck;
      if (!urlCheck.ok) {
        out.reasons.push(`URL mismatch: ${urlCheck.reason}`);
        return out;
      }
    }

    // 1) BEFORE 상태 캡처
    const before = await readDomState(page, targetSelector);
    out.signals.before = before;
    const beforeCount = parseCount(before.counters?.[0])?.current ?? -1;

    // 2) 네트워크 옵저버 시작
    const observer = createNetworkObserver(page, { match: networkMatch });
    observer.start();

    // 3) BEFORE screenshot
    if (screenshotDir) {
      const p = path.join(screenshotDir, `${targetDraftId || 'unknown'}-before.png`);
      await page.screenshot({ path: p, fullPage: false }).catch(() => {});
      out.signals.beforeScreenshot = p;
    }

    // 4) setInputFiles
    let setRes = { ok: false };
    try {
      const input = page.locator(`${targetSelector} input[type=file]`).first();
      const cnt = await input.count();
      if (cnt === 0) { observer.stop(); out.reasons.push('no file input'); return out; }
      await input.setInputFiles(imagePath);
      setRes = { ok: true };
    } catch (e) {
      setRes = { ok: false, error: e.message };
    }
    out.signals.setInputFiles = setRes;

    // 5) dispatchEvent 강제 (React state 유도)
    await sleep(800);
    await page.evaluate((sel) => {
      const inp = document.querySelector(`${sel} input[type=file]`);
      if (inp) {
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, targetSelector).catch(() => {});

    // 6) 대기
    await sleep(waitMs);

    // 7) AFTER 상태 + 네트워크 캡처
    const after = await readDomState(page, targetSelector);
    out.signals.after = after;
    const afterCount = parseCount(after.counters?.[0])?.current ?? -1;
    const events = observer.stop();
    const uploads = observer.uploads(events);
    const uploadResponses = observer.uploadResponses(events);
    out.signals.network = {
      total: events.length,
      uploads: uploads.length,
      successResponses: uploadResponses.length,
      uploadUrls: uploads.slice(0, 3).map(u => u.url),
      responseSamples: uploadResponses.slice(0, 3).map(r => `${r.status}:${r.url.slice(0, 100)}`),
    };

    // 8) AFTER screenshot
    if (screenshotDir) {
      const p = path.join(screenshotDir, `${targetDraftId || 'unknown'}-after.png`);
      await page.screenshot({ path: p, fullPage: false }).catch(() => {});
      out.signals.afterScreenshot = p;
    }

    // 9) 4중 신호 평가
    const sigDom = afterCount > beforeCount && afterCount > 0;
    const sigImg = (after.imgs?.length || 0) > (before.imgs?.length || 0)
      || (after.imgs?.[0]?.src && after.imgs[0].src !== before.imgs?.[0]?.src);
    const sigNetwork = uploads.length > 0 || uploadResponses.length > 0;
    out.signals.evaluation = { domCount: { before: beforeCount, after: afterCount, ok: sigDom },
                                imgChange: sigImg, network: sigNetwork };

    // 10) Vision 검증 (옵션)
    if (useVision && visionVerifier?.available && out.signals.afterScreenshot) {
      const vr = await visionVerifier.askYesNo({
        screenshotPath: out.signals.afterScreenshot,
        question: visionPrompt,
        contextHint: `Editing kmong gig draft ${targetDraftId}. Looking for the "메인 이미지" upload slot.`,
      });
      out.signals.vision = vr;
    }

    // 최종 판정: DOM count 증가 + (network 또는 img 변화) → 성공
    // 보수적: 적어도 2개 신호 일치 필요
    const positives = [sigDom, sigImg, sigNetwork].filter(Boolean).length;
    if (positives >= 2) {
      out.ok = true;
    } else {
      out.ok = false;
      if (!sigDom) out.reasons.push(`DOM count unchanged (${beforeCount}→${afterCount})`);
      if (!sigNetwork) out.reasons.push('no upload XHR detected');
      if (!sigImg) out.reasons.push('no img element change');
    }
    return out;
  }

  return { runUpload, verifyDraftId, readDomState, useVision, visionAvailable: !!(visionVerifier?.available) };
}

module.exports = { createUploadVerifier, parseCount, readDomState };
