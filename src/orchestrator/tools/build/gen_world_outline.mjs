/**
 * gen_world_outline — bakes the threat map's world geometry.
 *
 * Converts Natural Earth 50m (from the world-atlas TopoJSON package) into
 * equirectangular SVG paths and writes them as a static module:
 *   LAND_PATH    — filled land (crisp 50m coastlines)
 *   BORDERS_PATH — interior country borders (stroked; topojson mesh, so
 *                  coastlines are not redrawn)
 *
 * This runs OFF the critical path. Its output is committed, so the console
 * itself carries no mapping dependency, makes no network request, and works on
 * an air-gapped node — the properties the previous Leaflet-from-a-CDN build
 * could not offer.
 *
 * Regenerate (needs npm, one-off):
 *   npm i --no-save world-atlas topojson-client
 *   node src/orchestrator/tools/build/gen_world_outline.mjs 0.18 \
 *        src/orchestrator/interface/web/components/islands/world-outline.js
 *
 * The tolerance argument (Douglas-Peucker, projected units) trades fidelity
 * against path size. 0.18 on 50m gives crisp coastlines that hold up under the
 * map's zoom without bloating the bundle.
 *
 * Natural Earth is public domain: naturalearthdata.com/about/terms-of-use
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { feature, mesh } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(fs.readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"));
const land = feature(topo, topo.objects.land);
// Interior borders only: an arc shared by two different countries. Coastlines
// (shared with the outside) are excluded, so borders never double the land.
const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);

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

/** Open polyline — for borders. Not closed, not filled. */
function line(coords, tol) {
  const projected = coords.map(([lon, lat]) => [px(lon), py(lat)]);
  const segments = splitAtAntimeridian(projected);
  return segments.map((seg) => {
    if (seg.length < 2) return "";
    const pts = dp(seg, tol);
    if (pts.length < 2) return "";
    return "M" + pts.map(([x, y]) => `${round(x)} ${round(y)}`).join("L");
  }).filter(Boolean).join("");
}

function polygons(geom, out, tol) {
  if (geom.type === "Polygon") out.push(...geom.coordinates.map((r) => ring(r, tol)));
  else if (geom.type === "MultiPolygon") for (const poly of geom.coordinates) out.push(...poly.map((r) => ring(r, tol)));
}
function lines(geom, out, tol) {
  if (geom.type === "LineString") out.push(line(geom.coordinates, tol));
  else if (geom.type === "MultiLineString") for (const l of geom.coordinates) out.push(line(l, tol));
}

const TOL = Number(process.argv[2] ?? 0.18);
const landParts = [];
for (const f of land.features) polygons(f.geometry, landParts, TOL);
const landPath = landParts.filter(Boolean).join("");

const borderParts = [];
lines(borders, borderParts, TOL);
const bordersPath = borderParts.filter(Boolean).join("");

const out = `/**
 * World geometry for the threat map, equirectangular projection.
 *
 * GENERATED — do not edit by hand.
 *   Source     : Natural Earth 50m, via the world-atlas TopoJSON package
 *   Generator  : src/orchestrator/tools/build/gen_world_outline.mjs
 *   Simplified : Douglas-Peucker, tolerance ${TOL} projected units
 *
 * Committed as static path data so the console carries no mapping dependency
 * and needs no network. The coordinate space IS the projection:
 *   x = lon + 180  (0..360)
 *   y = 90 - lat   (0..180)
 * so plotting an indicator is arithmetic, not a library.
 *
 *   LAND_PATH    — filled land (crisp 50m coastlines)
 *   BORDERS_PATH — interior country borders (stroked)
 *
 * Natural Earth is public domain (naturalearthdata.com/about/terms-of-use).
 */

export const WORLD_VIEW = { width: 360, height: 180 };

/** Equirectangular projection into the path's own coordinate space. */
export function project(lat, lon) {
  return { x: Number(lon) + 180, y: 90 - Number(lat) };
}

export const LAND_PATH =
  "${landPath}";

export const BORDERS_PATH =
  "${bordersPath}";

// Back-compat alias for the previous land-only export.
export const WORLD_PATH = LAND_PATH;
`;

fs.writeFileSync(process.argv[3], out);
console.log(`land rings: ${landParts.filter(Boolean).length}  land: ${(landPath.length / 1024).toFixed(1)}KB  ` +
  `borders: ${(bordersPath.length / 1024).toFixed(1)}KB  tol: ${TOL}`);
