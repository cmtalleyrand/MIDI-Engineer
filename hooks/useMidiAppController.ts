
import { useEffect, useMemo } from 'react';
import { useProject } from './useProject';
import { usePlayback } from './usePlayback';
import { useAppUI } from './useAppUI';
import { useSettings } from '../context/SettingsContext';
import { AppState } from '../types';
import { 
    combineAndDownload, 
    exportTracksToAbc, 
    getTransformedTrackDataForPianoRoll, 
    analyzeTrack, 
    analyzeTrackSelection, 
    calculateInversionStats, 
    getQuantizationWarning 
} from '../components/services/midiService';

export const useMidiAppController = () => {
    const project = useProject();
    const playback = usePlayback();
    const ui = useAppUI();
    const { settings, setters, getConversionOptions, initializeDefaults, handleResetSettings } = useSettings();

    // 1. Sync Project Data with Settings Context
    useEffect(() => {
        if (project.midiData) {
            initializeDefaults(project.midiData);
        }
    }, [project.midiData, initializeDefaults]);

    // 2. Computed Stats
    const inversionStats = useMemo(() => {
        if (!project.midiData || project.selectedTracks.size === 0 || !settings.melodicInversion.enabled) return null;
        const firstId = Array.from(project.selectedTracks)[0];
        const track = project.midiData.tracks[firstId];
        if (!track) return null;
        const ppq = project.midiData.header.ppq;
        const tsNum = parseInt(settings.newTimeSignature.numerator, 10) || 4;
        const tsDenom = parseInt(settings.newTimeSignature.denominator, 10) || 4;
        return calculateInversionStats(track.notes, settings.melodicInversion, ppq, { numerator: tsNum, denominator: tsDenom });
    }, [project.midiData, project.selectedTracks, settings.melodicInversion, settings.newTimeSignature]);

    const quantizationWarning = useMemo(() => {
        if (!project.midiData || (!settings.primaryRhythm.enabled && !settings.pruneOverlaps)) return null;
        const options = getConversionOptions();
        if (!options) return null;
        return getQuantizationWarning(project.midiData, project.selectedTracks, options);
    }, [project.midiData, project.selectedTracks, settings.primaryRhythm, settings.pruneOverlaps, getConversionOptions]);

    // 3. Orchestration Handlers
    const handleReset = () => {
        project.actions.handleResetProject();
        playback.actions.stop();
        ui.clearMessages();
        handleResetSettings();
        ui.setUiState(AppState.IDLE);
    };

    const handleCombine = async () => {
        if (!project.midiData || project.selectedTracks.size < 1) return;
        playback.actions.stop();
        ui.setUiState(AppState.COMBINING);
        ui.clearMessages();
        const options = getConversionOptions();
        if (!options) {
             ui.setErrorMessage("Invalid options.");
             ui.setUiState(AppState.DOWNLOAD_ERROR);
             return;
        }
        try {
            const baseName = project.fileName.replace(/\.mid(i)?$/i, '');
            let suffix = '';
            if (settings.outputStrategy === 'separate_voices') suffix = '_voices';
            else if (settings.outputStrategy === 'separate_tracks') suffix = '_processed';
            else suffix = project.selectedTracks.size === 1 ? `_track${(Array.from(project.selectedTracks)[0] as number) + 1}` : '_combined';
            
            await combineAndDownload(project.midiData, Array.from(project.selectedTracks), `${baseName}${suffix}.mid`, settings.eventsToDelete, options);
            ui.setSuccessMessage('MIDI file downloaded successfully!');
            ui.setUiState(AppState.SUCCESS);
        } catch(e) {
            console.error(e);
            ui.setErrorMessage("An unexpected error occurred while processing.");
            ui.setUiState(AppState.DOWNLOAD_ERROR);
        }
    };

    const handleExportAbc = async () => {
        if (!project.midiData || project.selectedTracks.size < 1) return;
        playback.actions.stop();
        ui.setIsExportingAbc(true);
        ui.clearMessages();
        const options = getConversionOptions();
        if (!options) {
            ui.setIsExportingAbc(false);
            ui.setErrorMessage("Invalid options.");
            return;
        }
        try {
            const baseName = project.fileName.replace(/\.mid(i)?$/i, '');
            await exportTracksToAbc(
                project.midiData,
                Array.from(project.selectedTracks),
                `${baseName}_export.abc`,
                settings.eventsToDelete,
                { ...options, drumGeneration: { ...options.drumGeneration, enabled: false } }
            );
            ui.setSuccessMessage('ABC file downloaded successfully!');
            ui.setUiState(AppState.SUCCESS);
        } catch(e) {
            console.error(e);
            ui.setErrorMessage("An unexpected error occurred exporting ABC.");
            ui.setUiState(AppState.DOWNLOAD_ERROR);
        } finally {
            ui.setIsExportingAbc(false);
        }
    };

    const handlePreview = (trackId: number) => {
        const options = getConversionOptions();
        if (!options) return;
        playback.actions.playPreview(trackId, project.midiData, options, settings.eventsToDelete);
    };

    const handleShowPianoRoll = (trackId: number) => {
        if (!project.midiData) return;
        const options = getConversionOptions();
        if (!options) return;
        try {
            const data = getTransformedTrackDataForPianoRoll(project.midiData, trackId, options);
            ui.setPianoRollTrackData(data);
            ui.setIsPianoRollVisible(true);
        } catch (e) { ui.setErrorMessage("Could not generate piano roll."); }
    };

    const handleAnalyzeTrack = (trackId: number) => {
       if (!project.midiData) return;
       try {
           const analysis = analyzeTrack(project.midiData, trackId, getConversionOptions() || undefined);
           ui.setAnalysisData(analysis);
           ui.setIsAnalysisVisible(true);
       } catch (e) { ui.setErrorMessage("Could not analyze track."); }
    };

    const handleAnalyzeSelection = () => {
        if (!project.midiData || project.selectedTracks.size === 0) return;
        try {
            const analysis = analyzeTrackSelection(project.midiData, Array.from(project.selectedTracks), getConversionOptions() || undefined);
            ui.setAnalysisData(analysis);
            ui.setIsAnalysisVisible(true);
        } catch (e) { ui.setErrorMessage("Could not analyze selection."); }
    };

    return {
        project,
        playback,
        ui,
        computed: {
            inversionStats,
            quantizationWarning,
            isLoadedState: [AppState.LOADED, AppState.COMBINING, AppState.SUCCESS, AppState.DOWNLOAD_ERROR].includes(project.loadState) || project.midiData !== null
        },
        handlers: {
            handleReset,
            handleCombine,
            handleExportAbc,
            handlePreview,
            handleShowPianoRoll,
            handleAnalyzeTrack,
            handleAnalyzeSelection
        }
    };
};
