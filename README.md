# UMBRA — 罗马光影工坊

A live architectural printmaking studio: original procedural Roman architecture, hard directional shadows, two-value color, and a level camera that preserves architectural verticals.

## Experience

- Three complete compositions: colonnaded forum, domed temple, and two-tier aqueduct.
- Horizontal drag or arrow keys to recompose; a perspective slider changes depth compression while preserving the framing at the focus plane.
- Independent sun direction and altitude controls, three two-color palettes, optional periodic camera tour, fullscreen, reset.
- PNG export re-renders the current composition with a 3,840-pixel longest edge and omits all interface elements.
- Rendering is demand-driven while static; motion pauses when the document is hidden. The initial scene is still, including for reduced-motion users.

These are artistic architectural studies, not archaeological reconstructions of specific monuments.

## Source map

- `app/page.tsx`, `app/globals.css`: responsive studio interface.
- `components/RomanViewer.tsx`: Three.js lifecycle, camera, light, two-tone postprocess, PNG export.
- `lib/roman-geometry.ts`: original merged geometry, genuine open archways, columns, dome and plaza details.
- `lib/software-renderer.ts`: Canvas compatibility renderer using the same 3D triangles, a depth buffer and a cached directional shadow map.

The WebGL renderer uses a Lambert illumination/shadow pass and a normal/depth pass, followed by an explicit two-value threshold and restrained edges. Browsers without WebGL use the same geometry in a Canvas software renderer with actual cast shadows. There are no external image, font, model or runtime CDN dependencies.

## Verification

The Canvas path was exercised in the managed browser: three scene switches, palette/light/perspective controls, drag, immersive viewing, reset, notes and keyboard closing. A 390 px iframe checked responsive layout; its content width equaled its scroll width. A downloaded PNG was inspected as RGB, 3840 × 1729 pixels for the tested viewport, with exactly two colors. Export aspect ratio follows the current artwork viewport. The managed browser disables WebGL, so the GPU path received static/type/build verification but not live GPU rendering verification in that environment.

## Development

Use the Sites development and publication helpers supplied with this project. `npm run dev` starts the framework locally; `npm run build` builds the Worker application. `npx tsc --noEmit` checks types.

Simcraft's `perspective-illusion` and `code-loop` skills informed the rendering and camera approach. Attribution and licensing are in `THIRD_PARTY_NOTICES.md`.
