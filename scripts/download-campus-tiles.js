// One-off/rerunnable fetcher for the offline campus map tiles used by
// CampusMapSection (src/frontend/components/composite/CampusMapSection.tsx).
// The app needs to keep showing the campus map with no wifi at all, so
// instead of pulling tiles from CARTO's CDN at runtime, we bundle a small
// set of tiles as static files under src/frontend/public/tiles and serve
// those.
//
// Only ONE zoom level is actually downloaded (NATIVE_ZOOM below) - not the
// full zoom 15-18 range. Leaflet's TileLayer minNativeZoom/maxNativeZoom
// option (set on the TileLayer in CampusMapSection.tsx) makes it reuse this
// single zoom's tiles at every other zoom level the map supports, CSS-
// scaling them up or down as needed instead of fetching separate tiles per
// level. That trades a bit of sharpness at zoom levels away from
// NATIVE_ZOOM for a tile count in the hundreds instead of the thousands a
// full pyramid needs.
//
// BOUNDS is intentionally much wider than MAX_BOUNDS (the map's pan limit)
// in CampusMapSection.tsx: at the map's farthest-out zoom, a maximized/wide
// window shows a lot more geographic width than MAX_BOUNDS restricts
// panning to (the two are different things - see MAX_BOUNDS's own comment),
// and Leaflet still has to fill that whole width with (remapped, since only
// NATIVE_ZOOM is cached) tiles. Downloading only MAX_BOUNDS's own tight area
// left the sides of a wide window blank past that box's edges. NATIVE_ZOOM
// is 16 rather than 17 specifically so this wider area stays in the
// low-hundreds of tiles instead of the low-thousands a wider zoom 17 box
// would need (each zoom level roughly triples the tile count for the same
// area).
//
// Re-run this if NATIVE_ZOOM or BOUNDS below ever change - they must stay in
// sync with minNativeZoom/maxNativeZoom in CampusMapSection.tsx, or panning
// to an edge / a wide window at the farthest zoom will show blank tiles.
//
// Usage: node scripts/download-campus-tiles.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const BOUNDS = { latMin: 45.39, latMax: 45.455, lngMin: -75.77, lngMax: -75.58 };
// Keep in sync with the TileLayer's minNativeZoom/maxNativeZoom in
// CampusMapSection.tsx - this is the one zoom level actually cached.
const NATIVE_ZOOM = 16;

const OUT_DIR = path.join(__dirname, '..', 'src', 'frontend', 'public', 'tiles');
const THEMES = [
  { name: 'light', urlPath: 'light_all' },
  { name: 'dark', urlPath: 'dark_all' },
];
const CONCURRENCY = 16;

function latLngToTile(lat, lon, zoom) {
  const rad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [x, y];
}

function buildTileList() {
  const list = [];
  const [x1, y1] = latLngToTile(BOUNDS.latMax, BOUNDS.lngMin, NATIVE_ZOOM);
  const [x2, y2] = latLngToTile(BOUNDS.latMin, BOUNDS.lngMax, NATIVE_ZOOM);
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) list.push([NATIVE_ZOOM, x, y]);
  }
  return list;
}

function fetchTile(urlPath, z, x, y, destPath) {
  return new Promise((resolve, reject) => {
    // @2x (retina) source, saved under the plain z/x/y.png name Leaflet
    // requests - it's still displayed in a 256px box either way, just from
    // roughly 4x the source pixels, which is what actually fixes blurry
    // text/labels once this gets CSS-upscaled for zoom levels above
    // NATIVE_ZOOM (see minNativeZoom/maxNativeZoom in CampusMapSection.tsx).
    const url = `https://a.basemaps.cartocdn.com/${urlPath}/${z}/${x}/${y}@2x.png`;
    https
      .get(url, { headers: { 'User-Agent': 'VCRT-PCR offline map cache' } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          fs.writeFileSync(destPath, Buffer.concat(chunks));
          resolve();
        });
      })
      .on('error', reject);
  });
}

async function run() {
  const tileList = buildTileList();
  const queue = THEMES.flatMap((theme) => tileList.map(([z, x, y]) => ({ theme, z, x, y })));
  const total = queue.length;
  let done = 0;
  let failed = 0;
  let idx = 0;

  async function worker() {
    while (idx < queue.length) {
      const { theme, z, x, y } = queue[idx++];
      const dir = path.join(OUT_DIR, theme.name, String(z), String(x));
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, `${y}.png`);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        done++;
        continue;
      }
      let attempts = 0;
      while (attempts < 3) {
        try {
          await fetchTile(theme.urlPath, z, x, y, dest);
          done++;
          break;
        } catch (e) {
          attempts++;
          if (attempts >= 3) {
            failed++;
            console.error('FAILED', theme.name, z, x, y, e.message);
          }
        }
      }
      if (done % 100 === 0) console.log(`progress: ${done}/${total}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`DONE. total=${total} ok=${done} failed=${failed}`);
}

run();
