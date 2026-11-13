# Three.js / TSL port

Base: `3dd589b`, the last commit whose application entry point still runs on Three.js/WebGPU + TSL.

Goal: bring current Tidewater features forward onto the Three.js/TSL architecture while preserving native WGSL temporarily where it is safer or clearer.

## Migration rules

- Keep `main` untouched; all work happens on `three-tsl-port`.
- Carry renderer-independent JavaScript forward unchanged where possible.
- Translate engine/material code back to Three.js/TSL subsystem by subsystem.
- Keep difficult compute kernels in native WGSL initially when that reduces risk.
- Preserve tests and add focused regression checks as systems move.
- Prefer an early playable hybrid over blocking the port on secondary rendering polish.

## Current milestone

The fishing game is wired into the historical Three application. The core loop now has its game state,
rod/reel/bobber, current deck-capable player modes, vendors, procedural stalls, HUD, minimap/guide, audio
code and fishing sound assets on the port branch.

The branch still needs a real browser/Vite build-and-run pass. A branch-only GitHub Actions workflow is
present, but Actions may need to be enabled on the fork before GitHub will run it.

## Status

| Area | Status | Notes |
| --- | --- | --- |
| Base Three.js/TSL app | baseline | Three r186 application at 3dd589b |
| FishTable | carried forward | Renderer-independent |
| Bites | carried forward | Renderer-independent |
| CatchMinigame | carried forward | Renderer-independent |
| Gear | carried forward | Renderer-independent |
| GameState | carried forward | Renderer-independent |
| Game logic tests | carried forward | Pure Node test |
| GameMaterials | ported | Procedural props and fishing line translated from WGSL to TSL |
| FishingRod | ported | Geometry/state retained; reel, spool, bend and line ribbon are TSL |
| CatchDisplay | ported | Reuses the existing Three FishProps batch API |
| Player | ported | Current walk/swim/deck/helm state machine; fishing busy-gating restored |
| Game coordinator | ported/wired | Constructed in App.init and updated after Player |
| GameHUD | carried forward | DOM HUD; studio portrait currently degrades gracefully |
| Minimap / Guide | carried forward | DOM/canvas logic |
| Vendor | ported | Three GLTFLoader + AnimationMixer wrapper; procedural fallback retained |
| FishStand | playable first pass | Procedural stall; scanned Poly Haven kit pending |
| Chandlery | playable first pass | Procedural table; scanned Poly Haven kit pending |
| Vendor character assets | carried forward | Joe/Marta Rocketbox GLBs and license reused by blob SHA |
| Fishing audio | carried forward | Current SoundScape/soundBank and added OGG assets |
| FishPortrait | temporary fallback | API placeholder; full offscreen Three studio renderer pending |
| Scanned StallKit | pending | Texture arrays + scanned-material TSL translation |
| Ocean FFT | existing TSL baseline | Compare current native improvements before changing |
| Wake/Shore simulations | existing TSL baseline | Compare current native improvements before changing |
| Branch CI | added | npm ci + npm test + npm run build on three-tsl-port pushes |

## Next graphics work

1. Run/build the branch and fix any TSL/compiler integration errors in GameMaterials/FishingRod.
2. Port FishPortrait to a Three/WebGPU offscreen/studio render path.
3. Port StallKit textures/materials to TSL and switch Joe/Marta from procedural fallbacks to scanned assets.
4. Then compare post-base ocean/wake/shore improvements against their existing Three/TSL versions.
