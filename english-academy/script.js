/* ============================================================
   Bright English Academy - Interactive Scripts
   Version: 1.0
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ============================================================
    // 1. Header Scroll Effect
    // ============================================================
    const initHeaderScroll = () => {
        const header = document.querySelector('.header');
        if (!header) return;

        let lastScrollY = 0;
        let ticking = false;

        const handleScroll = () => {
            const currentScrollY = window.scrollY;

            if (currentScrollY > 80) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }

            // Optional: hide header on scroll down, show on scroll up
            if (currentScrollY > lastScrollY && currentScrollY > 300) {
                header.style.transform = 'translateY(-100%)';
            } else {
                header.style.transform = 'translateY(0)';
            }

            lastScrollY = currentScrollY;
            ticking = false;
        };

        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(handleScroll);
                ticking = true;
            }
        }, { passive: true });
    };


    // ============================================================
    // 2. Mobile Nav Toggle
    // ============================================================
    const initMobileNav = () => {
        const navToggle = document.querySelector('.nav-toggle');
        const nav = document.querySelector('.nav');
        if (!navToggle || !nav) return;

        const navLinks = nav.querySelectorAll('.nav-link');

        const toggleNav = () => {
            const isActive = navToggle.classList.toggle('active');
            nav.classList.toggle('active');

            if (isActive) {
                document.body.classList.add('nav-open');
                document.body.style.overflow = 'hidden';
            } else {
                document.body.classList.remove('nav-open');
                document.body.style.overflow = '';
            }
        };

        navToggle.addEventListener('click', toggleNav);

        // Close nav when a link is clicked
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (nav.classList.contains('active')) {
                    toggleNav();
                }
            });
        });

        // Close nav on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && nav.classList.contains('active')) {
                toggleNav();
            }
        });

        // Close nav on clicking outside
        document.addEventListener('click', (e) => {
            if (nav.classList.contains('active') &&
                !nav.contains(e.target) &&
                !navToggle.contains(e.target)) {
                toggleNav();
            }
        });
    };


    // ============================================================
    // 3. Scroll Progress Bar
    // ============================================================
    const initScrollProgress = () => {
        const progressBar = document.querySelector('.scroll-progress-bar');
        if (!progressBar) return;

        let ticking = false;

        const updateProgress = () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
            progressBar.style.width = scrollPercent + '%';
            ticking = false;
        };

        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(updateProgress);
                ticking = true;
            }
        }, { passive: true });

        // Initial call
        updateProgress();
    };


    // ============================================================
    // 4. Particle Animation
    // ============================================================
    const initParticles = () => {
        const canvas = document.getElementById('particles');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width, height;
        let particles = [];
        let mouse = { x: null, y: null, radius: 150 };
        let animationId = null;

        const PARTICLE_COUNT = 85;
        const MAX_LINE_DIST = 120;
        const PARTICLE_COLORS = [
            'rgba(0, 102, 255, 0.5)',
            'rgba(0, 180, 216, 0.4)',
            'rgba(255, 143, 0, 0.3)',
            'rgba(0, 102, 255, 0.3)',
            'rgba(0, 180, 216, 0.3)'
        ];

        class Particle {
            constructor() {
                this.reset();
            }

            reset() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.size = Math.random() * 3 + 1;
                this.baseSize = this.size;
                this.speedX = (Math.random() - 0.5) * 0.8;
                this.speedY = (Math.random() - 0.5) * 0.8;
                this.opacity = Math.random() * 0.5 + 0.2;
                this.color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
            }

            update() {
                this.x += this.speedX;
                this.y += this.speedY;

                // Mouse interaction: particles attract toward cursor
                if (mouse.x !== null && mouse.y !== null) {
                    const dx = mouse.x - this.x;
                    const dy = mouse.y - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < mouse.radius) {
                        const force = (mouse.radius - dist) / mouse.radius;
                        const angle = Math.atan2(dy, dx);
                        this.x += Math.cos(angle) * force * 1.5;
                        this.y += Math.sin(angle) * force * 1.5;
                        this.size = this.baseSize + force * 2;
                    } else {
                        this.size += (this.baseSize - this.size) * 0.05;
                    }
                }

                // Wrap around edges
                if (this.x < -10) this.x = width + 10;
                if (this.x > width + 10) this.x = -10;
                if (this.y < -10) this.y = height + 10;
                if (this.y > height + 10) this.y = -10;
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.globalAlpha = this.opacity;
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        const initCanvas = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };

        const createParticles = () => {
            particles = [];
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                particles.push(new Particle());
            }
        };

        const drawLines = () => {
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < MAX_LINE_DIST) {
                        const opacity = (1 - dist / MAX_LINE_DIST) * 0.15;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(0, 102, 255, ${opacity})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }
        };

        const animate = () => {
            ctx.clearRect(0, 0, width, height);

            particles.forEach(p => {
                p.update();
                p.draw();
            });

            drawLines();
            animationId = requestAnimationFrame(animate);
        };

        // Event listeners
        window.addEventListener('mousemove', (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        });

        window.addEventListener('mouseleave', () => {
            mouse.x = null;
            mouse.y = null;
        });

        window.addEventListener('resize', () => {
            initCanvas();
            // Don't recreate particles on resize, just update canvas size
        });

        // Pause when tab is not visible
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (animationId) cancelAnimationFrame(animationId);
            } else {
                animate();
            }
        });

        // Init
        initCanvas();
        createParticles();
        animate();
    };


    // ============================================================
    // 5. Scroll Trigger Animations
    // ============================================================
    const initScrollAnimations = () => {
        const elements = document.querySelectorAll('[data-animate]');
        if (!elements.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const delay = el.getAttribute('data-delay');

                    if (delay) {
                        const ms = parseInt(delay, 10) * 100;
                        setTimeout(() => {
                            el.classList.add('animated');
                        }, ms);
                    } else {
                        el.classList.add('animated');
                    }

                    // Unobserve after animating (animate once)
                    observer.unobserve(el);
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -40px 0px'
        });

        elements.forEach(el => observer.observe(el));
    };


    // ============================================================
    // 6. Counter Animation
    // ============================================================
    const initCounters = () => {
        const counters = document.querySelectorAll('[data-target]');
        if (!counters.length) return;

        const animateCounter = (el) => {
            const target = parseInt(el.getAttribute('data-target'), 10);
            if (isNaN(target)) return;

            const suffix = el.getAttribute('data-suffix') || '';
            const prefix = el.getAttribute('data-prefix') || '';
            const duration = 2000;
            const startTime = performance.now();
            const startValue = 0;

            const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

            const updateCounter = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easedProgress = easeOutCubic(progress);
                const currentValue = Math.round(startValue + (target - startValue) * easedProgress);

                el.textContent = prefix + currentValue.toLocaleString() + suffix;

                if (progress < 1) {
                    requestAnimationFrame(updateCounter);
                }
            };

            requestAnimationFrame(updateCounter);
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounter(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.5
        });

        counters.forEach(el => observer.observe(el));
    };


    // ============================================================
    // 7. Tab Switching
    // ============================================================
    const initTabs = () => {
        const tabNavs = document.querySelectorAll('.tab-nav');
        if (!tabNavs.length) return;

        tabNavs.forEach(tabNav => {
            const tabBtns = tabNav.querySelectorAll('.tab-btn');
            const tabContentId = tabNav.getAttribute('data-tab-content');
            const tabContent = tabContentId
                ? document.getElementById(tabContentId)
                : tabNav.nextElementSibling;

            if (!tabContent) return;

            const tabPanes = tabContent.querySelectorAll('.tab-pane');

            tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetId = btn.getAttribute('data-tab');

                    // Update active button
                    tabBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    // Update active pane
                    tabPanes.forEach(pane => {
                        pane.classList.remove('active');
                        if (pane.id === targetId || pane.getAttribute('data-tab-id') === targetId) {
                            pane.classList.add('active');
                        }
                    });
                });
            });
        });
    };


    // ============================================================
    // 8. Drag Slider
    // ============================================================
    const initSliders = () => {
        const sliders = document.querySelectorAll('.slider');
        if (!sliders.length) return;

        sliders.forEach(slider => {
            const track = slider.querySelector('.slider-track');
            if (!track) return;

            const slides = slider.querySelectorAll('.slider-slide');
            const dots = slider.querySelectorAll('.slider-dot');
            const prevBtn = slider.querySelector('.slider-prev') || slider.parentElement?.querySelector('.slider-prev');
            const nextBtn = slider.querySelector('.slider-next') || slider.parentElement?.querySelector('.slider-next');

            if (!slides.length) return;

            let currentIndex = 0;
            let isDragging = false;
            let startX = 0;
            let currentTranslate = 0;
            let prevTranslate = 0;
            let startTime = 0;
            let velocity = 0;
            let lastX = 0;
            let lastTime = 0;
            let autoplayTimer = null;
            let isHovering = false;

            const getSlideWidth = () => {
                return slides[0].offsetWidth;
            };

            const getMaxIndex = () => {
                return slides.length - 1;
            };

            const setPosition = (translate, smooth = true) => {
                if (smooth) {
                    track.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                } else {
                    track.style.transition = 'none';
                }
                track.style.transform = `translateX(${translate}px)`;
                currentTranslate = translate;
            };

            const goToSlide = (index, smooth = true) => {
                const maxIndex = getMaxIndex();
                if (index < 0) index = 0;
                if (index > maxIndex) index = maxIndex;

                currentIndex = index;
                const slideWidth = getSlideWidth();
                const translate = -currentIndex * slideWidth;

                setPosition(translate, smooth);
                prevTranslate = translate;

                updateDots();
            };

            const updateDots = () => {
                dots.forEach((dot, i) => {
                    dot.classList.toggle('active', i === currentIndex);
                });
            };

            // Mouse Events
            const dragStart = (e) => {
                isDragging = true;
                slider.classList.add('dragging');
                startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
                startTime = Date.now();
                lastX = startX;
                lastTime = startTime;
                velocity = 0;

                track.style.transition = 'none';

                // Prevent default only for mouse
                if (e.type === 'mousedown') {
                    e.preventDefault();
                }
            };

            const dragMove = (e) => {
                if (!isDragging) return;

                const currentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
                const diff = currentX - startX;
                const currentTime = Date.now();

                // Calculate velocity for momentum
                const timeDiff = currentTime - lastTime;
                if (timeDiff > 0) {
                    velocity = (currentX - lastX) / timeDiff;
                }
                lastX = currentX;
                lastTime = currentTime;

                const translate = prevTranslate + diff;
                track.style.transform = `translateX(${translate}px)`;
                currentTranslate = translate;
            };

            const dragEnd = () => {
                if (!isDragging) return;

                isDragging = false;
                slider.classList.remove('dragging');

                const diff = currentTranslate - prevTranslate;
                const slideWidth = getSlideWidth();
                const threshold = slideWidth * 0.2;

                // Use velocity for momentum effect
                const momentumDistance = velocity * 150;
                const totalDiff = diff + momentumDistance;

                if (Math.abs(totalDiff) > threshold) {
                    if (totalDiff < 0) {
                        goToSlide(currentIndex + 1);
                    } else {
                        goToSlide(currentIndex - 1);
                    }
                } else {
                    goToSlide(currentIndex);
                }
            };

            // Bind drag events
            slider.addEventListener('mousedown', dragStart);
            slider.addEventListener('touchstart', dragStart, { passive: true });

            window.addEventListener('mousemove', dragMove);
            window.addEventListener('touchmove', dragMove, { passive: true });

            window.addEventListener('mouseup', dragEnd);
            window.addEventListener('touchend', dragEnd);

            // Prevent link clicks while dragging
            slider.addEventListener('click', (e) => {
                const diff = Math.abs(currentTranslate - prevTranslate);
                if (diff > 5) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });

            // Dot navigation
            dots.forEach((dot, i) => {
                dot.addEventListener('click', () => {
                    goToSlide(i);
                    resetAutoplay();
                });
            });

            // Arrow navigation
            if (prevBtn) {
                prevBtn.addEventListener('click', () => {
                    goToSlide(currentIndex - 1);
                    resetAutoplay();
                });
            }

            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    goToSlide(currentIndex + 1);
                    resetAutoplay();
                });
            }

            // Auto-advance every 5 seconds
            const startAutoplay = () => {
                if (autoplayTimer) clearInterval(autoplayTimer);
                autoplayTimer = setInterval(() => {
                    if (!isHovering && !isDragging) {
                        const nextIndex = currentIndex + 1 > getMaxIndex() ? 0 : currentIndex + 1;
                        goToSlide(nextIndex);
                    }
                }, 5000);
            };

            const resetAutoplay = () => {
                if (autoplayTimer) clearInterval(autoplayTimer);
                startAutoplay();
            };

            // Pause on hover
            slider.addEventListener('mouseenter', () => {
                isHovering = true;
            });

            slider.addEventListener('mouseleave', () => {
                isHovering = false;
            });

            // Handle resize
            window.addEventListener('resize', () => {
                goToSlide(currentIndex, false);
            });

            // Keyboard navigation when slider is focused
            slider.setAttribute('tabindex', '0');
            slider.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft') {
                    goToSlide(currentIndex - 1);
                    resetAutoplay();
                } else if (e.key === 'ArrowRight') {
                    goToSlide(currentIndex + 1);
                    resetAutoplay();
                }
            });

            // Initialize
            updateDots();
            startAutoplay();
        });
    };


    // ============================================================
    // 9. Lightbox
    // ============================================================
    const initLightbox = () => {
        const galleryItems = document.querySelectorAll('.gallery-item');
        if (!galleryItems.length) return;

        // Create lightbox DOM if it doesn't exist
        let lightbox = document.querySelector('.lightbox');
        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.className = 'lightbox';
            lightbox.innerHTML = `
                <button class="lightbox-close" aria-label="Close">&times;</button>
                <button class="lightbox-nav lightbox-prev" aria-label="Previous">&#10094;</button>
                <button class="lightbox-nav lightbox-next" aria-label="Next">&#10095;</button>
                <img class="lightbox-content" src="" alt="">
                <div class="lightbox-caption"></div>
                <div class="lightbox-counter"></div>
            `;
            document.body.appendChild(lightbox);
        }

        const lightboxImg = lightbox.querySelector('.lightbox-content');
        const lightboxCaption = lightbox.querySelector('.lightbox-caption');
        const lightboxCounter = lightbox.querySelector('.lightbox-counter');
        const closeBtn = lightbox.querySelector('.lightbox-close');
        const prevBtn = lightbox.querySelector('.lightbox-prev');
        const nextBtn = lightbox.querySelector('.lightbox-next');

        let currentLightboxIndex = 0;
        const images = [];

        // Collect all gallery images
        galleryItems.forEach((item, index) => {
            const img = item.querySelector('img');
            if (img) {
                images.push({
                    src: img.getAttribute('data-full') || img.src,
                    caption: img.alt || item.querySelector('.gallery-item-caption')?.textContent || '',
                    index: index
                });
            }
        });

        const openLightbox = (index) => {
            if (index < 0 || index >= images.length) return;

            currentLightboxIndex = index;
            lightboxImg.src = images[index].src;
            lightboxImg.alt = images[index].caption;
            lightboxCaption.textContent = images[index].caption;
            lightboxCounter.textContent = `${index + 1} / ${images.length}`;

            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        };

        const closeLightbox = () => {
            lightbox.classList.remove('active');
            document.body.style.overflow = '';
        };

        const prevImage = () => {
            const newIndex = currentLightboxIndex <= 0 ? images.length - 1 : currentLightboxIndex - 1;
            openLightbox(newIndex);
        };

        const nextImage = () => {
            const newIndex = currentLightboxIndex >= images.length - 1 ? 0 : currentLightboxIndex + 1;
            openLightbox(newIndex);
        };

        // Event: open on gallery item click
        galleryItems.forEach((item, index) => {
            item.addEventListener('click', () => {
                openLightbox(index);
            });
        });

        // Event: close
        if (closeBtn) closeBtn.addEventListener('click', closeLightbox);

        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLightbox();
        });

        // Event: navigation
        if (prevBtn) prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            prevImage();
        });

        if (nextBtn) nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            nextImage();
        });

        // Event: keyboard
        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('active')) return;

            switch (e.key) {
                case 'Escape':
                    closeLightbox();
                    break;
                case 'ArrowLeft':
                    prevImage();
                    break;
                case 'ArrowRight':
                    nextImage();
                    break;
            }
        });

        // Touch swipe support for lightbox
        let touchStartX = 0;
        let touchEndX = 0;

        lightbox.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].clientX;
        }, { passive: true });

        lightbox.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].clientX;
            const diff = touchStartX - touchEndX;

            if (Math.abs(diff) > 50) {
                if (diff > 0) {
                    nextImage();
                } else {
                    prevImage();
                }
            }
        });
    };


    // ============================================================
    // 10. FAQ Accordion
    // ============================================================
    const initFAQ = () => {
        const faqItems = document.querySelectorAll('.faq-item');
        if (!faqItems.length) return;

        faqItems.forEach(item => {
            const question = item.querySelector('.faq-question');
            if (!question) return;

            question.addEventListener('click', () => {
                const isActive = item.classList.contains('active');

                // Close all other items
                faqItems.forEach(other => {
                    if (other !== item) {
                        other.classList.remove('active');
                        const otherAnswer = other.querySelector('.faq-answer');
                        if (otherAnswer) {
                            otherAnswer.style.maxHeight = '0';
                        }
                    }
                });

                // Toggle clicked item
                item.classList.toggle('active');

                const answer = item.querySelector('.faq-answer');
                if (answer) {
                    if (isActive) {
                        answer.style.maxHeight = '0';
                    } else {
                        answer.style.maxHeight = answer.scrollHeight + 'px';
                    }
                }
            });
        });
    };


    // ============================================================
    // 11. Active Nav Link
    // ============================================================
    const initActiveNavLink = () => {
        const navLinks = document.querySelectorAll('.nav-link');
        if (!navLinks.length) return;

        const currentPath = window.location.pathname;
        const currentPage = currentPath.split('/').pop() || 'index.html';

        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;

            const linkPage = href.split('/').pop();

            if (linkPage === currentPage ||
                (currentPage === '' && linkPage === 'index.html') ||
                (currentPage === 'index.html' && linkPage === '')) {
                link.classList.add('active');
            }
        });

        // Scroll spy for single-page sections
        const sections = document.querySelectorAll('section[id]');
        if (!sections.length) return;

        const observerOptions = {
            threshold: 0.3,
            rootMargin: '-80px 0px -50% 0px'
        };

        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const sectionId = entry.target.id;
                    navLinks.forEach(link => {
                        link.classList.remove('active');
                        const href = link.getAttribute('href');
                        if (href && href.includes('#' + sectionId)) {
                            link.classList.add('active');
                        }
                    });
                }
            });
        }, observerOptions);

        sections.forEach(section => sectionObserver.observe(section));
    };


    // ============================================================
    // 12. Form Validation
    // ============================================================
    const initFormValidation = () => {
        const forms = document.querySelectorAll('form[data-validate]');
        if (!forms.length) return;

        const validators = {
            required: (value) => value.trim().length > 0,
            email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
            phone: (value) => /^[\d\-\+\(\)\s]{8,}$/.test(value),
            minlength: (value, length) => value.trim().length >= parseInt(length, 10)
        };

        const messages = {
            required: '필수 입력 항목입니다.',
            email: '올바른 이메일 형식을 입력해주세요.',
            phone: '올바른 전화번호를 입력해주세요.',
            minlength: (len) => `최소 ${len}자 이상 입력해주세요.`
        };

        const showError = (group, message) => {
            group.classList.add('error');
            const errorEl = group.querySelector('.form-error');
            if (errorEl) {
                errorEl.textContent = message;
                errorEl.style.display = 'block';
            }
        };

        const clearError = (group) => {
            group.classList.remove('error');
            const errorEl = group.querySelector('.form-error');
            if (errorEl) {
                errorEl.textContent = '';
                errorEl.style.display = 'none';
            }
        };

        const validateField = (input) => {
            const group = input.closest('.form-group');
            if (!group) return true;

            const value = input.value;
            let isValid = true;

            // Check required
            if (input.hasAttribute('required') || input.getAttribute('data-validate-required')) {
                if (!validators.required(value)) {
                    showError(group, messages.required);
                    return false;
                }
            }

            // Check email
            if (input.type === 'email' || input.getAttribute('data-validate-email')) {
                if (value.trim() && !validators.email(value)) {
                    showError(group, messages.email);
                    return false;
                }
            }

            // Check phone
            if (input.type === 'tel' || input.getAttribute('data-validate-phone')) {
                if (value.trim() && !validators.phone(value)) {
                    showError(group, messages.phone);
                    return false;
                }
            }

            // Check minlength
            const minLength = input.getAttribute('data-validate-minlength') || input.getAttribute('minlength');
            if (minLength && value.trim()) {
                if (!validators.minlength(value, minLength)) {
                    showError(group, messages.minlength(minLength));
                    return false;
                }
            }

            clearError(group);
            return true;
        };

        forms.forEach(form => {
            const inputs = form.querySelectorAll('.form-input, .form-select, .form-textarea');

            // Live validation on blur
            inputs.forEach(input => {
                input.addEventListener('blur', () => validateField(input));
                input.addEventListener('input', () => {
                    const group = input.closest('.form-group');
                    if (group && group.classList.contains('error')) {
                        validateField(input);
                    }
                });
            });

            // Form submission
            form.addEventListener('submit', (e) => {
                e.preventDefault();

                let isFormValid = true;

                inputs.forEach(input => {
                    if (!validateField(input)) {
                        isFormValid = false;
                    }
                });

                if (isFormValid) {
                    // Show success message
                    const successEl = form.querySelector('.form-success');
                    if (successEl) {
                        successEl.style.display = 'block';
                        successEl.textContent = '문의가 성공적으로 접수되었습니다. 감사합니다!';
                    }

                    // Optional: submit via fetch or reset form
                    form.reset();

                    // Hide success after 5 seconds
                    setTimeout(() => {
                        if (successEl) successEl.style.display = 'none';
                    }, 5000);
                } else {
                    // Scroll to first error
                    const firstError = form.querySelector('.form-group.error');
                    if (firstError) {
                        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            });
        });
    };


    // ============================================================
    // 13. Smooth Scroll
    // ============================================================
    const initSmoothScroll = () => {
        const anchors = document.querySelectorAll('a[href^="#"]');
        if (!anchors.length) return;

        anchors.forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                const href = anchor.getAttribute('href');
                if (!href || href === '#') return;

                const target = document.querySelector(href);
                if (!target) return;

                e.preventDefault();

                const headerHeight = document.querySelector('.header')?.offsetHeight || 80;
                const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });

                // Update URL without scroll
                history.pushState(null, null, href);
            });
        });
    };


    // ============================================================
    // 14. Back to Top Button
    // ============================================================
    const initBackToTop = () => {
        // Check if button already exists in HTML
        let btn = document.querySelector('.back-to-top');

        if (!btn) {
            btn = document.createElement('button');
            btn.className = 'back-to-top';
            btn.setAttribute('aria-label', 'Back to top');
            btn.innerHTML = '&#8593;';
            document.body.appendChild(btn);
        }

        let ticking = false;

        const toggleVisibility = () => {
            if (window.scrollY > 400) {
                btn.classList.add('visible');
            } else {
                btn.classList.remove('visible');
            }
            ticking = false;
        };

        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(toggleVisibility);
                ticking = true;
            }
        }, { passive: true });

        btn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });

        // Initial check
        toggleVisibility();
    };


    // ============================================================
    // 15. Typing Effect
    // ============================================================
    const initTypingEffect = () => {
        const typingElements = document.querySelectorAll('[data-typing]');
        if (!typingElements.length) return;

        typingElements.forEach(el => {
            const words = (el.getAttribute('data-typing') || '').split(',').map(w => w.trim());
            if (!words.length) return;

            const speed = parseInt(el.getAttribute('data-typing-speed'), 10) || 100;
            const deleteSpeed = parseInt(el.getAttribute('data-typing-delete-speed'), 10) || 50;
            const pauseDuration = parseInt(el.getAttribute('data-typing-pause'), 10) || 2000;

            let wordIndex = 0;
            let charIndex = 0;
            let isDeleting = false;
            let currentText = '';

            const type = () => {
                const currentWord = words[wordIndex];

                if (isDeleting) {
                    currentText = currentWord.substring(0, charIndex - 1);
                    charIndex--;
                } else {
                    currentText = currentWord.substring(0, charIndex + 1);
                    charIndex++;
                }

                el.textContent = currentText;

                let nextDelay = isDeleting ? deleteSpeed : speed;

                if (!isDeleting && charIndex === currentWord.length) {
                    nextDelay = pauseDuration;
                    isDeleting = true;
                } else if (isDeleting && charIndex === 0) {
                    isDeleting = false;
                    wordIndex = (wordIndex + 1) % words.length;
                    nextDelay = 300;
                }

                setTimeout(type, nextDelay);
            };

            // Start with a small delay
            setTimeout(type, 500);
        });
    };


    // ============================================================
    // 16. Image Lazy Loading
    // ============================================================
    const initLazyLoading = () => {
        const lazyImages = document.querySelectorAll('img[data-src]');
        if (!lazyImages.length) return;

        // Use native lazy loading if supported
        if ('loading' in HTMLImageElement.prototype) {
            lazyImages.forEach(img => {
                img.src = img.getAttribute('data-src');
                img.removeAttribute('data-src');
                const srcset = img.getAttribute('data-srcset');
                if (srcset) {
                    img.srcset = srcset;
                    img.removeAttribute('data-srcset');
                }
            });
            return;
        }

        // Fallback with IntersectionObserver
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;

                    // Create a temp image to preload
                    const tempImg = new Image();
                    tempImg.onload = () => {
                        img.src = img.getAttribute('data-src');
                        img.removeAttribute('data-src');
                        img.classList.add('loaded');
                    };
                    tempImg.src = img.getAttribute('data-src');

                    const srcset = img.getAttribute('data-srcset');
                    if (srcset) {
                        img.srcset = srcset;
                        img.removeAttribute('data-srcset');
                    }

                    imageObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '200px 0px',
            threshold: 0.01
        });

        lazyImages.forEach(img => imageObserver.observe(img));
    };


    // ============================================================
    // 17. Parallax Effect
    // ============================================================
    const initParallax = () => {
        const hero = document.querySelector('.hero');
        if (!hero) return;

        const parallaxElements = document.querySelectorAll('[data-parallax]');
        const heroShapes = hero.querySelectorAll('.hero-shape');

        let ticking = false;

        const updateParallax = () => {
            const scrollY = window.scrollY;
            const viewportHeight = window.innerHeight;

            // Hero section parallax
            if (scrollY < viewportHeight) {
                const heroContent = hero.querySelector('.hero-content');
                if (heroContent) {
                    const speed = 0.3;
                    heroContent.style.transform = `translateY(${scrollY * speed}px)`;
                    heroContent.style.opacity = 1 - (scrollY / viewportHeight) * 0.8;
                }

                // Hero background parallax
                const heroBg = hero.querySelector('.hero-bg');
                if (heroBg) {
                    heroBg.style.transform = `translateY(${scrollY * 0.5}px)`;
                }

                // Floating shapes parallax
                heroShapes.forEach((shape, i) => {
                    const speed = 0.1 + (i * 0.08);
                    shape.style.transform = `translateY(${scrollY * speed}px)`;
                });
            }

            // Custom parallax elements
            parallaxElements.forEach(el => {
                const speed = parseFloat(el.getAttribute('data-parallax')) || 0.2;
                const rect = el.getBoundingClientRect();

                if (rect.top < viewportHeight && rect.bottom > 0) {
                    const scrollProgress = (viewportHeight - rect.top) / (viewportHeight + rect.height);
                    const translateY = (scrollProgress - 0.5) * 100 * speed;
                    el.style.transform = `translateY(${translateY}px)`;
                }
            });

            ticking = false;
        };

        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(updateParallax);
                ticking = true;
            }
        }, { passive: true });

        // Initial call
        updateParallax();
    };


    // ============================================================
    // 18. Gallery Filter
    // ============================================================
    const initGalleryFilter = () => {
        const filterBtns = document.querySelectorAll('.gallery-filter-btn');
        const galleryItems = document.querySelectorAll('.gallery-item[data-category]');

        if (!filterBtns.length || !galleryItems.length) return;

        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter');

                // Update active button
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Filter items with animation
                galleryItems.forEach(item => {
                    const category = item.getAttribute('data-category');
                    const shouldShow = filter === 'all' || category === filter;

                    if (shouldShow) {
                        item.style.opacity = '0';
                        item.style.transform = 'scale(0.8)';
                        item.style.display = '';

                        requestAnimationFrame(() => {
                            item.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                            item.style.opacity = '1';
                            item.style.transform = 'scale(1)';
                        });
                    } else {
                        item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        item.style.opacity = '0';
                        item.style.transform = 'scale(0.8)';

                        setTimeout(() => {
                            item.style.display = 'none';
                        }, 300);
                    }
                });
            });
        });
    };


    // ============================================================
    // 19. Number Format Helper
    // ============================================================
    const formatNumber = (num) => {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };


    // ============================================================
    // 20. Preloader
    // ============================================================
    const initPreloader = () => {
        const preloader = document.querySelector('.preloader');
        if (!preloader) return;

        window.addEventListener('load', () => {
            preloader.classList.add('fade-out');
            setTimeout(() => {
                preloader.style.display = 'none';
            }, 500);
        });
    };


    // ============================================================
    // 21. Scroll-based section color transitions
    // ============================================================
    const initSectionTransitions = () => {
        const sections = document.querySelectorAll('.section[data-bg-transition]');
        if (!sections.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('section-visible');
                } else {
                    entry.target.classList.remove('section-visible');
                }
            });
        }, {
            threshold: 0.1
        });

        sections.forEach(section => observer.observe(section));
    };


    // ============================================================
    // 22. Tooltip
    // ============================================================
    const initTooltips = () => {
        const tooltipTriggers = document.querySelectorAll('[data-tooltip]');
        if (!tooltipTriggers.length) return;

        tooltipTriggers.forEach(trigger => {
            const tooltipText = trigger.getAttribute('data-tooltip');
            if (!tooltipText) return;

            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = tooltipText;
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(26, 26, 46, 0.9);
                color: #fff;
                padding: 6px 12px;
                border-radius: 8px;
                font-size: 12px;
                white-space: nowrap;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s ease;
                z-index: 11000;
                transform: translateX(-50%);
            `;

            trigger.style.position = 'relative';

            trigger.addEventListener('mouseenter', () => {
                document.body.appendChild(tooltip);
                const rect = trigger.getBoundingClientRect();
                tooltip.style.top = (rect.top - tooltip.offsetHeight - 8 + window.scrollY) + 'px';
                tooltip.style.left = (rect.left + rect.width / 2) + 'px';
                requestAnimationFrame(() => {
                    tooltip.style.opacity = '1';
                });
            });

            trigger.addEventListener('mouseleave', () => {
                tooltip.style.opacity = '0';
                setTimeout(() => {
                    if (tooltip.parentNode) {
                        tooltip.parentNode.removeChild(tooltip);
                    }
                }, 200);
            });
        });
    };


    // ============================================================
    // Initialize All Modules
    // ============================================================
    const init = () => {
        initHeaderScroll();
        initMobileNav();
        initScrollProgress();
        initParticles();
        initScrollAnimations();
        initCounters();
        initTabs();
        initSliders();
        initLightbox();
        initFAQ();
        initActiveNavLink();
        initFormValidation();
        initSmoothScroll();
        initBackToTop();
        initTypingEffect();
        initLazyLoading();
        initParallax();
        initGalleryFilter();
        initPreloader();
        initSectionTransitions();
        initTooltips();
    };

    init();

});
