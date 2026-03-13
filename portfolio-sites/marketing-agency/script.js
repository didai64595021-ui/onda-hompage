/* ============================================================
   DIGITAL MARKETING AGENCY — Global JavaScript
   Navigation, Mobile Menu, Scroll Reveal, Counter, Carousel
   ============================================================ */

(function () {
  'use strict';

  /* ─── DOM Ready ─── */
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    initNavigation();
    initMobileMenu();
    initScrollReveal();
    initCounters();
    initTestimonialCarousel();
    initFAQ();
    initPortfolioFilter();
    initHeroSlideshow();
    initSmoothScroll();
    initNewsletterForm();
    initContactForm();
    initMarquee();
  }

  /* ─── Navigation (fixed, blur, scrolled shadow) ─── */
  function initNavigation() {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    let lastScroll = 0;
    const threshold = 10;

    function onScroll() {
      const currentScroll = window.pageYOffset;

      // Add scrolled class
      if (currentScroll > 50) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }

      // Active link highlighting
      updateActiveLink();

      lastScroll = currentScroll;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // Initial check
  }

  function updateActiveLink() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav__link');
    const scrollPos = window.pageYOffset + 200;

    sections.forEach(section => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      const id = section.getAttribute('id');

      if (scrollPos >= top && scrollPos < top + height) {
        navLinks.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          }
        });
      }
    });
  }

  /* ─── Mobile Menu (hamburger → fullscreen) ─── */
  function initMobileMenu() {
    const hamburger = document.querySelector('.nav__hamburger');
    const mobileMenu = document.querySelector('.nav__mobile');
    const mobileLinks = document.querySelectorAll('.nav__mobile-link');

    if (!hamburger || !mobileMenu) return;

    hamburger.addEventListener('click', toggleMenu);

    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        closeMenu();
      });
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
        closeMenu();
      }
    });

    function toggleMenu() {
      hamburger.classList.toggle('active');
      mobileMenu.classList.toggle('active');
      document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
    }

    function closeMenu() {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  /* ─── Scroll Reveal ─── */
  function initScrollReveal() {
    const elements = document.querySelectorAll('.reveal, .reveal-stagger');
    if (!elements.length) return;

    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -80px 0px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    elements.forEach(el => observer.observe(el));
  }

  /* ─── Counter Animation ─── */
  function initCounters() {
    const counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    const observerOptions = {
      threshold: 0.5
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    counters.forEach(counter => observer.observe(counter));
  }

  function animateCounter(element) {
    const target = parseInt(element.getAttribute('data-count'), 10);
    const suffix = element.getAttribute('data-suffix') || '';
    const prefix = element.getAttribute('data-prefix') || '';
    const duration = 2000;
    const startTime = performance.now();
    const startValue = 0;

    function easeOutQuart(t) {
      return 1 - Math.pow(1 - t, 4);
    }

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutQuart(progress);
      const currentValue = Math.floor(startValue + (target - startValue) * easedProgress);

      element.textContent = prefix + currentValue.toLocaleString() + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  /* ─── Testimonial Carousel ─── */
  function initTestimonialCarousel() {
    const carousel = document.querySelector('.testimonial-carousel');
    if (!carousel) return;

    const track = carousel.querySelector('.testimonial-track');
    const slides = carousel.querySelectorAll('.testimonial-slide');
    const dots = carousel.querySelectorAll('.testimonial-dot');

    if (!track || !slides.length) return;

    let currentSlide = 0;
    let autoPlayTimer;
    const autoPlayDelay = 5000;

    function goToSlide(index) {
      currentSlide = index;
      track.style.transform = `translateX(-${currentSlide * 100}%)`;

      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
      });
    }

    function nextSlide() {
      const next = (currentSlide + 1) % slides.length;
      goToSlide(next);
    }

    function startAutoPlay() {
      stopAutoPlay();
      autoPlayTimer = setInterval(nextSlide, autoPlayDelay);
    }

    function stopAutoPlay() {
      if (autoPlayTimer) {
        clearInterval(autoPlayTimer);
      }
    }

    // Dot click
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        goToSlide(i);
        startAutoPlay();
      });
    });

    // Touch support
    let touchStartX = 0;
    let touchEndX = 0;

    track.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      stopAutoPlay();
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const diff = touchStartX - touchEndX;

      if (Math.abs(diff) > 50) {
        if (diff > 0) {
          // Swipe left → next
          goToSlide(Math.min(currentSlide + 1, slides.length - 1));
        } else {
          // Swipe right → prev
          goToSlide(Math.max(currentSlide - 1, 0));
        }
      }

      startAutoPlay();
    }, { passive: true });

    // Pause on hover
    carousel.addEventListener('mouseenter', stopAutoPlay);
    carousel.addEventListener('mouseleave', startAutoPlay);

    // Init
    goToSlide(0);
    startAutoPlay();
  }

  /* ─── FAQ Accordion ─── */
  function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    if (!faqItems.length) return;

    faqItems.forEach(item => {
      const question = item.querySelector('.faq-question');
      if (!question) return;

      question.addEventListener('click', () => {
        const isActive = item.classList.contains('active');

        // Close all
        faqItems.forEach(other => {
          other.classList.remove('active');
          const answer = other.querySelector('.faq-answer');
          if (answer) answer.style.maxHeight = '0';
        });

        // Open clicked (if was closed)
        if (!isActive) {
          item.classList.add('active');
          const answer = item.querySelector('.faq-answer');
          if (answer) {
            answer.style.maxHeight = answer.scrollHeight + 'px';
          }
        }
      });
    });
  }

  /* ─── Portfolio Filter ─── */
  function initPortfolioFilter() {
    const tabs = document.querySelectorAll('.filter-tab');
    const items = document.querySelectorAll('.portfolio-item[data-category]');

    if (!tabs.length || !items.length) return;

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const category = tab.getAttribute('data-filter');

        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Filter items
        items.forEach(item => {
          const itemCategory = item.getAttribute('data-category');
          if (category === 'all' || itemCategory === category) {
            item.style.display = '';
            item.style.animation = 'fadeInUp 0.5s ease forwards';
          } else {
            item.style.display = 'none';
          }
        });
      });
    });
  }

  /* ─── Hero Slideshow ─── */
  function initHeroSlideshow() {
    const slides = document.querySelectorAll('.hero__slide');
    if (slides.length <= 1) return;

    let currentSlide = 0;
    const delay = 5000;

    function showSlide(index) {
      slides.forEach(s => s.classList.remove('active'));
      slides[index].classList.add('active');
    }

    function nextSlide() {
      currentSlide = (currentSlide + 1) % slides.length;
      showSlide(currentSlide);
    }

    showSlide(0);
    setInterval(nextSlide, delay);
  }

  /* ─── Smooth Scroll ─── */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#') return;

        const target = document.querySelector(href);
        if (!target) return;

        e.preventDefault();
        const navHeight = document.querySelector('.nav')?.offsetHeight || 80;
        const top = target.getBoundingClientRect().top + window.pageYOffset - navHeight;

        window.scrollTo({
          top: top,
          behavior: 'smooth'
        });
      });
    });
  }

  /* ─── Newsletter Form ─── */
  function initNewsletterForm() {
    const forms = document.querySelectorAll('.footer__newsletter-form, .newsletter__form');

    forms.forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = form.querySelector('input[type="email"]');
        if (!input) return;

        const email = input.value.trim();
        if (!email || !isValidEmail(email)) {
          shakeElement(input);
          return;
        }

        // Simulate success
        const btn = form.querySelector('button');
        const originalText = btn.textContent;
        btn.textContent = '완료! ✓';
        btn.style.background = '#00C853';
        input.value = '';

        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = '';
        }, 3000);
      });
    });
  }

  /* ─── Contact Form ─── */
  function initContactForm() {
    const form = document.querySelector('.contact-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      // Validate
      const inputs = form.querySelectorAll('[required]');
      let valid = true;

      inputs.forEach(input => {
        if (!input.value.trim()) {
          valid = false;
          input.style.borderColor = 'var(--coral)';
          shakeElement(input);
        } else {
          input.style.borderColor = '';
        }
      });

      const emailInput = form.querySelector('input[type="email"]');
      if (emailInput && !isValidEmail(emailInput.value)) {
        valid = false;
        emailInput.style.borderColor = 'var(--coral)';
        shakeElement(emailInput);
      }

      if (!valid) return;

      // Simulate success
      const btn = form.querySelector('.btn');
      const originalText = btn.textContent;
      btn.textContent = '전송 완료! ✓';
      btn.style.background = '#00C853';

      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        form.reset();
      }, 3000);
    });
  }

  /* ─── Marquee duplicate for infinite ─── */
  function initMarquee() {
    const tracks = document.querySelectorAll('.marquee__track');
    tracks.forEach(track => {
      // Clone children for seamless loop
      const children = Array.from(track.children);
      children.forEach(child => {
        const clone = child.cloneNode(true);
        track.appendChild(clone);
      });
    });

    // Same for partner marquee
    const partnerTracks = document.querySelectorAll('.partner-marquee');
    partnerTracks.forEach(track => {
      const children = Array.from(track.children);
      children.forEach(child => {
        const clone = child.cloneNode(true);
        track.appendChild(clone);
      });
    });
  }

  /* ─── Helpers ─── */
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function shakeElement(el) {
    el.style.animation = 'none';
    el.offsetHeight; // trigger reflow
    el.style.animation = 'shake 0.5s ease';
    setTimeout(() => { el.style.animation = ''; }, 500);
  }

  // Shake animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-6px); }
      40% { transform: translateX(6px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(style);

})();
