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

`components/services/shadowQuantizer.ts` exists and includes:
- Pass 1 candidate scoring and confidence classification
- Pass 2 function (`resolveGridConflicts`) that currently maps each note to Pass 1 best candidate without contextual optimization
- duration snap pass based on chosen candidate note value

Important implementation note:
- this module is not the sole mandatory engine for all export paths today.
- the active export pipeline is primarily driven by `midiPipeline` + `midiTransform`.

## 5) Known gap vs target architecture

The target spec expects a fully contextual Pass 2 conflict resolver (density blips, overlap negotiation, contextual rhythm consistency, etc.).
Current implementation does not yet realize this full behavior.
