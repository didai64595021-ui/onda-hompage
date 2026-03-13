/* ============================================
   LUMIERE DERMATOLOGY - Global Scripts
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // ============ Page Loader ============
  const loader = document.querySelector('.page-loader');
  if (loader) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        loader.classList.add('hidden');
        setTimeout(() => loader.remove(), 600);
      }, 400);
    });
  }

  // ============ Header Scroll ============
  const header = document.querySelector('.header');
  let lastScroll = 0;

  function handleHeaderScroll() {
    const currentScroll = window.pageYOffset;
    if (currentScroll > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    lastScroll = currentScroll;
  }

  if (header) {
    window.addEventListener('scroll', handleHeaderScroll, { passive: true });
    handleHeaderScroll();
  }

  // ============ Mobile Menu ============
  const menuToggle = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('.mobile-nav');

  if (menuToggle && mobileNav) {
    menuToggle.addEventListener('click', () => {
      menuToggle.classList.toggle('active');
      mobileNav.classList.toggle('active');
      document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
    });

    mobileNav.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        mobileNav.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  // ============ Active Nav Link ============
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // ============ Scroll Reveal ============
  const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale, .stagger-children');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  });

  revealElements.forEach(el => revealObserver.observe(el));

  // ============ I5 Counter Animation ============
  const counters = document.querySelectorAll('.counter-value');

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(counter => counterObserver.observe(counter));

  function animateCounter(el) {
    const target = parseInt(el.getAttribute('data-target'), 10);
    const suffix = el.getAttribute('data-suffix') || '';
    const prefix = el.getAttribute('data-prefix') || '';
    const duration = 2000;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);
      el.textContent = prefix + current.toLocaleString() + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = prefix + target.toLocaleString() + suffix;
      }
    }

    requestAnimationFrame(update);
  }

  // ============ I9 Image Comparison Slider ============
  document.querySelectorAll('.comparison-slider').forEach(slider => {
    const handle = slider.querySelector('.slider-handle');
    const beforeImg = slider.querySelector('.before-img');
    let isDragging = false;

    function updateSlider(x) {
      const rect = slider.getBoundingClientRect();
      let percent = ((x - rect.left) / rect.width) * 100;
      percent = Math.max(0, Math.min(100, percent));
      handle.style.left = percent + '%';
      beforeImg.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    }

    slider.addEventListener('mousedown', (e) => {
      isDragging = true;
      updateSlider(e.clientX);
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) updateSlider(e.clientX);
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    slider.addEventListener('touchstart', (e) => {
      isDragging = true;
      updateSlider(e.touches[0].clientX);
    }, { passive: true });

    slider.addEventListener('touchmove', (e) => {
      if (isDragging) {
        updateSlider(e.touches[0].clientX);
        e.preventDefault();
      }
    }, { passive: false });

    slider.addEventListener('touchend', () => {
      isDragging = false;
    });
  });

  // ============ Carousel ============
  document.querySelectorAll('.carousel-wrapper').forEach(wrapper => {
    const track = wrapper.querySelector('.carousel-track');
    const slides = track ? track.children : [];
    const prevBtn = wrapper.querySelector('.carousel-btn.prev');
    const nextBtn = wrapper.querySelector('.carousel-btn.next');
    const dotsContainer = wrapper.querySelector('.carousel-dots');
    let currentIndex = 0;
    let slidesPerView = getSlidesPerView();
    let autoplayTimer;

    function getSlidesPerView() {
      if (window.innerWidth <= 768) return 1;
      if (window.innerWidth <= 1024) return 2;
      return parseInt(wrapper.getAttribute('data-slides') || '3', 10);
    }

    function updateCarousel() {
      if (!track || slides.length === 0) return;
      const maxIndex = Math.max(0, slides.length - slidesPerView);
      currentIndex = Math.min(currentIndex, maxIndex);
      const slideWidth = 100 / slidesPerView;
      track.style.transform = `translateX(-${currentIndex * slideWidth}%)`;

      if (dotsContainer) {
        dotsContainer.querySelectorAll('.carousel-dot').forEach((dot, i) => {
          dot.classList.toggle('active', i === currentIndex);
        });
      }
    }

    function createDots() {
      if (!dotsContainer) return;
      dotsContainer.innerHTML = '';
      const maxIndex = Math.max(0, slides.length - slidesPerView);
      for (let i = 0; i <= maxIndex; i++) {
        const dot = document.createElement('button');
        dot.classList.add('carousel-dot');
        if (i === 0) dot.classList.add('active');
        dot.addEventListener('click', () => {
          currentIndex = i;
          updateCarousel();
          resetAutoplay();
        });
        dotsContainer.appendChild(dot);
      }
    }

    function resetAutoplay() {
      if (autoplayTimer) clearInterval(autoplayTimer);
      if (wrapper.hasAttribute('data-autoplay')) {
        const interval = parseInt(wrapper.getAttribute('data-autoplay'), 10) || 5000;
        autoplayTimer = setInterval(() => {
          const maxIndex = Math.max(0, slides.length - slidesPerView);
          currentIndex = currentIndex >= maxIndex ? 0 : currentIndex + 1;
          updateCarousel();
        }, interval);
      }
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentIndex = Math.max(0, currentIndex - 1);
        updateCarousel();
        resetAutoplay();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const maxIndex = Math.max(0, slides.length - slidesPerView);
        currentIndex = Math.min(maxIndex, currentIndex + 1);
        updateCarousel();
        resetAutoplay();
      });
    }

    // Set slide widths
    if (track) {
      Array.from(slides).forEach(slide => {
        slide.style.flex = `0 0 ${100 / slidesPerView}%`;
        slide.style.padding = '0 12px';
        slide.style.boxSizing = 'border-box';
      });
    }

    createDots();
    updateCarousel();
    resetAutoplay();

    // Touch swipe
    let startX = 0;
    let diffX = 0;

    if (track) {
      track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
      }, { passive: true });

      track.addEventListener('touchmove', (e) => {
        diffX = e.touches[0].clientX - startX;
      }, { passive: true });

      track.addEventListener('touchend', () => {
        if (Math.abs(diffX) > 50) {
          if (diffX < 0) {
            const maxIndex = Math.max(0, slides.length - slidesPerView);
            currentIndex = Math.min(maxIndex, currentIndex + 1);
          } else {
            currentIndex = Math.max(0, currentIndex - 1);
          }
          updateCarousel();
          resetAutoplay();
        }
        diffX = 0;
      });
    }

    window.addEventListener('resize', () => {
      const newSPV = getSlidesPerView();
      if (newSPV !== slidesPerView) {
        slidesPerView = newSPV;
        if (track) {
          Array.from(slides).forEach(slide => {
            slide.style.flex = `0 0 ${100 / slidesPerView}%`;
          });
        }
        createDots();
        updateCarousel();
      }
    });
  });

  // ============ Accordion ============
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const body = item.querySelector('.accordion-body');
      const content = item.querySelector('.accordion-content');
      const isActive = item.classList.contains('active');

      // Close siblings in same accordion group
      const group = item.closest('.accordion-group');
      if (group) {
        group.querySelectorAll('.accordion-item.active').forEach(activeItem => {
          if (activeItem !== item) {
            activeItem.classList.remove('active');
            activeItem.querySelector('.accordion-body').style.maxHeight = '0';
          }
        });
      }

      item.classList.toggle('active');
      if (!isActive) {
        body.style.maxHeight = content.scrollHeight + 24 + 'px';
      } else {
        body.style.maxHeight = '0';
      }
    });
  });

  // ============ Tabs ============
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabGroup = btn.closest('.tabs-container') || document;
      const targetId = btn.getAttribute('data-tab');

      tabGroup.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      tabGroup.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = tabGroup.querySelector(`#${targetId}`);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // ============ Back to Top ============
  const backToTop = document.querySelector('.back-to-top');

  if (backToTop) {
    window.addEventListener('scroll', () => {
      if (window.pageYOffset > 600) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    }, { passive: true });

    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ============ Smooth Scroll for anchor links ============
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const headerHeight = header ? header.offsetHeight : 0;
        const top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // ============ Form Handling ============
  document.querySelectorAll('form[data-submit="ajax"]').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : '';

      if (submitBtn) {
        submitBtn.textContent = '전송 중...';
        submitBtn.disabled = true;
      }

      setTimeout(() => {
        showToast('예약 상담 신청이 완료되었습니다.', 'success');
        form.reset();
        if (submitBtn) {
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        }
      }, 1500);
    });
  });

  // ============ Toast ============
  function showToast(message, type = '') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  window.showToast = showToast;

  // ============ Filter Buttons ============
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.filter-group') || document;
      const filter = btn.getAttribute('data-filter');
      const items = group.parentElement.querySelectorAll('[data-category]');

      group.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      items.forEach(item => {
        if (filter === 'all' || item.getAttribute('data-category') === filter) {
          item.style.display = '';
          item.style.animation = 'fadeInUp 0.4s var(--ease-out)';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });

  // ============ Gallery Lightbox ============
  document.querySelectorAll('[data-lightbox]').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const src = trigger.getAttribute('data-lightbox') || trigger.querySelector('img')?.src;
      if (!src) return;

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay active';
      overlay.style.cursor = 'pointer';
      overlay.innerHTML = `
        <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-width:90vw;max-height:90vh;z-index:9999;">
          <img src="${src}" style="max-width:90vw;max-height:90vh;border-radius:16px;box-shadow:0 16px 60px rgba(0,0,0,0.3);" />
        </div>
      `;
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      overlay.addEventListener('click', () => {
        overlay.remove();
        document.body.style.overflow = '';
      });
    });
  });

  // ============ Parallax ============
  const parallaxElements = document.querySelectorAll('[data-parallax]');

  if (parallaxElements.length > 0) {
    window.addEventListener('scroll', () => {
      const scrollY = window.pageYOffset;
      parallaxElements.forEach(el => {
        const speed = parseFloat(el.getAttribute('data-parallax')) || 0.3;
        const rect = el.getBoundingClientRect();
        const inView = rect.top < window.innerHeight && rect.bottom > 0;
        if (inView) {
          el.style.transform = `translateY(${scrollY * speed * 0.1}px)`;
        }
      });
    }, { passive: true });
  }

  // ============ FAQ expand ============
  document.querySelectorAll('.faq-question').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.closest('.faq-item');
      const answer = item.querySelector('.faq-answer');
      const isActive = item.classList.contains('active');

      item.closest('.faq-list')?.querySelectorAll('.faq-item.active').forEach(activeItem => {
        if (activeItem !== item) {
          activeItem.classList.remove('active');
          activeItem.querySelector('.faq-answer').style.maxHeight = '0';
        }
      });

      item.classList.toggle('active');
      if (!isActive) {
        answer.style.maxHeight = answer.scrollHeight + 'px';
      } else {
        answer.style.maxHeight = '0';
      }
    });
  });

  // ============ Date picker min date (today) ============
  const dateInputs = document.querySelectorAll('input[type="date"]');
  const today = new Date().toISOString().split('T')[0];
  dateInputs.forEach(input => {
    input.setAttribute('min', today);
  });

  // ============ Phone number auto-format ============
  document.querySelectorAll('input[type="tel"]').forEach(input => {
    input.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length > 11) val = val.slice(0, 11);
      if (val.length > 7) {
        val = val.replace(/(\d{3})(\d{4})(\d{0,4})/, '$1-$2-$3');
      } else if (val.length > 3) {
        val = val.replace(/(\d{3})(\d{0,4})/, '$1-$2');
      }
      e.target.value = val;
    });
  });

  // ============ I13 Infinite Scroll ============
  const infiniteContainers = document.querySelectorAll('[data-infinite]');

  infiniteContainers.forEach(container => {
    const sentinel = document.createElement('div');
    sentinel.className = 'infinite-sentinel';
    sentinel.style.height = '1px';
    container.appendChild(sentinel);

    let page = 1;
    let loading = false;
    const maxPages = parseInt(container.getAttribute('data-infinite-max') || '3', 10);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !loading && page < maxPages) {
          loading = true;
          page++;

          const loadingEl = document.createElement('div');
          loadingEl.className = 'text-center pt-md pb-md';
          loadingEl.innerHTML = '<div class="loader-spinner mx-auto"></div>';
          container.insertBefore(loadingEl, sentinel);

          setTimeout(() => {
            loadingEl.remove();
            const event = new CustomEvent('infinite-load', { detail: { page } });
            container.dispatchEvent(event);
            loading = false;

            if (page >= maxPages) {
              observer.unobserve(sentinel);
              const endMsg = document.createElement('p');
              endMsg.className = 'text-center body-sm';
              endMsg.style.color = 'var(--gray-500)';
              endMsg.style.padding = '32px 0';
              endMsg.textContent = '모든 결과를 불러왔습니다.';
              container.insertBefore(endMsg, sentinel);
            }
          }, 1000);
        }
      });
    }, { rootMargin: '200px' });

    observer.observe(sentinel);
  });

  // ============ Marquee / Infinite scroll text ============
  document.querySelectorAll('.marquee-track').forEach(track => {
    const content = track.innerHTML;
    track.innerHTML = content + content;
  });

  // ============ Number input constraints ============
  document.querySelectorAll('input[data-max]').forEach(input => {
    input.addEventListener('input', () => {
      const max = parseInt(input.getAttribute('data-max'), 10);
      if (parseInt(input.value, 10) > max) {
        input.value = max;
      }
    });
  });

  // ============ Keyboard accessibility for sliders ============
  document.querySelectorAll('.comparison-slider').forEach(slider => {
    slider.setAttribute('tabindex', '0');
    slider.setAttribute('role', 'slider');
    slider.setAttribute('aria-label', 'Before and After comparison');

    slider.addEventListener('keydown', (e) => {
      const handle = slider.querySelector('.slider-handle');
      const beforeImg = slider.querySelector('.before-img');
      let current = parseFloat(handle.style.left) || 50;

      if (e.key === 'ArrowLeft') {
        current = Math.max(0, current - 2);
      } else if (e.key === 'ArrowRight') {
        current = Math.min(100, current + 2);
      } else {
        return;
      }

      e.preventDefault();
      handle.style.left = current + '%';
      beforeImg.style.clipPath = `inset(0 ${100 - current}% 0 0)`;
    });
  });
});
