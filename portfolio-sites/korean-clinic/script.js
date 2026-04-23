/* ============================================
   경락당(經絡堂) — Script
   Interactions: Parallax, Accordion, Sticky,
   Scroll Reveal, Progress Circles, Nav
   ============================================ */

(function () {
  'use strict';

  /* ---- Loader ---- */
  const loader = document.getElementById('loader');
  window.addEventListener('load', function () {
    setTimeout(function () {
      loader.classList.add('hidden');
    }, 1600);
  });

  /* ---- Navigation ---- */
  const nav = document.getElementById('nav');
  const navToggle = document.getElementById('navToggle');
  const navOverlay = document.getElementById('navOverlay');
  const navLinks = document.querySelectorAll('[data-nav-link]');

  // Hamburger toggle
  navToggle.addEventListener('click', function () {
    navToggle.classList.toggle('active');
    navOverlay.classList.toggle('active');
    document.body.style.overflow = navOverlay.classList.contains('active') ? 'hidden' : '';
  });

  // Close menu on link click
  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      navToggle.classList.remove('active');
      navOverlay.classList.remove('active');
      document.body.style.overflow = '';
    });
  });

  // Nav scroll effect
  var lastScrollY = 0;
  function handleNavScroll() {
    var scrollY = window.scrollY || window.pageYOffset;
    if (scrollY > 60) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
    lastScrollY = scrollY;
  }

  /* ---- Hero Parallax (I4) — Mouse move ---- */
  var heroImages = document.getElementById('heroImages');
  var parallaxItems = document.querySelectorAll('[data-parallax]');

  function handleMouseParallax(e) {
    if (window.innerWidth < 768) return; // Skip on mobile
    var centerX = window.innerWidth / 2;
    var centerY = window.innerHeight / 2;
    var moveX = (e.clientX - centerX) / centerX;
    var moveY = (e.clientY - centerY) / centerY;

    parallaxItems.forEach(function (item) {
      var speed = parseFloat(item.getAttribute('data-parallax')) || 0;
      var x = moveX * speed * 100;
      var y = moveY * speed * 100;
      item.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    });
  }

  // Only apply mouse parallax to hero images on desktop
  if (window.innerWidth >= 768) {
    document.addEventListener('mousemove', handleMouseParallax);
  }

  /* ---- Scroll Parallax for Space images (I4) ---- */
  var spaceItems = document.querySelectorAll('.space__item[data-parallax]');

  function handleScrollParallax() {
    if (window.innerWidth < 768) return;
    var scrollY = window.scrollY || window.pageYOffset;

    spaceItems.forEach(function (item) {
      var speed = parseFloat(item.getAttribute('data-parallax')) || 0;
      var rect = item.getBoundingClientRect();
      var offset = rect.top + scrollY - window.innerHeight / 2;
      var y = (scrollY - offset) * speed * 0.5;
      item.style.transform = 'translateY(' + y + 'px)';
    });
  }

  /* ---- Philosophy: Sticky color change (I27) ---- */
  var philosophyBigText = document.getElementById('philosophyBigText');
  var philosophyBlocks = document.querySelectorAll('[data-philosophy]');

  function handlePhilosophyScroll() {
    if (!philosophyBigText) return;

    var anyVisible = false;
    philosophyBlocks.forEach(function (block) {
      var rect = block.getBoundingClientRect();
      var inView = rect.top < window.innerHeight * 0.6 && rect.bottom > window.innerHeight * 0.3;
      if (inView) anyVisible = true;
    });

    if (anyVisible) {
      philosophyBigText.classList.add('active');
    } else {
      philosophyBigText.classList.remove('active');
    }
  }

  /* ---- Treatment Accordion (I28) ---- */
  var accordionItems = document.querySelectorAll('.accordion-item');
  var treatmentImages = document.querySelectorAll('[data-treatment-img]');

  function setActiveAccordion(index) {
    accordionItems.forEach(function (item, i) {
      var isActive = i === index;
      item.classList.toggle('active', isActive);
      var header = item.querySelector('.accordion-header');
      if (header) header.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    });

    // Switch treatment image
    treatmentImages.forEach(function (img, i) {
      img.classList.toggle('active', i === index);
    });

    // Animate progress circle for active item
    var activeItem = accordionItems[index];
    if (activeItem) {
      var circle = activeItem.querySelector('.progress-circle__fill');
      var progressData = activeItem.querySelector('.progress-circle');
      if (circle && progressData) {
        var progress = parseInt(progressData.getAttribute('data-progress')) || 0;
        var circumference = 2 * Math.PI * 22; // r=22
        var offset = circumference - (progress / 100) * circumference;
        circle.style.strokeDasharray = circumference;
        circle.style.strokeDashoffset = offset;
      }
    }
  }

  accordionItems.forEach(function (item, index) {
    var header = item.querySelector('.accordion-header');
    header.addEventListener('click', function () {
      setActiveAccordion(index);
    });
  });

  // Initialize first accordion
  setActiveAccordion(0);

  /* ---- Progress Circles (I17) ---- */
  var progressCircles = document.querySelectorAll('.progress-circle');
  var progressObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var el = entry.target;
        var fill = el.querySelector('.progress-circle__fill');
        var progress = parseInt(el.getAttribute('data-progress')) || 0;
        var circumference = 2 * Math.PI * 22;
        var offset = circumference - (progress / 100) * circumference;

        // Small delay for animation effect
        setTimeout(function () {
          fill.style.strokeDasharray = circumference;
          fill.style.strokeDashoffset = offset;
        }, 200);

        progressObserver.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  progressCircles.forEach(function (circle) {
    progressObserver.observe(circle);
  });

  /* ---- Scroll Reveal ---- */
  document.body.classList.add('js-scroll-reveal');

  var revealElements = document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right, .fade-in-scale');

  // Immediately reveal above-fold elements
  revealElements.forEach(function (el) {
    var rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      el.classList.add('revealed');
    }
  });

  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  revealElements.forEach(function (el) {
    if (!el.classList.contains('revealed')) {
      revealObserver.observe(el);
    }
  });

  /* ---- Unified Scroll Handler ---- */
  var ticking = false;

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(function () {
        handleNavScroll();
        handlePhilosophyScroll();
        handleScrollParallax();
        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  // Initial call
  handleNavScroll();
  handlePhilosophyScroll();

  /* ---- Smooth scroll for anchor links ---- */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId === '#') return;
      var target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        var offsetTop = target.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }
    });
  });

  /* ---- Resize handler ---- */
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      // Re-check parallax capability
      if (window.innerWidth < 768) {
        parallaxItems.forEach(function (item) {
          item.style.transform = '';
        });
        spaceItems.forEach(function (item) {
          item.style.transform = '';
        });
      }
    }, 250);
  });

})();
