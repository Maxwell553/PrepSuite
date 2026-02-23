# Step-by-Step Guide: Downloading OTB Games (Option A)

This guide walks you through downloading Over-the-Board (OTB) chess games from three sources: **Ajedrez Data**, **TWIC**, and **FIDE**. You’ll end up with PGN files you can parse, index by FIDE ID, and store in Supabase.

---

## Overview

| Source        | Format | Coverage              | Bulk Download? |
|---------------|--------|------------------------|----------------|
| Ajedrez Data  | PGN    | Through Aug 2024       | Yes (2 files)  |
| TWIC          | PGN    | Weekly since 1994      | Yes (script)   |
| FIDE          | PGN    | Per-tournament         | No (manual)    |

---

## 1. Ajedrez Data (Recommended First Step)

Ajedrez Data provides a large OTB database in PGN format. You need two files: the main base and the update.

### Step 1.1: Open the OTB page

1. Go to: **https://ajedrezdata.com/databases/otb/**
2. Accept cookies if prompted.

### Step 1.2: Download the main database (AJ-OTB-000)

1. Find the section for the **main database** (games through April 2023).
2. Click the **AJ-OTB-PGN-000** link (PGN format).
3. Save the file (e.g. `AJ-OTB-PGN-000.zip` or `.pgn`).
4. Extract if it’s a zip.

### Step 1.3: Download the update (AJ-OTB-001)

1. Find the section for the **update** (games April 2023–August 2024).
2. Click the **AJ-OTB-PGN-001** link.
3. Save and extract.

### Step 1.4: Combine the files

```bash
# If you have two .pgn files:
cat AJ-OTB-PGN-000.pgn AJ-OTB-PGN-001.pgn > ajedrez_otb_full.pgn
```

You now have one combined PGN file with OTB games through August 2024.

---

## 2. TWIC (The Week in Chess)

TWIC publishes weekly PGN archives. Each issue is a zip containing one PGN file.

### Step 2.1: Understand the URL pattern

- Base URL: `https://theweekinchess.com/zips/`
- PGN zip: `twic{issue}g.zip`
- Example: TWIC 1632 → `https://theweekinchess.com/zips/twic1632g.zip`

### Step 2.2: Manual download (a few weeks)

1. Go to: **https://theweekinchess.com/twic**
2. In the table, click the **PGN** link for the issue you want.
3. Unzip the downloaded file to get the `.pgn`.

### Step 2.3: Bulk download (many weeks)

Use a script to download a range of issues. Example:

```bash
#!/bin/bash
# Save as download_twic.sh

TMPDIR=twic_downloads
START=1500   # First TWIC issue (e.g. Jan 2024)
END=1632     # Last TWIC issue (e.g. Feb 2026)

mkdir -p ${TMPDIR}

# Download (requires wget)
for i in $(seq ${START} ${END}); do
  wget -q -P ${TMPDIR} "https://theweekinchess.com/zips/twic${i}g.zip" || true
done

# Unzip all
unzip -o -d ${TMPDIR} ${TMPDIR}/*.zip 2>/dev/null || true

# Combine into one PGN
cat ${TMPDIR}/*.pgn > twic_${START}_${END}.pgn

echo "Combined PGN: twic_${START}_${END}.pgn"
```

Run it:

```bash
chmod +x download_twic.sh
./download_twic.sh
```

**Note:** TWIC is free for personal use. Be respectful with download rate (e.g. add `sleep 1` between requests if downloading many issues).

### Step 2.4: Issue number reference

- TWIC 210 ≈ oldest available
- TWIC 1632 ≈ Feb 2026 (current)
- Roughly one issue per week since 1994

---

## 3. FIDE (Per-Tournament)

FIDE does not offer a single bulk PGN download. You download PGNs per tournament.

### Step 3.1: Find rated tournaments

1. Go to: **https://ratings.fide.com/rated_tournaments.phtml**
2. Choose:
   - **Country** (e.g. USA, POL)
   - **Period** (e.g. 2024-01-01)
3. Click **Search** to list tournaments.

### Step 3.2: Download a tournament’s PGN

1. Open a tournament from the list.
2. Look for a **PGN** or **Download games** link.
3. Download the PGN file.

### Step 3.3: Automation (advanced)

FIDE pages are not designed for easy scraping. Options:

- **Manual:** Download important events (e.g. national championships, opens).
- **Chess-Results.com:** Use https://chess-results.com to search tournaments and download PGNs where available.
- **Scraping:** Use a tool like Puppeteer/Playwright to automate; respect robots.txt and rate limits.

---

## 4. Next Steps (After Download)

1. **Parse PGNs** – Use a library (e.g. `chess.js`, `pgn-parser`) to extract headers and moves.
2. **Extract FIDE IDs** – From `WhiteFideId` / `BlackFideId` or `White` / `Black` + FIDE rating list lookup.
3. **Store in Supabase** – Insert into `otb_games` with columns like:
   - `fide_id_white`, `fide_id_black`
   - `white`, `black`, `result`, `eco`, `event`, `date`, `pgn`
   - `white_elo`, `black_elo`, `source` (e.g. `ajedrez`, `twic`, `fide`)
4. **Query by FIDE ID** – In the pipeline, after resolving identity, query `otb_games` and merge with Chess.com/Lichess games before analysis.

---

## Quick Reference: URLs

| Resource              | URL                                              |
|-----------------------|--------------------------------------------------|
| Ajedrez Data OTB      | https://ajedrezdata.com/databases/otb/           |
| TWIC Archive          | https://theweekinchess.com/twic                  |
| TWIC PGN zip (issue N)| https://theweekinchess.com/zips/twic{N}g.zip    |
| FIDE Rated Tournaments| https://ratings.fide.com/rated_tournaments.phtml |
| Chess-Results.com     | https://chess-results.com                        |

---

## Suggested Order

1. **Ajedrez Data** – Easiest bulk source; get the full OTB base first.
2. **TWIC** – Add recent weeks (e.g. 1550–1632) for games after Ajedrez Data’s cutoff.
3. **FIDE** – Use for specific tournaments or regions as needed.
