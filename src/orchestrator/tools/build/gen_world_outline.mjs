/**
 * gen_world_outline — bakes the threat map's world geometry.
 *
 * Converts Natural Earth 10m countries (from the world-atlas TopoJSON package)
 * into per-country equirectangular SVG paths, keyed by ISO 3166-1 alpha-2, and
 * writes them as a static module. One dataset does three jobs: rendered filled
 * it is the land; stroked it gives coastlines and country borders; and keyed by
 * ISO it lets the map tint each country by how many threats it is hosting (a
 * choropleth). Territories with no alpha-2 code (disputed / uncoded) are kept
 * under an empty key so no landmass goes missing.
 *
 * This runs OFF the critical path. Its output is committed, so the console
 * itself carries no mapping dependency, makes no network request, and works on
 * an air-gapped node — the properties the previous Leaflet-from-a-CDN build
 * could not offer.
 *
 * Regenerate (needs npm, one-off):
 *   npm i --no-save world-atlas topojson-client world-countries
 *   node src/orchestrator/tools/build/gen_world_outline.mjs 0.2 \
 *        src/orchestrator/interface/web/components/islands/world-outline.js
 *
 * The tolerance argument (Douglas-Peucker, projected units) trades fidelity
 * against size. 10m detail explodes below ~0.2, so 0.2 is the sweet spot:
 * crisp coastlines and every small nation, without bloating the bundle.
 *
 * Natural Earth is public domain: naturalearthdata.com/about/terms-of-use
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(fs.readFileSync(require.resolve("world-atlas/countries-10m.json"), "utf8"));
const worldCountries = JSON.parse(fs.readFileSync(require.resolve("world-countries/countries.json"), "utf8"));
const numToAlpha2 = new Map(worldCountries.map((c) => [String(Number(c.ccn3)), c.cca2]));

const WORLD = { width: 360, height: 180 };
const px = (lon) => (lon + 180);
const py = (lat) => (90 - lat);

function perp(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  let maxD = -1, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perp(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)];
}
function simplifyRing(pts, tol) {
  const closed = pts.length > 2 &&
    pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  if (!closed) return dp(pts, tol);
  const open = pts.slice(0, -1);
  if (open.length < 4) return pts;
  let far = 1, farD = -1;
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
    if (d > farD) { farD = d; far = i; }
  }
  const a = dp(open.slice(0, far + 1), tol);
  const b = dp(open.slice(far).concat([open[0]]), tol);
  return [...a.slice(0, -1), ...b];
}
const round = (n) => Math.round(n * 10) / 10;

function splitAtAntimeridian(pts) {
  const segments = [];
  let current = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i][0] - pts[i - 1][0]) > 180) { segments.push(current); current = [pts[i]]; }
    else current.push(pts[i]);
  }
  segments.push(current);
  return segments;
}

/** Filled ring — closed, antimeridian-safe. */
function ring(coords, tol) {
  const projected = coords.map(([lon, lat]) => [px(lon), py(lat)]);
  const segments = splitAtAntimeridian(projected);
  const pieces = segments.map((seg) => {
    if (seg.length < 2) return "";
    const wrapped = segments.length > 1;
    let pts = simplifyRing(seg, tol);
    if (pts.length < (wrapped ? 2 : 4)) return "";
    if (wrapped) {
      const mid = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const edge = mid > WORLD.width / 2 ? WORLD.width : 0;
      pts = [...pts, [edge, pts[pts.length - 1][1]], [edge, pts[0][1]]];
    }
    return "M" + pts.map(([x, y]) => `${round(x)} ${round(y)}`).join("L") + "Z";
  });
  return pieces.filter(Boolean).join("");
}

function countryPath(geom, tol) {
  const out = [];
  if (geom.type === "Polygon") out.push(...geom.coordinates.map((r) => ring(r, tol)));
  else if (geom.type === "MultiPolygon") for (const poly of geom.coordinates) out.push(...poly.map((r) => ring(r, tol)));
  return out.filter(Boolean).join("");
}

const TOL = Number(process.argv[2] ?? 0.2);

// [iso2, path] pairs. Uncoded territories go under "" so they still draw.
const rows = [];
let mapped = 0, uncoded = 0, bytes = 0;
for (const geom of topo.objects.countries.geometries) {
  const iso2 = numToAlpha2.get(String(Number(geom.id))) ?? "";
  const d = countryPath(feature(topo, geom).geometry, TOL);
  if (!d) continue;
  rows.push([iso2, d]);
  bytes += d.length;
  if (iso2) mapped++; else uncoded++;
}
rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

const body = rows.map(([iso, d]) => `  ["${iso}", "${d}"]`).join(",\n");

const out = `/**
 * World geometry for the threat map, equirectangular projection.
 *
 * GENERATED — do not edit by hand.
 *   Source     : Natural Earth 10m countries, via the world-atlas TopoJSON package
 *   Generator  : src/orchestrator/tools/build/gen_world_outline.mjs
 *   Simplified : Douglas-Peucker, tolerance ${TOL} projected units
 *
 * Committed as static path data so the console carries no mapping dependency
 * and needs no network. The coordinate space IS the projection:
 *   x = lon + 180  (0..360)
 *   y = 90 - lat   (0..180)
 * so plotting an indicator is arithmetic, not a library.
 *
 * COUNTRIES is [ISO-3166-1 alpha-2, SVG path] pairs — filled it is the land,
 * stroked it draws coastlines and borders, and keyed by ISO it drives the
 * per-country threat choropleth. Uncoded territories sit under "".
 *
 * Natural Earth is public domain (naturalearthdata.com/about/terms-of-use).
 */

export const WORLD_VIEW = { width: 360, height: 180 };

/** Equirectangular projection into the path's own coordinate space. */
export function project(lat, lon) {
  return { x: Number(lon) + 180, y: 90 - Number(lat) };
}

/** @type {ReadonlyArray<readonly [string, string]>} */
export const COUNTRIES = [
${body}
];
`;

fs.writeFileSync(process.argv[3], out);
console.log(`countries: ${rows.length} (${mapped} ISO-coded, ${uncoded} uncoded)  paths: ${(bytes / 1024).toFixed(0)}KB  tol: ${TOL}`);
