# FM24 Export Notes

Recommended first export views:

- Squad attributes: name, position, age, nationality, value, wage, all key technical/mental/physical attributes.
- Season stats: appearances, minutes, goals, assists, average rating.
- Recruitment shortlist: name, position, age, value, wage, scout opinion, key attributes.
- Team comparison or data-hub views when available as table exports.

Column names can be English or Korean for the common fields currently mapped in `src/analysis/attributeCatalog.ts` and `src/parsers/fmExport.ts`.

Avoid depending on `.fmf` files for player data. In this workflow, `.fmf` is useful for sharing a custom view setup, but the actual player rows should come from exported table data.
