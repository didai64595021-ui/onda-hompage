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

  // No JS-driven reveal animation — content is always rendered visible.
  // CSS handles any subtle entrance effects without hiding content.
})();
