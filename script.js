/**
 * MCGG NETWORK - CORE SCRIPT
 * Tech Stack: Vanilla JS + GSAP (GreenSock Animation Platform)
 */

// ── Register GSAP plugins immediately when the script loads ──────────────────
// TextPlugin MUST be registered before any gsap.timeline() that uses text:""
// If we wait until DOMContentLoaded, the timeline in initApp() may already
// have been created. Register here at parse time — safe and always correct.
if (typeof gsap !== 'undefined') {
    if (typeof TextPlugin    !== 'undefined') gsap.registerPlugin(TextPlugin);
    if (typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);
}

document.addEventListener('DOMContentLoaded', () => {

    // ─── LOADER FALLBACK ──────────────────────────────────────────────────────
    // If GSAP fails to load (CDN blocked, slow connection, extension interference),
    // the loader would normally stay on screen forever since it relies on gsap to
    // set opacity and re-enable scroll. This CSS-only safety net fires after 4s
    // regardless of whether GSAP loaded, ensuring the page is always accessible.
    const loader = document.getElementById('loader');

    function forceHideLoader() {
        if (!loader) return;
        loader.classList.add('hidden');           // CSS sets opacity:0, pointer-events:none
        document.body.style.overflow = '';        // Re-enable scrolling
    }

    // Safety timeout — triggers if GSAP animation never completes
    const loaderSafetyTimer = setTimeout(forceHideLoader, 4000);

    // --- 1. INITIALIZATION & LOADER SYSTEM ---
    const initApp = () => {
        const progressBar = document.querySelector('.loader__progress');
        const loaderText  = document.querySelector('.loader__text');

        // Guard: if GSAP didn't load, skip animation and hide loader immediately
        if (typeof gsap === 'undefined') {
            console.warn('[MCGG] GSAP not available — skipping loader animation.');
            forceHideLoader();
            clearTimeout(loaderSafetyTimer);
            runHeroAnimations();
            return;
        }

        // Disable scroll during loading
        document.body.style.overflow = 'hidden';

        // Simulate Loading Process
        const tl = gsap.timeline({
            onComplete: () => {
                clearTimeout(loaderSafetyTimer);
                gsap.to(loader, {
                    yPercent: -100,
                    duration: 0.8,
                    ease: "power4.inOut",
                    onComplete: () => {
                        forceHideLoader();
                        runHeroAnimations();
                    }
                });
            }
        });

        tl.to(progressBar, { width: '30%', duration: 0.5, ease: "power2.out" })
          .to(loaderText, { text: "Loading Assets...", duration: 0.1, snap: "innerText" }, "-=0.1")
          .to(progressBar, { width: '70%', duration: 0.5, ease: "power2.out" })
          .to(loaderText, { text: "Syncing Meta Data...", duration: 0.1, snap: "innerText" }, "-=0.1")
          .to(progressBar, { width: '100%', duration: 0.4, ease: "power2.out" })
          .to(loaderText, { text: "Ready.", duration: 0.1, snap: "innerText" }, "-=0.1");
    };

    // --- 2. HERO ANIMATIONS (Triggered after loader) ---
    const runHeroAnimations = () => {
        if (typeof gsap === 'undefined') return;

        gsap.from('.gsap-fade-up', {
            y: 50,
            opacity: 0,
            duration: 1,
            stagger: 0.15,
            ease: "power3.out"
        });

        gsap.from('.gsap-scale-in', {
            scale: 0.8,
            opacity: 0,
            duration: 1.2,
            delay: 0.2,
            ease: "back.out(1.7)"
        });

        gsap.from('.visual-card--floating', {
            x: 50,
            opacity: 0,
            duration: 1,
            stagger: 0.2,
            delay: 0.5,
            ease: "power3.out"
        });
    };

    // --- 3. SCROLL ANIMATIONS (ScrollTrigger) ---
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        // Plugins already registered at script parse time (top of file).

        gsap.utils.toArray('.section__header').forEach(header => {
            gsap.from(header, {
                scrollTrigger: {
                    trigger: header,
                    start: "top 80%",
                    toggleActions: "play none none reverse"
                },
                y: 30,
                opacity: 0,
                duration: 0.8,
                ease: "power3.out"
            });
        });

        gsap.from('.service-card', {
            scrollTrigger: { trigger: '.services__grid', start: "top 75%" },
            y: 50, opacity: 0, duration: 0.8, stagger: 0.2, ease: "power3.out"
        });

        gsap.from('.build-card', {
            scrollTrigger: { trigger: '.portfolio__grid', start: "top 75%" },
            y: 50, opacity: 0, duration: 0.8, stagger: 0.2, ease: "power3.out"
        });

        gsap.from('.community__content', {
            scrollTrigger: { trigger: '.community__wrapper', start: "top 70%" },
            x: -50, opacity: 0, duration: 1, ease: "power3.out"
        });

        gsap.from('.community__visual', {
            scrollTrigger: { trigger: '.community__wrapper', start: "top 70%" },
            x: 50, opacity: 0, duration: 1, delay: 0.2, ease: "power3.out"
        });
    }

    // --- 4. UI INTERACTIVITY ---

    // Sticky Header
    const header = document.querySelector('.header');
    if (header) {
        window.addEventListener('scroll', () => {
            header.classList.toggle('scrolled', window.scrollY > 50);
        }, { passive: true });
    }

    // Mobile Menu Toggle
    // The CSS for .nav--open is defined in style.css (slide-down drawer).
    const toggleBtn = document.querySelector('.header__toggle');
    const nav       = document.querySelector('.nav');

    if (toggleBtn && nav) {
        toggleBtn.addEventListener('click', () => {
            const isOpen = nav.classList.toggle('nav--open');
            toggleBtn.setAttribute('aria-expanded', String(isOpen));
            toggleBtn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
        });

    // Close nav when a link is tapped
    nav.querySelectorAll('.nav__link').forEach(link => {
        link.addEventListener('click', (e) => {
            // Only close if it's not an anchor link to same page
            const href = link.getAttribute('href');
            if (href && href.startsWith('#')) {
                // Allow smooth scroll, then close
                setTimeout(() => {
                    nav.classList.remove('nav--open');
                    toggleBtn.setAttribute('aria-expanded', 'false');
                }, 300);
            } else {
                nav.classList.remove('nav--open');
                toggleBtn.setAttribute('aria-expanded', 'false');
            }
        });
    });

        // Close nav on outside click / Escape key
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && nav.classList.contains('nav--open')) {
                nav.classList.remove('nav--open');
                toggleBtn.setAttribute('aria-expanded', 'false');
                toggleBtn.focus();
            }
        });
    }

    // Smooth Scroll
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#' || href === '#main-content') return;
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
                
                // Update URL without triggering scroll
                if (history.pushState) {
                    history.pushState(null, null, href);
                }
            }
        });
    });

    // --- 5. 3D MOUSE PARALLAX EFFECT ---
    const heroSection = document.querySelector('.hero');
    const visualMain  = document.querySelector('.visual-card--main');

    if (heroSection && typeof gsap !== 'undefined') {
        heroSection.addEventListener('mousemove', (e) => {
            const x = (window.innerWidth  / 2 - e.pageX) / 25;
            const y = (window.innerHeight / 2 - e.pageY) / 25;

            if (visualMain) {
                visualMain.style.transform = `translate(-50%, -50%) rotateY(${x}deg) rotateX(${y}deg)`;
            }

            gsap.to('.ambient-bg__blob--1', { x: x * 2, y: y * 2, duration: 1 });
            gsap.to('.ambient-bg__blob--2', { x: -x * 2, y: -y * 2, duration: 1 });
        });

        heroSection.addEventListener('mouseleave', () => {
            if (visualMain) {
                visualMain.style.transform = `translate(-50%, -50%) rotateY(-10deg) rotateX(5deg)`;
            }
        });
    }

    // --- RUN INITIALIZATION ---
    initApp();
});