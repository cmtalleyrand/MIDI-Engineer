import { Midi } from '@tonejs/midi';
import { detectBeatProfile, detectTimpaniPitches } from './beatDetection';
import {
  generateFourOnFloor,
  generateOrchestraTimpani,
  generateBrushesRide,
} from './drumPatterns';
import { DrumGeneratorOptions, DrumNote } from './drumKit';

// Re-export the public surface so existing importers keep a stable path.
export type { DrumPattern, DrumGeneratorOptions, BeatWeightProfile } from './drumKit';
export { detectBeatProfile } from './beatDetection';

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
      drumNotes = generateOrchestraTimpani(
        profile,
        ppq,
        timeSignature,
        maxTick,
        options,
        root,
        dominant
      );
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

  const secondsPerTick = 60 / tempo / ppq;
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
