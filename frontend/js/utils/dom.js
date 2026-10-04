/**
 * DOM Utilities
 * Lightweight helpers for DOM manipulation and Top Progress Bar
 */
const DOM = (() => {
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  const el = (tag, attrs = {}, ...children) => {
    const element = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') element.className = v;
      else if (k === 'dataset') Object.assign(element.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') element.addEventListener(k.slice(2).toLowerCase(), v);
      else element.setAttribute(k, v);
    }
    for (const child of children) {
      if (child == null) continue;
      if (typeof child === 'string') element.appendChild(document.createTextNode(child));
      else element.appendChild(child);
    }
    return element;
  };

  const show = (el) => el && el.classList.remove('hidden');
  const hide = (el) => el && el.classList.add('hidden');
  const toggle = (el, force) => el && el.classList.toggle('hidden', force != null ? !force : undefined);

  const empty = (el) => { if (el) el.innerHTML = ''; };

  const setHTML = (el, html) => { if (el) el.innerHTML = html; };

  const on = (el, event, handler, opts) => el && el.addEventListener(event, handler, opts);
  const off = (el, event, handler) => el && el.removeEventListener(event, handler);

  const addClass = (el, ...classes) => el && el.classList.add(...classes);
  const removeClass = (el, ...classes) => el && el.classList.remove(...classes);
  const hasClass = (el, cls) => el && el.classList.contains(cls);

  const setText = (el, text) => { if (el) el.textContent = text; };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return { $, $$, el, show, hide, toggle, empty, setHTML, on, off, addClass, removeClass, hasClass, setText, scrollTop };
})();

/**
 * Top Progress Bar (NProgress-style smooth loading indicator)
 */
const LoadingBar = (() => {
  let timer = null;
  let bar = null;

  function getBar() {
    if (!bar) bar = document.getElementById('top-progress-bar');
    return bar;
  }

  function start() {
    const el = getBar();
    if (!el) return;
    clearInterval(timer);
    el.classList.remove('done');
    el.classList.add('active');
    el.style.width = '25%';

    timer = setInterval(() => {
      const current = parseFloat(el.style.width) || 25;
      if (current < 85) {
        el.style.width = Math.min(88, current + Math.random() * 12) + '%';
      }
    }, 180);
  }

  function finish() {
    const el = getBar();
    if (!el) return;
    clearInterval(timer);
    el.style.width = '100%';
    setTimeout(() => {
      el.classList.remove('active');
      el.classList.add('done');
      setTimeout(() => {
        el.style.width = '0%';
        el.classList.remove('done');
      }, 350);
    }, 150);
  }

  return { start, finish };
})();

window.DOM = DOM;
window.LoadingBar = LoadingBar;
