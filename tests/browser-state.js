JSON.stringify({
  manifest: Boolean(document.querySelector('link[rel=manifest]')),
  serviceWorker: Boolean(navigator.serviceWorker.controller),
  overflow: document.documentElement.scrollWidth > innerWidth,
  blank: document.body.innerText.trim().length === 0,
  overlay: Boolean(document.querySelector('vite-error-overlay')),
});
