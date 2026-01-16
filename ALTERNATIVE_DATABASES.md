# Alternative Open Source Chess Databases

This document outlines potential alternatives to ChessBase for classical game data integration.

## Recommended Options

### 1. **Lichess Open Database**
- **URL**: https://database.lichess.org/
- **Description**: Massive collection of games played on Lichess, available for download
- **Pros**: 
  - Free and open source
  - Millions of games available
  - Regular updates
  - Can filter by player, opening, time control
- **Cons**: 
  - Only includes Lichess games (not OTB classical)
  - Requires downloading and parsing large files
- **Integration**: Can download monthly PGN files and search locally

### 2. **Scid (Scid vs. PC)**
- **URL**: https://scid.sourceforge.net/
- **Description**: Free and open-source chess database application
- **Pros**:
  - Can maintain large databases of chess games
  - Supports PGN import/export
  - Open source and actively maintained
- **Cons**:
  - Primarily a desktop application
  - Would need to extract/export data for API use
- **Integration**: Could use Scid's database format or export PGN files

### 3. **ChessDB**
- **URL**: https://chessdb.sourceforge.net/
- **Description**: Free chess database for maintaining and searching game collections
- **Pros**:
  - Free and open source
  - Good search capabilities
  - Supports various game formats
- **Cons**:
  - Desktop application, not web API
  - Would require data export/import
- **Integration**: Export PGN files and parse them

### 4. **The Week in Chess (TWIC)**
- **URL**: https://theweekinchess.com/
- **Description**: Weekly chess news and game collections
- **Pros**:
  - Free PGN downloads
  - Includes OTB classical games
  - Regular updates
- **Cons**:
  - Manual download required
  - Not a searchable API
- **Integration**: Download weekly PGN files and parse

### 5. **PGN Mentor / Chess Tempo**
- **URL**: Various sources
- **Description**: Collections of annotated games
- **Pros**:
  - High-quality games
  - Often include annotations
- **Cons**:
  - Limited scope
  - Not comprehensive databases

## Recommended Approach

For this application, the best approach would be:

1. **Primary**: Use Lichess Open Database for online games (already integrated via Lichess API)
2. **Secondary**: Integrate TWIC PGN downloads for classical OTB games
   - Download weekly PGN files
   - Parse and search by player name
   - Store in local database or cache
3. **Future**: Consider building a local database from multiple sources:
   - TWIC weekly downloads
   - FIDE tournament results (if available)
   - Other open PGN collections

## Implementation Notes

- All alternatives require PGN parsing (already implemented)
- Consider caching classical games locally to avoid repeated downloads
- Player name matching may require fuzzy matching due to name variations
- Consider using a local SQLite or similar database to store parsed classical games
