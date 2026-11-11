// The kit: every piece a moment may place. A moment file can only use these ids.
import * as bridge from './bridge.js';
import * as figure from './figure.js';
import * as scenery from './scenery.js';
import * as traffic from './traffic.js';
import * as filoli from './filoli.js';
import * as baytrail from './baytrail.js';
import * as pano from './panorama.js';
import * as pano2 from './panorama2.js';
import * as cafe from './cafe.js';
import * as castle from './castle.js';
import * as billboard from './billboard.js';

export const KIT = {
  // Side-bound V-fold panorama (book.binding 'side'). Only these pieces are allowed in a side-bound moment;
  // declare(spec, book) tells the validator which V-folds and slots a piece is made of.
  'vfold-layer': { build: pano.vfoldLayer, panorama: true, declare: pano.declares.vfoldLayer, about: 'A V-fold layer across the gutter: printed bands (waves, hills, flat, city) and small glued cards (a sailboat). Both halves face the reader as a shallow V.' },
  'v-box': { build: pano.vBox, panorama: true, declare: pano.declares.vBox, about: 'Two parallel V-folds joined by platforms: the suspension bridge (front and back elevations, deck, tower struts), thread cables, static low-relief cars, lamps.' },
  'deck-figure': { build: pano.deckFigure, panorama: true, declare: pano.declares.deckFigure, about: 'The figure facing the reader, glued behind the front railing of a v-box on a spacer card.' },
  'fog-lever': { build: pano.fogLever, panorama: true, declare: pano.declares.fogLever, about: 'Pull-tab at the reader\'s edge driving a lever on a rivet: a vellum fog card swings up over a layer\'s ridge. The pin shows in an arc slot.' },
  'sky-dial': { build: pano.skyDial, panorama: true, declare: pano.declares.skyDial, about: 'A volvelle riveted behind a layer: sun and moon. Turning it drives Day / Night (onThemeChange).' },
  'layer-slider': { build: pano.layerSlider, panorama: true, declare: pano.declares.layerSlider, about: 'A card (the sailboat) riding a slit along one half of a V-fold layer. Idle drift; the reader can drag it along the slit.' },
  'vfold-wrap': { build: pano2.vfoldWrap, panorama: true, declare: pano2.declares2.vfoldWrap, about: 'Turns an old wall piece (estate, pumpkin-arch, far-shore, shore-rocks, shrub-bank, trail-post, trail-lamps) into V-fold layers split at the crease. Declare each layer in fold.' },
  'layer-figure': { build: pano2.layerFigure, panorama: true, declare: pano2.declares2.layerFigure, about: 'The figure facing the reader, a step behind a layer (in its opening); her forearm waves on a brad (idle).' },
  'layer-rider': { build: pano2.layerRider, panorama: true, declare: pano2.declares2.layerRider, about: 'A rider on a bike in a slit along one half of a layer: rides by herself; a pull-tab lets the reader ride her. Poke: bell.' },
  'layer-roller': { build: pano2.layerRoller, panorama: true, declare: pano2.declares2.layerRoller, about: 'A pumpkin rolling along a slit on one half of a layer (idle); drag to roll it.' },
  'string-lights-v': { build: pano2.stringLightsV, panorama: true, declare: pano2.declares2.stringLights, about: 'Posts on layers joined by fixed-length threads with bulbs; twinkle at night.' },
  'revolving-picture': { build: pano2.revolvingPicture, panorama: true, declare: pano2.declares2.revolving, about: 'Nister revolving picture on a layer: tap the wheel to spin it, or pull its rim tab, and the plain pumpkin turns into a carved jack-o-lantern.' },
  'bat-lever': { build: pano2.batLever, panorama: true, declare: pano2.declares2.batLever, about: 'Pull-tab at the reader\'s edge: two bats swing up behind a layer, the second a beat later.' },
  'coil-gull': { build: pano2.coilGull, panorama: true, declare: pano2.declares2.coilGull, about: 'A paper gull on a paper coil spring: bobs (idle); tap to bounce.' },
  'shop-front': { build: cafe.shopFront, panorama: true, declare: cafe.declares3.shopFront, about: 'A café front as a V-fold layer: stone pier, sign band, storefront glass lit at night, a glass double door. Pull-tab (or tap the door): the leaves swing open and the figure is in the doorway with her cup. On its own: steam rises off the cup sign, and she lifts her cup now and then.' },
  'cafe-patio': { build: cafe.cafePatio, panorama: true, declare: cafe.declares3.cafePatio, about: 'A café patio as a V-fold layer: an umbrella over a table and two chairs on one half, a young tree in a planter on the other. Tap the umbrella: the canopy spins on its pole. On its own: the tree\'s crown sways.' },
  'castle': { build: castle.castle, panorama: true, declare: castle.declares4.castle, about: 'A fairy-tale castle as two V-fold layers: curtain wall, gatehouse and round towers in front, the keep and its tall spire behind; pastel stone, cone roofs, gold finials, pennants. Pull-tab: the portcullis rises and the gate swings open. Tap: the windows light one after another and the pennants snap. On its own: the pennants flutter. Night: lit windows, a soft glow on the walls.' },
  'billboard': { build: billboard.billboard, panorama: true, declare: billboard.declares4.billboard, about: 'Billboards as a V-fold layer: boards on posts (or an overhead sign on a truss), each cut into tri-vision louvers that turn one after another to the next face. Tap a board: it turns. Pull-tab: every board turns with it. On its own: the boards turn every few seconds; at night catwalk lamps light the faces. The artwork (colours, text, SVG paths, shapes) comes from the moment.' },
  'ground:cafe-side': { print: cafe.cafeSidePrint.print, about: 'Side-bound café ground: scored sidewalk, kerb and parking lot at the reader\'s edge, a mulch bed behind the wall.' },
  'ground:filoli-side': { print: pano2.filoliSidePrint.print, about: 'Side-bound Filoli ground: field, mown path down the gutter, forecourt, hedges.' },
  'ground:baytrail-side': { print: pano2.baytrailSidePrint.print, about: 'Side-bound Bay Trail ground: bay behind the shore, grass, the trail across both pages.' },
  'ground:gg-side': { print: pano.ggSidePrint.print, about: 'Ground printer for the side-bound Golden Gate: the bay in front, the ocean beyond the Gate, SF and Marin shores.' },
  'suspension-bridge': { build: bridge.build, about: 'Floating-layer bridge across the gutter: towers, deck, thread cables. Hero.' },
  'walker': { build: figure.build, about: 'Tiny paper person standing on a host piece walkway. Poses: walk, stand, wave.' },
  'deck-traffic': { build: traffic.build, about: '2 to 4 folded-box cars on a hidden belt inside a host deck, both directions. Lights at night. Idle loop.' },
  'wave-strips': { build: scenery.waves, about: 'Parallel wavy water walls on either page.' },
  'vfold-hill': { build: scenery.vfoldHill, about: 'V-fold hill across the gutter, visible centre crease.' },
  'fog-bank': { build: scenery.fog, about: 'Vellum fog walls on a slider. Idle breath. Action: roll.' },
  'skyline': { build: scenery.skyline, about: 'One parallel wall of buildings, windows light at night.' },
  'sailboat': { build: scenery.sailboat, about: 'Folded-box hull and sail in a slot. Idle drift. The reader can drag it along the slot.' },
  'moon': { build: scenery.moon, about: 'Paper moon on a slider strip: hidden behind a layer by day, rises at night. Shows the real phase.' },
  'hill-layers': { build: scenery.hills, about: 'Parallel hill walls with soft silhouettes, layered in depth.' },
  // Filoli, Woodside (Halloween 2026).
  'ground:filoli': { print: filoli.groundPrinter('filoli').print, about: 'Ground printer: golden field, mown path to the arch, gravel forecourt, hedges.' },
  'grass-tufts': { build: filoli.grassTufts, about: 'Dry grass cards pinned at the base; a small sway. Role: ground.' },
  'estate': { build: filoli.estate, about: 'Far-page backdrop: tree line, hipped roof with chimneys, brick facade whose windows light at night.' },
  'pumpkin-arch': { build: filoli.pumpkinArch, about: 'Two die-cut straw arch cards with puffy card pumpkins glued on. Hero.' },
  'figure-front': { build: filoli.figureFront, about: 'The figure facing the reader between two walls; the waving forearm is on a brad.' },
  'gauze-curtain': { build: filoli.gauzeCurtain, about: 'Vellum gauze on a wood frame; tattered strips swing (idle).' },
  'string-lights': { build: filoli.stringLights, about: 'Posts on both pages joined by fixed-length threads with bulbs; twinkle at night.' },
  'pumpkin-patch': { build: filoli.pumpkinPatch, about: 'Hay bales, a jack-o-lantern that glows at night, a pumpkin that rolls in a slot. Action: roll.' },
  'paper-bats': { build: filoli.paperBats, about: 'Bats on wire sliders hidden behind the house by day, raised at night. Role: sky.' },
  // Bay Trail, Foster City (Nov 7 2026).
  'ground:baytrail': { print: filoli.groundPrinter('baytrail').print, about: 'Ground printer: bay on the far page; shore, golden grass and the curving trail (with its belt slots) on the near page.' },
  'drift-water': { build: baytrail.driftWater, about: 'Wave strips, each in its own short slot: a slow drift (idle). Role: ground.' },
  'far-shore': { build: baytrail.farShore, about: 'Hazy hill walls across the water plus a low town strip whose lights come on at night.' },
  'shore-rocks': { build: baytrail.shoreRocks, about: 'Die-cut rock clusters with printed stones along the waterline. Role: ground.' },
  'shrub-bank': { build: baytrail.shrubBank, about: 'Golden shrub walls with dry-grass spikes; they hide the ends of a belt.' },
  'trail-post': { build: baytrail.trailPost, about: 'Wooden trail marker with two little wordless signs.' },
  'trail-lamps': { build: baytrail.trailLamps, about: 'Lamp posts; heads glow and pool light on the trail at night.' },
  'bike-rider': { build: baytrail.bikeRider, about: 'A rider on a bike on a hidden belt loop along the trail (near lane out, far lane back). Wheels, cranks, knees on brads. Headlight at night. Poke: bell hop.' },
  'gull': { build: baytrail.gull, about: 'Paper gull on a wire gliding along a slot over the water. Role: sky.' },
};
