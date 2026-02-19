
# Change Log

## [Current] - Voice Logic Fix
- **Logic:** Refined "Island Detection" in Phase 2 Voice Allocation.
    - Previously, any note not connected to a pre-existing anchor was penalized as an "Island" (+1000 cost), often preventing valid phrases from entering a voice (e.g. a Bass line entering after a rest).
    - **Fix:** The algorithm now "looks ahead" at other unassigned notes. If a note is followed by another note within 1 measure, it is classified as a "Phrase Start" (Cost +25) instead of an "Island". This allows voices to wake up naturally for phrases while still suppressing isolated blips.

## [Previous] - Logic & UI Fixes
- **Logic:** Removed "Sparse Anchor" strategy (Strategy B) from Phase 1 Voice Allocation. Phase 1 now *only* assigns notes that are part of a Max Density Block (Strict Rank). Partial polyphony is exclusively handled by Phase 2.
- **UI:** Simplified Voice Inspector Header.
- **Refinement:** Ensured Phase 2 Cost logs use 1 decimal place.
