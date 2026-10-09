# Real-city remake: playable neighborhood

## Accepted direction

Keep the scale and density of a major city. Real streets and building footprints supply the
geography; our renderer supplies the art direction; the Remake supplies fictional people,
businesses and simulation. Use iOS dark-mode clarity: a mostly unobstructed map, compact floating
controls and contextual bottom sheets. Natural materials should remain readable under territory
overlays. Assets can become more detailed after the geographic scale and mobile budget are proven.

## This milestone

Open `/?preview=real-city`, or **Explore the New York map preview** on the Remake start screen.
The map now offers **Play this neighborhood**, an isolated first playable real-city campaign.
It never imports the Remake store or writes either existing game's save. Exploration alone does
not open a campaign. The optional geography argument to `newWorld` preserves the default generation
path and RNG order; no `WORLD_VERSION` change.

- Lower East Side / nearby Manhattan streets, 2,371 building footprints, 2,636 road/path segments
  and 32 park polygons in the first fixture. Bounds: 40.713–40.725 N, −73.995–−73.978 E.
- Shared metre coordinates for 2D and 3D. Street widths are illustrative defaults unless tagged.
- Source-tagged heights, heights inferred from floor counts, and explicitly identified 15 m
  fallback estimates. Shapes are real; facade colours and window patterns are our illustration.
- Multipolygon building rings and courtyards, with incomplete geometry rejected.
- Merged wall/roof meshes and on-demand rendering, using the existing Remake's Three.js,
  MapControls and shared window material. Concave roofs use triangulation rather than quad fans.
- Pan, pinch/zoom, 3D rotation/tilt, recenter, address search, building selection, appearance controls.
- Maps-inspired 2D hierarchy: subdued footprints, brighter local/major roads, green parks,
  street-aligned upright labels, north indicator and metre scale. Day mode uses a light map palette.
- Blue selection footprint/pin in 2D; translucent selected building shell, full edge outline and
  roof-anchored address pin in 3D. Brief selection/panel animation respects Reduce Motion and
  the 3D renderer stops requesting frames after the 650 ms acknowledgement. No new dependency.
- An SVG fallback when WebGL cannot initialise or its context is lost. Both views read one fixture.
- Persistent visible attribution and a link to the source-derived dataset under ODbL.

This is a fixed development sample. It does **not** yet stream neighboring map chunks, request GPS,
provide city search, or animate traffic. A tested adapter now provides real polygons and explicit
block adjacency to the simulation. The legacy lattice renderers are never given this campaign.
Touch layout is implemented, but physical iPhone rendering/performance still needs a device pass.

## Data and reproduction

`public/data/lower-east-side.json` is a transformed OpenStreetMap dataset, © OpenStreetMap
contributors, licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
It retains stable OSM source IDs. `source.retrievedAt` records retrieval; `source.timestamp` is
`unknown` when the OSM map endpoint does not provide a snapshot timestamp. A tagged height is not
a guarantee of a survey. Missing address data stays unnamed, without substituting a real business.

The saved fixture makes first load independent of public map-server availability. It is a separate
same-origin download, loaded only on the preview route. Do not make every player's startup fetch
this area from OSM/Overpass. Production streaming needs a provider and a cache strategy of its own.

Rebuild explicitly from the official OSM map endpoint (Python standard library):

```sh
python3 scripts/fetch-real-city.py /tmp/les-osm.json
npx vite-node scripts/import-real-city.ts -- /tmp/les-osm.json
```

The TS importer also accepts Overpass `out geom` JSON with `elements`, using the same bounding box.
Review a changed fixture as a data update: addresses and shapes can change upstream. The fixture
is geography only and must not silently rewrite a saved game's entity identities.

## Playable slice and persistence

`remake/sim/realCity.ts` polygonizes streets at shared source coordinates. Bounded faces with at
least two footprints are candidates; the largest connected component using shared boundary edges
is playable. In this fixture that is **24 blocks, four fictional wards, 39 seeded businesses**.
Disconnected faces remain scenery; no nearest-neighbor links or fictional bridges are invented.
Wards divide the component east-to-west into balanced groups of at least six blocks, matching the
existing faction generator's minimum. They do not represent actual administrative/crime districts.
This compact slice has denser faction occupation than a normal generated campaign; its long-term
balance is not the final real-city balance.

Stable OSM building IDs bind storefronts to real footprints. Businesses/owners are fictional. The
same reducer supplies visiting, chatting, protection, nightfall, events and end-day outcomes. The
place picker discovers playable locations without changing the thousands of decorative buildings.
Selecting inspects; Visit moves the player. The panel surfaces `can` reasons, scene costs/odds/risk,
current resources and recent activity. Other game management screens remain future work.

The lazily loaded panel uses its own IndexedDB database `rackets.real-city.save.v1`, not the shared
original/remake keys. Whole-world transactions are serialized; Saved appears only after commit.
Read errors stop opening rather than overwrite a potentially existing save. Bad format, simulation
version, geography fingerprint or broken essential place references block restoration and preserve
the record. The geometry fingerprint is independent of source array ordering. There is no idle
catch-up, migration into existing campaigns, automatic reset or cross-city travel UI.

Phone sheets collapse and scroll independently with a 48dvh cap, safe-area spacing, 44px controls,
a compact map rail, search keyboard clearance, and selected-building framing above the sheet in
both renderers. Attribution stays visible when the sheet is collapsed. Zoom buttons remain in
Appearance on phones alongside pinch zoom.

## Next milestones

1. Extend the place layer with clear storefront markers, player position, and the remaining
   management screens (crew, jobs, empire). Tune balance for this real block density.
2. Add adjacent-chunk loading and cross-boundary travel. Include low-connectivity
   behavior and avoid an all-city simulation tick for unloaded geography.
3. Measure on an iPhone: startup, memory, panning, selection, return from background and context
   recovery. Agree the frame/memory budgets from measurements before expanding asset complexity.

The sample is the proof area for an expandable city, not a change to the massive-city goal.

## Validation boundaries

Importer tests cover scale/orientation, unit parsing, height provenance, relation stitching,
courtyards and incomplete geometry. Renderer geometry tests check courtyard triangulation area.
The existing simulation soaks are regression gates; they do not exercise the new camera or GPU.
Real-neighborhood tests cover graph connectivity, shared boundary adjacency, stable identities,
footprint bindings, source reorder determinism, save validation and default generator equivalence.
`npx vite-node scripts/real-city-smoke.ts` runs travel/chat/protection/events/night/day and save
round-trips on the actual fixture; existing generated-world soaks cannot test this new path.
No existing simulation formula, default seed ordering or save version changes in this milestone.
