/**
 * Coarse world landmass outline, equirectangular.
 *
 * Coordinate space is the projection itself: x = lon + 180 (0..360),
 * y = 90 - lat (0..180). So plotting a threat is arithmetic, not a library.
 *
 * Deliberately low fidelity — this is a situational-awareness backdrop for
 * plotting indicators, not a cartographic product. It exists so the console
 * has a map that works on an air-gapped host.
 */
export const WORLD_PATH = [
  // North America
  "M 32,26 L 44,22 L 62,20 L 78,22 L 92,26 L 96,34 L 88,40 L 82,44 L 78,52 L 72,58 L 66,62 L 58,66 L 52,60 L 48,52 L 42,44 L 36,36 Z",
  // Greenland
  "M 96,14 L 112,12 L 120,18 L 116,26 L 104,28 L 96,22 Z",
  // Central America
  "M 66,64 L 72,66 L 76,72 L 72,74 L 66,70 Z",
  // South America
  "M 78,78 L 90,76 L 98,82 L 100,94 L 96,108 L 90,120 L 84,126 L 78,120 L 76,106 L 74,92 Z",
  // Africa
  "M 168,62 L 184,58 L 198,60 L 206,66 L 204,78 L 198,90 L 192,102 L 186,112 L 178,116 L 172,108 L 168,94 L 164,80 L 164,70 Z",
  // Europe
  "M 168,32 L 184,28 L 196,30 L 200,38 L 194,46 L 184,50 L 174,50 L 168,44 Z",
  // Asia
  "M 200,26 L 226,20 L 254,18 L 278,22 L 296,28 L 306,36 L 300,46 L 288,52 L 272,56 L 256,60 L 240,58 L 224,52 L 210,44 L 202,36 Z",
  // India
  "M 250,60 L 262,58 L 268,66 L 262,78 L 254,74 L 248,66 Z",
  // South-east Asia
  "M 276,62 L 292,64 L 300,72 L 294,80 L 282,78 L 274,70 Z",
  // Australia
  "M 288,104 L 308,100 L 320,106 L 322,118 L 312,126 L 296,124 L 288,116 Z",
  // New Zealand
  "M 330,124 L 336,122 L 338,130 L 332,132 Z",
  // Antarctica
  "M 8,168 L 120,164 L 240,164 L 352,168 L 352,178 L 8,178 Z",
].join(" ");

/** Equirectangular projection into the path's own coordinate space. */
export function project(lat, lon) {
  return { x: Number(lon) + 180, y: 90 - Number(lat) };
}
