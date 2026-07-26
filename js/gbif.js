/*
 * gbif.js — Ecography's adapter for the Global Biodiversity Information
 * Facility (https://www.gbif.org).
 *
 * The public GBIF API needs no key and no account, so nothing secret ever
 * reaches the browser. Everything here is shaped around one question:
 * "what has been recorded inside the circle the student drew?"
 *
 * Every call fails soft — a network error returns { ok:false, error } instead
 * of throwing, because a classroom's wifi is not a dependency we control.
 */

const GBIF = (() => {
  const BASE = 'https://api.gbif.org/v1';
  const TIMEOUT_MS = 16000;
  const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
  const CACHE_PREFIX = 'ecog:gbif:';

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
    } catch (_) { return null; }
  }

  function cacheSet(key, value) {
    try {
      sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (_) {
      // Storage is full or blocked. Drop the oldest half and move on.
      try {
        Object.keys(sessionStorage).filter(k => k.startsWith(CACHE_PREFIX))
          .slice(0, 40).forEach(k => sessionStorage.removeItem(k));
      } catch (__) { /* caching is an optimisation, not a requirement */ }
    }
  }

  function clearCache() {
    try {
      Object.keys(sessionStorage).filter(k => k.startsWith(CACHE_PREFIX))
        .forEach(k => sessionStorage.removeItem(k));
    } catch (_) { /* ignore */ }
  }

  /* ------------------------------------------------------------- requests */

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
      return { ok: false, error: 'offline', message: 'You are offline, so live GBIF records cannot load right now.' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) return { ok: false, error: 'http-' + res.status, message: `GBIF responded with status ${res.status}.` };
      const data = await res.json();
      cacheSet(url, data);
      return { ok: true, data, cached: false };
    } catch (err) {
      const aborted = err && err.name === 'AbortError';
      return {
        ok: false,
        error: aborted ? 'timeout' : 'network',
        message: aborted
          ? 'GBIF took too long to answer. Try a smaller circle, or try again in a moment.'
          : 'Could not reach GBIF. Check your connection and try again.'
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /* --------------------------------------------------- concurrency limiter */

  // GBIF is generous but not infinite, and a phone on school wifi is not.
  async function mapLimited(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    async function run() {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return results;
  }

  /* ---------------------------------------------------------- the circle */

  // GBIF's geoDistance takes "lat,lon,distance" with a unit suffix.
  function circleParam(circle) {
    return `${circle.lat.toFixed(5)},${circle.lng.toFixed(5)},${Math.round(circle.radiusKm)}km`;
  }

  function circleBase(circle) {
    return { geoDistance: circleParam(circle), hasCoordinate: 'true', hasGeospatialIssue: 'false' };
  }

  /* ---------------------------------------------------------- normalisers */

  const BASIS_LABELS = {
    HUMAN_OBSERVATION: 'Someone saw it',
    MACHINE_OBSERVATION: 'A machine detected it',
    OBSERVATION: 'Observed',
    PRESERVED_SPECIMEN: 'A museum specimen',
    FOSSIL_SPECIMEN: 'A fossil',
    LIVING_SPECIMEN: 'A living collection',
    MATERIAL_SAMPLE: 'A material sample',
    MATERIAL_CITATION: 'Cited material',
    OCCURRENCE: 'An occurrence record'
  };

  function prettyBasis(value) {
    if (!value) return 'Unknown record type';
    return BASIS_LABELS[value] || value.toLowerCase().replace(/_/g, ' ');
  }

  function tidyLicense(url) {
    if (!url) return 'License not stated';
    const map = [
      [/zero|cc0|publicdomain\/zero/i, 'CC0 (public domain)'],
      [/by-nc-nd/i, 'CC BY-NC-ND'], [/by-nc-sa/i, 'CC BY-NC-SA'], [/by-nc/i, 'CC BY-NC'],
      [/by-sa/i, 'CC BY-SA'], [/by-nd/i, 'CC BY-ND'], [/\/by\//i, 'CC BY'],
      [/unspecified|other/i, 'Unspecified license']
    ];
    const hit = map.find(([re]) => re.test(url));
    return hit ? hit[1] : url;
  }

  function pickImage(raw) {
    const media = (raw.media || []).filter(m => m.type === 'StillImage' && m.identifier);
    if (!media.length) return null;
    const m = media[0];
    return {
      url: m.identifier,
      creator: m.creator || raw.recordedBy || null,
      publisher: m.publisher || null,
      license: tidyLicense(m.license),
      source: m.references || null
    };
  }

  function normaliseOccurrence(raw) {
    return {
      id: 'gbif-occurrence-' + raw.key,
      gbifKey: raw.key,
      url: 'https://www.gbif.org/occurrence/' + raw.key,
      scientificName: raw.species || raw.acceptedScientificName || raw.scientificName || null,
      speciesKey: raw.speciesKey || raw.acceptedTaxonKey || raw.taxonKey || null,
      vernacularName: raw.vernacularName || null,
      kingdom: raw.kingdom || null,
      phylum: raw.phylum || null,
      className: raw.class || null,
      order: raw.order || null,
      family: raw.family || null,
      date: raw.eventDate || (raw.year ? String(raw.year) : null),
      year: raw.year || null,
      month: raw.month || null,
      location: (typeof raw.decimalLatitude === 'number' && typeof raw.decimalLongitude === 'number')
        ? { lat: raw.decimalLatitude, lng: raw.decimalLongitude } : null,
      coordinateUncertaintyMeters: raw.coordinateUncertaintyInMeters || null,
      place: [raw.locality, raw.stateProvince].filter(Boolean).join(', ') || raw.country || null,
      basisOfRecord: prettyBasis(raw.basisOfRecord),
      rawBasisOfRecord: raw.basisOfRecord || null,
      recordedBy: raw.recordedBy || null,
      dataset: raw.datasetName || null,
      institution: raw.institutionCode || null,
      license: tidyLicense(raw.license),
      image: pickImage(raw)
    };
  }

  /* -------------------------------------------------------------- groups */

  // GBIF's backbone no longer gives fish a class, and it splits reptiles into
  // Squamata / Testudines / Crocodylia. Classify from the record itself rather
  // than pretending a single taxon key covers each everyday group.
  function groupOf(record) {
    const kingdom = record.kingdom;
    const className = record.className || record.class;
    if (kingdom === 'Plantae') return 'plants';
    if (kingdom === 'Fungi') return 'fungi';
    if (className === 'Aves') return 'birds';
    if (className === 'Mammalia') return 'mammals';
    if (className === 'Insecta') return 'insects';
    if (className === 'Arachnida') return 'spiders';
    if (className === 'Amphibia') return 'amphibians';
    if (['Squamata', 'Testudines', 'Crocodylia'].includes(className)) return 'reptiles';
    if (record.phylum === 'Chordata') return 'fish';
    return 'other';
  }

  /* ----------------------------------------------------------- endpoints */

  async function count(params) {
    const res = await request('/occurrence/search', Object.assign({ limit: 0 }, params));
    if (!res.ok) return res;
    return { ok: true, cached: res.cached, data: res.data.count || 0 };
  }

  // Headline numbers for a circle: how much has been recorded, and how varied.
  async function circleSummary(circle) {
    const res = await request('/occurrence/search', Object.assign(
      { limit: 0, facet: ['speciesKey', 'basisOfRecord', 'year'], facetLimit: 1200, speciesKeyFacetLimit: 1200 },
      circleBase(circle)
    ));
    if (!res.ok) return res;

    const facets = res.data.facets || [];
    const byField = name => {
      const f = facets.find(x => x.field === name);
      return f ? f.counts : [];
    };
    const years = byField('YEAR')
      .map(c => ({ year: Number(c.name), count: c.count }))
      .filter(c => Number.isFinite(c.year))
      .sort((a, b) => a.year - b.year);

    return {
      ok: true,
      cached: res.cached,
      data: {
        totalRecords: res.data.count || 0,
        speciesCount: byField('SPECIES_KEY').length,
        basis: byField('BASIS_OF_RECORD').map(c => ({ label: prettyBasis(c.name), raw: c.name, count: c.count })),
        years
      }
    };
  }

  // The visual field guide. One sweep per page of photographed records gives
  // species name, full taxonomy, and a picture in a single request — no
  // per-species lookup needed to draw the grid.
  async function circleFieldGuide(circle, { pages = 3, pageSize = 300, onProgress } = {}) {
    const species = new Map();
    let total = 0;
    let firstError = null;

    for (let page = 0; page < pages; page += 1) {
      const res = await request('/occurrence/search', Object.assign(
        { limit: pageSize, offset: page * pageSize, mediaType: 'StillImage' },
        circleBase(circle)
      ));
      if (!res.ok) { firstError = firstError || res; break; }
      total = res.data.count || 0;

      (res.data.results || []).forEach(raw => {
        const key = raw.speciesKey;
        if (!key) return;
        const record = normaliseOccurrence(raw);
        const existing = species.get(key);
        if (existing) {
          existing.sampleCount += 1;
          if (!existing.image && record.image) existing.image = record.image;
          if (record.location) existing.points.push(record.location);
          return;
        }
        species.set(key, {
          speciesKey: key,
          scientificName: record.scientificName,
          vernacularName: record.vernacularName,
          kingdom: record.kingdom,
          phylum: record.phylum,
          className: record.className,
          order: record.order,
          family: record.family,
          group: groupOf(record),
          image: record.image,
          exampleRecord: record,
          sampleCount: 1,
          points: record.location ? [record.location] : []
        });
      });

      if (onProgress) onProgress({ page: page + 1, pages, species: species.size });
      if ((res.data.results || []).length < pageSize) break; // ran out of records
    }

    if (!species.size && firstError) return firstError;

    return {
      ok: true,
      data: {
        photographedRecords: total,
        species: Array.from(species.values()).sort((a, b) => b.sampleCount - a.sampleCount)
      }
    };
  }

  // Common names are what make a field guide usable, and occurrence records
  // rarely carry them. The taxon record does, so fill them in lazily.
  async function attachCommonNames(speciesList, limit = 6) {
    const missing = speciesList.filter(s => !s.vernacularName && !s.commonNameChecked);
    await mapLimited(missing, limit, async entry => {
      const res = await request('/species/' + entry.speciesKey, {});
      entry.commonNameChecked = true;
      if (res.ok && res.data && res.data.vernacularName) {
        entry.vernacularName = String(res.data.vernacularName).split(',')[0].trim();
      }
      return entry;
    });
    return speciesList;
  }

  async function taxon(key) { return request('/species/' + key, {}); }

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
    return { ok: true, cached: res.cached, data: names };
  }

  async function speciesProfile(key) {
    const res = await request(`/species/${key}/speciesProfiles`, { limit: 10 });
    if (!res.ok) return res;
    return {
      ok: true,
      cached: res.cached,
      data: (res.data.results || []).reduce((acc, item) => ({
        habitat: acc.habitat || item.habitat || null,
        extinct: acc.extinct == null ? item.extinct : acc.extinct,
        marine: acc.marine || item.marine || null,
        freshwater: acc.freshwater || item.freshwater || null,
        terrestrial: acc.terrestrial || item.terrestrial || null
      }), { habitat: null, extinct: null, marine: null, freshwater: null, terrestrial: null })
    };
  }

  async function occurrences({ circle, taxonKey, limit = 20, mediaOnly = false, extra = {} } = {}) {
    const params = Object.assign(
      { limit, taxonKey },
      circle ? circleBase(circle) : { hasCoordinate: 'true' },
      mediaOnly ? { mediaType: 'StillImage' } : {},
      extra
    );
    const res = await request('/occurrence/search', params);
    if (!res.ok) return res;
    return {
      ok: true,
      cached: res.cached,
      data: { total: res.data.count || 0, records: (res.data.results || []).map(normaliseOccurrence) }
    };
  }

  // When was this species recorded here? Month counts answer "what season?",
  // which is a question a student can actually go outside and test.
  async function seasonality({ circle, taxonKey }) {
    const res = await request('/occurrence/search', Object.assign(
      { limit: 0, taxonKey, facet: 'month', facetLimit: 12 },
      circle ? circleBase(circle) : {}
    ));
    if (!res.ok) return res;
    const facet = (res.data.facets || []).find(f => f.field === 'MONTH');
    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: 0 }));
    (facet ? facet.counts : []).forEach(c => {
      const m = Number(c.name);
      if (m >= 1 && m <= 12) months[m - 1].count = c.count;
    });
    return { ok: true, cached: res.cached, data: { total: res.data.count || 0, months } };
  }

  async function yearFacet({ circle, taxonKey, from = 1900 } = {}) {
    const res = await request('/occurrence/search', Object.assign(
      { limit: 0, taxonKey, facet: 'year', facetLimit: 300, year: `${from},2026` },
      circle ? circleBase(circle) : {}
    ));
    if (!res.ok) return res;
    const facet = (res.data.facets || []).find(f => f.field === 'YEAR');
    const years = (facet ? facet.counts : [])
      .map(c => ({ year: Number(c.name), count: c.count }))
      .filter(c => Number.isFinite(c.year))
      .sort((a, b) => a.year - b.year);
    return { ok: true, cached: res.cached, data: { total: res.data.count || 0, years } };
  }

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

  /* ------------------------------------------------------------ citation */

  function citeOccurrence(record) {
    const bits = [];
    if (record.recordedBy) bits.push(record.recordedBy);
    if (record.date) bits.push(`(${String(record.date).slice(0, 10)})`);
    bits.push(record.scientificName || 'Occurrence record');
    if (record.dataset) bits.push(record.dataset);
    bits.push('Accessed via GBIF.org');
    bits.push(record.url);
    if (record.license) bits.push(record.license);
    return bits.join('. ') + '.';
  }

  function citeCircle(circle, placeName) {
    const today = new Date().toISOString().slice(0, 10);
    const where = placeName ? `${placeName} — ` : '';
    return `GBIF.org (${today}) GBIF Occurrence Search. ${where}${circle.radiusKm} km radius centred on `
      + `${circle.lat.toFixed(4)}, ${circle.lng.toFixed(4)}. https://www.gbif.org/occurrence/search`;
  }

  function gbifCircleUrl(circle) {
    return 'https://www.gbif.org/occurrence/search?geo_distance='
      + encodeURIComponent(circleParam(circle));
  }

  return {
    BASE, clearCache, mapLimited,
    circleParam, circleBase, groupOf,
    count, circleSummary, circleFieldGuide, attachCommonNames,
    taxon, vernacularNames, speciesProfile,
    occurrences, seasonality, yearFacet, toDecades,
    normaliseOccurrence, prettyBasis, tidyLicense,
    citeOccurrence, citeCircle, gbifCircleUrl
  };
})();

window.GBIF = GBIF;
