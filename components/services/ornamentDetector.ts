export type OrnamentClass = 'grace_group' | 'mordent' | 'turn' | 'trill';

export interface OrnamentDetectionParams {
    Tq: number;
    ornamentMaxSpanTicks: number;
    graceMaxDurTicks: number;
    attachGapTicks: number;
    neighborMaxSemitones: number;
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

export function getDefaultOrnamentDetectionParams(ppq: number): OrnamentDetectionParams {
    const Tq = ppq;
    return {
        Tq,
        ornamentMaxSpanTicks: Tq,
        graceMaxDurTicks: Math.max(1, Math.round(Tq / 8)),
        attachGapTicks: Math.max(1, Math.round(Tq / 16)),
        neighborMaxSemitones: 2,
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

export function detectOrnamentHypotheses(notes: any[], params: OrnamentDetectionParams): OrnamentHypothesis[] {
    const sorted = asAnnotated(notes);
    if (sorted.length < 2) return [];

    const hypotheses: OrnamentHypothesis[] = [];

    // Grace group (for now: exactly one grace note): N then principal P.
    for (let i = 0; i < sorted.length - 1; i++) {
        const g = sorted[i];
        const p = sorted[i + 1];
        const gap = getGapAfter(g, p);
        const span = getEnd(g) - g.ticks;
        const maxRelativeDur = Math.max(1, Math.floor(p.durationTicks / 3));
        const graceIsShort = g.durationTicks <= Math.min(params.graceMaxDurTicks, maxRelativeDur);
        const neighborish = Math.abs(g.midi - p.midi) <= params.neighborMaxSemitones;

        if (graceIsShort && gap <= params.attachGapTicks && span <= params.ornamentMaxSpanTicks && neighborish) {
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

    // Mordent: N P N (similar short durations) + following long principal P.
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

    // Turn: UN P LN P Long-P (or LN P UN P Long-P).
    for (let i = 0; i <= sorted.length - 5; i++) {
        const [a, b, c, d, e] = [sorted[i], sorted[i + 1], sorted[i + 2], sorted[i + 3], sorted[i + 4]];
        const aDiff = a.midi - b.midi;
        const cDiff = c.midi - b.midi;
        const span = getEnd(e) - a.ticks;
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

    // Trill: >=4 notes, strict principal-neighbor alternation.
    for (let i = 0; i <= sorted.length - 4; i++) {
        for (let j = i + 3; j < sorted.length; j++) {
            const seq = sorted.slice(i, j + 1);
            const pitches = unique(seq.map(n => n.midi));
            if (pitches.length !== 2) break;
            const alternating = seq.every((n, idx) => idx === 0 || n.midi !== seq[idx - 1].midi);
            if (!alternating) break;

            const interval = Math.abs(pitches[0] - pitches[1]);
            const span = getEnd(seq[seq.length - 1]) - seq[0].ticks;
            if (interval <= params.neighborMaxSemitones && span <= (2 * params.Tq)) {
                const first = seq[0];
                const second = seq[1];
                const base = {
                    class: 'trill' as const,
                    memberNoteIds: seq.map(n => n.id),
                    timingBounds: mkTimingBounds(seq, first),
                    confidence: cap01(0.7 + (seq.length - 4) * 0.04),
                };

                // keep competing principal assignment hypotheses
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
