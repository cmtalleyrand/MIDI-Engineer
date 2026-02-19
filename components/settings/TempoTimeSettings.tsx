
import React from 'react';
import { ExportRangeOptions } from '../../types';
import { useSettings } from '../../context/SettingsContext';

const formatDuration = (seconds: number | null): string => {
    if (seconds === null || isNaN(seconds) || seconds < 0) return '--:--';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export default function TempoTimeSettings() {
    const { settings, setters } = useSettings();
    const { 
        originalTempo, newTempo, originalTimeSignature, newTimeSignature, 
        tempoChangeMode, originalDuration, newDuration, exportRange 
    } = settings;
    const { 
        setNewTempo, setNewTimeSignature, setTempoChangeMode, setExportRange 
    } = setters;

    const handleTimeSigChange = (part: 'numerator' | 'denominator', val: string) => {
        setNewTimeSignature({ ...newTimeSignature, [part]: val });
    };

    const handleRangeChange = (field: keyof ExportRangeOptions, val: any) => {
        setExportRange({ ...exportRange, [field]: val });
    };

    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-light mb-4">Tempo & Time</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                    <label htmlFor="tempo" className="block text-sm font-medium text-gray-400 mb-1">Tempo (BPM)</label>
                    <input type="number" id="tempo" value={newTempo} onChange={(e) => setNewTempo(e.target.value)} min="1" className="block w-full bg-gray-darker border border-gray-medium rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm text-gray-light" />
                    {originalTempo && (<p className="text-xs text-gray-500 mt-1">Original: {Math.round(originalTempo)} BPM</p>)}
                    <p className="text-xs text-gray-500 mt-2">Sets the playback speed or grid reference tempo.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Time Signature</label>
                    <div className="flex items-center gap-2">
                        <input type="number" value={newTimeSignature.numerator} onChange={(e) => handleTimeSigChange('numerator', e.target.value)} min="1" className="w-20 bg-gray-darker border border-gray-medium rounded-md shadow-sm py-2 px-3 text-center focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm text-gray-light" />
                        <span className="text-gray-400 text-lg font-bold">/</span>
                        <input type="number" value={newTimeSignature.denominator} onChange={(e) => handleTimeSigChange('denominator', e.target.value)} min="1" className="w-20 bg-gray-darker border border-gray-medium rounded-md shadow-sm py-2 px-3 text-center focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm text-gray-light" />
                    </div>
                    {originalTimeSignature && (<p className="text-xs text-gray-500 mt-1"> Original: {originalTimeSignature.numerator} / {originalTimeSignature.denominator} </p>)}
                    <p className="text-xs text-gray-500 mt-2">Defines measure boundaries for quantization.</p>
                </div>
            </div>
            {(originalDuration !== null && newDuration !== null) && (
                <div className="mt-4 text-center text-sm text-gray-400 p-3 bg-gray-darker rounded-md border border-gray-medium">
                    <p> Original Duration: <span className="font-mono text-gray-light">{formatDuration(originalDuration)}</span>
                        <span className="mx-2 text-gray-600">|</span> New Duration: <span className="font-mono text-gray-light">{formatDuration(newDuration)}</span>
                    </p>
                </div>
            )}
            <div className="mt-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">Tempo Change Mode</label>
                <div className="flex flex-col sm:flex-row gap-3">
                    <label className={`flex-1 p-3 rounded-lg border cursor-pointer transition-colors ${tempoChangeMode === 'speed' ? 'bg-brand-secondary/30 border-brand-primary ring-2 ring-brand-primary' : 'border-gray-medium hover:border-brand-secondary/50'}`}>
                        <input type="radio" name="tempo-mode" value="speed" checked={tempoChangeMode === 'speed'} onChange={() => setTempoChangeMode('speed')} className="sr-only" />
                        <span className="font-semibold text-gray-light block">Change Playback Speed</span>
                        <span className="text-xs text-gray-400 mt-1 block">The song plays faster or slower (duration changes).</span>
                    </label>
                    <label className={`flex-1 p-3 rounded-lg border cursor-pointer transition-colors ${tempoChangeMode === 'time' ? 'bg-brand-secondary/30 border-brand-primary ring-2 ring-brand-primary' : 'border-gray-medium hover:border-brand-secondary/50'}`}>
                        <input type="radio" name="tempo-mode" value="time" checked={tempoChangeMode === 'time'} onChange={() => setTempoChangeMode('time')} className="sr-only" />
                        <span className="font-semibold text-gray-light block">Preserve Real Time</span>
                        <span className="text-xs text-gray-400 mt-1 block">Adjusts positions so the song lasts the same amount of time (duration constant).</span>
                    </label>
                </div>
            </div>

            {/* Export Selection / Range Cropping */}
            <div className="mt-6 pt-4 border-t border-gray-700">
                <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={exportRange.enabled} 
                            onChange={(e) => handleRangeChange('enabled', e.target.checked)} 
                            className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-brand-primary"
                        />
                        <span className="ml-3 font-bold text-gray-300">Crop / Export Selection</span>
                    </label>
                </div>
                {exportRange.enabled && (
                    <div className="grid grid-cols-2 gap-4 animate-fade-in bg-gray-darker p-3 rounded border border-gray-medium">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Start Measure</label>
                            <input 
                                type="number" min="1" 
                                value={exportRange.startMeasure} 
                                onChange={(e) => handleRangeChange('startMeasure', Number(e.target.value))}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-sm text-gray-light"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">End Measure</label>
                            <input 
                                type="number" min="1" 
                                value={exportRange.endMeasure} 
                                onChange={(e) => handleRangeChange('endMeasure', Number(e.target.value))}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-sm text-gray-light"
                            />
                        </div>
                    </div>
                )}
                <p className="text-xs text-gray-500 mt-2">Only exports and processes data within this measure range.</p>
            </div>
        </div>
    );
}
