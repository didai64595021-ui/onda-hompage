/* ============================================
   쓰리웨이펜션 — Award-Level 인터랙션
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* --- 1. Glass Nav 스크롤 효과 --- */
  const nav = document.querySelector('.nav');
  if (nav) {
    const checkScroll = () => {
      if (window.scrollY > 50) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    };
    checkScroll();
    window.addEventListener('scroll', checkScroll, { passive: true });
  }

  /* --- 2. 풀스크린 모바일 메뉴 --- */
  const hamburger = document.querySelector('.hamburger');
  const mobileOverlay = document.querySelector('.mobile-menu-overlay');

  if (hamburger && mobileOverlay) {
    hamburger.addEventListener('click', () => {
      const isActive = hamburger.classList.toggle('active');
      if (isActive) {
        mobileOverlay.style.display = 'flex';
        requestAnimationFrame(() => {
          mobileOverlay.classList.add('active');
        });
        document.body.style.overflow = 'hidden';
      } else {
        mobileOverlay.classList.remove('active');
        setTimeout(() => { mobileOverlay.style.display = 'none'; }, 400);
        document.body.style.overflow = '';
      }
    });

    mobileOverlay.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        mobileOverlay.classList.remove('active');
        setTimeout(() => { mobileOverlay.style.display = 'none'; }, 400);
        document.body.style.overflow = '';
      });
    });

    const closeBtn = mobileOverlay.querySelector('.mobile-menu-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        hamburger.classList.remove('active');
        mobileOverlay.classList.remove('active');
        setTimeout(() => { mobileOverlay.style.display = 'none'; }, 400);
        document.body.style.overflow = '';
      });
    }
  }

  /* --- 3. 현재 페이지 메뉴 하이라이트 --- */
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-menu a, .mobile-menu-overlay a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage) {
      link.classList.add('active');
    }
  });

  /* --- 4. 히어로 슬라이더 --- */
  const heroSlider = document.querySelector('.hero-slider');
  if (heroSlider) {
    const slides = heroSlider.querySelectorAll('.hero-slide');
    const dots = heroSlider.querySelectorAll('.hero-dot');
    let current = 0;
    let interval;

    const goTo = (idx) => {
      slides[current].classList.remove('active');
      if (dots[current]) dots[current].classList.remove('active');
      // Reset Ken Burns
      const oldImg = slides[current].querySelector('img');
      if (oldImg) { oldImg.style.animation = 'none'; oldImg.offsetHeight; oldImg.style.animation = ''; }

      current = idx % slides.length;
      slides[current].classList.add('active');
      if (dots[current]) dots[current].classList.add('active');
    };

    const next = () => goTo(current + 1);

    const startAuto = () => {
      clearInterval(interval);
      interval = setInterval(next, 5000);
    };

    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => { goTo(i); startAuto(); });
    });

    // Touch swipe support
    let touchStartX = 0;
    heroSlider.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    heroSlider.addEventListener('touchend', (e) => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) { goTo(current + 1); } else { goTo((current - 1 + slides.length) % slides.length); }
        startAuto();
      }
    }, { passive: true });

    startAuto();
  }

  /* --- 5. 스크롤 reveal (UIUX B조) --- */
  document.body.classList.add('js-scroll-reveal');
  const fadeEls = document.querySelectorAll('.fade-in');
  if (fadeEls.length > 0 && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -20px 0px' });
    fadeEls.forEach(el => observer.observe(el));
    setTimeout(() => { fadeEls.forEach(el => { if (!el.classList.contains('revealed')) el.classList.add('revealed'); }); }, 800);
  } else {
    fadeEls.forEach(el => el.classList.add('revealed'));
  }

  /* --- 6. 아코디언 --- */
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const body = item.querySelector('.accordion-body');
      const isOpen = item.classList.contains('open');
      const accordion = item.closest('.accordion');
      if (accordion) {
        accordion.querySelectorAll('.accordion-item.open').forEach(openItem => {
          if (openItem !== item) {
            openItem.classList.remove('open');
            openItem.querySelector('.accordion-body').style.maxHeight = '0';
          }
        });
      }
      if (isOpen) { item.classList.remove('open'); body.style.maxHeight = '0'; }
      else { item.classList.add('open'); body.style.maxHeight = body.scrollHeight + 'px'; }
    });
  });

  /* --- 7. 탭 --- */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabGroup = btn.closest('.tab-section') || btn.closest('section');
      const target = btn.dataset.tab;
      tabGroup.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tabGroup.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        if (c.id === target) c.classList.add('active');
      });
    });
  });

  /* --- 8. 라이트박스 --- */
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = lightbox ? lightbox.querySelector('img') : null;
  const lightboxClose = lightbox ? lightbox.querySelector('.lightbox-close') : null;

  document.querySelectorAll('[data-lightbox]').forEach(trigger => {
    trigger.addEventListener('click', () => {
      if (!lightbox || !lightboxImg) return;
      const src = trigger.dataset.lightbox || trigger.querySelector('img')?.src;
      if (src) { lightboxImg.src = src; lightbox.classList.add('active'); document.body.style.overflow = 'hidden'; }
    });
  });
  if (lightboxClose) lightboxClose.addEventListener('click', () => { lightbox.classList.remove('active'); document.body.style.overflow = ''; });
  if (lightbox) lightbox.addEventListener('click', (e) => { if (e.target === lightbox) { lightbox.classList.remove('active'); document.body.style.overflow = ''; } });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (lightbox && lightbox.classList.contains('active')) { lightbox.classList.remove('active'); document.body.style.overflow = ''; }
      document.querySelectorAll('.modal-overlay.active').forEach(m => { m.classList.remove('active'); document.body.style.overflow = ''; });
    }
  });

  /* --- 9. 객실 모달 --- */
  document.querySelectorAll('[data-modal]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = document.getElementById(trigger.dataset.modal);
      if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
    });
  });
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const overlay = btn.closest('.modal-overlay');
      if (overlay) { overlay.classList.remove('active'); document.body.style.overflow = ''; }
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.classList.remove('active'); document.body.style.overflow = ''; } });
  });

  /* --- 10. 객실 갤러리 슬라이더 --- */
  document.querySelectorAll('.room-gallery-slider').forEach(slider => {
    const track = slider.querySelector('.room-gallery-track');
    const slides = slider.querySelectorAll('.room-slide');
    const dots = slider.querySelectorAll('.room-gallery-dot');
    const prevBtn = slider.querySelector('.room-gallery-arrow.prev');
    const nextBtn = slider.querySelector('.room-gallery-arrow.next');
    if (!track || slides.length === 0) return;

    let idx = 0;
    const goTo = (i) => {
      idx = Math.max(0, Math.min(i, slides.length - 1));
      track.scrollTo({ left: idx * track.clientWidth, behavior: 'smooth' });
      dots.forEach((d, di) => d.classList.toggle('active', di === idx));
    };

    if (prevBtn) prevBtn.addEventListener('click', () => goTo(idx - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goTo(idx + 1));
    dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));

    // Swipe
    let sx = 0;
    track.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', (e) => {
      const diff = sx - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) { diff > 0 ? goTo(idx + 1) : goTo(idx - 1); }
    }, { passive: true });

    // Sync dots on scroll
    track.addEventListener('scroll', () => {
      const newIdx = Math.round(track.scrollLeft / track.clientWidth);
      if (newIdx !== idx && newIdx >= 0 && newIdx < slides.length) {
        idx = newIdx;
        dots.forEach((d, di) => d.classList.toggle('active', di === idx));
      }
    }, { passive: true });
  });

  /* --- 11. 앵커 스크롤 --- */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - 92;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  /* --- 12. 스크롤 다운 화살표 --- */
  const scrollDown = document.querySelector('.hero-scroll-down');
  if (scrollDown) {
    scrollDown.addEventListener('click', () => {
      const heroSlider = document.querySelector('.hero-slider');
      if (heroSlider) {
        const bottom = heroSlider.getBoundingClientRect().bottom + window.scrollY;
        window.scrollTo({ top: bottom, behavior: 'smooth' });
      }
    });
  }
});
