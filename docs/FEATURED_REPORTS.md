# Saving Sample Featured Reports

Step-by-step instructions for generating and saving the 5 featured reports (Magnus Carlsen, Hikaru Nakamura, Levy Rozman, Gukesh Dommaraju, Ju Wenjun) to `public/featured-reports/`.

## Prerequisites

1. **Pipeline service running** – The analysis pipeline must be available:
   ```bash
   cd pipeline-service && npm run dev
   ```

2. **Frontend dev server running**:
   ```bash
   npm run dev
   ```

3. **Signed in** – You must be signed in to the app (the pipeline requires a JWT).

4. **Supabase configured** – `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

---

## Step-by-Step Instructions

### 1. Generate each report

For each player below, run a search in the app:

| Player           | Search input (name or username) |
|------------------|----------------------------------|
| Magnus Carlsen   | `Magnus Carlsen` or FIDE ID `1503014` |
| Hikaru Nakamura  | `Hikaru Nakamura` or Chess.com `Hikaru` |
| Levy Rozman      | `Levy Rozman` or Chess.com `GothamChess` |
| Gukesh Dommaraju | `Gukesh Dommaraju` or FIDE ID `25009160` |
| Ju Wenjun        | `Ju Wenjun` or FIDE ID `8602980` |

1. Open the app in your browser.
2. Go to the Search tab.
3. Enter the player name (or FIDE ID / Chess.com username).
4. Click **Analyze** and wait for the pipeline to finish.
5. When the report appears, continue to step 2.

### 2. Export the report JSON

1. On the report dashboard, click **Export JSON** (top right).
2. The report is copied to your clipboard and a file is downloaded (e.g. `magnus-carlsen.json`).

### 3. Save to featured reports

1. Move (or copy) the downloaded file into `public/featured-reports/`.
2. Ensure the filename matches the slug in `index.json`:

   | Slug               | Filename              |
   |--------------------|------------------------|
   | magnus-carlsen     | `magnus-carlsen.json`  |
   | hikaru-nakamura    | `hikaru-nakamura.json` |
   | levy-rozman        | `levy-rozman.json`     |
   | gukesh-dommaraju   | `gukesh-dommaraju.json`|
   | ju-wenjun          | `ju-wenjun.json`       |

3. If the export used a different slug (e.g. from a different name format), rename the file to match the slug above.

### 4. Verify `index.json`

Ensure `public/featured-reports/index.json` lists all 5 players:

```json
[
  {"slug":"magnus-carlsen","name":"Magnus Carlsen","title":"GM"},
  {"slug":"hikaru-nakamura","name":"Hikaru Nakamura","title":"GM"},
  {"slug":"levy-rozman","name":"Levy Rozman","title":"IM"},
  {"slug":"gukesh-dommaraju","name":"Gukesh Dommaraju","title":"GM"},
  {"slug":"ju-wenjun","name":"Ju Wenjun","title":"GM"}
]
```

### 5. Confirm the report structure

Each JSON file must conform to `ScoutingReport`:

- `id` – e.g. `featured-magnus-carlsen`
- `player` – `name`, `fideId`, `platforms`, etc.
- `whiteOpenings`, `blackDefenses`, `strategicSummary`, `games`, etc.
- `lastUpdated` – ISO date string (e.g. `2026-02-28`)

The Export JSON button sets `id` to `featured-{slug}` and `lastUpdated` if missing.

---

## Quick reference: slugs and filenames

```
public/featured-reports/
├── index.json
├── magnus-carlsen.json
├── hikaru-nakamura.json
├── levy-rozman.json
├── gukesh-dommaraju.json
└── ju-wenjun.json
```

---

## Troubleshooting

- **Export button not visible** – Ensure you are viewing a generated report (not a placeholder).
- **Wrong slug in filename** – Rename the file to match the slug in `index.json`.
- **Pipeline fails** – Check that the pipeline service is running and that you are signed in.
- **Featured report shows placeholder** – Replace the placeholder JSON with a real exported report.
