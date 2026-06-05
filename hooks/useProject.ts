
import { useState, useCallback } from 'react';
import { Midi } from '@tonejs/midi';
import { TrackInfo, MidiEventCounts, AppState } from '../types';
import { parseMidiFromFile } from '../components/services/midiService';

export const useProject = () => {
  const [midiData, setMidiData] = useState<Midi | null>(null);
  const [trackInfo, setTrackInfo] = useState<TrackInfo[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
  const [fileName, setFileName] = useState<string>('input.mid');
  const [eventCounts, setEventCounts] = useState<MidiEventCounts | null>(null);
  const [loadState, setLoadState] = useState<AppState>(AppState.IDLE);
  const [loadError, setLoadError] = useState<string>('');

  const handleResetProject = useCallback(() => {
      setMidiData(null);
      setTrackInfo([]);
      setSelectedTracks(new Set());
      setFileName('');
      setEventCounts(null);
      setLoadState(AppState.IDLE);
      setLoadError('');
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    setLoadState(AppState.LOADING);
    setLoadError('');
    setSelectedTracks(new Set());
    setMidiData(null);
    setTrackInfo([]);
    setFileName(file.name);
    setEventCounts(null);

    try {
      const { midi, tracks, eventCounts } = await parseMidiFromFile(file);
      setMidiData(midi);
      setTrackInfo(tracks);
      setEventCounts(eventCounts);
      setFileName(file.name);
      setLoadState(AppState.LOADED);
    } catch (error) {
      console.error("MIDI Parsing Error:", error);
      setLoadError("Failed to parse MIDI file. Please ensure it's a valid .mid file.");
      setLoadState(AppState.ERROR);
    }
  }, []);

  const handleTrackSelect = useCallback((trackId: number) => {
    setSelectedTracks(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(trackId)) {
        newSelected.delete(trackId);
      } else {
        newSelected.add(trackId);
      }
      return newSelected;
    });
  }, []);
  
  const handleSelectAllTracks = useCallback(() => {
    if (trackInfo.length > 0 && selectedTracks.size === trackInfo.length) {
        setSelectedTracks(new Set());
    } else {
        const allTrackIds = trackInfo.map(track => track.id);
        setSelectedTracks(new Set(allTrackIds));
    }
  }, [trackInfo, selectedTracks]);

  return {
    midiData,
    trackInfo,
    selectedTracks,
    fileName,
    eventCounts,
    loadState,
    loadError,
    setLoadState, // Exposed for external setting (e.g. during processing)
    setLoadError,
    actions: {
        handleFileUpload,
        handleTrackSelect,
        handleSelectAllTracks,
        handleResetProject
    }
  };
};
