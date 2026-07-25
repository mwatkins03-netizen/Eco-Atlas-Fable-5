/* =====================================================================
   Eco Ethnography Atlas — application logic
   Vanilla JS, no build step. Student work is local-first; the only
   network calls are Leaflet tiles and the GBIF API (see gbif.js).
   ===================================================================== */

const STORAGE = {
  notes: 'eea:notes:v2',
  legacyNotes: 'ecoEthnographyNotes',
  progress: 'eea:progress:v1',
  prefs: 'eea:prefs:v1',
  draft: 'eea:draft:v1',
  session: 'eea:session:v1'
};

const state = {
  db: null,
  filter: 'all',
  placeId: null,
  activityId: 'species-story',
  routeLayer: null,
  occurrenceLayer: null,
  showOccurrences: false,
  notes: [],
  progress: {},
  prefs: { motion: 'on', contrast: 'normal', textsize: 'normal' },
  editingNoteId: null
};

/* -------------------------------------------------------------- helpers */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function num(value) {
  return typeof value === 'number' ? value.toLocaleString() : value;
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    toast('Could not save — this browser is blocking local storage.');
    return false;
  }
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function placeById(id) {
  return state.db.locations.find(loc => loc.id === id);
}

function activityById(id) {
  return state.db.activities.find(a => a.id === id);
}

function currentPlace() {
  return placeById(state.placeId) || state.db.locations[0];
}

/* Renders a friendly error block with a retry hook. */
function errorBlock(result, retryId) {
  return `<div class="error-note">
    <strong>Live data unavailable.</strong> ${esc(result.message || 'Something went wrong.')}
    ${retryId ? `<br><button type="button" data-retry="${esc(retryId)}">Try again</button>` : ''}
    <br><span class="data-note">You can keep working — the written context and your notes do not depend on this.</span>
  </div>`;
}

const loadingBlock = label => `<p class="loading">${esc(label || 'Loading records from GBIF…')}</p>`;

/* ============================================================ PREFERENCES */

function loadPrefs() {
  const stored = readJSON(STORAGE.prefs, null);
  if (stored) Object.assign(state.prefs, stored);
  else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) state.prefs.motion = 'off';
  applyPrefs();
}

function applyPrefs() {
  const root = document.documentElement;
  root.dataset.motion = state.prefs.motion;
  root.dataset.contrast = state.prefs.contrast;
  root.dataset.textsize = state.prefs.textsize;

  const video = $('#heroVideo');
  const toggle = $('#videoToggle');
  const paused = state.prefs.motion === 'off';
  if (video) {
    if (paused) video.pause();
    else tryPlayVideo();
  }
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.querySelector('.video-toggle__icon').textContent = paused ? '▶' : '❚❚';
    toggle.querySelector('.video-toggle__label').textContent = paused ? 'Play background' : 'Pause background';
  }
  const motionBox = $('#toggleMotion');
  if (motionBox) motionBox.checked = paused;
  const contrastBox = $('#toggleContrast');
  if (contrastBox) contrastBox.checked = state.prefs.contrast === 'high';
  const textBox = $('#toggleLargeText');
  if (textBox) textBox.checked = state.prefs.textsize === 'large';
}

function savePrefs() {
  writeJSON(STORAGE.prefs, state.prefs);
  applyPrefs();
}

function bindPrefs() {
  $('#videoToggle').addEventListener('click', () => {
    state.prefs.motion = state.prefs.motion === 'off' ? 'on' : 'off';
    savePrefs();
  });
  $('#toggleMotion').addEventListener('change', e => {
    state.prefs.motion = e.target.checked ? 'off' : 'on';
    savePrefs();
  });
  $('#toggleContrast').addEventListener('change', e => {
    state.prefs.contrast = e.target.checked ? 'high' : 'normal';
    savePrefs();
  });
  $('#toggleLargeText').addEventListener('change', e => {
    state.prefs.textsize = e.target.checked ? 'large' : 'normal';
    savePrefs();
  });

  const menuButton = $('#a11yButton');
  const menu = $('#a11yMenu');
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    menu.hidden = open;
  });
  document.addEventListener('click', e => {
    if (menu.hidden) return;
    if (menu.contains(e.target) || menuButton.contains(e.target)) return;
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

  // Browsers refuse muted autoplay in a few situations — most commonly when
  // the tab was in the background at load, or on a data-saver setting. Retry
  // on every signal that the page is actually being looked at, rather than
  // leaving a student staring at a still frame.
  const video = $('#heroVideo');
  ['visibilitychange'].forEach(evt => document.addEventListener(evt, tryPlayVideo));
  ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(evt =>
    document.addEventListener(evt, tryPlayVideo, { passive: true }));
  video.addEventListener('canplay', tryPlayVideo);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        // Stop decoding video the student has scrolled past; resume on return.
        heroInView = entry.isIntersecting;
        if (state.prefs.motion === 'off') return;
        if (heroInView) tryPlayVideo();
        else video.pause();
      });
    }, { threshold: 0.05 });
    observer.observe(video);
  }
}

let heroInView = true;

function tryPlayVideo() {
  const video = $('#heroVideo');
  if (!video || state.prefs.motion === 'off' || !heroInView) return;
  if (!video.paused) return;
  // No visibility check here on purpose: some embedded and preview contexts
  // report the document as hidden even while it is on screen. Let the
  // browser's own autoplay policy be the judge and fail quietly if it says no.
  const attempt = video.play();
  if (attempt && attempt.catch) attempt.catch(() => { /* poster frame stands in */ });
}

/* ================================================================= INIT */

async function init() {
  loadPrefs();
  bindPrefs();

  try {
    const res = await fetch('data/atlas-db.json');
    if (!res.ok) throw new Error('status ' + res.status);
    state.db = await res.json();
  } catch (err) {
    $('#locationDetail').innerHTML = `<div class="error-note"><strong>The atlas database could not load.</strong>
      Serve this folder over HTTP (for example <code>python3 -m http.server</code>) rather than opening the file directly.</div>`;
    return;
  }

  loadNotes();
  state.progress = readJSON(STORAGE.progress, {});
  const session = readJSON(STORAGE.session, {});
  state.placeId = placeById(session.placeId) ? session.placeId : state.db.locations[0].id;
  state.activityId = activityById(session.activityId) ? session.activityId : 'species-story';

  renderFilters();
  initMap();
  renderPlaceCards();
  renderRoutes();
  renderActivityCards();
  renderStudioSelects();
  renderPlaceDetail();
  renderActivity();
  renderNotes();
  renderProgress();
  bindNotebook();
  bindGlobalActions();
  loadLivePanel();

  $('#gbifCitation').textContent = GBIF.citeDownload('Eco Ethnography Atlas');
}

function saveSession() {
  writeJSON(STORAGE.session, { placeId: state.placeId, activityId: state.activityId });
}

/* =============================================================== FILTERS */

const FILTER_LABELS = {
  all: 'All places', rivers: 'Rivers', species: 'Species', voices: 'Voices',
  routes: 'Routes', archives: 'Archives', 'then-now': 'Then & Now', notes: 'Field Notes'
};

function renderFilters() {
  const container = $('#filterChips');
  container.innerHTML = Object.keys(FILTER_LABELS).map(key => {
    const count = key === 'all'
      ? state.db.locations.length
      : state.db.locations.filter(l => l.tags.includes(key)).length;
    return `<button type="button" class="filter-chip ${state.filter === key ? 'is-active' : ''}"
      data-filter="${key}" aria-pressed="${state.filter === key}">${FILTER_LABELS[key]} <span aria-hidden="true">(${count})</span></button>`;
  }).join('');

  container.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    renderFilters();
    renderPlaceCards();
    renderMarkers();
    setMapStatus(`Showing ${filteredPlaces().length} of ${state.db.locations.length} places.`);
  }));
}

function filteredPlaces() {
  if (state.filter === 'all') return state.db.locations;
  return state.db.locations.filter(loc => loc.tags.includes(state.filter));
}

/* =================================================================== MAP */

let map, markersGroup;

function initMap() {
  map = L.map('atlasMap', { zoomControl: true, scrollWheelZoom: false }).setView([22, 8], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(map);
  markersGroup = L.layerGroup().addTo(map);
  // Scroll-wheel zoom hijacks page scrolling; require a click first.
  map.on('click', () => map.scrollWheelZoom.enable());
  map.on('mouseout', () => map.scrollWheelZoom.disable());
  renderMarkers();
}

function renderMarkers() {
  markersGroup.clearLayers();
  filteredPlaces().forEach(location => {
    const selected = location.id === state.placeId;
    const icon = L.divIcon({
      html: `<div class="map-marker ${selected ? 'is-selected' : ''}"></div>`,
      className: '', iconSize: [18, 18], iconAnchor: [9, 9]
    });
    const marker = L.marker(location.coords, { icon, keyboard: true, title: location.title }).addTo(markersGroup);
    marker.bindTooltip(location.title, { direction: 'top', offset: [0, -10] });
    marker.on('click', () => selectPlace(location.id, true));
  });
}

function setMapStatus(message) {
  $('#mapStatus').textContent = message;
}

/* ============================================================== PLACES */

function selectPlace(id, fly = false) {
  if (!placeById(id)) return;
  state.placeId = id;
  saveSession();
  renderMarkers();
  renderPlaceCards();
  renderPlaceDetail();
  renderActivity();
  loadLivePanel();
  $('#studioPlaceSelect').value = id;
  if (fly) map.flyTo(placeById(id).coords, Math.max(map.getZoom(), 4), { duration: 1.1 });
  if (state.showOccurrences) loadOccurrenceLayer();
  setMapStatus(`Selected: ${placeById(id).title}.`);
}

function renderPlaceCards() {
  const container = $('#locationCards');
  const places = filteredPlaces();
  if (!places.length) {
    container.innerHTML = '<p class="notes-empty">No places carry that theme yet. Try another filter.</p>';
    return;
  }
  container.innerHTML = places.map(loc => `
    <button type="button" class="location-card ${loc.id === state.placeId ? 'is-selected' : ''}"
            data-place="${esc(loc.id)}" aria-pressed="${loc.id === state.placeId}">
      <span class="location-card__meta"><img src="assets/icons/icon-pin.svg" alt="">${esc(loc.country)}</span>
      <h4>${esc(loc.title)}</h4>
      <p>${esc(loc.summary)}</p>
      <span class="tags">${loc.tags.slice(0, 3).map(t => `<span class="tag tag--${esc(t)}">${esc(prettyTag(t))}</span>`).join('')}</span>
    </button>
  `).join('');
  container.querySelectorAll('.location-card').forEach(card =>
    card.addEventListener('click', () => selectPlace(card.dataset.place, true)));
}

function renderPlaceDetail() {
  const loc = currentPlace();
  $('#locationDetail').innerHTML = `
    <span class="pill pill--curated">Curated context</span>
    <div class="detail-card__country" style="margin-top:10px">${esc(loc.country)} · ${esc(loc.theme)}</div>
    <h3>${esc(loc.title)}</h3>
    <p>${esc(loc.summary)}</p>
    <p class="detail-card__prompt">${esc(loc.quote)}</p>
    <div class="tags">${loc.tags.map(t => `<span class="tag tag--${esc(t)}">${esc(prettyTag(t))}</span>`).join('')}</div>
    <div class="timeline-mini">
      ${loc.timeline.slice(0, 3).map(item =>
        `<article><strong>${esc(item.year)} — ${esc(item.title)}</strong><span>${esc(item.detail)}</span></article>`).join('')}
    </div>
    <p class="data-note">Bounding box used for live queries: ${loc.bbox[0]}°–${loc.bbox[1]}° lat, ${loc.bbox[2]}°–${loc.bbox[3]}° lon.</p>
  `;
}

function prettyTag(tag) {
  if (tag === 'then-now') return 'Then & Now';
  return tag.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/* ======================================================= LIVE GBIF PANEL */

async function loadLivePanel() {
  const loc = currentPlace();
  const panel = $('#livePanel');
  panel.innerHTML = loadingBlock('Asking GBIF what has been recorded here…');

  const [totalRes, topRes] = await Promise.all([
    GBIF.count({
      hasCoordinate: 'true', hasGeospatialIssue: 'false',
      decimalLatitude: `${loc.bbox[0]},${loc.bbox[1]}`,
      decimalLongitude: `${loc.bbox[2]},${loc.bbox[3]}`
    }),
    GBIF.topSpecies({ bbox: loc.bbox, limit: 6 })
  ]);

  if (!totalRes.ok && !topRes.ok) {
    panel.innerHTML = errorBlock(totalRes, 'live');
    return;
  }

  const total = totalRes.ok ? totalRes.data : null;
  const species = topRes.ok ? topRes.data.species : [];

  panel.innerHTML = `
    <span class="pill pill--live">Live data</span>
    <div class="live-stat">
      <strong>${total === null ? '—' : num(total)}</strong>
      <span>georeferenced occurrence records inside this region</span>
    </div>
    ${species.length ? `
      <p class="data-note"><strong>Most frequently recorded species here:</strong></p>
      <ul class="live-species">
        ${species.map(s => `<li>
          <span><a href="${esc(s.url)}" target="_blank" rel="noopener"><em>${esc(s.scientificName)}</em></a>
          ${s.vernacularName ? `<br><small>${esc(s.vernacularName)}</small>` : ''}</span>
          <span class="count">${num(s.count)}</span>
        </li>`).join('')}
      </ul>` : ''}
    <p class="data-note">
      Ranked by number of records, which mostly reflects <strong>who was looking and how often</strong> —
      birds and plants dominate because birders and botanists upload the most. Ask what is missing from this list.
    </p>
  `;
}

/* ================================================================ ROUTES */

function renderRoutes() {
  const list = $('#routeList');
  list.innerHTML = state.db.routes.map(route => `
    <div class="route-item">
      <div class="route-item__top">
        <strong>${esc(route.name)}</strong>
        <button type="button" data-route="${esc(route.id)}">Trace</button>
      </div>
      <span>${esc(route.description)}</span>
    </div>
  `).join('');
  list.querySelectorAll('button').forEach(btn =>
    btn.addEventListener('click', () => drawRoute(btn.dataset.route)));
}

function drawRoute(routeId) {
  const route = state.db.routes.find(r => r.id === routeId);
  if (!route) return;
  clearRoute();
  state.routeLayer = L.polyline(route.points, {
    color: '#7c61d0', weight: 5, opacity: .85, dashArray: '12 8'
  }).addTo(map);
  route.points.forEach((point, i) => {
    L.circleMarker(point, { radius: 6, color: '#7c61d0', fillColor: '#fff', fillOpacity: 1, weight: 3 })
      .bindTooltip(`${route.name} — stop ${i + 1}`)
      .addTo(state.routeLayer);
  });
  map.fitBounds(state.routeLayer.getBounds(), { padding: [34, 34] });
  setMapStatus(`Tracing ${route.name} — ${route.points.length} stops.`);
}

function clearRoute() {
  if (state.routeLayer) {
    map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }
}

/* ================================================== GBIF OCCURRENCE LAYER */

async function loadOccurrenceLayer() {
  const loc = currentPlace();
  if (state.occurrenceLayer) { map.removeLayer(state.occurrenceLayer); state.occurrenceLayer = null; }
  if (!state.showOccurrences) { setMapStatus('GBIF record layer hidden.'); return; }

  setMapStatus('Loading GBIF records for this region…');
  const keys = (loc.species || []).map(s => s.gbifKey).filter(Boolean);
  const res = await GBIF.occurrences({
    taxonKey: keys, bbox: loc.bbox, limit: 300
  });

  if (!res.ok) { setMapStatus(res.message); return; }

  const points = res.data.records.filter(r => r.location);
  const layer = L.layerGroup();
  points.forEach(record => {
    L.circleMarker([record.location.lat, record.location.lng], {
      radius: 5, color: '#6f8348', weight: 1.5, fillColor: '#9dbf63', fillOpacity: .75
    }).bindPopup(`
      <strong style="font-style:italic">${esc(record.scientificName || record.title)}</strong><br>
      ${esc(record.date ? String(record.date).slice(0, 10) : 'Date not recorded')} ·
      ${esc(record.basisOfRecord)}<br>
      ${record.dataset ? esc(record.dataset) + '<br>' : ''}
      <a href="${esc(record.url)}" target="_blank" rel="noopener">View on GBIF</a>
    `).addTo(layer);
  });
  layer.addTo(map);
  state.occurrenceLayer = layer;
  map.fitBounds([[loc.bbox[0], loc.bbox[2]], [loc.bbox[1], loc.bbox[3]]], { padding: [24, 24] });
  setMapStatus(`Plotted ${points.length} of ${num(res.data.total)} GBIF records for this region's focus species.`);
}

/* ============================================================ ACTIVITIES */

const LIVE_ACTIVITIES = new Set(['species-story', 'compare-river', 'archive-hunt']);

function renderActivityCards() {
  const grid = $('#activityGrid');
  grid.innerHTML = state.db.activities.map((activity, index) => `
    <button type="button" class="activity-card ${activity.id === state.activityId ? 'is-active' : ''}"
            data-activity="${esc(activity.id)}">
      <span class="activity-card__media">
        <img src="${esc(activity.image.replace(/\.png$/, '.jpg'))}" alt="" loading="lazy">
        <span class="activity-card__count">${String(index + 1).padStart(2, '0')}</span>
        ${state.progress[activity.id] ? '<span class="activity-card__done">Done</span>' : ''}
      </span>
      <span class="activity-card__body">
        <h3>${esc(activity.title)}</h3>
        <p>${esc(activity.subtitle)}</p>
        <span class="activity-card__footer">
          <span>Open in studio</span>
          ${LIVE_ACTIVITIES.has(activity.id) ? '<span class="activity-card__live">Live GBIF</span>' : '<img src="assets/icons/icon-arrow.svg" alt="">'}
        </span>
      </span>
    </button>
  `).join('');
  grid.querySelectorAll('.activity-card').forEach(card => card.addEventListener('click', () => {
    setActivity(card.dataset.activity);
    $('#studio').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function renderStudioSelects() {
  $('#studioPlaceSelect').innerHTML = state.db.locations
    .map(l => `<option value="${esc(l.id)}">${esc(l.title)}</option>`).join('');
  $('#studioActivitySelect').innerHTML = state.db.activities
    .map(a => `<option value="${esc(a.id)}">${esc(a.title)}</option>`).join('');
  $('#studioPlaceSelect').value = state.placeId;
  $('#studioActivitySelect').value = state.activityId;
  $('#studioPlaceSelect').addEventListener('change', e => selectPlace(e.target.value, true));
  $('#studioActivitySelect').addEventListener('change', e => setActivity(e.target.value));
}

function setActivity(id) {
  if (!activityById(id)) return;
  state.activityId = id;
  saveSession();
  $('#studioActivitySelect').value = id;
  renderActivityCards();
  renderActivity();
}

function renderActivity() {
  const place = currentPlace();
  const activity = activityById(state.activityId);

  $('#workspaceHeader').innerHTML = `
    <p class="eyebrow">Active activity</p>
    <h3>${esc(activity.title)}</h3>
    <p>${esc(activity.subtitle)} You are working on <strong>${esc(place.title)}</strong>.</p>
    <div class="workspace-header__meta">
      <span class="pill pill--curated">Curated</span>
      ${LIVE_ACTIVITIES.has(activity.id) ? '<span class="pill pill--live">Live GBIF</span>' : ''}
      <span class="pill pill--student">Your notes</span>
    </div>
  `;

  const done = Boolean(state.progress[activity.id]);
  $('#markComplete').textContent = done ? 'Mark as not complete' : 'Mark this activity complete';
  $('#completeStatus').textContent = done ? 'Marked complete.' : '';

  const body = $('#workspaceBody');
  const builders = {
    'compare-river': buildCompare,
    'trace-routes': buildRoutes,
    'species-story': buildSpecies,
    'field-notes': buildFieldNotes,
    'eco-timeline': buildTimeline,
    'archive-hunt': buildEvidence
  };
  (builders[activity.id] || buildFieldNotes)(body, place);
}

/* ---------------------------------------- activity 1: compare over time */

function buildCompare(body, place) {
  const steps = place.timeline;
  body.innerHTML = `
    <div class="workspace-card">
      <h4><span class="step-num">1</span> Read the place across time</h4>
      <p>Move the slider through ${esc(place.title)}'s timeline. At each moment ask what changed, what stayed, and who had the power to decide.</p>
      <div class="range-row">
        <span>Earliest</span>
        <input id="timeRange" type="range" min="0" max="${Math.max(steps.length - 1, 0)}" value="0"
               aria-label="Timeline position">
        <span>Now</span>
      </div>
      <div class="snapshot-grid" style="margin-top:14px">
        <div class="workspace-card" style="background:var(--page)">
          <h4 id="snapTitle"></h4><p id="snapText"></p>
        </div>
        <div class="workspace-card" style="background:var(--page)">
          <h4>Ask yourself</h4><p id="snapPrompt"></p>
        </div>
      </div>
    </div>

    <div class="workspace-card">
      <h4><span class="step-num">2</span> Compare it with the record <span class="pill pill--live">Live GBIF</span></h4>
      <p>This chart counts biodiversity records published from this region by decade. It is a picture of <strong>observation</strong>, not of abundance — read it as a history of who was watching.</p>
      <div id="decadeChart">${loadingBlock()}</div>
    </div>

    <div class="workspace-card">
      <h4><span class="step-num">3</span> Write the comparison</h4>
      <ul>
        <li>Name one change you can support with the timeline.</li>
        <li>Name one change you can support with the record counts.</li>
        <li>Name one thing the record counts <em>cannot</em> tell you.</li>
      </ul>
      <button type="button" class="button button--light button--small" data-prefill="compare">Start this note for me</button>
    </div>

    <div class="note-prompt">
      <span>Before you finish: what evidence would you need to verify your interpretation? Write that as a <strong>question</strong> note.</span>
    </div>
  `;

  const range = $('#timeRange');
  const update = () => {
    const step = steps[Number(range.value)];
    if (!step) return;
    $('#snapTitle').textContent = `${step.year} — ${step.title}`;
    $('#snapText').textContent = step.detail;
    $('#snapPrompt').textContent =
      `Who benefited from the ${step.title.toLowerCase()} moment, and who carried its costs? What is missing from this one-sentence version of events?`;
  };
  range.addEventListener('input', update);
  update();

  loadDecadeChart(place);
}

async function loadDecadeChart(place) {
  const target = $('#decadeChart');
  if (!target) return;
  const res = await GBIF.yearFacet({ bbox: place.bbox, from: 1900 });
  if (!$('#decadeChart')) return;
  if (!res.ok) { target.innerHTML = errorBlock(res, 'decades'); return; }

  const decades = GBIF.toDecades(res.data.years);
  if (!decades.length) {
    target.innerHTML = `<p class="data-note">GBIF returned no dated records for this bounding box since 1900. That absence is itself worth a note.</p>`;
    return;
  }
  const max = Math.max(...decades.map(d => d.count));
  target.innerHTML = `
    <div class="chart" role="img" aria-label="${esc(decades.map(d => `${d.decade}s: ${d.count} records`).join('; '))}">
      ${decades.map(d => `
        <span class="chart__col" title="${d.decade}s — ${num(d.count)} records">
          <span class="chart__value">${d.count >= 1000 ? Math.round(d.count / 1000) + 'k' : d.count}</span>
          <span class="chart__bar" style="height:${Math.max((d.count / max) * 100, 1.5)}%"></span>
          <span class="chart__label">${d.decade}s</span>
        </span>`).join('')}
    </div>
    <div class="chart-legend">
      <span>${num(res.data.total)} dated records since 1900</span>
      <span>Tallest bar: ${num(max)} records in the ${decades.find(d => d.count === max).decade}s</span>
    </div>
    <p class="data-note">Almost every region shows a steep rise after about 1990. That is the arrival of digital databases and smartphone apps, not a biodiversity boom.</p>
  `;
}

/* --------------------------------------------- activity 2: trace routes */

function buildRoutes(body, place) {
  body.innerHTML = `
    <div class="workspace-card">
      <h4><span class="step-num">1</span> Pick a journey and draw it</h4>
      <p>Choose a route and press trace. Scroll back up to the map to watch it appear.</p>
      <div class="select-row">
        <select id="routeSelect" aria-label="Choose a route">
          ${state.db.routes.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}
        </select>
        <button type="button" class="button button--dark button--small" id="traceButton">Trace on the map</button>
      </div>
      <div id="routeStops" class="route-stops" style="margin-top:14px"></div>
    </div>

    <div class="workspace-card">
      <h4><span class="step-num">2</span> Break the movement into four questions</h4>
      <ul>
        <li><strong>What moves?</strong> A body, a seed, a song, a debt, a disease.</li>
        <li><strong>Why does it move?</strong> Season, wage, war, water, weather, force.</li>
        <li><strong>What makes movement possible?</strong> Rivers, rails, flyways, visas, wire.</li>
        <li><strong>What stops it?</strong> Dams, borders, fences, drought, cost, law.</li>
      </ul>
      <p>Then connect it back to <strong>${esc(place.title)}</strong>: is this place an origin, a corridor, a barrier, or a destination?</p>
    </div>

    <div class="workspace-card">
      <h4><span class="step-num">3</span> Test one leg against the record</h4>
      <p>Migration routes are a claim about where something is, and when. The monarch route is the easiest to check: monarchs are one of the most-recorded insects in GBIF.</p>
      <button type="button" class="button button--light button--small" id="checkRouteButton">Check monarch records by decade</button>
      <div id="routeCheck" style="margin-top:12px"></div>
    </div>

    <div class="note-prompt">
      <span>Write one note naming an <strong>environmental</strong> factor and one <strong>human</strong> factor shaping this route.</span>
      <button type="button" class="button button--light button--small" data-prefill="route">Start this note</button>
    </div>
  `;

  const select = $('#routeSelect');
  const updateStops = () => {
    const route = state.db.routes.find(r => r.id === select.value);
    $('#routeStops').innerHTML = route.points.map((p, i) =>
      `<div class="route-stop"><strong>Stop ${i + 1}</strong><div>${p[0].toFixed(2)}°, ${p[1].toFixed(2)}° — what would you expect to find here, and who would you ask?</div></div>`
    ).join('');
  };
  select.addEventListener('change', updateStops);
  $('#traceButton').addEventListener('click', () => {
    drawRoute(select.value);
    updateStops();
    $('#explore').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  updateStops();

  $('#checkRouteButton').addEventListener('click', async () => {
    const box = $('#routeCheck');
    box.innerHTML = loadingBlock('Counting monarch records…');
    const res = await GBIF.yearFacet({ taxonKey: 5133088, from: 1950 }); // Danaus plexippus
    if (!res.ok) { box.innerHTML = errorBlock(res); return; }
    const decades = GBIF.toDecades(res.data.years);
    const max = Math.max(...decades.map(d => d.count));
    box.innerHTML = `
      <div class="chart" role="img" aria-label="Monarch butterfly records by decade">
        ${decades.map(d => `<span class="chart__col" title="${d.decade}s — ${num(d.count)}">
          <span class="chart__value">${d.count >= 1000 ? Math.round(d.count / 1000) + 'k' : d.count}</span>
          <span class="chart__bar" style="height:${Math.max((d.count / max) * 100, 1.5)}%"></span>
          <span class="chart__label">${d.decade}s</span></span>`).join('')}
      </div>
      <p class="data-note"><em>Danaus plexippus</em> — ${num(res.data.total)} dated records worldwide since 1950, via GBIF.
      Monarch populations have fallen sharply over this period while the record count has risen sharply. Explain that contradiction in your notes.</p>
    `;
  });
}

/* ------------------------------------------- activity 3: species story */

function buildSpecies(body, place) {
  const species = place.species || [];
  body.innerHTML = `
    <div class="workspace-card">
      <h4><span class="step-num">1</span> Choose a species from ${esc(place.title)}</h4>
      <p>Each option below is linked to a real GBIF taxon. Choosing one pulls its taxonomy, common names, photographs, and occurrence records live.</p>
      <div class="select-row">
        <select id="speciesSelect" aria-label="Choose a species">
          ${species.map(s => `<option value="${esc(String(s.gbifKey))}">${esc(s.name)} — ${esc(s.scientificName)}</option>`).join('')}
        </select>
        <button type="button" class="button button--dark button--small" id="speciesGo">Investigate</button>
      </div>
      <details style="margin-top:12px">
        <summary style="cursor:pointer;font-weight:700">Or look up any species yourself</summary>
        <div class="select-row" style="margin-top:10px">
          <input type="text" id="speciesQuery" placeholder="Ex: Danaus plexippus, or bald eagle" aria-label="Search GBIF for a species">
          <button type="button" class="button button--light button--small" id="speciesSearch">Search GBIF</button>
        </div>
        <div id="speciesResults" style="margin-top:10px"></div>
      </details>
    </div>

    <div id="speciesReport">${loadingBlock()}</div>

    <div class="workspace-card">
      <h4><span class="step-num">3</span> Turn the data into a story</h4>
      <ul>
        <li>Where is it recorded, and where is it recorded <em>near this place</em>?</li>
        <li>What does the shape of the record over time suggest — and what could explain it besides the species itself?</li>
        <li>Who made these records? Museums, researchers, or people with phones? What does that change?</li>
        <li>What relationship do people here have with this species — food, work, danger, story, law?</li>
      </ul>
      <button type="button" class="button button--light button--small" data-prefill="species">Start this note</button>
    </div>
  `;

  const run = () => loadSpeciesReport(Number($('#speciesSelect').value), place);
  $('#speciesGo').addEventListener('click', run);
  $('#speciesSelect').addEventListener('change', run);

  $('#speciesSearch').addEventListener('click', async () => {
    const q = $('#speciesQuery').value.trim();
    const out = $('#speciesResults');
    if (!q) { out.innerHTML = '<p class="data-note">Type a name first.</p>'; return; }
    out.innerHTML = loadingBlock('Searching the GBIF backbone taxonomy…');
    const res = await GBIF.searchSpecies(q, 8);
    if (!res.ok) { out.innerHTML = errorBlock(res); return; }
    if (!res.data.length) { out.innerHTML = `<p class="data-note">No accepted species matched “${esc(q)}”. Try the scientific name.</p>`; return; }
    out.innerHTML = `<div class="record-list">${res.data.map(r => `
      <div class="record">
        <div class="record__top">
          <span class="record__title">${esc(r.scientificName)}</span>
          <button type="button" class="record__cite" data-species-key="${r.gbifKey}">Investigate</button>
        </div>
        <div class="record__meta">${esc([r.vernacularName, r.className, r.family].filter(Boolean).join(' · ') || 'No common name listed')}</div>
      </div>`).join('')}</div>`;
    out.querySelectorAll('[data-species-key]').forEach(btn =>
      btn.addEventListener('click', () => loadSpeciesReport(Number(btn.dataset.speciesKey), place)));
  });

  if (species.length) run();
  else $('#speciesReport').innerHTML = '<div class="workspace-card"><p>No focus species is listed for this place yet. Use the search box above.</p></div>';
}

async function loadSpeciesReport(taxonKey, place) {
  const target = $('#speciesReport');
  if (!target || !taxonKey) return;
  target.innerHTML = `<div class="workspace-card">${loadingBlock('Pulling live records from GBIF…')}</div>`;

  const [taxonRes, vernRes, profileRes, globalRes, localRes, photoRes, yearRes] = await Promise.all([
    GBIF.taxon(taxonKey),
    GBIF.vernacularNames(taxonKey),
    GBIF.speciesProfile(taxonKey),
    GBIF.count({ taxonKey, hasCoordinate: 'true' }),
    GBIF.count({
      taxonKey, hasCoordinate: 'true', hasGeospatialIssue: 'false',
      decimalLatitude: `${place.bbox[0]},${place.bbox[1]}`,
      decimalLongitude: `${place.bbox[2]},${place.bbox[3]}`
    }),
    GBIF.occurrences({ taxonKey, limit: 1, mediaOnly: true }),
    GBIF.yearFacet({ taxonKey, from: 1900 })
  ]);

  if (!$('#speciesReport')) return;
  if (!taxonRes.ok) { target.innerHTML = `<div class="workspace-card">${errorBlock(taxonRes)}</div>`; return; }

  const t = taxonRes.data;
  const names = vernRes.ok ? vernRes.data.slice(0, 4) : [];
  const profile = profileRes.ok ? profileRes.data : {};
  const globalCount = globalRes.ok ? globalRes.data : null;
  const localCount = localRes.ok ? localRes.data : null;
  const photo = photoRes.ok && photoRes.data.records[0] ? photoRes.data.records[0].image : null;
  const photoRecord = photoRes.ok ? photoRes.data.records[0] : null;
  const decades = yearRes.ok ? GBIF.toDecades(yearRes.data.years) : [];
  const maxDecade = decades.length ? Math.max(...decades.map(d => d.count)) : 0;

  const habitats = ['marine', 'freshwater', 'terrestrial'].filter(k => profile[k]);

  target.innerHTML = `
    <div class="workspace-card">
      <h4><span class="step-num">2</span> What GBIF holds <span class="pill pill--live">Live data</span></h4>
      <div class="species-header">
        <div class="species-header__text">
          <h4 style="margin-bottom:2px">${esc(names[0] || t.canonicalName || t.scientificName)}</h4>
          <div class="species-sci">${esc(t.scientificName || t.canonicalName)}</div>
          ${names.length > 1 ? `<p class="data-note" style="margin-top:8px">Also called: ${esc(names.slice(1).join(', '))}</p>` : ''}
          ${profile.extinct ? '<p class="data-note"><strong>GBIF flags this taxon as extinct.</strong></p>' : ''}
        </div>
        ${photo ? `<div>
          <div class="species-photo"><img src="${esc(photo.url)}" alt="Photograph of ${esc(t.canonicalName || 'this species')} from a GBIF occurrence record" loading="lazy"></div>
          <p class="photo-credit">${esc(photo.creator || 'Unknown photographer')} · ${esc(photo.license)}${photoRecord ? ` · <a href="${esc(photoRecord.url)}" target="_blank" rel="noopener">record</a>` : ''}</p>
        </div>` : ''}
      </div>

      <dl class="fact-grid">
        <div class="fact"><dt>Records worldwide</dt><dd>${globalCount === null ? '—' : num(globalCount)}</dd></div>
        <div class="fact"><dt>Records in this region</dt><dd>${localCount === null ? '—' : num(localCount)}<br><small>inside ${esc(place.title)}'s box</small></dd></div>
        <div class="fact"><dt>Family</dt><dd>${esc(t.family || '—')}</dd></div>
        <div class="fact"><dt>${t.class ? 'Class' : (t.phylum ? 'Phylum' : 'Class')}</dt><dd>${esc(t.class || t.phylum || '—')}</dd></div>
        <div class="fact"><dt>Habitat</dt><dd>${habitats.length ? esc(habitats.join(', ')) : '<small>not stated</small>'}</dd></div>
        <div class="fact"><dt>GBIF taxon</dt><dd><a href="https://www.gbif.org/species/${taxonKey}" target="_blank" rel="noopener">${taxonKey}</a></dd></div>
      </dl>

      ${localCount === 0 ? `<p class="note-prompt" style="margin-top:14px"><span>
        <strong>Zero records here.</strong> That is a finding, not an error. Does it mean the species is absent, that nobody surveyed,
        that records exist but were never digitised, or that it is catalogued under a different name? Write down which explanation you would test first.
      </span></p>` : ''}

      ${decades.length ? `
        <p class="data-note" style="margin-top:16px"><strong>Records worldwide by decade:</strong></p>
        <div class="chart" role="img" aria-label="${esc(decades.map(d => `${d.decade}s: ${d.count}`).join('; '))}">
          ${decades.map(d => `<span class="chart__col" title="${d.decade}s — ${num(d.count)}">
            <span class="chart__value">${d.count >= 1000 ? Math.round(d.count / 1000) + 'k' : d.count}</span>
            <span class="chart__bar" style="height:${Math.max((d.count / maxDecade) * 100, 1.5)}%"></span>
            <span class="chart__label">${d.decade}s</span></span>`).join('')}
        </div>` : ''}
    </div>

    <div class="workspace-card">
      <h4>Recent records near ${esc(place.title)}</h4>
      <div id="speciesRecords">${loadingBlock('Fetching individual records…')}</div>
    </div>
  `;

  const recRes = await GBIF.occurrences({
    taxonKey, bbox: place.bbox, limit: 6, extra: { sortBy: 'eventDate', sortOrder: 'desc' }
  });
  const list = $('#speciesRecords');
  if (!list) return;

  if (!recRes.ok) { list.innerHTML = errorBlock(recRes); return; }
  if (!recRes.data.records.length) {
    list.innerHTML = `<p class="data-note">No georeferenced records for this species inside this region's bounding box.
      Widen the question: where is the nearest record, and what stands between here and there?</p>`;
    return;
  }
  list.innerHTML = `<div class="record-list">${recRes.data.records.map(r => renderRecord(r)).join('')}</div>
    <p class="data-note" style="margin-top:10px">Showing ${recRes.data.records.length} of ${num(recRes.data.total)} records. Press <strong>Cite</strong> to drop a formatted citation into your notebook.</p>`;
  bindRecordCitations(list, recRes.data.records);
}

function renderRecord(r) {
  return `<div class="record">
    <div class="record__top">
      <span class="record__title">${esc(r.scientificName || r.title)}</span>
      <span class="record__date">${esc(r.date ? String(r.date).slice(0, 10) : 'undated')}</span>
    </div>
    <div class="record__meta">
      ${esc(r.place || 'Location not described')}${r.location ? ` · ${r.location.lat.toFixed(3)}°, ${r.location.lng.toFixed(3)}°` : ''}
      ${r.coordinateUncertaintyMeters ? ` · ±${num(r.coordinateUncertaintyMeters)} m` : ''}
      <br>${esc(r.basisOfRecord)}${r.dataset ? ' · ' + esc(r.dataset) : ''}${r.recordedBy ? ' · recorded by ' + esc(r.recordedBy) : ''}
    </div>
    <div class="record__foot">
      <span class="record__license">${esc(r.license)}</span>
      <a href="${esc(r.url)}" target="_blank" rel="noopener">Open on GBIF</a>
      <button type="button" class="record__cite" data-cite="${esc(String(r.gbifKey))}">Cite in my notes</button>
    </div>
  </div>`;
}

function bindRecordCitations(scope, records) {
  scope.querySelectorAll('[data-cite]').forEach(btn => btn.addEventListener('click', () => {
    const record = records.find(r => String(r.gbifKey) === btn.dataset.cite);
    if (!record) return;
    const place = currentPlace();
    fillNoteForm({
      title: `Record: ${record.scientificName || record.title}`,
      location: place.title,
      kind: 'observation',
      text: `${record.scientificName || record.title} was recorded at ${record.place || 'an undescribed location'} on ${record.date ? String(record.date).slice(0, 10) : 'an unrecorded date'}. Basis: ${record.basisOfRecord}.\n\nWhat I still need to know: `,
      source: GBIF.citeOccurrence(record),
      confidence: 'high',
      tags: 'gbif, evidence'
    });
    toast('Citation added to the notebook form — finish the note and save.');
    $('#notebook').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
}

/* ------------------------------------------- activity 4: field notes */

function buildFieldNotes(body, place) {
  body.innerHTML = `
    <div class="workspace-card">
      <h4><span class="step-num">1</span> Read ${esc(place.title)} as a site</h4>
      <p>${esc(place.summary)}</p>
      <p><strong>Inquiry prompt:</strong> ${esc(place.quote)}</p>
    </div>

    <div class="workspace-card">
      <h4><span class="step-num">2</span> Separate the three moves</h4>
      <p>Most weak field notes collapse these together. Keep them apart and your writing gets sharper immediately.</p>
      <div class="species-list">
        <div class="timeline-step"><strong>Observation</strong><div>What can you point to? “The timeline lists a flood in 1927.” “GBIF holds 296 paddlefish records in this box.”</div></div>
        <div class="timeline-step"><strong>Interpretation</strong><div>What do you think it means? “Levee building shifted flood risk onto the people with the least power to move.”</div></div>
        <div class="timeline-step"><strong>Question</strong><div>What would you need to check? “Who was living behind the levees that failed, and who decided where they were built?”</div></div>
      </div>
    </div>

    <div class="workspace-card">
      <h4><span class="step-num">3</span> Write one of each</h4>
      <p>Use the notebook beside this panel. Set the type for each note — your exported report groups them, and the grouping is the point.</p>
      <div class="select-row">
        <button type="button" class="button button--light button--small" data-prefill="observation">Start an observation</button>
        <button type="button" class="button button--light button--small" data-prefill="interpretation">Start an interpretation</button>
        <button type="button" class="button button--light button--small" data-prefill="question">Start a question</button>
      </div>
    </div>

    <div class="workspace-card">
      <h4><span class="step-num">4</span> Whose account is missing?</h4>
      <p>Every atlas entry is a summary written by someone. Name a person or group whose account of ${esc(place.title)} would change what you just wrote, and say how you would find it: an oral-history archive, a local paper, a tribal or community historian, a fisher, a farmer, a city record.</p>
    </div>
  `;
}

/* ------------------------------------------ activity 5: eco timeline */

function buildTimeline(body, place) {
  body.innerHTML = `
    <div class="workspace-card">
      <h4><span class="step-num">1</span> The timeline you were given</h4>
      <p>Four moments from ${esc(place.title)}. Read them as claims, not facts — each one was chosen by somebody.</p>
      <div class="timeline-steps">
        ${place.timeline.map(item => `
          <div class="timeline-step"><strong>${esc(item.year)} — ${esc(item.title)}</strong><div>${esc(item.detail)}</div></div>
        `).join('')}
      </div>
    </div>

    <div class="workspace-card">
      <h4><span class="step-num">2</span> Sort each moment into a strand</h4>
      <p>Tag every event with the strands it belongs to. Most belong to more than one, and that overlap is the argument you are building.</p>
      <div id="strandGrid" class="species-list"></div>
    </div>

    <div class="workspace-card">
      <h4><span class="step-num">3</span> Find the causal link</h4>
      <p>Pick two events and write the sentence that connects them, using a verb that names a mechanism: <em>drained, financed, displaced, criminalised, subsidised, engineered, protected</em>. Avoid “led to.” It hides the actor.</p>
      <button type="button" class="button button--light button--small" data-prefill="timeline">Start this note</button>
    </div>

    <div class="note-prompt">
      <span>Which event changed this place most — and whose perspective would rank them differently?</span>
    </div>
  `;

  const strands = ['Ecology', 'Settlement', 'Infrastructure', 'Industry', 'Law & policy', 'Climate', 'Memory'];
  const key = `strands:${place.id}`;
  const saved = readJSON(STORAGE.progress, {})[key] || {};

  $('#strandGrid').innerHTML = place.timeline.map((item, i) => `
    <div class="timeline-step">
      <strong>${esc(item.year)} — ${esc(item.title)}</strong>
      <div class="tags" style="margin-top:8px">
        ${strands.map(s => `<button type="button" class="filter-chip ${(saved[i] || []).includes(s) ? 'is-active' : ''}"
          data-event="${i}" data-strand="${esc(s)}" aria-pressed="${(saved[i] || []).includes(s)}">${esc(s)}</button>`).join('')}
      </div>
    </div>
  `).join('');

  $('#strandGrid').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    const idx = btn.dataset.event;
    const strand = btn.dataset.strand;
    const progress = readJSON(STORAGE.progress, {});
    const store = progress[key] || {};
    const list = store[idx] || [];
    const next = list.includes(strand) ? list.filter(s => s !== strand) : list.concat(strand);
    store[idx] = next;
    progress[key] = store;
    writeJSON(STORAGE.progress, progress);
    state.progress = progress;
    btn.classList.toggle('is-active', next.includes(strand));
    btn.setAttribute('aria-pressed', String(next.includes(strand)));
  }));
}

/* ------------------------------------- activity 6: evidence / archive */

const EVIDENCE_TYPES = [
  { id: 'map', label: 'A map or chart', hint: 'Who drew it, for whom, and what did they leave off?' },
  { id: 'photo', label: 'A photograph or postcard', hint: 'Who is behind the camera, and who agreed to be in front of it?' },
  { id: 'record', label: 'A government or legal record', hint: 'What did the state want to count, and what did counting make possible?' },
  { id: 'oral', label: 'An oral history or interview', hint: 'Who was asked, who was not, and who holds the recording?' },
  { id: 'news', label: 'A newspaper or magazine article', hint: 'Whose account made it to print at the time?' },
  { id: 'specimen', label: 'A scientific specimen or observation', hint: 'A GBIF record counts here — you can collect one below.' }
];

function buildEvidence(body, place) {
  const key = `evidence:${place.id}`;
  const saved = state.progress[key] || {};

  body.innerHTML = `
    <div class="workspace-card">
      <h4><span class="step-num">1</span> Build an evidence trail for ${esc(place.title)}</h4>
      <p>Six kinds of evidence, six different silences. Tick each one you could actually locate, and note where you would look.</p>
      <div class="archive-list" id="evidenceList">
        ${EVIDENCE_TYPES.map(t => `
          <label class="archive-item ${saved[t.id] ? 'is-done' : ''}">
            <input type="checkbox" data-evidence="${t.id}" ${saved[t.id] ? 'checked' : ''}>
            <span><strong>${esc(t.label)}</strong><small>${esc(t.hint)}</small></span>
          </label>`).join('')}
      </div>
    </div>

    <div class="workspace-card">
      <h4><span class="step-num">2</span> Collect a real one <span class="pill pill--live">Live GBIF</span></h4>
      <p>These are actual specimen and observation records published from this region — the sixth evidence type, already in your hands. Each carries a collector, a date, an institution, and a license.</p>
      <div class="select-row" style="margin-bottom:12px">
        <select id="evidenceBasis" aria-label="Kind of record">
          <option value="PRESERVED_SPECIMEN">Museum and herbarium specimens</option>
          <option value="HUMAN_OBSERVATION">Observations by people</option>
          <option value="MACHINE_OBSERVATION">Machine and sensor records</option>
          <option value="FOSSIL_SPECIMEN">Fossil specimens</option>
        </select>
        <button type="button" class="button button--dark button--small" id="evidenceLoad">Find records</button>
      </div>
      <div id="evidenceRecords">${loadingBlock()}</div>
    </div>

    <div class="workspace-card">
      <h4><span class="step-num">3</span> The question that matters most</h4>
      <p>Not “what did I find?” but <strong>“what is missing, and why is it missing?”</strong> Specimen records tell you where collectors travelled. Observation records tell you where people with phones live. Neither tells you where the species is.</p>
      <ul>
        <li>Which of the six evidence types would be hardest to find for this place? Why?</li>
        <li>Whose knowledge of this place would never enter any of these six categories?</li>
      </ul>
      <button type="button" class="button button--light button--small" data-prefill="evidence">Start this note</button>
    </div>
  `;

  $('#evidenceList').querySelectorAll('input').forEach(box => box.addEventListener('change', () => {
    const store = state.progress[key] || {};
    store[box.dataset.evidence] = box.checked;
    state.progress[key] = store;
    writeJSON(STORAGE.progress, state.progress);
    box.closest('.archive-item').classList.toggle('is-done', box.checked);
  }));

  const load = () => loadEvidenceRecords(place, $('#evidenceBasis').value);
  $('#evidenceLoad').addEventListener('click', load);
  load();
}

async function loadEvidenceRecords(place, basisOfRecord) {
  const target = $('#evidenceRecords');
  if (!target) return;
  target.innerHTML = loadingBlock('Searching GBIF for records from this region…');

  const res = await GBIF.occurrences({
    bbox: place.bbox, limit: 5, extra: { basisOfRecord }
  });
  if (!$('#evidenceRecords')) return;
  if (!res.ok) { target.innerHTML = errorBlock(res); return; }
  if (!res.data.records.length) {
    target.innerHTML = `<p class="data-note">GBIF holds no records of this kind inside this bounding box.
      For fossils and machine records that is common — and it tells you something about which kinds of evidence get collected where.</p>`;
    return;
  }
  target.innerHTML = `<div class="record-list">${res.data.records.map(renderRecord).join('')}</div>
    <p class="data-note" style="margin-top:10px">${num(res.data.total)} records of this kind in this region.</p>`;
  bindRecordCitations(target, res.data.records);
}

/* =============================================================== NOTEBOOK */

function loadNotes() {
  state.notes = readJSON(STORAGE.notes, null) || migrateLegacyNotes();
}

function migrateLegacyNotes() {
  const old = readJSON(STORAGE.legacyNotes, []);
  if (!old.length) return [];
  const migrated = old.map(n => ({
    id: n.id || String(Date.now() + Math.random()),
    title: n.title || 'Untitled note',
    location: n.location || '',
    kind: 'observation',
    text: n.text || '',
    source: '',
    confidence: 'medium',
    tags: [],
    createdAt: n.createdAt || new Date().toISOString()
  }));
  writeJSON(STORAGE.notes, migrated);
  return migrated;
}

function saveNotes() {
  writeJSON(STORAGE.notes, state.notes);
  renderNotes();
}

function noteFormValues() {
  return {
    title: $('#noteTitle').value.trim(),
    location: $('#noteLocation').value.trim(),
    kind: ($$('input[name="kind"]').find(r => r.checked) || {}).value || 'observation',
    text: $('#noteText').value.trim(),
    source: $('#noteSource').value.trim(),
    confidence: $('#noteConfidence').value,
    tags: $('#noteTags').value.split(',').map(t => t.trim()).filter(Boolean)
  };
}

function fillNoteForm(values) {
  $('#noteTitle').value = values.title || '';
  $('#noteLocation').value = values.location || '';
  $('#noteText').value = values.text || '';
  $('#noteSource').value = values.source || '';
  $('#noteConfidence').value = values.confidence || 'medium';
  $('#noteTags').value = Array.isArray(values.tags) ? values.tags.join(', ') : (values.tags || '');
  const radio = $$('input[name="kind"]').find(r => r.value === (values.kind || 'observation'));
  if (radio) radio.checked = true;
  saveDraft();
}

function saveDraft() {
  writeJSON(STORAGE.draft, noteFormValues());
}

function restoreDraft() {
  const draft = readJSON(STORAGE.draft, null);
  if (draft && (draft.title || draft.text)) fillNoteForm(draft);
}

function bindNotebook() {
  restoreDraft();

  $('#notesForm').addEventListener('submit', e => {
    e.preventDefault();
    const values = noteFormValues();
    if (!values.title || !values.text) {
      $('#noteFormStatus').textContent = 'Add a title and a note before saving.';
      $('#noteFormStatus').style.color = '#a33';
      ($('#noteTitle').value ? $('#noteText') : $('#noteTitle')).focus();
      return;
    }
    if (state.editingNoteId) {
      const note = state.notes.find(n => n.id === state.editingNoteId);
      Object.assign(note, values, { updatedAt: new Date().toISOString() });
      state.editingNoteId = null;
      $('#saveNoteButton').textContent = 'Save note';
      toast('Note updated.');
    } else {
      state.notes.unshift(Object.assign({
        id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
        place: state.placeId,
        activity: state.activityId,
        createdAt: new Date().toISOString()
      }, values));
      toast('Note saved to this browser.');
    }
    saveNotes();
    clearNoteForm();
    $('#noteFormStatus').style.color = '';
    $('#noteFormStatus').textContent = 'Saved.';
    setTimeout(() => { $('#noteFormStatus').textContent = ''; }, 2500);
  });

  $('#clearNoteButton').addEventListener('click', () => {
    clearNoteForm();
    state.editingNoteId = null;
    $('#saveNoteButton').textContent = 'Save note';
  });

  $('#notesForm').addEventListener('input', debounce(saveDraft, 400));

  $('#exportHtmlButton').addEventListener('click', exportReport);
  $('#exportJsonButton').addEventListener('click', exportJSON);
  $('#printButton').addEventListener('click', () => window.print());
}

function clearNoteForm() {
  $('#notesForm').reset();
  localStorage.removeItem(STORAGE.draft);
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const KIND_LABEL = { observation: 'Observation', interpretation: 'Interpretation', question: 'Question' };

function renderNotes() {
  const list = $('#notesList');
  $('#notesCount').textContent = `${state.notes.length} note${state.notes.length === 1 ? '' : 's'}`;

  const disabled = state.notes.length === 0;
  ['#exportHtmlButton', '#exportJsonButton', '#printButton'].forEach(sel => { $(sel).disabled = disabled; });

  if (!state.notes.length) {
    list.innerHTML = `<div class="notes-empty">
      <strong>No notes yet.</strong><br>
      Work through an activity and save what you notice. Aim for at least one observation, one interpretation, and one question before you export.
    </div>`;
    return;
  }

  list.innerHTML = state.notes.map(note => `
    <article class="note-item note-item--${esc(note.kind || 'observation')}">
      <strong>${esc(note.title)}</strong>
      <div class="note-item__meta">
        ${esc(KIND_LABEL[note.kind] || 'Note')} · ${esc(note.location || 'No place given')} ·
        ${esc(new Date(note.createdAt).toLocaleString())}${note.confidence ? ` · ${esc(note.confidence)} confidence` : ''}
      </div>
      <div class="note-item__body">${esc(note.text).replace(/\n/g, '<br>')}</div>
      ${note.source ? `<div class="note-item__source"><strong>Source:</strong> ${esc(note.source)}</div>` : ''}
      ${(note.tags || []).length ? `<div class="note-item__tags">${note.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="note-item__actions">
        <button type="button" data-edit="${esc(note.id)}">Edit</button>
        <button type="button" data-delete="${esc(note.id)}">Delete</button>
      </div>
    </article>
  `).join('');

  list.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    const note = state.notes.find(n => n.id === btn.dataset.edit);
    if (!note) return;
    fillNoteForm(note);
    state.editingNoteId = note.id;
    $('#saveNoteButton').textContent = 'Update note';
    $('#noteTitle').focus();
  }));

  list.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => {
    const note = state.notes.find(n => n.id === btn.dataset.delete);
    if (!note) return;
    if (!confirm(`Delete “${note.title}”? This cannot be undone.`)) return;
    state.notes = state.notes.filter(n => n.id !== btn.dataset.delete);
    saveNotes();
    toast('Note deleted.');
  }));
}

/* ================================================================ EXPORT */

function exportReport() {
  const grouped = { observation: [], interpretation: [], question: [] };
  state.notes.forEach(n => (grouped[n.kind] || grouped.observation).push(n));
  const place = currentPlace();
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const section = (key, heading, blurb) => grouped[key].length ? `
    <section>
      <h2>${heading} <span class="count">${grouped[key].length}</span></h2>
      <p class="blurb">${blurb}</p>
      ${grouped[key].map(n => `
        <article>
          <h3>${esc(n.title)}</h3>
          <p class="meta">${esc(n.location || 'No place given')} · ${esc(new Date(n.createdAt).toLocaleString())} · ${esc(n.confidence || 'medium')} confidence</p>
          <p>${esc(n.text).replace(/\n/g, '<br>')}</p>
          ${n.source ? `<p class="source"><strong>Source:</strong> ${esc(n.source)}</p>` : ''}
          ${(n.tags || []).length ? `<p class="tags">${n.tags.map(t => `<span>${esc(t)}</span>`).join('')}</p>` : ''}
        </article>`).join('')}
    </section>` : '';

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Field notes — Eco Ethnography Atlas</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; color: #2e2b3f; background: #f6efe3; margin: 0; padding: 40px 20px; line-height: 1.6; }
  main { max-width: 780px; margin: 0 auto; background: #fff; border: 3px solid #d8a24a; border-radius: 24px; padding: 40px; }
  h1 { font-size: 2.1rem; letter-spacing: -.03em; margin: 0 0 6px; }
  .lede { color: #625d70; margin: 0 0 28px; }
  h2 { font-size: 1.3rem; margin: 34px 0 4px; border-bottom: 2px solid #f0e5d2; padding-bottom: 8px; }
  h2 .count { color: #928b74; font-size: .95rem; font-weight: 500; }
  .blurb { color: #625d70; font-size: .9rem; margin: 0 0 16px; }
  article { border-left: 4px solid #dfeacd; padding: 4px 0 4px 16px; margin: 0 0 20px; }
  article h3 { margin: 0 0 4px; font-size: 1.05rem; }
  .meta { color: #7b6647; font-size: .82rem; font-weight: 700; margin: 0 0 8px; }
  .source { background: #f6efe3; padding: 10px 12px; border-radius: 10px; font-size: .84rem; word-break: break-word; }
  .tags span { background: #f6efe3; border-radius: 999px; padding: 2px 10px; font-size: .78rem; font-weight: 700; margin-right: 6px; }
  footer { margin-top: 36px; padding-top: 18px; border-top: 1px solid #eee; color: #625d70; font-size: .82rem; }
  @media print { body { background: #fff; padding: 0; } main { border: none; padding: 0; } article { break-inside: avoid; } }
</style></head>
<body><main>
  <h1>Field notes</h1>
  <p class="lede">Eco Ethnography Atlas · ${esc(place.title)} · ${esc(today)} · ${state.notes.length} notes</p>
  ${section('observation', 'Observations', 'Things I can point to in a source, a record, or the landscape itself.')}
  ${section('interpretation', 'Interpretations', 'What I think those observations mean. These are arguments, and they can be wrong.')}
  ${section('question', 'Open questions', 'What I still need to verify, and whose account is still missing.')}
  <footer>
    <p>Biodiversity records in these notes come from GBIF. ${esc(GBIF.citeDownload(place.title))}</p>
    <p>Each occurrence record carries its own license from its publishing institution; check before republishing an image or dataset.</p>
    <p>Base map © OpenStreetMap contributors.</p>
  </footer>
</main></body></html>`;

  download(html, `field-notes-${place.id}-${new Date().toISOString().slice(0, 10)}.html`, 'text/html');
  toast('Report downloaded. Open it in a browser, then print to PDF if you need one.');
}

function exportJSON() {
  const payload = {
    exportedAt: new Date().toISOString(),
    place: currentPlace().title,
    activity: activityById(state.activityId).title,
    sources: state.db.meta ? state.db.meta.dataSources : [],
    gbifCitation: GBIF.citeDownload(currentPlace().title),
    notes: state.notes
  };
  download(JSON.stringify(payload, null, 2), `field-notes-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  toast('JSON downloaded.');
}

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

/* =============================================================== PROGRESS */

function renderProgress() {
  const total = state.db.activities.length;
  const done = state.db.activities.filter(a => state.progress[a.id]).length;
  $('#progressSummary').innerHTML = `
    <span>${done} of ${total} activities complete</span>
    <span class="bar"><i style="width:${(done / total) * 100}%"></i></span>
  `;
}

/* ========================================================= GLOBAL ACTIONS */

function bindGlobalActions() {
  $('#markComplete').addEventListener('click', () => {
    const id = state.activityId;
    state.progress[id] = !state.progress[id];
    writeJSON(STORAGE.progress, state.progress);
    renderActivityCards();
    renderProgress();
    $('#markComplete').textContent = state.progress[id] ? 'Mark as not complete' : 'Mark this activity complete';
    $('#completeStatus').textContent = state.progress[id] ? 'Marked complete.' : '';
  });

  $('#toggleOccurrences').addEventListener('click', e => {
    state.showOccurrences = !state.showOccurrences;
    e.currentTarget.setAttribute('aria-pressed', String(state.showOccurrences));
    e.currentTarget.textContent = state.showOccurrences ? 'Hide GBIF records' : 'Show GBIF records on map';
    loadOccurrenceLayer();
  });

  $('#clearRoutesButton').addEventListener('click', () => {
    clearRoute();
    setMapStatus('Routes cleared.');
  });

  $('#refreshLive').addEventListener('click', () => {
    GBIF.clearCache();
    loadLivePanel();
    toast('Re-fetched live data from GBIF.');
  });

  $$('[data-jump-activity]').forEach(btn => btn.addEventListener('click', () => {
    setActivity(btn.dataset.jumpActivity);
    $('#studio').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  $('#clearAllData').addEventListener('click', () => {
    if (!confirm('Erase every note, preference, and saved answer stored by this atlas on this device? Export first if you need a copy.')) return;
    Object.values(STORAGE).forEach(key => localStorage.removeItem(key));
    GBIF.clearCache();
    toast('All local data erased. Reloading…');
    setTimeout(() => location.reload(), 900);
  });

  // Prefill buttons live inside dynamically rendered activities.
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-prefill]');
    if (btn) { prefillNote(btn.dataset.prefill); return; }
    const retry = e.target.closest('[data-retry]');
    if (retry) {
      if (retry.dataset.retry === 'live') loadLivePanel();
      else renderActivity();
    }
  });

  window.addEventListener('offline', () => toast('You are offline. Written context and your notes still work.'));
  window.addEventListener('online', () => toast('Back online. Live GBIF data is available again.'));
}

const PREFILLS = {
  compare: {
    kind: 'interpretation', tags: 'change, evidence',
    title: place => `Change over time: ${place.title}`,
    text: place => `Change I can support from the timeline:\n\nChange I can support from the GBIF record counts:\n\nWhat the record counts cannot tell me:\n\nEvidence I would need next:`
  },
  route: {
    kind: 'interpretation', tags: 'movement, routes',
    title: place => `Movement through ${place.title}`,
    text: () => `What moves:\n\nWhy it moves:\n\nEnvironmental factor shaping the route:\n\nHuman factor shaping the route:\n\nWhat stops or slows it:`
  },
  species: {
    kind: 'interpretation', tags: 'species, gbif',
    title: place => `Species story: ${place.title}`,
    text: () => `Species:\n\nWhat the records show:\n\nWhat the shape of the record over time might really be measuring:\n\nHow people here relate to this species:\n\nWhat I still need to check:`
  },
  timeline: {
    kind: 'interpretation', tags: 'timeline, causation',
    title: place => `Causal link in ${place.title}`,
    text: () => `Event A:\n\nEvent B:\n\nThe sentence connecting them (use a verb that names an actor):\n\nWho would order these events differently, and why:`
  },
  evidence: {
    kind: 'question', tags: 'archive, gaps',
    title: place => `What is missing from the record of ${place.title}`,
    text: () => `Evidence type that would be hardest to find:\n\nWhy it is hard to find:\n\nKnowledge about this place that fits none of the six categories:\n\nWho holds that knowledge, and how would I ask:`
  },
  observation: { kind: 'observation', tags: '', title: place => `Observation: ${place.title}`, text: () => `What I can point to:\n\nWhere I saw it (source, record, or map):` },
  interpretation: { kind: 'interpretation', tags: '', title: place => `Interpretation: ${place.title}`, text: () => `What I think it means:\n\nWhat would make me change my mind:` },
  question: { kind: 'question', tags: '', title: place => `Question: ${place.title}`, text: () => `What I still need to verify:\n\nWho or what would answer it:` }
};

function prefillNote(key) {
  const spec = PREFILLS[key];
  if (!spec) return;
  const place = currentPlace();
  fillNoteForm({
    title: spec.title(place),
    location: place.title,
    kind: spec.kind,
    text: spec.text(place),
    source: '',
    confidence: 'medium',
    tags: spec.tags
  });
  $('#notebook').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#noteText').focus();
  toast('Template loaded into the notebook. Fill it in and save.');
}

init();
