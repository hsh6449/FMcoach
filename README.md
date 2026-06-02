# FM Coach

FM Coach is a local assistant dashboard for Football Manager 2024 exports.

The current MVP reads FM24 HTML/TXT/CSV-style table exports, normalizes player data, scores role fit, and gives coaching advice for training, tactics, squad depth, and transfer priorities. It is intentionally export-based: it does not read FM process memory, decrypt save files, or automate game input.

## Current MVP

- FM24 export import for HTML, TXT, CSV-like tables
- Export Bridge server that watches a local folder after the user exports data from FM24
- Flexible English/Korean column aliases for player fields and core attributes
- Local browser storage for the latest imported squad
- Role-fit scoring for common FM roles
- Best XI approximation
- Training focus recommendations
- Recruitment and squad-depth risk notes
- Chat panel backed by the local analysis engine
- Context selector that can later be driven by OCR

## Run

```bash
npm install
npm run dev
```

Vite will print a local URL, usually `http://localhost:5174`.

For the desktop app:

```bash
npm run desktop
```

For a macOS app bundle:

```bash
npm run package:mac
open release/mac-arm64/FM\ Coach.app
```

The desktop app does not need a separate browser or bridge server. Use `Choose Folder` in the app to point it at your FM24 export folder.

For the export-folder workflow, build the app and run the bridge server:

```bash
npm run build
npm run bridge -- --watch "/path/to/your/FM24/export/folder"
```

Then open `http://127.0.0.1:8765`. The app will read any `.html`, `.htm`, `.txt`, or `.csv` files in that folder and expose them through the local bridge API.

For terminal-only coaching:

```bash
npm run coach -- --watch "/path/to/your/FM24/export/folder"
```

Useful terminal commands:

- `/sync`: rescan the export folder
- `/summary`: show squad summary
- `/players [search]`: list players
- `/targets [search]`: rank recruitment candidates from shortlist/search exports
- `/compare target [vs player]`: compare a candidate with the best matching squad player or a named incumbent
- `/player name`: set the current player context
- `/files`: list imported export files
- `/quit`: exit

The terminal coach classifies files by name. Use names like `squad.html` for your own squad and `targets-shortlist.html`, `scout-search.html`, or `transfer-candidates.csv` for recruitment exports.

For experimental FMF inspection:

```bash
npm run fmf:inspect -- "/path/to/file-or-folder.fmf"
```

See `docs/FMF_LAB.md` for the FMF investigation plan.

## FM24 Data Flow

1. In FM24, create a custom squad/player search view with the columns you want.
2. Use the export/print-screen flow that writes a table-like HTML/TXT file.
3. Point the FM Coach bridge at the folder where those files are saved.
4. Export again whenever the save changes; the bridge rescans the folder.
5. Ask the coach about a player, training focus, tactical fit, or transfer needs.

You can use either the browser dashboard or the terminal coach. Both read the same export-folder data.

For recruitment, FM still does the huge-database search. FM Coach reads the exported result set and ranks it against your own squad.

## Architecture

```text
FM24 HTML/TXT export
  -> watched export folder
  -> bridge API
  -> parser
  -> normalized local player model
  -> role scoring and squad analysis
  -> chat/dashboard advice
```

OCR should stay as a context sensor only. It can identify the currently viewed player/team/screen later, while the actual advice should continue to come from exported data.

## Next Steps

- Add a desktop shell with always-on-top overlay behavior.
- Add compact terminal workflows for quick in-game consultation.
- Add a folder watcher for FM export refreshes.
- Add FM skin notes for reserving an assistant panel area.
- Add match/stat export adapters.
- Add LLM-backed responses with cited local data snippets.
- Add OCR context detection for current player/team names.
- Add experimental FMF readers for tactic/view/shortlist files.
