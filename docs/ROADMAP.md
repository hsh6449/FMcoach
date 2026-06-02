# FM Coach Roadmap

## Phase 1: Export-Based Coach

- Parse FM24 squad/player-search exports.
- Watch an export folder through the local bridge server.
- Offer terminal-only coaching for fast use beside FM.
- Rank shortlist/player-search exports against the current squad.
- Normalize key attributes and basic profile fields.
- Score common role fits.
- Recommend training focus and transfer priorities.
- Provide a chat interface using deterministic local analysis.

## Phase 2: Match and Season Context

- Add adapters for player stats, team stats, fixtures, and match history exports.
- Track file provenance so squad, stats, shortlist, and fixture exports can be refreshed independently.
- Detect recent-form risk, fixture congestion, and role overuse.
- Recommend rotation, recovery training, and opponent preparation.

## Phase 3: In-Game Feeling

- Build a desktop shell with an always-on-top frameless assistant panel.
- Add theme variables matching a custom FM24 skin.
- Keep the FM skin simple: reserve visual space and let the overlay provide interaction.
- Keep the terminal coach as a fallback when overlays are distracting or unreliable.

## Phase 4: Context Sensor

- Add OCR only for low-risk labels such as current player name, team name, or screen title.
- Never rely on OCR for numerical attributes or detailed match stats.
- Map OCR text back to local export records.

## Phase 5: AI Coach

- Add a retrieval layer over the local normalized database.
- Send only relevant player/stat snippets to the model.
- Require every recommendation to cite the local fields it used.
