/* =====================================================================
   write.js — step 3. Five guided sections, the student's collected
   species alongside, and an export they can hand in.
   ===================================================================== */

let config = null;
let circle = null;
let scatterSVG = '';

/* ---------------------------------------------------------------- init */

async function init() {
  circle = requireCircle('#introPanel',
    'Your ecography is about a specific place, so start by drawing one.');
  if (!circle) {
    document.querySelector('.write-layout').hidden = true;
    return;
  }

  try {
    config = await (await fetch('data/starting-points.json')).json();
  } catch (_) {
    config = { sections: [] };
  }

  $('#title').textContent = circle.name ? `An ecography of ${circle.name}` : 'Write your ecography';
  $('#placeLine').innerHTML =
    `Five short sections. Write them in any order — everything saves as you type.
     Your place is <strong>${esc(circleLabel(circle))}</strong>.
     <a href="explore.html">Change it</a> · <a href="species.html">collect more species</a>`;

  renderSections();
  renderCircleCard();
  renderTray();
  bindExports();
  updateProgress();
  loadScatter();
}

/* ------------------------------------------------------------ sections */

function renderSections() {
  const writing = Store.getWriting();
  $('#sections').innerHTML = config.sections.map((section, index) => `
    <section class="write-section panel">
      <div class="write-section__head">
        <span class="write-section__num">${index + 1}</span>
        <div class="write-section__title">
          <h2>${esc(section.title)}</h2>
          <p>${esc(section.lead)}</p>
        </div>
      </div>
      <ul class="prompt-list">
        ${section.prompts.map(p => `<li>${esc(p)}</li>`).join('')}
      </ul>
      <label class="visually-hidden" for="area-${esc(section.id)}">${esc(section.title)}</label>
      <textarea class="write-area" id="area-${esc(section.id)}" data-section="${esc(section.id)}"
                placeholder="Start writing here…">${esc(writing[section.id] || '')}</textarea>
      <div class="write-meta">
        <span data-count="${esc(section.id)}"></span>
        <span>suggested: at least ${section.minWords} words</span>
      </div>
    </section>
  `).join('');

  $$('.write-area').forEach(area => {
    const id = area.dataset.section;
    const paint = () => paintCount(id, area.value);
    paint();
    area.addEventListener('input', () => {
      paint();
      saveSection(id, area.value);
    });
  });
}

const saveSection = debounce((id, text) => {
  Store.setSection(id, text);
  updateProgress();
  renderChrome();
}, 500);

function wordCount(text) {
  const trimmed = (text || '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function paintCount(id, text) {
  const section = config.sections.find(s => s.id === id);
  const words = wordCount(text);
  const met = words >= section.minWords;
  const el = document.querySelector(`[data-count="${id}"]`);
  if (!el) return;
  el.innerHTML = met
    ? `<span class="is-met">✓ ${words} words</span>`
    : `<strong>${words}</strong> word${words === 1 ? '' : 's'}`;
}

function updateProgress() {
  const writing = Store.getWriting();
  const done = config.sections.filter(s => wordCount(writing[s.id]) >= s.minWords).length;
  const started = config.sections.filter(s => wordCount(writing[s.id]) > 0).length;
  $('#progressNote').innerHTML =
    `<strong>${done} of ${config.sections.length}</strong> sections at the suggested length` +
    (started > done ? ` · ${started - done} more started` : '');
}

/* -------------------------------------------------------------- aside */

function renderCircleCard() {
  $('#circleCard').innerHTML = `
    <p style="margin-bottom:10px"><strong>${esc(circleLabel(circle))}</strong></p>
    <p class="data-note" style="margin-bottom:12px">
      ${circle.radiusKm} km radius · centred on ${circle.lat.toFixed(4)}, ${circle.lng.toFixed(4)}
      ${circle.biome ? `<br>${esc(circle.biome)}` : ''}
    </p>
    <div id="scatterHolder"></div>
    <p class="data-note" style="margin-top:12px">
      <a href="${esc(GBIF.gbifCircleUrl(circle))}" target="_blank" rel="noopener">See the records on GBIF.org →</a>
    </p>`;
}

// A basemap-free picture of the circle: every dot is one real record. It
// travels inside the exported file, so the student's document works offline.
async function loadScatter() {
  const holder = $('#scatterHolder');
  if (!holder) return;
  holder.innerHTML = loadingBlock('Plotting the records…');

  const res = await GBIF.occurrences({ circle, limit: 300 });
  if (!$('#scatterHolder')) return;
  if (!res.ok) { holder.innerHTML = `<p class="data-note">${esc(res.message)}</p>`; return; }

  const points = res.data.records.filter(r => r.location);
  scatterSVG = buildScatter(points);
  holder.innerHTML = scatterSVG + `<p class="data-note" style="margin-top:8px">
    ${points.length} of ${num(res.data.total)} records, plotted by coordinate. Clusters are usually
    trails, car parks, and university land — places observers can reach.</p>`;
}

function buildScatter(points) {
  const size = 260;
  const pad = 10;
  const r = (size - pad * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Project relative to the circle centre, correcting longitude for latitude.
  const cosLat = Math.cos(circle.lat * Math.PI / 180) || 1;
  const dots = points.map(p => {
    const dx = (p.location.lng - circle.lng) * cosLat * 111;
    const dy = (p.location.lat - circle.lat) * 111;
    const x = cx + (dx / circle.radiusKm) * r;
    const y = cy - (dy / circle.radiusKm) * r;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#5f7339" fill-opacity="0.6"/>`;
  }).join('');

  return `<svg class="scatter" viewBox="0 0 ${size} ${size}" role="img"
      aria-label="A plot of ${points.length} biodiversity records inside your circle, showing where observers went.">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#c4551a" stroke-width="2.5"/>
    <line x1="${cx}" y1="${pad}" x2="${cx}" y2="${size - pad}" stroke="#26233a" stroke-opacity=".1"/>
    <line x1="${pad}" y1="${cy}" x2="${size - pad}" y2="${cy}" stroke="#26233a" stroke-opacity=".1"/>
    ${dots}
    <circle cx="${cx}" cy="${cy}" r="3.5" fill="#c4551a"/>
    <text x="${cx}" y="${size - 1}" text-anchor="middle" font-size="9" fill="#575167"
      font-family="Inter, sans-serif">${circle.radiusKm} km radius</text>
  </svg>`;
}

function renderTray() {
  const species = Store.getSpecies();
  const note = $('#trayNote');
  const tray = $('#tray');

  if (!species.length) {
    note.textContent = '';
    tray.innerHTML = `<p class="data-note">
      You have not collected any species yet. <a href="species.html">Open the field guide</a> and pick
      two or three you want to write about.</p>`;
    return;
  }

  note.innerHTML = `<strong>${species.length}</strong> collected · <a href="species.html">add more</a>`;
  tray.innerHTML = species.map(s => `
    <div class="tray-item">
      ${s.image ? `<img src="${esc(s.image.url)}" alt="" loading="lazy">` : '<img alt="" src="assets/icons/icon-leaf.svg">'}
      <div class="tray-item__text">
        <div class="tray-item__name">${esc(s.vernacularName || s.scientificName)}</div>
        <div class="tray-item__sci">${esc(s.scientificName)}</div>
        ${s.note ? `<div class="data-note" style="margin-top:4px">${esc(s.note)}</div>` : ''}
      </div>
    </div>`).join('');
}

/* ------------------------------------------------------------- exports */

function bindExports() {
  $('#exportHtml').addEventListener('click', exportDocument);
  $('#printButton').addEventListener('click', () => window.print());
  $('#exportJson').addEventListener('click', exportJSON);
}

function authorTitle() {
  return circle.name ? `An ecography of ${circle.name}` : 'An ecography';
}

function exportDocument() {
  const writing = Store.getWriting();
  const species = Store.getSpecies();
  const written = config.sections.filter(s => wordCount(writing[s.id]) > 0);

  if (!written.length) {
    toast('Write at least one section before exporting.');
    $('.write-area')?.focus();
    return;
  }

  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const totalWords = config.sections.reduce((n, s) => n + wordCount(writing[s.id]), 0);

  const paragraphs = text => (text || '').trim().split(/\n{2,}/)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(authorTitle())}</title>
<style>
  :root { --ink:#26233a; --muted:#575167; --page:#f6efe3; --rule:#e6dcc9; }
  * { box-sizing: border-box; }
  body { font-family: Inter, system-ui, sans-serif; color: var(--ink); background: var(--page);
         margin: 0; padding: 40px 18px; line-height: 1.7; font-size: 18px; }
  main { max-width: 46rem; margin: 0 auto; background: #fff; border: 3px solid #d8a24a;
         border-radius: 26px; padding: clamp(24px, 5vw, 56px); }
  header { border-bottom: 3px solid var(--rule); padding-bottom: 26px; margin-bottom: 30px; }
  h1 { font-size: 2.5rem; line-height: 1.1; letter-spacing: -.035em; margin: 0 0 .3em; }
  .dek { color: var(--muted); margin: 0; }
  h2 { font-size: 1.6rem; margin: 42px 0 .4em; letter-spacing: -.02em; }
  h3 { font-size: 1.15rem; margin: 28px 0 .5em; }
  p { margin: 0 0 1.1em; }
  .place-facts { display: flex; flex-wrap: wrap; gap: 10px; margin: 22px 0; }
  .place-facts span { background: var(--page); border-radius: 999px; padding: 7px 16px; font-size: .88rem; font-weight: 700; }
  figure { margin: 26px 0; text-align: center; }
  figure svg { max-width: 300px; height: auto; }
  figcaption { color: var(--muted); font-size: .88rem; margin-top: 8px; }
  .species-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 16px; margin: 22px 0; }
  .species { border: 2px solid var(--rule); border-radius: 18px; overflow: hidden; break-inside: avoid; }
  .species img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; background: var(--page); }
  .species div { padding: 12px 14px; }
  .species strong { display: block; line-height: 1.25; }
  .species em { color: var(--muted); font-size: .88rem; }
  .species p { font-size: .9rem; color: var(--muted); margin: 8px 0 0; }
  footer { margin-top: 46px; padding-top: 22px; border-top: 2px solid var(--rule); color: var(--muted); font-size: .86rem; }
  footer p { margin: 0 0 .7em; overflow-wrap: anywhere; }
  @media print {
    body { background: #fff; padding: 0; font-size: 12pt; }
    main { border: none; border-radius: 0; padding: 0; max-width: none; }
    h2 { break-after: avoid; }
    .species, figure { break-inside: avoid; }
  }
</style></head>
<body><main>
  <header>
    <h1>${esc(authorTitle())}</h1>
    <p class="dek">${esc(today)} · ${totalWords} words</p>
    <div class="place-facts">
      <span>${circle.radiusKm} km radius</span>
      <span>${circle.lat.toFixed(4)}, ${circle.lng.toFixed(4)}</span>
      ${circle.biome ? `<span>${esc(circle.biome)}</span>` : ''}
      <span>${species.length} species collected</span>
    </div>
  </header>

  ${scatterSVG ? `<figure>${scatterSVG.replace('class="scatter"', '')}
    <figcaption>Each dot is one biodiversity record published from inside this circle.
    Clusters show where observers went, not where life is densest.</figcaption></figure>` : ''}

  ${written.map(s => `<h2>${esc(s.title)}</h2>${paragraphs(writing[s.id])}`).join('\n')}

  ${species.length ? `
    <h2>The species in this account</h2>
    <div class="species-grid">
      ${species.map(s => `
        <div class="species">
          ${s.image ? `<img src="${esc(s.image.url)}" alt="Photograph of ${esc(s.vernacularName || s.scientificName)}">` : ''}
          <div>
            <strong>${esc(s.vernacularName || s.scientificName)}</strong>
            <em>${esc(s.scientificName)}</em>
            ${s.note ? `<p>${esc(s.note)}</p>` : ''}
          </div>
        </div>`).join('')}
    </div>` : ''}

  <footer>
    <h3 style="color:var(--ink)">Sources</h3>
    <p>Biodiversity records: ${esc(GBIF.citeCircle(circle, circle.name))}</p>
    <p>Each occurrence record and photograph carries its own license from the institution or person
       who published it. Check the individual record before republishing an image.</p>
    ${species.filter(s => s.citation).length ? `
      <p><strong>Example records for the species above:</strong></p>
      ${species.filter(s => s.citation).map(s => `<p>${esc(s.citation)}</p>`).join('')}` : ''}
    <p>Written in Ecography, a place-based inquiry environment. The data is evidence, not conclusion.</p>
  </footer>
</main></body></html>`;

  const slug = (circle.name || 'my-place').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  download(html, `ecography-${slug || 'my-place'}-${new Date().toISOString().slice(0, 10)}.html`, 'text/html');
  toast('Downloaded. Open it in a browser, then print to PDF if you need one.');
}

function exportJSON() {
  download(JSON.stringify({
    title: authorTitle(),
    exportedAt: new Date().toISOString(),
    circle,
    species: Store.getSpecies(),
    writing: Store.getWriting(),
    citation: GBIF.citeCircle(circle, circle.name),
    dataSource: { name: 'GBIF', url: 'https://www.gbif.org', api: 'https://api.gbif.org/v1' }
  }, null, 2), `ecography-data-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  toast('Raw data downloaded.');
}

document.addEventListener('DOMContentLoaded', init);
