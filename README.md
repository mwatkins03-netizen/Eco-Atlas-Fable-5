# Ecography

**Write the living story of a place.**

Students draw a circle anywhere in the United States, meet the species that have
actually been recorded inside it using live GBIF data, and author their own
*ecography* — a biography of a place and the lives it holds.

Static site. No build step, no framework, no server, no API key, no accounts.

## Run it

```bash
python3 -m http.server 8350
```

Open <http://localhost:8350>. It must be served over HTTP — opening the files
directly blocks the `fetch` of `data/starting-points.json`.

For GitHub Pages, commit the folder and turn Pages on. Every path is relative.

## The three steps

| Page | What the student does |
|---|---|
| `index.html` | Learns what an ecography is |
| `explore.html` | **Draws a circle** on a US map; sees live record counts and a breakdown of what kinds of life are inside |
| `species.html` | Browses a **photo field guide** built from that circle; filters by birds / mammals / plants / insects / reptiles / amphibians / fish / fungi / spiders; collects species to write about |
| `write.html` | Writes five guided sections with their species and circle beside them; exports HTML / PDF / JSON |
| `guide.html` | How to read the data, how to cite it, privacy, and instructor notes |

## Files

```
index.html explore.html species.html write.html guide.html
css/styles.css              design system; base font 19px
js/gbif.js                  GBIF adapter — circle queries, field guide, caching
js/app.js                   shared state, header/footer, preferences (all pages)
js/explore.js               map + circle drawing tool
js/species.js               field guide + species detail + collecting
js/write.js                 writing desk + export
data/starting-points.json   10 US starting points, group definitions, writing prompts
media/                      hero video loop + poster
assets/                     icons and imagery
```

## How the circle works

Drawing is two clicks: one for the centre, one for the edge. The pin is
draggable and a slider adjusts the radius (2–120 km). Students can also use a
starting point, or opt into `navigator.geolocation`.

Queries use GBIF's `geoDistance` parameter (`lat,lon,25km`), so the circle the
student sees is exactly the circle being queried — no bounding-box approximation.

## How the field guide works

The visual guide is deliberately cheap to build. **Three requests** to
`occurrence/search?mediaType=StillImage&limit=300` return ~300 distinct species
already carrying species name, full taxonomy, and a photograph. Grouping into
everyday categories happens client-side from each record's own taxonomy, because
GBIF's backbone gives fish no class and splits reptiles across Squamata,
Testudines, and Crocodylia — no single taxon key covers what students mean by
"reptiles".

Common names come from `species/{key}` afterwards, through a concurrency
limiter, so pictures appear immediately and names fill in behind them.

Opening a species costs a few more requests: taxonomy, vernacular names, habitat
profile, count inside the circle, count worldwide, month-by-month seasonality,
and recent individual records with collector, institution, and license.

Everything is cached in `sessionStorage` for six hours, times out at 16 seconds,
and fails to a retry block rather than an empty panel.

## Adding or changing content

`data/starting-points.json` holds the starting points, the group definitions,
and all five sets of writing prompts. Edit that file to change the assignment —
no code changes required.

## Teaching notes

The recurring lesson is that **a record count measures observation effort, not
abundance**. The site says so in the summary panel, on every species sheet, at
the top of the field guide, and throughout the guide page. The seasonality chart
is labelled as when *people looked*, not when the species is present.

Section 3 of the writing task ("What the data shows — and what it hides") and
section 4 ("Who else knows this place") exist to make students argue with their
own evidence.

The exported document carries a basemap-free SVG scatter of the actual records
in the circle — clusters land on trails, car parks, and university property,
which usually makes the sampling-bias point faster than any paragraph.

## Privacy

No accounts, no analytics, no trackers. The circle, collected species, and all
writing live in `localStorage` and leave the device only on export. If a student
uses **Use my location**, the coordinate centres the map and queries GBIF, is
stored on the device, and is sent nowhere else. Outbound requests go only to
GBIF, OpenStreetMap tiles, and Google Fonts. The guide page has a button that
erases everything.

## Accessibility

Base font 19px with an "even larger type" setting and a higher-contrast setting.
Skip links, full keyboard operation, visible focus, `aria-live` on async
regions, a keyboard-reachable starting-point list as an alternative to drawing
on the map, a background-video pause control that also honours
`prefers-reduced-motion`, and no horizontal scroll down to 320px.

## Credits

Biodiversity data from [GBIF](https://www.gbif.org). Base map ©
[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
Each occurrence record and photograph carries its own license from its
publisher, shown wherever it appears.
