/* ============================================================
   NOIR — Cocktail & Whiskey Lounge
   인터랙션 스크립트
   ============================================================ */

(function () {
  'use strict';

  // 모바일 감지
  const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  // ==============================
  // 0. 로딩 화면
  // ==============================
  var loader = document.getElementById('loader');
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (loader) loader.classList.add('hidden');
    }, 2000);
  });

  // ==============================
  // 0.5. 스크롤 프로그레스 바
  // ==============================
  var scrollProgress = document.getElementById('scrollProgress');
  function updateScrollProgress() {
    var scrollTop = window.scrollY;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var percent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    if (scrollProgress) scrollProgress.style.width = percent + '%';
  }
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  updateScrollProgress();

  // ==============================
  // 1. 커스텀 커서 (I2 커서 글로우)
  // ==============================
  if (!isTouchDevice) {
    const dot = document.getElementById('cursorDot');
    const glow = document.getElementById('cursorGlow');
    const cursorText = document.getElementById('cursorText');
    const ambientLight = document.getElementById('ambientLight');

    let mouseX = 0, mouseY = 0;
    let dotX = 0, dotY = 0;
    let glowX = 0, glowY = 0;

    document.addEventListener('mousemove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    function animateCursor() {
      // dot: fast follow
      dotX += (mouseX - dotX) * 0.2;
      dotY += (mouseY - dotY) * 0.2;
      dot.style.left = dotX + 'px';
      dot.style.top = dotY + 'px';

      // glow: slower follow
      glowX += (mouseX - glowX) * 0.08;
      glowY += (mouseY - glowY) * 0.08;
      glow.style.left = glowX + 'px';
      glow.style.top = glowY + 'px';

      // cursor text
      cursorText.style.left = dotX + 'px';
      cursorText.style.top = dotY + 'px';

      // ambient light
      ambientLight.style.left = mouseX + 'px';
      ambientLight.style.top = mouseY + 'px';

      requestAnimationFrame(animateCursor);
    }
    animateCursor();

    // 호버 시 커서 확대 + 텍스트
    var hoverTargets = document.querySelectorAll('a, button, .cocktail-image-wrap, .bartender-photo, .reserve-btn');
    hoverTargets.forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        glow.classList.add('expanded');
        cursorText.classList.add('visible');
      });
      el.addEventListener('mouseleave', function () {
        glow.classList.remove('expanded');
        cursorText.classList.remove('visible');
      });
    });

    // 히어로 텍스트 패럴랙스
    var heroText = document.getElementById('heroText');
    var heroSection = document.getElementById('hero');
    heroSection.addEventListener('mousemove', function (e) {
      var rect = heroSection.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width - 0.5;
      var y = (e.clientY - rect.top) / rect.height - 0.5;
      heroText.style.backgroundPosition = (50 + x * 10) + '% ' + (50 + y * 10) + '%';
    });
  }

  // ==============================
  // 2. 텍스트 스크램블 (I30)
  // ==============================
  var scrambleEl = document.getElementById('scrambleText');
  var originalText = scrambleEl ? scrambleEl.getAttribute('data-text') : '';
  var scrambleChars = '!@#$%^&*()_+-=[]{}|;:,.<>?~ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var scrambled = false;
  var scrambleFrames = 0;

  function scrambleText(el, target) {
    var len = target.length;
    var revealed = 0;
    var interval = null;
    var current = [];

    // start fully scrambled
    for (var i = 0; i < len; i++) {
      if (target[i] === ' ') {
        current[i] = ' ';
      } else {
        current[i] = scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
      }
    }
    el.textContent = current.join('');

    interval = setInterval(function () {
      // reveal next character
      if (revealed < len) {
        if (target[revealed] === ' ') {
          current[revealed] = ' ';
        } else {
          current[revealed] = target[revealed];
        }
        revealed++;
      }

      // scramble unrevealed chars
      for (var j = revealed; j < len; j++) {
        if (target[j] !== ' ') {
          current[j] = scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
        }
      }

      el.textContent = current.join('');

      if (revealed >= len) {
        clearInterval(interval);
        el.textContent = target;
      }
    }, 50);
  }

  // ==============================
  // 3. 모핑 블롭 (I9) — CSS only
  // ==============================
  // (블롭 모핑은 CSS @keyframes morph로 구현됨)

  // ==============================
  // 4. 클리핑 서클 전환 (S5)
  // ==============================
  var clipSections = document.querySelectorAll('.clip-circle-section');

  // ==============================
  // 5. IntersectionObserver — fade-in + 스크램블 + 클리핑
  // ==============================
  document.body.classList.add('js-anim');

  var fadeObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right').forEach(function (el) {
    fadeObserver.observe(el);
  });

  // 스크램블 텍스트 observer
  if (scrambleEl) {
    var scrambleObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !scrambled) {
          scrambled = true;
          scrambleText(scrambleEl, originalText);
          scrambleObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    scrambleObserver.observe(scrambleEl);
  }

  // 클리핑 서클 observer
  clipSections.forEach(function (sec) {
    var clipObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
        }
      });
    }, { threshold: 0.05 });
    clipObserver.observe(sec);
  });

  // ==============================
  // 6. 풀스크린 오버레이 내비 (N5)
  // ==============================
  var navToggle = document.getElementById('navToggle');
  var navOverlay = document.getElementById('navOverlay');
  var navLinks = document.querySelectorAll('[data-nav]');

  navToggle.addEventListener('click', function () {
    var isOpen = navOverlay.classList.toggle('open');
    navToggle.classList.toggle('active');
    navOverlay.setAttribute('aria-hidden', !isOpen);
    navToggle.setAttribute('aria-label', isOpen ? '메뉴 닫기' : '메뉴 열기');
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      navOverlay.classList.remove('open');
      navToggle.classList.remove('active');
      navOverlay.setAttribute('aria-hidden', 'true');
      navToggle.setAttribute('aria-label', '메뉴 열기');
      document.body.style.overflow = '';
    });
  });

  // ESC 키로 닫기
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navOverlay.classList.contains('open')) {
      navOverlay.classList.remove('open');
      navToggle.classList.remove('active');
      navOverlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  });

  // ==============================
  // 7. 플로팅 요소 마우스 반응 (I33)
  // ==============================
  if (!isTouchDevice) {
    var floatingElements = document.querySelectorAll('.floating-element');

    document.addEventListener('mousemove', function (e) {
      var mx = e.clientX / window.innerWidth - 0.5;
      var my = e.clientY / window.innerHeight - 0.5;

      floatingElements.forEach(function (el, i) {
        var speed = (i % 3 + 1) * 8;
        var offsetX = mx * speed;
        var offsetY = my * speed;
        el.style.transform = 'translate(' + offsetX + 'px, ' + offsetY + 'px)';
      });
    });
  }

  // ==============================
  // 8. 스무스 앵커 스크롤
  // ==============================
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

  // ==============================
  // 9. 히어로 스크롤 페이드
  // ==============================
  var hero = document.getElementById('hero');
  var scrollIndicator = document.querySelector('.scroll-indicator');

  window.addEventListener('scroll', function () {
    var scrollY = window.scrollY;
    var heroH = hero.offsetHeight;

    // 히어로 패럴랙스 효과
    if (scrollY < heroH) {
      var opacity = 1 - scrollY / heroH;
      hero.style.opacity = Math.max(0, opacity);
    }

    // 스크롤 인디케이터 숨기기
    if (scrollIndicator) {
      scrollIndicator.style.opacity = scrollY > 100 ? '0' : '1';
    }
  }, { passive: true });

  // ==============================
  // 10. 예약 섹션 텍스트 마스킹 모바일 폴백
  // ==============================
  function checkReserveTextMask() {
    var reserveText = document.getElementById('reserveText');
    if (!reserveText) return;

    if (window.innerWidth <= 768) {
      reserveText.style.backgroundImage = 'none';
      reserveText.style.webkitBackgroundClip = 'unset';
      reserveText.style.backgroundClip = 'unset';
      reserveText.style.webkitTextFillColor = '#0A0A0A';
      reserveText.style.color = '#0A0A0A';
    } else {
      reserveText.style.backgroundImage = '';
      reserveText.style.webkitBackgroundClip = '';
      reserveText.style.backgroundClip = '';
      reserveText.style.webkitTextFillColor = '';
      reserveText.style.color = '';
    }
  }

  checkReserveTextMask();
  window.addEventListener('resize', checkReserveTextMask);

  // ==============================
  // 11. 스킬바 애니메이션
  // ==============================
  var skillBars = document.querySelectorAll('.skill-bar-fill');
  if (skillBars.length > 0) {
    var skillObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
          skillObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    skillBars.forEach(function (bar) {
      skillObserver.observe(bar);
    });
  }

  // ==============================
  // 12. 이미지 듀오톤 hover 효과
  // ==============================
  var imageWraps = document.querySelectorAll('.cocktail-image-wrap img, .bartender-photo img, .space-img img');
  imageWraps.forEach(function (img) {
    img.addEventListener('mouseenter', function () {
      this.style.filter = 'sepia(0.1) saturate(1.4) brightness(1.1) hue-rotate(-5deg)';
    });
    img.addEventListener('mouseleave', function () {
      this.style.filter = '';
    });
  });

  // ==============================
  // 13. 네비게이션 스크롤 활성 상태
  // ==============================
  var sections = document.querySelectorAll('section[id], div[id]');
  var navMenuLinks = document.querySelectorAll('.nav-menu a');

  function highlightNavOnScroll() {
    var scrollY = window.scrollY + window.innerHeight / 3;

    sections.forEach(function (section) {
      var top = section.offsetTop;
      var height = section.offsetHeight;
      var id = section.getAttribute('id');

      if (scrollY >= top && scrollY < top + height) {
        navMenuLinks.forEach(function (link) {
          link.style.opacity = link.getAttribute('href') === '#' + id ? '1' : '0.6';
        });
      }
    });
  }

  window.addEventListener('scroll', highlightNavOnScroll, { passive: true });

})();
