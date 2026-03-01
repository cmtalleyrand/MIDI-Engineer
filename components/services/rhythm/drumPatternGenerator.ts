import { DrumGenerationOptions, RhythmSkeletonEvent } from '../../../types';

interface DrumNote {
  midi: number;
  ticks: number;
  durationTicks: number;
  velocity: number;
}

const DRUMS = {
  kick: 36,
  snare: 38,
  clap: 39,
  hatClosed: 42,
  lowTom: 41,
  midTom: 45,
  highTom: 48,
  crash: 49
};

function velocity(base: number, intensity: number, strength = 1) {
  return Math.max(0.2, Math.min(1, base * (0.6 + intensity * 0.8) * (0.7 + strength * 0.3)));
}

export function generateDrumNotesFromRhythm(
  skeleton: RhythmSkeletonEvent[],
  options: DrumGenerationOptions,
  ppq: number
): DrumNote[] {
  const notes: DrumNote[] = [];
  if (!options.enabled || skeleton.length === 0) return notes;

  const add = (midi: number, ticks: number, dur: number, v: number) => {
    notes.push({ midi, ticks: Math.max(0, Math.round(ticks)), durationTicks: Math.max(1, Math.round(dur)), velocity: velocity(v, options.intensity) });
  };

  skeleton.forEach((e, i) => {
    const pulseDur = Math.max(Math.round(ppq / 8), Math.min(e.durationTicks, Math.round(ppq / 2)));

    switch (options.style) {
      case 'four_on_floor':
        add(DRUMS.kick, e.ticks, pulseDur, 0.95 * e.strength);
        if ((i % 2) === 1) add(DRUMS.clap, e.ticks, Math.round(ppq / 10), 0.75);
        if (options.density > 0.6) add(DRUMS.kick, e.ticks + Math.round(e.durationTicks / 2), Math.round(ppq / 10), 0.6);
        break;
      case 'martial':
        add(DRUMS.snare, e.ticks, pulseDur, 0.92 * e.strength);
        if (i % 4 === 0) add(DRUMS.kick, e.ticks, pulseDur, 0.8);
        if (options.density > 0.5) add(DRUMS.snare, e.ticks + Math.round(e.durationTicks * 0.5), Math.round(ppq / 12), 0.65);
        break;
      case 'timpani_melodic': {
        const toms = [DRUMS.lowTom, DRUMS.midTom, DRUMS.highTom];
        const idx = Math.max(0, Math.min(2, Math.floor(((e.sourceNoteMidi % 12) / 12) * 3)));
        add(toms[idx], e.ticks, Math.max(pulseDur, Math.round(ppq / 4)), 0.86 * e.strength);
        if (options.density > 0.65) add(toms[Math.max(0, idx - 1)], e.ticks + Math.round(e.durationTicks * 0.66), Math.round(ppq / 8), 0.5);
        break;
      }
      case 'cinematic_toms':
        add(DRUMS.lowTom, e.ticks, Math.max(pulseDur, Math.round(ppq / 3)), 0.92 * e.strength);
        if (i % 3 === 2) add(DRUMS.midTom, e.ticks, Math.round(ppq / 6), 0.68);
        if (options.density > 0.7 && i % 8 === 7) add(DRUMS.crash, e.ticks, Math.round(ppq / 2), 0.82);
        break;
      case 'electro_pulse':
        add(DRUMS.kick, e.ticks, pulseDur, 0.9 * e.strength);
        add(DRUMS.hatClosed, e.ticks + Math.round(e.durationTicks / 2), Math.round(ppq / 12), 0.62);
        if (options.density > 0.45) add(DRUMS.hatClosed, e.ticks + Math.round(e.durationTicks * 0.75), Math.round(ppq / 12), 0.5);
        if (i % 4 === 1) add(DRUMS.clap, e.ticks, Math.round(ppq / 10), 0.7);
        break;
    }
  });

  return notes.sort((a, b) => a.ticks - b.ticks || a.midi - b.midi);
}
