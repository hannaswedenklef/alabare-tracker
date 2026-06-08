# Alabare — Atlantic Crossing Tracker

Live tracking dashboard for the sailboat *Alabare* crossing the Atlantic, June 2026.

## How it works

- **`index.html`** — the dashboard (map, stats, wind, daily log). Reads `data/track.json` in the browser.
- **`scripts/fetch-track.mjs`** — Node script that fetches GPS data from Garmin LiveTrack.
- **`.github/workflows/fetch-track.yml`** — GitHub Action that runs the script every 15 min and commits the JSON.
- **Wind data** is fetched client-side from Open-Meteo (CORS-friendly, no API key).

This setup avoids CORS issues with Garmin (which blocks direct browser requests) by fetching server-side and storing the result as a static file the dashboard reads.

## Setup (5 minutes)

### 1. Create the repo
1. Make a new GitHub repo, e.g. `alabare-tracker`. Public, with a README.
2. Upload all these files preserving the folder structure:
   ```
   index.html
   data/track.json
   scripts/fetch-track.mjs
   .github/workflows/fetch-track.yml
   README.md
   ```

### 2. Enable GitHub Pages
1. Repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main**, folder: **/ (root)**, **Save**
4. After ~30 seconds you'll get a URL like `https://<your-username>.github.io/alabare-tracker/`

### 3. Enable Actions to commit data
1. Repo → **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select **Read and write permissions**, **Save**
3. Go to the **Actions** tab → **Fetch Alabare track** → **Run workflow** (manual first run)
4. After it finishes, check that `data/track.json` was updated with track points.

That's it. The dashboard updates automatically every 15 min from then on.

## Customization

- **Change waypoints**: edit `AZORES` and `START` in `index.html` and `scripts/fetch-track.mjs`.
- **Change refresh rate**: edit the `cron` line in `.github/workflows/fetch-track.yml`. Note GitHub's minimum is 5 min, and scheduled actions can run 5–10 min late under load.
- **Change Garmin session**: if your sister starts a new tracking session, update `SESSION` and `TOKEN` in `scripts/fetch-track.mjs`.

## Troubleshooting

**"No GPS data yet" never goes away**

Check the Actions tab. If the workflow is failing, click into a run to see logs. The most common causes:
- Garmin's tracking session expired (each LiveTrack session has a TTL — your sister may need to start a new one and you'll need to update `SESSION`/`TOKEN`).
- Garmin changed their endpoint format. The script tries two known variants; if both fail, the logs will show what response it got.

**Wind data isn't showing**

Open the browser console (F12). Open-Meteo is usually very reliable; if it's failing, check for rate-limiting messages (their free tier allows 10,000 calls/day, which is plenty).

**Actions aren't running on schedule**

GitHub disables scheduled workflows on inactive repos after 60 days. As long as someone commits to the repo every couple of months, it stays active. You can also trigger manually any time from the Actions tab.
