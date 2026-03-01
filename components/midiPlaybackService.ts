import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

let synth: Tone.PolySynth | null = null;
let currentPart: Tone.Part | null = null;

function initializeSynth(): Tone.PolySynth {
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      envelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.3,
        release: 1,
      },
    }).toDestination();
  }
  return synth;
}

export function playTrack(processedMidi: Midi, onEnded: () => void): void {
  // Stop any currently playing track before starting a new one
  stopPlayback();

  if (processedMidi.tracks.length === 0) {
    console.error('Processed MIDI has no tracks to play.');
    onEnded();
    return;
  }
  
  const track = processedMidi.tracks[0];
  if (!track.notes || track.notes.length === 0) {
    console.warn('Track has no notes to play.');
    onEnded();
    return;
  }

  const synth = initializeSynth();

  // Set the transport BPM from the processed MIDI header
  const tempo = processedMidi.header.tempos[0]?.bpm;
  if (tempo) {
    Tone.Transport.bpm.value = tempo;
  }
  
  // Create a Tone.Part from the track's notes
  currentPart = new Tone.Part(
    (time, note) => {
      synth.triggerAttackRelease(note.name, note.duration, time, note.velocity);
    },
    track.notes.map(note => ({
      time: note.time,
      name: note.name,
      duration: note.duration,
      velocity: note.velocity,
    }))
  );

  // When the part finishes, stop the transport and invoke the callback
  currentPart.loop = false;
  Tone.Transport.on('stop', () => {
    currentPart?.dispose();
    currentPart = null;
    onEnded();
  });

  // Start the transport
  currentPart.start(0);
  Tone.Transport.start();

  // Schedule the transport to stop after the last note ends
  const partDuration = track.notes.reduce((maxEnd, note) => Math.max(maxEnd, note.time + note.duration), 0);
  Tone.Transport.scheduleOnce(() => {
    Tone.Transport.stop();
  }, `+${partDuration + 0.5}`); // Add a small buffer
}

export function stopPlayback(): void {
  if (Tone.Transport.state === 'started') {
    Tone.Transport.stop();
    Tone.Transport.cancel();
  }
  if (currentPart) {
    currentPart.dispose();
    currentPart = null;
  }
  synth?.releaseAll();
}