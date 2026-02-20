# FIDE Local Database

The pipeline uses a **local FIDE rating list** instead of the live FIDE API. The file `standard_rating_list.txt` at the project root is loaded at startup.

- **Search** (`searchFideByName`) and **profile lookup** (`getFideProfile`) both use this local data.
- No network calls to `ratings.fide.com` are made.

---

## Updating the Data (Monthly)

FIDE publishes new lists monthly. To update:

1. Go to **https://ratings.fide.com/download_lists.phtml**
2. Under **STANDARD**, download **TXT format**:
   - Direct link: `https://ratings.fide.com/download/standard_rating_list.zip`
3. Unzip and replace `standard_rating_list.txt` at the project root with the new file.

---

## Implementation Details

- **Parser**: `pipeline-service/src/lib/fideRatingListParser.ts` – parses fixed-width TXT format
- **DB**: `pipeline-service/src/lib/fideLocalDb.ts` – loads on first use, indexes by ID and name
- **File location**: `pipeline-service/standard_rating_list.txt`. The service looks in `cwd` (when running from pipeline-service) or `cwd/pipeline-service` (when running from project root).

---

## Title Code Mapping (FIDE legend)

| Code | Title |
|------|-------|
| g    | GM    |
| wg   | WGM   |
| m    | IM    |
| wm   | WIM   |
| f    | FM    |
| wf   | WFM   |
| c    | CM    |
| wc   | WCM   |
