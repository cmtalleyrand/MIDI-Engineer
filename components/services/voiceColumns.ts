// Columnization and density helpers for the voice solver (PROJECT_INTENT §4.3).

export interface VoiceNoteLike {
  midi: number;
  ticks: number;
  durationTicks: number;
}

/** A vertical column: notes sharing the same grid onset, sorted high → low. */
export interface OnsetColumn<T> {
  ticks: number;
  notes: T[];
}

/** Group notes into columns by exact (resolved-grid) onset, each sorted high→low. */
export function columnizeByOnset<T extends VoiceNoteLike>(notes: T[]): OnsetColumn<T>[] {
  const byTick = new Map<number, T[]>();
  for (const n of notes) {
    const arr = byTick.get(n.ticks);
    if (arr) arr.push(n);
    else byTick.set(n.ticks, [n]);
  }
  return Array.from(byTick.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ticks, ns]) => ({
      ticks,
      notes: ns.slice().sort((a, b) => b.midi - a.midi),
    }));
}

/** Largest number of notes sharing any single onset column. */
export function maxColumnDensity<T extends VoiceNoteLike>(columns: OnsetColumn<T>[]): number {
  let max = 0;
  for (const c of columns) if (c.notes.length > max) max = c.notes.length;
  return max;
}
