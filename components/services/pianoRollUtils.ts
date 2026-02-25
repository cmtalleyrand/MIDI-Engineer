import type { PianoRollTrackData } from '../../types';

export function canSelectPianoRollNote(showVoices: boolean, showQuantizerLogic: boolean): boolean {
  return showVoices || showQuantizerLogic;
}

type PianoRollNote = PianoRollTrackData['notes'][number];

export function sortNotesForPianoRollRendering(notes: PianoRollNote[]): PianoRollNote[] {
  return [...notes].sort((a, b) => Number(Boolean(a.isOrnament)) - Number(Boolean(b.isOrnament)));
}
