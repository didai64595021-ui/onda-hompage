/* ========================================
   마르다누수탐지 — main.js
   Interactions: I4 패럴랙스, I8 텍스트 스크러빙,
   I22 웨이브, I29 비포/애프터, I27 스티키
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initParallax();
  initTextScrub();
  initCountUp();
  initBeforeAfter();
  initScrollReveal();
  initServiceNav();
});

/* --- Navigation --- */
function initNav() {
  const nav = document.querySelector('.nav');
  const hamburger = document.querySelector('.nav__hamburger');
  const menu = document.querySelector('.nav__menu');
  const overlay = document.querySelector('.nav__menu-overlay');
  const menuLinks = document.querySelectorAll('.nav__menu-list a');

  // Scroll state
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const current = window.scrollY;
    if (current > 80) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
    lastScroll = current;
  }, { passive: true });

  // Hamburger toggle
  function toggleMenu() {
    hamburger.classList.toggle('active');
    menu.classList.toggle('active');
    overlay.classList.toggle('active');
    document.body.style.overflow = menu.classList.contains('active') ? 'hidden' : '';
  }

  hamburger.addEventListener('click', toggleMenu);
  overlay.addEventListener('click', toggleMenu);

  menuLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (menu.classList.contains('active')) {
        toggleMenu();
      }
    });
  });
}

/* --- I4: Parallax (Hero Background) --- */
function initParallax() {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  const particles = hero.querySelector('.hero__particles');

  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    const heroH = hero.offsetHeight;
    if (scrolled > heroH) return;

    const rate = scrolled * 0.3;
    if (particles) {
      particles.style.transform = `translateY(${rate}px)`;
    }
  }, { passive: true });
}

/* --- I8: Text Scrub on Scroll --- */
function initTextScrub() {
  const section = document.querySelector('.text-scrub');
  if (!section) return;

  const textEl = section.querySelector('.text-scrub__text');
  const subEl = section.querySelector('.text-scrub__sub');

  window.addEventListener('scroll', () => {
    const rect = section.getBoundingClientRect();
    const sectionH = section.offsetHeight;
    const viewH = window.innerHeight;

    // Calculate progress: 0 at section start, 100 at section end
    const scrolled = -rect.top;
    const total = sectionH - viewH;
    let progress = (scrolled / total) * 100;
    progress = Math.max(0, Math.min(100, progress));

    textEl.style.setProperty('--scrub-progress', progress + '%');

    // Show sub text when progress > 70%
    if (progress > 70) {
      subEl.classList.add('visible');
    } else {
      subEl.classList.remove('visible');
    }
  }, { passive: true });
}

/* --- Count Up Animation (Hero Stats) --- */
function initCountUp() {
  const statNumbers = document.querySelectorAll('.hero__stat-number');
  if (!statNumbers.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.target, 10);
        const suffix = el.dataset.suffix || '';
        const duration = 2000;
        const startTime = performance.now();

        function update(currentTime) {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // easeOutExpo
          const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
          const current = Math.floor(eased * target);
          el.innerHTML = current.toLocaleString() + '<span class="accent">' + suffix + '</span>';

          if (progress < 1) {
            requestAnimationFrame(update);
          }
        }

        requestAnimationFrame(update);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  statNumbers.forEach(num => observer.observe(num));
}

/* --- I29: Before/After Slider --- */
function initBeforeAfter() {
  const slider = document.querySelector('.before-after__slider');
  if (!slider) return;

  const beforeImg = slider.querySelector('.before-after__img--before');
  const handle = slider.querySelector('.before-after__handle');
  let isDragging = false;

  function updatePosition(x) {
    const rect = slider.getBoundingClientRect();
    let pos = ((x - rect.left) / rect.width) * 100;
    pos = Math.max(2, Math.min(98, pos));

    beforeImg.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
    handle.style.left = pos + '%';
  }

  // Mouse events
  slider.addEventListener('mousedown', (e) => {
    isDragging = true;
    updatePosition(e.clientX);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    updatePosition(e.clientX);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Touch events
  slider.addEventListener('touchstart', (e) => {
    isDragging = true;
    updatePosition(e.touches[0].clientX);
  }, { passive: true });

  slider.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    updatePosition(e.touches[0].clientX);
  }, { passive: false });

  slider.addEventListener('touchend', () => {
    isDragging = false;
  });
}

/* --- Scroll Reveal (IntersectionObserver stagger) --- */
function initScrollReveal() {
  const elements = document.querySelectorAll('.fade-in, .services__card, .process__step');
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        // Stagger delay
        const delay = (entry.target.dataset.delay || 0) * 100;
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  });

  elements.forEach(el => observer.observe(el));
}

/* --- Service Navigation (Split Screen) --- */
function initServiceNav() {
  const navItems = document.querySelectorAll('.services__nav-item');
  const cards = document.querySelectorAll('.services__card');
  if (!navItems.length || !cards.length) return;

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.dataset.target;
      const targetCard = document.getElementById(targetId);
      if (!targetCard) return;

      // Update active state
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      // Scroll to card
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // Update active nav on scroll
  const serviceObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navItems.forEach(n => {
          n.classList.toggle('active', n.dataset.target === id);
        });
      }
    });
  }, { threshold: 0.5 });

  cards.forEach(card => serviceObserver.observe(card));
}
