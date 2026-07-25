# Eco Ethnography Atlas

A place-based inquiry environment for students. Pick a place, open an activity,
check your thinking against **live biodiversity records from GBIF**, and export
a field-notes report to hand in.

No build step, no framework, no account, no API key.

## Run it

```bash
python3 -m http.server 8340
```

Then open <http://localhost:8340>. It must be served over HTTP — opening
`index.html` from the filesystem blocks the `fetch` of `data/atlas-db.json`.

For GitHub Pages, drop the whole folder in a repo and enable Pages. Everything
is relative-path and static.

## What's here

| File | Purpose |
|---|---|
| `index.html` | Single page: hero, atlas, activities, studio, notebook, sources |
| `styles.css` | Design system from the brief, warmed toward the hero video's palette |
| `app.js` | Application logic — map, activities, notebook, exports |
| `gbif.js` | GBIF source adapter: normalisation, caching, timeouts, graceful failure |
| `data/atlas-db.json` | 10 places, 3 routes, 6 activities, 32 species with GBIF taxon keys |
| `media/atlas-loop.mp4` | Looping hero background (monarch on milkweed, 8s, 1.4 MB) |
| `assets/` | Icons (SVG) and activity imagery (JPEG) |
| `DESIGN-BRIEF.md` | The original design brief this was built against |

## GBIF integration

All calls go to the public `api.gbif.org/v1`. No key, no account, CORS-enabled.

| Feature | Endpoint |
|---|---|
| "What lives here now" panel | `occurrence/search` with a bbox + `facet=speciesKey` |
| Species investigation | `species/{key}`, `/vernacularNames`, `/speciesProfiles` |
| Species photos | `occurrence/search?mediaType=StillImage` |
| Records over time | `occurrence/search` with `facet=year`, bucketed into decades |
| Map record layer | `occurrence/search` filtered to the place's focus species |
| Evidence hunt | `occurrence/search` filtered by `basisOfRecord` |
| Free species lookup | `species/search` against the GBIF Backbone Taxonomy |

Responses are cached in `sessionStorage` for six hours, requests time out after
14 seconds, and every failure renders a retry block rather than an empty panel.
The written context and the notebook never depend on the network.

### Adding a place

Add an object to `data/atlas-db.json` with `bbox` as `[minLat, maxLat, minLon, maxLon]`
and give each species a `gbifKey`. Resolve keys with:

```bash
curl -s "https://api.gbif.org/v1/species/match?strict=true&name=Danaus%20plexippus"
```

The live layer works immediately — no other code changes needed.

## Teaching notes

The atlas labels three kinds of material differently on purpose: **curated**
context written for the project, **live data** from GBIF, and **the student's
own work**. The notebook forces the same distinction — every note is tagged
observation, interpretation, or question, and the exported report groups them
under those headings.

The recurring data-literacy lesson is that a GBIF record count measures
*observation effort*, not abundance. The decade charts make this visible: almost
every region spikes after 1990, which is the arrival of digital databases and
phone apps. The Mekong giant catfish (`Pangasianodon gigas`) returns **zero**
records inside the delta bounding box, and the app treats that absence as a
finding to explain rather than an error to hide.

## Privacy

No accounts, no analytics, no trackers. Notes live in `localStorage` and leave
the device only when the student presses export. Outbound requests go only to
GBIF, OpenStreetMap tiles, and Google Fonts. The Sources section has a button
that erases everything this atlas stored on the device.

## Accessibility

WCAG 2.2 AA targeted: skip link, full keyboard operation, visible focus,
`aria-live` on every async region, a list equivalent for every map marker,
a high-contrast setting, a larger-type setting, a background-video pause control
that also honours `prefers-reduced-motion`, and no horizontal scroll down to 320 px.
