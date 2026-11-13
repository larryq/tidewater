# Three.js / TSL port

Base: `3dd589b`, the last commit whose application entry point still runs on Three.js/WebGPU + TSL.

Goal: bring current Tidewater features forward onto the Three.js/TSL architecture while preserving native WGSL temporarily where it is safer or clearer.

## Migration rules

- Keep `main` untouched; all work happens on `three-tsl-port`.
- Carry renderer-independent JavaScript forward unchanged where possible.
- Translate engine/material code back to Three.js/TSL subsystem by subsystem.
- Keep difficult compute kernels in native WGSL initially when that reduces risk.
- Preserve tests and add focused regression checks as systems move.

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
| Game coordinator | pending | Mostly JS; adapters needed |
| Fishing rod | porting next | Geometry reusable; material/vertex animation needs TSL |
| Vendors/stalls | pending | Geometry reusable; loaders/materials need Three adapters |
| Fish portrait | pending | Needs Three render-target/post implementation |
| Ocean FFT | existing TSL baseline | Compare current native improvements before changing |
| Wake/Shore simulations | existing TSL baseline | Compare current native improvements before changing |
