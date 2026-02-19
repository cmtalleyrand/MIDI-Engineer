
# Project Implementation Plan

This document outlines the iterative roadmap to align the application with `PROJECT_INTENT.md`.

## Phase 1: Data Structures & Segmentation Logic
**Goal:** Establish the types and basic pipeline structure without breaking current functionality.
*   [ ] **Task 1.1:** Update `types.ts` to include `Section`, `QuantizationFlags`.
*   [ ] **Task 1.2:** Update `ConversionOptions` to support the new Rhythm Config:
    *   `primaryRhythm`: { family: 'Simple'|'Triple'|'Quint', minNoteValue: string }
    *   `secondaryRhythm`: { family: 'Simple'|'Triple'|'Quint', minNoteValue: string } (Optional)
*   [ ] **Task 1.3:** Implement `Section` detection logic in `midiCore.ts`. 
    *   Logic: Split tracks based on >= 1 measure of silence.
    *   Output: `Section[]` with anchor times.

## Phase 2: Ornament Recognition Overhaul
**Goal:** Align ornament detection with strict definitions and Ambiguity Reduction strategy.
*   [ ] **Task 2.1:** Update `detectAndTagOrnaments` in `midiCore.ts` with strict patterns.
*   [ ] **Task 2.2:** Implement `resolveOrnamentTiming(principal, ornaments, grid)` helper.
    *   Logic: Test "On-Beat" vs "Pre-Beat" hypotheses.
    *   Metric: Minimize Grid Error for the *Principal Note's* Onset and Duration.

## Phase 3: The Shadow Quantizer (Core Engine)
**Goal:** Implement the 2-Pass Quantization logic with a specific Cost Function for conflicts.

*   [ ] **Task 3.1:** Create `components/services/shadowQuantizer.ts`.
*   [ ] **Task 3.2:** Implement **Pass 1 (Analysis)** using Gate Variables:
    *   `gate_abs_tolerance` (ticks): Hard window for "Certain" matches.
    *   `gate_rel_clarity` (0.0-1.0): The error margin ratio (default 0.5) for the "50% Rule".
    *   Output: Assign flags `Certain`, `Weak_Primary`, `Ambiguous`.

*   [ ] **Task 3.3:** Implement **Pass 2 (Conflict Resolution)** using a Cost Function.
    *   For every ambiguous note, calculate `TotalCost` for each grid candidate. Pick the minimum.
    *   **Variables:**
        *   `cost_grid_error`: Weight applied to raw timing deviation (ticks).
        *   `cost_rhythm_switch`: Penalty for choosing a rhythm family (e.g., Triplet) that differs from the measure's dominant family.
        *   `cost_density_spike`: High penalty for aligning a note such that momentary Vertical Density > Average Polyphony (blips).
        *   `cost_overlap`: Penalty for overlapping an existing note in the same register.

*   [ ] **Task 3.4:** UI Integration: 
    *   Update `TrackList.tsx` to include the dual Rhythm Family and MNV selectors.

## Phase 4: Structural Voice Separation
**Goal:** Implement Voice Assignment using Constraints and a weighted Cost Function.

*   [ ] **Task 4.1:** Update `midiVoices.ts` to use quantized input.
*   [ ] **Task 4.2:** Implement **Anchor Logic**:
    *   Identify columns where Density == MaxPolyphony.
    *   Assign Voices 0..N strictly Top-Down.

*   [ ] **Task 4.3:** Implement **Gap Solver (Cost Function)**.
    *   For notes in gaps, calculate the cost of assigning to each eligible Voice.
    *   **Variables:**
        *   `hard_constraint_crossing` (Boolean): If True, crossing an adjacent voice results in `Cost = Infinity`.
        *   `weight_pitch_leap`: `(CurrentPitch - PreviousPitch)^2 * weight`. Penalizes jagged melodic lines.
        *   `weight_register_center`: `abs(CurrentPitch - VoiceCenterPitch) * weight`. Keeps voices in their approximate "lane" (Soprano high, Bass low).
        *   `weight_crossing_proximity`: Penalty for getting within `k` semitones of an adjacent voice (even if not crossing).
        *   `weight_gap_open`: Cost to "wake up" a voice after > 1 measure of silence (bias towards keeping active voices moving vs starting new lines).

## Phase 5: Export & Cleanup
**Goal:** Ensure ABC export uses the new system.
*   [x] **Task 5.0:** Fix export bugs (PPQ scaling, read-only properties, Strategy adherence).
*   [ ] **Task 5.1:** Update `midiAbc.ts` to stitch `Sections` together.
*   [ ] **Task 5.2:** Verify measure resets work for drift correction.
*   [ ] **Task 5.3:** Clean up legacy code in `midiTransform.ts` and `midiVoices.ts`.
