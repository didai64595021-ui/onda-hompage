/**
 * CleanPartner Laundry Factory Homepage
 * All interactions handled via CSS classes only - no inline styles.
 */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ──────────────────────────────────────────────
     1. Navigation
  ────────────────────────────────────────────── */
  function initNavigation() {
    var nav = document.querySelector('.nav');
    if (!nav) return;

    var ticking = false;

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(function () {
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
    onScroll();

    // Mark active nav link based on current page
    var currentPath = window.location.pathname.split('/').pop() || 'index.html';
    var navLinks = nav.querySelectorAll('a[href]');
    navLinks.forEach(function (link) {
      var href = link.getAttribute('href').split('/').pop();
      if (href === currentPath) {
        link.classList.add('active');
      }
    });
  }

  /* ──────────────────────────────────────────────
     2. Mobile Menu
  ────────────────────────────────────────────── */
  function initMobileMenu() {
    var hamburger = document.querySelector('.hamburger');
    var mobileMenu = document.querySelector('.mobile-menu');
    if (!hamburger || !mobileMenu) return;

    function openMenu() {
      hamburger.classList.add('active');
      mobileMenu.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.style.overflow = '';
    }

    function toggleMenu() {
      if (mobileMenu.classList.contains('active')) {
        closeMenu();
      } else {
        openMenu();
      }
    }

    hamburger.addEventListener('click', toggleMenu);

    // Close on link click
    var menuLinks = mobileMenu.querySelectorAll('a');
    menuLinks.forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    // Close on ESC
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
        closeMenu();
      }
    });
  }

  /* ──────────────────────────────────────────────
     3. Scroll Reveal (CSS classes only)
  ────────────────────────────────────────────── */
  function initScrollReveal() {
    var selectors = '.fade-in, .slide-left, .slide-right, .scale-in';
    var elements = document.querySelectorAll(selectors);
    if (!elements.length) return;

    // If reduced motion, make everything visible immediately
    if (prefersReducedMotion) {
      elements.forEach(function (el) {
        el.classList.add('visible');
      });
      return;
    }

    // Handle above-fold / data-no-delay elements immediately
    elements.forEach(function (el) {
      if (el.hasAttribute('data-no-delay')) {
        el.classList.add('visible');
      }
    });

    if (!('IntersectionObserver' in window)) {
      elements.forEach(function (el) {
        el.classList.add('visible');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px',
      }
    );

    elements.forEach(function (el) {
      if (!el.classList.contains('visible')) {
        observer.observe(el);
      }
    });
  }

  /* ──────────────────────────────────────────────
     4. Counters
  ────────────────────────────────────────────── */
  function initCounters() {
    var counters = document.querySelectorAll('.stat-number');
    if (!counters.length) return;

    function easeOutQuart(t) {
      return 1 - Math.pow(1 - t, 4);
    }

    function formatNumber(n) {
      return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function animateCounter(el) {
      var target = parseInt(el.getAttribute('data-target'), 10);
      if (isNaN(target)) return;

      var suffix = el.getAttribute('data-suffix') || '';
      var duration = 2000;
      var startTime = null;

      if (prefersReducedMotion) {
        el.textContent = formatNumber(target) + suffix;
        return;
      }

      function step(timestamp) {
        if (!startTime) startTime = timestamp;
        var progress = Math.min((timestamp - startTime) / duration, 1);
        var easedProgress = easeOutQuart(progress);
        var current = Math.round(easedProgress * target);

        el.textContent = formatNumber(current) + suffix;

        if (progress < 1) {
          requestAnimationFrame(step);
        }
      }

      requestAnimationFrame(step);
    }

    if (!('IntersectionObserver' in window)) {
      counters.forEach(function (el) {
        animateCounter(el);
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    counters.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ──────────────────────────────────────────────
     5. FAQ Accordion
  ────────────────────────────────────────────── */
  function initFAQ() {
    var questions = document.querySelectorAll('.faq-question');
    if (!questions.length) return;

    questions.forEach(function (question) {
      question.addEventListener('click', function () {
        var parentItem = question.closest('.faq-item');
        if (!parentItem) return;

        var answer = parentItem.querySelector('.faq-answer');
        if (!answer) return;

        var isActive = parentItem.classList.contains('active');

        // Close all other items (accordion)
        var allItems = document.querySelectorAll('.faq-item');
        allItems.forEach(function (item) {
          if (item !== parentItem) {
            item.classList.remove('active');
            var otherAnswer = item.querySelector('.faq-answer');
            if (otherAnswer) {
              otherAnswer.style.maxHeight = null;
            }
          }
        });

        // Toggle current
        if (isActive) {
          parentItem.classList.remove('active');
          answer.style.maxHeight = null;
        } else {
          parentItem.classList.add('active');
          answer.style.maxHeight = answer.scrollHeight + 'px';
        }
      });
    });
  }

  /* ──────────────────────────────────────────────
     6. Estimate Modal
  ────────────────────────────────────────────── */
  function initEstimateModal() {
    var modal = document.getElementById('estimateModal');
    if (!modal) return;

    var triggers = document.querySelectorAll('.float-estimate, [data-modal="estimate"]');
    var closeBtn = modal.querySelector('.modal-close');
    var overlay = modal.querySelector('.modal-overlay');
    var form = modal.querySelector('form');

    function openModal() {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        openModal();
      });
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    if (overlay) {
      overlay.addEventListener('click', closeModal);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeModal();
      }
    });

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();

        var name = form.querySelector('[name="name"]');
        var phone = form.querySelector('[name="phone"]');
        var serviceType = form.querySelector('[name="service-type"]');

        // Reset previous errors
        var errorEls = form.querySelectorAll('.form-error');
        errorEls.forEach(function (el) {
          el.classList.remove('active');
        });

        var hasError = false;

        if (!name || !name.value.trim()) {
          showFieldError(name, '이름을 입력해주세요.');
          hasError = true;
        }

        if (!phone || !phone.value.trim()) {
          showFieldError(phone, '전화번호를 입력해주세요.');
          hasError = true;
        } else if (!isValidKoreanPhone(phone.value.trim())) {
          showFieldError(phone, '올바른 전화번호를 입력해주세요.');
          hasError = true;
        }

        if (!serviceType || !serviceType.value) {
          showFieldError(serviceType, '서비스 타입을 선택해주세요.');
          hasError = true;
        }

        if (hasError) return;

        // Success
        form.reset();
        showThankYouMessage(form, '견적 요청이 접수되었습니다. 감사합니다!');
        setTimeout(closeModal, 2500);
      });
    }
  }

  /* ──────────────────────────────────────────────
     7. Phone Call
  ────────────────────────────────────────────── */
  function initPhoneCall() {
    var phoneBtn = document.querySelector('.float-phone');
    if (!phoneBtn) return;

    var phoneNumber = '010-8892-3736';

    phoneBtn.addEventListener('click', function (e) {
      e.preventDefault();

      if (isMobileDevice()) {
        window.location.href = 'tel:' + phoneNumber;
      } else {
        showPhoneNumberPopup(phoneNumber);
      }
    });
  }

  /* ──────────────────────────────────────────────
     8. Contact Form
  ────────────────────────────────────────────── */
  function initContactForm() {
    var form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var name = form.querySelector('[name="name"]');
      var phone = form.querySelector('[name="phone"]');
      var message = form.querySelector('[name="message"]');

      // Reset previous errors
      var errorEls = form.querySelectorAll('.form-error');
      errorEls.forEach(function (el) {
        el.classList.remove('active');
      });

      var hasError = false;

      if (!name || !name.value.trim()) {
        showFieldError(name, '이름을 입력해주세요.');
        hasError = true;
      }

      if (!phone || !phone.value.trim()) {
        showFieldError(phone, '전화번호를 입력해주세요.');
        hasError = true;
      } else if (!isValidKoreanPhone(phone.value.trim())) {
        showFieldError(phone, '올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)');
        hasError = true;
      }

      if (!message || !message.value.trim()) {
        showFieldError(message, '문의내용을 입력해주세요.');
        hasError = true;
      }

      if (hasError) return;

      // Success
      form.reset();
      showThankYouMessage(form, '문의가 접수되었습니다. 빠른 시일 내에 연락드리겠습니다.');
    });
  }

  /* ──────────────────────────────────────────────
     9. Smooth Scroll
  ────────────────────────────────────────────── */
  function initSmoothScroll() {
    var anchorLinks = document.querySelectorAll('a[href^="#"]');
    if (!anchorLinks.length) return;

    anchorLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        var href = link.getAttribute('href');
        if (!href || href === '#') return;

        var target = document.querySelector(href);
        if (!target) return;

        e.preventDefault();

        var nav = document.querySelector('.nav');
        var navHeight = nav ? nav.offsetHeight : 0;
        var targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight;

        if (prefersReducedMotion) {
          window.scrollTo(0, targetPosition);
        } else {
          window.scrollTo({
            top: targetPosition,
            behavior: 'smooth',
          });
        }
      });
    });
  }

  /* ──────────────────────────────────────────────
     Utility Functions
  ────────────────────────────────────────────── */

  function isValidKoreanPhone(value) {
    // Korean phone: 010-xxxx-xxxx, 02-xxx-xxxx, 0xx-xxx-xxxx, etc.
    var cleaned = value.replace(/[\s\-]/g, '');
    return /^(01[016789]\d{7,8}|0[2-6]\d{7,8})$/.test(cleaned);
  }

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  function showFieldError(field, message) {
    if (!field) return;

    var parent = field.closest('.form-group') || field.parentElement;
    if (!parent) return;

    var errorEl = parent.querySelector('.form-error');
    if (!errorEl) {
      errorEl = document.createElement('span');
      errorEl.className = 'form-error';
      parent.appendChild(errorEl);
    }
    errorEl.textContent = message;
    errorEl.classList.add('active');
    field.classList.add('error');

    // Remove error on input
    field.addEventListener(
      'input',
      function () {
        errorEl.classList.remove('active');
        field.classList.remove('error');
      },
      { once: true }
    );
  }

  function showThankYouMessage(form, message) {
    var existing = form.querySelector('.thank-you-message');
    if (existing) {
      existing.remove();
    }

    var msgEl = document.createElement('div');
    msgEl.className = 'thank-you-message active';
    msgEl.textContent = message;
    form.appendChild(msgEl);

    setTimeout(function () {
      msgEl.classList.remove('active');
      setTimeout(function () {
        if (msgEl.parentNode) {
          msgEl.remove();
        }
      }, 300);
    }, 3000);
  }

  function showPhoneNumberPopup(phoneNumber) {
    // Remove existing popup if any
    var existing = document.querySelector('.phone-popup');
    if (existing) {
      existing.remove();
    }

    var popup = document.createElement('div');
    popup.className = 'phone-popup active';
    popup.innerHTML =
      '<div class="phone-popup-content">' +
      '<p>전화번호</p>' +
      '<a href="tel:' + phoneNumber + '">' + phoneNumber + '</a>' +
      '<button class="phone-popup-close" aria-label="닫기">&times;</button>' +
      '</div>';

    document.body.appendChild(popup);

    var closeBtn = popup.querySelector('.phone-popup-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        popup.classList.remove('active');
        setTimeout(function () {
          if (popup.parentNode) {
            popup.remove();
          }
        }, 300);
      });
    }

    // Auto-close after 5 seconds
    setTimeout(function () {
      if (popup.parentNode) {
        popup.classList.remove('active');
        setTimeout(function () {
          if (popup.parentNode) {
            popup.remove();
          }
        }, 300);
      }
    }, 5000);
  }

  /* ──────────────────────────────────────────────
     Initialize on DOM ready
  ────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    initNavigation();
    initMobileMenu();
    initScrollReveal();
    initCounters();
    initFAQ();
    initEstimateModal();
    initPhoneCall();
    initContactForm();
    initSmoothScroll();
  });
})();
