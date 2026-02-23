# OTB Game Import Instructions

This guide explains how to import the Lumbra Gigabase OTB database into PrepSuite for pipeline use.

## Prerequisites

- Supabase project with `otb_games` table (run migrations)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `pipeline-service/.env` or `.env.local`

## Option A: You have the si4 folder (LumbrasGigabase_OTB_si4)

Scid si4 is a binary format. You must **export to PGN first**:

1. **Install Scid vs PC** (if not already):
   - macOS: `brew install scid` or download from [Scid vs PC](https://scidvspc.sourceforge.net/)
   - Windows/Linux: [Download](https://sourceforge.net/projects/scidvspc/)

2. **Export to PGN**:
   - Open Scid vs PC
   - File → Open Database → select the `LumbrasGigabase_OTB_si4` folder (open the `.si4` index file)
   - Tools → Export → Filter Games (or Export All)
   - Format: **PGN**
   - Save to e.g. `exported_otb.pgn`

3. **Run the import**:
   ```bash
   cd pipeline-service
   npx tsx scripts/import-otb-pgn.ts /path/to/exported_otb.pgn
   ```

## Option B: Download PGN directly from Lumbra

Lumbra offers PGN downloads (often split by year). This avoids Scid entirely:

1. Go to [Lumbra Gigabase – Download PGN](https://lumbrasgigabase.com/en/download-pgn/)
2. Download the OTB PGN files (e.g. by year: 2024, 2025, etc.)
3. Place them in a folder, e.g. `./LumbrasGigabase_OTB_pgn/`
4. Run the import:
   ```bash
   cd pipeline-service
   npx tsx scripts/import-otb-pgn.ts ./LumbrasGigabase_OTB_pgn/
   ```

## Import script behavior

- **Skips games without FIDE IDs**: Only games with `WhiteFideId` and `BlackFideId` tags are imported
- **Batch size**: 500 games per insert
- **Source tag**: All games are tagged `lumbras_gigabase`

## After import

1. Run the Supabase migration if not already applied:
   ```bash
   npx supabase db push
   # or apply 20260221_otb_games.sql manually
   ```

2. The pipeline will automatically fetch OTB games when a player has a resolved FIDE ID.

## Folder location

Place your PGN files or si4 folder anywhere. The import script accepts:
- A single `.pgn` file path
- A directory path (imports all `.pgn` files inside)

Example with si4 in project root:
```bash
# After exporting from Scid to pipeline-service/data/otb_export.pgn:
npx tsx scripts/import-otb-pgn.ts ./data/otb_export.pgn
```
