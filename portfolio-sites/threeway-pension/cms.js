/* ============================================
   쓰리웨이펜션 — CMS 엔진
   localStorage 기반 JSON CMS
   data-cms 속성으로 HTML 요소에 바인딩
   ============================================ */

(function () {
  'use strict';

  const CMS_KEY = 'threeway-cms-data';
  const CMS_JSON = 'cms-data.json';

  /**
   * Load CMS data: localStorage first, fallback to cms-data.json
   */
  async function loadCmsData() {
    // 1. Try localStorage
    const stored = localStorage.getItem(CMS_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.warn('[CMS] localStorage parse error, falling back to JSON file');
      }
    }

    // 2. Fetch cms-data.json
    try {
      const resp = await fetch(CMS_JSON + '?t=' + Date.now());
      if (resp.ok) {
        const data = await resp.json();
        return data;
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

      // Image elements: update src (and parent data-lightbox if applicable)
      if (el.tagName === 'IMG') {
        if (value && value !== el.src) {
          el.src = value;
          // Update lightbox reference on parent
          const parent = el.closest('[data-lightbox]');
          if (parent) {
            parent.dataset.lightbox = value;
          }
        }
      }
      // Anchor elements with href that looks like a phone number or URL
      else if (el.tagName === 'A' && el.href) {
        el.textContent = value;
      }
      // General text/HTML content
      else {
        // If value contains HTML tags, use innerHTML; otherwise textContent
        if (/<[^>]+>/.test(value)) {
          el.innerHTML = value;
        } else {
          el.textContent = value;
        }
      }
    });
  }

  /**
   * Save CMS data to localStorage
   */
  function saveCmsData(data) {
    try {
      localStorage.setItem(CMS_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('[CMS] Save error:', e);
      return false;
    }
  }

  /**
   * Get all CMS keys used on current page
   */
  function getPageKeys() {
    const keys = new Set();
    document.querySelectorAll('[data-cms]').forEach(el => {
      keys.add(el.dataset.cms);
    });
    return Array.from(keys);
  }

  /**
   * Reset CMS data (clear localStorage, reload from JSON)
   */
  function resetCmsData() {
    localStorage.removeItem(CMS_KEY);
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
    getPageKeys: getPageKeys,
    STORAGE_KEY: CMS_KEY
  };

  // Auto-apply on page load (for non-admin pages)
  if (!document.querySelector('.cms-admin-wrap')) {
    loadCmsData().then(data => {
      applyCmsData(data);
    });
  }
})();
