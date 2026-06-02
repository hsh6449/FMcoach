# FMF Lab

FMF support is experimental. The first goal is to learn what each `.fmf` file actually contains before treating it as a reliable data source.

## Why Inspect First

`.fmf` is a Football Manager container format. A view `.fmf`, tactic `.fmf`, shortlist `.fmf`, skin/resource `.fmf`, and editor-data `.fmf` can contain very different things.

Expected usefulness:

- View FMF: likely useful for understanding expected export columns, not player data.
- Tactic FMF: useful for importing a tactic profile if its contents can be extracted.
- Shortlist FMF: may contain player references, but may not contain full attributes.
- Editor-data FMF: useful for base database changes, not current save state.

## Inspector

```bash
npm run fmf:inspect -- "/path/to/file-or-folder.fmf"
npm run fmf:inspect -- "/path/to/file-or-folder.fmf" --json
```

The inspector reports:

- file size and SHA-256
- magic bytes
- rough container guess
- gzip/zlib/raw-deflate attempts
- readable strings
- likely FMF kind
- hints for the next parser

If the file does not expose text or a standard compressed payload, try extracting it with Football Manager Resource Archiver first, then inspect the extracted folder:

```bash
npm run fmf:inspect -- "/path/to/extracted/folder"
```

## Planned Parser Order

1. Extracted tactic folder to tactic profile.
2. Extracted view folder to export schema.
3. Extracted shortlist folder to candidate references.
4. Direct FMF archive decoder if the inspector reveals a stable FM24-specific structure.
