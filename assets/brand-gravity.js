/* Runs only on pages containing the Falling brand logos section. */
(() => {
  'use strict';

  if (window.__untoldBrandGravityInitialized) return;
  window.__untoldBrandGravityInitialized = true;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries, io) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-running');
          io.unobserve(entry.target);
        }
      }, { threshold: 0.12 })
    : null;

  const initialise = (root = document) => {
    const sections = root.matches?.('[data-brand-gravity]')
      ? [root]
      : root.querySelectorAll('[data-brand-gravity]');

    for (const section of sections) {
      if (section.dataset.gravityBound) continue;
      section.dataset.gravityBound = 'true';
      if (reducedMotion.matches) continue;
      if (observer) observer.observe(section);
      else section.classList.add('is-running');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initialise(), { once: true });
  } else {
    initialise();
  }

  document.addEventListener('shopify:section:load', (event) => initialise(event.target));
})();
