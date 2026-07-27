/* =====================================================================
   app.js — shared across every page of Ecography.
   Holds the student's work, renders the header and footer, and provides
   the small helpers each page builds on. Local-first: nothing here ever
   sends student writing anywhere.
   ===================================================================== */

const KEYS = {
  circle: 'ecog:circle:v1',      // the place the student drew
  species: 'ecog:species:v1',    // species they collected
  writing: 'ecog:writing:v1',    // their ecography draft
  prefs: 'ecog:prefs:v1'
};

/* --------------------------------------------------------------- helpers */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const num = value => (typeof value === 'number' ? value.toLocaleString() : value);

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) { return fallback; }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    toast('This browser is blocking local storage, so your work cannot be saved here.');
    return false;
  }
}

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

let toastTimer;
function toast(message) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3400);
}

function loadingBlock(label) {
  return `<p class="loading">${esc(label || 'Asking GBIF…')}</p>`;
}

function errorBlock(result, retryLabel) {
  return `<div class="error-note">
    <strong>Live data unavailable.</strong> ${esc(result.message || 'Something went wrong.')}
    ${retryLabel ? `<p><button type="button" class="button button--light button--small" data-retry>${esc(retryLabel)}</button></p>` : ''}
  </div>`;
}

/* ----------------------------------------------------------- the student */

const Store = {
  getCircle() { return readJSON(KEYS.circle, null); },
  setCircle(circle) { writeJSON(KEYS.circle, circle); },
  clearCircle() { localStorage.removeItem(KEYS.circle); },

  getSpecies() { return readJSON(KEYS.species, []); },
  hasSpecies(key) { return this.getSpecies().some(s => s.speciesKey === key); },
  addSpecies(entry) {
    const list = this.getSpecies();
    if (list.some(s => s.speciesKey === entry.speciesKey)) return false;
    list.push(Object.assign({ collectedAt: new Date().toISOString(), note: '' }, entry));
    writeJSON(KEYS.species, list);
    return true;
  },
  removeSpecies(key) {
    writeJSON(KEYS.species, this.getSpecies().filter(s => s.speciesKey !== key));
  },
  updateSpeciesNote(key, note) {
    const list = this.getSpecies();
    const found = list.find(s => s.speciesKey === key);
    if (!found) return;
    found.note = note;
    writeJSON(KEYS.species, list);
  },
  // Wikipedia arrives after a species may already be collected, so backfill it.
  updateSpeciesWiki(key, wiki) {
    const list = this.getSpecies();
    const found = list.find(s => s.speciesKey === key);
    if (!found || found.wiki) return;
    found.wiki = wiki;
    writeJSON(KEYS.species, list);
  },

  getWriting() { return readJSON(KEYS.writing, {}); },
  setSection(id, text) {
    const w = this.getWriting();
    w[id] = text;
    w.updatedAt = new Date().toISOString();
    writeJSON(KEYS.writing, w);
  },

  eraseEverything() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    if (window.GBIF) GBIF.clearCache();
  }
};

/* -------------------------------------------------------------- settings */

const prefs = Object.assign({ motion: 'on', contrast: 'normal', textsize: 'normal' }, readJSON(KEYS.prefs, {}));
if (!readJSON(KEYS.prefs, null) && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  prefs.motion = 'off';
}

function applyPrefs() {
  const root = document.documentElement;
  root.dataset.motion = prefs.motion;
  root.dataset.contrast = prefs.contrast;
  root.dataset.textsize = prefs.textsize;

  const box = id => $('#' + id);
  if (box('toggleMotion')) box('toggleMotion').checked = prefs.motion === 'off';
  if (box('toggleContrast')) box('toggleContrast').checked = prefs.contrast === 'high';
  if (box('toggleLargeText')) box('toggleLargeText').checked = prefs.textsize === 'large';

  const video = $('#heroVideo');
  const toggle = $('#videoToggle');
  if (video) {
    if (prefs.motion === 'off') video.pause();
    else tryPlayVideo();
  }
  if (toggle) {
    const paused = prefs.motion === 'off';
    toggle.setAttribute('aria-pressed', String(paused));
    $('.video-toggle__icon', toggle).textContent = paused ? '▶' : '❚❚';
    $('.video-toggle__label', toggle).textContent = paused ? 'Play background' : 'Pause background';
  }
}

function savePrefs() { writeJSON(KEYS.prefs, prefs); applyPrefs(); }

let heroInView = true;
function tryPlayVideo() {
  const video = $('#heroVideo');
  if (!video || prefs.motion === 'off' || !heroInView || !video.paused) return;
  // No visibilityState check on purpose: embedded and preview contexts report
  // the document as hidden while it is plainly on screen. Let the browser's
  // autoplay policy decide, and fall back to the poster frame if it says no.
  const attempt = video.play();
  if (attempt && attempt.catch) attempt.catch(() => {});
}

function initVideo() {
  const video = $('#heroVideo');
  if (!video) return;
  document.addEventListener('visibilitychange', tryPlayVideo);
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(evt =>
    document.addEventListener(evt, tryPlayVideo, { passive: true }));
  video.addEventListener('canplay', tryPlayVideo);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => entries.forEach(entry => {
      // A viewport with no area (an unrendered or collapsed pane) reports
      // everything as off-screen. That is not the student scrolling away, so
      // don't treat it as a reason to stop the loop.
      const root = entry.rootBounds;
      if (root && root.width === 0 && root.height === 0) return;

      heroInView = entry.isIntersecting;
      if (prefs.motion === 'off') return;
      if (heroInView) tryPlayVideo(); else video.pause();
    }), { threshold: 0.05 }).observe(video);
  }

  const toggle = $('#videoToggle');
  if (toggle) toggle.addEventListener('click', () => {
    prefs.motion = prefs.motion === 'off' ? 'on' : 'off';
    savePrefs();
  });
}

/* ------------------------------------------------------- header & footer */

const STEPS = [
  { href: 'explore.html', num: '1', label: 'Draw your circle', short: 'Draw' },
  { href: 'species.html', num: '2', label: 'Meet who lives there', short: 'Meet' },
  { href: 'write.html', num: '3', label: 'Write your ecography', short: 'Write' }
];

function currentPage() {
  const path = location.pathname.split('/').pop();
  return path === '' ? 'index.html' : path;
}

function renderChrome() {
  const page = currentPage();
  const circle = Store.getCircle();
  const collected = Store.getSpecies().length;

  const header = $('#siteHeader');
  if (header) {
    header.innerHTML = `
      <a class="brand" href="index.html">
        <img src="assets/icons/logo-landscape.svg" alt="" class="brand__logo">
        <span class="brand__text">
          <span class="brand__title">Ecography</span>
          <span class="brand__subtitle">Write the living story of a place</span>
        </span>
      </a>

      <nav class="step-nav" aria-label="Your three steps">
        ${STEPS.map(step => {
          const done = step.href === 'explore.html' ? Boolean(circle)
            : step.href === 'species.html' ? collected > 0
            : Boolean((Store.getWriting() || {}).place);
          const here = page === step.href;
          return `<a class="step-nav__item ${here ? 'is-here' : ''} ${done ? 'is-done' : ''}"
                     href="${step.href}" ${here ? 'aria-current="page"' : ''}>
            <span class="step-nav__num">${done && !here ? '✓' : step.num}</span>
            <span class="step-nav__label">${esc(step.label)}</span>
            <span class="step-nav__short" aria-hidden="true">${esc(step.short)}</span>
          </a>`;
        }).join('')}
      </nav>

      <div class="header-actions">
        <a class="header-link ${page === 'guide.html' ? 'is-here' : ''}" href="guide.html">Reading the data</a>
        <button id="a11yButton" class="icon-button" aria-label="Display settings"
                aria-expanded="false" aria-controls="a11yMenu" title="Display settings">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>
          </svg>
        </button>
      </div>

      <div id="a11yMenu" class="a11y-menu" hidden>
        <h3>Display settings</h3>
        <label><input type="checkbox" id="toggleMotion"> Pause background video</label>
        <label><input type="checkbox" id="toggleContrast"> Higher contrast</label>
        <label><input type="checkbox" id="toggleLargeText"> Even larger type</label>
        <p class="a11y-menu__note">Saved to this browser only.</p>
      </div>
    `;

    $('#toggleMotion').addEventListener('change', e => { prefs.motion = e.target.checked ? 'off' : 'on'; savePrefs(); });
    $('#toggleContrast').addEventListener('change', e => { prefs.contrast = e.target.checked ? 'high' : 'normal'; savePrefs(); });
    $('#toggleLargeText').addEventListener('change', e => { prefs.textsize = e.target.checked ? 'large' : 'normal'; savePrefs(); });

    const menuButton = $('#a11yButton');
    const menu = $('#a11yMenu');
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!open));
      menu.hidden = open;
    });
    document.addEventListener('click', e => {
      if (menu.hidden || menu.contains(e.target) || menuButton.contains(e.target)) return;
      menu.hidden = true;
      menuButton.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !menu.hidden) {
        menu.hidden = true;
        menuButton.setAttribute('aria-expanded', 'false');
        menuButton.focus();
      }
    });
  }

  const footer = $('#siteFooter');
  if (footer) {
    footer.innerHTML = `
      <div class="footer-brand">
        <img src="assets/icons/logo-landscape.svg" alt="" class="brand__logo">
        <div>
          <p class="footer-brand__title">Ecography</p>
          <p>A place-based inquiry environment. No account, no tracking. Your writing stays in this browser until you export it.</p>
        </div>
      </div>
      <div class="footer-links">
        <div>
          <h3>Your work</h3>
          <a href="explore.html">Draw your circle</a>
          <a href="species.html">Meet who lives there</a>
          <a href="write.html">Write your ecography</a>
        </div>
        <div>
          <h3>Where the data comes from</h3>
          <a href="guide.html">Reading the data</a>
          <a href="https://www.gbif.org" target="_blank" rel="noopener">GBIF</a>
          <a href="https://www.gbif.org/citation-guidelines" target="_blank" rel="noopener">Citing GBIF</a>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
        </div>
      </div>
    `;
  }

  applyPrefs();
  initVideo();
}

/* ------------------------------------------------------- circle helpers */

function circleLabel(circle) {
  if (!circle) return 'No circle yet';
  return circle.name || `${circle.radiusKm} km around ${circle.lat.toFixed(2)}, ${circle.lng.toFixed(2)}`;
}

// A circle needs a "no place yet" path on every page that assumes one.
function requireCircle(target, message) {
  const circle = Store.getCircle();
  if (circle) return circle;
  const el = typeof target === 'string' ? $(target) : target;
  if (el) {
    el.innerHTML = `<div class="empty-state">
      <p class="empty-state__emoji" aria-hidden="true">🗺️</p>
      <h2>Draw a circle first</h2>
      <p>${esc(message || 'This page works from the place you choose on the map. It takes about thirty seconds.')}</p>
      <a class="button button--dark button--large" href="explore.html">Go draw your circle</a>
    </div>`;
  }
  return null;
}

/* ------------------------------------------------------------- download */

function download(content, filename, type) {
  const blob = new Blob([content], { type: type + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener('DOMContentLoaded', renderChrome);

window.addEventListener('offline', () => toast('You are offline. Your writing still works — live records will not load.'));
window.addEventListener('online', () => toast('Back online.'));
