/* dnbestup-clone — Lightweight interactions */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Mobile menu toggle
  const toggle = $('.menu-toggle');
  const nav = $('.nav-list');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    $$('.nav-list a').forEach((a) =>
      a.addEventListener('click', () => {
        nav.classList.remove('is-open');
        document.body.style.overflow = '';
      })
    );
  }

  // Header shadow on scroll
  const header = $('.site-header');
  if (header) {
    const onScroll = () => {
      if (window.scrollY > 12) header.style.boxShadow = '0 4px 20px -10px rgba(27,58,87,.18)';
      else header.style.boxShadow = '';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Reveal on scroll
  const io = ('IntersectionObserver' in window)
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('is-in');
              io.unobserve(e.target);
            }
          });
        },
        { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
      )
    : null;
  if (io) {
    $$('.cat-card, .product-card, .tip-card, .review-card, .cta-band, .hero-text, .hero-visual')
      .forEach((el) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(14px)';
        el.style.transition = 'opacity .7s var(--ease-out), transform .7s var(--ease-out)';
        io.observe(el);
      });
    const obs = new MutationObserver(() => {});
    obs.disconnect();
    document.addEventListener(
      'transitionend',
      () => {},
      { once: true, passive: true }
    );
    const styleTag = document.createElement('style');
    styleTag.textContent = '.is-in{opacity:1 !important;transform:none !important}';
    document.head.appendChild(styleTag);
  }

  // Smooth anchor: nothing extra needed (CSS scroll-behavior: smooth)
})();
