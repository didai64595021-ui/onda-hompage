/* ========================================
   AP Movement — Main Scripts
   ======================================== */

(function () {
  'use strict';

  /* ---------- 1. js-loaded ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('js-loaded');
    initScrollReveal();
    initCounters();
    initMobileNav();
    initNavScroll();
    initSmoothScroll();
    initMarqueeDuplicate();
  });

  /* ---------- 2. Scroll Reveal (IntersectionObserver) ---------- */
  function initScrollReveal() {
    const els = document.querySelectorAll('.fade-in');
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    els.forEach((el) => observer.observe(el));
  }

  /* ---------- 3. Counter Animation ---------- */
  function initCounters() {
    const counters = document.querySelectorAll('.counter-card__number');
    if (!counters.length) return;

    const duration = 2000;

    function easeOutExpo(t) {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function animateCounter(el) {
      const target = parseInt(el.getAttribute('data-target'), 10);
      if (isNaN(target)) return;
      const start = performance.now();

      function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const value = Math.round(easeOutExpo(progress) * target);
        el.textContent = value.toLocaleString();
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          el.textContent = target.toLocaleString();
        }
      }

      requestAnimationFrame(tick);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    counters.forEach((c) => observer.observe(c));
  }

  /* ---------- 4. Mobile Navigation ---------- */
  function initMobileNav() {
    const hamburger = document.querySelector('.nav__hamburger');
    const navMenu = document.querySelector('.nav__mobile-menu');
    if (!hamburger || !navMenu) return;

    hamburger.addEventListener('click', () => {
      const isOpen = navMenu.classList.toggle('open');
      hamburger.classList.toggle('active', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    navMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('open');
        hamburger.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  /* ---------- 5. Nav Scroll Effect ---------- */
  function initNavScroll() {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    let ticking = false;

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (window.scrollY > 50) {
            nav.classList.add('scrolled');
          } else {
            nav.classList.remove('scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // check on load
  }

  /* ---------- 6. Smooth Scroll ---------- */
  function initSmoothScroll() {
    const nav = document.querySelector('.nav');
    const navHeight = nav ? nav.offsetHeight : 0;

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        const id = anchor.getAttribute('href');
        if (!id || id === '#') return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();

        const top = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });
  }

  /* ---------- 7. Marquee Duplicate ---------- */
  function initMarqueeDuplicate() {
    document.querySelectorAll('.marquee-track').forEach((track) => {
      const children = Array.from(track.children);
      if (!children.length) return;
      // Clone all children once to guarantee seamless loop
      children.forEach((child) => {
        const clone = child.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
      });
    });
  }
})();
