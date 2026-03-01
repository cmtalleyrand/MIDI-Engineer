import { RhythmSkeletonEvent } from '../../../types';
import { detectAndTagOrnaments } from '../midiCore';

interface StructuralRhythmOptions {
  detectOrnaments: boolean;
  minInterOnsetTicks: number;
}

export function detectStructuralRhythm(notes: any[], ppq: number, options: StructuralRhythmOptions): RhythmSkeletonEvent[] {
  if (notes.length === 0) return [];

  const tagged = options.detectOrnaments ? detectAndTagOrnaments(notes.map(n => ({ ...n })), ppq) : notes.map(n => ({ ...n }));
  const material = tagged
    .filter(n => !n.isOrnament)
    .sort((a, b) => (a.ticks - b.ticks) || (a.midi - b.midi));

  if (material.length === 0) return [];

  const onsets: any[][] = [];
  for (const note of material) {
    const bucket = onsets[onsets.length - 1];
    if (!bucket || Math.abs(note.ticks - bucket[0].ticks) > options.minInterOnsetTicks) {
      onsets.push([note]);
    } else {
      bucket.push(note);
    }
  }

  return onsets.map((group, idx) => {
    const lowest = group.reduce((acc, n) => n.midi < acc.midi ? n : acc, group[0]);
    const nextTick = idx < onsets.length - 1 ? onsets[idx + 1][0].ticks : lowest.ticks + lowest.durationTicks;
    const durationTicks = Math.max(1, nextTick - lowest.ticks);
    const strength = lowest.midi <= 52 ? 1 : lowest.midi <= 60 ? 0.8 : 0.6;
    return {
      ticks: lowest.ticks,
      durationTicks,
      strength,
      sourceNoteMidi: lowest.midi
    };
  });
}
