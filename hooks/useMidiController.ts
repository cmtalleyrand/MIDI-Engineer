
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Midi } from '@tonejs/midi';
import { AppState, TrackInfo, MidiEventCounts, MidiEventType, PianoRollTrackData, TrackAnalysisData, InversionStats } from '../types';
import { parseMidiFromFile, combineAndDownload, createPreviewMidi, exportTracksToAbc, getTransformedTrackDataForPianoRoll, analyzeTrack, getQuantizationWarning, playTrack, stopPlayback, analyzeTrackSelection, calculateInversionStats } from '../components/services/midiService';
import { useConversionSettings } from './useConversionSettings';

export const useMidiController = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [midiData, setMidiData] = useState<Midi | null>(null);
  const [trackInfo, setTrackInfo] = useState<TrackInfo[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
  const [fileName, setFileName] = useState<string>('input.mid');
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);
  const [eventCounts, setEventCounts] = useState<MidiEventCounts | null>(null);
  const [isExportingAbc, setIsExportingAbc] = useState<boolean>(false);

  // UI Modals State
  const [isPianoRollVisible, setIsPianoRollVisible] = useState<boolean>(false);
  const [pianoRollTrackData, setPianoRollTrackData] = useState<PianoRollTrackData | null>(null);
  const [isAnalysisVisible, setIsAnalysisVisible] = useState<boolean>(false);
  const [analysisData, setAnalysisData] = useState<TrackAnalysisData | null>(null);

  // Use the extracted Settings Hook
  const { settings, setters, handleResetSettings, getConversionOptions } = useConversionSettings(midiData);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  // Stats Logic: Dynamic calculation of inversion scope
  const inversionStats = useMemo<InversionStats | null>(() => {
      if (!midiData || selectedTracks.size === 0 || !settings.melodicInversion.enabled) return null;
      
      const firstId = Array.from(selectedTracks)[0];
      const track = midiData.tracks[firstId];
      if (!track) return null;

      const ppq = midiData.header.ppq;
      const tsNum = parseInt(settings.newTimeSignature.numerator, 10) || 4;
      const tsDenom = parseInt(settings.newTimeSignature.denominator, 10) || 4;
      
      return calculateInversionStats(track.notes, settings.melodicInversion, ppq, { numerator: tsNum, denominator: tsDenom });
  }, [midiData, selectedTracks, settings.melodicInversion, settings.newTimeSignature]);

  const handleReset = useCallback((fullReset = true) => {
    if(fullReset) {
      setAppState(AppState.IDLE);
      setMidiData(null);
      setTrackInfo([]);
      setFileName('');
      setEventCounts(null);
    }
    stopPlayback();
    setPlayingTrackId(null);
    setErrorMessage('');
    setSuccessMessage('');
    setSelectedTracks(new Set());
    handleResetSettings();
  }, [handleResetSettings]);

  const handleFileUpload = useCallback(async (file: File) => {
    setAppState(AppState.LOADING);
    setErrorMessage('');
    setSuccessMessage('');
    setSelectedTracks(new Set());
    setMidiData(null);
    setTrackInfo([]);
    setFileName(file.name);
    stopPlayback();
    setPlayingTrackId(null);
    setEventCounts(null);
    handleReset(false);

    try {
      const { midi, tracks, eventCounts } = await parseMidiFromFile(file);
      setMidiData(midi);
      setTrackInfo(tracks);
      setEventCounts(eventCounts);
      setFileName(file.name);
      setAppState(AppState.LOADED);
    } catch (error) {
      console.error("MIDI Parsing Error:", error);
      setErrorMessage("Failed to parse MIDI file. Please ensure it's a valid .mid file.");
      setAppState(AppState.ERROR);
    }
  }, [handleReset]);

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

  const quantizationWarning = useMemo(() => {
      if (!midiData || (!settings.primaryRhythm.enabled && !settings.pruneOverlaps)) return null;
      const options = getConversionOptions();
      if (!options) return null;
      return getQuantizationWarning(midiData, selectedTracks, options);
  }, [midiData, selectedTracks, settings.primaryRhythm, settings.pruneOverlaps, getConversionOptions]);

  const clearMessages = useCallback(() => {
      setErrorMessage('');
      setSuccessMessage('');
      if(appState === AppState.DOWNLOAD_ERROR || appState === AppState.SUCCESS) {
          setAppState(AppState.LOADED);
      }
  }, [appState]);

  const handleCombine = useCallback(async () => {
    if (!midiData || selectedTracks.size < 1) return;
    stopPlayback();
    setPlayingTrackId(null);
    setAppState(AppState.COMBINING);
    setErrorMessage('');
    setSuccessMessage('');
    const conversionOptions = getConversionOptions();
    if (!conversionOptions) {
         setErrorMessage("Invalid options.");
         setAppState(AppState.DOWNLOAD_ERROR);
         return;
    }
    try {
        const baseName = fileName.replace(/\.mid(i)?$/i, '');
        let suffix = '';
        if (settings.outputStrategy === 'separate_voices') suffix = '_voices';
        else if (settings.outputStrategy === 'separate_tracks') suffix = '_processed';
        else suffix = selectedTracks.size === 1 ? `_track${(Array.from(selectedTracks)[0] as number) + 1}` : '_combined';
        
        const newFileName = `${baseName}${suffix}.mid`;
        await combineAndDownload(midiData, Array.from(selectedTracks) as number[], newFileName, settings.eventsToDelete, conversionOptions);
        setSuccessMessage('MIDI file downloaded successfully!');
        setAppState(AppState.SUCCESS);
    } catch(e) {
        console.error("Error processing MIDI tracks:", e);
        setErrorMessage("An unexpected error occurred while processing the tracks.");
        setAppState(AppState.DOWNLOAD_ERROR);
    }
  }, [midiData, selectedTracks, fileName, getConversionOptions, settings.eventsToDelete, settings.outputStrategy]);

  const handleExportAbc = useCallback(async () => {
    if (!midiData || selectedTracks.size < 1) return;
    stopPlayback();
    setPlayingTrackId(null);
    setIsExportingAbc(true);
    setErrorMessage('');
    setSuccessMessage('');
    const conversionOptions = getConversionOptions();
    if (!conversionOptions) {
        setIsExportingAbc(false);
        setErrorMessage("Invalid options.");
        return;
    }
    try {
        const baseName = fileName.replace(/\.mid(i)?$/i, '');
        const newFileName = `${baseName}_export.abc`;
        await exportTracksToAbc(midiData, Array.from(selectedTracks) as number[], newFileName, settings.eventsToDelete, conversionOptions);
        setSuccessMessage('ABC file downloaded successfully!');
        setAppState(AppState.SUCCESS);
    } catch(e) {
        console.error("Error exporting to ABC:", e);
        setErrorMessage("An unexpected error occurred while exporting to ABC notation.");
        setAppState(AppState.DOWNLOAD_ERROR);
    } finally {
        setIsExportingAbc(false);
    }
  }, [midiData, selectedTracks, fileName, getConversionOptions, settings.eventsToDelete]);

  const handlePreviewTrack = useCallback(async (trackId: number) => {
      if (!midiData) return;
      if (playingTrackId === trackId) {
          stopPlayback();
          setPlayingTrackId(null);
      } else {
          stopPlayback();
          setPlayingTrackId(null);
          clearMessages();
          const conversionOptions = getConversionOptions();
          if (!conversionOptions) {
            setErrorMessage("Cannot preview: Invalid conversion options.");
            return;
          };
          try {
              const previewMidi = createPreviewMidi(midiData, trackId, settings.eventsToDelete, conversionOptions);
              playTrack(previewMidi, () => setPlayingTrackId(null));
              setPlayingTrackId(trackId);
          } catch (error) {
              console.error("Error creating preview MIDI:", error);
              setErrorMessage("Could not generate track preview.");
          }
      }
  }, [midiData, playingTrackId, getConversionOptions, settings.eventsToDelete, clearMessages]);

  const handleShowPianoRoll = useCallback((trackId: number) => {
    if (!midiData) return;
    clearMessages();
    const conversionOptions = getConversionOptions();
    if (!conversionOptions) {
      setErrorMessage("Cannot show piano roll: Invalid conversion options.");
      return;
    }
    try {
      const trackData = getTransformedTrackDataForPianoRoll(midiData, trackId, conversionOptions);
      setPianoRollTrackData(trackData);
      setIsPianoRollVisible(true);
    } catch (error) {
       console.error("Error generating piano roll data:", error);
       setErrorMessage("Could not generate data for the piano roll.");
    }
  }, [midiData, getConversionOptions, clearMessages]);

  const handleAnalyzeTrack = useCallback((trackId: number) => {
     if (!midiData) return;
     const conversionOptions = getConversionOptions();
     try {
         const analysis = analyzeTrack(midiData, trackId, conversionOptions || undefined);
         setAnalysisData(analysis);
         setIsAnalysisVisible(true);
     } catch (error) {
         console.error("Error analyzing track:", error);
         setErrorMessage("Could not analyze track data.");
     }
  }, [midiData, getConversionOptions]);

  const handleAnalyzeSelection = useCallback(() => {
      if (!midiData || selectedTracks.size === 0) return;
      const conversionOptions = getConversionOptions();
      try {
          const trackIds = Array.from(selectedTracks) as number[];
          const analysis = analyzeTrackSelection(midiData, trackIds, conversionOptions || undefined);
          setAnalysisData(analysis);
          setIsAnalysisVisible(true);
      } catch (error) {
          console.error("Error analyzing selection:", error);
          setErrorMessage("Could not analyze selected tracks.");
      }
  }, [midiData, selectedTracks, getConversionOptions]);

  const handleEventFilterToggle = useCallback((eventType: MidiEventType) => {
      setters.setEventsToDelete(prev => {
        const newSet = new Set(prev);
        if (newSet.has(eventType)) newSet.delete(eventType);
        else newSet.add(eventType);
        return newSet;
    });
  }, [setters]);

  // Merge setters for UI
  const allSetters = {
      ...setters,
      setIsPianoRollVisible,
      setIsAnalysisVisible
  };

  return {
    state: {
        appState,
        errorMessage,
        successMessage,
        fileName,
        trackInfo,
        selectedTracks,
        playingTrackId,
        isExportingAbc,
        eventCounts,
        midiData,
        isLoadedState: [AppState.LOADED, AppState.COMBINING, AppState.SUCCESS, AppState.DOWNLOAD_ERROR].includes(appState),
        quantizationWarning,
        isPianoRollVisible,
        pianoRollTrackData,
        isAnalysisVisible,
        analysisData,
        inversionStats
    },
    settings,
    setters: allSetters,
    actions: {
        handleFileUpload,
        handleTrackSelect,
        handleSelectAllTracks,
        handleReset,
        handleCombine,
        handleExportAbc,
        handlePreviewTrack,
        handleShowPianoRoll,
        handleAnalyzeTrack,
        handleAnalyzeSelection,
        handleEventFilterToggle,
        clearMessages
    }
  };
};
