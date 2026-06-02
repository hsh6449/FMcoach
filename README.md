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

## Local Environment Setup

Use this checklist when cloning the project on another laptop.

### Requirements

- Node.js 20 or newer
- npm
- macOS for the current Electron packaging script
- Football Manager 2024 exports in `.html`, `.htm`, `.txt`, or `.csv`
- Codex CLI, only if you want the real Codex handoff button to run

Check the basics:

```bash
node --version
npm --version
which codex
codex --version
```

The project targets Node 20 for the Electron build. If `node --version` is older than 20, install or switch Node before running `npm install`.

### First Run On A New Machine

```bash
git clone https://github.com/hsh6449/FMcoach.git
cd FMcoach
npm install
npm run build
```

For browser development:

```bash
npm run bridge -- --watch "/path/to/FM/export/folder" --port 8765
npm run dev -- --port 5174
```

Then open `http://127.0.0.1:5174/`.

For the desktop app:

```bash
npm run desktop
```

The desktop app stores its Codex handoff files in:

```text
~/Documents/FM Coach/coach-context
```

The browser bridge stores them in:

```text
./coach-context
```

Both folders are created automatically when the app or bridge starts.

### Codex CLI Path

The app tries to run Codex from:

```text
/Applications/Codex.app/Contents/Resources/codex
```

If Codex is installed somewhere else, set:

```bash
export FM_COACH_CODEX_BIN="/path/to/codex"
```

Then start the bridge or desktop app from the same terminal session. Without Codex CLI, import, parsing, squad analysis, and local chat still work; only the real Codex handoff run fails.

### FM Export Folder

The bridge and desktop app classify files by name:

- `squad.html`, `team.html`, `roster.csv`: own squad
- `targets-shortlist.html`, `scout-search.html`, `transfer-candidates.csv`: recruitment candidates
- `stats.html`, `match-record.csv`: stats or records

Keep squad exports and recruitment/search exports in the watched folder, but name them clearly so candidate files do not pollute the squad report.

### Generated Local Files

These folders are local-only and ignored by git:

```text
node_modules/
dist/
dist-electron/
release/
coach-context/
```

Do not copy `coach-context` between machines unless you intentionally want to bring old Codex run history with you.

### Common Fixes

- Port already in use: change the port, for example `npm run dev -- --port 5175` or `npm run bridge -- --port 8766`.
- Bridge not detected: make sure the bridge is running on `127.0.0.1:8765`, or use the desktop app instead.
- No players imported: check the export folder path and make sure the file extension is supported.
- Codex run fails: check `which codex`, `codex --version`, and `FM_COACH_CODEX_BIN`.
- Old data appears: use the `Data Sync` row in the app and click `Apply`; Codex request creation is disabled while export data and displayed data differ.

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

The desktop dashboard also uses this classification. Squad analysis only uses files classified as `squad`; recruitment exports stay out of the squad report so candidate files do not pollute your own team data.

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

For the first milestone, focus on the `Data Quality` panel. A good squad export should have name/position coverage near 100% and enough core attributes for role scoring.

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

## Codex Handoff

The app can create a local Codex handoff package:

```text
normalized squad/targets
  -> coach-context/latest-request.json
  -> coach-context/latest-request.md
  -> Codex reads the request and playbook
  -> Codex writes a run response.json
  -> backend mirrors it to coach-context/latest-response.json
  -> app reads the response and renders it
```

In the browser bridge workflow, the context folder is `coach-context` at the project root. In the desktop app, it is `~/Documents/FM Coach/coach-context`. The app creates this folder on startup, so a new laptop setup does not need manual folder creation. Each request also copies `AI_COACH_PLAYBOOK.md` into that folder so Codex can read a normal local file. The app does not invent AI output; it only renders `latest-response.json` after Codex writes it.

This is intentionally file-based. The chat panel can run a real Codex CLI handoff:

```text
app creates latest-request.md/json
  -> backend runs codex exec
  -> Codex writes runs/<runId>/response.json
  -> backend mirrors latest-response.json
  -> app reads the active response
```

If Codex is installed in a non-standard location, set `FM_COACH_CODEX_BIN=/path/to/codex`. This is the first terminal-connection experiment. A fuller embedded terminal/chat panel can wrap the same file protocol without changing the data contract.

Every Codex request is also stored as a run:

```text
coach-context/
  latest-request.json
  latest-request.md
  latest-response.json
  runs/
    20260602-080621-ed4a8488/
      request.json
      request.md
      response.json
      run-log.json
```

The `latest-*` files keep the current app flow simple. The `runs/*` folders preserve request history, responses, and execution logs so the app can reopen previous analyses.

## Data Sync Policy

The export bridge computes a `dataVersion` from watched file names, modified times, sizes, file kinds, and parsed player counts. The app keeps a separate active data version for what is currently displayed. If the watched export version changes, the app can auto-apply it or show a pending state with a manual apply button. Codex request creation is disabled while displayed data and watched export data are out of sync.

## Next Steps

- Add a desktop shell with always-on-top overlay behavior.
- Add compact terminal workflows for quick in-game consultation.
- Add a folder watcher for FM export refreshes.
- Add FM skin notes for reserving an assistant panel area.
- Add match/stat export adapters.
- Add LLM-backed responses with cited local data snippets.
- Add OCR context detection for current player/team names.
- Add experimental FMF readers for tactic/view/shortlist files.

## AI Coach Playbook

The LLM layer should use `docs/AI_COACH_PLAYBOOK.md` as its in-context tactical guide. The intended model is not pure AI guesswork: local data produces role/tactical evidence, and the AI explains how the player should be used, which teammates should support him, and where the squad structure creates risk.
