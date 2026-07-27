/*
 * wiki.js — Wikipedia adapter.
 *
 * GBIF tells a student that a species was recorded in their circle. It does
 * not tell them what the thing *is*. Wikipedia does, in two sentences a
 * first-year can read.
 *
 * Uses the public REST summary endpoint, which is CORS-open and needs no key.
 * Scientific names almost always redirect to the article a reader wants
 * ("Carnegiea gigantea" → "Saguaro"), so that is the first thing we try.
 */

const Wiki = (() => {
  const BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
  const SEARCH = 'https://en.wikipedia.org/w/api.php';
  const TIMEOUT_MS = 9000;
  const CACHE_PREFIX = 'ecog:wiki:';
  const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // articles change slowly

  /* ---------------------------------------------------------------- cache */

  function cacheGet(key) {
    try {
      const raw = sessionStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.t > CACHE_TTL_MS) return null;
      return parsed.v;
    } catch (_) { return null; }
  }

  function cacheSet(key, value) {
    try { sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value })); }
    catch (_) { /* caching is optional */ }
  }

  function clearCache() {
    try {
      Object.keys(sessionStorage).filter(k => k.startsWith(CACHE_PREFIX))
        .forEach(k => sessionStorage.removeItem(k));
    } catch (_) { /* ignore */ }
  }

  /* ------------------------------------------------- polite rate limiting */

  // Wikimedia will return 429 if a page fires off a burst. Everything here
  // goes through one queue with a small gap so a class of students browsing
  // quickly never trips it.
  let chain = Promise.resolve();
  const GAP_MS = 120;

  function queued(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(() => new Promise(r => setTimeout(r, GAP_MS)),
                     () => new Promise(r => setTimeout(r, GAP_MS)));
    return run;
  }

  async function getJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (res.status === 404) return { ok: false, error: 'not-found' };
      if (res.status === 429) return { ok: false, error: 'rate-limited', message: 'Wikipedia is busy. Try again in a moment.' };
      if (!res.ok) return { ok: false, error: 'http-' + res.status };
      return { ok: true, data: await res.json() };
    } catch (err) {
      return {
        ok: false,
        error: err && err.name === 'AbortError' ? 'timeout' : 'network',
        message: 'Could not reach Wikipedia.'
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------------------------------------------------------- normalising */

  function normalise(raw) {
    if (!raw || raw.type === 'disambiguation' || !raw.extract) return null;
    return {
      title: raw.title,
      description: raw.description || null,
      extract: raw.extract,
      // The first two sentences are usually the definition; the rest is detail.
      lede: firstSentences(raw.extract, 2),
      thumbnail: raw.thumbnail ? raw.thumbnail.source : null,
      image: raw.originalimage ? raw.originalimage.source : null,
      url: (raw.content_urls && raw.content_urls.desktop && raw.content_urls.desktop.page)
        || 'https://en.wikipedia.org/wiki/' + encodeURIComponent(raw.title),
      lang: raw.lang || 'en'
    };
  }

  function firstSentences(text, count) {
    const parts = String(text).match(/[^.!?]+[.!?]+(\s|$)/g);
    if (!parts) return text;
    return parts.slice(0, count).join('').trim();
  }

  function slug(name) {
    return encodeURIComponent(String(name).trim().replace(/\s+/g, '_'));
  }

  /* ------------------------------------------------------------ endpoints */

  async function summaryFor(title) {
    const res = await getJSON(BASE + slug(title));
    if (!res.ok) return res;
    const clean = normalise(res.data);
    return clean ? { ok: true, data: clean } : { ok: false, error: 'not-an-article' };
  }

  // Last resort when neither name has an article: ask the search index.
  async function searchThenSummary(query) {
    const url = new URL(SEARCH);
    Object.entries({
      action: 'query', list: 'search', srsearch: query, srlimit: 1,
      format: 'json', origin: '*'
    }).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await getJSON(url.toString());
    if (!res.ok) return res;
    const hit = res.data && res.data.query && res.data.query.search && res.data.query.search[0];
    if (!hit) return { ok: false, error: 'not-found' };
    return summaryFor(hit.title);
  }

  /**
   * Look up a species. Tries the scientific name (which redirects to whatever
   * the article is actually called), then the common name, then a search.
   */
  function lookupSpecies({ scientificName, vernacularName }) {
    const cacheKey = (scientificName || vernacularName || '').toLowerCase();
    if (!cacheKey) return Promise.resolve({ ok: false, error: 'no-name' });

    const cached = cacheGet(cacheKey);
    if (cached) return Promise.resolve(cached.miss ? { ok: false, error: 'not-found' } : { ok: true, data: cached, cached: true });

    return queued(async () => {
      const attempts = [];
      if (scientificName) attempts.push(() => summaryFor(scientificName));
      if (vernacularName && vernacularName !== scientificName) attempts.push(() => summaryFor(vernacularName));
      if (scientificName) attempts.push(() => searchThenSummary(scientificName));

      let lastError = { ok: false, error: 'not-found' };
      for (const attempt of attempts) {
        const res = await attempt();
        if (res.ok) {
          cacheSet(cacheKey, res.data);
          return res;
        }
        lastError = res;
        // A network problem will not be fixed by trying another title.
        if (['network', 'timeout', 'rate-limited'].includes(res.error)) return res;
      }
      cacheSet(cacheKey, { miss: true });
      return lastError;
    });
  }

  return { lookupSpecies, summaryFor, clearCache, firstSentences };
})();

window.Wiki = Wiki;
