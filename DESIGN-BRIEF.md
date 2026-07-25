# Eco Ethnography Atlas
## Full Design Brief + Production Handoff

**Working title:** Eco Ethnography Atlas  
**Format:** Responsive web application / interactive learning environment  
**Primary users:** High-school and college students; faculty; instructional designers; librarians; interdisciplinary programs  
**Core idea:** An immersive atlas that lets learners investigate how landscapes, species, communities, technologies, archives, and human movement change across time and place.

---

## 1. Executive vision

Eco Ethnography Atlas should feel less like a learning management system and more like entering a **field station, atlas, archive, and research notebook at once**. The experience begins with place. Students move through an interactive map, encounter a landscape or community, and then complete small inquiry activities that require observation, comparison, contextualization, source work, and reflection.

The product should make a simple promise:

> **Every place contains layers. Move through them. Ask what changed. Ask who remembers. Ask what lives there now.**

The site should support both open exploration and instructor-assigned journeys. A student might begin with the Mississippi River, trace a migration route, compare ecological change over a century, examine archival evidence, record field notes, and export a short learning artifact. A faculty member should be able to assign the same environment as a structured activity without having to build a bespoke website.

The existing prototype demonstrates the core interaction model:

**Explore → Choose a place → Investigate a layer → Complete an activity → Record field notes → Synthesize / export**

### Reference inputs

The visual direction was developed from the two FreeBean design references supplied for this project, translated into an original educational design system rather than copied directly. The supplied `stephanwagner/world-map-data` GitHub repository should remain a reference candidate for geographic boundary data exploration; production use should be evaluated against the project’s licensing and the eventual mapping stack.

---

## 2. Product goals

### Primary goals

1. **Make place the interface.** Geography should be the primary doorway into content rather than a conventional list of modules.
2. **Make time visible.** Learners should be able to move backward and forward across ecological, cultural, infrastructural, and archival change.
3. **Keep people inside environmental stories.** Ecology is never treated as scenery detached from labor, migration, memory, language, settlement, extraction, stewardship, or policy.
4. **Turn browsing into inquiry.** Every location should offer prompts, tasks, and evidence rather than passive exposition.
5. **Create student artifacts.** Field notes, timelines, maps, comparisons, and reflections should be savable and exportable.
6. **Remain usable without AI.** AI may eventually help with search or synthesis, but the educational core must work through open data, maps, archives, and student reasoning.

### Secondary goals

- Reuse one content architecture across disciplines.
- Support local fieldwork and global comparison.
- Make public data and open archives approachable.
- Allow faculty to create custom journeys later without editing code.

---

## 3. Audience and use cases

### Students

Students need a clear path into complex material. They should be able to:

- explore an unfamiliar place visually;
- choose a question or activity;
- compare evidence across time;
- locate species, routes, communities, or archival traces;
- write observations without leaving the experience;
- export a record of their inquiry.

### Faculty

Faculty should eventually be able to:

- choose an existing location or journey;
- assign one or more activities;
- add course-specific prompts or readings;
- set an expected duration;
- export or share a link;
- receive a student-produced HTML/PDF/JSON reflection artifact.

### Libraries / archives / museums

The same system could serve as a narrative layer over public collections. A library might build a local river journey; a museum might link historical objects to a map; an environmental studies program might create a regional field atlas.

---

## 4. Design direction

The visual system is derived from the two supplied FreeBean references but translated into an original educational language. The useful characteristics to retain are:

- large, editorial typography;
- cream/off-white page surfaces;
- warm ochre/gold framing;
- high-radius cards and panels;
- restrained pastel accent fields;
- modular grid layouts;
- one large hero experience with smaller interactive modules surrounding it;
- strong alternation between photographic imagery and quiet UI surfaces;
- playful visual energy without childish illustration.

### The crucial change

The hero should **not** use a fake illustrated world map. The visual entry point should be a **realistic, cinematic landscape** that suggests scale, terrain, water, settlement, and ecological diversity. The actual map belongs in the interactive explorer below the hero where geographic precision matters.

This separation gives the site two complementary visual modes:

**Emotional immersion:** photographic / cinematic landscape  
**Spatial precision:** real interactive map with data markers

---

## 5. Visual language

### Core palette

| Role | Suggested value | Usage |
|---|---|---|
| Warm frame | `#D8A24A` | Outer borders, section separators, visual identity |
| Cream page | `#F6EFE3` | Primary background |
| Soft panel | `#FBF7F0` | Cards, field notebook, map detail panels |
| Charcoal | `#2E2B3F` | Primary text and dark buttons |
| Sage | `#DFEACD` | Species, ecology, success / restoration |
| Lavender | `#E8D9F4` | Voices, reflection, field notes |
| Peach | `#F6DDC5` | Archives, history, material culture |
| Sky | `#D9EDF5` | Water, rivers, geography |
| Butter yellow | `#F3DF9D` | Routes, travel, time highlights |

### Typography

Use a modern grotesk / humanist sans serif with strong weight contrast. The prototype currently uses Inter because it is robust and highly readable. A production version could explore a more distinctive headline face while keeping body text conservative.

Recommended hierarchy:

- Hero: 72–96 px desktop, tight leading, heavy weight.
- Section headings: 36–52 px.
- Card titles: 18–22 px.
- Body copy: 16–18 px with generous 1.5–1.7 line height.
- Metadata / chips: 12–14 px.

### Shape language

- Major sections: 24–32 px radius.
- Cards: 18–24 px radius.
- Buttons / filters: pill geometry.
- Avoid sharp rectangles unless representing archival documents or maps.
- Use borders more often than shadows. Shadows should be subtle and secondary.

### Image treatment

Photography and generated landscape assets should feel:

- naturalistic;
- warm but not sepia;
- high-detail;
- editorial rather than stock-photo glossy;
- broad enough to accommodate interface overlays;
- free of text embedded inside the image.

---

## 6. Homepage architecture

### 6.1 Global header

**Purpose:** Orient the user quickly without feeling like a course portal.

**Elements:**

- Eco Ethnography Atlas mark and wordmark
- Explore
- Activities
- Studio
- Community
- Resources
- Search
- Start Exploring CTA

The header should remain sticky on desktop and collapse into a compact menu on mobile.

### 6.2 Hero

**Headline:** “Travel through time, place, and living landscapes”

**Supporting copy:** Introduce ecology, community, memory, history, archives, and inquiry.

**Primary CTA:** Begin the journey  
**Secondary CTA:** See activities

The hero background should remain the realistic landscape asset included in this package. UI chips can float on the right:

- Then & Now
- Field Notes
- Species
- Voices
- Routes

These chips should eventually deep-link directly into the corresponding atlas layer.

### 6.3 Atlas browser

This is the actual geographic engine.

Layout:

- large map on the left;
- selected-place detail panel on the right;
- thematic filters above;
- horizontally or grid-arranged place cards below;
- featured journeys in the side panel.

Filters should include at minimum:

- All
- Rivers
- Species
- Voices
- Routes
- Archives
- Then & Now
- Field Notes

### 6.4 Activity cards

Six initial activity types should remain visible on the homepage to show that the map is not only for browsing.

### 6.5 Activity studio

The studio should be the working surface where a selected place and selected activity come together. This is where the project moves from “beautiful atlas” to “learning instrument.”

### 6.6 Community / fieldwork section

The community section should humanize the tool with student/faculty stories, photographs, fieldwork examples, and eventually public student contributions curated by instructors.

### 6.7 Footer

Use the footer as a small “resource map” rather than a legal afterthought. Include links to:

- World Map
- United States
- Themes
- Teacher Resources
- Lesson Plans
- Accessibility
- Student Privacy
- Data Sources

---

## 7. Map experience

### Current prototype

The provided prototype uses Leaflet and OpenStreetMap tiles. Place records are loaded from `data/atlas-db.json` and rendered as markers. Clicking a marker updates the detail panel and changes the active activity context.

### Production map principles

1. **Geographic accuracy comes first.** Do not generate fake coastlines or decorative pseudo-maps.
2. **Terrain should support inquiry.** A production version should consider a terrain-capable mapping stack for elevation and richer spatial storytelling.
3. **Layers should be semantically meaningful.** Layers can represent species observations, human routes, historic places, water systems, archival records, and student notes.
4. **The map should never become a GIS dashboard.** Controls should remain minimal and educationally legible.
5. **Every marker needs a reason to exist.** A marker should lead to a story, source, activity, or comparison.

### Recommended production layers

- Physical terrain / elevation
- Political boundaries, optional and visually subordinate
- Rivers / watersheds
- Biomes / ecoregions
- Species observations
- Historic places
- Migration / movement routes
- Archives / image records
- Student field observations
- Instructor-created course layers

### Time control

A timeline slider should eventually allow users to alter visible records by date. It should not imply false precision. When historical data is approximate, the interface should show date ranges and uncertainty.

---

## 8. Data architecture

The demo uses a static JSON file because it is transparent, portable, and easy to extend. The production application should preserve the same conceptual schema even if the backend moves to Supabase, Firebase, a relational database, or a custom API.

### Location object

A location should contain:

```json
{
  "id": "mississippi",
  "title": "Mississippi River Corridor",
  "country": "United States",
  "coords": [34.7465, -92.2896],
  "tags": ["rivers", "voices", "archives"],
  "theme": "Trade & Travel",
  "summary": "...",
  "timeline": [],
  "species": [],
  "activities": []
}
```

### Recommended future fields

- `boundingBox`
- `biome`
- `watershed`
- `sources[]`
- `archivalItems[]`
- `oralHistories[]`
- `media[]`
- `educatorNotes`
- `gradeBands[]`
- `estimatedTime`
- `learningObjectives[]`
- `standards[]`
- `accessibilityNotes`
- `rights / license`
- `dateCoverage`
- `uncertainty`

### Source record

Each external record should include:

- title
- creator / institution
- date
- source type
- URL
- license / rights statement
- latitude / longitude where appropriate
- short curator note
- whether the item can be displayed inline or only linked

---

## 9. Initial atlas locations

The demo database contains ten example places designed to demonstrate range rather than completeness:

1. Mississippi River Corridor
2. Yukon River Basin
3. Great Lakes Watershed
4. Everglades
5. Sonoran Desert
6. Mekong Delta
7. Amazon Basin
8. Maasai Mara
9. Arctic Tundra
10. Ganges Delta

Production should expand through **curated journeys**, not by dumping thousands of points onto the map. A small number of deeply developed locations is more educationally useful than an unfiltered global dataset.

---

## 10. Activity system

### Activity 1: Compare a river across centuries

**Goal:** Practice temporal comparison and causal reasoning.

Flow:

1. Select a river location.
2. Move a time slider.
3. Review historical moments, maps, photographs, or environmental records.
4. Identify change and continuity.
5. Write what evidence would be needed to verify the interpretation.

**Student artifact:** comparison note + optional screenshot / export.

### Activity 2: Trace migration paths

**Goal:** Understand movement as ecological, social, and historical.

Possible routes:

- animal migration;
- human migration;
- forced migration;
- trade;
- pilgrimage;
- circulation of crops, disease, technology, or ideas.

Students should distinguish **what moves**, **why it moves**, **what infrastructures enable it**, and **what barriers constrain it**.

### Activity 3: Map a local species story

**Goal:** Use a species as a lens into habitat and human-environment relations.

Students select a species and investigate:

- habitat;
- seasonality;
- threats;
- human use or meaning;
- conservation;
- geographic change.

### Activity 4: Read community field notes

**Goal:** Treat observation as a form of evidence while distinguishing observation from interpretation.

Prompt structure:

- What did you notice?
- What do you think it means?
- What do you still need to verify?
- Whose perspective is missing?

### Activity 5: Build an eco timeline

**Goal:** Connect environmental, social, and technological change.

Students arrange events and annotate relationships among:

- ecological change;
- settlement;
- infrastructure;
- industry;
- law / policy;
- climate;
- cultural memory.

### Activity 6: Archive scavenger hunt

**Goal:** Introduce primary-source reasoning.

Students search for a combination of:

- map / chart;
- photograph / postcard;
- government record;
- oral history;
- newspaper / magazine;
- diary / letter;
- scientific observation.

The key reflective question is not only “What did you find?” but also **“What is missing from the archive?”**

---

## 11. Field Notes Notebook

The notebook is a persistent side panel in the activity studio.

### Current behavior

- title
- location/source
- observation
- local browser storage
- JSON export

### Production behavior

Add:

- tags
- source citations
- image attachment
- map coordinates
- timestamp
- confidence / uncertainty field
- “observation vs interpretation” toggle
- instructor prompt
- export to HTML / PDF / print

Student work should remain local by default unless a course explicitly uses a shared submission service.

---

## 12. Faculty mode

A second major mode should eventually sit on top of the same atlas.

### Journey Builder

Faculty choose:

1. place(s);
2. data layers;
3. activity type(s);
4. prompts;
5. source collection;
6. estimated duration;
7. final reflection / submission type.

The system then generates a shareable journey link.

### Example faculty assignment

**Journey:** Mississippi River - Water, Commerce, and Memory  
**Duration:** 45–60 minutes  
**Tasks:**

- Compare 1927 flood evidence with a contemporary flood-risk layer.
- Read one community voice / oral-history excerpt.
- Trace one movement route along the river.
- Add three field notes.
- Export a one-page synthesis.

---

## 13. Interaction principles

### Reveal complexity gradually

Do not display every layer and activity at once. The site should begin with one place and a small number of clear choices.

### Prefer verbs

Navigation should use actions:

- Explore
- Compare
- Trace
- Listen
- Observe
- Investigate
- Build
- Reflect

### Avoid false authority

The site must distinguish:

- factual records;
- interpretive summaries;
- approximate dates;
- incomplete archives;
- student observations.

### Keep source provenance visible

Every archival, scientific, or public-data item should expose its source institution and rights information without requiring the learner to hunt for it.

---

## 14. Accessibility

The site should target WCAG 2.2 AA.

Minimum expectations:

- full keyboard navigation;
- map alternatives in list / table form;
- meaningful alt text for generated and archival images;
- no information encoded only by color;
- visible focus indicators;
- scalable type;
- captions and transcripts for audio/video;
- reduced-motion mode;
- high-contrast mode;
- responsive layouts to 320 px width;
- accessible exported student artifacts.

The map must never be the only way to access a location. Every marker should have an equivalent card/list item.

---

## 15. Privacy and student safety

The project should preserve a strong privacy posture.

### Recommended default

- anonymous exploration;
- no account required for student use;
- field notes stored locally by default;
- external searches clearly labeled;
- no third-party trackers in the classroom version;
- no public posting of student work without explicit instructor / student action.

If shared-classroom features are added later, collect the minimum possible data.

---

## 16. Responsive behavior

### Desktop

- map and detail panel side-by-side;
- six activity cards in a broad grid;
- notebook beside the workspace;
- sticky navigation.

### Tablet

- map above details;
- cards in two or three columns;
- notebook collapsible beneath the activity.

### Mobile

- single-column story flow;
- map becomes a contained 16:10 panel;
- large touch targets;
- activity studio uses stacked steps;
- field notes accessible through a persistent “Notebook” button.

---

## 17. Content and API opportunities

The atlas should eventually be able to ingest or link to open/public datasets such as:

- Library of Congress collections and newspapers;
- open scholarly metadata / research indexes;
- biodiversity occurrence data;
- weather and climate observations;
- census / labor / public statistical data;
- museum and cultural-heritage collections;
- local open-data portals.

The data layer should normalize these sources into a common internal record rather than making the UI depend directly on each external API.

A production source adapter should output something like:

```json
{
  "id": "provider-record-id",
  "title": "Record title",
  "type": "archive",
  "provider": "institution-name",
  "date": "1927",
  "location": {"lat": 0, "lng": 0},
  "summary": "...",
  "url": "...",
  "license": "..."
}
```

---

## 18. Technical architecture

### Current prototype

- HTML
- CSS
- vanilla JavaScript
- Leaflet
- OpenStreetMap
- static JSON data
- localStorage for student notes

### Recommended production architecture

**Front end**  
A lightweight component-based framework is reasonable once the number of routes, layers, and activities grows. Keep the data model independent of framework choice.

**Map layer**  
Use a production map provider or self-hosted tiles where licensing, performance, and terrain needs justify it. Support geoJSON and route overlays.

**Content layer**  
Start with version-controlled JSON/Markdown. Move to a database only when faculty authoring or shared classroom content requires it.

**API adapters**  
Use small serverless functions for keys, rate limiting, normalization, and caching.

**Student data**  
Local-first. Shared storage only for explicit classroom workflows.

---

## 19. Suggested page / route structure

```text
/
/explore
/explore/:place-id
/journeys
/journeys/:journey-id
/activities
/activities/:activity-id
/studio
/studio/:journey-id
/archives
/species
/voices
/educators
/resources
/about
```

The homepage can remain a rich single-page experience while deeper content receives stable URLs for assignment sharing.

---

## 20. Asset system

### Generated raster assets

The package contains independent PNG files for:

- realistic hero landscape;
- river comparison;
- migration routes;
- species story;
- field notes;
- eco timeline;
- archive investigation;
- community journey.

These should be treated as **replaceable visual modules** rather than baked into a single screenshot.

### SVG assets

Separate SVG files are included for:

- logo;
- search;
- arrows;
- time / clock;
- notes;
- leaf / species;
- voices;
- routes;
- filters;
- checks;
- map pin;
- export;
- link;
- social icons;
- avatars;
- contour / hill backgrounds.

### Production guidance

Keep UI icons as SVG. Keep photographic / cinematic assets as WebP or AVIF in production, with PNG/JPEG fallbacks where needed. Do not embed text into raster images.

---

## 21. Implementation roadmap

### Phase 1 - Refine the prototype

- finalize naming and visual identity;
- refine hero composition;
- improve map marker and tooltip style;
- add real source citations to every location;
- tune mobile layout;
- add HTML / PDF export for student work.

### Phase 2 - Deepen location content

Build 6–10 fully researched journeys rather than adding dozens of shallow markers.

Each journey should include:

- 5–10 map points;
- 1–3 time layers;
- 3–6 sources;
- 1–2 community / human voices;
- 1 species or ecological indicator;
- 2–3 activities;
- final synthesis prompt.

### Phase 3 - Faculty authoring

- Journey Builder;
- prompt editor;
- source picker;
- assignment-link generation;
- export options;
- optional class collection.

### Phase 4 - Open-data connectors

Add normalized adapters for the strongest public APIs and archives. Cache results so classrooms do not depend on live network reliability.

### Phase 5 - Community / field atlas

Allow instructors or institutions to create private or public location collections, with moderation and explicit rights controls.

---

## 22. Acceptance criteria for the next production build

A production-ready beta should satisfy all of the following:

- Hero uses a realistic visual and contains no fake geography.
- The map has at least 6 deeply developed locations.
- Every map marker has a card/list equivalent.
- Every location exposes source provenance.
- All six activity types function.
- Student notes persist locally.
- Student work exports to at least HTML and print/PDF.
- Mobile and keyboard use are fully supported.
- External APIs fail gracefully.
- No API keys appear in client-side code.
- Faculty can share a stable link to a specific journey.
- Accessibility review passes WCAG AA checks for the core workflow.

---

## 23. Design north star

The experience should feel like a student has opened a field notebook and stepped through it into a landscape.

The map is not decoration.  
The archive is not a reading list.  
The activity is not a quiz.  
The student is not merely consuming information.

The final product should continually invite the learner to ask:

> **What happened here? What lives here? Who moved through here? Who remembers it differently? What evidence remains? What changed, and why?**
