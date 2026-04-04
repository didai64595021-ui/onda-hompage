/* ============================================
   AP MOVEMENT v2 — scripts.js
   오로라 에디토리얼 에이전시
   
   Features:
   1. js-scroll-reveal + IntersectionObserver
   2. Counter animation (data-target)
   3. Mobile nav (hamburger + mobile menu)
   4. Nav scroll (.scrolled)
   5. Smooth scroll (anchor links)
   6. Marquee clone for infinite loop
   7. Accordion (click toggle)
   8. Blog filter (tab → data-category)
   9. Roadmap progress bar (data-width)
   10. Gallery drag scroll
   ============================================ */

(function () {
  'use strict';

  /* ------------------------------------------ */
  /* 1. JS-LOADED & SCROLL REVEAL               */
  /* ------------------------------------------ */
  document.body.classList.add('js-scroll-reveal');

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px',
    }
  );

  function initReveal() {
    const fadeEls = document.querySelectorAll('.fade-in');
    fadeEls.forEach((el) => {
      revealObserver.observe(el);
    });
  }

  /* ------------------------------------------ */
  /* 2. COUNTER ANIMATION                       */
  /* ------------------------------------------ */
  function animateCounter(el) {
    const target = parseInt(el.getAttribute('data-target'), 10);
    if (isNaN(target)) return;

    const duration = 2000;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);
      el.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = target;
      }
    }

    requestAnimationFrame(update);
  }

  function initCounters() {
    const counters = document.querySelectorAll('[data-target]');
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach((counter) => {
      counterObserver.observe(counter);
    });
  }

  /* ------------------------------------------ */
  /* 3. MOBILE NAVIGATION                       */
  /* ------------------------------------------ */
  function initMobileNav() {
    const hamburger = document.getElementById('navHamburger');
    const mobileMenu = document.getElementById('navMobileMenu');
    if (!hamburger || !mobileMenu) return;

    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      mobileMenu.classList.toggle('open');
      document.body.style.overflow = mobileMenu.classList.contains('open')
        ? 'hidden'
        : '';
    });

    // Close menu on link click
    const mobileLinks = mobileMenu.querySelectorAll('.nav__mobile-link');
    mobileLinks.forEach((link) => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  /* ------------------------------------------ */
  /* 4. NAV SCROLL EFFECT                       */
  /* ------------------------------------------ */
  function initNavScroll() {
    const nav = document.getElementById('nav');
    if (!nav) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (window.scrollY > 80) {
            nav.classList.add('scrolled');
          } else {
            nav.classList.remove('scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  /* ------------------------------------------ */
  /* 5. SMOOTH SCROLL                           */
  /* ------------------------------------------ */
  function initSmoothScroll() {
    const anchors = document.querySelectorAll('a[href^="#"]');
    anchors.forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        const targetId = anchor.getAttribute('href');
        if (targetId === '#') return;
        const targetEl = document.querySelector(targetId);
        if (!targetEl) return;
        e.preventDefault();
        const navHeight = document.getElementById('nav')?.offsetHeight || 0;
        const targetPosition =
          targetEl.getBoundingClientRect().top + window.scrollY - navHeight;
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth',
        });
      });
    });
  }

  /* ------------------------------------------ */
  /* 6. MARQUEE CLONE                           */
  /* ------------------------------------------ */
  function initMarquee() {
    const track = document.getElementById('marqueeTrack');
    if (!track) return;
    const content = track.querySelector('.marquee__content');
    if (!content) return;

    // Clone the content for seamless loop
    const clone = content.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
  }

  /* ------------------------------------------ */
  /* 7. ACCORDION                               */
  /* ------------------------------------------ */
  function initAccordion() {
    const items = document.querySelectorAll('.accordion__item');
    if (!items.length) return;

    items.forEach((item) => {
      const header = item.querySelector('.accordion__header');
      if (!header) return;

      header.addEventListener('click', () => {
        const isActive = item.classList.contains('active');

        // Close all items
        items.forEach((i) => {
          i.classList.remove('active');
          const btn = i.querySelector('.accordion__header');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        });

        // Open clicked item if it was closed
        if (!isActive) {
          item.classList.add('active');
          header.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  /* ------------------------------------------ */
  /* 8. BLOG FILTER                             */
  /* ------------------------------------------ */
  function initBlogFilter() {
    const filters = document.querySelectorAll('.blog__filter');
    const cards = document.querySelectorAll('.blog__card');
    if (!filters.length || !cards.length) return;

    filters.forEach((filter) => {
      filter.addEventListener('click', () => {
        // Remove active from all
        filters.forEach((f) => f.classList.remove('active'));
        filter.classList.add('active');

        const category = filter.getAttribute('data-filter');

        cards.forEach((card) => {
          if (category === 'all') {
            card.classList.remove('hidden');
          } else {
            const cardCategory = card.getAttribute('data-category');
            if (cardCategory === category) {
              card.classList.remove('hidden');
            } else {
              card.classList.add('hidden');
            }
          }
        });
      });
    });
  }

  /* ------------------------------------------ */
  /* 9. ROADMAP PROGRESS BAR                    */
  /* ------------------------------------------ */
  function initRoadmapBars() {
    const bars = document.querySelectorAll('.roadmap__bar[data-width]');
    if (!bars.length) return;

    const barObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const targetWidth = entry.target.getAttribute('data-width');
            entry.target.style.width = targetWidth + '%';
            barObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );

    bars.forEach((bar) => {
      barObserver.observe(bar);
    });
  }

  /* ------------------------------------------ */
  /* 10. GALLERY DRAG SCROLL                    */
  /* ------------------------------------------ */
  function initDragScroll(selector) {
    const el = document.querySelector(selector);
    if (!el) return;

    let isDown = false;
    let startX;
    let scrollLeft;

    el.addEventListener('mousedown', (e) => {
      isDown = true;
      el.style.cursor = 'grabbing';
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    });

    el.addEventListener('mouseleave', () => {
      isDown = false;
      el.style.cursor = '';
    });

    el.addEventListener('mouseup', () => {
      isDown = false;
      el.style.cursor = '';
    });

    el.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 2;
      el.scrollLeft = scrollLeft - walk;
    });
  }

  /* ------------------------------------------ */
  /* INIT ALL                                   */
  /* ------------------------------------------ */
  function init() {
    initReveal();
    initCounters();
    initMobileNav();
    initNavScroll();
    initSmoothScroll();
    initMarquee();
    initAccordion();
    initBlogFilter();
    initRoadmapBars();
    initDragScroll('#galleryScroll');
    initDragScroll('.services__track');
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
