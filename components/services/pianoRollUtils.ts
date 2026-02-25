import type { RawNote } from '../../types';

export function canSelectPianoRollNote(showVoices: boolean, showQuantizerLogic: boolean): boolean {
  return showVoices || showQuantizerLogic;
}

export function sortNotesForPianoRollRendering<T extends Pick<RawNote, 'isOrnament'>>(notes: T[]): T[] {
  return [...notes].sort((a, b) => Number(!!a.isOrnament) - Number(!!b.isOrnament));
}
