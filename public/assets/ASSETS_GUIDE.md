# Rhemlo Asset Library · v1.1

**Little quests. Lasting light.**

This folder holds every visual asset needed to build the Rhemlo UI/UX from *UI/UX Concept Board v0.2*:
- **Glim:** 42 poses (including 5 turnaround views), 13 expressions, 6 colourways, avatars, a real cut-out rig with eyelid blink, a side-view walk cycle, a turnaround sequence, and 5 animation formats.
- **Worlds and scenes:** 8 fully painted quest worlds with node anchors, plus 2 scenes.
- **Rewards and states:** league tiers, badges, reward items, Arena props and state illustrations.
- **Brand and code:** brand files, fonts, icons, design tokens, a motion library, two zero-dependency players, a self-testing gallery and the concept board PDF.

It is written for an implementation assistant **that cannot generate images**. Nothing in the product should need new artwork. If a screen seems to need art that isn't here, use the closest asset from section 12 and log the gap as a TODO. Never draw placeholders.

---

## Contents
1. [Golden rules](#1-golden-rules)
2. [Install in five minutes](#2-install-in-five-minutes)
3. [Folder map](#3-folder-map)
4. [Fonts](#4-fonts)
5. [Design tokens](#5-design-tokens)
6. [Glim: poses, expressions, colourways, avatars](#6-glim-poses-expressions-colourways-avatars)
7. [The rig](#7-the-rig)
8. [Animation: five formats and two sequences](#8-animation-five-formats-plus-two-sequences)
9. [Quest worlds and scenes](#9-quest-worlds-and-scenes)
10. [Emblems, badges, items, Arena props, states](#10-emblems-badges-items-arena-props-states)
11. [Brand, icons and PWA](#11-brand-icons-and-pwa)
12. [Screen-to-asset map](#12-screen-to-asset-map)
13. [Performance and delivery](#13-performance-and-delivery)
14. [Accessibility](#14-accessibility)
15. [Verification and quality report](#15-verification-and-quality-report)
16. [Sources and regeneration](#16-sources-and-regeneration)
17. [Instructions for implementation assistants](#17-instructions-for-implementation-assistants)
18. [Acceptance checklist](#18-acceptance-checklist)
19. [Known limits](#19-known-limits)

---

## 1. Golden rules
1. **Copy, never redraw.** All art is final for this version. Never trace, approximate in SVG/CSS, or substitute stock art or emoji for Glim.
2. **One Glim.** Use only files under `characters/glim/`. All 42 poses and 9 full-body expressions come from on-model sheets with the same locked design.
3. **Paths are a contract.** File names follow the fixed patterns in `characters/glim/glim-catalog.json` → `paths`. Build helpers from those patterns.
4. **Calm answer area.** No moving Glim, confetti or rank changes next to an input. Animation belongs on the map, celebrations, empty states and onboarding.
5. **Respect reduced motion.** Every animated asset has a static twin. The CSS and the rig player already stop under `prefers-reduced-motion`.
6. **Theme parity.** Every world has a separately painted night version. Never colour-invert art for dark mode.
7. **Meaning is never colour alone.** Tiers, nodes and badges always carry a text label.

---

## 2. Install in five minutes

### 2.1 Copy
Copy `rhemlo-assets/` into your static folder so it's served at `/rhemlo-assets/`:

| Stack | Destination |
|---|---|
| Vite · React · Vue · Svelte · Astro | `public/rhemlo-assets/` |
| Next.js | `public/rhemlo-assets/` |
| Plain HTML | next to `index.html` |

You can exclude `_source/`, `reference/` and `demo/` from production builds. They're for development and audit.

### 2.2 Global styles and scripts (order matters)
```html
<link rel="preload" href="/rhemlo-assets/fonts/webfonts/nunito-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/rhemlo-assets/fonts/webfonts/figtree-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/rhemlo-assets/fonts/fonts.css">
<link rel="stylesheet" href="/rhemlo-assets/tokens/tokens.css">
<link rel="stylesheet" href="/rhemlo-assets/motion/rhemlo-motion.css">
<link rel="stylesheet" href="/rhemlo-assets/icons/fontawesome-free-6.4.0/css/all.min.css">
<script src="/rhemlo-assets/characters/glim/rhemlo-glim.js" defer></script>
```

### 2.3 Theme with no flash
Put this inline in `<head>`, before any CSS:
```html
<script>(function(){var t=localStorage.getItem('rh-theme')||'system';
var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.dataset.theme=d?'dark':'light';})();</script>
```

### 2.4 Verify
Open `demo/index.html` straight from disk (no server needed). The header must read **"self-test OK"** with zero broken images, 18+ live rigs and 6 Lottie canvases. Then use **Toggle light / dark**.

---

## 3. Folder map
```
rhemlo-assets/
├── ASSETS_GUIDE.md · README.md · CHANGELOG.md · LICENSES.md · PROMPTS.md · VERIFICATION.md
├── manifest.json                 every file: path, type, size, dimensions, metadata, sha256 prefix
├── brand/
│   ├── logo/                     wordmark-{plum|vanilla|grape}.svg (outlined), lockup-{plum|vanilla}.svg
│   ├── app-icons/                icon-{16…1024}.png, icon-maskable-{192,512}.png, favicon.ico, apple-touch-icon.png, site.webmanifest
│   └── social/og-image-1200x630.png
├── characters/glim/
│   ├── glim-catalog.json         poses, uses, motions, rig data, amplitudes, path patterns
│   ├── rhemlo-glim.js            <rhemlo-glim> web component (static, CSS motion, or true rig)
│   ├── rhemlo-lottie.js          tiny offline Lottie player (image layers + parenting)
│   ├── glim.d.ts                 TypeScript unions
│   ├── poses/png/                glim-{pose}.png             trimmed transparent masters
│   ├── poses/square-{512|256|128}/ glim-{pose}.webp (+ .png at 512)   feet at 98% height
│   ├── expressions/full/         glim-expr-{expr}.png, -512.webp, -256.webp   on-model full body
│   ├── expressions/heads/{cw}/   head-{expr}-{256|128}.png  (+ classic -256-transparent.png)
│   ├── colorways/{cw}/           glim-{pose}-{512|256}.webp, glim-expr-{expr}-256.webp
│   ├── avatars/                  avatar-{cw}-{256|128|64}.png
│   ├── rig/{pose}/               body.webp, flame.webp, arm0/arm1.webp, leg0/leg1.webp, lid0/lid1.webp, prop*.webp, rig.json
│   ├── rig/rig-index.json        all poses: size, bbox, layers, pivots, draw order
│   ├── rig-colorways/{cw}/{pose}/ the same layers in each colourway
│   └── animated/
│       ├── webp/                 glim-{pose}-{motion}.webp     rigged, transparent, 320², 25fps
│       ├── lottie/               glim-{pose}-{motion}.json     rigged multi-layer Lottie 5.7
│       ├── sprites/              glim-{pose}-{motion}-sprite.png  20 frames × 128px
│       ├── gif/                  glim-{pose}-{motion}-{light|dark}.gif   10 core poses
│       └── index.json
├── worlds/
│   ├── maps/anchors.json         8 node anchors per world
│   ├── maps/{world}/             {world}-1254.jpg, {world}-{1254|800|480}.webp
│   └── scenes/{scene}/           hero-sunrise, stage-quiznight (+ wide 1200×675)
├── emblems/
│   ├── tiers/                    tier-{bronze|silver|gold|jade|amethyst|lantern}.png, -256/-128.webp
│   ├── badges/                   badge-{name}.png, -128.webp, locked/badge-{name}-locked.png
│   ├── items/                    item-{name}.png, -128.webp
│   └── arena/                    arena-{name}.png, -128.webp
├── illustrations/states/         state-{name}.png, -256.webp
├── fonts/                        fonts.css, webfonts/*.woff2 (variable), static-ttf/*.ttf
├── icons/                        fontawesome-free-6.4.0/
├── tokens/                       tokens.css, tokens.json, tailwind.preset.cjs
├── motion/                       rhemlo-motion.css, motions.json (rig curves)
├── demo/index.html               self-testing gallery (works from file://)
├── reference/                    Rhemlo_UIUX_Concept_Board_v0.2.pdf (77 pages, every screen)
├── qa/                           contact sheets, demo screenshots, lottie-validation.json, rest-fidelity.json
└── _source/                      original generated sheets + every build script
```

---

## 4. Fonts
| Family | Role | Files | Weights |
|---|---|---|---|
| **Nunito** | Display, headings, numbers, buttons | `nunito-{normal|italic}-{latin|latin-ext|cyrillic|cyrillic-ext|vietnamese}.woff2` | variable 200–1000 |
| **Figtree** | Body, answers, Scripture, labels | `figtree-normal-{latin|latin-ext}.woff2` | variable 300–900 |

- `fonts.css` declares every face with `unicode-range`, so browsers only download the subsets they need.
- **Weights in use:**
  - Nunito: 800 for headings, 900 for the logo and big numbers.
  - Figtree: 400 for body text, 600 for the reader, 700 for labels.
- `static-ttf/` contains Latin-only static instances for canvas, PDF, email and native tooling.
- Use `font-variant-numeric: tabular-nums` on counters, timers, ranks and points.
- Answer inputs must be at least 16px so iOS doesn't zoom.

---

## 5. Design tokens
`tokens/tokens.css` defines `--rh-*` variables. Light values are the default. Dark values apply through `[data-theme="dark"]` or automatically through `prefers-color-scheme`.

| Group | Tokens |
|---|---|
| Surfaces | `--rh-bg`, `--rh-surface`, `--rh-surface2`, `--rh-raised`, `--rh-glass` |
| Text | `--rh-text`, `--rh-text2`, `--rh-text3` |
| Action | `--rh-action`, `--rh-action-fg`, `--rh-action-shadow` |
| Semantic | `--rh-correct`, `--rh-incorrect`, `--rh-warning` (+ `-bg`, `-line`) |
| Brand | `--rh-brand-{vanilla|apricot|grape|pistachio|lavender|plum}` |
| Quest nodes | `--rh-node-{done|current|locked|review|reward|stage}` (+ `-depth`, `-fg`) |
| Type | `--rh-type-{display|h1|h2|h3|body|reader|label|eyebrow}` (use as `font:` shorthand) |
| Space · radius · layout | `--rh-space-0…8`, `--rh-radius-{sm|md|lg|xl|pill}`, `--rh-target-min`, `--rh-question-max`, `--rh-reader-measure` |
| Motion | `--rh-motion-{press|feedback|map-travel|completion|promotion|glim-wave}`, `--rh-ease`, `--rh-ease-spring` |

The same values are in `tokens.json` (for other platforms) and `tailwind.preset.cjs` (Tailwind).

**Breakpoints:**
- Mobile, below 640px.
- Tablet, 640–1023px: navigation rail.
- Desktop, 1024px and up: sidebar plus context rail.

**Raised button recipe:**
```css
.btn{height:52px;border-radius:16px;font:800 16px var(--rh-font-display);background:var(--rh-action);color:var(--rh-action-fg);box-shadow:0 4px 0 var(--rh-action-shadow)}
.btn:active{transform:translateY(3px);box-shadow:0 1px 0 var(--rh-action-shadow);transition:transform var(--rh-motion-press) var(--rh-ease)}
```

---

## 6. Glim: poses, expressions, colourways, avatars

### 6.1 Locked anatomy
Glim has:
- a round, glossy **apricot** body;
- a short **copper** lantern cap topped with a **golden teardrop flame**;
- an **ivory open book** emblem in a gold frame on the belly;
- **plum** mitten hands and feet;
- glossy dark eyes, a small smile and coral cheeks.

Square files put the feet at 98% of the height, so every pose shares one baseline.

### 6.2 The 42 poses
Pattern: `characters/glim/poses/square-{512|256|128}/glim-{pose}.webp`

| Pose | Set | Use it for | Default motion |
|---|---|---|---|
| `idle` | core | Default standing pose, rig master, hero placements | breathe |
| `wave` | core | Welcome, sign-in, first visit | wave |
| `point` | core | Next action, current map node | nudge |
| `celebrate` | core | Quest complete | jump |
| `read` | core | Reader, Library, further readings | breathe |
| `think` | core | Goal picker, hints, curious moments | tilt |
| `thumbs` | core | Correct answer, daily quests | pop |
| `sleep` | core | Offline, quiet hours, retired manual | sleep |
| `trophy` | core | Arena, daily challenge | bounce |
| `highfive` | core | Co-op, circles, friends | sway |
| `run` | action | Loading, map travel, streaks | run |
| `lantern` | action | Night world, dark-mode hero, guiding | flicker |
| `goodbye` | action | Done for now, sign-out, leaving a circle | sway |
| `surprised` | action | Promotion reveal, new badge | pop |
| `listen` | action | Listening questions (Q24), audio settings | sway |
| `write` | action | Typed answers, notes, report form | breathe |
| `map` | action | Journey intro, planner, chapter sheet | tilt |
| `clap` | action | Milestones, match result | bounce |
| `hug` | action | Memory verse secured, welcome back | breathe |
| `search` | scene | Search, no results, practice builder | tilt |
| `shield` | scene | Safety, fair play, verification | breathe |
| `travel` | scene | Onboarding steps, new quarter or world | walk |
| `announce` | scene | Quiz Night host, announcements | nudge |
| `pointup` | scene | Tips, look above, tooltips | nudge |
| `peek` | scene | Empty library, shy empty states | tilt |
| `float` | scene | Unlocks, weightless joy | float |
| `letter` | scene | Invites, messages, notification opt-in | bounce |
| `medal` | scene | Badges, achievements, stage results | pop |
| `pray` | devotion | Further readings, prayer, reflection cards | breathe |
| `study` | devotion | Planner, study session, coach assignment | breathe |
| `pointleft` | devotion | Point left, back-navigation hints | nudge |
| `confident` | devotion | Ready for a challenge, stage countdown | breathe |
| `shrug` | devotion | No results, unknown state, small pool | tilt |
| `heart` | devotion | Encouragement, kudos, friends milestones | breathe |
| `stopwatch` | devotion | Timed match, countdown, reconnect window | tilt |
| `cheer` | devotion | Big wins, promotion, Quiz Night finale | cheer |
| `champion` | devotion | Stage result, Lantern tier, season champion | bounce |
| `stand` | turnaround | Front view, model sheet, neutral placements | breathe |
| `turn34left` | turnaround | Three-quarter view facing left: walking onto the map, side panels | breathe |
| `turn34right` | turnaround | Three-quarter view facing right: looking toward content | breathe |
| `profile` | turnaround | Side view: map travel, progress bars, walk cycles | walk |
| `back` | turnaround | Back view: heading into a world, leaving a screen | breathe |

### 6.3 Expressions (on-model)
- **Full body**, same neutral stance, only the face changes: `characters/glim/expressions/full/glim-expr-{happy|laugh|calm|curious|focused|surprised|sleepy|wink|warm}-{512|256}.webp`
- **Circular heads**, 13 expressions × 6 colourways: `characters/glim/expressions/heads/{colorway}/head-{expression}-{256|128}.png`
  - Expressions: `happy, laugh, calm, curious, focused, surprised, sleepy, wink, warm, proud, listening, cheer, prayer`.
  - The `classic` set also includes `-256-transparent.png`.

Use the heads for chat bubbles, notifications, toasts, comment avatars and Glim speech bubbles in onboarding. Swap expressions to match the tone: `curious` for hints, `proud` after promotion, `sleepy` during quiet hours.

### 6.4 Colourways (cosmetic rewards)
Pattern: `characters/glim/colorways/{colorway}/glim-{pose}-{512|256}.webp`. All 42 poses and 9 expressions exist in every colourway.

| Colourway | Look | Suggested way to earn |
|---|---|---|
| `classic` | apricot body, plum limbs | default |
| `twilight` | violet body, indigo limbs | finish a co-op quest |
| `meadow` | green body, forest limbs | complete Quarter 1 chapters |
| `rosewood` | pink body, berry limbs | earn the full badge set |
| `midnight` | cobalt body, navy limbs | night-owl badge |
| `ocean` | teal body, deep-teal limbs | reach the Lantern tier |

**What recolours and what never does.** Only the body surface and the limbs recolour. The **flame, copper cap, eyes, coral cheeks, mouth, the book emblem and its gold frame, and every prop** keep their original colours. Props include trophies, medals, maps, desks, lanterns, backpacks, shields, stopwatches, megaphones and books. Recolouring works on the detected body region, not on hue alone, so there are no stray orange patches.

**Colourway rules (v1.1).**
- Irises, sclera and eye outlines are restored from the classic art after recolouring (`eyefix.py`), so eyes are never tinted by the body colour. This covers poses, rig bodies, expressions, heads and avatars.
- The `study` desk, chair, book pages and pencil are props and keep their colours in every colourway (`palette.PROP_BOXES`).
- The `sleep` letters (Z) keep their gold in every colourway.
- Eyelid layers are recoloured as skin, so the closed eye always matches the face.

### 6.5 Avatars
`characters/glim/avatars/avatar-{colorway}-{256|128|64}.png` is a circular head of the idle pose on a tinted disc. Use them in league rows, chat, circles, Quiz Night and match lobbies, so the app never needs profile photos.

### 6.6 Behaviour rules
- **Glim may:** welcome, point to the next useful action, celebrate, rest when offline, and appear in co-op and collection moments.
- **Glim never:** reveals an answer before submission, claims religious authority, cries, threatens or guilts, covers text, inputs or status, or sits behind a rank change.
- **Alt text:** Glim is decorative by default (`alt=""` plus `aria-hidden`). Add a label only when Glim carries meaning that isn't in nearby text.

---

## 7. The rig
Every pose is split into **independent layers with pivots**, so arms, legs and the flame move on their own. This is a real cut-out rig, the technique used in production 2D games and motion design.

**Layers, back to front:**

| Layer | Contents | Pivot |
|---|---|---|
| `leg0`, `leg1` | feet | hip (top centre) |
| `flame` | the flame | its base; drawn behind the body so the cap always covers the joint |
| `body` | head and torso plate, with holes behind removed limbs re-painted | ground contact |
| `lid0`, `lid1` | eyelids for the blink (one `lid0` on `profile`); skin inpainted from the face around the eye, eyebrows left untouched, feathered edge | top of the eye |
| `arm0`, `arm1` | hands (plus any props held in them) | shoulder (point closest to body centre) |
| `prop*` | free props that are really held objects (map, trophy, lantern, ...) | prop centre |

**Data:**
- `rig/{pose}/rig.json` holds `size`, `bbox`, `layers` and `pivots` in source-pixel coordinates.
- `rig/rig-index.json` combines every pose.
- `rig-colorways/{cw}/{pose}/` holds the same layers in each colourway.

**Draw order (back to front):** `leg*`, `flame`, `body`, `lid*`, `arm*`, `prop*`. The flame sits **behind** the body, so the cap covers its base. `sleep` has no flame layer (its Z letters are baked into the body).

**Blink.** Poses with `lids > 0` show the lid layers for 4 frames (scale 0.6, 1, 1, 0.6) once per loop at about 60% of the loop, only on loops of 1.3 s or longer. Files: `lid0.webp`, `lid1.webp`; the lid is scaled on Y about its pivot.
- **Blink:** every pose except those listed next.
- **No blink, eyes already closed:** `celebrate`, `sleep`, `listen`, `pray`, `cheer`.
- **No blink, no face visible:** `back`.
- `profile` has one visible eye, so it has a single eyelid (`lid0`).
- `turn34left`, `turn34right` and `profile` no longer report a `prop` layer: it was the flame's inner core and is merged into `flame`. A pose only has `prop*` when it really holds an object.

**Joint quality:**
- **Clean-up (v1.1):** specks, cream shadow remnants (limb edges and the bottom edge) and slits in hands and feet are removed; dark baked edge colours on hands and feet are replaced by the colour of the solid interior; the body is re-painted under every limb inside its silhouette, so a rotated limb does not show a hole. At rest the rig matches the source pose art (see `qa/rest-fidelity.json`).
- **Shoulders and hips:** the contact shadow fades within the joint zone, so swinging limbs never show a seam.
- **Flame:** has an extended base, so it never detaches from the cap.
- **Edges:** pixels are colour-decontaminated, so there are no white fringes on dark backgrounds.

**Poses with joined hands** (`clap`, `hug`, `pray`, `confident`, `heart`, `listen`) and **hands holding props** (`trophy`, `champion`, `lantern`, `search`, `shield`, `announce`, `stopwatch`, `letter`, `map`, `write`, `study`, `read`, `peek`) have those arms locked by their `rig_amplitude`. The body, legs and flame still animate, but held objects never tear away.

**Using the rig:**
```html
<rhemlo-glim rig pose="idle" motion="walk" size="200"></rhemlo-glim>
<rhemlo-glim rig pose="idle" motion="wave" colorway="twilight" size="160" label="Glim waving hello"></rhemlo-glim>
```

**Your own engine** (Pixi, Phaser, Rive, Spine, Unity, canvas):
1. Load the layers.
2. Set each layer's origin to its pivot.
3. Each frame, read `motion/motions.json → motions[name].frames[i]`.
4. Apply `root` (translate, rotate and scale about the body pivot) to every layer.
5. Rotate `arm0` by `armL × amp.arm[0]` and `arm1` by `armR × amp.arm[1]`.
6. Rotate `leg0`/`leg1` by `legL`/`legR × amp.leg`.
7. Apply `flame` (`dx`, `dy`, `rot`, `sx`, `sy` × `amp.flame`).

Amplitudes are in `glim-catalog.json → poses[pose].rig_amplitude`.

---

## 8. Animation: five formats (plus two sequences)
All five are produced from the same rig and the same motion curves.

| Format | Location | Best for |
|---|---|---|
| **Live rig** | `<rhemlo-glim rig>` + `motion/motions.json` | In-app hero moments; any pose × any motion × any colourway |
| **CSS motion** | `motion/rhemlo-motion.css` on any static image | Lightweight motion everywhere (whole-character) |
| **Animated WebP** | `animated/webp/glim-{pose}-{motion}.webp` | Pre-rendered rig output where JS can't run (CMS, rich text) |
| **Lottie JSON** | `animated/lottie/glim-{pose}-{motion}.json` | lottie-web, dotLottie, Rive import, After Effects review |
| **Colourway Lottie** | `animated/lottie/{colorway}/glim-{pose}-{motion}.json` | Signature motion in each of the 5 colourways |
| **Sprite sheet** | `animated/sprites/glim-{pose}-{motion}-sprite.png` | Canvas, game loops, CSS `steps()` |
| **GIF** | `animated/gif/glim-{pose}-{motion}-{light|dark}.gif` | Email, docs, slides (pre-matted) |

Every pose has its signature motion and `breathe`. The `idle` master also has `walk`, `wave`, `jump`, `bounce`, `cheer`, `flicker` and `run`. Sprites (20 frames × 128 px) exist for the signature motion of all 42 poses; GIFs (180 px, light and dark) for the 10 core poses.

**Sequences**
| Sequence | Files | What it is |
|---|---|---|
| `glim-profile-walk` | `animated/{webp,lottie,sprites}/glim-profile-walk…` | Side-view walk: legs swing ±20°, body bobs 4 px twice per cycle, the single arm counter-swings, the flame lags slightly. Loop 1.0 s. Live: `<rhemlo-glim rig pose="profile" motion="walk">` |
| `glim-turnaround` | `animated/{webp,lottie,sprites}/glim-turnaround…` | `stand` → `turn34right` → `profile` → `back` → `turn34left` → `stand`, 0.25 s per view (24 fps, 36 frames), 2-frame crossfade with a 0.97 squash at each swap. Every view shares one scale, one feet baseline and one centre; eyes are open in every view. Live: `<rhemlo-glim turnaround>` |

### 8.1 Motion vocabulary
| Motion | What moves | Loop |
|---|---|---|
| `breathe` | body squash-and-stretch, arms drift, flame sways | 2.0s |
| `sleep` | slow deep breath, flame dims and stretches | 2.6s |
| `sway` | body rocks ±6°, arms counter-swing, flame lags | 1.6s |
| `tilt` | curious tilt ±7°, arms counter, flame lags | 2.2s |
| `float` | hover with roll, arms and feet paddle | 2.4s |
| `nudge` | two pushes right, leading arm extends | 1.4s |
| `pop` | single pop, arms flare, flame jumps | 1.6s |
| `bounce` | hop with landing squash, arms and legs swing | 1.0s |
| `run` | fast bob, arms pump, legs stride | 0.8s |
| `walk` | gentle bob (twice per cycle), arms and legs alternate, flame lags slightly | 1.0s |
| `wave` | right hand waves twice, body rocks | 1.2s |
| `jump` | anticipate → 52px jump with arms up → land squash | 1.4s |
| `cheer` | both arms pump high, body bobs | 1.2s |
| `flicker` | flame-only flicker (natural layered noise) | 1.8s |

### 8.2 Lottie
```js
import lottie from 'lottie-web';
lottie.loadAnimation({ container: el, renderer: 'svg', loop: true, autoplay: true,
  path: '/rhemlo-assets/characters/glim/animated/lottie/glim-idle-walk.json' });
```
Each file is 320×320 at 25fps. It uses one image layer per body part, parented to a root null. Keys are every 2 frames (linear). Lid layers use hold-keyframed opacity and exist only in loops that contain a blink. Every file was rendered with lottie-web 5.13 (canvas and SVG). The offline player `rhemlo-lottie.js` plays the same files without dependencies: `playLottie(element, urlOrObject)`.

### 8.3 Choreography
| Moment | Glim | Notes |
|---|---|---|
| Welcome (R01) | rig `idle` → `wave` once, then `breathe` | once per session |
| Map current node (R07) | `point` + nudge | pause when the chapter sheet opens |
| Correct (R22) | `thumbs` pop inside the feedback sheet | never in the question area |
| Quest complete (R24) | `celebrate` jump, then `breathe` | maximum 2 loops |
| Promotion (R31) | head `surprised` → `cheer` | only after server finalisation |
| Demotion (R31) | `thumbs` static | calm, no motion |
| Offline (R44) | `sleep` sleep | |
| Welcome back (R28) | `hug` breathe | |
| Quiz Night | `trophy`, `announce` (host), `cheer` (finale) | |
| Loading / map travel | rig `idle` → `run` or `walk` | swap for a skeleton after 400ms |
| Map travel, progress bars | `profile` walk (side view) | Glim walks left to right along the path |
| Walking onto a screen | `turn34left` / `turn34right`, then `stand` | choose the side Glim enters from |
| Entering a world | `back` view, or the `turnaround` sequence | Glim faces away as the world opens |
| Model sheet, onboarding intro | `turnaround` sequence | one loop, then hold `stand` |

---

## 9. Quest worlds and scenes

### 9.1 Maps: every world is painted in both day and night
| World | Theme | Use |
|---|---|---|
| `meadow-day` / `meadow-night` | light / dark | Quarter 1 |
| `autumn-day` / `autumn-night` | light / dark | Quarter 2 |
| `coast-day` / `coast-night` | light / dark | Quarter 3 |
| `summit-day` / `summit-night` | light / dark | Quarter 4 and Finale |

Files: `worlds/maps/{world}/{world}-1254.jpg` and `{world}-{1254|800|480}.webp`.

### 9.2 Node anchors
`worlds/maps/anchors.json` gives 8 points per world, sitting on the painted path, ordered bottom (first) to top (last). Each world has `nodes_px` (on a 1254px basis) and `nodes_norm` (0–1). They were traced from the path itself and visually verified on all 8 worlds.

```js
const [nx, ny] = anchors[world].nodes_norm[i];
node.style.left = `${ox + nx * size}px`; node.style.top = `${oy + ny * size}px`; // node CSS: translate(-50%,-55%)
```
- **Mobile framing:** render the map at about 900px and pan so the current node sits around (167, 255).
- **Quarters with more than 8 lessons:** each quarter has 12 lessons plus a stage check. Page through 8-node windows of the same world as the learner progresses.
- **Node semantics:** done = green check, current = grape star, review = apricot rotate, locked = lavender lock, reward = gold gift, stage test = plum flag.

### 9.3 Scenes
- `hero-sunrise`: welcome hero, landing page, circle banners, marketing.
- `stage-quiznight`: Quiz Night join, lobby, and host projector. Use it at 18–30% opacity behind the host UI.

Each scene has square sizes plus `-wide-1200x675.webp`.

---

## 10. Emblems, badges, items, Arena props, states
| Family | Pattern | Members |
|---|---|---|
| League tiers | `emblems/tiers/tier-{t}.png`, `-256.webp`, `-128.webp` | bronze → silver → gold → jade → amethyst → lantern |
| Badges | `emblems/badges/badge-{b}.png`, `-128.webp`, `locked/badge-{b}-locked.png` | seed (first quest) · flame (seven-day week) · chapter · coop · target (perfect sitting) · night (night owl) · lantern (verse secured) · fair (fair play) · star (milestone) |
| Reward items | `emblems/items/item-{i}.png`, `-128.webp` | chest · chest-open · key · gem · star · scroll · crown · candle · books |
| Arena / Quiz Night | `emblems/arena/arena-{a}.png`, `-128.webp` | podium · buzzer · versus · medal · confetti · mic |
| States | `illustrations/states/state-{s}.png`, `-256.webp` | offline · caughtup · locked · notify · safety · planner · noresults · error · pending · sent · reward · syncing |

All of them render cleanly on light and dark: ground shadows are removed and glows are converted to translucent colour.

---

## 11. Brand, icons and PWA
- **Logo:**
  - `wordmark-{plum|vanilla|grape}.svg` are outlined Nunito 900, so no font is needed.
  - `lockup-{plum|vanilla}.svg` combine Glim and the wordmark.
  - Use plum on light, vanilla on dark, and grape only on vanilla.
- **Head tags:**
```html
<link rel="icon" href="/rhemlo-assets/brand/app-icons/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/rhemlo-assets/brand/app-icons/icon-32.png">
<link rel="apple-touch-icon" href="/rhemlo-assets/brand/app-icons/apple-touch-icon.png">
<link rel="manifest" href="/rhemlo-assets/brand/app-icons/site.webmanifest">
<meta name="theme-color" content="#7041D9">
<meta property="og:image" content="/rhemlo-assets/brand/social/og-image-1200x630.png">
```
- **Icons:** Font Awesome Free 6.4.0. The five destinations are `fa-map-location-dot` (Journey), `fa-bolt` (Practice), `fa-trophy` (Arena), `fa-people-group` (Circle) and `fa-circle-user` (You).

---

## 12. Screen-to-asset map
| Screen | Glim | World / scene | Other |
|---|---|---|---|
| R01 Welcome | rig `idle` wave → breathe | `hero-sunrise` (light), `meadow-night` (dark) | lockup, badges as promise icons |
| R02 Account | `wave` | | |
| R03 Goals | `think` + head `curious` in bubble | | badges target/star/seed |
| R05–R06 Pace/Privacy | `travel` walk | | |
| R07 Journey | `point` nudge | quarter world + anchors | node tokens, glass cards |
| R08 Chapter sheet | | dimmed world | |
| R09 Daily quests | `thumbs` | | `badge-flame` |
| Further readings | `pray` | | `item-scroll`, `item-candle` |
| Stage countdown | `confident` / `champion` | | `item-crown`, `arena-podium` |
| R10 Practice hub | `point` | | |
| R11 Library / reader | `read` | | `item-books` |
| R12 Memory ladder | `point` | | |
| R13–R21 Questions | none in the answer area | | `listen` beside the Q24 player only |
| R22 Correct | `thumbs` pop in the feedback sheet | | |
| R24 Complete | `celebrate` jump | | `badge-lantern`, `state-reward`, `item-chest-open` |
| R26 Planner | `study` / `map` | | `state-planner` |
| R28 Welcome back | `hug` | | |
| R29 Arena | `trophy` | | tiers |
| R30 League | colourway avatars | | tier emblem |
| R31 Promotion / demotion | head `surprised` → `cheer` / `thumbs` | | tier emblems, `arena-confetti` |
| R33 Daily challenge | `confident` | | `badge-fair`, `state-pending`, `item-key` |
| R34–R36 Match | colourway poses, `stopwatch` | | `arena-versus`, `arena-medal` |
| Quiz Night | `announce` (host), `trophy`, `cheer` | `stage-quiznight` | `arena-buzzer`, `arena-mic`, `arena-podium` |
| R37 Milestones | avatars, `heart` | | badges |
| R38 Co-op | `highfive` + partner colourway | | twilight reward preview |
| R39–R40 Circle | avatars, heads in chat | `hero-sunrise` banner | |
| R41 Safety | `shield` | | `state-safety`, `state-sent` |
| R42 Profile | chosen colourway | | colourway grid, badges, items |
| R43 Appearance | | world thumbnails day/night | |
| R44 Offline | `sleep` | | `state-offline`, `state-syncing` |
| R45 Access / retired | `sleep`, `peek` | | `state-locked`, `item-key` |
| R48 Notifications | `letter`, head `sleepy` (quiet hours) | | `state-notify` |
| R49 States / recovery | `point`, `shrug`, `peek` | | `state-error`, `state-caughtup`, `state-noresults` |

---

### 12.1 Turnaround and side-view uses
| Need | Asset |
|---|---|
| Glim travels along a Journey path | `profile` walk (rig, WebP or Lottie) |
| Glim walks onto a screen from the left or right | `turn34left` / `turn34right` pose or rig |
| Glim heads into a world, or leaves a screen | `back` pose |
| Character introduction, about page | `turnaround` sequence |

## 13. Performance and delivery
- Prefer `.webp`. PNG masters are for editing and fallbacks.
- Always set `width` and `height` on images.
- Lazy-load below the fold. Preload only the current world at 800px and the two Latin fonts.
- Keep the first-screen art at 250KB or less on mobile: use 480px maps on phones and 800px on tablet and desktop.
- Use the live rig or CSS first. Pre-rendered WebP animations are heavier.
- Cache `/rhemlo-assets/*` immutably and version the folder when art changes.

---

## 14. Accessibility
- Characters and worlds are decorative by default (`alt=""` plus `aria-hidden`).
- Quest nodes are buttons with accessible names. Provide a list view of the map.
- Tiers and badges always have visible text labels.
- Under `prefers-reduced-motion`, swap animated files for static twins:
```js
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
img.src = reduce ? `…/square-256/glim-${pose}.webp` : `…/animated/webp/glim-${pose}-${motion}.webp`;
```

---

## 15. Verification and quality report
See `VERIFICATION.md` for the full numbers and `qa/` for the contact sheets. In summary:
- **Lottie, independent evaluator:** all 289 Lottie files (including the colourway files and the turnaround) were re-rendered by `lottie_eval.py`, which reads only the JSON, and compared with the reference renderer on 3 to 5 keyframes (including a blink frame): 289/289 pass, worst mean error 0.0468/255.
- **Lottie, official player:** all 289 files were rendered with lottie-web 5.13 in headless Chromium (canvas and SVG), 3 to 4 frames each: median 0.94/255, worst 1.65/255.
- **Demo:** the gallery self-test reports OK in light and dark, from `file://`, with zero console errors (`qa/demo-selftest.json`).
- **Visual inspection:** closed-lid frames of all 36 blinking poses, peak-swing frames of all 42 poses at their shipped amplitude, animation contact sheets, colourway sheets of all 42 poses × 6 colourways, heads and avatars, and the turnaround.

---

## 16. Sources and regeneration
- `_source/generated-sheets/` holds the original generated sheets.
- `_source/tools/` holds every script:
  - `cut.py`: background removal, flat-gap detection, edge decontamination.
  - `deshadow.py`: shadow and halo removal, un-matting.
  - `rig.py`: rig extraction.
  - `anim.py`: motion curves and amplitudes.
  - `render.py`: rig renderer.
  - `lottie.py` and `lottie_eval.py`: Lottie writer and independent checker.
  - `palette.py`: region-based recolouring.
  - `faces.py`: head crops.
  - `anchors.py`: path tracing.
  - `build*.py`: packaging.
  - v1.1: `build_anim.py` (animations), `build_code.py` (catalog, types, motions, JS), `build_demo.py`, `selftest.py`, `lottieweb_all.py`, `polish_*.py` (eyelids, colourways, rig clean-up), `rigclean.py`, `eyefix.py`, `fidelity.py`, `qa_sheet.py`, `peaksheet.py`. Run them from `_source/tools/`; the pack root is found from the script location. The older `build1`–`build6`, `c1`/`c2` scripts expect to be run with the pack root as the working directory.
- `PROMPTS.md` holds the exact image prompts.
- **To add a new pose:** generate a 3×3 sheet with the model-sheet prompt, add it to `recut.py`, add the pose to `POSES` in `tools/common.py` (and an amplitude in `anim.py`), then rerun the builds.

---

## 17. Instructions for implementation assistants
1. Read this guide, then `glim-catalog.json`, `worlds/maps/anchors.json`, `tokens/tokens.css` and `motion/motions.json`.
2. Copy `rhemlo-assets/` into the static folder unchanged.
3. Build typed helpers from `glim-catalog.json → paths`.
4. Use `reference/Rhemlo_UIUX_Concept_Board_v0.2.pdf` as the visual source of truth for every screen.
5. Prefer the live rig (`<rhemlo-glim rig>`) and CSS motion. Use pre-rendered files only where those can't run.
6. Never generate, trace or approximate character art, maps or emblems.
7. Grading, scheduling and content rules come from the Rhemlo bundle and the Product/UX Companion. Art never changes behaviour.
8. Ship light, dark and system themes together, with no flash on load.
9. Verify against the checklist below and attach screenshots in both themes.

## 18. Acceptance checklist
- [ ] `demo/index.html` shows **self-test OK** in both themes.
- [ ] No 404s on Journey, Practice, Arena, Circle or You.
- [ ] Only Glim files from this pack are used; no placeholder art remains.
- [ ] Journey nodes sit on the painted path for every world, on phone, tablet and desktop.
- [ ] Dark mode uses the painted night worlds.
- [ ] Reduced motion stops the rig, CSS motion and pre-rendered animations.
- [ ] Tiers and badges always show text labels.
- [ ] Favicon, apple-touch icon, manifest and OG image resolve.
- [ ] First mobile screen art is 250KB or less.
- [ ] Answer areas contain no animated characters.

## 19. Known limits
- **Source resolution.** Ten poses (`cheer`, `champion`, `sleep`, `shrug`, `stopwatch`, `pointleft`, `confident`, `heart`, `pray`, `study`) are native high-resolution renders (about 1,200 px tall, 750 px for the lying `sleep`) and are safe at large sizes. The other poses still come from lower-resolution generated art (about 360-595 px per figure); use them at 320 px or smaller, or use `idle` and the ten high-res poses for larger placements. The ten replacements differ slightly from the earlier art: `champion` kicks the other foot and holds a smaller trophy, `sleep` has a slightly different face and arm, `study` has a redrawn desk and chair. Small orange sleeve edges remain at the sides of `study` in the colourways.
- **Hands-only arms.** The arm layers are the hands; the sleeves belong to the body. Swings beyond roughly 30° pull a hand away from its sleeve. Every shipped motion stays inside the amplitudes in `rig_amplitude`; do not scale them up in your own engine.
- **Held props.** Hands that hold an object (trophy, map, lantern, backpack, ...) are locked by `rig_amplitude`. `travel` keeps its backpack hand locked for the same reason.
- **lottie-web.** Its output differs from the reference renderer by a mean of about 1 out of 255 because it resamples images differently. Visually identical (see `VERIFICATION.md`).
- **Pack size.** The five colourway Lottie sets are large (about 250 KB per file, images embedded). Ship only the ones you use.
- **Artwork terms.** The art was generated with Microsoft Copilot; confirm the terms for commercial use (see `LICENSES.md`).
