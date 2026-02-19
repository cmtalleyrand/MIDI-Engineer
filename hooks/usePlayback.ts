
import { useState, useCallback, useEffect } from 'react';
import { Midi } from '@tonejs/midi';
import { ConversionOptions, MidiEventType } from '../types';
import { createPreviewMidi, playTrack, stopPlayback as stopTonePlayback } from '../components/services/midiService';

export const usePlayback = () => {
    const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);
    const [playbackError, setPlaybackError] = useState<string>('');

    useEffect(() => {
        return () => {
            stopTonePlayback();
        };
    }, []);

    const stop = useCallback(() => {
        stopTonePlayback();
        setPlayingTrackId(null);
    }, []);

    const playPreview = useCallback((
        trackId: number, 
        midiData: Midi | null, 
        options: ConversionOptions | null, 
        eventsToDelete: Set<MidiEventType>
    ) => {
        if (!midiData) return;
        
        if (playingTrackId === trackId) {
            stop();
            return;
        }

        stop();
        setPlaybackError('');

        if (!options) {
            setPlaybackError("Cannot preview: Invalid conversion options.");
            return;
        }

        try {
            const previewMidi = createPreviewMidi(midiData, trackId, eventsToDelete, options);
            playTrack(previewMidi, () => setPlayingTrackId(null));
            setPlayingTrackId(trackId);
        } catch (error) {
            console.error("Error creating preview MIDI:", error);
            setPlaybackError("Could not generate track preview.");
        }
    }, [playingTrackId, stop]);

    return {
        playingTrackId,
        playbackError,
        setPlaybackError,
        actions: {
            playPreview,
            stop
        }
    };
};
