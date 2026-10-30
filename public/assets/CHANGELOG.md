# Changelog

## 1.1.0 · 2026-10-30
- **High-res art.** 42 poses × 6 colourways, 9 full-body expressions × 6, 13 heads × 6, avatars.
- **5 turnaround views.** `stand`, `turn34left`, `turn34right`, `profile`, `back`.
- **Rig rebuilt** on the high-res art, with eyelid layers (`lid0`, `lid1`) for a blink and the flame drawn behind the body. Rig for all 42 poses in the classic and 5 colourways, cleaned of specks, remnants, slits and baked dark edges.
- **Animations re-rendered** from the new rig: WebP and Lottie for each pose's signature motion plus `breathe` (idle also has walk, wave, jump, bounce, cheer, flicker, run), colourway Lottie, 20-frame sprites for all 42 poses, GIFs for the 10 core poses. All v1.0 animation files were removed first.
- **New sequences.** `glim-profile-walk` (side-view walk cycle) and `glim-turnaround` (stand → ¾ right → profile → back → ¾ left → stand).
- **Players updated.** `rhemlo-glim.js`: new draw order, blink, per-pose amplitudes, colourway rigs, profile walk, `turnaround` mode. `rhemlo-lottie.js`: hold-keyframed opacity and linear keys.
- **Catalog, types, motions** regenerated for 42 poses (`rig_amplitude`, `blink`, sequences, new path patterns). `glim.d.ts` has the new poses, `GlimTurnaroundView`, `GlimSequence` and `GlimExpression`.
- **Fixes.** Sleep Z restored; eyelids regenerated (no ghost, brows intact); profile blink; flame core merged in 3 poses; irises protected from colourway tint; study props keep their colours; turnaround shows open eyes.
- **Licences.** Full OFL 1.1 texts for Nunito and Figtree, and the Font Awesome Free licence, are included.
- **Revision 2.** Ten poses (`cheer`, `champion`, `sleep`, `shrug`, `stopwatch`, `pointleft`, `confident`, `heart`, `pray`, `study`) were replaced by native high-resolution renders and rebuilt end to end.
- **Validation.** All Lottie files pass the independent evaluator and were rendered with lottie-web (canvas and SVG); the demo self-test passes in light and dark with zero console errors.
- **Docs.** `ASSETS_GUIDE.md`, `VERIFICATION.md`, `manifest.json` regenerated; `qa/` added.

## 1.0.0 · 28 Oct 2026
Every limitation listed for v0.2 is resolved:
- **Real rig.** Each pose is split into body, flame, arms, legs and props with pivots. Limbs swing, legs step, the flame flickers and the body squashes, each part independently. Joint seams are faded, the flame base is extended behind the cap, held props stay locked to their hand, and edges are colour-decontaminated (no white fringes).
- **Lottie verified.** Files are multi-layer and parented. Every file was re-rendered by an independent JSON-only evaluator and matches the reference renderer (see VERIFICATION.md). The files also play live in the demo through `rhemlo-lottie.js`.
- **On-model expressions.** 9 full-body expressions from a new on-model sheet, plus 13 circular head expressions in all 6 colourways. The off-model sheets are no longer used.
- **Colourways rebuilt.** Recolouring now works on the detected body region rather than on hue alone. The flame, cap, eyes, cheeks, mouth, book emblem with its gold frame, and all props (trophies, medals, maps, desks, lanterns, backpacks, shields, stopwatches) keep their colours. The orange patches on the sleeping pose are gone.
- **Every world painted at night.** New painted night versions of autumn, coast and summit. No world uses a tone-mapped "dusk" any more.

Also new in 1.0:
- 10 more poses (idle, pray, study, pointleft, confident, shrug, heart, stopwatch, cheer, champion), for 37 in total.
- 9 reward items and 6 Arena / Quiz Night props.
- New motions: walk, wave and cheer.
- 8 hand-placed node-anchor sets.
- Rigged colourway layers.
- Halo-free props on dark backgrounds.
- A self-testing gallery that works from `file://`.
- The concept board PDF, included as a reference.
