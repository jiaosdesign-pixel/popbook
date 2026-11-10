---
name: popbook
description: Turn a photo or a line about someone's day into a page of a paper pop-up book they can play with, delivered as ONE self-contained HTML file (three.js, no server, no install, works offline). Layers of cut paper fold up from the gutter; the reader taps a piece, drags a pull-tab, turns a sun-and-moon dial between day and night, and something in the scene moves on its own. Use this whenever someone sends a photo, a place, a memory or a one-line diary entry and wants it as a pop-up book, a paper diorama, a "popbook" or a playable keepsake page, or wants to add a page to a popbook they already have, even if they never say "pop-up".
---

# popbook

One page of a pop-up book is one JSON file (a "moment") built from a kit of paper pieces. `scripts/build.mjs` turns one or more moments into one HTML file. The photo is reference only: it never goes into the book.

Read first: `references/kit.md` (every piece, its parameters, the palette keys it reads, the fold-flat rules), then the example in `examples/` nearest in subject to the photo: a shore or a ride (`bay-trail`), a garden, a house or a festive scene (`filoli-halloween`), a landmark (`golden-gate`), a shop or a café (`cafe`).

## Inputs

- A photo (look at it), a line in the sender's own words, or both. Usually both.
- Place and date, in this order of trust: their line, the photo's EXIF, the file name. `scripts/photo.py <photo>` prints the date, GPS, size and a palette guess. A file date with no EXIF is often wrong (a re-saved photo carries the save date): ask. If the place is unknown, ask one question and keep working on everything else.
- If they already have a book (a folder of moment files), the new page joins it: build all the files together.

## The bar

The four examples are the standard. Measure against the nearest one before you hand anything over.

- **4 to 6 story pieces** in 3 or more layers, back, middle and front. The engine rejects more than 6; fewer than 4 reads empty.
- **Two things to play with** besides the sky dial: one the reader taps (a bell, a gull, a door) and one they drag (a pull-tab, a lever, a slider, a revolving picture). `check.mjs` lists both and fails if either is empty. `kit.md` section 1, "What answers the reader", lists every piece that takes a tap or a drag. If nothing in their photo or line can be tapped, ask one question before adding anything ("Was there anything else there, like a bird, a flag, a bell or a door?"). If the answer is no, hand the page over below the bar and say so.
- **One living loop.** Something in the scene moves on its own by day: traffic, a rider, a boat, steam, a bird, a flag, leaves. Pick what travels or breathes in the photo or the line. Taps, drags and the opening hints do not count. `check.mjs` prints `alive:` and fails when it is empty.
- **Kit first.** Build everything you can from existing pieces: hills, trees and hedges as layer bands, lamps, a figure, a rider, birds. A new kit piece only for the one thing the sender would point at, and at most one per page (see "A new piece").
- **Only what is in the photo or the line.** No props for decoration. If the scene stays thin because the photo is simple, say so rather than inventing.
- **The house light and book, unchanged.** `new.mjs` writes the house block (book shape, cover, page edges, lamp, light, camera). Day is a soft studio light, night is moonlight with the lamps on; time of day and weather live in the palette, the sky dial and the lamps, never in the light.
- **The figure is the sender** unless they say otherwise. Dress them from the photo (`palette.figure`: coat, scarf, legs, hair, skin). With only a line, keep the example's figure colours unless they say what they wore, and say in the note what you guessed. Never add a person, a pet or a companion they did not mention.

## The loop

1. **Read the photo.** `python3 scripts/photo.py <photo> --swatches swatches.png`, then look at it yourself: what is back, middle, front; the one thing they would point at; what moves on its own and what could be touched; time of day; weather.
2. **Scene brief** (your own notes): binding (`side`, the V-fold panorama, for almost everything); layers back to front and the kit piece for each; the tap and the drag; the living loop; what carries the night (lamps, windows, the dial's moon, a headlight); the palette from `photo.py`'s guess, lifted and warmed a step (the book is paper, not a print), pruned to the keys the pieces read (`kit.md` section 3).
3. **Start the page.** `node scripts/new.mjs <id> --place "Place, City" --date YYYY-MM-DD --dir <their book folder> --like <nearest example>`. The id is short and kebab-case (`bay-trail`, `cafe`). Fill `pieces` and the scene palette. Give every piece the reader can tap or drag a `label`, two or three plain words ("Sailboat", "Café door"): the keyboard path and screen readers use it.
4. **Fold-flat.** Every layer has to lie flat when the book shuts. Side-bound: each half of a layer at crease `x0` folds along the gutter, so `x0 + height * 0.966 <= 0.75` (book width 1.5, hinge 105 degrees). The layers at the back get the least headroom: at `x0` 0.46 a half may stand 0.3, at `x0` 0.52 only 0.24. A dial, a bird or a figure on a layer counts in its height. A layer near the reader also folds toward the reader's edge, so keep its reach short: roughly `x0 - reach * 0.26 >= -0.75`. The validator checks both and names the half and how far it reached. The sky dial is riveted behind its host layer: keep that layer low where the dial sits (an `estate` tree line takes a `dip`), or the dial hides.
5. **Build and check.** `node scripts/build.mjs <dir>/*.json --out <dir>/book.html --title "<their title>" --author "<their name, if they gave one>"`, then `node scripts/check.mjs <dir>/book.html --page <id>`. It prints the validator's errors, the play lists and `alive:`, and saves phone and desktop shots by day and by night plus `card.png`. Look at the shots, night first: glow, lamps and windows only show their mistakes at night. Put the phone day shot beside the nearest example's (`build.mjs examples/<that>.json` and check it): if yours looks emptier, it is not done. Iterate here, not after handing it over.
   - No Playwright? The book also checks itself: open `book.html` in a browser. A page with errors is skipped and the errors are printed on the page.
6. **Caption.** Their line, polished two ways: first person, one sentence, plain words, about 10 words or fewer. The place line sits right under the caption, so the caption never repeats the place: say what happened or how it felt, not where. Make the two options genuinely different (one closer to their words, one shorter). Never add a fact, a feeling or a person they did not give you. Put option 1 in `caption` and offer option 2.
7. **Hand it over.** Send `book.html` (it is the whole book: they can open it, email it, or host it anywhere), `card.png` if you made one, and a short note:
   ```
   <Place> · <Mon D>
   In the scene: <one line, back to front>
   Play: tap <what>, drag <what>, turn the sun dial
   On its own: <what moves by itself>
   Caption: 1. <option 1>  2. <option 2>
   ```
   Add one line only for something they must know (a guessed date, a thin photo, a new kit piece).

## A new piece

When the photo's hero is something the kit cannot make (a lighthouse, a carousel), add one piece in `book/kit/` following the nearest existing one: paper materials from `book/engine/paper.js`, taps and drags the way `shop-front` (`book/kit/cafe.js`) and `layer-rider` (`book/kit/panorama2.js`) do, idle loops in `tick(t, dt, loops)` that run only while `loops` is true. Register it in `book/kit/index.js` with `build`, `about` and, for side binding, `panorama: true` and `declare`. The engine writes each part's matrix every frame, so anything you place or animate sits in a group inside the part, never on the part's root. Light, dark, reduced motion and touch come from the engine; do not special-case them. Expect an hour or more; a kit-only page takes minutes.

## What the reader gets

One HTML file of about 1.8 MB: the open book, the caption and place under it, a Day / Night switch (the dial in the book turns it too), and arrows and date tabs when there is more than one page. It needs WebGL and a recent browser; it makes no network requests. Drag, tap and keyboard all work (Tab reaches each playable piece, Enter taps, arrow keys drag).

## Rules that do not bend

- The photo never goes into the book or the folder you hand back. No names, ages or details of anyone the sender did not put in the line.
- Every word in the caption and the place is theirs or confirmed by them.
- Say what you could not check: the scripts never cover Safari, Firefox, a real phone or a screen reader.
