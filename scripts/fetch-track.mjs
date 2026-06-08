// Fetches Garmin LiveTrack data and writes data/track.json
// Run by GitHub Actions every 10 minutes — no CORS issues server-side.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const SESSION = '6136f821-fc91-8386-bf3d-1c1b68861401';
const TOKEN   = '7260862AE7501F8119512C387685DFC';
const OUT     = 'data/track.json';

// Garmin's LiveTrack endpoint has used a few different paths over the years.
// We try the known ones in order.
const ENDPOINTS = [
  `https://livetrack.garmin.com/services/session/${SESSION}/trackpoints?token=${TOKEN}&requestTime=${Date.now()}`,
  `https://livetrack.garmin.com/services/session/${SESSION}/trackpoints/${TOKEN}`,
];

function haversineNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function tryFetch() {
  for (const url of ENDPOINTS) {
    try {
      console.log('Trying:', url.replace(TOKEN, '***'));
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; AlabareTrackerBot/1.0)'
        }
      });
      if (!res.ok) {
        console.log('  → HTTP', res.status);
        continue;
      }
      const data = await res.json();
      if (data && (data.trackPoints || Array.isArray(data))) {
        console.log('  → got', (data.trackPoints || data).length, 'points');
        return data;
      }
      console.log('  → unexpected shape:', Object.keys(data || {}));
    } catch (e) {
      console.log('  → error:', e.message);
    }
  }
  return null;
}

function normalizePoints(raw) {
  // Try different response shapes
  const tps = raw.trackPoints || raw;
  if (!Array.isArray(tps)) return [];

  return tps
    .map(p => {
      const lat = p.position?.lat ?? p.latitude ?? p.lat;
      const lon = p.position?.lon ?? p.position?.lng ?? p.longitude ?? p.lon ?? p.lng;
      const ts  = p.dateTime || p.timestamp || p.time;
      if (lat == null || lon == null || !ts) return null;
      return {
        ts: new Date(ts).toISOString(),
        lat: Number(lat),
        lon: Number(lon),
        speedKts: p.speed != null ? +(p.speed * 1.94384).toFixed(1) : null
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

function summarize(points) {
  if (points.length === 0) {
    return { points: [], totalNm: 0, todayNm: 0, avgNm: 0, daysList: [] };
  }

  let totalNm = 0;
  const days = {};
  for (let i = 1; i < points.length; i++) {
    const d = haversineNm(points[i-1].lat, points[i-1].lon, points[i].lat, points[i].lon);
    totalNm += d;
    const key = points[i].ts.slice(0, 10);
    days[key] = (days[key] || 0) + d;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayNm  = Math.round(days[todayKey] || 0);

  const daysList = Object.entries(days)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, nm]) => ({ date, nm: Math.round(nm) }));

  const avgNm = daysList.length > 0
    ? Math.round(daysList.reduce((s, d) => s + d.nm, 0) / daysList.length)
    : 0;

  return {
    points,
    totalNm: Math.round(totalNm),
    todayNm,
    avgNm,
    daysList,
  };
}

async function main() {
  const raw = await tryFetch();

  let summary;
  if (raw) {
    const points = normalizePoints(raw);
    console.log(`Normalized ${points.length} points`);
    summary = summarize(points);
  } else {
    // Preserve existing data if fetch failed — don't wipe the dashboard.
    console.log('Fetch failed. Preserving existing data if any.');
    try {
      const existing = JSON.parse(await readFile(OUT, 'utf-8'));
      summary = {
        points: existing.points || [],
        totalNm: existing.totalNm || 0,
        todayNm: existing.todayNm || 0,
        avgNm: existing.avgNm || 0,
        daysList: existing.daysList || [],
      };
    } catch {
      summary = { points: [], totalNm: 0, todayNm: 0, avgNm: 0, daysList: [] };
    }
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    fetchOk: raw !== null,
    ...summary
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(output, null, 2));
  console.log('Wrote', OUT, '—', summary.points.length, 'pts,', summary.totalNm, 'nm total');
}

main().catch(e => { console.error(e); process.exit(1); });
