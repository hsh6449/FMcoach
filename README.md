# FM Coach

FM Coach is a local assistant dashboard for Football Manager 2024 exports.

The current MVP reads FM24 HTML/TXT/CSV-style table exports, normalizes player data, scores role fit, and gives coaching advice for training, tactics, squad depth, and transfer priorities. It is intentionally export-based: it does not read FM process memory, decrypt save files, or automate game input.

## Current MVP

- FM24 export import for HTML, TXT, CSV-like tables
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

## FM24 Data Flow

1. In FM24, create a custom squad/player search view with the columns you want.
2. Use the export/print-screen flow that writes a table-like HTML/TXT file.
3. Import that file into FM Coach.
4. Ask the coach about a player, training focus, tactical fit, or transfer needs.

## Architecture

```text
FM24 HTML/TXT export
  -> parser
  -> normalized local player model
  -> role scoring and squad analysis
  -> chat/dashboard advice
```

OCR should stay as a context sensor only. It can identify the currently viewed player/team/screen later, while the actual advice should continue to come from exported data.

## Next Steps

- Add a desktop shell with always-on-top overlay behavior.
- Add a folder watcher for FM export refreshes.
- Add FM skin notes for reserving an assistant panel area.
- Add match/stat export adapters.
- Add LLM-backed responses with cited local data snippets.
- Add OCR context detection for current player/team names.
