# Change Log

Purpose: persistent high-detail project memory for future AI sessions and maintainers.

## [Unreleased]

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
