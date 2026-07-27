/* =====================================================================
   species.js — step 2. Builds a photo field guide from whatever GBIF
   holds inside the student's circle, and lets them collect species to
   write about later.
   ===================================================================== */

let config = null;
let circle = null;
let allSpecies = [];
let activeGroup = 'all';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/* ---------------------------------------------------------------- init */

async function init() {
  circle = requireCircle('#guidePanel',
    'The field guide is built from the species recorded inside your circle, so you need a circle first.');
  if (!circle) return;

  try {
    config = await (await fetch('data/starting-points.json')).json();
  } catch (_) {
    config = { groups: [] };
  }

  $('#placeLine').innerHTML =
    `Everything below has been recorded inside <strong>${esc(circleLabel(circle))}</strong> —
     a ${circle.radiusKm} km circle centered on ${circle.lat.toFixed(3)}, ${circle.lng.toFixed(3)}.
     <a href="explore.html">Change your circle</a>`;

  renderCollectedLine();
  await loadGuide();
}

/* --------------------------------------------------------------- guide */

async function loadGuide() {
  const grid = $('#guideGrid');
  const status = $('#guideStatus');
  grid.innerHTML = '';
  status.innerHTML = loadingBlock('Building your field guide from GBIF…');

  const res = await GBIF.circleFieldGuide(circle, {
    pages: 3,
    pageSize: 300,
    onProgress: p => { status.innerHTML = loadingBlock(`Found ${p.species} species so far…`); }
  });

  if (!res.ok) {
    status.textContent = '';
    grid.innerHTML = errorBlock(res, 'Try again');
    $('[data-retry]', grid)?.addEventListener('click', loadGuide);
    return;
  }

  allSpecies = res.data.species;

  if (!allSpecies.length) {
    status.textContent = '';
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <p class="empty-state__emoji" aria-hidden="true">🔍</p>
      <h2>No photographed records inside this circle</h2>
      <p>Nobody has published a photograph from here yet. That is worth writing about on its own —
      but for a field guide you will want a bigger circle, or one nearer a town, park, or coast.</p>
      <a class="button button--dark button--large" href="explore.html">Adjust my circle</a>
    </div>`;
    return;
  }

  renderChips();
  renderGrid();
  status.textContent = `${allSpecies.length} species with photographs, from ${num(res.data.photographedRecords)} photographed records.`;

  $('#guideFooter').innerHTML = `
    <div class="callout">
      <p><strong>This is not a complete list of what lives here.</strong> It is a list of what
      somebody photographed and uploaded. Fast, showy, daytime, roadside species are heavily
      over-represented; nocturnal, underground, aquatic, and plain-looking ones are missing.</p>
      <p style="margin-bottom:0">Which of your local species would you expect to be absent from
      a list built this way? That question belongs in your ecography.</p>
    </div>`;

  // Common names arrive after the grid so the pictures show up immediately.
  await GBIF.attachCommonNames(allSpecies.slice(0, 60), 6);
  renderGrid();
  GBIF.attachCommonNames(allSpecies.slice(60), 4).then(renderGrid);
}

function renderChips() {
  const counts = new Map();
  allSpecies.forEach(s => counts.set(s.group, (counts.get(s.group) || 0) + 1));

  const chips = [{ id: 'all', label: 'Everything', emoji: '🌎', count: allSpecies.length }]
    .concat((config.groups || [])
      .filter(g => counts.get(g.id))
      .map(g => ({ id: g.id, label: g.label, emoji: g.emoji, count: counts.get(g.id) })));

  $('#groupChips').innerHTML = chips.map(c => `
    <button type="button" class="group-chip ${activeGroup === c.id ? 'is-active' : ''}"
            data-group="${esc(c.id)}" aria-pressed="${activeGroup === c.id}">
      <span class="group-chip__emoji" aria-hidden="true">${c.emoji}</span>
      ${esc(c.label)}
      <span class="group-chip__count">${c.count}</span>
    </button>`).join('');

  $$('#groupChips [data-group]').forEach(btn => btn.addEventListener('click', () => {
    activeGroup = btn.dataset.group;
    renderChips();
    renderGrid();
  }));
}

function visibleSpecies() {
  return activeGroup === 'all' ? allSpecies : allSpecies.filter(s => s.group === activeGroup);
}

function renderGrid() {
  const grid = $('#guideGrid');
  const list = visibleSpecies();
  const collected = new Set(Store.getSpecies().map(s => s.speciesKey));
  const groupMeta = id => (config.groups || []).find(g => g.id === id) || { emoji: '•', label: 'Life' };

  grid.innerHTML = list.map(s => {
    const meta = groupMeta(s.group);
    const isIn = collected.has(s.speciesKey);
    const name = s.vernacularName || s.scientificName || 'Unnamed species';
    return `
      <button type="button" class="creature ${isIn ? 'is-collected' : ''}" data-species="${s.speciesKey}">
        <span class="creature__photo">
          ${s.image
            ? `<img src="${esc(s.image.url)}" alt="Photograph of ${esc(name)}" loading="lazy" decoding="async">`
            : ''}
          <span class="creature__badge"><span aria-hidden="true">${meta.emoji}</span> ${esc(meta.label)}</span>
          ${isIn ? '<span class="creature__check" aria-label="Collected">✓</span>' : ''}
        </span>
        <span class="creature__body">
          <span class="creature__name">${esc(name)}</span>
          ${s.vernacularName ? `<span class="creature__sci">${esc(s.scientificName)}</span>` : ''}
          <span class="creature__meta">${s.sampleCount} photo${s.sampleCount === 1 ? '' : 's'} in this circle</span>
        </span>
      </button>`;
  }).join('');

  $$('#guideGrid [data-species]').forEach(card =>
    card.addEventListener('click', () => openSheet(Number(card.dataset.species))));
}

/* ---------------------------------------------------------- the detail */

async function openSheet(speciesKey) {
  const entry = allSpecies.find(s => s.speciesKey === speciesKey);
  if (!entry) return;

  const sheet = $('#sheet');
  const content = $('#sheetContent');
  const name = entry.vernacularName || entry.scientificName;

  content.innerHTML = `
    ${entry.image ? `
      <div class="sheet__photo">
        <img src="${esc(entry.image.url)}" alt="Photograph of ${esc(name)}">
        <button type="button" class="sheet__close" data-close aria-label="Close">✕</button>
      </div>
      <p class="sheet__credit">Photograph: ${esc(entry.image.creator || 'unknown')} ·
        ${esc(entry.image.license)}${entry.image.publisher ? ' · via ' + esc(entry.image.publisher) : ''}</p>
    ` : '<div style="text-align:right;padding:14px"><button type="button" class="sheet__close" data-close aria-label="Close" style="position:static">✕</button></div>'}
    <div class="sheet__body">
      <h2 id="sheetTitle">${esc(name)}</h2>
      <p class="sheet__sci">${esc(entry.scientificName)}</p>
      <div id="sheetWiki">${loadingBlock('Reading the Wikipedia entry…')}</div>
      <div id="sheetFacts">${loadingBlock('Looking this species up on GBIF…')}</div>
    </div>`;

  content.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => sheet.close()));
  if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');

  loadWikipedia(entry);

  const [taxonRes, vernRes, profileRes, localRes, globalRes, seasonRes] = await Promise.all([
    GBIF.taxon(speciesKey),
    GBIF.vernacularNames(speciesKey),
    GBIF.speciesProfile(speciesKey),
    GBIF.count(Object.assign({ taxonKey: speciesKey }, GBIF.circleBase(circle))),
    GBIF.count({ taxonKey: speciesKey, hasCoordinate: 'true' }),
    GBIF.seasonality({ circle, taxonKey: speciesKey })
  ]);

  const facts = $('#sheetFacts');
  if (!facts) return; // student closed it already

  const t = taxonRes.ok ? taxonRes.data : {};
  const names = vernRes.ok ? vernRes.data.slice(0, 5) : [];
  const profile = profileRes.ok ? profileRes.data : {};
  const habitats = ['marine', 'freshwater', 'terrestrial'].filter(k => profile[k]);
  const local = localRes.ok ? localRes.data : null;
  const global = globalRes.ok ? globalRes.data : null;
  const months = seasonRes.ok ? seasonRes.data.months : [];
  const peak = months.length ? months.reduce((a, b) => (b.count > a.count ? b : a)) : null;
  const maxMonth = months.length ? Math.max(...months.map(m => m.count), 1) : 1;

  facts.innerHTML = `
    <dl class="fact-grid">
      <div class="fact"><dt>In your circle</dt><dd>${local === null ? '—' : num(local)}<small>records</small></dd></div>
      <div class="fact"><dt>Worldwide</dt><dd>${global === null ? '—' : num(global)}<small>records</small></dd></div>
      <div class="fact"><dt>Family</dt><dd>${esc(t.family || '—')}</dd></div>
      <div class="fact"><dt>${t.class ? 'Class' : 'Phylum'}</dt><dd>${esc(t.class || t.phylum || '—')}</dd></div>
      ${habitats.length ? `<div class="fact"><dt>Habitat</dt><dd>${esc(habitats.join(', '))}</dd></div>` : ''}
      ${peak && peak.count ? `<div class="fact"><dt>Seen most in</dt><dd>${esc(MONTH_NAMES[peak.month - 1])}</dd></div>` : ''}
    </dl>

    ${names.length > 1 ? `<p class="data-note"><strong>Also called:</strong> ${esc(names.slice(0, 5).join(', '))}</p>` : ''}
    ${profile.extinct ? '<div class="callout callout--peach"><strong>GBIF flags this species as extinct.</strong></div>' : ''}

    ${peak && peak.count ? `
      <h3 style="margin-top:22px;font-size:1.15rem">When people record it here</h3>
      <div class="season-chart" role="img" aria-label="${esc(months.map(m => `${MONTH_NAMES[m.month - 1]}: ${m.count}`).join('; '))}">
        ${months.map(m => `<span class="season-chart__col" title="${MONTH_NAMES[m.month - 1]}: ${num(m.count)} records">
            <span class="season-chart__bar" style="height:${Math.max((m.count / maxMonth) * 100, 2)}%"></span>
            <span class="season-chart__label">${MONTHS[m.month - 1]}</span>
          </span>`).join('')}
      </div>
      <p class="data-note">This is when <em>people looked and wrote it down</em> — not necessarily when
      the species is here. Ask whether the pattern is about the organism or about the observers.</p>
    ` : ''}

    <div class="collect-box">
      <h3>Add this one to your ecography?</h3>
      <p>Collected species appear beside you on the writing page.</p>
      <label class="visually-hidden" for="speciesNote">Why this species</label>
      <textarea id="speciesNote" rows="3"
        placeholder="Why did you pick this one? What do you want to find out about it?"></textarea>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="button button--dark" id="collectButton"></button>
        <a class="button button--light" href="https://www.gbif.org/species/${speciesKey}" target="_blank" rel="noopener">
          Open on GBIF.org
        </a>
      </div>
    </div>

    <h3 style="margin-top:26px;font-size:1.15rem">Records from inside your circle</h3>
    <div id="sheetRecords">${loadingBlock('Fetching individual records…')}</div>
  `;

  wireCollectButton(entry, { commonNames: names, family: t.family, className: t.class || t.phylum, localCount: local });
  loadSheetRecords(speciesKey);
}

/* ----------------------------------------------------- what this thing is */

// GBIF says a species was here. Wikipedia says what it actually is, which is
// the part a student can write a sentence about.
async function loadWikipedia(entry) {
  const target = $('#sheetWiki');
  if (!target) return;

  const res = await Wiki.lookupSpecies({
    scientificName: entry.scientificName,
    vernacularName: entry.vernacularName
  });
  const box = $('#sheetWiki');
  if (!box) return; // sheet was closed

  if (!res.ok) {
    box.innerHTML = `<div class="wiki-card wiki-card--empty">
      <p class="data-note" style="margin:0">
        No Wikipedia article found for this one — which happens with less-studied species.
        You can still search it:
        <a href="https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(entry.scientificName || '')}"
           target="_blank" rel="noopener">look up ${esc(entry.scientificName)} →</a>
      </p>
    </div>`;
    entry.wiki = null;
    Store.updateSpeciesWiki(entry.speciesKey, null);
    return;
  }

  const w = res.data;
  box.innerHTML = `
    <div class="wiki-card">
      <div class="wiki-card__head">
        <span class="wiki-card__mark" aria-hidden="true">W</span>
        <div>
          <h3>${esc(w.title)}</h3>
          ${w.description ? `<p class="wiki-card__desc">${esc(w.description)}</p>` : ''}
        </div>
      </div>
      <div class="wiki-card__body">
        ${w.thumbnail ? `<img class="wiki-card__thumb" src="${esc(w.thumbnail)}" alt="" loading="lazy">` : ''}
        <p class="wiki-card__lede">${esc(w.lede)}</p>
      </div>
      <details class="wiki-card__more">
        <summary>Read a bit more</summary>
        <p>${esc(w.extract)}</p>
      </details>
      <p class="wiki-card__foot">
        <a href="${esc(w.url)}" target="_blank" rel="noopener">Read the full article on Wikipedia →</a>
        <span class="data-note">Text from Wikipedia, CC BY-SA 4.0</span>
      </p>
    </div>`;

  // Remember it on the entry so collecting the species carries it into the
  // export, and so an already-collected species gets backfilled.
  entry.wiki = { title: w.title, description: w.description, lede: w.lede, url: w.url };
  Store.updateSpeciesWiki(entry.speciesKey, entry.wiki);
}

function wireCollectButton(entry, extra) {
  const button = $('#collectButton');
  const note = $('#speciesNote');
  if (!button) return;

  const existing = Store.getSpecies().find(s => s.speciesKey === entry.speciesKey);
  if (existing) note.value = existing.note || '';

  const paint = () => {
    const inList = Store.hasSpecies(entry.speciesKey);
    button.textContent = inList ? '✓ Collected — remove' : '+ Collect this species';
    button.classList.toggle('button--dark', !inList);
    button.classList.toggle('button--light', inList);
  };
  paint();

  button.addEventListener('click', () => {
    if (Store.hasSpecies(entry.speciesKey)) {
      Store.removeSpecies(entry.speciesKey);
      toast('Removed from your collection.');
    } else {
      Store.addSpecies({
        speciesKey: entry.speciesKey,
        scientificName: entry.scientificName,
        vernacularName: entry.vernacularName || (extra.commonNames || [])[0] || null,
        group: entry.group,
        family: extra.family || entry.family,
        className: extra.className || entry.className,
        localCount: extra.localCount,
        wiki: entry.wiki || null,
        image: entry.image,
        citation: entry.exampleRecord ? GBIF.citeOccurrence(entry.exampleRecord) : null,
        note: note.value.trim()
      });
      toast('Collected. It will be waiting on the writing page.');
    }
    paint();
    renderGrid();
    renderCollectedLine();
    renderChrome();
  });

  note.addEventListener('input', debounce(() => {
    if (Store.hasSpecies(entry.speciesKey)) Store.updateSpeciesNote(entry.speciesKey, note.value.trim());
  }, 400));
}

async function loadSheetRecords(speciesKey) {
  const target = $('#sheetRecords');
  if (!target) return;
  const res = await GBIF.occurrences({
    circle, taxonKey: speciesKey, limit: 4, extra: { sortBy: 'eventDate', sortOrder: 'desc' }
  });
  if (!$('#sheetRecords')) return;

  if (!res.ok) { target.innerHTML = errorBlock(res); return; }
  if (!res.data.records.length) {
    target.innerHTML = '<p class="data-note">No individual records to show for this circle.</p>';
    return;
  }

  target.innerHTML = `<div class="record-list">${res.data.records.map(r => `
    <div class="record">
      <div class="record__top">
        <strong>${esc(r.basisOfRecord)}</strong>
        <span class="record__date">${esc(r.date ? String(r.date).slice(0, 10) : 'undated')}</span>
      </div>
      <div class="record__meta">
        ${esc(r.place || 'No place description')}${r.recordedBy ? ` · recorded by ${esc(r.recordedBy)}` : ''}
        ${r.dataset ? `<br>${esc(r.dataset)}` : ''}
      </div>
      <div>
        <span class="record__license">${esc(r.license)}</span>
        <a href="${esc(r.url)}" target="_blank" rel="noopener" style="margin-left:10px">View record →</a>
      </div>
    </div>`).join('')}</div>
    <p class="data-note" style="margin-top:10px">${num(res.data.total)} records of this species inside your circle.</p>`;
}

/* ------------------------------------------------------------- counters */

function renderCollectedLine() {
  const n = Store.getSpecies().length;
  $('#collectedLine').innerHTML = n
    ? `<strong>${n}</strong> species collected · <a href="write.html">go and write →</a>`
    : 'Tap any species to learn more and collect it.';

  const bar = $('#continueBar');
  bar.hidden = n === 0;
  $('#continueText').innerHTML = n
    ? `<strong>${n} species collected.</strong> Three is usually plenty for a good ecography.`
    : '';
}

document.addEventListener('DOMContentLoaded', init);
