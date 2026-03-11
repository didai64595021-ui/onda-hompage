/* ============================================
   법무법인 정의 — Shared JavaScript
   ============================================ */

(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- I31 Page Transition --- */
  const pageTransition = document.createElement('div');
  pageTransition.classList.add('page-transition');
  document.body.appendChild(pageTransition);

  document.addEventListener('click', function (e) {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('tel')) return;
    if (link.target === '_blank') return;
    if (reducedMotion) return;
    e.preventDefault();
    pageTransition.classList.add('active');
    setTimeout(function () {
      window.location.href = href;
    }, 600);
  });

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      pageTransition.classList.remove('active');
    }
  });

  /* --- N7 Minimal Navigation --- */
  const hamburger = document.querySelector('.hamburger');
  const fullscreenMenu = document.querySelector('.fullscreen-menu');
  const nav = document.querySelector('.nav');

  if (hamburger && fullscreenMenu) {
    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('active');
      fullscreenMenu.classList.toggle('active');
      document.body.style.overflow = fullscreenMenu.classList.contains('active') ? 'hidden' : '';
    });

    fullscreenMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        hamburger.classList.remove('active');
        fullscreenMenu.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  /* Nav scroll behavior */
  if (nav) {
    let lastScroll = 0;
    window.addEventListener('scroll', function () {
      const currentScroll = window.pageYOffset;
      if (currentScroll > 80) {
        nav.classList.add('nav--scrolled');
      } else {
        nav.classList.remove('nav--scrolled');
      }
      lastScroll = currentScroll;
    }, { passive: true });
  }

  /* --- I30 Text Scramble --- */
  function scrambleText(element) {
    if (reducedMotion) {
      element.style.opacity = '1';
      return;
    }
    const original = element.textContent;
    const chars = '법정의실현합니다변호사정의로운세상공정한판결권리보호';
    const duration = 1500;
    const startTime = performance.now();
    element.style.opacity = '1';

    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      let result = '';
      for (let i = 0; i < original.length; i++) {
        if (original[i] === ' ') {
          result += ' ';
        } else if (i < original.length * progress) {
          result += original[i];
        } else {
          result += chars[Math.floor(Math.random() * chars.length)];
        }
      }
      element.textContent = result;
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        element.textContent = original;
      }
    }

    requestAnimationFrame(animate);
  }

  document.querySelectorAll('[data-scramble]').forEach(function (el) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          setTimeout(function () {
            scrambleText(entry.target);
          }, 200);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    el.style.opacity = '0';
    observer.observe(el);
  });

  /* --- I8 Text Scrubbing (scroll-based opacity) --- */
  const scrubElements = document.querySelectorAll('.scrub-text');
  if (scrubElements.length > 0 && !reducedMotion) {
    const scrubObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          const ratio = entry.intersectionRatio;
          entry.target.style.opacity = 0.15 + ratio * 0.85;
        }
      });
    }, {
      threshold: Array.from({ length: 20 }, function (_, i) { return i / 19; })
    });
    scrubElements.forEach(function (el) {
      scrubObserver.observe(el);
    });
  }

  /* --- Count-Up Animation --- */
  function animateCounter(element) {
    const target = parseFloat(element.getAttribute('data-count'));
    const suffix = element.getAttribute('data-suffix') || '';
    const prefix = element.getAttribute('data-prefix') || '';
    const isDecimal = String(target).includes('.');
    const duration = 2000;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      if (isDecimal) {
        element.textContent = prefix + current.toFixed(1) + suffix;
      } else {
        element.textContent = prefix + Math.floor(current).toLocaleString() + suffix;
      }

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    if (reducedMotion) {
      if (isDecimal) {
        element.textContent = prefix + target.toFixed(1) + suffix;
      } else {
        element.textContent = prefix + target.toLocaleString() + suffix;
      }
    } else {
      requestAnimationFrame(update);
    }
  }

  document.querySelectorAll('[data-count]').forEach(function (el) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    observer.observe(el);
  });

  /* --- Filter Functionality (cases page) --- */
  const filterBtns = document.querySelectorAll('.filter-btn');
  const filterTargets = document.querySelectorAll('[data-category]');

  if (filterBtns.length > 0) {
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        const filter = btn.getAttribute('data-filter');

        filterTargets.forEach(function (item) {
          if (filter === 'all' || item.getAttribute('data-category') === filter) {
            item.style.display = '';
            item.style.opacity = '0';
            requestAnimationFrame(function () {
              item.style.transition = 'opacity 0.3s ease';
              item.style.opacity = '1';
            });
          } else {
            item.style.opacity = '0';
            setTimeout(function () {
              item.style.display = 'none';
            }, 300);
          }
        });
      });
    });
  }

  /* --- Modal --- */
  const modalOverlay = document.querySelector('.modal-overlay');
  const modalClose = document.querySelector('.modal__close');

  function openModal(data) {
    if (!modalOverlay) return;
    const title = modalOverlay.querySelector('.modal__title');
    const area = modalOverlay.querySelector('.modal__area');
    const overview = modalOverlay.querySelector('.modal__overview');
    const process = modalOverlay.querySelector('.modal__process');
    const result = modalOverlay.querySelector('.modal__result');

    if (title) title.textContent = data.title || '';
    if (area) area.textContent = data.area || '';
    if (overview) overview.textContent = data.overview || '';
    if (process) process.innerHTML = data.process || '';
    if (result) result.textContent = data.result || '';

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (modalClose) {
    modalClose.addEventListener('click', closeModal);
  }

  if (modalOverlay) {
    modalOverlay.addEventListener('click', function (e) {
      if (e.target === modalOverlay) closeModal();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  document.querySelectorAll('[data-modal]').forEach(function (card) {
    card.addEventListener('click', function () {
      const data = {
        title: card.getAttribute('data-title'),
        area: card.getAttribute('data-area'),
        overview: card.getAttribute('data-overview'),
        process: card.getAttribute('data-process'),
        result: card.getAttribute('data-result')
      };
      openModal(data);
    });
  });

  /* --- Reveal on Scroll --- */
  const revealElements = document.querySelectorAll('.reveal');
  if (revealElements.length > 0 && !reducedMotion) {
    const revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    revealElements.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* --- Smooth scroll for anchor links --- */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    });
  });

})();
