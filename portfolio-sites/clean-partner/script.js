/* ============================================================
   클린파트너 세탁공장 — script.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initHeroSlider();
  initTabs();
  initAccordion();
  initCounters();
  initScrollReveal();
  initMobileDrawer();
  initModals();
  initQuoteForm();
  loadCMSData();
});

/* ============================================================
   HEADER — 스크롤 시 배경 변경
   ============================================================ */
function initHeader() {
  const header = document.querySelector('.header');
  if (!header) return;
  const check = () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', check, { passive: true });
  check();
}

/* ============================================================
   HERO SLIDER — 배경 슬라이드
   ============================================================ */
function initHeroSlider() {
  const slides = document.querySelectorAll('.hero-slide');
  const indicators = document.querySelectorAll('.hero-indicators button');
  if (slides.length < 2) return;

  let current = 0;
  let interval;

  function goTo(idx) {
    slides[current].classList.remove('active');
    if (indicators[current]) indicators[current].classList.remove('active');
    current = idx % slides.length;
    slides[current].classList.add('active');
    if (indicators[current]) indicators[current].classList.add('active');
  }

  function next() { goTo(current + 1); }

  function startAuto() {
    interval = setInterval(next, 4500);
  }

  indicators.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      clearInterval(interval);
      goTo(i);
      startAuto();
    });
  });

  startAuto();
}

/* ============================================================
   TABS (I4)
   ============================================================ */
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  if (!tabBtns.length) return;

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(target);
      if (panel) panel.classList.add('active');
    });
  });
}

/* ============================================================
   ACCORDION (I8)
   ============================================================ */
function initAccordion() {
  const headers = document.querySelectorAll('.accordion-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const body = item.querySelector('.accordion-body');
      const isOpen = item.classList.contains('open');

      // Close all in same accordion
      const accordion = item.closest('.accordion');
      if (accordion) {
        accordion.querySelectorAll('.accordion-item.open').forEach(openItem => {
          openItem.classList.remove('open');
          openItem.querySelector('.accordion-body').style.maxHeight = '0';
        });
      }

      if (!isOpen) {
        item.classList.add('open');
        body.style.maxHeight = body.scrollHeight + 'px';
      }
    });
  });
}

/* ============================================================
   COUNTER (I7) — 카운트업 애니메이션
   ============================================================ */
function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  counters.forEach(el => observer.observe(el));
}

function animateCounter(el) {
  const target = parseInt(el.dataset.count, 10);
  const suffix = el.dataset.suffix || '';
  const duration = 2000;
  const start = performance.now();

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(eased * target);
    el.textContent = value.toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* ============================================================
   SCROLL REVEAL — IntersectionObserver
   ============================================================ */
function initScrollReveal() {
  document.body.classList.add('js-scroll-reveal');

  const elements = document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right, .fade-in-scale');
  if (!elements.length) return;

  // Above-fold: reveal immediately
  const viewH = window.innerHeight;
  elements.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < viewH) {
      el.classList.add('revealed');
    }
  });

  // Below-fold: IO
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  elements.forEach(el => {
    if (!el.classList.contains('revealed')) {
      observer.observe(el);
    }
  });
}

/* ============================================================
   MOBILE DRAWER
   ============================================================ */
function initMobileDrawer() {
  const hamburger = document.querySelector('.hamburger');
  const drawer = document.querySelector('.mobile-drawer');
  const overlay = document.querySelector('.drawer-overlay');
  if (!hamburger || !drawer) return;

  function toggle() {
    hamburger.classList.toggle('active');
    drawer.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
    document.body.style.overflow = drawer.classList.contains('open') ? 'hidden' : '';
  }

  hamburger.addEventListener('click', toggle);
  if (overlay) overlay.addEventListener('click', toggle);

  drawer.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (drawer.classList.contains('open')) toggle();
    });
  });
}

/* ============================================================
   MODALS (I10)
   ============================================================ */
function initModals() {
  // Quote modal
  const quoteTriggers = document.querySelectorAll('[data-modal="quote"]');
  const quoteModal = document.getElementById('quoteModal');

  quoteTriggers.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (quoteModal) quoteModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  });

  // Close modals
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('modal-close')) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  });

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-overlay').classList.remove('active');
      document.body.style.overflow = '';
    });
  });

  // ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => {
        m.classList.remove('active');
      });
      document.body.style.overflow = '';
    }
  });
}

/* ============================================================
   QUOTE FORM — 제출 처리
   ============================================================ */
function initQuoteForm() {
  // Modal form
  const modalForm = document.getElementById('modalQuoteForm');
  if (modalForm) {
    modalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleFormSubmit(modalForm);
    });
  }

  // Page form
  const pageForm = document.getElementById('pageQuoteForm');
  if (pageForm) {
    pageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleFormSubmit(pageForm);
    });
  }
}

function handleFormSubmit(form) {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);
  const submitBtn = form.querySelector('.btn-submit');

  // Show success helper
  const successEl = form.closest('.modal') ?
    form.closest('.modal').querySelector('.modal-success') :
    document.getElementById('formSuccess');

  function showSuccess() {
    if (successEl) {
      form.style.display = 'none';
      successEl.style.display = 'block';
    }
    setTimeout(() => {
      form.reset();
      form.style.display = '';
      if (successEl) successEl.style.display = 'none';
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '견적 요청하기'; }
      const overlay = form.closest('.modal-overlay');
      if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    }, 3000);
  }

  function showError(msg) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '견적 요청하기'; }
    alert(msg || '전송에 실패했습니다. 전화(010-8892-3736)로 문의해 주세요.');
  }

  // Disable button during submit
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '전송 중...'; }

  // Send via FormSubmit.co (replace email below with actual business email)
  const FORM_EMAIL = 'clean-partner@ondamarketing.com';
  const payload = new FormData();
  payload.append('name', data.name || '');
  payload.append('phone', data.phone || '');
  payload.append('company', data.company || '');
  payload.append('email', data.email || '');
  payload.append('industry', data.industry || '');
  payload.append('volume', data.volume || '');
  payload.append('message', data.message || '');
  payload.append('_subject', '[클린파트너] 새 견적 문의');
  payload.append('_captcha', 'false');
  payload.append('_template', 'table');

  fetch('https://formsubmit.co/ajax/' + FORM_EMAIL, {
    method: 'POST',
    body: payload,
  })
    .then(r => r.json())
    .then(result => {
      if (result.success) {
        showSuccess();
      } else {
        showError();
      }
    })
    .catch(() => {
      // Fallback: still show success to user, open mailto as backup
      const subject = encodeURIComponent('[클린파트너] 견적 문의');
      const body = encodeURIComponent(
        '이름: ' + (data.name || '') + '\n' +
        '연락처: ' + (data.phone || '') + '\n' +
        '업체명: ' + (data.company || '') + '\n' +
        '업종: ' + (data.industry || '') + '\n' +
        '문의내용: ' + (data.message || '')
      );
      window.location.href = 'mailto:' + FORM_EMAIL + '?subject=' + subject + '&body=' + body;
      showSuccess();
    });
}

/* ============================================================
   CMS DATA LOAD
   ============================================================ */
const CMS_SITE_ID = 'clean-partner';
const CMS_API = 'https://onda-cms-api.onda-workers.workers.dev';

function loadCMSData() {
  // 1. Load from localStorage immediately
  const local = localStorage.getItem(`cms-${CMS_SITE_ID}`);
  if (local) {
    try {
      applyCMSData(JSON.parse(local));
    } catch (e) { /* ignore */ }
  }

  // 2. Fetch from KV
  fetch(`${CMS_API}/?site=${CMS_SITE_ID}`, { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data) {
        try {
          localStorage.setItem(`cms-${CMS_SITE_ID}`, JSON.stringify(data));
        } catch (e) { /* localStorage full */ }
        applyCMSData(data);
      }
    })
    .catch(() => { /* offline fallback to localStorage */ });
}

function applyCMSData(data) {
  if (!data) return;
  document.querySelectorAll('[data-cms]').forEach(el => {
    const key = el.dataset.cms;
    if (data[key] === undefined || data[key] === '') return;

    if (el.tagName === 'IMG') {
      let src = data[key];
      if (src && src.indexOf('data:') !== 0) {
        src += (src.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now();
      }
      el.src = src;
    } else if (el.tagName === 'A' && el.hasAttribute('href')) {
      if (key.includes('tel')) {
        el.href = 'tel:' + data[key].replace(/[^0-9+]/g, '');
        el.textContent = data[key];
      } else if (key.includes('kakao')) {
        el.href = data[key];
      } else {
        el.textContent = data[key];
      }
    } else {
      el.textContent = data[key];
    }
  });

  // Update all tel links
  if (data.phone) {
    document.querySelectorAll('a[href^="tel:"]').forEach(a => {
      a.href = 'tel:' + data.phone.replace(/[^0-9+]/g, '');
    });
  }
}
