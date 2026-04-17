/* 법무법인 서정 — interactive layer
   - Custom cursor (dot + ring lerp)
   - Preloader (count-up mask reveal)
   - Nav hide/show on scroll direction + blur
   - Reveal on intersection (fade + mask)
   - Counter numbers
   - Marquee clone
   - Scroll progress bar
   - Magnetic CTA
*/
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- Preloader ---------- */
  const preloader = $('.preloader');
  if (preloader) {
    const counter = $('.preloader-count');
    let n = 0;
    const dur = 1400;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      n = Math.round(eased * 100);
      counter.textContent = String(n).padStart(3, '0');
      if (p < 1) requestAnimationFrame(tick);
      else setTimeout(() => preloader.classList.add('is-done'), 200);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- Custom cursor ---------- */
  const dot = $('.cursor-dot');
  const ring = $('.cursor-ring');
  if (dot && ring && window.matchMedia('(pointer: fine)').matches) {
    let mx = innerWidth / 2, my = innerHeight / 2;
    let dx = mx, dy = my, rx = mx, ry = my;
    window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
    const loop = () => {
      dx += (mx - dx) * 0.6;
      dy += (my - dy) * 0.6;
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.transform = `translate(${dx}px, ${dy}px) translate(-50%, -50%)`;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    };
    loop();
    const hoverables = 'a, button, .practice-card, .case-item, .attorney-item, .btn-arrow, .btn-solid';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(hoverables)) document.body.classList.add('cursor-hover');
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(hoverables)) document.body.classList.remove('cursor-hover');
    });
  }

  /* ---------- Nav hide/show + scroll class ---------- */
  const nav = $('.nav');
  if (nav) {
    let lastY = 0;
    const onScroll = () => {
      const y = window.scrollY;
      nav.classList.toggle('is-scrolled', y > 40);
      if (y > 180 && y > lastY + 4) nav.classList.add('is-hidden');
      else if (y < lastY - 4) nav.classList.remove('is-hidden');
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Mobile menu ---------- */
  const burger = $('.nav-burger');
  const overlay = $('.nav-overlay');
  if (burger && overlay) {
    burger.addEventListener('click', () => {
      burger.classList.toggle('is-open');
      overlay.classList.toggle('is-open');
      document.body.style.overflow = overlay.classList.contains('is-open') ? 'hidden' : '';
    });
    $$('.nav-overlay a').forEach(a => a.addEventListener('click', () => {
      burger.classList.remove('is-open');
      overlay.classList.remove('is-open');
      document.body.style.overflow = '';
    }));
  }

  /* ---------- Scroll progress ---------- */
  const progress = $('.scroll-progress');
  if (progress) {
    const onP = () => {
      const h = document.documentElement;
      const ratio = h.scrollTop / Math.max(1, (h.scrollHeight - h.clientHeight));
      progress.style.width = `${Math.min(100, ratio * 100)}%`;
    };
    window.addEventListener('scroll', onP, { passive: true });
    onP();
  }

  /* ---------- Reveal on intersect ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  $$('.reveal, .reveal-mask').forEach(el => io.observe(el));

  /* ---------- Counters ---------- */
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = parseFloat(el.dataset.count || '0');
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      const suffix = el.dataset.suffix || '';
      const start = performance.now();
      const dur = 1600;
      const step = (t) => {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = target * eased;
        el.firstChild && el.firstChild.nodeType === 3
          ? el.firstChild.textContent = v.toFixed(decimals) + suffix
          : (el.textContent = v.toFixed(decimals) + suffix);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      countIO.unobserve(el);
    });
  }, { threshold: 0.4 });
  $$('[data-count]').forEach(el => countIO.observe(el));

  /* ---------- Marquee — duplicate track for seamless loop ---------- */
  $$('.marquee-track').forEach(track => {
    const clone = track.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.parentNode.appendChild(clone);
  });

  /* ---------- Magnetic effect on CTA ---------- */
  $$('.btn-solid, .nav-cta').forEach(btn => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      btn.style.transform = `translate(${x * 0.22}px, ${y * 0.22}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });

  /* ---------- Headline character split for mask reveal ---------- */
  $$('[data-split]').forEach(el => {
    const raw = el.textContent;
    el.textContent = '';
    raw.split('\n').forEach((line, i) => {
      const lineEl = document.createElement('span');
      lineEl.className = 'reveal-mask is-visible-ready';
      lineEl.style.setProperty('--delay', `${i * 140}ms`);
      const inner = document.createElement('span');
      inner.textContent = line;
      lineEl.appendChild(inner);
      el.appendChild(lineEl);
      if (i < raw.split('\n').length - 1) el.appendChild(document.createElement('br'));
    });
    setTimeout(() => $$('.reveal-mask', el).forEach(n => n.classList.add('is-visible')), 1600);
  });

  /* ---------- Year text ---------- */
  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

})();
