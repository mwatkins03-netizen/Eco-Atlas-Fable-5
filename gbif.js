/*
 * gbif.js — Eco Ethnography Atlas source adapter for the
 * Global Biodiversity Information Facility (https://www.gbif.org).
 *
 * GBIF's public API needs no key and no account, so nothing secret ever
 * reaches the browser. Every response is normalised into the internal
 * record shape described in the design brief (section 17) so that the
 * rest of the app never talks to GBIF's field names directly.
 *
 * Every call fails soft: a network error returns { ok: false, error }
 * rather than throwing, because a classroom's wifi is not a dependency
 * we get to control.
 */

const GBIF = (() => {
  const BASE = 'https://api.gbif.org/v1';
  const TIMEOUT_MS = 14000;
  const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // six hours — a class period is safe
  const CACHE_PREFIX = 'eea:gbif:';

  /* ---------------------------------------------------------------- cache */

  function cacheGet(key) {
    try {
      const raw = sessionStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.t > CACHE_TTL_MS) {
        sessionStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return parsed.v;
    } catch (_) {
      return null;
    }
  }

  function cacheSet(key, value) {
    try {
      sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (_) {
      /* storage full or blocked — caching is an optimisation, not a requirement */
    }
  }

  function clearCache() {
    try {
      Object.keys(sessionStorage)
        .filter(k => k.startsWith(CACHE_PREFIX))
        .forEach(k => sessionStorage.removeItem(k));
    } catch (_) { /* ignore */ }
  }

  /* ------------------------------------------------------------- requests */

  const listeners = new Set();
  let inFlight = 0;

  function onActivity(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function announce(status, detail) { listeners.forEach(fn => fn(status, detail)); }

  function buildUrl(path, params = {}) {
    const url = new URL(BASE + path);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) value.forEach(v => url.searchParams.append(key, v));
      else url.searchParams.append(key, value);
    });
    return url.toString();
  }

  async function request(path, params) {
    const url = buildUrl(path, params);
    const cached = cacheGet(url);
    if (cached) return { ok: true, data: cached, cached: true };

    if (!navigator.onLine) {
      return { ok: false, error: 'offline', message: 'You appear to be offline, so live GBIF records cannot load right now.' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    inFlight += 1;
    announce('start', { url, inFlight });

    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) {
        return { ok: false, error: 'http-' + res.status, message: `GBIF responded with status ${res.status}.` };
      }
      const data = await res.json();
      cacheSet(url, data);
      return { ok: true, data, cached: false };
    } catch (err) {
      const aborted = err && err.name === 'AbortError';
      return {
        ok: false,
        error: aborted ? 'timeout' : 'network',
        message: aborted
          ? 'GBIF took too long to answer. Try again, or keep working with the offline notes.'
          : 'Could not reach GBIF. Check the connection and try again.'
      };
    } finally {
      clearTimeout(timer);
      inFlight -= 1;
      announce('end', { url, inFlight });
    }
  }

  /* ---------------------------------------------------------- normalisers */

  // Turns a GBIF occurrence into the internal source record from the brief.
  function normaliseOccurrence(raw) {
    const media = (raw.media || []).filter(m => m.type === 'StillImage' && m.identifier);
    const image = media[0] || null;
    return {
      id: 'gbif-occurrence-' + raw.key,
      type: 'occurrence',
      provider: 'GBIF',
      gbifKey: raw.key,
      url: 'https://www.gbif.org/occurrence/' + raw.key,
      title: raw.scientificName || raw.acceptedScientificName || 'Unnamed record',
      vernacularName: raw.vernacularName || null,
      scientificName: raw.acceptedScientificName || raw.scientificName || null,
      taxonKey: raw.acceptedTaxonKey || raw.taxonKey || raw.speciesKey || null,
      date: raw.eventDate || (raw.year ? String(raw.year) : null),
      year: raw.year || null,
      location: (typeof raw.decimalLatitude === 'number' && typeof raw.decimalLongitude === 'number')
        ? { lat: raw.decimalLatitude, lng: raw.decimalLongitude }
        : null,
      coordinateUncertaintyMeters: raw.coordinateUncertaintyInMeters || null,
      place: [raw.locality, raw.stateProvince, raw.country].filter(Boolean).join(', ') || null,
      country: raw.country || null,
      basisOfRecord: prettyBasis(raw.basisOfRecord),
      rawBasisOfRecord: raw.basisOfRecord || null,
      recordedBy: raw.recordedBy || null,
      institution: raw.institutionCode || raw.publishingOrgKey || null,
      dataset: raw.datasetName || null,
      datasetKey: raw.datasetKey || null,
      license: tidyLicense(raw.license),
      licenseUrl: raw.license || null,
      issues: raw.issues || [],
      image: image
        ? {
            url: image.identifier,
            creator: image.creator || raw.recordedBy || null,
            publisher: image.publisher || null,
            license: tidyLicense(image.license),
            licenseUrl: image.license || null,
            source: image.references || null
          }
        : null
    };
  }

  const BASIS_LABELS = {
    HUMAN_OBSERVATION: 'Human observation',
    MACHINE_OBSERVATION: 'Machine observation',
    OBSERVATION: 'Observation',
    PRESERVED_SPECIMEN: 'Preserved specimen',
    FOSSIL_SPECIMEN: 'Fossil specimen',
    LIVING_SPECIMEN: 'Living specimen',
    MATERIAL_SAMPLE: 'Material sample',
    MATERIAL_CITATION: 'Material citation',
    OCCURRENCE: 'Occurrence record'
  };
  function prettyBasis(value) {
    if (!value) return 'Unknown record type';
    return BASIS_LABELS[value] || value.toLowerCase().replace(/_/g, ' ');
  }

  function tidyLicense(url) {
    if (!url) return 'License not stated';
    const map = [
      [/zero|cc0|publicdomain\/zero/i, 'CC0 (public domain)'],
      [/by-nc-nd/i, 'CC BY-NC-ND'],
      [/by-nc-sa/i, 'CC BY-NC-SA'],
      [/by-nc/i, 'CC BY-NC'],
      [/by-sa/i, 'CC BY-SA'],
      [/by-nd/i, 'CC BY-ND'],
      [/\/by\//i, 'CC BY'],
      [/unspecified|other/i, 'Unspecified license']
    ];
    const hit = map.find(([re]) => re.test(url));
    return hit ? hit[1] : url;
  }

  // A citation a student can paste straight into an assignment.
  function citeOccurrence(record) {
    const bits = [];
    if (record.recordedBy) bits.push(record.recordedBy);
    if (record.date) bits.push(`(${String(record.date).slice(0, 10)})`);
    bits.push(record.scientificName || record.title);
    if (record.dataset) bits.push(record.dataset);
    bits.push('Occurrence record accessed via GBIF.org');
    bits.push(record.url);
    if (record.license) bits.push(record.license);
    return bits.join('. ') + '.';
  }

  function citeDownload(context) {
    const today = new Date().toISOString().slice(0, 10);
    return `GBIF.org (${today}) GBIF Occurrence Search${context ? ' — ' + context : ''}. https://www.gbif.org/occurrence/search`;
  }

  /* -------------------------------------------------------- bbox handling */

  // Atlas bbox is [minLat, maxLat, minLon, maxLon].
  function bboxParams(bbox) {
    if (!bbox) return {};
    return {
      hasCoordinate: 'true',
      hasGeospatialIssue: 'false',
      decimalLatitude: `${bbox[0]},${bbox[1]}`,
      decimalLongitude: `${bbox[2]},${bbox[3]}`
    };
  }

  /* ------------------------------------------------------------ endpoints */

  async function matchName(name) {
    const res = await request('/species/match', { name, strict: false });
    if (!res.ok) return res;
    if (!res.data || res.data.matchType === 'NONE') {
      return { ok: false, error: 'no-match', message: `GBIF has no confident match for "${name}".` };
    }
    return { ok: true, data: res.data, cached: res.cached };
  }

  async function taxon(key) {
    const res = await request('/species/' + key, {});
    return res;
  }

  async function vernacularNames(key, language = 'eng') {
    const res = await request(`/species/${key}/vernacularNames`, { limit: 100 });
    if (!res.ok) return res;
    const seen = new Set();
    const names = (res.data.results || [])
      .filter(v => !v.language || v.language === language)
      .map(v => v.vernacularName)
      .filter(n => {
        const k = (n || '').toLowerCase();
        if (!n || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    return { ok: true, data: names, cached: res.cached };
  }

  async function speciesProfile(key) {
    const res = await request(`/species/${key}/speciesProfiles`, { limit: 10 });
    if (!res.ok) return res;
    const results = res.data.results || [];
    const merged = results.reduce((acc, item) => ({
      habitat: acc.habitat || item.habitat || null,
      extinct: acc.extinct === null || acc.extinct === undefined ? item.extinct : acc.extinct,
      marine: acc.marine || item.marine || null,
      freshwater: acc.freshwater || item.freshwater || null,
      terrestrial: acc.terrestrial || item.terrestrial || null,
      sources: item.source ? acc.sources.concat(item.source) : acc.sources
    }), { habitat: null, extinct: null, marine: null, freshwater: null, terrestrial: null, sources: [] });
    return { ok: true, data: merged, cached: res.cached };
  }

  async function count(params) {
    const res = await request('/occurrence/search', Object.assign({ limit: 0 }, params));
    if (!res.ok) return res;
    return { ok: true, data: res.data.count || 0, cached: res.cached };
  }

  async function occurrences({ taxonKey, bbox, limit = 20, mediaOnly = false, extra = {} } = {}) {
    const params = Object.assign(
      { limit, taxonKey, hasCoordinate: 'true', hasGeospatialIssue: 'false' },
      bboxParams(bbox),
      mediaOnly ? { mediaType: 'StillImage' } : {},
      extra
    );
    const res = await request('/occurrence/search', params);
    if (!res.ok) return res;
    return {
      ok: true,
      cached: res.cached,
      data: {
        total: res.data.count || 0,
        records: (res.data.results || []).map(normaliseOccurrence)
      }
    };
  }

  // Counts per year — the backbone of the "then & now" comparison.
  async function yearFacet({ taxonKey, bbox, from = 1900 } = {}) {
    const params = Object.assign(
      { limit: 0, taxonKey, facet: 'year', facetLimit: 300, year: `${from},2026` },
      bboxParams(bbox)
    );
    const res = await request('/occurrence/search', params);
    if (!res.ok) return res;
    const facet = (res.data.facets || []).find(f => f.field === 'YEAR');
    const counts = (facet ? facet.counts : [])
      .map(c => ({ year: Number(c.name), count: c.count }))
      .filter(c => Number.isFinite(c.year))
      .sort((a, b) => a.year - b.year);
    return { ok: true, cached: res.cached, data: { total: res.data.count || 0, years: counts } };
  }

  // Group year counts into decades so a chart stays readable.
  function toDecades(years) {
    const buckets = new Map();
    years.forEach(({ year, count }) => {
      const decade = Math.floor(year / 10) * 10;
      buckets.set(decade, (buckets.get(decade) || 0) + count);
    });
    return Array.from(buckets.entries())
      .map(([decade, count]) => ({ decade, count }))
      .sort((a, b) => a.decade - b.decade);
  }

  // "What has actually been recorded here?" — top species in a bounding box.
  async function topSpecies({ bbox, limit = 8, extra = {} } = {}) {
    const params = Object.assign(
      { limit: 0, facet: 'speciesKey', facetLimit: limit },
      bboxParams(bbox),
      extra
    );
    const res = await request('/occurrence/search', params);
    if (!res.ok) return res;
    const facet = (res.data.facets || []).find(f => f.field === 'SPECIES_KEY');
    const rows = facet ? facet.counts : [];

    // Resolve each taxon key to a readable name, in parallel.
    const named = await Promise.all(rows.map(async row => {
      const t = await taxon(row.name);
      const d = t.ok ? t.data : {};
      return {
        gbifKey: Number(row.name),
        count: row.count,
        scientificName: d.canonicalName || d.scientificName || ('Taxon ' + row.name),
        vernacularName: d.vernacularName || null,
        kingdom: d.kingdom || null,
        className: d.class || null,
        url: 'https://www.gbif.org/species/' + row.name
      };
    }));

    return { ok: true, cached: res.cached, data: { total: res.data.count || 0, species: named } };
  }

  // Free-text species lookup so students can chase their own questions.
  async function searchSpecies(query, limit = 8) {
    const res = await request('/species/search', {
      q: query,
      rank: ['SPECIES', 'SUBSPECIES'],
      status: 'ACCEPTED',
      datasetKey: 'd7dddbf4-2cf0-4f39-9b2a-bb099caae36c', // GBIF Backbone Taxonomy
      limit
    });
    if (!res.ok) return res;
    const results = (res.data.results || []).map(r => ({
      gbifKey: r.key,
      scientificName: r.canonicalName || r.scientificName,
      authorship: r.authorship || null,
      kingdom: r.kingdom || null,
      className: r.class || null,
      family: r.family || null,
      vernacularName: (r.vernacularNames || [])
        .filter(v => !v.language || v.language === 'eng')
        .map(v => v.vernacularName)[0] || null,
      url: 'https://www.gbif.org/species/' + r.key
    }));
    return { ok: true, cached: res.cached, data: results };
  }

  return {
    BASE,
    onActivity,
    clearCache,
    matchName,
    taxon,
    vernacularNames,
    speciesProfile,
    count,
    occurrences,
    yearFacet,
    toDecades,
    topSpecies,
    searchSpecies,
    normaliseOccurrence,
    citeOccurrence,
    citeDownload,
    tidyLicense
  };
})();

window.GBIF = GBIF;
