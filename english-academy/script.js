/* ============================================================
   Bright English Academy — Common Scripts (script.js)
   ============================================================ */

(function () {
  'use strict';

  /* ==========================================================
     1. DARK MODE TOGGLE
     ========================================================== */
  const DarkMode = {
    key: 'bright-english-theme',

    init() {
      const saved = localStorage.getItem(this.key);
      if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }

      const toggleBtn = document.querySelector('.dark-mode-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => this.toggle());
      }
    },

    toggle() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(this.key, next);
    }
  };

  /* ==========================================================
     2. SIDE DRAWER NAVIGATION
     ========================================================== */
  const Drawer = {
    init() {
      this.hamburger = document.querySelector('.hamburger-btn');
      this.drawer = document.querySelector('.side-drawer');
      this.overlay = document.querySelector('.drawer-overlay');
      this.body = document.body;

      if (!this.hamburger || !this.drawer) return;

      this.hamburger.addEventListener('click', () => this.toggle());

      if (this.overlay) {
        this.overlay.addEventListener('click', () => this.close());
      }

      // Close on ESC
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen()) {
          this.close();
        }
      });

      // Close on link click
      const links = this.drawer.querySelectorAll('a');
      links.forEach(link => {
        link.addEventListener('click', () => this.close());
      });
    },

    isOpen() {
      return this.drawer && this.drawer.classList.contains('active');
    },

    toggle() {
      if (this.isOpen()) {
        this.close();
      } else {
        this.open();
      }
    },

    open() {
      this.drawer.classList.add('active');
      this.hamburger.classList.add('active');
      if (this.overlay) this.overlay.classList.add('active');
      this.body.classList.add('drawer-open');
    },

    close() {
      this.drawer.classList.remove('active');
      this.hamburger.classList.remove('active');
      if (this.overlay) this.overlay.classList.remove('active');
      this.body.classList.remove('drawer-open');
    }
  };

  /* ==========================================================
     3. CUSTOM CURSOR
     ========================================================== */
  const CustomCursor = {
    init() {
      // Only on non-touch devices
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

      this.cursor = document.querySelector('.custom-cursor');
      this.cursorDot = document.querySelector('.custom-cursor-dot');
      if (!this.cursor || !this.cursorDot) return;

      this.mouseX = 0;
      this.mouseY = 0;
      this.cursorX = 0;
      this.cursorY = 0;
      this.dotX = 0;
      this.dotY = 0;

      document.addEventListener('mousemove', (e) => {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;

        if (!this.cursor.classList.contains('visible')) {
          this.cursor.classList.add('visible');
          this.cursorDot.classList.add('visible');
        }
      });

      document.addEventListener('mouseleave', () => {
        this.cursor.classList.remove('visible');
        this.cursorDot.classList.remove('visible');
      });

      // Hover effect for interactive elements
      const hoverTargets = document.querySelectorAll('a, button, .card, .masonry-item, .review-card, [role="button"]');
      hoverTargets.forEach(el => {
        el.addEventListener('mouseenter', () => this.cursor.classList.add('hovering'));
        el.addEventListener('mouseleave', () => this.cursor.classList.remove('hovering'));
      });

      this.animate();
    },

    animate() {
      // Smooth follow with lerp
      this.cursorX += (this.mouseX - this.cursorX) * 0.15;
      this.cursorY += (this.mouseY - this.cursorY) * 0.15;
      this.dotX += (this.mouseX - this.dotX) * 0.8;
      this.dotY += (this.mouseY - this.dotY) * 0.8;

      if (this.cursor) {
        this.cursor.style.left = this.cursorX + 'px';
        this.cursor.style.top = this.cursorY + 'px';
      }
      if (this.cursorDot) {
        this.cursorDot.style.left = this.dotX + 'px';
        this.cursorDot.style.top = this.dotY + 'px';
      }

      requestAnimationFrame(() => this.animate());
    }
  };

  /* ==========================================================
     4. SCROLL-TRIGGERED ANIMATIONS
     ========================================================== */
  const ScrollAnimations = {
    init() {
      const targets = document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right, .scale-in');
      if (!targets.length) return;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
      });

      targets.forEach(el => observer.observe(el));

      // Stagger children
      const staggerParents = document.querySelectorAll('[data-stagger]');
      const staggerObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const children = entry.target.querySelectorAll('.stagger-child');
            children.forEach((child, i) => {
              setTimeout(() => {
                child.classList.add('visible');
              }, i * 100);
            });
            staggerObserver.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.1
      });

      staggerParents.forEach(el => staggerObserver.observe(el));
    }
  };

  /* ==========================================================
     5. COUNTER ANIMATION
     ========================================================== */
  const CounterAnimation = {
    init() {
      const counters = document.querySelectorAll('[data-counter]');
      if (!counters.length) return;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.3
      });

      counters.forEach(el => observer.observe(el));
    },

    animateCounter(el) {
      const target = parseInt(el.getAttribute('data-counter'), 10);
      const duration = parseInt(el.getAttribute('data-duration') || '2000', 10);
      const startTime = performance.now();

      const step = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(easeOut * target);

        el.textContent = current.toLocaleString();

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          el.textContent = target.toLocaleString();
        }
      };

      requestAnimationFrame(step);
    }
  };

  /* ==========================================================
     6. PARALLAX EFFECT
     ========================================================== */
  const Parallax = {
    init() {
      this.elements = document.querySelectorAll('[data-parallax]');
      if (!this.elements.length) return;

      // Only on non-touch devices
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

      let ticking = false;
      window.addEventListener('scroll', () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            this.update();
            ticking = false;
          });
          ticking = true;
        }
      });
    },

    update() {
      const scrollY = window.pageYOffset;

      this.elements.forEach(el => {
        const speed = parseFloat(el.getAttribute('data-parallax')) || 0.5;
        const rect = el.getBoundingClientRect();
        const elTop = rect.top + scrollY;
        const offset = (scrollY - elTop) * speed;

        el.style.transform = `translateY(${offset}px)`;
      });
    }
  };

  /* ==========================================================
     7. TAB UI
     ========================================================== */
  const TabUI = {
    init() {
      const tabGroups = document.querySelectorAll('[data-tabs]');
      if (!tabGroups.length) return;

      tabGroups.forEach(group => {
        const buttons = group.querySelectorAll('.tab-btn');
        const tabId = group.getAttribute('data-tabs');
        const contentContainer = document.querySelector(`[data-tab-content="${tabId}"]`);

        if (!contentContainer) return;

        const contents = contentContainer.querySelectorAll('.tab-content');

        buttons.forEach(btn => {
          btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');

            // Deactivate all
            buttons.forEach(b => b.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Activate target
            btn.classList.add('active');
            const targetContent = contentContainer.querySelector(`[data-tab-id="${target}"]`);
            if (targetContent) {
              targetContent.classList.add('active');
            }
          });
        });
      });
    }
  };

  /* ==========================================================
     8. ACCORDION
     ========================================================== */
  const Accordion = {
    init() {
      const headers = document.querySelectorAll('.accordion-header');
      if (!headers.length) return;

      headers.forEach(header => {
        header.addEventListener('click', () => {
          const item = header.closest('.accordion-item');
          if (!item) return;

          const isActive = item.classList.contains('active');
          const parent = item.closest('.accordion-group');

          // Close siblings if in a group
          if (parent) {
            const siblings = parent.querySelectorAll('.accordion-item');
            siblings.forEach(sib => sib.classList.remove('active'));
          }

          // Toggle current
          if (!isActive) {
            item.classList.add('active');
          }
        });
      });
    }
  };

  /* ==========================================================
     9. SMOOTH SCROLL FOR ANCHOR LINKS
     ========================================================== */
  const SmoothScroll = {
    init() {
      document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
          const href = link.getAttribute('href');
          if (href === '#' || href === '#!') return;

          const target = document.querySelector(href);
          if (!target) return;

          e.preventDefault();
          const headerHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height'), 10) || 72;
          const top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20;

          window.scrollTo({
            top,
            behavior: 'smooth'
          });
        });
      });
    }
  };

  /* ==========================================================
     10. HEADER SCROLL EFFECT
     ========================================================== */
  const HeaderScroll = {
    init() {
      const header = document.querySelector('.site-header');
      if (!header) return;

      let ticking = false;
      window.addEventListener('scroll', () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            if (window.scrollY > 50) {
              header.classList.add('scrolled');
            } else {
              header.classList.remove('scrolled');
            }
            ticking = false;
          });
          ticking = true;
        }
      });
    }
  };

  /* ==========================================================
     11. BACK TO TOP BUTTON
     ========================================================== */
  const BackToTop = {
    init() {
      const btn = document.querySelector('.back-to-top');
      if (!btn) return;

      let ticking = false;
      window.addEventListener('scroll', () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            if (window.scrollY > 600) {
              btn.classList.add('visible');
            } else {
              btn.classList.remove('visible');
            }
            ticking = false;
          });
          ticking = true;
        }
      });

      btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  };

  /* ==========================================================
     12. LIGHTBOX (Gallery)
     ========================================================== */
  const Lightbox = {
    init() {
      this.overlay = document.querySelector('.lightbox-overlay');
      this.content = document.querySelector('.lightbox-content');
      this.closeBtn = document.querySelector('.lightbox-close');
      if (!this.overlay) return;

      // Open triggers
      document.querySelectorAll('[data-lightbox]').forEach(trigger => {
        trigger.addEventListener('click', () => {
          const html = trigger.getAttribute('data-lightbox-content') || '';
          const bgColor = trigger.getAttribute('data-lightbox-color') || '#DBEAFE';
          const caption = trigger.getAttribute('data-lightbox-caption') || '';

          if (this.content) {
            this.content.innerHTML = `
              <div style="width: 80vw; max-width: 800px; aspect-ratio: 16/10; background: ${bgColor}; display: flex; align-items: center; justify-content: center; font-family: var(--font-body); color: rgba(0,0,0,0.3); font-size: 1.2rem;">${html || caption}</div>
            `;
          }
          this.open();
        });
      });

      // Close
      if (this.closeBtn) {
        this.closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.close();
        });
      }
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
          this.close();
        }
      });
    },

    open() {
      this.overlay.classList.add('active');
      document.body.classList.add('lightbox-open');
    },

    close() {
      this.overlay.classList.remove('active');
      document.body.classList.remove('lightbox-open');
    }
  };

  /* ==========================================================
     13. GALLERY FILTER
     ========================================================== */
  const GalleryFilter = {
    init() {
      const filterBtns = document.querySelectorAll('.filter-btn');
      const items = document.querySelectorAll('[data-filter-category]');
      if (!filterBtns.length || !items.length) return;

      filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const category = btn.getAttribute('data-filter');

          // Update active button
          filterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          // Filter items
          items.forEach(item => {
            const itemCat = item.getAttribute('data-filter-category');
            if (category === 'all' || itemCat === category) {
              item.style.display = '';
              item.style.opacity = '0';
              item.style.transform = 'scale(0.9)';
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  item.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                  item.style.opacity = '1';
                  item.style.transform = 'scale(1)';
                });
              });
            } else {
              item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
              item.style.opacity = '0';
              item.style.transform = 'scale(0.9)';
              setTimeout(() => {
                item.style.display = 'none';
              }, 300);
            }
          });
        });
      });
    }
  };

  /* ==========================================================
     14. MARQUEE PAUSE ON HOVER (already in CSS, but ensure JS backup)
     ========================================================== */
  const MarqueePause = {
    init() {
      const tracks = document.querySelectorAll('.marquee-track');
      tracks.forEach(track => {
        track.addEventListener('mouseenter', () => {
          track.style.animationPlayState = 'paused';
        });
        track.addEventListener('mouseleave', () => {
          track.style.animationPlayState = 'running';
        });
      });
    }
  };

  /* ==========================================================
     15. HORIZONTAL SCROLL (TIMELINE)
     ========================================================== */
  const HorizontalScroll = {
    init() {
      const containers = document.querySelectorAll('.horizontal-scroll');
      containers.forEach(container => {
        // Allow mouse wheel horizontal scroll
        container.addEventListener('wheel', (e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.preventDefault();
            container.scrollLeft += e.deltaY;
          }
        }, { passive: false });
      });
    }
  };

  /* ==========================================================
     16. FORM VALIDATION (Contact page)
     ========================================================== */
  const FormValidation = {
    init() {
      const form = document.querySelector('#contact-form');
      if (!form) return;

      form.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = form.querySelector('[name="name"]');
        const email = form.querySelector('[name="email"]');
        const message = form.querySelector('[name="message"]');
        let valid = true;

        // Simple validation
        [name, email, message].forEach(field => {
          if (field && !field.value.trim()) {
            field.style.borderColor = '#EF4444';
            valid = false;
          } else if (field) {
            field.style.borderColor = '';
          }
        });

        if (email && email.value && !email.value.includes('@')) {
          email.style.borderColor = '#EF4444';
          valid = false;
        }

        if (valid) {
          // Show success message
          const btn = form.querySelector('button[type="submit"]');
          if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span>전송 완료!</span>';
            btn.style.background = '#10B981';
            btn.style.borderColor = '#10B981';
            btn.style.color = '#fff';
            btn.disabled = true;

            setTimeout(() => {
              btn.innerHTML = originalText;
              btn.style.background = '';
              btn.style.borderColor = '';
              btn.style.color = '';
              btn.disabled = false;
              form.reset();
            }, 3000);
          }
        }
      });
    }
  };

  /* ==========================================================
     17. HERO LETTER ANIMATION
     ========================================================== */
  const HeroLetterAnimation = {
    init() {
      const heroTitle = document.querySelector('[data-hero-animate]');
      if (!heroTitle) return;

      const text = heroTitle.textContent;
      heroTitle.textContent = '';
      heroTitle.style.opacity = '1';

      text.split('').forEach((char, i) => {
        const span = document.createElement('span');
        span.textContent = char === ' ' ? '\u00A0' : char;
        span.style.display = 'inline-block';
        span.style.opacity = '0';
        span.style.transform = 'translateY(40px)';
        span.style.transition = `opacity 0.5s ease ${i * 0.05}s, transform 0.5s ease ${i * 0.05}s`;
        heroTitle.appendChild(span);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            span.style.opacity = '1';
            span.style.transform = 'translateY(0)';
          });
        });
      });
    }
  };

  /* ==========================================================
     18. PAGE TRANSITION
     ========================================================== */
  const PageTransition = {
    init() {
      // Fade in on load
      document.body.style.opacity = '0';
      document.body.style.transition = 'opacity 0.4s ease';
      requestAnimationFrame(() => {
        document.body.style.opacity = '1';
      });
    }
  };

  /* ==========================================================
     19. ACTIVE NAV LINK HIGHLIGHT
     ========================================================== */
  const ActiveNav = {
    init() {
      const currentPath = window.location.pathname.split('/').pop() || 'index.html';
      const links = document.querySelectorAll('.drawer-nav-item a');

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath || (currentPath === '' && href === 'index.html')) {
          link.classList.add('active');
        }
      });
    }
  };

  /* ==========================================================
     INITIALIZE ALL MODULES
     ========================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    DarkMode.init();
    Drawer.init();
    CustomCursor.init();
    ScrollAnimations.init();
    CounterAnimation.init();
    Parallax.init();
    TabUI.init();
    Accordion.init();
    SmoothScroll.init();
    HeaderScroll.init();
    BackToTop.init();
    Lightbox.init();
    GalleryFilter.init();
    MarqueePause.init();
    HorizontalScroll.init();
    FormValidation.init();
    HeroLetterAnimation.init();
    PageTransition.init();
    ActiveNav.init();
  });

})();
