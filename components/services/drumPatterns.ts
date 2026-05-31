import { ticksPerMeasure as measureTicks } from './timeUtils';
import {
  GM,
  BeatWeightProfile,
  DrumGeneratorOptions,
  DrumNote,
  applySwing,
  calcVelocity,
  subdivisionWeight,
} from './drumKit';

type TimeSig = { numerator: number; denominator: number };

// --- Pattern: Four on the Floor ---

export function generateFourOnFloor(
  profile: BeatWeightProfile,
  ppq: number,
  ts: TimeSig,
  totalTicks: number,
  opts: DrumGeneratorOptions
): DrumNote[] {
  const notes: DrumNote[] = [];
  const ticksPerBeat = ppq;
  const ticksPerMeasure = measureTicks(ppq, ts);
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

export function generateOrchestraTimpani(
  profile: BeatWeightProfile,
  ppq: number,
  ts: TimeSig,
  totalTicks: number,
  opts: DrumGeneratorOptions,
  timpaniRoot: number,
  timpaniDominant: number
): DrumNote[] {
  const notes: DrumNote[] = [];
  const ticksPerBeat = ppq;
  const ticksPerMeasure = measureTicks(ppq, ts);
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
      const secBeat = beats >= 4 ? 2 : beats === 3 ? 2 : 1;
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
          const subTick =
            mStart + Math.round((sub * ticksPerMeasure) / profile.subdivisionsPerMeasure);
          notes.push({
            midi: beatIdx % 2 === 0 ? timpaniRoot : timpaniDominant,
            ticks: subTick,
            durationTicks: Math.round((ticksPerMeasure / profile.subdivisionsPerMeasure) * 0.5),
            velocity: calcVelocity(55, -0.4, opts.dynamicsRange),
          });
        }
      }
    }
  }
  return notes;
}

// --- Pattern: Brushes / Ride ---

export function generateBrushesRide(
  profile: BeatWeightProfile,
  ppq: number,
  ts: TimeSig,
  totalTicks: number,
  opts: DrumGeneratorOptions
): DrumNote[] {
  const notes: DrumNote[] = [];
  const ticksPerBeat = ppq;
  const ticksPerMeasure = measureTicks(ppq, ts);
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
