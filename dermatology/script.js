/* ============================================
   루미에르 피부과 (Lumière Dermatology)
   Common JavaScript
   ============================================ */

(function() {
  'use strict';

  /* ---------- DOM Ready ---------- */
  document.addEventListener('DOMContentLoaded', function() {
    initDarkMode();
    initHeader();
    initMobileNav();
    initScrollProgress();
    initScrollAnimations();
    initHoverZoom();
    initBeforeAfterSliders();
    initAccordions();
    initSmoothScroll();
    initCarousels();
    initCounterAnimations();
    initTabs();
    initFilterButtons();
    initModals();
    initTreatmentQuiz();
    initFloatingCTA();
    initHeroParticles();
    initParallax();
    initReservationForm();
  });

  /* ============================================
     1. Dark Mode Toggle with localStorage
     ============================================ */
  function initDarkMode() {
    var toggle = document.querySelector('.dark-mode-toggle');
    if (!toggle) return;

    var savedTheme = localStorage.getItem('lumiere-theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    toggle.addEventListener('click', function() {
      var current = document.documentElement.getAttribute('data-theme');
      var newTheme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('lumiere-theme', newTheme);
    });
  }

  /* ============================================
     2. Header Scroll Behavior
     ============================================ */
  function initHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;

    var lastScrollY = 0;
    var ticking = false;

    function updateHeader() {
      var scrollY = window.scrollY;
      if (scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
      lastScrollY = scrollY;
      ticking = false;
    }

    window.addEventListener('scroll', function() {
      if (!ticking) {
        window.requestAnimationFrame(updateHeader);
        ticking = true;
      }
    });
  }

  /* ============================================
     3. Mobile Navigation
     ============================================ */
  function initMobileNav() {
    var hamburger = document.querySelector('.hamburger');
    var overlay = document.querySelector('.mobile-nav-overlay');
    if (!hamburger || !overlay) return;

    var links = overlay.querySelectorAll('a');

    hamburger.addEventListener('click', function() {
      hamburger.classList.toggle('active');
      overlay.classList.toggle('active');
      document.body.style.overflow = overlay.classList.contains('active') ? 'hidden' : '';
    });

    links.forEach(function(link) {
      link.addEventListener('click', function() {
        hamburger.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
      });
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && overlay.classList.contains('active')) {
        hamburger.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  /* ============================================
     4. Scroll Progress Indicator
     ============================================ */
  function initScrollProgress() {
    var progressBar = document.querySelector('.scroll-progress');
    if (!progressBar) return;

    function updateProgress() {
      var scrollTop = window.scrollY;
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      progressBar.style.width = progress + '%';
    }

    window.addEventListener('scroll', function() {
      window.requestAnimationFrame(updateProgress);
    });
  }

  /* ============================================
     5. Scroll-Triggered Fade-In Animations (I1)
     ============================================ */
  function initScrollAnimations() {
    var animElements = document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right, .fade-in-scale');
    if (animElements.length === 0) return;

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    });

    animElements.forEach(function(el) {
      observer.observe(el);
    });
  }

  /* ============================================
     6. Hover Zoom Effect (I4)
     ============================================ */
  function initHoverZoom() {
    var zoomElements = document.querySelectorAll('.hover-zoom');
    zoomElements.forEach(function(el) {
      var img = el.querySelector('img, .placeholder-img');
      if (!img) return;
      img.style.transition = 'transform 0.5s ease';
    });
  }

  /* ============================================
     7. Before/After Comparison Slider (I7)
     ============================================ */
  function initBeforeAfterSliders() {
    var sliders = document.querySelectorAll('.ba-slider');
    sliders.forEach(function(slider) {
      initSingleBASlider(slider);
    });
  }

  function initSingleBASlider(slider) {
    var handle = slider.querySelector('.ba-slider__handle');
    var afterLayer = slider.querySelector('.ba-slider__after');
    if (!handle || !afterLayer) return;

    var isDragging = false;

    function getPosition(e) {
      var rect = slider.getBoundingClientRect();
      var x;
      if (e.touches) {
        x = e.touches[0].clientX - rect.left;
      } else {
        x = e.clientX - rect.left;
      }
      var percent = (x / rect.width) * 100;
      return Math.max(0, Math.min(100, percent));
    }

    function updateSlider(percent) {
      handle.style.left = percent + '%';
      afterLayer.style.width = percent + '%';
    }

    function onStart(e) {
      e.preventDefault();
      isDragging = true;
      slider.style.cursor = 'ew-resize';
    }

    function onMove(e) {
      if (!isDragging) return;
      e.preventDefault();
      var percent = getPosition(e);
      updateSlider(percent);
    }

    function onEnd() {
      isDragging = false;
      slider.style.cursor = 'ew-resize';
    }

    // Mouse events
    handle.addEventListener('mousedown', onStart);
    slider.addEventListener('mousedown', function(e) {
      isDragging = true;
      var percent = getPosition(e);
      updateSlider(percent);
    });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);

    // Touch events
    handle.addEventListener('touchstart', onStart, { passive: false });
    slider.addEventListener('touchstart', function(e) {
      isDragging = true;
      var percent = getPosition(e);
      updateSlider(percent);
    }, { passive: false });
    document.addEventListener('touchmove', function(e) {
      if (!isDragging) return;
      e.preventDefault();
      var percent = getPosition(e);
      updateSlider(percent);
    }, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  /* ============================================
     8. Accordion Expand/Collapse (I8)
     ============================================ */
  function initAccordions() {
    var triggers = document.querySelectorAll('.accordion__trigger');
    triggers.forEach(function(trigger) {
      trigger.addEventListener('click', function() {
        var content = this.nextElementSibling;
        var isActive = this.classList.contains('active');
        var accordion = this.closest('.accordion');

        // Close all siblings
        if (accordion) {
          var siblingTriggers = accordion.querySelectorAll('.accordion__trigger');
          siblingTriggers.forEach(function(st) {
            if (st !== trigger) {
              st.classList.remove('active');
              var sc = st.nextElementSibling;
              if (sc) sc.style.maxHeight = null;
            }
          });
        }

        // Toggle current
        if (isActive) {
          this.classList.remove('active');
          content.style.maxHeight = null;
        } else {
          this.classList.add('active');
          content.style.maxHeight = content.scrollHeight + 'px';
        }
      });
    });
  }

  /* ============================================
     9. Smooth Scroll for Anchor Links (I11)
     ============================================ */
  function initSmoothScroll() {
    var anchors = document.querySelectorAll('a[href^="#"]');
    anchors.forEach(function(anchor) {
      anchor.addEventListener('click', function(e) {
        var href = this.getAttribute('href');
        if (href === '#' || href === '#!') return;

        var target = document.querySelector(href);
        if (!target) return;

        e.preventDefault();
        var headerHeight = document.querySelector('.site-header')
          ? document.querySelector('.site-header').offsetHeight
          : 0;
        var top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;

        window.scrollTo({
          top: top,
          behavior: 'smooth'
        });
      });
    });
  }

  /* ============================================
     10. Carousel / Slider
     ============================================ */
  function initCarousels() {
    var carousels = document.querySelectorAll('.carousel');
    carousels.forEach(function(carousel) {
      initSingleCarousel(carousel);
    });
  }

  function initSingleCarousel(carousel) {
    var track = carousel.querySelector('.carousel__track');
    var slides = carousel.querySelectorAll('.carousel__slide');
    var dots = carousel.querySelectorAll('.carousel__dot');
    var prevBtn = carousel.querySelector('.carousel__arrow--prev');
    var nextBtn = carousel.querySelector('.carousel__arrow--next');
    if (!track || slides.length === 0) return;

    var currentIndex = 0;
    var totalSlides = slides.length;
    var autoPlayInterval = null;

    function goToSlide(index) {
      if (index < 0) index = totalSlides - 1;
      if (index >= totalSlides) index = 0;
      currentIndex = index;
      track.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
      updateDots();
    }

    function updateDots() {
      dots.forEach(function(dot, i) {
        dot.classList.toggle('active', i === currentIndex);
      });
    }

    function startAutoPlay() {
      stopAutoPlay();
      autoPlayInterval = setInterval(function() {
        goToSlide(currentIndex + 1);
      }, 5000);
    }

    function stopAutoPlay() {
      if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
      }
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        goToSlide(currentIndex - 1);
        stopAutoPlay();
        startAutoPlay();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        goToSlide(currentIndex + 1);
        stopAutoPlay();
        startAutoPlay();
      });
    }

    dots.forEach(function(dot, i) {
      dot.addEventListener('click', function() {
        goToSlide(i);
        stopAutoPlay();
        startAutoPlay();
      });
    });

    // Touch swipe
    var touchStartX = 0;
    var touchEndX = 0;

    track.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].screenX;
      stopAutoPlay();
    }, { passive: true });

    track.addEventListener('touchend', function(e) {
      touchEndX = e.changedTouches[0].screenX;
      var diff = touchStartX - touchEndX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) {
          goToSlide(currentIndex + 1);
        } else {
          goToSlide(currentIndex - 1);
        }
      }
      startAutoPlay();
    }, { passive: true });

    updateDots();
    startAutoPlay();
  }

  /* ============================================
     11. Counter Animations
     ============================================ */
  function initCounterAnimations() {
    var counters = document.querySelectorAll('[data-count-target]');
    if (counters.length === 0) return;

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(function(counter) {
      observer.observe(counter);
    });
  }

  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-count-target'), 10);
    var suffix = el.getAttribute('data-count-suffix') || '';
    var prefix = el.getAttribute('data-count-prefix') || '';
    var duration = 2000;
    var start = 0;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.floor(eased * target);
      el.textContent = prefix + current.toLocaleString() + suffix;
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        el.textContent = prefix + target.toLocaleString() + suffix;
      }
    }

    window.requestAnimationFrame(step);
  }

  /* ============================================
     12. Tabs
     ============================================ */
  function initTabs() {
    var tabGroups = document.querySelectorAll('[data-tabs]');
    tabGroups.forEach(function(group) {
      var buttons = group.querySelectorAll('.tab-btn');
      var tabId = group.getAttribute('data-tabs');
      var panels = document.querySelectorAll('[data-tab-panel="' + tabId + '"] .tab-panel');

      buttons.forEach(function(btn) {
        btn.addEventListener('click', function() {
          var target = this.getAttribute('data-tab');

          buttons.forEach(function(b) { b.classList.remove('active'); });
          this.classList.add('active');

          panels.forEach(function(panel) {
            if (panel.getAttribute('data-panel-id') === target) {
              panel.classList.add('active');
            } else {
              panel.classList.remove('active');
            }
          });
        });
      });
    });
  }

  /* ============================================
     13. Filter Buttons
     ============================================ */
  function initFilterButtons() {
    var filterGroups = document.querySelectorAll('.filter-group');
    filterGroups.forEach(function(group) {
      var buttons = group.querySelectorAll('.filter-btn');
      var targetSelector = group.getAttribute('data-filter-target');
      if (!targetSelector) return;

      var items = document.querySelectorAll(targetSelector);

      buttons.forEach(function(btn) {
        btn.addEventListener('click', function() {
          var filterVal = this.getAttribute('data-filter');

          buttons.forEach(function(b) { b.classList.remove('active'); });
          this.classList.add('active');

          items.forEach(function(item) {
            var category = item.getAttribute('data-category');
            if (filterVal === 'all' || category === filterVal) {
              item.style.display = '';
              item.style.opacity = '0';
              item.style.transform = 'translateY(10px)';
              setTimeout(function() {
                item.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
              }, 50);
            } else {
              item.style.opacity = '0';
              item.style.transform = 'translateY(10px)';
              setTimeout(function() {
                item.style.display = 'none';
              }, 400);
            }
          });
        });
      });
    });
  }

  /* ============================================
     14. Modal
     ============================================ */
  function initModals() {
    var triggers = document.querySelectorAll('[data-modal-open]');
    var closes = document.querySelectorAll('[data-modal-close]');
    var overlays = document.querySelectorAll('.modal-overlay');

    triggers.forEach(function(trigger) {
      trigger.addEventListener('click', function(e) {
        e.preventDefault();
        var modalId = this.getAttribute('data-modal-open');
        var modal = document.getElementById(modalId);
        if (modal) {
          modal.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
      });
    });

    closes.forEach(function(close) {
      close.addEventListener('click', function() {
        var overlay = this.closest('.modal-overlay');
        if (overlay) {
          overlay.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    });

    overlays.forEach(function(overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        overlays.forEach(function(overlay) {
          if (overlay.classList.contains('active')) {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
          }
        });
      }
    });
  }

  /* ============================================
     15. Treatment Recommendation Quiz
     ============================================ */
  function initTreatmentQuiz() {
    var quizContainer = document.querySelector('.quiz-container');
    if (!quizContainer) return;

    var steps = quizContainer.querySelectorAll('.quiz-step');
    var resultEl = quizContainer.querySelector('.quiz-result');
    var progressBars = quizContainer.querySelectorAll('.quiz-progress__bar');
    var answers = {};
    var currentStep = 0;

    function showStep(index) {
      steps.forEach(function(step, i) {
        step.classList.toggle('active', i === index);
      });
      progressBars.forEach(function(bar, i) {
        bar.classList.toggle('filled', i <= index);
      });
    }

    var options = quizContainer.querySelectorAll('.quiz-option');
    options.forEach(function(option) {
      option.addEventListener('click', function() {
        var step = this.closest('.quiz-step');
        var stepIndex = parseInt(step.getAttribute('data-step'), 10);
        var value = this.getAttribute('data-value');

        // Remove selected state from siblings
        var siblings = step.querySelectorAll('.quiz-option');
        siblings.forEach(function(s) { s.classList.remove('selected'); });
        this.classList.add('selected');

        answers['q' + (stepIndex + 1)] = value;

        // Auto-advance after short delay
        setTimeout(function() {
          if (stepIndex < steps.length - 1) {
            currentStep = stepIndex + 1;
            showStep(currentStep);
          } else {
            showQuizResult();
          }
        }, 400);
      });
    });

    function showQuizResult() {
      steps.forEach(function(s) { s.classList.remove('active'); });
      progressBars.forEach(function(bar) { bar.classList.add('filled'); });

      var recommendation = getRecommendation(answers);
      var titleEl = quizContainer.querySelector('.quiz-result__title');
      var descEl = quizContainer.querySelector('.quiz-result__desc');
      var iconEl = quizContainer.querySelector('.quiz-result__icon');

      if (titleEl) titleEl.textContent = recommendation.title;
      if (descEl) descEl.textContent = recommendation.desc;
      if (iconEl) iconEl.textContent = recommendation.icon;

      if (resultEl) {
        resultEl.classList.add('active');
      }
    }

    function getRecommendation(a) {
      var q1 = a.q1 || '';
      var q2 = a.q2 || '';
      var q3 = a.q3 || '';

      if (q1 === 'wrinkle') {
        if (q2 === 'intense' && q3 === 'long') {
          return { title: '울쎄라 리프팅', desc: '깊은 주름과 처진 피부를 근본적으로 개선하는 초음파 리프팅입니다. 시술 후 자연스러운 리프팅 효과가 2~3개월에 걸쳐 극대화됩니다.', icon: '✨' };
        } else if (q2 === 'moderate') {
          return { title: '써마지 FLX', desc: '고주파 에너지로 콜라겐을 재생시켜 탄력을 회복합니다. 비교적 편안한 시술로 일상 복귀가 빠릅니다.', icon: '💎' };
        } else {
          return { title: '보톡스 주름 치료', desc: '표정 주름을 자연스럽게 개선하는 보톡스 시술입니다. 10~15분 내 완료되며 다운타임이 거의 없습니다.', icon: '🌟' };
        }
      } else if (q1 === 'pigment') {
        if (q2 === 'intense') {
          return { title: '피코레이저 토닝', desc: '기미, 색소침착, 잡티를 정밀하게 제거하는 최신 레이저 시술입니다. 주변 피부 손상을 최소화하며 깨끗한 피부결을 만들어줍니다.', icon: '🔬' };
        } else {
          return { title: '레이저 토닝', desc: '균일하고 맑은 피부톤을 위한 레이저 토닝입니다. 주기적인 관리로 칙칙한 피부를 환하게 가꿔드립니다.', icon: '☀️' };
        }
      } else if (q1 === 'pore') {
        if (q3 === 'none') {
          return { title: '아쿠아필 + 진정관리', desc: '모공 속 노폐물을 깨끗하게 제거하고 피부결을 매끄럽게 정돈하는 프로그램입니다. 시술 직후 화사한 피부를 확인할 수 있습니다.', icon: '💧' };
        } else {
          return { title: '프락셀 레이저', desc: '모공 축소와 피부 재생에 탁월한 프락셀 레이저입니다. 미세한 레이저 빔이 피부 재생을 촉진하여 매끄러운 피부결을 만듭니다.', icon: '⚡' };
        }
      } else {
        if (q2 === 'intense') {
          return { title: '프리미엄 복합 시술', desc: '리프팅, 레이저 토닝, 보습관리를 결합한 맞춤형 프로그램입니다. 전문의 상담을 통해 최적의 시술 조합을 설계합니다.', icon: '👑' };
        } else {
          return { title: '루미에르 시그니처 관리', desc: '피부 타입별 맞춤 분석 후 최적화된 관리 프로그램을 제공합니다. 꾸준한 관리로 건강하고 빛나는 피부를 만들어드립니다.', icon: '🌹' };
        }
      }
    }

    // Reset button
    var resetBtn = quizContainer.querySelector('.quiz-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        answers = {};
        currentStep = 0;
        if (resultEl) resultEl.classList.remove('active');
        options.forEach(function(o) { o.classList.remove('selected'); });
        showStep(0);
      });
    }

    showStep(0);
  }

  /* ============================================
     16. Floating CTA (Back to Top)
     ============================================ */
  function initFloatingCTA() {
    var topBtn = document.querySelector('.floating-btn--top');
    if (!topBtn) return;

    window.addEventListener('scroll', function() {
      if (window.scrollY > 600) {
        topBtn.classList.add('visible');
      } else {
        topBtn.classList.remove('visible');
      }
    });

    topBtn.addEventListener('click', function(e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ============================================
     17. Hero Particles
     ============================================ */
  function initHeroParticles() {
    var container = document.querySelector('.hero__particles');
    if (!container) return;

    for (var i = 0; i < 30; i++) {
      var particle = document.createElement('div');
      particle.classList.add('hero__particle');
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDuration = (Math.random() * 10 + 8) + 's';
      particle.style.animationDelay = (Math.random() * 10) + 's';
      particle.style.width = (Math.random() * 4 + 2) + 'px';
      particle.style.height = particle.style.width;
      particle.style.opacity = Math.random() * 0.5 + 0.2;
      container.appendChild(particle);
    }
  }

  /* ============================================
     18. Parallax Effect (S2)
     ============================================ */
  function initParallax() {
    var parallaxElements = document.querySelectorAll('.parallax-bg');
    if (parallaxElements.length === 0) return;

    var ticking = false;

    function updateParallax() {
      var scrollY = window.scrollY;
      parallaxElements.forEach(function(el) {
        var parent = el.parentElement;
        var rect = parent.getBoundingClientRect();
        var speed = parseFloat(el.getAttribute('data-speed')) || 0.3;
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          var offset = (rect.top - window.innerHeight / 2) * speed;
          el.style.transform = 'translateY(' + offset + 'px)';
        }
      });
      ticking = false;
    }

    window.addEventListener('scroll', function() {
      if (!ticking) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
      }
    });
  }

  /* ============================================
     19. Reservation Form Validation
     ============================================ */
  function initReservationForm() {
    var form = document.querySelector('.reservation-form');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      var name = form.querySelector('[name="name"]');
      var phone = form.querySelector('[name="phone"]');
      var valid = true;

      // Simple validation
      if (name && name.value.trim().length < 2) {
        showFieldError(name, '이름을 입력해주세요.');
        valid = false;
      } else if (name) {
        clearFieldError(name);
      }

      if (phone && !/^01[016789]-?\d{3,4}-?\d{4}$/.test(phone.value.trim())) {
        showFieldError(phone, '올바른 연락처를 입력해주세요.');
        valid = false;
      } else if (phone) {
        clearFieldError(phone);
      }

      if (valid) {
        // Show success message
        var successMsg = document.createElement('div');
        successMsg.className = 'form-success-message';
        successMsg.style.cssText = 'background: var(--color-primary-subtle); color: var(--color-primary-dark); padding: 1rem 1.5rem; border-radius: 8px; margin-top: 1rem; text-align: center; font-weight: 600; animation: fadeInUp 0.4s ease;';
        successMsg.textContent = '예약 상담이 접수되었습니다. 빠른 시일 내 연락드리겠습니다.';

        var existing = form.querySelector('.form-success-message');
        if (existing) existing.remove();

        form.appendChild(successMsg);
        form.reset();
      }
    });

    function showFieldError(field, message) {
      clearFieldError(field);
      field.style.borderColor = '#E74C3C';
      var error = document.createElement('div');
      error.className = 'field-error';
      error.style.cssText = 'color: #E74C3C; font-size: 0.75rem; margin-top: 4px;';
      error.textContent = message;
      field.parentElement.appendChild(error);
    }

    function clearFieldError(field) {
      field.style.borderColor = '';
      var error = field.parentElement.querySelector('.field-error');
      if (error) error.remove();
    }
  }

})();
