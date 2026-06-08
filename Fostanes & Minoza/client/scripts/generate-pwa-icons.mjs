// One-shot script to rasterize public/favicon.svg into PWA icon PNGs.
// Generates:
//   public/icon-192.png             — 192x192, full-bleed
//   public/icon-512.png             — 512x512, full-bleed
//   public/icon-maskable-512.png    — 512x512, with ~20% safe-area padding so
//                                     Android adaptive icons can crop without
//                                     cutting off the lightbulb / "L" glyph.
//
// Run from the client/ directory:
//   node scripts/generate-pwa-icons.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const publicDir = resolve(projectRoot, 'public');
const svgPath = resolve(publicDir, 'favicon.svg');

async function main() {
  const svg = await readFile(svgPath);
  await mkdir(publicDir, { recursive: true });

  // Full-bleed 192 and 512.
  await sharp(svg, { density: 384 })
    .resize(192, 192, { fit: 'contain', background: { r: 12, g: 14, b: 19, alpha: 1 } })
    .png()
    .toFile(resolve(publicDir, 'icon-192.png'));
  console.log('  ✓ icon-192.png');

  await sharp(svg, { density: 1024 })
    .resize(512, 512, { fit: 'contain', background: { r: 12, g: 14, b: 19, alpha: 1 } })
    .png()
    .toFile(resolve(publicDir, 'icon-512.png'));
  console.log('  ✓ icon-512.png');

  // Maskable 512: rasterize the SVG to ~308x308 (60% of 512), then composite
  // onto a 512x512 brand-colored canvas centered. That gives ~20% safe-area
  // padding on each side so Android adaptive icon crop won't cut off the glyph.
  const inner = 308;
  const innerPng = await sharp(svg, { density: 1024 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 12, g: 14, b: 19, alpha: 1 },
    },
  })
    .composite([{ input: innerPng, gravity: 'center' }])
    .png()
    .toFile(resolve(publicDir, 'icon-maskable-512.png'));
  console.log('  ✓ icon-maskable-512.png');
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
