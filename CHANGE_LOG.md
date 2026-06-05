# Change Log

## 2026-02-27 — Export duplicate-note reporting uses musical time only

- Updated export duplicate-note warnings to avoid raw tick units in user-facing messages.
- Warnings now report note locations as musical time (`M#:B#+fraction`) and durations in beats.
- Retained exact duplicate-note removal behavior (same MIDI pitch, onset, and duration).
- Added README documentation clarifying duplicate-note cleanup and musical-time reporting policy.

Purpose: persistent high-detail project memory for future AI sessions and maintainers.

## [Unreleased]

### Added / Changed - Code-review Phase 2: spec features, tests & doc corrections

Behaviour-changing feature work (guarded by new unit tests; the broad fixture
snapshot stayed byte-identical throughout, as the changes were additive or
exercised by new targeted tests rather than the existing fixtures).

- **2a — constraint-based voice solver (§4).** Rewrote `distributeToVoices` as a
  staged tracker: vertical-density voice count, multi-level top-down anchor
  assignment at sustained dense columns, and weighted path-cost gap-fill. New
  `voiceCosts.ts` houses the cost model — pitch-leap with octave/>octave/~15st
  discontinuities, register-center continuity, gap-open wake-up penalty,
  chord-fragmentation, and a near-hard crossing constraint — plus an orphan lane
  (§4.4.1). Module is now fully typed. `tests/voice-solver.test.ts` covers empty,
  single-note, conservation, SATB top-down split, strict-mono outlier, crossing
  pressure and internal non-overlap.
- **2b — Shadow Quantization Pass 2 (§2.5).** Investigation found Pass 2 was
  **already** a contextual conflict solver (not the passthrough the architecture
  doc claimed). Added `tests/shadow-pass2.test.ts` to pin the Type-1/2/3 conflict
  behavior + §2.5.2 ordering, and corrected `ARCHITECTURE_CURRENT.md`. The real
  remaining gap (Pass 1 candidate breadth) is now documented.
- **2c — ornament pipeline (§3.1.1).** Ornament detection already ran
  pre-quantization in `quantizeNotes`; now the active primary-rhythm family MNV
  ticks are threaded through to `getDefaultOrnamentDetectionParams` so
  `graceMaxDurTicks` tracks the chosen grid. `tests/ornament-pipeline.test.ts`
  proves the threshold shift. Remaining §2.4/§3.2/§3.3 work (quantizer consuming
  tags, on/pre-beat hypothesis, ABC grace rendering) is scoped in the midiCore
  note.
- **2d — transparency / trace (§5).** Added `rawOnsetTicks`/`rawDurationTicks`
  to the per-note `shadowDecision` payload, a `quantizationTrace.ts` builder/
  serializer, and a "Download Trace" button in the Piano Roll that exports a
  machine-readable JSON trace (raw + resolved timing, confidence, conflicts,
  candidates, objective breakdown). The in-UI "why changed" panels already
  existed. `tests/quantization-trace.test.ts` covers the payload + round-trip.
- Removed the orphaned root-level `midiAnalysis.ts` duplicate.

### Added / Changed - Code-review Phase 1: tooling, cleanup & type-safety foundation

Behaviour-preserving foundation pass (fixture snapshot byte-identical throughout).

- **Dev tooling**: ESLint v9 flat config (typescript-eslint, react, react-hooks),
  Prettier, `.editorconfig`. New npm scripts: `typecheck`, `lint`, `lint:fix`,
  `format`, `format:check`. `no-explicit-any` is a warning while the `any`
  cleanup is in progress; real correctness rules are errors.
- **CI**: new `.github/workflows/ci.yml` runs typecheck + lint + test + build on
  PRs and branch pushes; `deploy-pages.yml` left untouched.
- **Formatting**: one-time Prettier pass across the repo (isolated commit).
- **Dedupe / constants**: new `components/services/timeUtils.ts` centralizes
  `ticksPerMeasure()` and `pruneThresholdTicks()`, replacing 9+ duplicated
  measure calculations and the triplicated prune-multiplier array across
  midiTransform, midiPipeline, midiVoices and drumGenerator. Removed the unused
  `getCombinations()` helper. Named the shadow-quantizer tuning/penalty magic
  numbers as `SHADOW_TUNING` / `SHADOW_PENALTIES` (values unchanged).
- **PianoRoll**: memoized `totalTicks`/`ticksPerMeasure`/`totalMeasures`.
- **Logging**: new flag-gated `components/services/debug.ts` (`debugLog`/
  `debugWarn`); routed the pipeline's ad-hoc console calls through it and added
  `console.error` to the previously silent analyze/piano-roll catch handlers.
- **Type safety**: typed midiTransform's transform functions with `RawNote[]`
  (made `pruneOverlaps` generic). This surfaced and fixed a latent bug where
  spreading a tonejs `Note` dropped its `name` getter, leaving `RawNote.name`
  undefined on the analysis transform paths. The type pass then extended across
  `midiPipeline` (generic dedupe/event helpers, typed program-change access),
  `midiCore`/`ornamentDetector` (generic `detectAndTagOrnaments` over a minimal
  `TaggableNote`), `midiHarmony`, `midiAnalysis` (new `AnalyzableNote` type),
  `rhythmAnalysis`/`abcUtils`/`transformationAnalysis`, the settings handlers
  (keyof-indexed value types), the PWA install event, and the PianoRoll note
  state. **Lint warnings reduced 165 -> 45.** The active export and analysis
  pipeline is now `any`-free.
- **Monolith split**: the 522-line `drumGenerator.ts` was broken into `drumKit.ts`
  (map/types/helpers), `beatDetection.ts` and `drumPatterns.ts`, with
  `drumGenerator.ts` kept as a thin orchestrator re-exporting the public API.

Remaining (tracked for Phase 2): the `midiVoices.ts` and `shadowQuantizer.ts`
splits + their residual `any`s are deferred to Phase 2 because those modules are
substantially rewritten there (it would be throwaway churn now). The orphaned
root-level `midiAnalysis.ts` (a dead duplicate of
`components/services/midiAnalysis.ts`, imported by nothing) is flagged for
removal pending owner confirmation.

### Fixed - Ornament detector correctness and spec alignment

- **Turn span bug**: span was computed as `getEnd(e) - a.ticks`, including the sustained
  principal note's full duration, which caused `span > ornamentMaxSpanTicks` to reject nearly
  all turns silently. Fixed to `e.ticks - a.ticks` (ornamental note group only).

- **Trill max span removed**: trills can be arbitrarily long — the pattern is unambiguously
  recognisable by strict pitch alternation alone. Removed the `span <= 2 * Tq` guard.
  The greedy selector naturally prefers the longest window because confidence scales with
  note count (`0.7 + (len-4) * 0.04`).

- **`familyMNVticks` added to `OrnamentDetectionParams`**: `getDefaultOrnamentDetectionParams`
  now accepts an optional `familyMNVticks` argument (defaults to `Tq/4` = 1/16th note).
  `graceMaxDurTicks` is now computed as `min(Tq/8, 0.5 * familyMNVticks)` per spec §3.1.1,
  so grace threshold correctly responds to rhythm family changes.

### Added - Timing prior tags in ornament hypotheses

Each ornament class has a characteristic beat-position relationship in performed MIDI:

- **mordent / turn** take from the principal (ornament precedes beat; principal on-beat).
- **grace_group** is added to the principal (grace off-beat; principal stays on-beat).
- **trill** IS the principal (starts on-beat; no following principal).

`detectOrnamentHypotheses` now applies these priors after detection:

- `trill_is_principal` always added to trill hypotheses.
- `timing_prior_conflict` added when a hypothesis conflicts with its expected beat placement
  (e.g. grace starting on a beat, mordent/turn principal appearing off-beat, trill starting
  well off-beat). These tags are available to downstream consumers (quantization, UI) for
  extra scrutiny on ambiguous cases.

### Added - Pipeline wiring TODO

Prominent `TODO(pipeline-wiring)` comment added above `parseMidiFromFile` in `midiCore.ts`
documenting what is needed to hook ornament detection into the export/transform pipeline
per `PROJECT_INTENT §1`, including `familyMNVticks` passing and `detectOrnaments` flag
respecting. See `midiPipeline.ts:copyAndTransformTrackEvents` as the integration point.

### Fixed - Deploy built artifact to Pages instead of source tree

- Added GitHub Actions workflow `.github/workflows/deploy-pages.yml` that installs dependencies, runs `npm run build`, uploads `dist/`, and deploys via `actions/deploy-pages`.
- Documented Pages deployment requirement in `README.md`: set Pages source to **GitHub Actions** so the built Vite output is served.
- This addresses production black-screen behavior where live Pages served source `index.html` and attempted to load `/index.tsx` (404), leaving only the bootstrap fallback visible.
- Updated source `index.html` entry module path from `/index.tsx` to `./index.tsx` so project-subpath hosting no longer resolves to the domain root (`https://cmtalleyrand.github.io/index.tsx`).

### Fixed - GitHub Pages deployment pathing and entrypoint cleanup

- Added an explicit Vite `base` configuration for production GitHub Pages deployments (`/MIDI-Engineer/`) with `VITE_BASE_PATH` override support.
- Simplified `index.html` to a single Vite module entry and removed non-Vite import map wiring that could conflict with bundled production output.
- Removed stale `/index.css` reference that produced runtime/build warnings and could mask asset-loading issues during deployment verification.
- Kept service worker registration using a location-resolved URL so registration remains origin-safe under project subpaths.

### Changed - Precision pass for ornament definitions and voice-cost semantics

- Replaced high-level ornament taxonomy wording with deterministic, parameterized detection criteria.
- Added explicit ornament detection parameters (`Tq`, `ornamentMaxSpanTicks`, `graceMaxDurTicks`, `attachGapTicks`, `neighborMaxSemitones`).
- Specified formal predicates for grace groups, mordents, turns, and trills (including sequence cardinality, span limits, and pitch constraints).
- Refined `weight_register_center` wording to describe register-continuity behavior instead of vague lane-adherence wording.
- Extended orphan-note trigger conditions to include forced voice-crossing scenarios.

### Changed - Addressed follow-up review comments on precision and scope

- Expanded `PROJECT_INTENT.md` ornament section with explicit taxonomy and deterministic detection criteria for grace groups, mordents, turns, and trills.
- Added normative classifier output requirements for ornament detection (class, principal reference, members, bounds, confidence, ambiguity tags).
- Added explicit orphan-note definition and policy in voice separation:
  - orphan assignment trigger conditions,
  - no path-dependency behavior,
  - separate export lane/track requirement.
- Expanded `README.md` feature coverage to restore richer analysis/transformation details while keeping documentation map and governance guidance.

### Changed - PROJECT_INTENT.md expanded to fully detailed owner-specified contract

- Replaced the reduced-detail intent wording with a stricter, implementation-grade specification matching inline review feedback.
- Restored and clarified removed specificity in these areas:
  - strict pipeline semantics and explicit section-anchor behavior
  - detailed rhythm vocabulary and valid-duration construction rules
  - explicit requirement that ornament detection can classify sub-MNV structures before final principal-note resolution
  - fully specified Pass 2 contextual role (not passthrough) plus concrete conflict classes
  - weighted Pass 2 solver principles and high-penalty thresholds for excessive onset/duration movement
  - overlap handling detail including shortening longer overlap notes before merge fallback
  - SATB voice-cost policy updates (removed near-crossing proximity default, added leap discontinuity behavior, short wake-up policy, chord/orphan penalties)
  - mandatory dual debug surfaces (UI + downloadable machine-readable trace)
- Preserved owner defaults:
  - ABC shadow-quantized by default
  - MIDI unquantized by default unless selected
  - configurable section split threshold
  - compact SATB-first labels capped at 8 lanes

### Changed - Documentation governance retained

- Kept governance rules aligned with owner direction:
  - changelog updated each change
  - project plan blank by default unless requested
  - README release-updated
  - intent updated only on explicit owner intent revision requests

### Why this matters

- The intent document now functions as a precise contract for implementation work rather than an abbreviated summary.
- This reduces future drift and provides better continuity for AI-assisted iterations.
