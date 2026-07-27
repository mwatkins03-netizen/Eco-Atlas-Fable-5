/* =====================================================================
   explore.js — step 1. The map and the circle.

   Interaction is deliberately one step: click the map, a circle appears.
   Size is set afterwards with presets, a slider, or +/- buttons — nobody
   has to drag out a radius to get started.
   ===================================================================== */

const US_CENTRE = [39.2, -96.5];
const US_VIEW = L.latLngBounds([[24.5, -125], [49.5, -66.5]]);
const US_BOUNDS = L.latLngBounds([[15.0, -172.0], [73.0, -60.0]]); // Alaska & Hawai‘i included
const DEFAULT_KM = 15;

let map, circleLayer, centreMarker, anchorLayer;
let config = null;
let summaryToken = 0;
let searchToken = 0;

const currentCircle = () => Store.getCircle();

/* ---------------------------------------------------------------- init */

async function init() {
  buildMap();

  try {
    config = await (await fetch('data/starting-points.json')).json();
  } catch (_) {
    $('#pointList').innerHTML = errorBlock({
      message: 'The starting-point list could not load. Serve this folder over HTTP rather than opening the files directly.'
    });
    config = { startingPoints: [], groups: [] };
  }

  renderStartingPoints();
  drawAnchors();
  bindTools();

  const saved = currentCircle();
  if (saved) applyCircle(saved, { fly: true });
}

/* ----------------------------------------------------------------- map */

function buildMap() {
  map = L.map('map', {
    zoomControl: false,          // replaced with larger custom buttons
    scrollWheelZoom: true,       // the map is the point of this page
    doubleClickZoom: false,      // a double click would drop two circles
    maxBounds: US_BOUNDS,
    maxBoundsViscosity: 0.7,
    minZoom: 3,
    maxZoom: 17
  }).fitBounds(US_VIEW);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18
  }).addTo(map);

  anchorLayer = L.layerGroup().addTo(map);

  // One click, one circle. No mode to enter, nothing to cancel.
  map.on('click', e => {
    const existing = currentCircle();
    commitCircle({
      lat: e.latlng.lat,
      lng: e.latlng.lng,
      radiusKm: existing ? existing.radiusKm : DEFAULT_KM
    });
  });

  map.on('zoomend', updateZoomButtons);
}

// Leaflet drops a zoomIn() that lands mid-animation, so impatient clicking
// feels broken. Accumulate into a target zoom instead and apply it once.
let zoomTarget = null;
let zoomTimer = null;

function nudgeZoom(delta) {
  const base = zoomTarget === null ? map.getZoom() : zoomTarget;
  zoomTarget = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), base + delta));
  updateZoomButtons();
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => {
    const target = zoomTarget;
    zoomTarget = null;
    // animate:false because Leaflet silently discards a zoom request that
    // arrives while another zoom animation is still running — which is exactly
    // what happens when someone taps + or − a few times in a row.
    if (target !== null && target !== map.getZoom()) map.setZoom(target, { animate: false });
    updateZoomButtons();
  }, 90);
}

function updateZoomButtons() {
  const z = zoomTarget === null ? map.getZoom() : zoomTarget;
  $('#zoomIn').disabled = z >= map.getMaxZoom();
  $('#zoomOut').disabled = z <= map.getMinZoom();
}

function updateHint() {
  const hint = $('#mapHint');
  if (currentCircle()) { hint.hidden = true; return; }
  hint.hidden = false;
  hint.innerHTML = '<strong>Click anywhere on the map</strong> to drop your circle there.';
}

/* -------------------------------------------------------- the circle */

// keepMeta is for tweaks to an existing circle — moving the pin, changing the
// radius. A circle placed somewhere new must NOT inherit the old name, or a
// student ends up writing about "The Everglades" while looking at Ohio.
function commitCircle(circle, { keepMeta = false } = {}) {
  const existing = keepMeta ? (currentCircle() || {}) : {};
  const next = Object.assign({}, existing, circle, { updatedAt: new Date().toISOString() });
  Store.setCircle(next);
  applyCircle(next, { fly: !keepMeta });
  renderChrome();
}

function applyCircle(circle, { fly = false } = {}) {
  if (circleLayer) { map.removeLayer(circleLayer); circleLayer = null; }
  if (centreMarker) { map.removeLayer(centreMarker); centreMarker = null; }

  circleLayer = L.circle([circle.lat, circle.lng], {
    radius: circle.radiusKm * 1000,
    color: '#c4551a', weight: 4, fillColor: '#e0873f', fillOpacity: .16,
    interactive: false            // clicks pass through to the map underneath
  }).addTo(map);

  centreMarker = L.marker([circle.lat, circle.lng], {
    draggable: true,
    icon: L.divIcon({ html: '<div class="pin">📍</div>', className: '', iconSize: [34, 34], iconAnchor: [17, 30] }),
    title: 'Drag to move your circle',
    keyboard: true,
    alt: 'Your circle. Drag to move it.'
  }).addTo(map);

  centreMarker.on('drag', e => circleLayer.setLatLng(e.latlng));
  centreMarker.on('dragend', e => {
    const p = e.target.getLatLng();
    commitCircle({ lat: p.lat, lng: p.lng, radiusKm: circle.radiusKm }, { keepMeta: true });
  });

  $('#radiusControl').hidden = false;
  $('#clearButton').hidden = false;
  $('#zoomCircle').hidden = false;
  $('#namePanel').hidden = false;
  $('#radiusRange').value = circle.radiusKm;
  $('#radiusOut').textContent = `${circle.radiusKm} km`;
  paintPresets(circle.radiusKm);

  if ($('#placeName').value !== (circle.name || '')) $('#placeName').value = circle.name || '';

  if (fly) fitCircle();
  updateHint();
  loadSummary(circle);
}

function fitCircle() {
  if (!circleLayer) return;
  map.fitBounds(circleLayer.getBounds(), { padding: [60, 60], maxZoom: 13 });
}

function paintPresets(km) {
  $$('.size-preset').forEach(btn =>
    btn.classList.toggle('is-active', Number(btn.dataset.km) === Number(km)));
}

function setRadius(km, { commit = true } = {}) {
  const circle = currentCircle();
  const clamped = Math.max(2, Math.min(120, Math.round(km)));
  $('#radiusRange').value = clamped;
  $('#radiusOut').textContent = `${clamped} km`;
  paintPresets(clamped);
  if (circleLayer) circleLayer.setRadius(clamped * 1000);
  if (commit && circle) {
    commitCircle({ lat: circle.lat, lng: circle.lng, radiusKm: clamped }, { keepMeta: true });
    fitCircle();
  }
}

/* ------------------------------------------------------- live summary */

async function loadSummary(circle) {
  const token = ++summaryToken;
  const target = $('#summary');
  target.innerHTML = loadingBlock('Counting what has been recorded here…');

  const [summaryRes, guideRes] = await Promise.all([
    GBIF.circleSummary(circle),
    GBIF.circleFieldGuide(circle, { pages: 1, pageSize: 300 })
  ]);
  if (token !== summaryToken) return; // a newer circle superseded this one

  if (!summaryRes.ok) {
    target.innerHTML = errorBlock(summaryRes, 'Try again');
    const retry = $('[data-retry]', target);
    if (retry) retry.addEventListener('click', () => loadSummary(circle));
    return;
  }

  const s = summaryRes.data;

  if (!s.totalRecords) {
    target.innerHTML = `
      <div class="callout callout--peach">
        <p><strong>No records at all inside this circle.</strong></p>
        <p style="margin-bottom:0">That is a real finding, not a bug — most of the planet is
        barely sampled. Try a bigger circle, or move it toward a town, park, or coastline and
        watch the number climb.</p>
      </div>`;
    return;
  }

  const groups = countGroups(guideRes.ok ? guideRes.data.species : []);
  const yearSpan = s.years.length ? `${s.years[0].year}–${s.years[s.years.length - 1].year}` : 'unknown';

  target.innerHTML = `
    <div class="stat-row">
      <div class="stat">
        <span class="stat__value">${num(s.totalRecords)}</span>
        <span class="stat__label">records people have filed here</span>
      </div>
      <div class="stat">
        <span class="stat__value">${num(s.speciesCount)}${s.speciesCount >= 1200 ? '+' : ''}</span>
        <span class="stat__label">different species among them</span>
      </div>
      <div class="stat stat--wide">
        <span class="stat__value" style="font-size:1.3rem">${esc(yearSpan)}</span>
        <span class="stat__label">the years these records span</span>
      </div>
    </div>

    ${groups.length ? `
      <h3 style="font-size:1.1rem;margin:20px 0 12px">What kinds of life turn up</h3>
      <ul class="group-bars">
        ${groups.map(g => `
          <li class="group-bar">
            <span class="group-bar__emoji" aria-hidden="true">${g.emoji}</span>
            <span class="group-bar__track">
              <span class="group-bar__fill" style="width:${g.share}%"></span>
              <span class="group-bar__name">${esc(g.label)}</span>
            </span>
            <span class="group-bar__count">${g.count}</span>
          </li>`).join('')}
      </ul>` : ''}

    <p class="data-note" style="margin-top:14px">
      <a href="${esc(GBIF.gbifCircleUrl(circle))}" target="_blank" rel="noopener">
        See these records on GBIF.org →</a>
    </p>
  `;
}

function countGroups(speciesList) {
  if (!config || !speciesList.length) return [];
  const counts = new Map();
  speciesList.forEach(s => counts.set(s.group, (counts.get(s.group) || 0) + 1));
  const max = Math.max(...counts.values(), 1);
  return config.groups
    .filter(g => counts.get(g.id))
    .map(g => ({
      label: g.label, emoji: g.emoji, count: counts.get(g.id),
      share: Math.round((counts.get(g.id) / max) * 100)
    }))
    .sort((a, b) => b.count - a.count);
}

/* ---------------------------------------------------------- place search */

async function runSearch(query) {
  const token = ++searchToken;
  const box = $('#searchResults');
  box.hidden = false;
  box.innerHTML = loadingBlock(`Looking for “${query}”…`);

  const url = new URL('https://nominatim.openstreetmap.org/search');
  Object.entries({
    q: query, format: 'json', limit: 6, countrycodes: 'us', addressdetails: 0
  }).forEach(([k, v]) => url.searchParams.set(k, v));

  let results;
  try {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (res.status === 429) throw new Error('busy');
    if (!res.ok) throw new Error('status ' + res.status);
    results = await res.json();
  } catch (err) {
    if (token !== searchToken) return;
    box.innerHTML = `<p class="data-note" style="padding:14px 18px;margin:0">
      Place search is unavailable right now${err.message === 'busy' ? ' (too many searches at once)' : ''}.
      Click the map directly, or use a starting point below.</p>`;
    return;
  }
  if (token !== searchToken) return;

  if (!results.length) {
    box.innerHTML = `<p class="data-note" style="padding:14px 18px;margin:0">
      Nothing found for “${esc(query)}”. Try adding the state, like “Oxford, Mississippi”.</p>`;
    return;
  }

  box.innerHTML = results.map((r, i) => `
    <button type="button" class="search-result" data-index="${i}">
      <span class="search-result__icon" aria-hidden="true">📍</span>
      <span>${esc(r.display_name)}</span>
    </button>`).join('');

  box.querySelectorAll('[data-index]').forEach(btn => btn.addEventListener('click', () => {
    const hit = results[Number(btn.dataset.index)];
    const existing = currentCircle();
    box.hidden = true;
    $('#searchInput').value = '';
    commitCircle({
      lat: Number(hit.lat),
      lng: Number(hit.lon),
      radiusKm: existing ? existing.radiusKm : DEFAULT_KM,
      name: hit.display_name.split(',').slice(0, 2).join(',').trim()
    });
    toast('Circle placed. Drag the pin or change the size to suit.');
  }));
}

/* -------------------------------------------------------- starting points */

function renderStartingPoints() {
  const list = $('#pointList');
  if (!config.startingPoints.length) return;
  list.innerHTML = config.startingPoints.map(p => `
    <button type="button" class="starting-point" data-point="${esc(p.id)}">
      <em>${esc(p.place)}</em>
      <strong>${esc(p.name)}</strong>
      <span>${esc(p.invitation)}</span>
    </button>`).join('');

  list.querySelectorAll('[data-point]').forEach(btn =>
    btn.addEventListener('click', () => usePoint(btn.dataset.point)));
}

function usePoint(id) {
  const point = config.startingPoints.find(p => p.id === id);
  if (!point) return;
  commitCircle({
    lat: point.coords[0], lng: point.coords[1], radiusKm: point.radiusKm,
    name: point.name, biome: point.biome, look: point.look, startingPoint: point.id
  });
  toast(`Circle placed on ${point.name}. Move or resize it however you like.`);
}

function drawAnchors() {
  anchorLayer.clearLayers();
  config.startingPoints.forEach(point => {
    L.marker(point.coords, {
      icon: L.divIcon({ html: '<div class="anchor-dot"></div>', className: '', iconSize: [20, 20], iconAnchor: [10, 10] }),
      title: point.name
    })
      .bindPopup(`<strong>${esc(point.name)}</strong><br>${esc(point.place)}<br>
        <button type="button" class="button button--dark button--small" data-anchor="${esc(point.id)}"
                style="margin-top:8px">Put my circle here</button>`)
      .addTo(anchorLayer);
  });

  map.on('popupopen', e => {
    const btn = e.popup.getElement().querySelector('[data-anchor]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      map.closePopup();
      usePoint(btn.dataset.anchor);
    });
  });
}

/* --------------------------------------------------------------- tools */

function bindTools() {
  $('#zoomIn').addEventListener('click', () => nudgeZoom(1));
  $('#zoomOut').addEventListener('click', () => nudgeZoom(-1));
  $('#zoomCircle').addEventListener('click', fitCircle);
  updateZoomButtons();

  $('#usaButton').addEventListener('click', () => map.fitBounds(US_VIEW, { padding: [20, 20] }));

  $('#searchForm').addEventListener('submit', e => {
    e.preventDefault();
    const query = $('#searchInput').value.trim();
    if (query.length < 2) return;
    runSearch(query);
  });
  $('#searchInput').addEventListener('input', e => {
    if (!e.target.value.trim()) { $('#searchResults').hidden = true; searchToken += 1; }
  });
  document.addEventListener('click', e => {
    if ($('#searchResults').hidden) return;
    if (e.target.closest('#searchResults') || e.target.closest('#searchForm')) return;
    $('#searchResults').hidden = true;
  });

  $$('.size-preset').forEach(btn =>
    btn.addEventListener('click', () => setRadius(Number(btn.dataset.km))));
  $('#radiusUp').addEventListener('click', () => setRadius(Number($('#radiusRange').value) + 5));
  $('#radiusDown').addEventListener('click', () => setRadius(Number($('#radiusRange').value) - 5));

  // Live preview while dragging; only query GBIF once the student lets go.
  $('#radiusRange').addEventListener('input', e => setRadius(Number(e.target.value), { commit: false }));
  $('#radiusRange').addEventListener('change', e => setRadius(Number(e.target.value)));

  $('#clearButton').addEventListener('click', () => {
    Store.clearCircle();
    if (circleLayer) { map.removeLayer(circleLayer); circleLayer = null; }
    if (centreMarker) { map.removeLayer(centreMarker); centreMarker = null; }
    ['#radiusControl', '#clearButton', '#namePanel', '#zoomCircle'].forEach(sel => { $(sel).hidden = true; });
    $('#placeName').value = '';
    $('#summary').innerHTML = '<p class="data-note">Click the map and this fills in with real biodiversity records.</p>';
    renderChrome();
    updateHint();
    map.fitBounds(US_VIEW, { padding: [20, 20] });
  });

  $('#locateButton').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('This browser cannot share a location.'); return; }
    toast('Asking your browser for your location…');
    navigator.geolocation.getCurrentPosition(
      pos => {
        // Used to centre the map and query GBIF. Stored on this device only.
        commitCircle({ lat: pos.coords.latitude, lng: pos.coords.longitude, radiusKm: DEFAULT_KM });
        toast('Circle placed on your location.');
      },
      () => toast('Your browser would not share a location. Click the map instead.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });

  const saveName = debounce(() => {
    const circle = currentCircle();
    if (!circle) return;
    circle.name = $('#placeName').value.trim();
    Store.setCircle(circle);
  }, 400);
  $('#placeName').addEventListener('input', saveName);

  $('#continueButton').addEventListener('click', () => {
    const circle = currentCircle();
    if (circle) { circle.name = $('#placeName').value.trim(); Store.setCircle(circle); }
  });
}

document.addEventListener('DOMContentLoaded', init);
