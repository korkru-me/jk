# KorKru brand assets

Approved by the product owner on 6 October 2026 (UI-002).

- `deer-mark-source.png`: exact original image supplied by the owner; retained unchanged.
- `deer-mark.png`: transparent cutout prepared with the built-in imagegen tool.
- `legacy-icon.png` and `legacy-apple-icon.png`: unchanged copies of the previous browser and home-screen icons.
- The previous full logo remains unchanged at `public/logo.png`; retain it for future use.
- `components/brand-logo.tsx` uses the new mark with the exact wordmark `KorKru` (both K letters uppercase). Light mode retains navy/orange. Dark mode renders the mark white. Following UI-009, other letters use `brand-foreground`: `#002262` in light mode, sampled from the dominant high-alpha navy pixels of the mark, and white in dark mode. The `o` retains the approved UI-007 `brand-accent` orange (`#c65300` light / `#ff9b4a` dark). This is darker than the mark's approximately `#fe5d00` orange; an exact-orange change awaits the owner's choice. The raster mark and previous assets are unchanged.
- `node scripts/build-brand-icons.mjs` resizes the approved mark into `app/icon.png` and `app/apple-icon.png` on a white square so it remains legible in browser and OS chrome. It does not change the source mark.

## Final imagegen prompt

Extract the EXACT original deer logo into a PNG with true alpha transparency. This is a strict graphic cleanup, not creative generation. The original mark is a SOLID FLAT two-color graphic: navy blue deer shape, orange antler tip. Keep every curve and proportion identical to the source. Output solid opaque navy and orange inside the mark; all background including holes in the ear and between antlers must be 100% transparent with alpha zero. Absolutely NO glow, NO aura, NO gradients, NO smoke, NO soft shadows, NO colored halos, NO shading. The logo must have clean sharp hard boundaries with only normal one-pixel edge antialiasing. The transparent canvas must be closely cropped around the original shape. No text, no watermark. Preserve the original, do not invent a new deer.
