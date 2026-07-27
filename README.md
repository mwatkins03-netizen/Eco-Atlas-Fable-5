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
| `explore.html` | **Places a circle** with one click (or a town search) on a US map; sees live record counts and a breakdown of what kinds of life are inside |
| `species.html` | Browses a **photo field guide** built from that circle; filters by birds / mammals / plants / insects / reptiles / amphibians / fish / fungi / spiders; reads each one's **Wikipedia entry**; collects species to write about |
| `write.html` | Writes **three** guided sections with their species and circle beside them; exports HTML / PDF / JSON |
| `guide.html` | How to read the data, how to cite it, privacy, and instructor notes |

## Files

```
index.html explore.html species.html write.html guide.html
css/styles.css              design system; base font 19px
js/gbif.js                  GBIF adapter — circle queries, field guide, caching
js/wiki.js                  Wikipedia adapter — species articles, rate-limited
js/app.js                   shared state, header/footer, preferences (all pages)
js/explore.js               map + circle drawing tool
js/species.js               field guide + species detail + collecting
js/write.js                 writing desk + export
data/starting-points.json   10 US starting points, group definitions, writing prompts
media/                      hero video loop + poster
assets/                     icons and imagery
```

## How the circle works

**One click on the map places a circle.** There is no mode to enter and nothing
to cancel. Size is set afterwards with four presets (Neighborhood / Town /
County / Region), a slider, or +/− buttons; the pin is draggable. Students can
also search for a town, pick a starting point, or opt into `navigator.geolocation`.

Zoom uses large custom buttons rather than Leaflet's small defaults, and
accumulates rapid clicks into a single non-animated `setZoom` — Leaflet silently
discards a zoom that arrives mid-animation, which is what made the default
controls feel broken.

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

## Wikipedia

Each species sheet shows the opening of its Wikipedia article, so students learn
what the organism actually *is* rather than just that it was recorded. The
adapter tries the scientific name first — English Wikipedia redirects
`Carnegiea gigantea` to `Saguaro` — then the common name, then a search. In
testing, scientific name alone resolved 20 of 20 sampled species.

Requests run through a single queue with a 120 ms gap, because Wikimedia returns
429 to bursts. Results cache for 24 hours. The article title, one-line
description, and lede travel with a collected species into the export, credited
CC BY-SA 4.0.

## Failure behavior

GBIF responses cache in `sessionStorage` for six hours and time out at 16
seconds; Wikipedia caches for 24 hours and times out at 9. Every failure renders
a retry block or a plain note rather than an empty panel, and the writing pages
never depend on the network at all.

## Adding or changing content

`data/starting-points.json` holds the starting points, the group definitions,
and all three sets of writing prompts. Edit that file to change the assignment —
no code changes required.

## Teaching notes

The writing task is **three sections**, sized for a first-week freewrite:
*The place*, *Who lives here*, and *What I still want to find out*. Suggested
lengths are 120 / 150 / 100 words and are labelled "suggested", not enforced.

The recurring data lesson is that **a record count measures observation effort,
not abundance**. The site says so in the summary panel, at the top of the field
guide, and throughout the guide page. The seasonality chart is labelled as when
*people looked*, not when the species is present.

The exported document carries a basemap-free SVG scatter of the actual records
in the circle — clusters land on trails, car parks, and university property,
which usually makes the sampling-bias point faster than any paragraph.

## Privacy

No accounts, no analytics, no trackers. The circle, collected species, and all
writing live in `localStorage` and leave the device only on export. If a student
uses **Use my location**, the coordinate centers the map and queries GBIF, is
stored on the device, and is sent nowhere else.

Outbound requests go to GBIF (records), Wikipedia (descriptions), OpenStreetMap
(tiles and town search), and Google Fonts. Searching for a town is the only
thing a student types that leaves the device. None of these receive their
writing. The guide page has a button that erases everything.

## Accessibility

Base font 19px with an "even larger type" setting and a higher-contrast setting.
Skip links, full keyboard operation, visible focus, `aria-live` on async
regions, a keyboard-reachable starting-point list as an alternative to drawing
on the map, a background-video pause control that also honors
`prefers-reduced-motion`, and no horizontal scroll down to 320px.

## Credits

Biodiversity data from [GBIF](https://www.gbif.org). Species descriptions from
[Wikipedia](https://en.wikipedia.org), CC BY-SA 4.0. Base map and town search ©
[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
Each occurrence record and photograph carries its own license from its
publisher, shown wherever it appears.
