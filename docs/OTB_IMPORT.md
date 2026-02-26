# OTB PGN Import

Import Over-the-Board chess games from a large PGN file into Supabase for use in the analysis pipeline.

## Prerequisites

1. **Supabase migration** – Apply the `otb_games` table:
   ```bash
   supabase db push
   ```

2. **Environment** – In `pipeline-service/.env`:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. **PGN file** – Place your OTB PGN file (e.g. `OTB.pgn`) on your Desktop or set the path.

## Run the import

From the project root:

```bash
cd pipeline-service
npm run import:otb
```

By default, the script reads from `~/Desktop/OTB.pgn`.

**Custom path** (CLI arg or env):

```bash
npm run import:otb -- /path/to/your/OTB.pgn
# or
OTB_PGN_PATH=/path/to/OTB.pgn npm run import:otb
```

## Expected duration

For an ~8GB file with millions of games:

- **Parse + insert**: ~45 min – 3 hours (depends on disk speed and Supabase region)
- Progress is logged every 10,000 games

## Table schema

`otb_games` stores:

- `white_fide_id`, `black_fide_id` – For FIDE ID lookups
- `white`, `black` – Player names
- `result`, `eco`, `event`, `site`, `game_date`
- `white_elo`, `black_elo`
- `pgn` – Full PGN text

Games without `White`/`Black` or with parse errors are skipped.

## PGN tag support

The importer extracts:

- **FIDE ID**: `WhiteFideId`, `BlackFideId` (or `WhiteID`, `BlackID`)
- **Elo**: `WhiteElo`, `BlackElo` (or `WhiteRating`, `BlackRating`)
- **Date**: `Date` or `EventDate` (format `YYYY.MM.DD`)
