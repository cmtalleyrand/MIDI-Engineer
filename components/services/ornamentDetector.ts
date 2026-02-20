export type OrnamentClass = 'grace_group' | 'mordent' | 'turn' | 'trill';

export interface OrnamentDetectionParams {
    Tq: number;
    ornamentMaxSpanTicks: number;
    graceMaxDurTicks: number;
    attachGapTicks: number;
    neighborMaxSemitones: number;
    /** Minimum note value in ticks for the active rhythm family.
     *  Used to bound graceMaxDurTicks per spec: min(Tq/8, 0.5 * familyMNVticks).
     *  Defaults to Tq/4 (1/16th note) when not supplied. */
    familyMNVticks: number;
}

export interface OrnamentTimingBounds {
    startTick: number;
    endTick: number;
    principalTick: number;
}

export interface OrnamentHypothesis {
    class: OrnamentClass;
    principalNoteRef: string;
    memberNoteIds: string[];
    timingBounds: OrnamentTimingBounds;
    confidence: number;
    ambiguityTags: string[];
}

export interface OrnamentAnnotatedNote {
    id: string;
    ticks: number;
    durationTicks: number;
    midi: number;
    [key: string]: any;
}

const cap01 = (n: number): number => Math.max(0, Math.min(1, n));
const getEnd = (n: OrnamentAnnotatedNote): number => n.ticks + n.durationTicks;
const getGapAfter = (a: OrnamentAnnotatedNote, b: OrnamentAnnotatedNote): number => b.ticks - getEnd(a);
const unique = <T>(arr: T[]): T[] => Array.from(new Set(arr));

/** Returns true if tick is within toleranceTicks of a quarter-note beat boundary. */
function isNearBeat(tick: number, Tq: number, toleranceTicks: number): boolean {
    const mod = tick % Tq;
    return mod <= toleranceTicks || (Tq - mod) <= toleranceTicks;
}

/**
 * Build default ornament detection params from PPQ and optional familyMNVticks.
 *
 * @param ppq - MIDI ticks per quarter note.
 * @param familyMNVticks - Minimum note value ticks for the active rhythm family.
 *   Defaults to Tq/4 (1/16th note in simple family). Pass the actual family MNV when
 *   known so graceMaxDurTicks = min(Tq/8, 0.5*familyMNVticks) is correctly bounded.
 */
export function getDefaultOrnamentDetectionParams(ppq: number, familyMNVticks?: number): OrnamentDetectionParams {
    const Tq = ppq;
    const resolvedFamilyMNV = familyMNVticks ?? Math.round(Tq / 4);
    return {
        Tq,
        ornamentMaxSpanTicks: Tq,
        // spec: min(Tq/8, 0.5 * familyMNVticks)
        graceMaxDurTicks: Math.max(1, Math.min(Math.round(Tq / 8), Math.round(resolvedFamilyMNV / 2))),
        attachGapTicks: Math.max(1, Math.round(Tq / 16)),
        neighborMaxSemitones: 2,
        familyMNVticks: resolvedFamilyMNV,
    };
}

function asAnnotated(notes: any[]): OrnamentAnnotatedNote[] {
    return [...notes]
        .sort((a, b) => (a.ticks - b.ticks) || (a.midi - b.midi))
        .map((n, i) => {
            if (n.id !== undefined) return n as OrnamentAnnotatedNote;
            const fallbackId = `n_${n.ticks}_${n.midi}_${i}`;
            (n as any).id = fallbackId;
            return n as OrnamentAnnotatedNote;
        });
}

function mkTimingBounds(member: OrnamentAnnotatedNote[], principal: OrnamentAnnotatedNote): OrnamentTimingBounds {
    const startTick = Math.min(...member.map(n => n.ticks));
    const endTick = Math.max(...member.map(getEnd));
    return { startTick, endTick, principalTick: principal.ticks };
}

/*
 * TIMING PRIORS
 *
 * Each ornament class has a characteristic relationship to the beat in performed MIDI.
 * These are priors, not hard rules — skilled performers vary, and human MIDI is imprecise.
 *
 * - mordent / turn : "take from" the principal
 *     Ornamental notes eat into the time before the principal note. In raw MIDI the
 *     ornament group precedes the beat; the principal note arrives on (or near) the beat.
 *     Flag `timing_prior_conflict` if the principal appears significantly off-beat.
 *
 * - grace_group : "added to" the principal
 *     Grace notes are squeezed in before the principal. The principal keeps its
 *     on-beat position; grace notes are therefore off-beat by construction.
 *     Flag `timing_prior_conflict` if the grace note appears to start on-beat
 *     (suggests it may be a main note preceding another main note, not a grace).
 *
 * - trill : IS the principal
 *     No distinct following principal exists. The trill begins where the principal
 *     would — on or near the beat. `trill_is_principal` is always added.
 *     Flag `timing_prior_conflict` additionally if the trill starts well off-beat.
 *
 * These tags are consumed downstream (e.g. quantization pre-pass) to apply extra
 * scrutiny when the beat-placement evidence is ambiguous.
 */
function applyTimingPriors(
    h: OrnamentHypothesis,
    principal: OrnamentAnnotatedNote,
    params: OrnamentDetectionParams,
): void {
    const tol = params.attachGapTicks;
    const Tq = params.Tq;

    if (h.class === 'trill') {
        h.ambiguityTags = unique([...h.ambiguityTags, 'trill_is_principal']);
        if (!isNearBeat(h.timingBounds.startTick, Tq, tol)) {
            h.ambiguityTags = unique([...h.ambiguityTags, 'timing_prior_conflict']);
        }
        return;
    }

    if (h.class === 'grace_group') {
        // Grace notes expected off-beat; flag if grace appears to start on a beat.
        if (isNearBeat(h.timingBounds.startTick, Tq, tol)) {
            h.ambiguityTags = unique([...h.ambiguityTags, 'timing_prior_conflict']);
        }
        return;
    }

    // mordent / turn: principal expected on-beat. Flag if principal appears off-beat.
    if (!isNearBeat(principal.ticks, Tq, tol)) {
        h.ambiguityTags = unique([...h.ambiguityTags, 'timing_prior_conflict']);
    }
}

export function detectOrnamentHypotheses(notes: any[], params: OrnamentDetectionParams): OrnamentHypothesis[] {
    const sorted = asAnnotated(notes);
    if (sorted.length < 2) return [];

    const hypotheses: OrnamentHypothesis[] = [];
    const noteById = new Map<string, OrnamentAnnotatedNote>(sorted.map(n => [n.id, n]));

    // Grace group (single grace note for this version; g then principal p).
    // Multi-note grace clusters (g1..gn) are planned but deferred to a future pass.
    for (let i = 0; i < sorted.length - 1; i++) {
        const g = sorted[i];
        const p = sorted[i + 1];
        const gap = getGapAfter(g, p);
        const maxRelativeDur = Math.max(1, Math.floor(p.durationTicks / 3));
        const graceIsShort = g.durationTicks <= Math.min(params.graceMaxDurTicks, maxRelativeDur);
        const neighborish = Math.abs(g.midi - p.midi) <= params.neighborMaxSemitones;

        if (graceIsShort && gap <= params.attachGapTicks && g.durationTicks <= params.ornamentMaxSpanTicks && neighborish) {
            const durScore = cap01(1 - (g.durationTicks / (Math.min(params.graceMaxDurTicks, maxRelativeDur) + 1)));
            const gapScore = cap01(1 - Math.max(0, gap) / (params.attachGapTicks + 1));
            hypotheses.push({
                class: 'grace_group',
                principalNoteRef: p.id,
                memberNoteIds: [g.id],
                timingBounds: mkTimingBounds([g], p),
                confidence: cap01((durScore + gapScore) / 2),
                ambiguityTags: [],
            });
        }
    }

    // Mordent: neighbor-center-neighbor ornament cell (a,b,c) + following long principal (d).
    // Classical "principal-neighbor-principal": b is the center, a and c are the neighbors.
    // Mordent TAKES FROM the principal: a,b,c precede the beat; d arrives on-beat.
    for (let i = 0; i <= sorted.length - 4; i++) {
        const [a, b, c, d] = [sorted[i], sorted[i + 1], sorted[i + 2], sorted[i + 3]];
        const aDiff = a.midi - b.midi;
        const cDiff = c.midi - b.midi;
        const span = getEnd(c) - a.ticks;
        const sameNeighborPitch = a.midi === c.midi;
        const sameNeighborSide = aDiff !== 0 && cDiff !== 0 && Math.sign(aDiff) === Math.sign(cDiff);
        const inRange = Math.abs(aDiff) <= params.neighborMaxSemitones && Math.abs(cDiff) <= params.neighborMaxSemitones;
        const ornamentDurations = [a.durationTicks, b.durationTicks, c.durationTicks];
        const maxDur = Math.max(...ornamentDurations);
        const minDur = Math.max(1, Math.min(...ornamentDurations));
        const similarValues = (maxDur / minDur) <= 1.5;
        const shortEnough = ornamentDurations.every(v => v <= params.Tq / 4);
        const longPrincipalReturn = d.midi === b.midi && d.durationTicks >= (2 * maxDur);

        if (sameNeighborPitch && sameNeighborSide && inRange && similarValues && shortEnough && longPrincipalReturn && span <= params.ornamentMaxSpanTicks) {
            hypotheses.push({
                class: 'mordent',
                principalNoteRef: d.id,
                memberNoteIds: [a.id, b.id, c.id],
                timingBounds: mkTimingBounds([a, b, c], d),
                confidence: cap01(0.8 + (params.neighborMaxSemitones - Math.abs(aDiff)) * 0.04),
                ambiguityTags: [],
            });
        }
    }

    // Turn: UN P LN P Long-P (or LN P UN P Long-P) — 4 ornamental notes + 1 long final principal.
    // Turn TAKES FROM the principal: ornamental cell (a,b,c,d) precedes the beat; e arrives on-beat.
    // Span is measured to the START of the final principal (not its end) to avoid false rejection
    // caused by the sustained principal's duration.
    for (let i = 0; i <= sorted.length - 5; i++) {
        const [a, b, c, d, e] = [sorted[i], sorted[i + 1], sorted[i + 2], sorted[i + 3], sorted[i + 4]];
        const aDiff = a.midi - b.midi;
        const cDiff = c.midi - b.midi;
        const span = e.ticks - a.ticks; // to START of final principal, not its end
        const ornamentalDurations = [a.durationTicks, b.durationTicks, c.durationTicks, d.durationTicks];
        const maxOrnDur = Math.max(...ornamentalDurations);
        const shortEnough = ornamentalDurations.every(v => v <= params.Tq / 4);
        const oppositeNeighbors = aDiff !== 0 && cDiff !== 0 && Math.sign(aDiff) !== Math.sign(cDiff);
        const neighborsInRange = Math.abs(aDiff) <= params.neighborMaxSemitones && Math.abs(cDiff) <= params.neighborMaxSemitones;
        const principalReturns = d.midi === b.midi && e.midi === b.midi;
        const longFinalPrincipal = e.durationTicks >= (2 * maxOrnDur);

        if (oppositeNeighbors && neighborsInRange && principalReturns && shortEnough && longFinalPrincipal && span <= params.ornamentMaxSpanTicks) {
            hypotheses.push({
                class: 'turn',
                principalNoteRef: e.id,
                memberNoteIds: [a.id, b.id, c.id, d.id],
                timingBounds: mkTimingBounds([a, b, c, d], e),
                confidence: cap01(0.86),
                ambiguityTags: [],
            });
        }
    }

    // Trill: >=4 notes, strict principal-neighbor alternation, exactly 2 pitch classes.
    // Trill IS the principal — no distinct following principal exists.
    // No span limit: trills can be arbitrarily long; the pattern is recognisable regardless of length.
    // The greedy selector naturally chooses the longest window because confidence grows with length.
    for (let i = 0; i <= sorted.length - 4; i++) {
        for (let j = i + 3; j < sorted.length; j++) {
            const seq = sorted.slice(i, j + 1);
            const pitches = unique(seq.map(n => n.midi));
            if (pitches.length !== 2) break;
            const alternating = seq.every((n, idx) => idx === 0 || n.midi !== seq[idx - 1].midi);
            if (!alternating) break;

            const interval = Math.abs(pitches[0] - pitches[1]);
            if (interval <= params.neighborMaxSemitones) {
                const first = seq[0];
                const second = seq[1];
                const base = {
                    class: 'trill' as const,
                    memberNoteIds: seq.map(n => n.id),
                    timingBounds: mkTimingBounds(seq, first),
                    confidence: cap01(0.7 + (seq.length - 4) * 0.04),
                };

                // Keep competing principal assignment hypotheses (first vs second note).
                hypotheses.push({
                    ...base,
                    principalNoteRef: first.id,
                    ambiguityTags: ['principal_assignment_uncertain', 'competing_hypothesis'],
                });
                hypotheses.push({
                    ...base,
                    principalNoteRef: second.id,
                    timingBounds: mkTimingBounds(seq, second),
                    confidence: cap01(base.confidence - 0.03),
                    ambiguityTags: ['principal_assignment_uncertain', 'competing_hypothesis'],
                });
            }
        }
    }

    // Apply timing priors to each hypothesis.
    // Adds 'timing_prior_conflict' and/or 'trill_is_principal' where beat-position semantics
    // conflict with the expected ornament-class behaviour. See TIMING PRIORS comment above.
    for (const h of hypotheses) {
        const principal = noteById.get(h.principalNoteRef);
        if (principal) {
            applyTimingPriors(h, principal, params);
        }
    }

    const byWindow = new Map<string, OrnamentHypothesis[]>();
    for (const h of hypotheses) {
        const key = `${h.principalNoteRef}:${h.timingBounds.startTick}:${h.timingBounds.endTick}`;
        const existing = byWindow.get(key) || [];
        existing.push(h);
        byWindow.set(key, existing);
    }

    byWindow.forEach(group => {
        const classes = unique(group.map(h => h.class));
        if (classes.length > 1) {
            for (const h of group) {
                h.ambiguityTags = unique([
                    ...h.ambiguityTags,
                    'competing_hypothesis',
                    `competes_with_${classes.filter(c => c !== h.class).join('_')}`,
                ]);
            }
        }
    });

    return hypotheses.sort((a, b) => b.confidence - a.confidence);
}

export function selectOrnamentHypotheses(hypotheses: OrnamentHypothesis[]): OrnamentHypothesis[] {
    const selected: OrnamentHypothesis[] = [];
    const used = new Set<string>();

    for (const h of [...hypotheses].sort((a, b) => b.confidence - a.confidence)) {
        if (h.memberNoteIds.some(id => used.has(id))) continue;
        selected.push(h);
        h.memberNoteIds.forEach(id => used.add(id));
    }

    return selected;
}
