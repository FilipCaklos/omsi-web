// Vygeneruje logá pre emaily (PNG, 2× pre ostré zobrazenie) do public/brand/.
// Spustenie: node scripts/generate-brand.mjs  (vyžaduje systémové písma Arial a Consolas/DejaVu Sans Mono)
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.resolve(import.meta.dirname, "../public/brand");
mkdirSync(OUT, { recursive: true });

const AMBER = "#F59E0B";
const INK = "#0B0D10";

/** LED štítok linky „OD“ – rovnaký ako favicon a hlavička webu */
function tag(x, y, size) {
  const w = size * 1.9;
  return `<rect x="${x}" y="${y}" width="${w}" height="${size}" rx="${size * 0.14}" fill="${INK}" stroke="#2A2F38" stroke-width="${size * 0.05}"/>
  <text x="${x + w / 2}" y="${y + size * 0.72}" text-anchor="middle" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-weight="700" font-size="${size * 0.62}" fill="${AMBER}" letter-spacing="${size * 0.04}">OD</text>`;
}

/** Wordmark: štítok + názov + podtitul + pásik ako na označníku zastávky */
function wordmark({ textColor, subColor }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="160" viewBox="0 0 560 160">
  ${tag(8, 34, 92)}
  <text x="200" y="88" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="58" fill="${textColor}">OMSI <tspan fill="${AMBER}">Depo</tspan></text>
  <text x="202" y="126" font-family="Arial, Helvetica, sans-serif" font-size="25" fill="${subColor}">CZ/SK modifikácie pre OMSI 2</text>
  <rect x="200" y="140" width="120" height="6" rx="3" fill="${AMBER}"/>
  <rect x="328" y="140" width="40" height="6" rx="3" fill="${AMBER}" opacity="0.55"/>
  <rect x="376" y="140" width="16" height="6" rx="3" fill="${AMBER}" opacity="0.3"/>
</svg>`;
}

/** Štvorcová značka (avatar v podpise, Discord, sociálne siete) */
function mark() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="40" fill="${INK}"/>
  <rect x="10" y="10" width="236" height="236" rx="32" fill="none" stroke="#2A2F38" stroke-width="6"/>
  <text x="128" y="160" text-anchor="middle" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-weight="700" font-size="112" fill="${AMBER}">OD</text>
  <rect x="64" y="196" width="72" height="10" rx="5" fill="${AMBER}"/>
  <rect x="144" y="196" width="28" height="10" rx="5" fill="${AMBER}" opacity="0.55"/>
  <rect x="180" y="196" width="12" height="10" rx="5" fill="${AMBER}" opacity="0.3"/>
</svg>`;
}

const outputs = [
  ["logo-on-dark.png", wordmark({ textColor: "#FFFFFF", subColor: "#9AA4B2" })],
  ["logo-on-light.png", wordmark({ textColor: "#11151C", subColor: "#5B6575" })],
  ["mark.png", mark()],
];
for (const [name, svg] of outputs) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(OUT, name));
  console.log("public/brand/" + name);
}
