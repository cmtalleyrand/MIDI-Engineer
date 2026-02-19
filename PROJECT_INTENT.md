# Project Intent & Target Architecture

This document defines the **Desired End State** of the application in precise, implementation-grade terms.
It is intentionally detailed and normative.

---

## 0) Product Purpose, Audience, and Priority Order

### Audience
- Primary audience: **non-coders**.
- Advanced behavior must be exposed as controllable options, with transparent debug visibility, without requiring coding knowledge.

### Priority order
1. **Notation-clean ABC export quality**.
2. **Reliable, flexible, precise advanced MIDI transformation** (including robust voice splitting and advanced quantization).
3. **Transparency** (users can inspect what changed, where, and why).

### Output defaults (normative)
- **ABC export MUST be shadow-quantized by default**.
- **MIDI export MUST be unquantized by default unless quantization is explicitly enabled**.
- Transform operations (transpose, invert, modal remap, crop, etc.) MUST remain available regardless of quantization choice.

---

## 1) Data Pipeline Architecture

The processing order is strict.

### Processing Order
1. **Parse & Filter**
   - Ingest raw MIDI and remove/retain events according to user settings.
2. **Section Identification**
   - A Section is a contiguous musical block.
   - Section boundary is created after silence of at least `sectionSplitThreshold`.
   - `sectionSplitThreshold` MUST be configurable.
   - Default threshold MAY be 1 measure, but must remain configurable.
   - First note of each section establishes a local grid anchor (Beat 1.1.1 relative to section) to prevent drift carryover.
3. **Ornament Detection (Pre-Quantization)**
   - Detect ornament structures (Grace, Mordent, Turn, Trill) before quantization.
   - This stage can classify ornament notes that may be below MNV so they are handled structurally, not deleted.
4. **Shadow Quantization Pass 1 (Local Analysis)**
   - Per-note local candidate generation and certainty classification.
5. **Shadow Quantization Pass 2 (Contextual Conflict Resolution)**
   - Resolve ambiguity and cross-note conflicts using contextual logic.
6. **Voice Separation (Conditional by export mode)**
   - Export path MUST apply voice separation only when `OutputStrategy == separate_voices`.
   - Analysis/visualization paths MAY run voice assignment independently.
   - Analysis/visualization voice assignments MUST NOT leak into non-voice-separated exports.
7. **Render/Export**
   - ABC defaults to resolved shadow representation.
   - MIDI defaults to unquantized timing unless quantization enabled.

---

## 2) Shadow Quantization & Grid Logic

### 2.1 Rhythm Configuration Vocabulary
User rhythm vocabulary is defined by Primary + optional Secondary rhythm systems.

#### Primary Rhythm
- Family: `simple` (base-2), `triple` (base-3), or `quintuple` (base-5).
- Has family-specific `MNV` (minimum note value).

#### Secondary Rhythm (optional)
- Family: `simple`, `triple`, or `quintuple`.
- Has its own family-specific `MNV`.

### 2.2 Valid duration sets (normative)
Durations are expressed in quarter-note units.

- Base durations for family `f` are: `quarter / (f^n)` for integer `n >= 0`, with larger values available by inverse powers (`quarter * f^k` where musically valid).
- Practical examples include quarter, half, whole, eighth, etc. depending on family.
- For `simple`, dotted durations are additionally valid as `3/2 * quarter / (2^n)`.
- Double-dotted values are valid **only** when explicit `allowDoubleDotting` option is enabled (default: disabled).
- A duration candidate is valid only if:
  - It belongs to Primary or Secondary valid set, and
  - It is `>=` the selected family MNV.

### 2.3 Quantization scope (mandatory)
Shadow quantization MUST normalize both:
- note onsets, and
- note durations.

Onset-only quantization is explicitly insufficient.

### 2.4 Pass 1: Local candidate analysis
For each note, compute `RawOnsetTime` and `RawDuration` and evaluate candidates.

1. **Candidate generation**
   - Generate onset + duration candidates from allowed Primary and Secondary grids.
   - Candidates below family MNV are invalid for final assignment.
   - Ornament-classified notes may temporarily violate generic MNV assumptions during ornament handling, but final principal-note resolution must remain valid.
2. **Absolute precision gate**
   - If `abs(error_best) <= tolerance_abs`, candidate is `Certain`.
3. **Relative clarity gate (50% rule)**
   - If `error_best <= 0.5 * error_second_best`, candidate may be accepted as weak certainty.
4. **Primary bias fallback**
   - If unresolved and best candidate is Primary-family, mark `Weak_Primary`.
   - Else mark `Ambiguous`.

Pass 1 output per note MUST include:
- selected tentative candidate,
- alternative candidates,
- confidence class (`Certain`, `Weak_Primary`, `Ambiguous`),
- reasoning metadata sufficient for debug tracing.

### 2.5 Pass 2: Contextual conflict resolution (required)
Pass 2 is a contextual solver, not a passthrough.
It may choose a non-local-best candidate when contextual fit is better.

#### 2.5.1 Conflict classes
1. **Type 1: Physical overlap (unison conflict)**
   - Condition: same pitch notes overlap after tentative quantization.
   - Resolution preference order:
     - accommodate by timing/value adjustments,
     - including shortening the longer overlapping note where appropriate,
     - merge only when accommodation is not viable.
   - Never truncate below family MNV.
2. **Type 2: Polyphony blips (density spikes)**
   - Condition: brief density spike then immediate return (typically `< 1 beat`).
   - If spike is driven by `Ambiguous` or `Weak_Primary`, favor realignment that flattens transient blips.
3. **Type 3: Contextual rhythm inconsistency**
   - Condition: isolated rhythm-family outlier (e.g., isolated triplet) against dominant local context.
   - Solver should favor contextual consistency as a soft bias, not brittle hard-forcing.

#### 2.5.2 Solver principle ordering (weighted, not absolute)
Prioritize the following in order, while still balancing them jointly:
1. Keep every note (avoid deletion).
2. Preserve relative ordering of note events.
3. Avoid large onset/value changes:
   - duration change outside `[x0.5, x2]` is high-penalty,
   - onset shift greater than `min(eighth-note, 1.5 * note_value)` is high-penalty.
4. Reduce overlaps and short-lived polyphony blips.
5. Avoid changing high-confidence assignments.
6. Prefer regularized durations.
7. Prefer grid-aligned onsets.
8. Prefer changing lower-confidence assignments before higher-confidence assignments.

### 2.6 Secondary rhythm contextual policy
Secondary rhythm usage should generally appear as contextual patterning and rarely in complete isolation.
This is a soft contextual preference and must not be implemented as a rigid prohibition.

---

## 3) Ornament Recognition Rules

### 3.1 Detection
Detect ornaments pre-quantization using strict pitch, duration, and local-context patterns.

### 3.1.1 Ornament taxonomy and detection criteria (normative)
Ornament detection MUST be deterministic and parameterized.

Define these local parameters per candidate window:
- `Tq` = quarter-note duration in ticks.
- `ornamentMaxSpanTicks` (default `Tq`) = max total ornament window.
- `graceMaxDurTicks` (default `min(Tq/8, 0.5 * familyMNVticks)`) = maximum duration per grace note.
- `attachGapTicks` (default `Tq/16`) = max gap from ornament end to principal onset.
- `neighborMaxSemitones` (default `2`) = max pitch distance considered a principal neighbor.

1. **Grace group (acciaccatura/appoggiatura-like pre-principal cluster)**
   - Candidate note run `g1..gn` qualifies when all are true:
     - every `dur(gi) <= graceMaxDurTicks`,
     - notes are contiguous (`gap(gi, gi+1) <= attachGapTicks`),
     - principal `p` begins within `attachGapTicks` after `gn` ends,
     - run span `end(gn) - start(g1) <= ornamentMaxSpanTicks`,
     - melodic motion is locally ornamental (at least one `|pitch(gi)-pitch(p)| <= neighborMaxSemitones`).
2. **Mordent (principal-neighbor-principal, 3-note cell)**
   - Triple `a,b,c` qualifies when all are true:
     - `pitch(a) == pitch(c)`,
     - `|pitch(b)-pitch(a)| <= neighborMaxSemitones`,
     - `dur(a),dur(b),dur(c) <= Tq/4`,
     - total span `end(c)-start(a) <= ornamentMaxSpanTicks`.
3. **Turn (neighbor-principal-neighbor around principal)**
   - Four-note cell `a,b,c,d` qualifies when all are true:
     - `pitch(b)` is principal,
     - `pitch(a)` and `pitch(c)` are opposite-side neighbors of `pitch(b)` (upper/lower order may invert by variant),
     - `pitch(d)` returns to principal or opposite neighbor,
     - each duration `<= Tq/4`, and total span `<= ornamentMaxSpanTicks`.
4. **Trill (repeated principal-neighbor alternation)**
   - Sequence `n1..nk` qualifies when all are true:
     - `k >= 4`,
     - only two pitch classes are present (`principal`, `neighbor`),
     - adjacent notes alternate pitch without repetition breaks,
     - `|principal-neighbor| <= neighborMaxSemitones`,
     - sequence span `<= 2 * Tq` unless explicitly extended by user option.

Classifier outputs MUST include:
- ornament class,
- principal note reference,
- ornament member note IDs,
- timing-window bounds,
- confidence score,
- ambiguity tags when multiple classes plausibly fit.

When classification is ambiguous, retain competing hypotheses for downstream scoring rather than collapsing early.

### 3.2 Timing interpretation (mandatory hypothesis test)
For each ornament-principal event, evaluate:
1. **On-Beat / Take**
   - principal onset shifted by ornament duration,
   - principal duration reduced accordingly.
2. **Pre-Beat / Add**
   - principal onset unchanged,
   - principal duration unchanged.

Quantize both hypotheses and select the interpretation with lower principal-note ambiguity/error (onset + duration).

### 3.3 ABC rendering default
When musically appropriate, ABC should default to grace-note notation for ornaments while preserving readability and consistency with resolved quantization.

---

## 4) Voice Separation Algorithm (Constraint-Based Tracking)

### 4.1 Objective
Voice handling must satisfy both:
- SATB-like readability, and
- general polyphonic readability.

### 4.2 Core constraints
- Voice crossing is a strong near-hard constraint.
- Inputs are resolved shadow-grid notes; exact-same-grid onsets are simultaneous columns.

### 4.3 Assignment stages
1. Columnization by grid onset.
2. Anchor assignment at max-density columns (top-down by pitch).
3. Gap filling via constrained candidate selection + path cost.

### 4.4 Cost terms and behavior requirements
- `weight_pitch_leap`:
  - baseline leap penalty,
  - include a small discontinuity at octave,
  - larger discontinuity above octave,
  - additional smaller discontinuity around 15 semitones,
  - behavior should acknowledge that octave leaps can still remain same voice, while > octave often indicates possible voice handoff.
- `weight_register_center`: register-continuity preference term (keep each voice near its recent pitch center; avoid sustained register drift unless offset by stronger leap/continuity evidence).
- `weight_gap_open`:
  - penalize short wake-ups (especially < 1 measure),
  - reduced penalty for extended re-entry,
  - must not block reassignment when continuing same voice would force sustained out-of-register behavior or excessive leaps.
- **No generic near-crossing proximity penalty** as default behavior.
- Include penalty for excessive chord fragmentation across voices.
- Include orphan-note handling concept (avoid isolated single-note voice artifacts without continuity context).

### 4.4.1 Orphan note definition and export policy (normative)
`Orphan` is a valid temporary assignment state used when assigning a note to any active voice would be disproportionately costly.

A note may be marked `Orphan` when one or more of the following holds:
- assigning it to any voice would force an implausible chord in context,
- assigning it would require a short-lived voice wake-up (typically < 1 measure) with poor continuity,
- assigning it would create extreme path distortion relative to neighboring voice trajectories,
- assigning it would force voice crossing or immediate crossing pressure that conflicts with near-hard crossing constraints.

Behavior requirements:
- Orphans carry **no voice path dependency** and therefore do not force future voice continuity constraints.
- Orphans must be exportable on a dedicated separate track/lane so they are preserved rather than deleted.
- The solver should still prefer non-orphan placement when a musically coherent, low-cost placement exists.

### 4.5 Voice labeling and lane cap
- Always use compact labels (letter + number when needed).
- Default preference is SATB-oriented naming.
- Cap voices at 8 lanes.
- Canonical 8-lane ordering: `S1, S2, A1, A2, T1, T2, B1, B2`.
- For fewer lanes, map by broad register role (e.g., two low => `T`, `B`; two high => `S`, `A`).
- Never spell out full names when compact labels are sufficient.

---

## 5) Analysis, Reporting, and Transparency

- Analysis must support global and section-aware modes.
- Chord interpretation modes remain selectable by user context.
- Alternative analysis hypotheses must be exportable when requested.
- Deep debug is mandatory in two forms:
  - in-UI explanation (note-level “why changed” visibility),
  - downloadable machine-readable trace.

Minimum trace payload per note:
- raw onset/duration,
- candidate list,
- selected candidate,
- confidence class,
- conflict checks applied,
- final resolution rationale.

---

## 6) Documentation Governance

- `CHANGE_LOG.md` MUST be updated on every code/doc change.
- `PROJECT_PLAN.md` remains blank by default and is populated only when explicitly requested.
- `README.md` is updated per release.
- `PROJECT_INTENT.md` is revised only on explicit owner intent updates.

---

## 7) Intent vs Implementation Tracking

This file is the target-spec contract.
Current behavior and implementation gaps are tracked separately in `docs/ARCHITECTURE_CURRENT.md`.
