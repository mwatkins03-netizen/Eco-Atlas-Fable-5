/* =====================================================================
   explore.js — step 1. The map, the circle-drawing tool, and the live
   summary of what GBIF holds inside whatever the student drew.
   ===================================================================== */

const US_CENTRE = [39.2, -96.5];
const US_BOUNDS = L.latLngBounds([[17.5, -170.5], [72.0, -63.0]]); // includes Alaska & Hawai‘i

let map, circleLayer, centreMarker, anchorLayer;
let mode = 'idle';           // idle | placing | sizing
let pendingCentre = null;
let config = null;
let summaryToken = 0;

/* ------------------------------------------------------------- helpers */

function kmBetween(a, b) {
  return map.distance(a, b) / 1000;
}

function currentCircle() {
  return Store.getCircle();
}

/* ---------------------------------------------------------------- init */

async function init() {
  buildMap();

  try {
    const res = await fetch('data/starting-points.json');
    config = await res.json();
  } catch (_) {
    $('#pointList').innerHTML = errorBlock(
      { message: 'The starting-point list could not load. Serve this folder over HTTP rather than opening the file directly.' });
    config = { startingPoints: [], groups: [] };
  }

  renderStartingPoints();
  drawAnchors();
  bindTools();

  const saved = currentCircle();
  if (saved) {
    applyCircle(saved, { fly: true });
    $('#placeName').value = saved.name || '';
  }
}

/* ----------------------------------------------------------------- map */

function buildMap() {
  map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: false,
    maxBounds: US_BOUNDS.pad(0.35),
    minZoom: 3
  }).setView(US_CENTRE, 4);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18
  }).addTo(map);

  anchorLayer = L.layerGroup().addTo(map);

  // Scroll-wheel zoom steals the page scroll, so it only turns on after a click.
  map.on('click', () => map.scrollWheelZoom.enable());
  map.on('mouseout', () => map.scrollWheelZoom.disable());

  map.on('click', onMapClick);
  map.on('mousemove', onMapMove);

  // Keyboard equivalent: Escape backs out of a half-drawn circle.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mode !== 'idle') setMode('idle');
  });
}

function setMode(next) {
  mode = next;
  const drawButton = $('#drawButton');
  drawButton.classList.toggle('is-active', next !== 'idle');
  drawButton.textContent = '';
  drawButton.insertAdjacentHTML('afterbegin',
    `<span class="tool-button__icon" aria-hidden="true">⭕</span> ${next === 'idle' ? 'Draw a circle' : 'Cancel'}`);

  const container = map.getContainer();
  container.style.cursor = next === 'idle' ? '' : 'crosshair';

  if (next === 'idle') {
    pendingCentre = null;
    if (!currentCircle()) clearCircleLayers();
  }
  updateHint();
}

function updateHint() {
  const hint = $('#mapHint');
  const circle = currentCircle();
  if (mode === 'placing') {
    hint.innerHTML = '<strong>Click the centre</strong> of the place you want to write about.';
    hint.hidden = false;
  } else if (mode === 'sizing') {
    hint.innerHTML = 'Now <strong>move outward and click again</strong> to set the size. Press Esc to cancel.';
    hint.hidden = false;
  } else if (!circle) {
    hint.innerHTML = 'Press <strong>Draw a circle</strong> to begin, or pick a starting point from the list.';
    hint.hidden = false;
  } else {
    hint.hidden = true;
  }
}

function onMapClick(e) {
  if (mode === 'placing') {
    pendingCentre = e.latlng;
    setMode('sizing');
    drawPreview(pendingCentre, 1);
    return;
  }
  if (mode === 'sizing') {
    // Grab the centre before setMode clears it.
    const centre = pendingCentre;
    const radiusKm = Math.max(2, Math.min(120, Math.round(kmBetween(centre, e.latlng))));
    setMode('idle');
    commitCircle({ lat: centre.lat, lng: centre.lng, radiusKm });
  }
}

function onMapMove(e) {
  if (mode !== 'sizing' || !pendingCentre) return;
  drawPreview(pendingCentre, Math.max(1, kmBetween(pendingCentre, e.latlng)));
}

function clearCircleLayers() {
  if (circleLayer) { map.removeLayer(circleLayer); circleLayer = null; }
  if (centreMarker) { map.removeLayer(centreMarker); centreMarker = null; }
}

function drawPreview(centre, radiusKm) {
  if (!circleLayer) {
    circleLayer = L.circle(centre, {
      radius: radiusKm * 1000,
      color: '#c4551a', weight: 3, fillColor: '#e0873f', fillOpacity: .18, dashArray: '10 8'
    }).addTo(map);
  } else {
    circleLayer.setLatLng(centre).setRadius(radiusKm * 1000);
  }
  $('#radiusOut').textContent = `${Math.round(radiusKm)} km`;
}

/* -------------------------------------------------------- the circle */

// keepMeta is for tweaks to an existing circle — dragging the pin, nudging the
// radius, renaming. A freshly drawn circle must NOT inherit the last circle's
// name and biome, or a student ends up writing about "The Everglades" while
// looking at a circle over Ohio.
function commitCircle(circle, { keepMeta = false } = {}) {
  const existing = keepMeta ? (currentCircle() || {}) : {};
  const next = Object.assign({}, existing, circle, { updatedAt: new Date().toISOString() });
  Store.setCircle(next);
  applyCircle(next, { fly: true });   // this also refreshes the live summary
  renderChrome();                     // the step nav shows step 1 as done now
}

function applyCircle(circle, { fly = false } = {}) {
  clearCircleLayers();

  circleLayer = L.circle([circle.lat, circle.lng], {
    radius: circle.radiusKm * 1000,
    color: '#c4551a', weight: 4, fillColor: '#e0873f', fillOpacity: .16
  }).addTo(map);

  centreMarker = L.marker([circle.lat, circle.lng], {
    draggable: true,
    icon: L.divIcon({ html: '<div class="pin">📍</div>', className: '', iconSize: [30, 30], iconAnchor: [15, 28] }),
    title: 'Drag to move your circle'
  }).addTo(map);

  centreMarker.on('drag', e => circleLayer.setLatLng(e.latlng));
  centreMarker.on('dragend', e => {
    const p = e.target.getLatLng();
    commitCircle({ lat: p.lat, lng: p.lng, radiusKm: circle.radiusKm }, { keepMeta: true });
  });

  $('#radiusControl').hidden = false;
  $('#radiusRange').value = circle.radiusKm;
  $('#radiusOut').textContent = `${circle.radiusKm} km`;
  $('#clearButton').hidden = false;
  $('#namePanel').hidden = false;
  // Keep the name field honest about which circle it belongs to.
  if ($('#placeName').value !== (circle.name || '')) $('#placeName').value = circle.name || '';

  if (fly) map.fitBounds(circleLayer.getBounds(), { padding: [50, 50], maxZoom: 12 });
  updateHint();
  loadSummary(circle);
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
    $('[data-retry]', target)?.addEventListener('click', () => loadSummary(circle));
    return;
  }

  const s = summaryRes.data;

  if (!s.totalRecords) {
    target.innerHTML = `
      <div class="callout callout--peach">
        <p><strong>No records at all inside this circle.</strong></p>
        <p style="margin-bottom:0">That is a real finding, not a bug — most of the planet is
        under-sampled. Try a larger circle, or move it toward a town, park, or coastline and watch
        how fast the number climbs. Then ask yourself what that tells you about observers rather
        than organisms.</p>
      </div>`;
    return;
  }

  const groups = countGroups(guideRes.ok ? guideRes.data.species : []);
  const yearSpan = s.years.length ? `${s.years[0].year}–${s.years[s.years.length - 1].year}` : 'unknown';
  const recentShare = s.years.length
    ? Math.round(100 * s.years.filter(y => y.year >= 2010).reduce((n, y) => n + y.count, 0) / s.totalRecords)
    : null;

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
        <span class="stat__value" style="font-size:1.35rem">${esc(yearSpan)}</span>
        <span class="stat__label">
          the years these records span${recentShare !== null ? ` — ${recentShare}% of them are from 2010 or later` : ''}
        </span>
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
      </ul>
      <p class="data-note" style="margin-top:10px">
        Counted from a sample of photographed records, so it shows variety rather than exact totals.
      </p>` : ''}

    <p class="data-note" style="margin-top:16px">
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
      label: g.label,
      emoji: g.emoji,
      count: counts.get(g.id),
      share: Math.round((counts.get(g.id) / max) * 100)
    }))
    .sort((a, b) => b.count - a.count);
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
    </button>
  `).join('');

  list.querySelectorAll('[data-point]').forEach(btn => btn.addEventListener('click', () => {
    const point = config.startingPoints.find(p => p.id === btn.dataset.point);
    if (!point) return;
    setMode('idle');
    commitCircle({
      lat: point.coords[0], lng: point.coords[1], radiusKm: point.radiusKm,
      name: point.name, biome: point.biome, look: point.look, startingPoint: point.id
    });
    $('#placeName').value = point.name;
    toast(`Circle placed on ${point.name}. Move or resize it however you like.`);
  }));
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
      const point = config.startingPoints.find(p => p.id === btn.dataset.anchor);
      map.closePopup();
      commitCircle({
        lat: point.coords[0], lng: point.coords[1], radiusKm: point.radiusKm,
        name: point.name, biome: point.biome, look: point.look, startingPoint: point.id
      });
      $('#placeName').value = point.name;
    });
  });
}

/* --------------------------------------------------------------- tools */

function bindTools() {
  $('#drawButton').addEventListener('click', () => {
    setMode(mode === 'idle' ? 'placing' : 'idle');
  });

  $('#usaButton').addEventListener('click', () => {
    map.fitBounds(L.latLngBounds([[24.5, -125], [49.5, -66.5]]), { padding: [20, 20] });
  });

  $('#clearButton').addEventListener('click', () => {
    Store.clearCircle();
    clearCircleLayers();
    $('#radiusControl').hidden = true;
    $('#clearButton').hidden = true;
    $('#namePanel').hidden = true;
    $('#placeName').value = '';
    $('#summary').innerHTML = '<p class="data-note">Draw a circle and this fills in with real biodiversity records.</p>';
    renderChrome();
    updateHint();
    map.setView(US_CENTRE, 4);
  });

  $('#radiusRange').addEventListener('input', e => {
    const km = Number(e.target.value);
    $('#radiusOut').textContent = `${km} km`;
    if (circleLayer) circleLayer.setRadius(km * 1000);
  });
  // Only hit the API once the student stops dragging.
  $('#radiusRange').addEventListener('change', e => {
    const circle = currentCircle();
    if (!circle) return;
    commitCircle({ lat: circle.lat, lng: circle.lng, radiusKm: Number(e.target.value) }, { keepMeta: true });
  });

  $('#locateButton').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('This browser cannot share a location.'); return; }
    toast('Asking your browser for your location…');
    navigator.geolocation.getCurrentPosition(
      pos => {
        // The coordinate is used to centre the map and query GBIF. It is stored
        // in this browser with the rest of the circle and sent nowhere else.
        commitCircle({ lat: pos.coords.latitude, lng: pos.coords.longitude, radiusKm: 15 });
        toast('Circle placed on your location, 15 km across.');
      },
      () => toast('Your browser would not share a location. Draw a circle instead.'),
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
