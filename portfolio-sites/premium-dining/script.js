/* ===================================================================
   KURO 黒 — Interactions & Animations
   H7 Scroll Zoom | I6 Horizontal Scroll | I8 Text Scrub
   I14 Curtain Reveal | I32 Color Transition | I34 Weight Animation
   N9 Pill Nav | IMG6 Grayscale→Color | B5 Fill Animation
   =================================================================== */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     UTILITY: requestAnimationFrame throttle
     ---------------------------------------------------------- */
  function onScroll(fn) {
    let ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          fn();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ----------------------------------------------------------
     UTILITY: clamp helper
     ---------------------------------------------------------- */
  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  /* ----------------------------------------------------------
     1. HERO: H7 Scroll Zoom
     - Image starts at 75%, scales to 100% on scroll
     - Text fades out
     - Overlay darkens
     ---------------------------------------------------------- */
  function initHeroScrollZoom() {
    var hero = document.querySelector('.hero');
    var img = document.querySelector('.hero__image');
    var overlay = document.querySelector('.hero__overlay');
    var content = document.querySelector('.hero__content');
    var scrollHint = document.querySelector('.hero__scroll');
    if (!hero || !img) return;

    var heroH = hero.offsetHeight;

    onScroll(function () {
      heroH = hero.offsetHeight;
      var scrollY = window.scrollY;
      var progress = clamp(scrollY / heroH, 0, 1);

      // Scale image from 75% to 100%
      var scale = 0.75 + progress * 0.25;
      // Also expand the container from centered to full
      var size = 75 + progress * 25;
      img.style.width = size + '%';
      img.style.height = size + '%';
      img.style.transform = 'scale(' + (1 + progress * 0.05) + ')';

      // Darken overlay
      overlay.style.background = 'rgba(26,26,26,' + (progress * 0.4) + ')';

      // Fade out content
      content.style.opacity = 1 - progress * 2;

      // Fade out scroll hint
      scrollHint.style.opacity = 1 - progress * 3;
    });
  }

  /* ----------------------------------------------------------
     2. PHILOSOPHY: I34 Typography Weight Animation
     - Font weight transitions from 100 to 900 on scroll
     ---------------------------------------------------------- */
  function initWeightAnimation() {
    var el = document.querySelector('[data-weight-animate]');
    if (!el) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          startWeightScroll(el);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.1 });

    observer.observe(el);
  }

  function startWeightScroll(el) {
    function update() {
      var rect = el.getBoundingClientRect();
      var winH = window.innerHeight;
      // progress: 0 when element enters bottom, 1 when at top
      var progress = clamp(1 - rect.top / winH, 0, 1);
      // Weight from 100 to 900
      var weight = Math.round(100 + progress * 800);
      // Snap to nearest valid weight
      weight = Math.round(weight / 100) * 100;
      weight = clamp(weight, 100, 900);
      el.style.fontWeight = weight;
    }
    onScroll(update);
    update();
  }

  /* ----------------------------------------------------------
     3. COURSE: I6 Horizontal Scroll Drag
     - Drag to scroll horizontal track
     - Opacity based on visibility
     ---------------------------------------------------------- */
  function initHorizontalScroll() {
    var track = document.getElementById('courseTrack');
    if (!track) return;

    var isDown = false;
    var startX = 0;
    var scrollLeft = 0;

    track.addEventListener('mousedown', function (e) {
      isDown = true;
      track.style.cursor = 'grabbing';
      startX = e.pageX - track.offsetLeft;
      scrollLeft = track.scrollLeft;
    });

    track.addEventListener('mouseleave', function () {
      isDown = false;
      track.style.cursor = 'grab';
    });

    track.addEventListener('mouseup', function () {
      isDown = false;
      track.style.cursor = 'grab';
    });

    track.addEventListener('mousemove', function (e) {
      if (!isDown) return;
      e.preventDefault();
      var x = e.pageX - track.offsetLeft;
      var walk = (x - startX) * 1.5;
      track.scrollLeft = scrollLeft - walk;
    });

    // Card opacity based on visibility
    function updateCardOpacity() {
      var cards = track.querySelectorAll('.course__card');
      var trackRect = track.getBoundingClientRect();
      var trackCenter = trackRect.left + trackRect.width / 2;

      cards.forEach(function (card) {
        var cardRect = card.getBoundingClientRect();
        var cardCenter = cardRect.left + cardRect.width / 2;
        var distance = Math.abs(trackCenter - cardCenter);
        var maxDist = trackRect.width / 2;
        var opacity = clamp(1 - distance / maxDist * 0.7, 0.3, 1);
        card.style.opacity = opacity;
      });
    }

    track.addEventListener('scroll', updateCardOpacity, { passive: true });
    window.addEventListener('resize', updateCardOpacity);
    updateCardOpacity();
  }

  /* ----------------------------------------------------------
     4. SPACE: I14 Curtain Reveal
     - Burgundy curtains slide away on scroll
     ---------------------------------------------------------- */
  function initCurtainReveal() {
    var items = document.querySelectorAll('.space__item');
    if (!items.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          // Stagger delay based on index
          var delay = Array.from(items).indexOf(entry.target) * 200;
          setTimeout(function () {
            entry.target.classList.add('revealed');
          }, delay);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    items.forEach(function (item) {
      observer.observe(item);
    });
  }

  /* ----------------------------------------------------------
     5. CHEF: I8 Text Scrubbing
     - Words reveal opacity as user scrolls through section
     ---------------------------------------------------------- */
  function initTextScrub() {
    var storyEl = document.getElementById('chefStory');
    if (!storyEl) return;

    // Split text into word spans
    var text = storyEl.textContent.trim();
    var words = text.split(/\s+/);
    storyEl.innerHTML = '';
    words.forEach(function (word, i) {
      var span = document.createElement('span');
      span.className = 'word';
      span.textContent = word;
      storyEl.appendChild(span);
      if (i < words.length - 1) {
        storyEl.appendChild(document.createTextNode(' '));
      }
    });

    var wordEls = storyEl.querySelectorAll('.word');
    var section = document.querySelector('.chef');

    function updateScrub() {
      if (!section) return;
      var rect = section.getBoundingClientRect();
      var winH = window.innerHeight;

      // Progress: 0 when section enters, 1 when section is halfway past
      var sectionProgress = clamp((winH - rect.top) / (winH + rect.height * 0.5), 0, 1);

      wordEls.forEach(function (el, i) {
        var wordProgress = i / wordEls.length;
        // Each word activates based on overall section progress
        if (sectionProgress > wordProgress * 0.8 + 0.1) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });
    }

    onScroll(updateScrub);
    updateScrub();
  }

  /* ----------------------------------------------------------
     6. I32: Scroll Color Transition
     - Background color transitions smoothly between sections
     ---------------------------------------------------------- */
  function initColorTransition() {
    var course = document.querySelector('.course');
    var chef = document.querySelector('.chef');
    if (!course) return;

    // The course section fades from light to dark as it enters view
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        // Handled by CSS background, but we add a class for extra effect
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
        }
      });
    }, { threshold: 0.05 });

    observer.observe(course);
    if (chef) observer.observe(chef);
  }

  /* ----------------------------------------------------------
     7. N9: Pill Navigation
     - Active state tracking on scroll
     - Smooth scroll on click
     ---------------------------------------------------------- */
  function initPillNav() {
    var nav = document.getElementById('pillNav');
    if (!nav) return;

    var links = nav.querySelectorAll('.pill-nav__link');
    var sections = [];

    links.forEach(function (link) {
      var sectionId = link.getAttribute('data-section');
      var section = document.getElementById(sectionId);
      if (section) {
        sections.push({ el: section, link: link, id: sectionId });
      }

      // Smooth scroll on click
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var target = document.getElementById(sectionId);
        if (target) {
          var offset = target.getBoundingClientRect().top + window.scrollY - 40;
          window.scrollTo({ top: offset, behavior: 'smooth' });
        }
      });
    });

    function updateActive() {
      var scrollPos = window.scrollY + window.innerHeight * 0.4;

      var current = null;
      sections.forEach(function (item) {
        if (item.el.offsetTop <= scrollPos) {
          current = item;
        }
      });

      links.forEach(function (link) {
        link.classList.remove('active');
      });

      if (current) {
        current.link.classList.add('active');
      }
    }

    onScroll(updateActive);
    updateActive();

    // Hide nav at very top and very bottom
    onScroll(function () {
      var scrollY = window.scrollY;
      var heroH = document.querySelector('.hero') ? document.querySelector('.hero').offsetHeight : 0;
      var docH = document.documentElement.scrollHeight;
      var winH = window.innerHeight;

      if (scrollY < heroH * 0.5) {
        nav.style.opacity = '0';
        nav.style.pointerEvents = 'none';
      } else if (scrollY + winH > docH - 100) {
        nav.style.opacity = '0';
        nav.style.pointerEvents = 'none';
      } else {
        nav.style.opacity = '1';
        nav.style.pointerEvents = 'auto';
      }
    });

    nav.style.transition = 'opacity 0.4s ease';
    nav.style.opacity = '0';
    nav.style.pointerEvents = 'none';
  }

  /* ----------------------------------------------------------
     8. Fade-in Reveal (general scroll reveal)
     ---------------------------------------------------------- */
  function initScrollReveal() {
    // We use a minimal approach: elements are visible by default
    // Scroll animations are pure CSS class additions via IO
    var fadeEls = document.querySelectorAll('.fade-in');
    if (!fadeEls.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    fadeEls.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ----------------------------------------------------------
     9. PAGE LOADER
     - Shows loading animation then fades out
     ---------------------------------------------------------- */
  function initPageLoader() {
    var loader = document.getElementById('pageLoader');
    if (!loader) return;

    window.addEventListener('load', function () {
      setTimeout(function () {
        loader.classList.add('hidden');
        setTimeout(function () {
          loader.style.display = 'none';
        }, 600);
      }, 800);
    });
  }

  /* ----------------------------------------------------------
     10. SCROLL PROGRESS BAR
     - Shows reading progress at top of page
     ---------------------------------------------------------- */
  function initScrollProgress() {
    var bar = document.getElementById('scrollProgress');
    if (!bar) return;

    onScroll(function () {
      var scrollTop = window.scrollY;
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      bar.style.width = progress + '%';
    });
  }

  /* ----------------------------------------------------------
     11. CUSTOM CURSOR (Desktop only)
     - Follows mouse with slight lag
     - Grows on hoverable elements
     ---------------------------------------------------------- */
  function initCustomCursor() {
    var cursor = document.getElementById('customCursor');
    if (!cursor) return;
    // Only activate on non-touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      cursor.style.display = 'none';
      return;
    }

    document.addEventListener('mousemove', function (e) {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    });

    // Grow cursor on interactive elements
    var hoverEls = document.querySelectorAll('a, button, .course__card, .space__item, .philosophy__image');
    hoverEls.forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        cursor.classList.add('hovering');
      });
      el.addEventListener('mouseleave', function () {
        cursor.classList.remove('hovering');
      });
    });
  }

  /* ----------------------------------------------------------
     12. COURSE PROGRESS DOTS
     - Updates dots based on scroll position in track
     ---------------------------------------------------------- */
  function initCourseProgress() {
    var track = document.getElementById('courseTrack');
    var progressWrap = document.getElementById('courseProgress');
    if (!track || !progressWrap) return;

    var dots = progressWrap.querySelectorAll('.course__progress-dot');
    var cards = track.querySelectorAll('.course__card');
    if (!dots.length || !cards.length) return;

    function update() {
      var trackRect = track.getBoundingClientRect();
      var trackCenter = trackRect.left + trackRect.width / 2;
      var closestIdx = 0;
      var closestDist = Infinity;

      cards.forEach(function (card, i) {
        var cardRect = card.getBoundingClientRect();
        var cardCenter = cardRect.left + cardRect.width / 2;
        var dist = Math.abs(trackCenter - cardCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      });

      dots.forEach(function (dot, i) {
        dot.classList.toggle('active', i === closestIdx);
      });
    }

    track.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ----------------------------------------------------------
     INIT: Run all on DOMContentLoaded
     ---------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    initPageLoader();
    initHeroScrollZoom();
    initWeightAnimation();
    initHorizontalScroll();
    initCurtainReveal();
    initTextScrub();
    initColorTransition();
    initPillNav();
    initScrollReveal();
    initScrollProgress();
    initCustomCursor();
    initCourseProgress();
  });

})();
