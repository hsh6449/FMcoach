# FM24 Export Notes

Recommended first export views:

- Squad attributes: name, position, age, nationality, value, wage, all key technical/mental/physical attributes.
- Season stats: appearances, minutes, goals, assists, average rating.
- Recruitment shortlist: name, position, age, value, wage, scout opinion, key attributes.
- Team comparison or data-hub views when available as table exports.

Column names can be English or Korean for the common fields currently mapped in `src/analysis/attributeCatalog.ts` and `src/parsers/fmExport.ts`.

Avoid depending on `.fmf` files for player data. In this workflow, `.fmf` is useful for sharing a custom view setup, but the actual player rows should come from exported table data.

## Export Bridge

The bridge assumes the user still performs the in-game export action. After that, FM Coach can take over:

```bash
npm run build
npm run bridge -- --watch "/path/to/FM24/exports"
```

The bridge recursively scans the watched folder for `.html`, `.htm`, `.txt`, and `.csv` files, parses them with the same parser used by browser uploads, and serves the merged batch at:

- `GET /api/status`
- `GET /api/batch`
- `GET /api/files`
- `POST /api/rescan`

This avoids OCR and avoids reading FM save files or process memory.
