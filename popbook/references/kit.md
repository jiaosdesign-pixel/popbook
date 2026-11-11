# The pop-up kit: what a moment JSON may place

Read from `book/kit/index.js` (the `KIT` map), every module in `book/kit/`, the moments in `examples/`, and `validateMoment` / `validatePanorama` in `book/book.js`. Defaults are quoted exactly as the builders code them (`s.x ?? 0.3` is written "default 0.3"). A parameter with no default is required: the builder reads it bare and a missing value gives `NaN` geometry or a thrown error. All lengths are book units (page width is `book.width`, 1.5 in every existing moment; page depth `book.depth`, 1.05). Angles in JSON are degrees.

## 1. How a moment composes

1. **Top-level fields the engine reads:** `id`, `place` (string, required), `date` ("YYYY-MM" or "YYYY-MM-DD", required), `caption` (string, required; your words or ""), `captionStatus`, `stamp`, `palette`, `book`, `ground`, `camera`, `light`, `pieces`, `cover.glimpse`, `tap`. `view` and `idle` are not read by any code (see section 4); keep them as notes.
2. **Two bindings.** Default (no `book.binding`): top-bound, the gutter runs left to right across the screen, the far page is the backdrop. Pieces are parallel walls (`wallFrame(page, x, u)`), platforms (`layerFrame`), V-folds (`vfold`) or prints (`pageFrame`). `book.binding: "side"`: a side-bound V-fold panorama, the gutter runs away from the reader; **only pieces with `panorama: true` in `KIT` are allowed** (`vfold-layer`, `v-box`, `deck-figure`, `fog-lever`, `sky-dial`, `layer-slider`, `vfold-wrap`, `layer-figure`, `layer-rider`, `layer-roller`, `string-lights-v`, `revolving-picture`, `bat-lever`, `coil-gull`, `shop-front`, `cafe-patio`, `billboard`, `castle`). Every shipped moment is side-bound.
3. **Top-bound frame.** `page` is `'near'` (toward the reader) or `'far'`. `x` runs along the gutter (negative left), `u` is the distance from the gutter onto that page (0 at the gutter, `book.depth` at the open edge), `h` is height off the page. **Fold-flat rule:** a standing wall lies down toward the open edge when the book shuts, so `u + h <= book.depth`. `validateMoment` checks it for `suspension-bridge` (`halfDepth`, `towerH + 0.01`), every `rows[]` entry (`u`, `h + (amp ?? 0.011)`), every `layers[]` entry that has `u` (`u`, `h ?? 0`), `moon` (`u`, `nightH + radius`), `sailboat` (`u`, `0.15 * scale`; the boat must sit inside its slot and the slot stay 0.06 inside the page), `skyline` (`u`, 0.27). Pieces it does not check (`vfold-hill`, `pumpkin-patch` bales, `string-lights` posts, `grass-tufts`): keep them to the same rule by hand.
4. **Side-bound frame.** A layer is a V-fold glued across the gutter with its crease at `x0` along the gutter: the **reader's edge is `x = -W/2`**, so a smaller `x0` is nearer the reader and a larger `x0` is further back (Golden Gate: `back` 0.36, `bridge` -0.18, `bay` -0.36, `swell` -0.52). Pieces on a layer are authored in **front view**: `x` along the layer (`x <= 0` is the left half, on the far page; `x >= 0` the right half, on the near page), `y` up, `z` toward the reader. Each layer declares `reach: [left, right]` (how far each half runs from the crease along the hinge, both must be > 0) and `height: [left, right]`. All layers that overlap in `x0`-span must share `theta` (hinge angle, default `book.vTheta`, 105) and `gamma` (corner angle, default `book.vGamma`, 90), and `gamma >= min(theta, 180 - theta)`. `validatePanorama` folds every declared layer flat (`vlayerFootprint`) and rejects anything that leaves the `W x D` page; the error names the half and how far it reached. Slots and tab strips (`{page, u0, u1, x0, x1}`) must stay on one page: `u0 > 0.005`, `u1 <= D`, `x0 >= -W/2 - 0.12`, `x1 <= W/2`.
5. **`role`.** Only two values do anything: `"ground"` and `"sky"` take the piece out of the story count. **`STORY_LIMIT = 6`**: every piece whose `role` is not ground or sky, except kit `walker`, counts; more than six is rejected ("Cut the weakest one"). `"hero"` is a label only (it still counts). Nothing else reads `role`.
6. **`on`.** The id of a host piece; the builder reads `ctx.pieces[on].mount`. Side-bound mounts: `vfold-layer` and `vfold-wrap` expose `mount.frames` (and `vfold-wrap` also `mount.layers[]`, sorted by `x0` descending, picked with `layer: <index>`), `v-box` exposes its front elevation. Top-bound: `suspension-bridge` exposes `mount.deckH / halfDepth / walkS / deckFrom / deckTo / truss` for `walker` and `deck-traffic`. A piece built before its host throws, so list hosts first.
7. **`book`:** `binding`, `width`, `depth`, `nearPages`, `farPages`, `restAngle` (opening angle at rest, default 150; the moments use 180), `vTheta` (105), `vGamma` (90), `ribbon` (optional bookmark). Cover board colour, page core and the spine stripes come from `palette.cover`, `palette.core`, `palette.stripes`; the cover window's fill from `palette.ocean`. Title and author come from the host page, not the moment.
8. **`camera`:** `yaw` (default -14; the moments use 90 for side-bound), `elevation` (27; moments 22), `fov` (32; moments 30), `frame` (fraction of the canvas the open book fills, 0.8), `lightYaw` (side-bound only, direction of the key light, default -14), `shutElevation` (44). **`light`:** a new moment copies the house block (`book/house.json`, which `new.mjs` writes in) and never edits it (SKILL.md, the bar); day is the studio light for every page (`STUDIO` in `book/engine/sky.js`), night is moonlight; the fields: `pool` (lamp pool strength, 1), `poolAt` (`[x, y, z]`, default `[-0.05, 0.4, 0.26]`), `shadowRadius` (side default 14), `shadowIntensity` (side default 0.6). **`cover.glimpse`:** not needed for a new moment (the closed cover is not shown in a popbook page); the field aims the live still when that option is off: `from` (default `[-2.6, 0.62, 0]`), `at` (`[0.1, 0.36, 0]`), `fov` (22), in book-root coordinates: x runs along the gutter, negative toward the reader (the camera sits at x about -2.4 looking back into the book), y is up, z runs across the gutter, negative toward the left (far) page (bay-trail aims at z -0.3, where its rider is). `fog-lever` parts are hidden in it. **`tap`:** `{ on: [pieceIds], do: "pieceId.action" }` turns a click on those pieces' targets into a call of that piece's `actions[action]`, instead of opening the moment.
9. **`ground.preset`:** `KIT['ground:' + preset].print` paints both pages; no preset (or an unknown one) falls back to `bayPrint` in `book/kit/ground.js`. Each printer reads its own `ground` fields (section 2, "Ground printers"). Any preset also takes `ground.nightDim` (0 to 1, off): the printed pages darken by that much at night, following the lamps, so a pale ground printed for day sits dark under the lamp pools; day is untouched (about 0.45 for a pale plaza).
10. **Interaction vocabulary.** A piece's `pokes` fire on click (hop, bell, bounce, roll); `drag` follows the pointer along a slot, a tab or a dial; `nudge()` is the engine's attention hint, run once after the book settles and once more after 45 s idle, on every piece that offers it (`fog-lever`, `sky-dial`, `revolving-picture`, `bat-lever`, `layer-rider` and `billboard` with a tab or `drag`). A piece with both a tap and a drag (`revolving-picture`): the engine grows a drag's unseen hit proxy to a fingertip (40 px) in all three axes, so it can swallow a tap target beside it; keep the proxy thin and put the tap target clearly in front of it, then test the tap and the drag separately. **Keys:** in the detail view the engine gives every piece with a poke or a drag one unseen button (no focus ring; the piece's own `hover` and `nudge()` are the cue), in piece order, between the caption and the day tabs. Enter or Space runs the poke (a piece with several takes them in turn); the arrow keys move a drag along its slot; a drag-only piece takes one long pull on Enter. Nothing to write in a piece for this, with two options: a drag that is a switch and not a slot (the sky dial) adds `step(dir)` (`dir` 1, -1, or 0 to flip), and the moment file gives each playable piece a `label` ("Sailboat", "Sun and moon"), which is what a screen reader says; without one it reads the piece id. `ctx.lamp(fn)` callbacks get `k` 0..1 as night comes on; `setLight(L)` gets the blended light state (`L.lamps`, `L.day`, `L.night`, `L.golden`, `L.keyColor`).

**What answers the reader** (from the builders; side-bound unless marked). Tap: `v-box` (through the moment's `tap`), `vfold-wrap` (its inner pieces' pokes: pumpkins, the jack-o'-lantern), `layer-rider` (the bell), `revolving-picture`, `coil-gull`, `shop-front` (the door), `cafe-patio` (the umbrella), `billboard` (a board with two or three faces turns; a face with `wave`, `look` or `blink` groups runs them instead), `castle` (lights its windows); top-bound only: `deck-traffic`, `pumpkin-patch`, `bike-rider`. Drag: `fog-lever`, `sky-dial`, `layer-slider`, `layer-rider` (its tab), `layer-roller`, `revolving-picture`, `bat-lever`, `shop-front` (its tab), `billboard` (its tab, or with `drag: true` the boards themselves), `castle` (its tab); top-bound only: `fog-bank`, `sailboat`. A scene with none of these in it needs a question to the sender or a new piece, never a prop they did not mention.

## 2. Piece catalogue

Format: **kit name**: what it is, what the reader can do. Binding. Parameters as `name` (type, default): meaning. Palette keys. Footprint (what the validator or `declare` sees). Example from a shipped moment where one exists. "Side" means the piece needs `book.binding: "side"`; "Top" means it is rejected there.

### Ground printers (one per moment, via `ground.preset`)

**default `bay` (no preset)**: water across both pages, land at each end, optional roads. Top only in practice. `ground.left`, `ground.right` (x where the SF / Marin land starts), `ground.leftBulge`, `ground.rightBulge` (default 0), `ground.ripples` (`{near: [[x, u, len]], far: [...]}`), `ground.roads` (near page only, `[[[x, u], ...], ...]`). Palette: `bay` (near water), `ocean` (far water), `landLeft`, `landRight`, `foam`, `road`, `roadLine`.

**`ground:gg-side`**: side-bound Golden Gate: the bay graded to ocean across the page width, SF on the far page, Marin on the near page, a road onto each. `ground.sf` (`[x0, u0]`, default `[-0.75, 0.78]`), `ground.marin` (`[-0.5, 0.78]`), `ground.roads` (`{near: [[x, u], ...], far: [...]}`, optional). Palette: `bay`, `ocean`, `foam`, `landLeft`, `landRight`, `road`, `roadLine`. Water mask: everything that is not land. Example: `golden-gate.json` `ground`.

**`ground:filoli-side`**: golden field with grass strokes, a mown path from the reader's edge toward the arch straddling the gutter, a stone forecourt at x 0.12..0.32, two hedge bands at x 0.36..0.72. `ground.path` (width factor, default 0.11). Palette: `field`, `fieldPatch` (falls back to `fieldDark`), `fieldLight`, `fieldDark`, `tuft` (falls back to `fieldDark`), `path`, `stone`, `hedge`. No water mask. Example: `filoli-halloween.json`: `{"preset": "filoli-side", "path": 0.1}`.

**`ground:baytrail-side`**: the bay behind a shore line at `x = shore`, wet sand and golden grass in front, an asphalt trail with dashed centre line running across both pages. `ground.shore` (x of the waterline, default 0.02), `ground.trail` (`{x, w, bend}`, default `{x: -0.3, w: 0.12, bend: 0.06}`). Palette: `ocean`, `foam`, `wetSand` (falls back to `shoulder`), `grass`, `grassDark`, `grassLight`, `tuft`, `shoulder`, `asphalt`, `trailLine`. Water mask: `x > shore + 0.02`. The asphalt spans `trail.x ± trail.w/2` along the gutter: a `layer-rider` belongs on a layer at `x0 = trail.x + trail.w/2` carrying only low grass, so she rides on the trail with the asphalt in front of her wheels. Example: `bay-trail.json`: `{"preset": "baytrail-side", "shore": -0.02, "trail": {"x": -0.27, "w": 0.13, "bend": 0.04}}`.

**`ground:filoli`** (Top): field, mown path up the near page to the arch, straw at the arch feet, gravel forecourt and hedges on the far page. Reads nothing from `ground`. Palette: `field`, `fieldPatch`, `fieldLight`, `fieldDark`, `path`, `straw`, `hedge`.

**`ground:baytrail`** (Top): ocean on the far page; bay, wet sand, grass, the curving trail with two belt slots on the near page. `ground.trail` (`{u0, bend, tilt, width, lane, x0, x1}`, all required: trail centre `u = u0 + bend*x^2 + tilt*x`, lane offset of the belt slots, slot extent), `ground.shore` (`{u, amp}`, required). Palette: `ocean`, `foam`, `bay`, `wetSand`, `grass`, `grassPatch`, `grassLight`, `grassDark`, `shoulder`, `shoulderDark`, `asphalt`, `trailLine`. Water mask: the far page and the water side of the shore line.

### Side-bound panorama layers (`panorama: true`)

**`vfold-layer`**: a V-fold across the gutter made of printed bands (waves, hills, grass, flat strip, city skyline) laminated one behind another, with small glued cards (sailboat, hay bale, pumpkin, jack-o'-lantern). Static; city windows and lanterns glow at night. Side. Host for `fog-lever`, `sky-dial`, `layer-slider`, `layer-figure`, `layer-rider`, `layer-roller`, `revolving-picture`, `bat-lever`, `coil-gull`, `string-lights-v` posts.
- `x0` (number, required): crease position along the gutter.
- `theta`, `gamma` (deg, default `book.vTheta` 105 / `book.vGamma` 90).
- `reach` (`[left, right]`, default `[0, 0]` in the declaration, `[0.9, 0.9]` for the foot shade): **always set it**, and at least as far as the bands run. A half with no bands still needs a value; 0.05 is enough.
- `bands` (array): each `kind` (`'waves' | 'hills' | 'grass' | 'city'`, anything else is a flat strip of height `h`), `from`, `to` (required, front-view x; negative is the far-page half), `h` (0.05; for city the base strip, 0.03), `amp` (waves default **0**, grass 0.02), `len` (0.3), `phase` (0), `seed` (1), `color` (default `palette.bay`), `colorB` (hills: a second tone washed over the lower 70%; grass: base of the gradient, default `grassDark`), `colorC` (grass tip, default `grassLight`), `peaks` (hills: `[[x, peakHeight, halfWidth], ...]`), `blocks` (city: `[[x, w, h, kind?]]`, kind `'spike'` or `'stepped'`), `z` (lamination offset, default `-index * 0.0042`), `glow` (emissive intensity for non-city bands, a constant: it is not scaled down at night, so 0.08 to 0.15 keeps far haze pale under a low sun while 0.4 turns hills white after dark; no shipped moment uses it). City windows glow with a hard-coded warm emissive and read no palette key.
- `cards` (array): `kind: 'sailboat'` `{x, y, h: 0.12}`; `'bale'` `{x, y: 0, w: 0.16, h: 0.07, rot: 0, seed: 3}`; `'pumpkin'` `{x, y: 0, r: 0.04, color: palette key or hex (default pumpkin), rot: 0}`; `'lantern'` `{x, y: 0, r: 0.024}` (glows at night).
- `footShade` (0.05), `footStrength` (0.22): contact shade at the feet.
- Palette: `bay`, `foam`, `grassDark`, `grassLight`, `hay`, `strawLight`, `hayDark`, `twine`, `hull`, `sail`, `sail2`, `mast`, `pumpkin`, `pumpkinDeep`, `pumpkinYellow`, `pumpkinWhite`, `pumpkinRib`, `stem`, `jackInner`, `jackGlow`.
- Footprint: one layer at `x0`, `reach` as given; height per half = max over bands (waves `h + amp`; hills `max(h, peaks) + 0.008`; grass `h + amp + 0.002`; city tallest block) and cards (`y + (h ?? r*1.8 ?? 0.08)`).
- Example (`bay-trail.json` "water"): `{"id": "water", "kit": "vfold-layer", "role": "ground", "x0": 0.26, "reach": [0.96, 0.96], "bands": [{"kind": "waves", "from": -0.96, "to": 0.96, "h": 0.05, "amp": 0.008, "len": 0.26, "phase": 0.5, "color": "#375975", "z": 0}]}`. Hills with two tones and a city strip: `golden-gate.json` "back" and "bay". Cards: `filoli-halloween.json` "patch".

**`v-box`**: the Golden Gate as two parallel V-folds (front and back elevations with towers, cables, suspenders, lamp posts, red beacons) joined by platforms (deck, tower struts, caps), anchorages with slack side-span threads, folded-box cars on hidden belts. Poke a car: it hops. Night: tower flood, lamps, beacons, car lights. Side. Host for `deck-figure`.
- `x0` (required), `theta`, `gamma`; `depth` (0.12, front to back elevation); `towerX` (0.44), `towerH` (0.78), `deckH` (0.22); `reach` (`[0.86, 0.86]`).
- `towers` (true): `false` makes a plain viaduct: the deck, its railing lamps, plain piers under the deck and the cars, with no towers, cables, beacons, anchorages or night floodlight; its declared height drops to the railing (`deckH + 0.061`). `carScale` (1): size of the cars.
- `cars` (array, optional): `lane` (0..1 across `depth`, default 0.5), `dir` (1 = from the far-page end across to the near page, -1 = the reverse; anything not -1 is 1), `at` (phase 0..1, default 0), `color` (required hex). `traffic.speed` (0.045 units/s).
- Palette: `bridge`, `bridgeDark`, `pier`, `cable`, `lamp`, `road`, `walk`, `roadLine`, `glass`.
- Footprint: two layers, at `x0` and `x0 + depth`, both `reach`, height `towerH + 0.02`.
- Example: `golden-gate.json` "bridge" (`x0 -0.18, depth 0.12, towerX 0.44, towerH 0.78, deckH 0.22, reach [0.86, 0.86]`, four cars).

**`deck-figure`**: The figure facing the reader, glued behind the front railing of a `v-box` on a spacer card, forearm raised in a still wave. Static. Side.
- `on` (a `v-box`), `x` (-0.16; sign picks the half), `height` (0.17), `wave` (forearm angle in radians, 0.12), `behind` (0.03, spacer depth).
- Palette: `figure.*` (`coat, coatBack, legs, legsBack, shoes, skin, hair, scarf, cheek`), `bridgeDark` (spacer).
- Footprint: declares only `on`; her height must fit inside the host's declared height.
- Example: `golden-gate.json` "me": `{"on": "bridge", "x": -0.16, "height": 0.19, "behind": 0.03}`.

**`fog-lever`**: a pull-tab at the reader's edge of the near page drives a parallelogram linkage: a printed vellum fog card rises level over a layer's ridge; its pin shows in an arc slot, a rivet beside it. Drag the tab (springs back when let go). Nudged. Hidden in the cover glimpse. Side; right half only.
- `on` (a `vfold-layer`), `x0` (same as the host's).
- Card: `span` (`[x0, x1]`, default `[0.22, 0.92]`), `top` (0.3, y of the top when fully pulled), `thick` (0.1), `tongue` (0, how far the left end dips to pour through), `color` (crest, `'#E4EAF0'`), `under` (`'#AEBBC8'`), `opacity` (0.97), `z` (-0.0095, behind the host's bands), `restTop` (0.3, declared height at rest).
- Linkage: `pin` (`[x, y]`, default `[0.62, 0.24]`), `R` (0.3), `pullA` (172 deg), `restA` (210 deg).
- Tab: `tab.u` (0.5), `tab.w` (0.06), `tab.out` (0.075, how far it sticks out), `tabColor` (default `palette.bridge`), `maxPull` (0.07).
- Palette: `sun` (pin and rivet), `bridge`, `core` (chevron).
- Footprint: layer at `x0`, reach `[0.01, span[1] + 0.04]`, height `[0.01, restTop]`; slot on the near page at `tab.u ± 0.03`.
- Actions: `pull(k)`, `release()`, `hover(on)`.
- Example: `golden-gate.json` "fog".

**`sky-dial`**: a volvelle riveted behind a layer, sun on the upper half, moon (real phase) on the lower. Drag it round: it previews and then commits Day / Night through the engine's sky hooks. Nudged. Side.
- `on`, `x0`, `center` (`[x, y]`, default `[-0.55, 0.15]`; sign of x picks the half), `r` (0.14), `behind` (0.0125), `day` (`'#CCDCE7'`), `night` (`'#2C3B57'`), `teeth` (96).
- Palette: `sun`, `moon`, `moonShadow`.
- Footprint: reach `|cx| + r` on its side, height `cy + r`. Give it `role: "sky"`. On a layer at `x0` the dial must fold flat with its host: keep `cy + r <= (W/2 - x0) / sin(theta)` (at `x0` 0.46 that is 0.30; at 0.52, 0.24).
- Example: `bay-trail.json` "sky": `{"on": "farshore", "x0": 0.46, "center": [-0.7, 0.12], "r": 0.13}`.

**`layer-slider`**: a sailboat card riding a slit along one half of a layer; slow drift (sin 0.22 rad/s), the reader can drag it. Side.
- `on`, `slot` (`[a, b]`, default `[0.12, 0.8]`; sign picks the half), `at` (start, default slot midpoint), `y` (0.035, slit height), `h` (0.12, boat height), `drift` (0.06).
- Palette: `hull`, `sail`, `sail2`, `mast`.
- Footprint: slot only (on the page of its half, `u` from `min|a,b| * sin theta` to `max * sin theta`); its height must fit inside the host's.
- Example: `golden-gate.json` "boat": `{"on": "bay", "x0": -0.36, "slot": [0.14, 0.84], "at": 0.46, "y": 0.035, "h": 0.12, "drift": 0.07}`.

**`vfold-wrap`**: wraps one or several top-bound wall pieces (`estate`, `pumpkin-arch`, `far-shore`, `shore-rocks`, `shrub-bank`, `trail-post`, `trail-lamps`) into V-fold layers: every wall at the same distance becomes one layer at `x0` (far-page `u` becomes `x0 = +u`, near-page `u` becomes `x0 = -u`), split at the crease; a half with nothing on it gets a low ground-coloured tie strip. Interaction and idle come from the inner pieces (far-shore town lights, lamp glow). Side. Host for layer pieces via `mount.layers[]`.
- `inner` (object or array): `{kit: <one of the seven>, ...that kit's parameters}`. The inner piece's `page`/`u` decide the layer.
- `fold` (array, required): one `{x0, reach: [L, R], height: [L, R]}` per layer that will be created; the build throws if no entry matches a layer's `x0` (within 0.002) or if the real geometry exceeds the declaration by more than 0.012. Trees that run `x0 -0.95..0.95` need `reach [0.96, 0.96]`.
- `tie` (colour, default `palette.grass`, else `landLeft`), `tieReach` (0.12), `footStrength` (0.22).
- `pools` (array, for lamps): `x` (signed hinge distance from the crease; `< 0` is the far page), `x0`, `w` (0.28), `d` (0.22), `toward` (0.06); `poolStrength` (0.45). Inner pieces' own page pools are dropped.
- `theta`, `gamma`. Palette: the inner piece's keys, plus `lamp` for pools.
- Footprint: exactly the `fold` list. `mount.layers` is sorted by `x0` descending (index 0 is the furthest back).
- Example: `bay-trail.json` "lamps" wraps `trail-lamps` and `trail-post` on the near page at `u 0.34` into one layer `x0 -0.34` with `reach [0.13, 0.53]`, `height [0.01, 0.28]` and two pools; `filoli-halloween.json` "trees" / "house" / "arch"; `bay-trail.json` "rocks", "shrubs". A post on the far page works the same way mirrored: `trail-post` with `page: "far"`, `x: -0.62`, `layers: [{u: 0.06, h: 0.2}]` lands on the left half of a layer at `x0 +0.06` (dry run).

**`layer-figure`**: The figure facing the reader, standing a step behind a layer; her forearm waves on a brad every few seconds (idle). No spacer card: she usually stands in the layer's opening (an arch, a doorway), where a spacer shows as a box on her chest. Side.
- `on`, `layer` (index into a `vfold-wrap`'s layers, default 0), `x` (-0.1), `y` (0), `height` (0.18), `behind` (0.03, how far behind the layer she stands), `every` (wave period in s, 7.5).
- Palette: `figure.*` including `cheek`. Optional on every front-facing figure: `figure.bow` (a bow headband, with `figure.bowDot` polka dots) and `figure.bag` (a shoulder bag at her side, `figure.bagLight` prints a check on it); leave them out and she is unchanged.
- Footprint: declares only `on`; fit her inside the host layer's height.
- Example: `filoli-halloween.json` "me": `{"on": "arch", "layer": 1, "x": -0.1, "height": 0.18, "behind": 0.035}`.

**`layer-rider`**: A rider on a bike in a slit along one half of a layer: rides back and forth on her own (the card flips at each end; wheels spin, legs pedal on two-bone IK, scarf and ponytail move), a pull-tab at the reader's edge lets the reader drive her (no spring-back). Poke: she rings the bell (hop, two ring marks). Night: headlight, tail light, beam. Nudged when it has a tab. Side.
- `on`, `layer`, `x0` (optional; when present it declares its own layer: reach `max(|a|, |b|) + 0.1`, height `h`), `slot` (`[a, b]`, default `[-0.8, -0.15]`), `at` (0.3, fraction of the out-and-back loop), `scale` (1.5), `speed` (0.04), `y` (0.004), `z` (0.008), `h` (0.3, declared height).
- `tab` (optional object): `page` (default far if the slot is on the left), `u` (0.5), `w` (0.06), `out` (0.075), `maxPull` (0.07), `color` (default `bike.frame`).
- Palette: `bike.*` (`frame, tire, rim, spoke, hub, crank, guard, saddle, basket, basketDark, bell, helmet, helmetStripe`), `figure.*`, `ringMark` (default `#FAF9F5`).
- Footprint: slit slot on its page; tab slot at `tab.u ± 0.03`.
- Actions: `ring()`, `take(k)`.
- Example: `bay-trail.json` "me": `{"on": "edge", "x0": -0.19, "slot": [-0.86, -0.08], "at": 0.25, "scale": 2.1, "speed": 0.045, "h": 0.36, "tab": {"page": "far", "u": 0.62, "color": "#A44732", "maxPull": 0.07}}`.

**`layer-roller`**: a pumpkin rolling slowly along a slit on one half of a layer (idle sine, 0.25 rad/s); drag it to roll it. Side.
- `on`, `layer`, `x0` (optional, declares as above), `slot` (`[0.15, 0.6]`), `r` (0.034), `y` (0.004), `at` (slot midpoint), `color` (palette key or hex, default `pumpkin`), `drift` (0.12, clamped to the slot), `h` (0.3).
- Palette: `pumpkin*`, `pumpkinRib`, `stem`.
- Example: `filoli-halloween.json` "roller": `{"on": "patch", "x0": -0.26, "slot": [0.2, 0.62], "r": 0.034, "color": "pumpkin", "drift": 0.12, "role": "ground"}`.

**`string-lights-v`**: posts standing on layers, joined by fixed-length threads (slack when shut, strung when open) carrying bulbs; twinkle at night. Side.
- `posts` (array): `on`, `layer`, `x` (sign picks the half), `h`, `z` (0.006).
- `strings` (array): `from`, `to` (post indexes), `bulbs` (**required**, no default), `sag` (0.06).
- Palette: `wood`, `woodDark`, `wire`, `bulb`, `bulbGlow`.
- Footprint: declares only `on` of the first post; posts must fit their hosts' heights.
- Example: `filoli-halloween.json` "lights" (four posts on "patch" and "trees", three strings of 8 / 12 / 8 bulbs).

**`revolving-picture`**: a Nister revolving picture on a layer: a plain pumpkin cut into sectors over a carved jack-o'-lantern; tap the wheel and it spins two turns and lands on the other picture, or pull the rim tab and the sectors narrow to reveal the face (glows at night once turned). A tap and a drag in one piece. Under reduced motion the tap changes the picture without the spin. Nudged. Side.
- `on`, `layer`, `x0`, `at` (`[x, y]`, default `[-0.5, 0.15]`), `r` (0.07), `sectors` (8), `z` (0.004), `frame` (colour, default `wood`), `tabColor` (default `pumpkinDeep`), `spin` (seconds one tap's spin takes, 1.5). Tab travel is fixed at 0.05.
- Palette: `pumpkin`, `pumpkinRib`, `wood`, `woodDark`, `pumpkinDeep`, `jackInner`, `jackGlow`, `stem`.
- Footprint: reach `|x| + r + 0.08`, height `y + r`.
- Actions: `turn(k)`, `spin()`.
- Example: `filoli-halloween.json` "jack": `{"on": "patch", "x0": -0.26, "at": [-0.575, 0.21], "r": 0.068}`.

**`bat-lever`**: a pull-tab at the reader's edge (far page by default) raises bats on wire arms behind a layer; the second starts a beat later (lost motion); they flap while raised; optional automatic raise at night. Nudged. Side.
- `on`, `layer`, `x0`, `lag` (0.35), `nightUp` (0; fraction raised at night without the tab).
- `tab`: `page` (`'far'`), `u` (0.5), `w`, `out`, `maxPull` (0.07), `color` (default `bat`).
- `bats` (array): `x`, `hidden` (required, rest y), `raised` (required), `size` (1.2), `behind` (0.012).
- Palette: `bat`, `batEdge`, `wire`.
- Footprint: reach from the bats' `|x| + 0.06` per side, height `max(hidden) + 0.03` both sides; tab slot.
- Example: `filoli-halloween.json` "bats".

**`coil-gull`**: a paper gull on a zigzag paper coil spring on a layer: bobs and flaps (idle); tap it and it bounces on a damped spring. Side.
- `on`, `layer`, `x0`, `x` (0.3), `h` (0.16), `scale` (2), `z` (-0.004).
- Palette: `gullWing`, `gullBody`, `gullBeak`, `gullTip`, `signWhite` (the coil).
- Footprint: reach `|x| + 0.06`, height `h + 0.04`.
- Example: `bay-trail.json` "gull": `{"on": "water", "x0": 0.26, "x": 0.45, "h": 0.2, "scale": 2.4}`.

**`shop-front`** (`book/kit/cafe.js`): a café front as a V-fold layer: a stone pier, a stucco sign band with a cup sign, tall storefront glass whose room lights warm at night, and a glass double door split from the wall on brads. A pull-tab at the reader's edge (`tab: { page, u }`) swings both leaves open on the figure in the doorway lifting her cup; a tap on the door does the same. On its own: vellum steam rises off the cup sign (it glows warm at night), and she lifts her cup every eight seconds or so. Params: `x0`, `reach` `[left, right]`, `h`, `door`, `doorH`; `steam: false`, `steamRise`, `steamH`, `wisps`, `sip: false` for the loops (the steam counts in the layer's fold-flat height). Palette: `steam` (optional). Side. Example: `cafe`.

**`billboard`** (`book/kit/billboard.js`): boards on posts as one V-fold layer, each cut into vertical tri-vision louvers on rods in front of a dark backing. A board with two or three `faces` turns to its next face louver by louver. Three ways to turn them: a tap on a board turns it (when its showing face has no moves); the optional pull-tab at the reader's edge (`tab: { page, u, color }`) turns every board with it, and letting go past half way finishes the turn; or `drag: true` puts the drag on the boards themselves (no tab, and `tab` is then ignored): drag across any board and every board with faces turns with the finger, the louvers following one after another from the side the stroke starts (a stroke either way turns them; a full turn is a stroke across about `dragSpan` (0.7) of the board); let go past half way and they finish, short of it they fall back. With `drag`, the boards are a set: give each board its faces in the same order (face 1 of every board is one pair, face 2 the next) and they always switch together; the arrow keys on the piece's key button drive the same drag and Enter makes every showing face run its moves; a press that never moves is a tap on that board; a face with no moves answers a tap with a small lean of its louvers (the drag hint, which also runs after the book settles). On their own: the boards turn every `every` seconds (7; `0` holds them still, which is what a drag page wants), each on its own `phase`. At night gooseneck lamps on the catwalk light the faces. A board with one face is a plain sign that never turns (one ad per board: give every board one face, leave out `tab`): give it `truss: true` and it hangs on a lattice beam between two posts (an overhead road sign). `screen: true` makes a board a lit screen (an LED billboard): it gives its own neutral light at night, shows no paper grain or shade on its face, and has no catwalk or lamps unless you ask for them. A group in a face's artwork can move now and then: `wave` rocks it about a pivot (a figure's hand on a screen ad), `look` slides it to one side and back (a pair of eyes looking round: put both eyes in one group), `blink` squashes it shut for a moment about a pivot line (the same eye group). Each move runs every `every` seconds give or take a third, so groups with the same numbers drift apart; give each group its own `every` and `phase` as well so a row of faces never moves in step. Only the face showing moves (nothing while a board turns), and a tap on its board runs all of that face's moves at once instead of turning. Under reduced motion nothing moves on its own; a tap tips a `wave` group or holds a `look` group at its first direction (the next tap sets it back), `blink` does nothing, and a drag still switches. A board with moves is tappable even with one face. The piece draws no picture of its own: every face comes from the moment. Params: `x0`, `reach` (optional, worked out from the boards), `every` (`0` for one-face boards and drag pages), `turn` (seconds per turn, 1.8), `stagger` (0.55), `drag` (false), `dragSpan` (0.7), `lit` (night strength, 0.9), `dayGlow` (0.12), `z`; `boards[]`: `x` (`[a, b]`, both on one half), `y` (`[bottom, top]`), `faces` (1 to 3; every face is drawn on the board's own aspect, so lay each one out for the board: `view` `[1000, 1000 * height / width]`), `start` (face shown first), `phase`, `louvers` (14), `posts` (a count or a list of x), `postW`, `postTop` (y of the post tops; default 70% up the board, so a list of one x beside the board with `postTop` above it makes a column), `postColor`, `truss`, `frame: false`, `catwalk` (true / false), `lamps` (count), `glow` (lamp halo size, 0.07), `lit`, `dayGlow`, `screen`. A face: `bg`, `bg2` (a top-to-bottom wash), `view` (`[w, h]`, the drawing's own units, y down; default 1000 wide at the board's aspect) and `items`, drawn in order: `{text, x, y, size, weight, color, align, tracking, maxWidth}` (`maxWidth` squeezes a line wider than that, so a layout holds whatever the reader's system font is), `{path: "<SVG path data>", x, y, scale, rot, color, stroke, lineWidth}`, `{shape: "rect" | "ellipse" | "circle", x, y, w, h, r, rx, ry, color, stroke}`, `{group: [items], x, y, scale, rot, wave, look, blink}`. Moves (seconds; lengths in the group's units): `wave`: `{pivot: [x, y]` (0, 0), `angle` (degrees each way, 16), `swings` (2), `dur` (1.6), `every` (6; `0` = only on a tap), `phase` (2)`}`; `look`: `{dirs: [[dx, dy], ...]` (where it looks, one picked each time, never the same twice running; default `[[-10, 0], [10, 0], [0, -8]]`), `move` (0.22, each way), `hold` (0.9), `every` (5), `phase` (1.5)`}`; `blink`: `{pivot: [x, y]` (0, 0, the line it closes on), `dur` (0.2), `every` (4), `phase` (0.8)`}`. Keep moves short and gentle with rest between, never constant; with many groups on one face, space them out (`every` 10 or more for `look`), since together they add up. Actions: `turn(i)`, `flip()` (every board to its next face), `pull(k)`, `react(i)`, `wave(i)`. Palette: `billboardPost`, `billboardFrame`, `billboardBack`, `billboardRail` (all optional), `lamp`, `grass` (the footing strip). Footprint: one layer at `x0`, reach from the boards and posts, height from the board tops. Side. Example: two roadside boards with `drag`, each with two faces (a pair of ads, then the next pair).

**`cafe-patio`** (`book/kit/cafe.js`): a patio layer in front of a shop: an umbrella, a table and two chairs on one half, a young tree in a planter on the other (`umbrella`, `tree`: positions along the layer). Tap the umbrella and the canopy spins about a turn and settles. On its own: the tree's crown sways in a light breeze (`breeze: false` holds it still). Reach and height are worked out from those positions. Side. Example: `cafe`.

**`castle`** (`book/kit/castle.js`): a generic fairy-tale castle as two V-fold layers a step apart: in front the curtain wall and gatehouse (battlements, a round-headed gate) with round towers; behind, the keep with a slate roof and its tallest spire. Pastel walls printed as stone and shaded as cylinders, cone roofs with shingles and a gold band, gold finials, pennants on poles. A pull-tab at the reader's edge raises the portcullis and swings the gate's two leaves open on a warm courtyard card. Tap the castle: the windows light in a wave from the gate upward and the pennants snap in a gust. On its own: the pennants flutter (three hinged paper segments each). Night: lit windows, a soft glow on the walls (or, with `uplight`, floodlights from below), light from the gate and a pool in front of it. Side.
- `x0` (0, the front layer's crease), `depth` (0.09, the keep's layer sits at `x0 + depth`), `theta`, `gamma`.
- Front: `wallW` (0.36), `wallH` (0.15), `gateW` (0.072), `gateH` (0.105), `gateHouseW` (0.16), `gateHouseH` (0.22), `towers` (default four: outer towers at ±0.4 with flags, gate turrets at ±0.105). Back: `keepW` (0.34), `keepH` (0.3), `keepRoof` (0.11), `keepTowers` (default five: the central spire, body 0.44 + cone 0.16, flanked at ±0.165 and ±0.27). A tower is `{x, w, h, roof, tone: 'wall'|'stone', roofTone: 'roof'|'roofAlt', flag, flagL, flagH, z}`; pennants fly toward +x.
- `tab` (`{page: 'near', u: 0.5, color}`), `swing` (1.25, how far the leaves open), `flood` (0.3, the walls' flat warm night glow), `footStrength`.
- `uplight` (off): night floodlighting instead of the flat `flood` glow, for a castle lit like a park at night. The walls are washed in `color` (`#8C8CF2`, a cool blue-violet) from the foot up, falling to `fall` (0.4) at the top and dimmer toward the outer towers, with a warm `core` (`#FFB89A`) glowing on the tallest keep tower (radius `coreR`, 0.16) and a little round the gate; `strength` (0.8) is the glow at full night, `dim` (0.35) how far the moonlit paper darkens so the floodlight carries the colour. Day is untouched; the change follows the lamps, so it fades with the theme. Example: `{"color": "#8794F0", "core": "#FFB89A", "fall": 0.4, "strength": 0.65, "dim": 0.4}`.
- Palette (all optional, with fallbacks): `castleWall`, `castleStone`, `castleRoof`, `castleRoofAlt`, `castleGold`, `castleGlass`, `castleDoor`, `castleTrim`, `castleIron`, `castleCourt`, `castleFlood`, `flag`, `flagAlt`, `lamp`.
- Footprint: two layers, `wall` at `x0` and `keep` at `x0 + depth`, reach and height worked out from the towers and flags (the default keep stands 0.67 with its flag: at `depth` 0.09 the front crease can sit at `x0` 0 but not much further back); the tab's slot.
- Actions: `open(k)`, `sparkle()`. Mount: `layers` (keep first), so a `sky-dial` or `layer-figure` can stand on it.

**`ground: cafe-side`** (`ground.preset`): a sidewalk with scored joints, a kerb at `kerb` and the parking lot at the reader's edge, a mulch bed behind the wall at `wall`. Example: `cafe`.

### Top-bound: Golden Gate set

**`suspension-bridge`**: a floating box across the gutter: two elevation cards (walls at `± halfDepth`), deck platform creased over the gutter, tower struts and caps, anchorages with slack threads, lamps and beacons at night. Static (hero). Top. Host for `walker` and `deck-traffic`.
- `towerX` (0.46), `towerH` (0.66), `deckH` (0.2), `halfDepth` (0.065), `from` (-0.82), `to` (0.74), `anchorOffset` (0.05).
- Palette: `bridge`, `bridgeDark`, `pier`, `cable`, `lamp`, `road`, `walk`, `roadLine`.
- Footprint: `halfDepth + towerH + 0.01 <= depth`.

**`walker`**: a tiny layered paper person standing on a host's walkway. Poses `walk`, `stand`, `wave`. Static; never counts toward the story limit. Top.
- `on` (a `suspension-bridge`), `pose` (`'walk'`), `height` (0.09), `x` (0), `flip` (false; faces +x unless flipped).
- Palette: `figure.*` (no cheek).

**`deck-traffic`**: 2 to 4 folded-box cars on a hidden belt inside a `suspension-bridge` deck, near lane one way and far lane the other, dipping into slots at the deck ends; lights at night; collapse flat as the deck folds. Poke a car: it hops. Top.
- `on` (must be a `suspension-bridge`), `cars` (array of 2..4): `lane` (`'near'` or `'far'`; anything not far is near), `color`, `at` (phase, 0), `lane_offset` (0.55 of `halfDepth`). `speed` (0.045), `returnRun` (0.45).
- Palette: `glass`, `lamp`.

**`wave-strips`**: parallel wavy water walls with a printed foam line. Static. Top.
- `rows` (array): `page` (`'near'`), `u`, `h` (0.05), `x0`, `x1`, `amp` (0.011), `len` (0.26), `phase` (0), `color` (default `palette.wave[i % wave.length]`).
- Palette: `wave` (array of hexes), `foam`. Footprint per row: `u + h + amp`.

**`vfold-hill`**: a V-fold hill straddling the gutter with a visible centre crease; soft bumps on the profile. Static. Top. Not fold-flat-checked.
- `x`, `theta` (38, hinge from +x), `elev` (50, crease elevation), `hinge` (0.4), `crease` (0.42), `bulge` (0.06), `bumps` (`[[t, amp]]`, default `[[0.3, 0.05], [0.7, 0.03]]`), `color` (default `hill`), `colorFar`; `near` / `far` objects may override `hinge`, `bulge`, `bumps`.

**`fog-bank`**: vellum puff walls on a slider; idle breath (about 30 s); tap action `roll` sends it in through the Gate and back over 7 s; a plain pull-tab at the far page's ocean edge drags it. Top.
- `layers` (array): `page` (`'far'`), `u`, `h`, `x0`, `x1`, `puff` (0.05), `color` (default `fog`), `opacity` (0.9). `roll` (0.55), `tabU` (0.44), `tabColor` (default `core`), `breath` (0.035).
- Palette: `fog`, `core`. Actions: `roll()`, `pin(v)`.

**`skyline`**: one or two parallel walls of buildings; windows light at night. Static. Top.
- `page` (`'near'`), `u`, `x0`, `layers` (default: a far Mist row with a pyramid and a lighter near row): each `du`, `dx`, `color`, `blocks` (`[[w, h, kind?]]`, kind `'stepped'` or `'pyramid'`).
- Palette: `skyline`, `skylineNear` (default `#DAD6CB`). Footprint: `u + 0.27`.

**`sailboat`**: folded-box hull and two sails standing in a slot cut through the page; idle drift with a spring settle; drag along the slot with paper resistance. Top.
- `page` (`'near'`), `x`, `u`, `scale` (1), `slot` (`[x - 0.3, x + 0.3]`).
- Palette: `hull`, `bridge` (stripe), `sail`, `sail2`, `mast`, `slot` (default `#1d2a36`). Footprint: `u + 0.15 * scale`; slot within the page.

**`moon`**: a paper moon on a slider strip: hidden behind a layer by day, rises at night; shows the real phase. Top. Role sky.
- `page` (`'far'`), `x`, `u`, `radius` (0.05), `hiddenH` (0.06), `nightH` (0.36).
- Palette: `fog` (strip), `moon`, `moonShadow`, `moonGlow`. Footprint: `u + nightH + radius`.

**`hill-layers`**: parallel hill walls with soft asymmetric silhouettes. Static. Top.
- `layers`: `page` (`'far'`), `u`, `x0`, `x1`, `h`, `peak` (0.5), `seed` (i + 1), `sharp` (1.4), `color` (default `hill`).

### Top-bound: Filoli set (wrap-able ones marked W)

**`grass-tufts`**: dry grass blade cards pinned at the base, a small sway (idle). Top. Role ground.
- `layers`: `page` (`'near'`), `x`, `u`, `h` (required), `w` (0.05), `blades` (7), `color` (default `tuft`), `seed` (i + 3), `sway` (0.035).

**`estate`** (W): far-page backdrop: tree-line walls with printed crown shading, a hipped roof card with chimneys, a brick facade whose windows light at night (door fanlight too). Static.
- `page` (`'far'`), `x` (0), `width` (required by roof and facade), `facadeH` (required), `bays` (7).
- `layers`: `kind: 'trees'` `{u, h, x0, x1, color (trees), seed (3), spires (0.18), dip ([x, w, factor])}`; `'roof'` `{u, pitch (0.075), inset (0.1), chimneys ([-0.32, -0.2, 0.2, 0.32])}` (real height is `facadeH + pitch + 0.054`); `'facade'` `{u}`. Give roof and facade an `h` too: the top-bound validator and the `fold` check both read it.
- Palette: `trees`, `roof`, `chimney`, `trim`, `brick`, `stone`, `glass`, `door`.
- Options, all off by default (Filoli uses none): `colors` (`{brick, trim, roof, stone, door, glass, awning}`, overrides the palette for this instance, so a row of shops can each have their own colour); `shop: true` turns the facade into a shop front (display windows and a door at street level under a striped `awning`, tall windows above, a dentil cornice, clapboard); `bulbs: true` prints bulbs along the facade's top and both sides, lit at night with the windows; `wash` (0 to 1, shops only) lets the bulbs wash the facade warm at night, fading down from the top, and shades the lit glass from the ceiling down instead of flat. A shop needs no roof layer; several shops at the same `u` share one wrapped layer.
- Example (inside a wrap): `filoli-halloween.json` "trees" and "house". A Main Street shop: `{"kit": "estate", "page": "near", "x": -0.5, "width": 0.22, "facadeH": 0.28, "shop": true, "bulbs": true, "colors": {"brick": "#F0CDAE", "awning": "#5F7FB8"}, "layers": [{"kind": "facade", "u": 0.46, "h": 0.28}]}`.

**`pumpkin-arch`** (W): two die-cut straw arch cards (front and back) with puffy pumpkins and straw tufts glued to the front one. Static (hero).
- `page` (`'near'`), `x` (0), `width` (0.62), `height` (0.46), `legW` (0.085), `spring` (0.22), `seed` (9); `layers` must contain `{kind: 'front', u}` and `{kind: 'back', u}` (add `h` for the validator).
- Palette: `straw`, `strawLight`, `strawDark`, `pumpkin`, `pumpkinDeep`, `pumpkinYellow`, `pumpkinWhite`, `gourd`, `pumpkinRib`, `stem`.
- Example: `filoli-halloween.json` "arch" (`width 0.76, height 0.6, legW 0.1, spring 0.27`, front `u -0.02`, back `u 0.08`).

**`figure-front`**: The figure facing the reader between two walls; the forearm waves on a brad every 7.5 s (idle). Top.
- `page` (`'near'`), `x` (0), `u` (required), `height` (0.16). Palette: `figure.*` with `cheek`.

**`gauze-curtain`**: a wood frame with vellum gauze: a tied left panel and a right panel on a pivot whose tattered strips swing (idle). Top.
- `page` (`'near'`), `x0`, `x1` (required), `layers[0].u`, `layers[0].h` (required), `opacity` (0.78), `seed` (4).
- Palette: `wood`, `gauze`, `gauzeDeep`, `twine`.

**`string-lights`**: posts on both pages joined by fixed-length threads with bulbs (instanced); twinkle and ground pools at night. Top.
- `layers` (posts): `id`, `page`, `x`, `u`, `h`. `strings`: `from`, `to` (post ids), `bulbs` (9), `sag` (0.07). `seed` (6), `glowSize` (0.05).
- Palette: `wood`, `woodDark`, `wire`, `bulb`, `bulbGlow` (falls back to `lamp`).

**`pumpkin-patch`**: folded-box hay bales (collapse with the page), loose pumpkins, a big jack-o'-lantern on the bales plus small lanterns (glow and pool at night), and one pumpkin that rolls to the other end of its slot on tap (action `roll`). Top.
- `page` (`'near'`), `bales` (`[{x, u, y (0), w, h, d, rot (0)}]`), `pumpkins` (`[{x, u, r, color, tilt (0)}]`), `jack` (`{x, u, r, y (0)}`, **required**), `lanterns` (`[{x, u, r, y}]`), `roller` (`{slot: [a, b], u, r}`, **required**).
- Palette: `hay`, `hayDark`, `pumpkin*`, `stem`, `pumpkinRib`, `jackInner`, `jackGlow`.

**`paper-bats`**: bats on wire sliders, hidden behind the house by day, raised and flapping at night. Top. Role sky.
- `page` (`'far'`), `layers`: `x`, `u`, `hiddenH`, `nightH` (both required), `size` (1).
- Palette: `wire`, `bat`, `batEdge`.

### Top-bound: Bay Trail set (W = wrap-able)

**`drift-water`**: `wave-strips` rows, each in its own short slot, drifting slowly (idle). Top. Role ground.
- `rows` as `wave-strips`, plus per row `drift` (0.025), `speed` (0.12), `phase` (i, scaled 1.7). Palette: `wave`, `foam`.

**`far-shore`** (W): hazy hill walls with a vertical gradient and printed folds, plus a `town` strip of tiny blocks whose lights twinkle at night. Top.
- `layers`: hills `{page ('far'), u, h, x0, x1, seed (1), peak (optional 0..1), color (required), base (gradient foot, default color)}`; `kind: 'town'` `{page, u, h, x0, x1, seed (3), color (town), lights (46), glow (0.022)}`.
- Palette: `town`, `shoreLight`.

**`shore-rocks`** (W): die-cut rock clusters with printed stones. Static.
- `layers`: `page` (`'near'`), `u`, `h`, `x0`, `x1`, `seed` (i + 5). Palette: `rocks` (array of three hexes, indexes 0..2 all used).
- Example: `bay-trail.json` "rocks" (two far-page layers at `u 0.02`).

**`shrub-bank`** (W): golden shrub walls with dry-grass spikes. Static.
- `layers`: `page` (`'near'`), `u`, `h`, `x0`, `x1`, `seed` (i + 2), `color` (default `shrub`), `tip` (default `shrubLight`), `taperL` (0.06), `taperR` (0.06). Palette: `shrub`, `shrubDark`, `shrubLight`.
- Example: `bay-trail.json` "shrubs".

**`trail-post`** (W): a wooden post with two small wordless signs and a cap. Static.
- `page` (`'near'`), `x` (required), `layers[0].u`, `layers[0].h` (required). Palette: `wood`, `woodDark`, `signWhite`, `signGreen`, `signYellow`.

**`trail-lamps`** (W): lamp posts; heads glow and pool light on the page at night.
- `layers`: `page` (`'near'`), `x`, `u`, `h`. Palette: `lampPost`, `lampGlass`, `lamp`.

**`bike-rider`**: A rider on a bike on a hidden belt loop along the printed trail: out on the near lane, round a pulley behind the shrubs, back on the far lane; wheels, cranks, knees on brads; headlight at night. Poke: bell. Top.
- `page` (`'near'`), `trail` (`{u0, bend, tilt, lane, x0, x1}`, required, the same object as `ground.trail`), `scale` (1), `at` (0.35), `speed` (0.045), `turn` (0.16), `dip` (0.1).
- Palette: `bike.*`, `figure.*`, `ringMark`. Action: `ring()`.

**`gull`**: a paper gull on a wire gliding along a slot over the water; turns at the ends (idle). Top. Role sky.
- `page` (`'far'`), `x`, `layers[0].u`, `layers[0].h`, `scale` (1), `range` (0.16), `speed` (0.05), `t0` (1.2).
- Palette: `wire`, `gullWing`, `gullBody`, `gullBeak`, `gullTip`.

## 3. Palette keys

Every key is read as `palette.<key>`; nested groups are `palette.figure.<key>` and `palette.bike.<key>`. Keys with a hard-coded fallback in the code are marked (fb); everything else must be defined or the material gets `undefined` (black or an error).

- **Book body (always):** `cover` (board colour), `core` (page edge core and the tab chevrons), `stripes` (array of hexes: the spine stripes), `ocean` (also the fill of the cover window). `name` is a label only.
- **Water and shore:** `bay`, `ocean`, `foam`, `wave` (array), `landLeft`, `landRight`, `road`, `roadLine`, `walk`, `slot` (fb), `wetSand` (fb `shoulder`), `grass`, `grassDark` (fb), `grassLight` (fb), `grassPatch`, `shoulder`, `shoulderDark`, `asphalt`, `trailLine`, `rocks` (array of 3).
- **Bridge:** `bridge`, `bridgeDark`, `cable`, `pier`, `glass`, `lamp`.
- **Sky and weather:** `fog`, `sun` (fb), `moon` (fb), `moonShadow` (fb), `moonGlow` (fb), `hill`, `skyline`, `skylineNear` (fb).
- **Boat:** `hull` (fb), `sail` (fb), `sail2` (fb), `mast` (fb).
- **Figure (`figure.*`):** `coat`, `coatBack`, `scarf`, `legs`, `legsBack`, `shoes`, `skin`, `hair`, `cheek` (fb; front-facing figures only). **Bike (`bike.*`):** `frame`, `tire`, `rim`, `spoke`, `hub`, `crank`, `guard`, `saddle`, `basket`, `basketDark`, `bell`, `helmet`, `helmetStripe`; plus top-level `ringMark` (fb).
- **Filoli ground and estate:** `field`, `fieldDark`, `fieldLight`, `fieldPatch` (fb in side print), `path`, `hedge`, `tuft` (fb), `stone`, `trees`, `roof`, `chimney`, `brick`, `trim`, `door`.
- **Pumpkins and straw:** `pumpkin`, `pumpkinDeep`, `pumpkinYellow`, `pumpkinWhite`, `gourd`, `pumpkinRib` (fb), `stem` (fb), `straw`, `strawLight`, `strawDark`, `hay` (fb), `hayDark` (fb), `twine` (fb), `jackInner` (fb), `jackGlow` (fb).
- **Lights and props:** `wood` (fb), `woodDark` (fb `wood`), `wire` (fb), `bulb` (fb), `bulbGlow` (fb `lamp`), `gauze`, `gauzeDeep` (fb `gauze`), `bat`, `batEdge` (fb), `lampPost`, `lampGlass` (fb), `signWhite` (fb), `signGreen`, `signYellow`, `town` (fb), `shoreLight` (fb).
- **Gull:** `gullBody`, `gullWing`, `gullBeak`, `gullTip` (fb in `coil-gull` only).

Which pieces need which: `vfold-layer` (bay, foam; grass*, hay/straw/twine, hull/sail*/mast, pumpkin*/stem/pumpkinRib, jackInner/jackGlow by band and card kind), `v-box` / `suspension-bridge` (bridge, bridgeDark, pier, cable, lamp, road, walk, roadLine, glass), `deck-figure` / `figure-front` (figure.*, bridgeDark or strawDark), `layer-figure` (figure.*), `fog-lever` (sun, bridge, core), `sky-dial` (sun, moon, moonShadow), `layer-rider` / `bike-rider` (bike.*, figure.*, ringMark), `layer-roller` / `revolving-picture` (pumpkin*, wood, woodDark, jack*), `string-lights(-v)` (wood, woodDark, wire, bulb, bulbGlow), `bat-lever` / `paper-bats` (bat, batEdge, wire), `coil-gull` / `gull` (gull*, signWhite or wire), `estate` (trees, roof, chimney, trim, brick, stone, glass, door), `pumpkin-arch` (straw*, pumpkin*, gourd, stem), `far-shore` (town, shoreLight), `shore-rocks` (rocks), `shrub-bank` (shrub*), `trail-post` (wood, woodDark, sign*), `trail-lamps` (lampPost, lampGlass, lamp), `vfold-wrap` ties (grass, else landLeft) and pools (lamp). Copy the full block from the closest shipped moment and prune.

## 4. Idle animations

**The moment-level `idle` array is not consumed anywhere** (`book.js` and the engine never read `m.idle`); the names in the shipped files (`traffic`, `boat-drift`, `me-wave`, `roller`, `lights-twinkle`, `rider`, `gull-bob`, `shore-lights`, `sign-steam`, `cup-lift`, `tree-sway`) are notes for humans. Idle motion is built into each piece's `tick(t, dt, loops)`; `loops` is false under `prefers-reduced-motion` or while the book is shut, and the pieces then hold still.

**Every moment needs one living loop by day** (SKILL.md, the bar): a piece from the list below that moves by day, or a new loop in a piece's `tick`. Night glow and the nudge hints do not count. `scripts/check.mjs` measures it: after the hints are over it reads `window.__book.debugLoops()` three times (a fingerprint of where each piece's paper is) and prints the pieces that changed as `alive:`. What moves on its own:

- `v-box` cars and `deck-traffic` cars: cross on their belts (`traffic.speed` / `speed`).
- `layer-slider` and `sailboat`: slow drift along the slot (`drift`), the boat rocks.
- `layer-rider`: rides out and back (`speed`); `bike-rider`: laps the belt; both pedal, wheels turn, scarf and ponytail sway.
- `layer-roller`: rolls along its slit (`drift`); `pumpkin-patch` roller only on tap.
- `layer-figure` and `figure-front`: a wave every `every` / 7.5 s.
- `coil-gull`: bobs and flaps; `gull`: glides along the slot and turns.
- `castle`: the pennants flutter.
- `shop-front`: steam rises off the cup sign, the figure lifts her cup now and then; `cafe-patio`: the tree's crown sways; `billboard`: the boards turn to their next face every few seconds (unless `every` is 0); `wave`, `look` and `blink` groups on the showing face move now and then.
- `string-lights-v`, `string-lights`, city bands, `far-shore` town, `estate` windows, lamps: glow only at night; the string bulbs and town lights twinkle.
- `fog-bank`: breath (`breath`); `drift-water`: strip drift; `grass-tufts`: sway; `gauze-curtain`: strips swing; `paper-bats` and `bat-lever` (when raised): flap and drift.
- `fog-lever`, `sky-dial`, `revolving-picture`, `bat-lever`, `layer-rider` tab, `billboard` tab or board drag: a nudge hint after the book settles.
- Static: `vfold-layer` bands and cards, `deck-figure`, `walker`, `vfold-wrap` walls, `estate`, `pumpkin-arch`, `shore-rocks`, `shrub-bank`, `trail-post`, `trail-lamps`, `skyline`, `hill-layers`, `vfold-hill`, `wave-strips`, `moon` (moves only with the theme).

## 5. Gaps: when a photo needs new kit code

1. **People other than the figure:** every figure is her (coat, scarf, hair); no second figure, no child, no crowd, no one sitting.
2. **the figure’s poses:** only facing the reader with a waving forearm, the tiny `walker` (walk / stand / wave), and on the bike. No seated, kneeling or back view.
3. **Trees:** only a tree-line silhouette inside `estate` (parallel wall or wrapped); a young tree in a planter (`cafe-patio`) is the only single tree; no redwood, no palm, no bare winter tree, no foreground foliage.
4. **Buildings:** the Filoli facade (brick, seven bays; or, with `shop`, `bulbs` and `colors`, a row of bulb-lit Main Street shop fronts), a generic city band and a town strip; a café front (`shop-front`); a fairy-tale castle (`castle`); no house with a porch, no interior, no tent or stall.
5. **Animals:** gull and bat only; no dog, horse, deer, cat, cow, duck or fish.
6. **Vehicles:** box cars on a belt and a bike; no bus, train, ferry, kayak, plane, scooter or stroller.
7. **Water:** wave bands and a sailboat; no river, waterfall, fountain, pool, tide pools or surf.
8. **Weather and sky:** fog card, sun/moon dial, moon slider, bats, stars on the dial only; no rain, snow, clouds as pieces, rainbow or sunset gradient beyond the light preset.
9. **Props:** pumpkins, hay bales, gauze, string lights, trail post, lamp posts, signs without words; a café table, chairs and umbrella (`cafe-patio`); billboards and overhead road signs with the moment's own artwork (`billboard`); no food, picnic, flowers, balloons, tents, benches or fences.
10. **Mechanisms available for reuse:** pull-tab (`makePullTab`), slit slider, volvelle, revolving picture, lever with lost motion, coil spring, belt loop, threads with sag. A new piece should be one of these with new art, declared through `declare()` so the validator can fold it flat.
