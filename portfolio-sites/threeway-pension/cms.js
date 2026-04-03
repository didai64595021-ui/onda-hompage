/* ============================================
   쓰리웨이펜션 — CMS 엔진
   Supabase 기반 JSON CMS
   data-cms 속성으로 HTML 요소에 바인딩
   ============================================ */

(function () {
  'use strict';

  const SUPABASE_URL = 'https://byaipfmwicukyzruqtsj.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5YWlwZm13aWN1a3l6cnVxdHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTc3MjgsImV4cCI6MjA4NjUzMzcyOH0.GGm46X0W0joFXdYtdg-N9n8UQYiVHpbtZVZ__jfbY40';
  const CMS_TABLE = 'threeway_cms';
  const CMS_ROW_ID = 'main';
  const CMS_JSON = 'cms-data.json';

  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
  };

  /**
   * Load CMS data: Supabase first, fallback to cms-data.json
   */
  async function loadCmsData() {
    // 1. Try Supabase
    try {
      const resp = await fetch(
        SUPABASE_URL + '/rest/v1/' + CMS_TABLE + '?id=eq.' + CMS_ROW_ID + '&select=data',
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY } }
      );
      if (resp.ok) {
        const rows = await resp.json();
        if (rows.length > 0 && rows[0].data) {
          return rows[0].data;
        }
      }
    } catch (e) {
      console.warn('[CMS] Supabase load failed, falling back to JSON file:', e);
    }

    // 2. Fallback to cms-data.json
    try {
      const resp = await fetch(CMS_JSON + '?t=' + Date.now());
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      console.warn('[CMS] Could not load cms-data.json:', e);
    }

    return {};
  }

  /**
   * Apply CMS data to all data-cms elements on the page
   */
  function applyCmsData(data) {
    if (!data || typeof data !== 'object') return;

    document.querySelectorAll('[data-cms]').forEach(el => {
      const key = el.dataset.cms;
      if (!key || !(key in data)) return;

      const value = data[key];

      if (el.tagName === 'IMG') {
        if (value && value !== el.src) {
          el.src = value;
          const parent = el.closest('[data-lightbox]');
          if (parent) {
            parent.dataset.lightbox = value;
          }
        }
      } else if (el.tagName === 'A' && el.href) {
        el.textContent = value;
      } else {
        if (/<[^>]+>/.test(value)) {
          el.innerHTML = value;
        } else {
          el.textContent = value;
        }
      }
    });
  }

  /**
   * Save CMS data to Supabase (upsert)
   */
  async function saveCmsData(data) {
    try {
      // Check payload size (base64 images can bloat JSON)
      const payload = JSON.stringify({ data: data, updated_at: new Date().toISOString() });
      const payloadSizeMB = new Blob([payload]).size / (1024 * 1024);

      if (payloadSizeMB > 5) {
        console.error('[CMS] Payload too large:', payloadSizeMB.toFixed(2) + 'MB');
        alert('⚠️ 이미지가 너무 큽니다 (' + payloadSizeMB.toFixed(1) + 'MB).\n더 작은 이미지를 사용해주세요 (2MB 이하 권장).');
        return false;
      }

      const resp = await fetch(
        SUPABASE_URL + '/rest/v1/' + CMS_TABLE + '?id=eq.' + CMS_ROW_ID,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=representation' },
          body: payload
        }
      );
      if (!resp.ok) {
        const errText = await resp.text();
        let errMsg = '저장 실패';
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.message || errJson.error || errText;
        } catch (_) {
          errMsg = errText;
        }
        console.error('[CMS] Supabase save error:', errMsg);

        // Detect payload size / row size errors
        if (resp.status === 413 || errMsg.includes('too large') || errMsg.includes('payload') || errMsg.includes('size')) {
          alert('⚠️ 데이터가 너무 큽니다.\n이미지 크기를 줄여주세요 (2MB 이하 권장).');
        }
        return false;
      }
      return true;
    } catch (e) {
      console.error('[CMS] Save error:', e);
      return false;
    }
  }

  /**
   * Reset CMS data (restore from cms-data.json → save to Supabase)
   */
  async function resetCmsData() {
    try {
      const resp = await fetch(CMS_JSON + '?t=' + Date.now());
      if (resp.ok) {
        const original = await resp.json();
        await saveCmsData(original);
      }
    } catch (e) {
      console.warn('[CMS] Reset error:', e);
    }
  }

  /**
   * Export current CMS data as downloadable JSON
   */
  function exportCmsData(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cms-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Expose CMS API globally for admin page
  window.CMS = {
    load: loadCmsData,
    apply: applyCmsData,
    save: saveCmsData,
    reset: resetCmsData,
    export: exportCmsData,
    SUPABASE_URL: SUPABASE_URL
  };

  // Auto-apply on page load (for non-admin pages)
  if (!document.querySelector('.cms-admin-wrap')) {
    loadCmsData().then(data => {
      applyCmsData(data);
    });
  }
})();
