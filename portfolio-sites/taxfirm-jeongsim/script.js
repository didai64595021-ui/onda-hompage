/* 세무법인 정심 — interactive layer
   - Nav hide-on-scroll-down
   - Reveal on intersect
   - Counters (hero + stats + ring)
   - Hero rotator (typing)
   - Marquee duplicate
   - FAQ accordion
   - Scroll progress
*/
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* Nav hide */
  const nav = $('.nav');
  if (nav) {
    let lastY = 0;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > 180 && y > lastY + 4) nav.classList.add('is-hidden');
      else if (y < lastY - 4) nav.classList.remove('is-hidden');
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* Mobile menu */
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

  /* Scroll progress */
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

  /* Reveal IO */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  $$('.reveal, .reveal-mask').forEach(el => io.observe(el));

  /* Counters */
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = parseFloat(el.dataset.count || '0');
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      const start = performance.now();
      const dur = 1700;
      const step = (t) => {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (target * eased).toLocaleString('en-US', {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals
        });
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      countIO.unobserve(el);
    });
  }, { threshold: 0.35 });
  $$('[data-count]').forEach(el => countIO.observe(el));

  /* Radial ring fill */
  const ringIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = parseFloat(el.dataset.p || '0');
      let cur = 0;
      const dur = 1700;
      const start = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        cur = target * eased;
        el.style.setProperty('--p', cur.toFixed(1));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      ringIO.unobserve(el);
    });
  }, { threshold: 0.35 });
  $$('.ring[data-p]').forEach(el => ringIO.observe(el));

  /* Hero rotator — "Ctrl-style" cycling keyword */
  const rot = $('.rotator');
  if (rot && rot.dataset.words) {
    const words = rot.dataset.words.split('|');
    let i = 0;
    let cur = words[0];
    let phase = 'hold'; // typing | deleting | hold
    let idx = cur.length;
    const typeSpeed = 70;
    const deleteSpeed = 42;
    const holdTime = 1800;
    let lastT = performance.now();
    const loop = (t) => {
      const dt = t - lastT;
      if (phase === 'hold' && dt > holdTime) {
        phase = 'deleting';
        lastT = t;
      } else if (phase === 'deleting' && dt > deleteSpeed) {
        idx = Math.max(0, idx - 1);
        rot.textContent = cur.slice(0, idx) || ' ';
        if (idx === 0) {
          i = (i + 1) % words.length;
          cur = words[i];
          phase = 'typing';
        }
        lastT = t;
      } else if (phase === 'typing' && dt > typeSpeed) {
        idx = Math.min(cur.length, idx + 1);
        rot.textContent = cur.slice(0, idx);
        if (idx === cur.length) phase = 'hold';
        lastT = t;
      }
      requestAnimationFrame(loop);
    };
    rot.textContent = cur;
    requestAnimationFrame(loop);
  }

  /* Marquee duplicate */
  $$('.band-track').forEach(track => {
    const clone = track.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.parentNode.appendChild(clone);
  });

  /* FAQ accordion */
  $$('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      item.classList.toggle('is-open');
    });
  });

  /* Year text */
  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
})();
