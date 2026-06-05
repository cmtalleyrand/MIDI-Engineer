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

- Pass 1 (`analyzeShadowCertainty`): per-note candidate scoring against the
  primary and secondary grids, with confidence classification (Certain /
  Weak_Primary / Ambiguous) using the absolute-tolerance and 50%-rule gates.
- Pass 2 (`resolveGridConflicts` + `evaluateHypothesisAtIndex`): a contextual
  conflict solver, **not** a passthrough. For each note it evaluates the
  candidate set against a weighted objective implementing the §2.5 conflict
  classes — Type 1 unison overlap (accommodation-first shortening, never below
  family MNV), Type 2 short polyphony blips, Type 3 contextual rhythm
  inconsistency — plus the §2.5.2 principle ordering (no deletion, preserve
  ordering, bounded onset/duration movement, confidence-aware edit cost) and
  picks the minimum-cost hypothesis. Each note records a `shadowDecision` trace
  (confidence, selected family/value, objective breakdown, conflict types,
  accommodation, alternatives).
- duration snap pass based on chosen candidate note value.

Verified by `tests/shadow-pass2.test.ts` (note conservation, trace payload,
Type-1 accommodation/MNV floor, onset snapping, disabled-rhythm no-op) and the
fixture suite (`overlapConflict`, `densityBlip`, `contextualTriplet`,
`tripletOutlier`).

Remaining gap: Pass 1 currently generates a single onset+duration candidate per
family at the family MNV, so Pass 2 chooses between the primary-MNV and
secondary-MNV grids only. Coarser in-family note values (≥ MNV, §2.2/§2.4) are
not yet offered as distinct candidates.

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
- Voice separation (`midiVoices.ts`) is a constraint-based tracker (§4): vertical
  density → top-down anchor assignment → weighted path-cost gap-fill, with the
  cost model in `voiceCosts.ts` and an orphan lane. Ornament detection threads
  the active family MNV into its grace threshold.
- `quantizationTrace.ts` builds the §5 machine-readable per-note trace (raw +
  resolved timing, confidence, conflicts, candidates); the Piano Roll exposes it
  via a "Download Trace" button and renders the in-UI rationale panels.

> Note: a stale duplicate of the analysis module exists at the repository root
> (`midiAnalysis.ts`); the live one is `components/services/midiAnalysis.ts`.
> The root copy is imported by nothing and is a candidate for removal.

## 5) Known gap vs target architecture

The §2.5 contextual Pass 2 conflict resolver (density blips, overlap
negotiation, contextual rhythm consistency, weighted principle ordering) **is
now implemented** (see §4). The remaining quantization gap is candidate
breadth: Pass 1 only offers each family's MNV grid, not coarser in-family note
values, so Pass 2's reselection space is limited to primary-vs-secondary MNV.
