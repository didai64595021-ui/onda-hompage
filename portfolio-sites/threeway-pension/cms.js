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
   * Render hero slides dynamically from CMS data
   * Supports both new 'hero-slides' array and legacy 'hero-slide-N-*' keys
   */
  function renderHeroSlides(data) {
    var slider = document.getElementById('heroSlider');
    if (!slider) return;

    // Remove existing slides
    slider.querySelectorAll('.hero-slide').forEach(function(el) { el.remove(); });

    // Build slides array: new format takes priority, fallback to legacy keys
    var slides = data['hero-slides'];
    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      slides = [];
      for (var i = 1; i <= 20; i++) {
        var img = data['hero-slide-' + i + '-img'];
        if (!img) break;
        slides.push({
          img: img,
          copy: data['hero-slide-' + i + '-copy'] || '',
          sub: data['hero-slide-' + i + '-sub'] || ''
        });
      }
    }

    // 빈 img 슬라이드는 메인 페이지에 노출 금지 (broken image 방지)
    // admin.html은 사용자가 만든 빈 카드를 그대로 보존해 입력 도움을 주지만,
    // 사이트에는 이미지가 있는 슬라이드만 노출한다.
    slides = (slides || []).filter(function (s) { return s && s.img; });

    if (slides.length === 0) return;

    var overlay = slider.querySelector('.hero-slider-overlay');
    var dotsContainer = slider.querySelector('#heroDots');

    slides.forEach(function(slide, idx) {
      var div = document.createElement('div');
      div.className = 'hero-slide' + (idx === 0 ? ' active' : '');
      var img = document.createElement('img');
      img.src = slide.img || '';
      img.alt = slide.copy || '';
      img.width = 1400;
      img.height = 900;
      img.loading = idx === 0 ? 'eager' : 'lazy';
      var contentDiv = document.createElement('div');
      contentDiv.className = 'hero-slider-content';
      var copyP = document.createElement('p');
      copyP.className = 'hero-slider-copy';
      copyP.textContent = slide.copy || '';
      var subP = document.createElement('p');
      subP.className = 'hero-slider-sub';
      subP.textContent = slide.sub || '';
      contentDiv.appendChild(copyP);
      contentDiv.appendChild(subP);
      div.appendChild(img);
      div.appendChild(contentDiv);
      slider.insertBefore(div, overlay);

      // dot
      if (dotsContainer) {
        var dot = document.createElement('button');
        dot.className = 'hero-dot' + (idx === 0 ? ' active' : '');
        dot.setAttribute('aria-label', '슬라이드 ' + (idx + 1));
        dotsContainer.appendChild(dot);
      }
    });

    // Re-initialize slider if function exists
    if (typeof window.initHeroSlider === 'function') {
      window.initHeroSlider();
    } else if (typeof window.heroSliderInit === 'function') {
      window.heroSliderInit();
    }
  }

  /**
   * 동적 카드 그룹 정의 (히어로 슬라이더와 동일한 패턴)
   *
   * 각 그룹:
   * - arrayKey: 새 배열 키 (예: 'room-previews')
   * - legacyPrefix: 레거시 개별 키 prefix (예: 'room-preview')
   * - legacyMax: 마이그레이션 시 최대 인덱스
   * - fields: 레거시 호환을 위해 마이그레이션할 필드명 배열
   *           단일 필드(갤러리)는 fields=[''] 로 표시
   * - containerId: HTML 컨테이너 ID
   * - render: (item, idx) => HTMLElement (카드 빌더)
   *
   * 동적 렌더링은 새 배열 데이터가 있을 때만 실행 (없으면 기존 HTML 유지 → 레거시 호환)
   */
  function buildEl(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'dataset') Object.keys(attrs[k]).forEach(function (dk) { el.dataset[dk] = attrs[k][dk]; });
        else if (k.indexOf('data-') === 0) el.setAttribute(k, attrs[k]);
        else el[k] = attrs[k];
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (c == null) return;
        el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return el;
  }

  // ─── 카드 빌더 6종 ───
  function buildRoomPreviewCard(item, idx) {
    var delay = 'delay-' + ((idx % 3) + 1);
    var imgWrap = buildEl('div', { class: 'card-img-wrap' }, [
      buildEl('img', { src: item.img || '', alt: item.name || '', width: 800, height: 600 })
    ]);
    var body = buildEl('div', { class: 'card-body' }, [
      item.tag ? buildEl('span', { class: 'card-tag' }, [item.tag]) : null,
      buildEl('h3', null, [item.name || '']),
      buildEl('p', null, [item.desc || ''])
    ]);
    return buildEl('a', {
      href: item.href || '#',
      class: 'card fade-in revealed ' + delay
    }, [imgWrap, body]);
  }

  function buildFacScrollCard(item) {
    var imgWrap = buildEl('div', { class: 'card-img-wrap' }, [
      buildEl('img', { src: item.img || '', alt: item.name || '', width: 800, height: 533 })
    ]);
    var body = buildEl('div', { class: 'card-body' }, [
      buildEl('h4', null, [item.name || '']),
      buildEl('p', null, [item.desc || ''])
    ]);
    return buildEl('div', { class: 'hscroll-card' }, [imgWrap, body]);
  }

  function buildFacCard(item, idx) {
    var delay = 'delay-' + ((idx % 3) + 1);
    var card = buildEl('div', {
      class: 'facility-card fade-in revealed ' + delay,
      'data-lightbox': item.img || ''
    }, [
      buildEl('img', { src: item.img || '', alt: item.name || '', width: 800, height: 600 }),
      buildEl('div', { class: 'facility-card-overlay' }, [
        buildEl('h3', null, [item.name || '']),
        buildEl('p', null, [item.desc || ''])
      ])
    ]);
    return card;
  }

  function buildAttrSpotCard(item, idx) {
    var delay = 'delay-' + ((idx % 4) + 1);
    var imgWrap = buildEl('div', { class: 'attraction-img-wrap' }, [
      buildEl('img', { src: item.img || '', alt: item.name || '', width: 800, height: 450 }),
      buildEl('span', { class: 'attraction-distance-badge' }, [item.dist || ''])
    ]);
    var body = buildEl('div', { class: 'attraction-card-body' }, [
      buildEl('span', { class: 'attraction-tag' }, [item.tag || '']),
      buildEl('h3', null, [item.name || '']),
      buildEl('p', null, [item.desc || ''])
    ]);
    return buildEl('div', { class: 'attraction-card-v2 fade-in revealed ' + delay }, [imgWrap, body]);
  }

  function buildAttrPartnerCard(item, idx) {
    var delay = 'delay-' + ((idx % 4) + 1);
    return buildEl('div', { class: 'partner-card fade-in revealed ' + delay }, [
      buildEl('div', { class: 'partner-icon' }, [item.icon || '🤝']),
      buildEl('h3', null, [item.name || '']),
      buildEl('p', { class: 'partner-discount' }, [item.discount || '']),
      buildEl('p', { class: 'partner-note' }, [item.note || ''])
    ]);
  }

  function buildPkgGalleryItem(item) {
    var src = typeof item === 'string' ? item : (item.img || '');
    return buildEl('div', { class: 'gallery-item', 'data-lightbox': src }, [
      buildEl('img', { src: src, alt: '', width: 600, height: 450 })
    ]);
  }

  var DYNAMIC_GROUPS = [
    {
      arrayKey: 'room-previews',
      legacyPrefix: 'room-preview',
      legacyMax: 30,
      fields: ['img', 'name', 'desc'],
      containerId: 'roomPreviewList',
      render: buildRoomPreviewCard
    },
    {
      arrayKey: 'fac-scroll-cards',
      legacyPrefix: 'fac-scroll',
      legacyMax: 30,
      fields: ['img', 'name', 'desc'],
      containerId: 'facScrollList',
      render: buildFacScrollCard
    },
    {
      arrayKey: 'fac-cards',
      legacyPrefix: 'fac-card',
      legacyMax: 30,
      fields: ['img', 'name', 'desc'],
      containerId: 'facCardList',
      render: buildFacCard
    },
    {
      arrayKey: 'attr-spots',
      legacyPrefix: 'attr-spot',
      legacyMax: 30,
      fields: ['img', 'dist', 'tag', 'name', 'desc'],
      containerId: 'attrSpotList',
      render: buildAttrSpotCard
    },
    {
      arrayKey: 'attr-partners',
      legacyPrefix: 'attr-partner',
      legacyMax: 30,
      fields: ['name', 'discount', 'note'],
      containerId: 'attrPartnerList',
      render: buildAttrPartnerCard
    },
    {
      arrayKey: 'pkg-galleries',
      legacyPrefix: 'pkg-gallery',
      legacyMax: 30,
      fields: [''],
      containerId: 'pkgGalleryList',
      render: buildPkgGalleryItem
    }
  ];

  // 그룹 정의 노출 (admin 페이지에서 재사용)
  window.CMS_DYNAMIC_GROUPS = DYNAMIC_GROUPS;

  /**
   * 새 배열 데이터 또는 레거시 키로부터 그룹 항목 추출
   */
  function getGroupItems(data, group) {
    var arr = data[group.arrayKey];
    if (Array.isArray(arr) && arr.length > 0) {
      return arr;
    }
    // 레거시 마이그레이션
    var items = [];
    for (var i = 1; i <= group.legacyMax; i++) {
      if (group.fields.length === 1 && group.fields[0] === '') {
        // 단일 키 패턴 (pkg-gallery-1)
        var v = data[group.legacyPrefix + '-' + i];
        if (!v) break;
        items.push(v);
      } else {
        // 다중 필드 패턴 (room-preview-1-img)
        var first = data[group.legacyPrefix + '-' + i + '-' + group.fields[0]];
        if (!first) break;
        var item = {};
        group.fields.forEach(function (f) {
          item[f] = data[group.legacyPrefix + '-' + i + '-' + f] || '';
        });
        items.push(item);
      }
    }
    return items;
  }

  /**
   * 동적 그룹 일괄 렌더링
   * - 컨테이너가 존재할 때만 (페이지에 마커가 있을 때만)
   * - 항목이 0개면 컨테이너 그대로 두기 (기존 HTML 유지)
   */
  function renderDynamicGroups(data) {
    DYNAMIC_GROUPS.forEach(function (group) {
      var container = document.getElementById(group.containerId);
      if (!container) return;
      var items = getGroupItems(data, group);
      if (items.length === 0) return;
      // 기존 자식 모두 제거 후 재렌더
      while (container.firstChild) container.removeChild(container.firstChild);
      items.forEach(function (item, idx) {
        try {
          container.appendChild(group.render(item, idx));
        } catch (e) {
          console.warn('[CMS] render fail', group.arrayKey, idx, e);
        }
      });
    });
  }

  /**
   * Apply CMS data to all data-cms elements on the page
   */
  function applyCmsData(data) {
    if (!data || typeof data !== 'object') return;

    // Render hero slides first
    renderHeroSlides(data);

    // Render dynamic card groups (room/facility/attraction/partner/gallery)
    renderDynamicGroups(data);

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
