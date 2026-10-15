# KorKru brand assets

The owner approved the three-antler mark and its Production release on 14 October 2026.

- `deer-mark-three-antlers-source.png`: approved imagegen concept, retained unchanged. The third antler curves outward to the upper left above the ear.
- `deer-mark.svg`: flat single-color vector trace of that approved silhouette, with a transparent background and no embedded bitmap, gradients, filters or glow.
- `components/brand-mark-data.ts`: generated path, viewBox, aspect ratio and versioned asset URL shared by the UI and classroom cover pattern.
- `components/brand-logo.tsx`: renders the mark as a theme-colored mask, matching the `o` in `KorKru`. Other letters retain `brand-foreground`. The aspect ratio comes from the generated geometry.
- `app/icon.png`: black deer on a full-size white circle with transparent corners, recolored only during browser icon generation for tab legibility (owner approved 14 October 2026). On 15 October 2026, browser-only artwork was enlarged from 86% to 96% of the canvas with a 16-unit rounded black outline and a padded viewBox to preserve the antler tips at tab sizes.
- `app/apple-icon.png`: retains the purple deer on the white circle. The shared SVG and all in-page logos retain their original purple/theme colors.
- The original `deer-mark-source.png`, earlier `deer-mark.png`, `legacy-icon.png`, `legacy-apple-icon.png`, and `public/logo.png` remain historical assets; active logo surfaces use the new mark.

Regenerate the vector and shared geometry with `node scripts/vectorize-brand-mark.mjs`, then regenerate browser and home-screen icons with `node scripts/build-brand-icons.mjs`.

## Approved imagegen edit prompt

Revise the third antler to follow the red guide's broad sweep from above and behind the ear toward the upper left, with an upright rounded tip. Replace the former short left antler; keep exactly three antler tips. Refine the curve, stroke weight and spacing, join the base smoothly, remove the red guide and make the entire mark purple. Preserve the deer head, ear, muzzle and neck.
