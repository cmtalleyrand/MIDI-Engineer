
# Project Intent & Target Architecture

This document defines the **Desired End State** of the application. All future code changes must align with these specifications.

## 1. Data Pipeline Architecture

The application must process MIDI data in the following strict order. 
**Crucial Concept:** The internal analysis engine uses a **Shadow Quantization** layer. This layer determines how notes are interpreted for Voice Separation, most Analysis and ABC Export, distinct from the raw MIDI timing. Its goal is to extract the most likely underlying "score" from the MIDI by removing performance nuances (e.g. microtiming) and minor incosistencies in the MIDI, simplifying anakysis and voice allocation.

### Processing Order
1.  **Parse & Filter:** Ingest raw MIDI; remove unwanted events.
2.  **Section Identification:** 
    *   **Definition:** A Section is a contiguous block of music.
    *   **Boundary:** A new Section is created whenever there is a period of silence **equal to or greater than 1 measure**.
    *   **Anchor:** The first note of a Section establishes a new Grid Anchor (Beat 1.1.1) to reset any accumulated timing drift from previous sections. Note: should eventually happen after ornament detection but good enough for now.
3.  **Identify Ornaments:** Detect musical ornaments (Trills, Turns, Grace Notes) **before** any quantization. The rationale is (i) ornament performance is flexible so they should be interpreted in context an (ii) analytically the individual notes in an ornament are not treated as distinct pitches.
4.  **Shadow Quantization (Pass 1 - Analysis):**
    *   Analyze every note indidividually to determine its **Signature**, **Duration**, and **Grid Position**. This step treats each note in isolation.
    *   Apply detailed "Certainty" and "Ambiguity" logic (see Section 2).
5.  **Shadow Quantization (Pass 2 - Conflict Resolution):**
    *   Review flagged notes (Ambiguous/Uncertain) in the context of local logic.
    *   Resolve **Conflicts** (Overlaps, Blips, Inconsistencies) by adjusting notes to alternative grid/duration  interpretation thwt are a better fit in context .
6.  **Voice Separation (Conditional):** 
    *   **Export Context:** Only apply `distributeToVoices` if `OutputStrategy == separate_voices`. If `combine` or `separate_tracks` is selected, the track MUST retain its original polyphonic structure (Block Chords allowed).
    *   **Analysis/Visual Context:** It is permissible to run `distributeToVoices` unconditionally for *Visualization* (Piano Roll coloring) or *Analysis* (Voice Leading stats), provided this data does not leak into the Export pipeline.
    *   *Critical:* Since inputs are already quantized to the Shadow Grid, "tolerances" for vertical alignment are not required. Notes with the same `GridOnsetTime` are mathematically simultaneous.
7.  **Export/Render:** Generate outputs based on the resolved Shadow Grid.

## 2. Shadow Quantization & Grid Logic

### Definitions: Rhythm Configuration
The user defines the allowed rhythmic vocabulary via two layers to maximize control.

1.  **Primary Rhythm:** 
    *   **Family:** Simple (Base 2), Triple (Base 3), or Quintuple (Base 5).
    *   **Minimum Note Value (MNV):** The smallest allowed duration (e.g., 1/8). Notes in this signature cannnot be smaller than MNV, and the signature's grid subdivide finer than this.
2.  **Secondary Rhythm:** (Optional)
    *   **Family:** Simple, Triple, or Quintuple.
    *   **Minimum Note Value (MNV):** Specific to this secondary layer. (e.g., If a user knows there are triplets smaller than 1/8th Triplets, they may set triplet MNV at 1/12 but simple MNV at 1/32, ensuring very shortt notes are not considered as poential triplets).

**Rule:** A note duration is only valid if it matches a subdivision in the Primary or Secondary family **AND** is $\ge$ the specific MNV for that family.

### Pass 1: Analysis & Assignment Logic
For each note, calculate `RawDuration` and `RawOnsetTime`.

1.  **Step 1 - Candidate Identification:**
    *   Compare `RawDuration` against allowed values from the configured Primary and Secondary Rhythms.
    *   Ignore any values smaller than the defined MNVs.

2.  **Step 2a - Absolute Precision Gate:**
    *   Is `Abs(RawDuration - BestMatch.Value)` <= `Tolerance`?
    *   **Action:** If YES, lock `Duration` and `Signature`. Mark `Flag_Certain = True`.

3.  **Step 2b - Relative Clarity Gate (The "50% Rule"):**
    *   Is `Error(BestMatch) <= 0.5 * Error(SecondBestMatch)`?
    *   **Action:** If YES, lock `Duration` and `Signature`. Mark `Flag_Certain = False`.

4.  **Step 2c - Primary Bias Fallback:**
    *   If BestMatch belongs to **Primary Rhythm**, tentatively assign it but mark `Flag_Weak_Primary`.
    *   Otherwise, mark `Flag_Ambiguous`.

### Pass 2: Conflict Resolution
Iterate through the track and identify/resolve the following conflicts. **Resolution moves notes to alternative valid grid points/durations.**

1.  **Type 1: Physical Overlap (Unison):**
    *   **Condition:** Two notes have the same Pitch and Overlapping Onsets (taking into account the quantized duration).
    *   **Resolution:** Prefer accomodating the two notes by making the first note shorter and/or the second note longer and/or adjusting note onset. Merging should be deproiritised but not strictly avoided. Never truncate below MNV. This is critical for valid Voice Separation.

2.  **Type 2: Polyphony Blips (Density Spikes):**
    *   **Condition:** The number of simultaneous notes (Vertical Density) increases for a duration **shorter than 1 beat** before returning to the previous level (e.g., 4 voices -> 5 voices -> 4 voices).
    *   **Resolution:**
        *   Check if the "extra" note is `Ambiguous` or `Weak_Primary`.
        *   If so, force it to align with neighbors or move it to a valid gap. The goal is to flatten short-lived density spikes that disrupt voice continuity.

3.  **Type 3: Contextual Inconsistency:**
    *   **Condition:** An `Ambiguous` or `Weak_Primary` note resolves to a rhythm (e.g., Triplet) that is **isolated** (no other Triplets in the surrounding measure).
    *   **Resolution:** Force the note to the dominant rhythm of the context (e.g., Simple), even if the raw timing error is slightly higher.

## 3. Ornament Recognition Rules (Strict)

### Detection
Ornaments (Grace, Mordent, Turn, Trill) are detected **before** quantization based on strict Pitch/Duration patterns.

### Treatment (Ambiguity Reduction)
When quantizing a note with ornaments, we must determine if the ornament is "On the beat" (stealing time from principal) or "Before the beat" (stealing time from previous note). We choose the option that renders the **Principal Note** least ambiguous.

**Algorithm:**
1.  **Hypothesis A (On-Beat / Take):** 
    *   Principal Onset = Written Onset + Ornament Duration.
    *   Principal Duration = Written Duration - Ornament Duration.
2.  **Hypothesis B (Pre-Beat / Add):** 
    *   Principal Onset = Written Onset.
    *   Principal Duration = Written Duration.
3.  **Test:** Quantize the *Principal Note* from A and B against the Grid.
4.  **Decision:** Pick the Hypothesis where the Principal Note aligns most perfectly (Onset and Duration) with the grid (lowest error).

## 4. Voice Separation Algorithm (Constraint-Based Tracking)

### Core Concept
The algorithm assigns notes to structural voices (Soprano, Alto, Tenor, Bass) based on **Hard Constraints**.
*   **No Voice Crossing:** A voice cannot go higher than the voice above it or lower than the voice below it.
*   **Result:** This constraint drastically limits the search space. For most notes in a "gap", there are only 1 or 2 eligible voices.

### Processing Steps
1.  **Columnization:** Group resolved notes into strict vertical columns by `GridOnsetTime`.
2.  **Anchor Assignment:** 
    *   Identify columns where `Density == MaxPolyphony` (e.g., 4). 
    *   Assign these strictly Top-Down (Highest=Soprano, Lowest=Bass).
3.  **Gap Filling (Constraint Solver):**
    *   Iterate through notes in the gaps between Anchors.
    *   **Filter Candidates:** For a note `n`, identify which voices are available.
        *   *Exclude* any voice `V` if `Pitch(n) > Pitch(V-1)` (Crossing Soprano).
        *   *Exclude* any voice `V` if `Pitch(n) < Pitch(V+1)` (Crossing Bass).
    *   **Resolution:**
        *   If **1 Candidate**: Assign immediately.
        *   If **>1 Candidate** (e.g., Alto vs Tenor in middle register): Use **Pathfinding** (Cost Function) to choose the smoothest melodic line (minimize leaps).
        *   `weight_pitch_leap`: `(CurrentPitch - PreviousPitch)^2 * weight`. Penalizes jagged melodic lines.
        *   `weight_register_center`: `abs(CurrentPitch - VoiceCenterPitch) * weight`. Keeps voices in their approximate "lane" (Soprano high, Bass low).
        *   `weight_crossing_proximity`: Penalty for getting within `k` semitones of an adjacent voice (even if not crossing).
        *   `weight_gap_open`: Cost to "wake up" a voice after > 1 measure of silence (bias towards keeping active voices moving vs starting new lines).
