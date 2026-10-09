# Real-city remake: first build

## Accepted direction

Keep the scale and density of a major city. Real streets and building footprints supply the
geography; our renderer supplies the art direction; the Remake supplies fictional people,
businesses and simulation. Use iOS dark-mode clarity: a mostly unobstructed map, compact floating
controls and contextual bottom sheets. Natural materials should remain readable under territory
overlays. Assets can become more detailed after the geographic scale and mobile budget are proven.

## This milestone

Open `/?preview=real-city`, or **Explore the New York map preview** on the Remake start screen.
This is an isolated, explorable geography/UI preview, **not a playable real-city campaign yet**.
It never imports the Remake store, changes generation order, or writes either game's save.

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
provide city search, animate traffic, assign fictional businesses, or run gameplay on real blocks.
It is deliberately separate from `City`/`Block`'s generated lattice until that migration has tests.
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

## Next milestone: one playable neighborhood

1. Introduce a geography source contract beside the generated lattice. Adapt real street faces
   into connected game blocks; retain a stable mapping from geographic IDs to simulation IDs.
2. Place seeded fictional businesses into real footprints. Keep decorative density independent of
   the number of simulated people, so an empty business slot does not erase a building.
3. Complete one real-block loop: select a place, meet an owner, perform an existing validated
   action, advance time and show the result at that location. Use existing dispatch/select logic.
4. Add adjacent-chunk loading, cross-boundary travel and save restoration. Include low-connectivity
   behavior and avoid an all-city simulation tick for unloaded geography.
5. Measure on an iPhone: startup, memory, panning, selection, return from background and context
   recovery. Agree the frame/memory budgets from measurements before expanding asset complexity.

The sample is the proof area for an expandable city, not a change to the massive-city goal.

## Validation boundaries

Importer tests cover scale/orientation, unit parsing, height provenance, relation stitching,
courtyards and incomplete geometry. Renderer geometry tests check courtyard triangulation area.
The existing simulation soaks are regression gates; they do not exercise the new camera or GPU.
No simulation mechanics, balance, seed ordering or save version changes belong in this milestone.
