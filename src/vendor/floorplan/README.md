# Vendored: Floorplan viewer

A snapshot of the viewer from [Floorplan](https://github.com/haydenschmitty/floorplan) v0.6.2
(MIT, © 2026 Hayden Smith — see `LICENSE`), plus elkjs and the Inter / JetBrains Mono fonts under
their own licences (`assets/vendor/`).

Changes from upstream: `assets/ui/50-cloud.js` (the "Floorplan Cloud" promo) is not vendored, and
the build script hides the Ask bar. Nothing else is edited.

`template.generated.ts` is the assembled page with only the data and title placeholders left.
Regenerate it after touching `assets/`: `pnpm floorplan:template`.
