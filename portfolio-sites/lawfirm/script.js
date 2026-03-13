/* ============================================================
   법무법인 정의 (JUNGUI LAW) - Global Script
   Features: Sidebar Nav, Dark/Light Toggle, Custom Cursor,
             Parallax, Typing Effect, Scroll Reveal, Counters,
             Accordion, Filter, Modal, FAQ, Form Validation
   ============================================================ */

(function () {
  'use strict';

  /* ========== Page Loader ========== */
  window.addEventListener('load', function () {
    var loader = document.querySelector('.page-loader');
    if (loader) {
      setTimeout(function () {
        loader.classList.add('loaded');
      }, 600);
    }
  });

  document.addEventListener('DOMContentLoaded', function () {

    /* ========== Dark / Light Theme Toggle (I14) ========== */
    var themeToggle = document.querySelector('.theme-toggle');
    var savedTheme = localStorage.getItem('jungui-theme') || 'light';

    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('jungui-theme', theme);
      var label = document.querySelector('.toggle-label');
      if (label) {
        label.textContent = theme === 'dark' ? '다크 모드' : '라이트 모드';
      }
    }

    applyTheme(savedTheme);

    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme');
        applyTheme(current === 'dark' ? 'light' : 'dark');
      });
    }

    /* ========== Sidebar Navigation (N2) ========== */
    var sidebar = document.querySelector('.sidebar');
    var sidebarToggle = document.querySelector('.sidebar-toggle');
    var sidebarOverlay = document.querySelector('.sidebar-overlay');

    function openSidebar() {
      if (sidebar) sidebar.classList.add('open');
      if (sidebarToggle) sidebarToggle.classList.add('active');
      if (sidebarOverlay) sidebarOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
      if (sidebar) sidebar.classList.remove('open');
      if (sidebarToggle) sidebarToggle.classList.remove('active');
      if (sidebarOverlay) sidebarOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', function () {
        if (sidebar && sidebar.classList.contains('open')) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });
    }

    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', closeSidebar);
    }

    // Close sidebar on nav link click (mobile)
    var navLinks = document.querySelectorAll('.sidebar-nav .nav-item');
    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.innerWidth <= 1024) {
          closeSidebar();
        }
      });
    });

    /* ========== Custom Cursor (I6) ========== */
    var cursor = document.querySelector('.custom-cursor');
    var cursorDot = document.querySelector('.custom-cursor-dot');
    var mouseX = 0, mouseY = 0;
    var cursorX = 0, cursorY = 0;

    if (cursor && cursorDot) {
      document.addEventListener('mousemove', function (e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
        cursorDot.style.left = mouseX + 'px';
        cursorDot.style.top = mouseY + 'px';
      });

      function animateCursor() {
        cursorX += (mouseX - cursorX) * 0.15;
        cursorY += (mouseY - cursorY) * 0.15;
        cursor.style.left = cursorX + 'px';
        cursor.style.top = cursorY + 'px';
        requestAnimationFrame(animateCursor);
      }
      animateCursor();

      // Hover effect on interactive elements
      var hoverTargets = document.querySelectorAll('a, button, .card, .case-card, .team-card, .accordion-header, .faq-question, .filter-btn, input, textarea, select');
      hoverTargets.forEach(function (el) {
        el.addEventListener('mouseenter', function () {
          cursor.classList.add('cursor-hover');
        });
        el.addEventListener('mouseleave', function () {
          cursor.classList.remove('cursor-hover');
        });
      });
    }

    /* ========== Parallax Effect (I2) ========== */
    var parallaxElements = document.querySelectorAll('.parallax-bg');

    function updateParallax() {
      var scrollY = window.pageYOffset;
      parallaxElements.forEach(function (el) {
        var parent = el.parentElement;
        var rect = parent.getBoundingClientRect();
        var speed = parseFloat(el.getAttribute('data-speed')) || 0.3;
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          var yPos = (rect.top * speed);
          el.style.transform = 'translate3d(0, ' + yPos + 'px, 0)';
        }
      });
    }

    if (parallaxElements.length > 0) {
      window.addEventListener('scroll', updateParallax, { passive: true });
      updateParallax();
    }

    /* ========== Typing Effect (I8) ========== */
    var typingElements = document.querySelectorAll('[data-typing]');

    typingElements.forEach(function (el) {
      var text = el.getAttribute('data-typing');
      var speed = parseInt(el.getAttribute('data-typing-speed')) || 80;
      var delay = parseInt(el.getAttribute('data-typing-delay')) || 500;
      var idx = 0;
      el.textContent = '';
      el.classList.add('typing-text');

      function observerCallback(entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            setTimeout(function () {
              typeChar();
            }, delay);
            typingObs.unobserve(el);
          }
        });
      }

      var typingObs = new IntersectionObserver(observerCallback, { threshold: 0.5 });
      typingObs.observe(el);

      function typeChar() {
        if (idx < text.length) {
          el.textContent += text.charAt(idx);
          idx++;
          setTimeout(typeChar, speed);
        } else {
          // Remove caret after typing
          setTimeout(function () {
            el.classList.remove('typing-text');
          }, 1500);
        }
      }
    });

    /* ========== Scroll Reveal Animations ========== */
    var revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');

    if ('IntersectionObserver' in window) {
      var revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            revealObserver.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
      });

      revealElements.forEach(function (el) {
        revealObserver.observe(el);
      });
    } else {
      revealElements.forEach(function (el) {
        el.classList.add('revealed');
      });
    }

    /* ========== Counter Animation ========== */
    var counters = document.querySelectorAll('[data-count]');

    function animateCounter(el) {
      var target = parseInt(el.getAttribute('data-count'));
      var duration = parseInt(el.getAttribute('data-duration')) || 2000;
      var start = 0;
      var startTime = null;

      function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
      }

      function step(timestamp) {
        if (!startTime) startTime = timestamp;
        var progress = Math.min((timestamp - startTime) / duration, 1);
        var easedProgress = easeOutCubic(progress);
        var current = Math.floor(easedProgress * target);
        el.textContent = current.toLocaleString();
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          el.textContent = target.toLocaleString();
        }
      }

      requestAnimationFrame(step);
    }

    if (counters.length > 0) {
      var counterObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });

      counters.forEach(function (el) {
        counterObserver.observe(el);
      });
    }

    /* ========== Accordion ========== */
    var accordionHeaders = document.querySelectorAll('.accordion-header');

    accordionHeaders.forEach(function (header) {
      header.addEventListener('click', function () {
        var item = this.closest('.accordion-item');
        var parent = item.parentElement;
        var isActive = item.classList.contains('active');

        // Close all siblings
        var siblings = parent.querySelectorAll('.accordion-item');
        siblings.forEach(function (sib) {
          sib.classList.remove('active');
          var body = sib.querySelector('.accordion-body');
          if (body) body.style.maxHeight = '0px';
        });

        // Toggle current
        if (!isActive) {
          item.classList.add('active');
          var body = item.querySelector('.accordion-body');
          if (body) {
            body.style.maxHeight = body.scrollHeight + 'px';
          }
        }
      });
    });

    /* ========== FAQ Accordion ========== */
    var faqQuestions = document.querySelectorAll('.faq-question');

    faqQuestions.forEach(function (question) {
      question.addEventListener('click', function () {
        var item = this.closest('.faq-item');
        var isActive = item.classList.contains('active');

        // Close all FAQ items
        document.querySelectorAll('.faq-item').forEach(function (fi) {
          fi.classList.remove('active');
          var answer = fi.querySelector('.faq-answer');
          if (answer) answer.style.maxHeight = '0px';
        });

        if (!isActive) {
          item.classList.add('active');
          var answer = item.querySelector('.faq-answer');
          if (answer) {
            answer.style.maxHeight = answer.scrollHeight + 'px';
          }
        }
      });
    });

    /* ========== Filter System ========== */
    var filterBtns = document.querySelectorAll('.filter-btn');
    var filterItems = document.querySelectorAll('[data-category]');

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var filter = this.getAttribute('data-filter');

        // Update active state
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');

        // Filter items
        filterItems.forEach(function (item) {
          if (filter === 'all' || item.getAttribute('data-category') === filter) {
            item.style.display = '';
            item.style.opacity = '0';
            item.style.transform = 'translateY(20px)';
            setTimeout(function () {
              item.style.opacity = '1';
              item.style.transform = 'translateY(0)';
              item.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            }, 50);
          } else {
            item.style.opacity = '0';
            item.style.transform = 'translateY(20px)';
            setTimeout(function () {
              item.style.display = 'none';
            }, 400);
          }
        });
      });
    });

    /* ========== Modal System ========== */
    var modalTriggers = document.querySelectorAll('[data-modal]');
    var modalOverlays = document.querySelectorAll('.modal-overlay');
    var modalCloses = document.querySelectorAll('.modal-close');

    function openModal(id) {
      var modal = document.getElementById(id);
      if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    }

    function closeModal(overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    function closeAllModals() {
      modalOverlays.forEach(function (ov) {
        closeModal(ov);
      });
    }

    modalTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        var modalId = this.getAttribute('data-modal');
        openModal(modalId);
      });
    });

    modalCloses.forEach(function (closeBtn) {
      closeBtn.addEventListener('click', function () {
        var overlay = this.closest('.modal-overlay');
        if (overlay) closeModal(overlay);
      });
    });

    modalOverlays.forEach(function (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === this) {
          closeModal(this);
        }
      });
    });

    // ESC key closes modal & sidebar
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeAllModals();
        closeSidebar();
      }
    });

    /* ========== Back to Top ========== */
    var backToTop = document.querySelector('.back-to-top');

    if (backToTop) {
      window.addEventListener('scroll', function () {
        if (window.pageYOffset > 600) {
          backToTop.classList.add('visible');
        } else {
          backToTop.classList.remove('visible');
        }
      }, { passive: true });

      backToTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    /* ========== Smooth Scroll for Anchor Links ========== */
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var targetId = this.getAttribute('href');
        if (targetId === '#') return;
        var target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    /* ========== Active Nav Highlight ========== */
    var sections = document.querySelectorAll('section[id]');
    var navItems = document.querySelectorAll('.sidebar-nav .nav-item');

    function highlightNav() {
      var scrollPos = window.pageYOffset + 200;
      sections.forEach(function (section) {
        var top = section.offsetTop;
        var height = section.offsetHeight;
        var id = section.getAttribute('id');
        if (scrollPos >= top && scrollPos < top + height) {
          navItems.forEach(function (item) {
            item.classList.remove('active');
            if (item.getAttribute('href') === '#' + id) {
              item.classList.add('active');
            }
          });
        }
      });
    }

    if (sections.length > 0 && navItems.length > 0) {
      window.addEventListener('scroll', highlightNav, { passive: true });
      highlightNav();
    }

    /* ========== Form Validation ========== */
    var contactForm = document.getElementById('contactForm');

    if (contactForm) {
      contactForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var isValid = true;
        var requiredFields = this.querySelectorAll('[required]');

        // Remove previous errors
        this.querySelectorAll('.form-error').forEach(function (err) {
          err.remove();
        });

        requiredFields.forEach(function (field) {
          field.style.borderColor = '';
          if (!field.value.trim()) {
            isValid = false;
            field.style.borderColor = 'var(--color-burgundy)';
            var error = document.createElement('span');
            error.className = 'form-error';
            error.style.color = 'var(--color-burgundy)';
            error.style.fontSize = '0.8rem';
            error.style.marginTop = '0.25rem';
            error.style.display = 'block';
            error.textContent = '필수 입력 항목입니다.';
            field.parentNode.appendChild(error);
          }

          // Email validation
          if (field.type === 'email' && field.value.trim()) {
            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(field.value)) {
              isValid = false;
              field.style.borderColor = 'var(--color-burgundy)';
              var error = document.createElement('span');
              error.className = 'form-error';
              error.style.color = 'var(--color-burgundy)';
              error.style.fontSize = '0.8rem';
              error.style.marginTop = '0.25rem';
              error.style.display = 'block';
              error.textContent = '올바른 이메일 형식을 입력해주세요.';
              field.parentNode.appendChild(error);
            }
          }

          // Phone validation
          if (field.type === 'tel' && field.value.trim()) {
            var phoneRegex = /^[0-9\-+() ]{8,}$/;
            if (!phoneRegex.test(field.value)) {
              isValid = false;
              field.style.borderColor = 'var(--color-burgundy)';
              var error = document.createElement('span');
              error.className = 'form-error';
              error.style.color = 'var(--color-burgundy)';
              error.style.fontSize = '0.8rem';
              error.style.marginTop = '0.25rem';
              error.style.display = 'block';
              error.textContent = '올바른 연락처를 입력해주세요.';
              field.parentNode.appendChild(error);
            }
          }
        });

        // Privacy checkbox
        var privacyCheck = this.querySelector('#privacyAgree');
        if (privacyCheck && !privacyCheck.checked) {
          isValid = false;
          var checkParent = privacyCheck.closest('.form-checkbox');
          if (checkParent) {
            checkParent.style.color = 'var(--color-burgundy)';
          }
        }

        if (isValid) {
          // Show success message
          var successMsg = document.createElement('div');
          successMsg.style.cssText = 'padding: 1.5rem; background-color: rgba(63,81,181,0.1); border: 1px solid var(--color-indigo); margin-top: 1rem; text-align: center;';
          successMsg.innerHTML = '<strong style="color: var(--color-indigo);">상담 신청이 완료되었습니다.</strong><br><span style="color: var(--color-text-muted); font-size: 0.9rem;">영업일 기준 24시간 이내에 연락드리겠습니다.</span>';

          var existingMsg = contactForm.querySelector('.form-success');
          if (existingMsg) existingMsg.remove();

          successMsg.className = 'form-success';
          contactForm.appendChild(successMsg);
          contactForm.reset();

          // Remove success msg after 5s
          setTimeout(function () {
            if (successMsg.parentNode) {
              successMsg.style.opacity = '0';
              successMsg.style.transition = 'opacity 0.4s ease';
              setTimeout(function () {
                if (successMsg.parentNode) successMsg.remove();
              }, 400);
            }
          }, 5000);
        }
      });
    }

    /* ========== Resize Handler ========== */
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (window.innerWidth > 1024) {
          closeSidebar();
          if (sidebar) sidebar.classList.remove('open');
        }
      }, 250);
    });

  }); // DOMContentLoaded end

})();
