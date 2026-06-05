
import { Midi } from '@tonejs/midi';
import { predictKey } from './analysis/keyPrediction';

// --- GM Drum Map (Channel 9) ---
const GM = {
    KICK: 36,
    SNARE: 38,
    SIDE_STICK: 37,
    RIDE: 51,
    RIDE_BELL: 53,
    CRASH: 49,
} as const;

// --- Types ---

export type DrumPattern = 'four_on_floor' | 'orchestral_timpani' | 'brushes_ride';

export interface DrumGeneratorOptions {
    pattern: DrumPattern;
    density: number;       // 0–100
    swing: number;         // 0–100
    dynamicsRange: number; // 0–100
}

export interface BeatWeightProfile {
    weights: number[];              // Normalized [0,1] per subdivision
    subdivisionsPerMeasure: number;
    isSwing: boolean;
    strongBeats: number[];          // Subdivision indices with weight > 0.3
}

interface DrumNote {
    midi: number;
    ticks: number;
    durationTicks: number;
    velocity: number;
}

// --- Helpers ---

function applySwing(ticks: number, ppq: number, swingAmount: number): number {
    if (swingAmount === 0) return ticks;
    const eighthTicks = ppq / 2;
    const posInPair = ticks % (eighthTicks * 2);
    if (posInPair >= eighthTicks) {
        const shift = (swingAmount / 100) * (eighthTicks / 3);
        return ticks + Math.round(shift);
    }
    return ticks;
}

function calcVelocity(base: number, accent: number, dynamicsRange: number): number {
    const range = (dynamicsRange / 100) * 60;
    return Math.max(1, Math.min(127, Math.round(base + accent * range)));
}

function subdivisionWeight(profile: BeatWeightProfile, tick: number, ticksPerMeasure: number): number {
    const pos = tick % ticksPerMeasure;
    const idx = Math.round(pos / (ticksPerMeasure / profile.subdivisionsPerMeasure)) % profile.subdivisionsPerMeasure;
    return profile.weights[idx] ?? 0;
}

// --- Rhythm Detection ---

export function detectBeatProfile(
    midi: Midi,
    trackIds: number[],
    timeSignature: { numerator: number; denominator: number },
    ppq: number
): BeatWeightProfile {
    const subdivisions = 16;
    const ticksPerMeasure = ppq * 4 * (timeSignature.numerator / timeSignature.denominator);
    const ticksPerSub = ticksPerMeasure / subdivisions;

    const weights = new Array(subdivisions).fill(0);
    let totalWeight = 0;

    for (const id of trackIds) {
        const track = midi.tracks[id];
        if (!track) continue;
        for (const note of track.notes) {
            const pos = note.ticks % ticksPerMeasure;
            const idx = Math.round(pos / ticksPerSub) % subdivisions;
            const bassWeight = (128 - note.midi) / 128;
            weights[idx] += bassWeight;
            totalWeight += bassWeight;
        }
    }

    // Normalize to [0, 1]
    const max = Math.max(...weights);
    if (max > 0) {
        for (let i = 0; i < subdivisions; i++) weights[i] /= max;
    }

    const strongBeats = weights
        .map((w, i) => ({ w, i }))
        .filter(x => x.w > 0.3)
        .map(x => x.i);

    // Detect swing: compare even offbeats (straight) vs odd offbeats (swung)
    let straightW = 0, swungW = 0;
    for (let i = 0; i < subdivisions; i += 4) {
        if (i + 2 < subdivisions) straightW += weights[i + 2];
        if (i + 3 < subdivisions) swungW += weights[i + 3];
    }
    const isSwing = swungW > straightW * 1.5;

    return { weights, subdivisionsPerMeasure: subdivisions, isSwing, strongBeats };
}

// --- Key Detection (for Timpani) ---

function detectTimpaniPitches(midi: Midi, trackIds: number[]): { root: number; dominant: number } {
    const hist: Record<number, number> = {};
    let total = 0;
    for (let i = 0; i < 12; i++) hist[i] = 0;
    for (const id of trackIds) {
        const track = midi.tracks[id];
        if (!track) continue;
        for (const note of track.notes) {
            hist[note.midi % 12]++;
            total++;
        }
    }

    if (total === 0) return { root: 36, dominant: 43 }; // C2, G2

    const predictions = predictKey(hist, total);
    const rootPC = predictions.length > 0 ? predictions[0].winner.root : 0;
    const root = 36 + rootPC;                    // C2 range
    const dominant = root + 7 <= 60 ? root + 7 : root - 5; // fifth above, clamp to timpani range

    return { root, dominant };
}

// --- Pattern: Four on the Floor ---

function generateFourOnFloor(
    profile: BeatWeightProfile,
    ppq: number,
    ts: { numerator: number; denominator: number },
    totalTicks: number,
    opts: DrumGeneratorOptions
): DrumNote[] {
    const notes: DrumNote[] = [];
    const ticksPerBeat = ppq;
    const ticksPerMeasure = ppq * 4 * (ts.numerator / ts.denominator);
    const beats = ts.numerator;
    const dur = Math.round(ppq / 4);
    const numMeasures = Math.ceil(totalTicks / ticksPerMeasure);

    for (let m = 0; m < numMeasures; m++) {
        const mStart = m * ticksPerMeasure;

        for (let b = 0; b < beats; b++) {
            const bt = mStart + b * ticksPerBeat;

            // Kick on every beat
            notes.push({
                midi: GM.KICK,
                ticks: applySwing(bt, ppq, opts.swing),
                durationTicks: dur,
                velocity: calcVelocity(100, b === 0 ? 0.5 : 0, opts.dynamicsRange),
            });

            // Snare on 2 & 4 (or every other beat)
            if (b % 2 === 1) {
                notes.push({
                    midi: GM.SNARE,
                    ticks: applySwing(bt, ppq, opts.swing),
                    durationTicks: dur,
                    velocity: calcVelocity(100, 0.3, opts.dynamicsRange),
                });
            }

            // Ride on 8th notes
            for (let sub = 0; sub < 2; sub++) {
                const st = bt + sub * (ticksPerBeat / 2);
                notes.push({
                    midi: GM.RIDE,
                    ticks: applySwing(Math.round(st), ppq, opts.swing),
                    durationTicks: dur,
                    velocity: calcVelocity(80, sub === 0 ? 0.2 : -0.3, opts.dynamicsRange),
                });
            }

            // Density > 40: ghost snare before beats (deterministic via profile weight)
            if (opts.density > 40 && b > 0) {
                const ghostTick = bt - ppq / 4;
                if (ghostTick >= mStart) {
                    const w = subdivisionWeight(profile, ghostTick, ticksPerMeasure);
                    const threshold = 1.0 - (opts.density - 40) / 80; // decreases as density rises
                    if (w > threshold) {
                        notes.push({
                            midi: GM.SNARE,
                            ticks: applySwing(Math.round(ghostTick), ppq, opts.swing),
                            durationTicks: dur,
                            velocity: calcVelocity(40, -0.8, opts.dynamicsRange),
                        });
                    }
                }
            }

            // Density > 70: extra kick on offbeats where bass rhythm is active
            if (opts.density > 70) {
                const andTick = bt + ticksPerBeat / 2;
                if (subdivisionWeight(profile, andTick, ticksPerMeasure) > 0.4) {
                    notes.push({
                        midi: GM.KICK,
                        ticks: applySwing(Math.round(andTick), ppq, opts.swing),
                        durationTicks: dur,
                        velocity: calcVelocity(75, -0.2, opts.dynamicsRange),
                    });
                }
            }

            // Density > 85: 16th-note ride subdivisions
            if (opts.density > 85) {
                for (let s16 = 1; s16 < 4; s16 += 2) {
                    const t16 = bt + s16 * (ticksPerBeat / 4);
                    notes.push({
                        midi: GM.RIDE,
                        ticks: applySwing(Math.round(t16), ppq, opts.swing),
                        durationTicks: dur,
                        velocity: calcVelocity(55, -0.5, opts.dynamicsRange),
                    });
                }
            }
        }

        // Density > 60: crash on beat 1 every 4th measure
        if (opts.density > 60 && m > 0 && m % 4 === 0) {
            notes.push({
                midi: GM.CRASH,
                ticks: applySwing(mStart, ppq, opts.swing),
                durationTicks: Math.round(ppq * 2),
                velocity: calcVelocity(100, 0.6, opts.dynamicsRange),
            });
        }
    }
    return notes;
}

// --- Pattern: Orchestral Timpani ---

function generateOrchestraTimpani(
    profile: BeatWeightProfile,
    ppq: number,
    ts: { numerator: number; denominator: number },
    totalTicks: number,
    opts: DrumGeneratorOptions,
    timpaniRoot: number,
    timpaniDominant: number
): DrumNote[] {
    const notes: DrumNote[] = [];
    const ticksPerBeat = ppq;
    const ticksPerMeasure = ppq * 4 * (ts.numerator / ts.denominator);
    const beats = ts.numerator;
    const numMeasures = Math.ceil(totalTicks / ticksPerMeasure);

    for (let m = 0; m < numMeasures; m++) {
        const mStart = m * ticksPerMeasure;

        // Beat 1: root, always present
        notes.push({
            midi: timpaniRoot,
            ticks: mStart,
            durationTicks: Math.round(ticksPerBeat * 0.8),
            velocity: calcVelocity(100, 0.8, opts.dynamicsRange),
        });

        // Density > 20: dominant on secondary strong beat
        if (opts.density > 20) {
            const secBeat = beats >= 4 ? 2 : (beats === 3 ? 2 : 1);
            const secTick = mStart + secBeat * ticksPerBeat;
            notes.push({
                midi: timpaniDominant,
                ticks: secTick,
                durationTicks: Math.round(ticksPerBeat * 0.6),
                velocity: calcVelocity(85, 0.3, opts.dynamicsRange),
            });
        }

        // Density > 50: lighter touches on remaining beats
        if (opts.density > 50 && beats >= 4) {
            for (const b of [1, 3]) {
                if (b < beats) {
                    notes.push({
                        midi: b === 1 ? timpaniRoot : timpaniDominant,
                        ticks: mStart + b * ticksPerBeat,
                        durationTicks: Math.round(ticksPerBeat * 0.4),
                        velocity: calcVelocity(60, -0.3, opts.dynamicsRange),
                    });
                }
            }
        }

        // Density > 40: crescendo roll on last beat every 4th measure
        if (opts.density > 40 && m > 0 && (m + 1) % 4 === 0) {
            const rollStart = mStart + (beats - 1) * ticksPerBeat;
            const rollSubs = 8;
            const rollSubTick = ticksPerBeat / rollSubs;
            for (let r = 0; r < rollSubs; r++) {
                const progress = r / (rollSubs - 1);
                notes.push({
                    midi: timpaniRoot,
                    ticks: rollStart + Math.round(r * rollSubTick),
                    durationTicks: Math.round(rollSubTick * 0.8),
                    velocity: calcVelocity(60 + progress * 40, progress * 0.5, opts.dynamicsRange),
                });
            }
        }

        // Density > 75: follow bass rhythm on subdivisions
        if (opts.density > 75) {
            const subsPerBeat = profile.subdivisionsPerMeasure / beats;
            for (let sub = 0; sub < profile.subdivisionsPerMeasure; sub++) {
                // Skip on-beat positions (already covered)
                if (sub % subsPerBeat === 0) continue;
                if (profile.weights[sub] > 0.5) {
                    const beatIdx = Math.floor(sub / subsPerBeat);
                    const subTick = mStart + Math.round(sub * ticksPerMeasure / profile.subdivisionsPerMeasure);
                    notes.push({
                        midi: beatIdx % 2 === 0 ? timpaniRoot : timpaniDominant,
                        ticks: subTick,
                        durationTicks: Math.round(ticksPerMeasure / profile.subdivisionsPerMeasure * 0.5),
                        velocity: calcVelocity(55, -0.4, opts.dynamicsRange),
                    });
                }
            }
        }
    }
    return notes;
}

// --- Pattern: Brushes / Ride ---

function generateBrushesRide(
    profile: BeatWeightProfile,
    ppq: number,
    ts: { numerator: number; denominator: number },
    totalTicks: number,
    opts: DrumGeneratorOptions
): DrumNote[] {
    const notes: DrumNote[] = [];
    const ticksPerBeat = ppq;
    const ticksPerMeasure = ppq * 4 * (ts.numerator / ts.denominator);
    const beats = ts.numerator;
    const dur = Math.round(ppq / 4);
    const numMeasures = Math.ceil(totalTicks / ticksPerMeasure);

    for (let m = 0; m < numMeasures; m++) {
        const mStart = m * ticksPerMeasure;

        for (let b = 0; b < beats; b++) {
            const bt = mStart + b * ticksPerBeat;

            // Ride on quarter notes
            const useRideBell = opts.density > 70 && b === 0;
            notes.push({
                midi: useRideBell ? GM.RIDE_BELL : GM.RIDE,
                ticks: applySwing(bt, ppq, opts.swing),
                durationTicks: dur,
                velocity: calcVelocity(75, b === 0 ? 0.3 : -0.1, opts.dynamicsRange),
            });

            // Cross-stick on 2 & 4
            if (b % 2 === 1) {
                notes.push({
                    midi: GM.SIDE_STICK,
                    ticks: applySwing(bt, ppq, opts.swing),
                    durationTicks: dur,
                    velocity: calcVelocity(70, 0.1, opts.dynamicsRange),
                });
            }

            // Kick on 1 & 3
            if (b % 2 === 0) {
                notes.push({
                    midi: GM.KICK,
                    ticks: applySwing(bt, ppq, opts.swing),
                    durationTicks: dur,
                    velocity: calcVelocity(80, b === 0 ? 0.3 : 0, opts.dynamicsRange),
                });
            }

            // Density > 30: ride offbeat 8ths
            if (opts.density > 30) {
                const andTick = bt + ticksPerBeat / 2;
                notes.push({
                    midi: GM.RIDE,
                    ticks: applySwing(Math.round(andTick), ppq, opts.swing),
                    durationTicks: dur,
                    velocity: calcVelocity(55, -0.4, opts.dynamicsRange),
                });
            }

            // Density > 50: ghost snare (deterministic via profile)
            if (opts.density > 50 && b > 0) {
                const ghostTick = bt - ppq / 4;
                if (ghostTick >= mStart) {
                    const w = subdivisionWeight(profile, ghostTick, ticksPerMeasure);
                    const threshold = 1.0 - (opts.density - 50) / 80;
                    if (w > threshold) {
                        notes.push({
                            midi: GM.SNARE,
                            ticks: applySwing(Math.round(ghostTick), ppq, opts.swing),
                            durationTicks: dur,
                            velocity: calcVelocity(35, -0.8, opts.dynamicsRange),
                        });
                    }
                }
            }

            // Density > 70: extra kick following bass rhythm
            if (opts.density > 70) {
                const andTick = bt + ticksPerBeat / 2;
                if (subdivisionWeight(profile, andTick, ticksPerMeasure) > 0.5) {
                    notes.push({
                        midi: GM.KICK,
                        ticks: applySwing(Math.round(andTick), ppq, opts.swing),
                        durationTicks: dur,
                        velocity: calcVelocity(60, -0.3, opts.dynamicsRange),
                    });
                }
            }
        }
    }
    return notes;
}

// --- Public API ---

export function generateDrumTrack(
    originalMidi: Midi,
    trackIds: number[],
    options: DrumGeneratorOptions,
    timeSignature: { numerator: number; denominator: number },
    tempo: number
): Midi {
    const ppq = originalMidi.header.ppq;

    // Total duration in ticks
    let maxTick = 0;
    for (const id of trackIds) {
        const track = originalMidi.tracks[id];
        if (!track) continue;
        for (const note of track.notes) {
            maxTick = Math.max(maxTick, note.ticks + note.durationTicks);
        }
    }
    if (maxTick === 0) maxTick = ppq * 4; // fallback: one measure

    const profile = detectBeatProfile(originalMidi, trackIds, timeSignature, ppq);

    let drumNotes: DrumNote[];

    switch (options.pattern) {
        case 'four_on_floor':
            drumNotes = generateFourOnFloor(profile, ppq, timeSignature, maxTick, options);
            break;
        case 'orchestral_timpani': {
            const { root, dominant } = detectTimpaniPitches(originalMidi, trackIds);
            drumNotes = generateOrchestraTimpani(profile, ppq, timeSignature, maxTick, options, root, dominant);
            break;
        }
        case 'brushes_ride':
            drumNotes = generateBrushesRide(profile, ppq, timeSignature, maxTick, options);
            break;
        default:
            drumNotes = generateFourOnFloor(profile, ppq, timeSignature, maxTick, options);
    }

    // Build output MIDI
    const out = new Midi();
    out.header.tempos = [...originalMidi.header.tempos];
    out.header.timeSignatures = [...originalMidi.header.timeSignatures];
    if (originalMidi.header.name) out.header.name = originalMidi.header.name;

    const track = out.addTrack();

    if (options.pattern === 'orchestral_timpani') {
        track.name = 'Timpani';
        track.channel = 0;
        track.instrument.number = 47;
        track.instrument.name = 'Timpani';
    } else {
        track.name = 'Drums';
        track.channel = 9;
        track.instrument.number = 0;
        track.instrument.name = 'Standard Kit';
    }

    const secondsPerTick = (60 / tempo) / ppq;
    for (const n of drumNotes) {
        track.addNote({
            midi: n.midi,
            ticks: n.ticks,
            durationTicks: n.durationTicks,
            velocity: n.velocity,
            time: n.ticks * secondsPerTick,
            duration: n.durationTicks * secondsPerTick,
        });
    }

    return out;
}

export function downloadMidi(midi: Midi, fileName: string): void {
    const bytes = midi.toArray();
    const blob = new Blob([bytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
