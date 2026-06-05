# Current Architecture Snapshot (Implementation-Accurate)

This file documents what the code currently does (not target intent).

## 1) Application composition

- Root UI composition is in `App.tsx`.
- Main orchestration hook: `hooks/useMidiAppController.ts`.
- State domains:
  - project/file/track state: `hooks/useProject.ts`
  - playback state: `hooks/usePlayback.ts`
  - UI/messages/modals/PWA prompts: `hooks/useAppUI.ts`
  - conversion settings and option materialization: `context/SettingsContext.tsx`

## 2) Active processing path

Primary transformation/export path is routed through:

- `components/services/midiPipeline.ts`
- helper functions from `midiTransform.ts`, `midiVoices.ts`, and related service modules.

`copyAndTransformTrackEvents` currently performs (in order):

1. note copy + transposition + PPQ normalization
2. short-note filter
3. quantization (`quantizeNotes`)
4. time scaling
5. retrograde inversion
6. melodic inversion
7. modal conversion
8. export-range crop
9. note time/duration recomputation and write
10. event copy/transform for CC/pitch bend/program change (unless filtered)

Output strategy handling in `combineAndDownload`:

- `separate_tracks`: transform each selected source track independently
- `combine`: merge selected transformed notes into one track
- `separate_voices`: combine then run voice distribution and emit multiple tracks

## 3) Analysis path

Analysis entry points are in `components/services/midiAnalysis.ts`:

- `analyzeTrack`
- `analyzeTrackSelection`

Current analysis includes:

- rhythm statistics
- chord detection variants
- key prediction
- voice-leading intervals
- transformation impact summary

Voice assignment is currently used for analysis enrichment and display.

## 4) Shadow quantization code status

`components/services/shadowQuantizer.ts` runs two passes:

- Pass 1 (`analyzeShadowCertainty`): scores each note against the primary and
  secondary grids and assigns a confidence class (Certain / Weak_Primary /
  Ambiguous).
- Pass 2 (`resolveGridConflicts`): for each note it evaluates the candidate set
  (best + alternatives) via `evaluateHypothesisAtIndex`, scoring an objective
  that combines conflict penalties (unison overlap, short polyphony blips, local
  rhythm-family mismatch) with movement, ordering and confidence terms, then
  picks the lowest-cost candidate. Each note records a `shadowDecision` trace
  (selected family/value, conflict types, objective breakdown, alternatives).

Important implementation note:

- this module is not the sole mandatory engine for all export paths today.
- the active export pipeline is primarily driven by `midiPipeline` + `midiTransform`.

## 4b) Shared service utilities

- `components/services/timeUtils.ts`: single source of truth for
  `ticksPerMeasure()` and the prune/short-note threshold ladder
  (`pruneThresholdTicks()` / `PRUNE_THRESHOLD_MULTIPLIERS`).
- `components/services/debug.ts`: flag-gated `debugLog` (off unless
  `__MIDI_ENGINEER_DEBUG__` / `MIDI_ENGINEER_DEBUG` is set) and `debugWarn`.
- `shadowQuantizer.ts` exposes `SHADOW_TUNING` and `SHADOW_PENALTIES` constant
  objects documenting the Pass 1 gates and Pass 2 objective weights.
- Drum generation is split across `drumKit.ts` (GM map, shared types/helpers),
  `beatDetection.ts` (beat profile + timpani pitch detection) and
  `drumPatterns.ts` (the three pattern generators); `drumGenerator.ts` is a thin
  orchestrator re-exporting the public API.

> Note: a stale duplicate of the analysis module exists at the repository root
> (`midiAnalysis.ts`); the live one is `components/services/midiAnalysis.ts`.
> The root copy is imported by nothing and is a candidate for removal.

## 5) Known gap vs target architecture

Pass 1 generates a single onset/duration candidate per family at that family's
minimum note value, so Pass 2 reselects only between the primary and secondary
MNV grids; coarser in-family note values are not offered as separate candidates.
