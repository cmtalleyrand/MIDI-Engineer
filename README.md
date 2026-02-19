# MIDI Engineer

A powerful browser-based tool for processing, analyzing, and transforming MIDI files.
It is aimed primarily at musicians (especially non-coders) who need precise control over quantization, voice handling, and notation export quality.

## Product Priorities

1. **Notation-clean ABC export quality** (shadow-quantized by default).
2. **Reliable advanced transformations** (voice splitting, inversion, modal remapping, etc.).
3. **Transparency** (users should be able to inspect what changed and why).

## Key Features

### 1) Track Management & Playback
- **Upload & Parse:** Drag-and-drop `.mid` ingestion using `@tonejs/midi`.
- **Track Selection:** Choose specific tracks for processing and analysis.
- **Audio Preview:** Real-time playback for selected material.
- **Piano Roll:** Visual note inspection with zooming and voice coloring support.

### 2) Analysis Engine
- **Rhythmic Integrity:** Inspect timing tightness and duration regularity.
- **Key & Mode Prediction:** Major/minor/modal inference from pitch class behavior.
- **Chord Detection:** Multiple strategies for harmonic interpretation:
  - *Sustain* (overlap/held-note driven)
  - *Attack* (simultaneous onset driven)
  - *Hybrid* (mixed behavior for polyphonic/arpeggiated textures)
  - *Beat-synced* (bucketed harmonic rhythm view)
- **Voice Leading:** Interval/histogram analysis for melodic-line smoothness.

### 3) Transformation Pipeline
- **Quantization & Rhythm Control:** Primary/secondary rhythm settings with configurable minimum note values.
- **Duration Constraints:** Cleanup of micro-notes/short artifacts via filtering thresholds.
- **Overlap Pruning:** Shortening/reconciling note overlaps for cleaner output.
- **Time Transformations:** Tempo/time conversion and time scaling.
- **Pitch Transformations:** Transposition, inversion, retrograde behaviors.
- **Modal Conversion:** Pitch remapping from one scale/mode context to another.

### 4) Voice Separation
- Split polyphonic content into structural voices with SATB-oriented intent.
- Keep label output compact (e.g., `S1`, `A1`, `T1`, `B1`) with up to 8 lanes.
- Supports analysis/visual use while preserving export-mode behavior rules.

### 5) Export
- **MIDI export** for downstream production workflows.
- **ABC export** for notation workflows.

## Default Output Policy (Intent)

- **ABC export defaults to shadow-quantized output**.
- **MIDI export defaults to no quantization unless explicitly enabled**.

This split exists because notation readability and performance-preserving MIDI output are separate goals.

## Documentation Map

- `README.md`: release-facing product and usage summary.
- `PROJECT_INTENT.md`: authoritative target behavior/specification.
- `PROJECT_PLAN.md`: intentionally blank by default; populate only on explicit planning request.
- `CHANGE_LOG.md`: high-detail change memory for future AI sessions.
- `docs/ARCHITECTURE_CURRENT.md`: implementation-accurate architecture snapshot.

## Development

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Release Documentation Rules

- Update `README.md` per release.
- Update `CHANGE_LOG.md` on every code/documentation change.
- Update `PROJECT_INTENT.md` only on explicit intent revision.
- Keep `PROJECT_PLAN.md` empty unless a planning request is active.

## GitHub Pages deployment

This app must be deployed from the built `dist/` output (not from repository root source files).
The `index.html` in repo root references `/index.tsx`, which only works when served by Vite in dev mode.
GitHub Pages should therefore publish the workflow artifact produced by `npm run build`.

The included workflow `.github/workflows/deploy-pages.yml` builds with Vite and deploys `dist/` on pushes to `main`.
