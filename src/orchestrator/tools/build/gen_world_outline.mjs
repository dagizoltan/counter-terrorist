/**
 * gen_world_outline — bakes the threat map's world geometry.
 *
 * Converts Natural Earth 110m land (from the world-atlas TopoJSON package)
 * into a single equirectangular SVG path and writes it as a static module.
 *
 * This runs OFF the critical path. Its output is committed, so the console
 * itself carries no mapping dependency, makes no network request, and works on
 * an air-gapped node — the properties the previous Leaflet-from-a-CDN build
 * could not offer.
 *
 * Regenerate (needs npm, one-off):
 *   npm i --no-save world-atlas topojson-client
 *   node src/orchestrator/tools/build/gen_world_outline.mjs 0.35 \
 *        src/orchestrator/interface/web/components/islands/world-outline.js
 *
 * The tolerance argument trades fidelity against path size:
 *   0.6  ~14KB, continents only    0.35 ~23KB, readable coastlines (current)
 *   0.2  ~38KB, detailed
 *
 * Natural Earth is public domain: naturalearthdata.com/about/terms-of-use
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(fs.readFileSync(require.resolve("world-atlas/countries-110m.json"), "utf8"));
const land = feature(topo, topo.objects.land);

const WORLD = { width: 360, height: 180 };

// Equirectangular: x = lon + 180 (0..360), y = 90 - lat (0..180).
const px = (lon) => (lon + 180);
const py = (lat) => (90 - lat);

// Douglas-Peucker in projected units. 0.35 keeps coastlines readable at the
// sizes this map renders while cutting the path to a fraction of its size.
//
// Closed rings need care: the first and last point coincide, so the baseline
// has zero length and the perpendicular-distance test degenerates — every
// point measures ~0 and the whole ring collapses to two points. Split the ring
// at its farthest point from the start and simplify the two halves.
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

  // Farthest vertex from the start becomes the split point.
  let far = 1, farD = -1;
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
    if (d > farD) { farD = d; far = i; }
  }
  const a = dp(open.slice(0, far + 1), tol);
  const b = dp(open.slice(far).concat([open[0]]), tol);
  const merged = [...a.slice(0, -1), ...b];
  return merged;
}

const round = (n) => Math.round(n * 10) / 10;

/**
 * Split a ring wherever it crosses the antimeridian.
 *
 * Equirectangular has no wrap: a ring running from lon 179 to lon -179 is a
 * 358-degree jump in projected x, which draws as a straight line clean across
 * the map. Natural Earth's land layer has several such rings (Chukotka, Fiji,
 * Antarctica), and each produced a horizontal seam through the whole plot.
 * Break the ring into segments at every jump wider than half the world.
 */
function splitAtAntimeridian(pts) {
  const segments = [];
  let current = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i][0] - pts[i - 1][0]) > 180) {
      segments.push(current);
      current = [pts[i]];
    } else {
      current.push(pts[i]);
    }
  }
  segments.push(current);
  return segments;
}

function ring(coords, tol) {
  const projected = coords.map(([lon, lat]) => [px(lon), py(lat)]);
  const segments = splitAtAntimeridian(projected);

  // These paths are filled, and SVG implicitly closes an open subpath when
  // filling — so a segment cut at the dateline would draw a chord straight
  // back to its start, slashing across the continent. Close each piece along
  // the edge it wrapped through instead, which is what the wrap means
  // geometrically.
  const pieces = segments.map((seg) => {
    if (seg.length < 2) return "";
    const wrapped = segments.length > 1;
    let pts = simplifyRing(seg, tol);
    if (pts.length < (wrapped ? 2 : 4)) return "";      // drop specks

    if (wrapped) {
      const mid = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const edge = mid > WORLD.width / 2 ? WORLD.width : 0;
      pts = [...pts, [edge, pts[pts.length - 1][1]], [edge, pts[0][1]]];
    }

    return "M" + pts.map(([x, y]) => `${round(x)} ${round(y)}`).join("L") + "Z";
  });

  return pieces.filter(Boolean).join("");
}

function polygons(geom, out, tol) {
  if (geom.type === "Polygon") out.push(...geom.coordinates.map((r) => ring(r, tol)));
  else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) out.push(...poly.map((r) => ring(r, tol)));
  }
}

const TOL = Number(process.argv[2] ?? 0.35);
const parts = [];
for (const f of land.features) polygons(f.geometry, parts, TOL);
const path = parts.filter(Boolean).join("");

const out = `/**
 * World landmass outline, equirectangular projection.
 *
 * GENERATED — do not edit by hand.
 *   Source     : Natural Earth 110m land, via the world-atlas TopoJSON package
 *   Generator  : src/orchestrator/tools/build/gen_world_outline.mjs
 *   Simplified : Douglas-Peucker, tolerance ${TOL} projected units
 *
 * Committed as static path data so the console carries no mapping dependency
 * and needs no network. The coordinate space IS the projection:
 *   x = lon + 180  (0..360)
 *   y = 90 - lat   (0..180)
 * so plotting an indicator is arithmetic, not a library.
 *
 * Natural Earth is public domain (naturalearthdata.com/about/terms-of-use).
 */

export const WORLD_VIEW = { width: 360, height: 180 };

/** Equirectangular projection into the path's own coordinate space. */
export function project(lat, lon) {
  return { x: Number(lon) + 180, y: 90 - Number(lat) };
}

export const WORLD_PATH =
  "${path}";
`;

fs.writeFileSync(process.argv[3], out);
console.log(`rings: ${parts.filter(Boolean).length}  path: ${(path.length / 1024).toFixed(1)}KB  tol: ${TOL}`);
