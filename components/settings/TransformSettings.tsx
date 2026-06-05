
import React from 'react';
import { InversionMode, MelodicInversionOptions, InversionStats } from '../../types';
import { MUSICAL_TIME_OPTIONS } from '../../constants';
import { useSettings } from '../../context/SettingsContext';

const timeScaleOptions = [
    { value: "1/3", label: "1/3 (Fastest)" }, { value: "2/5", label: "2/5" }, { value: "1/2", label: "1/2" },
    { value: "3/5", label: "3/5" }, { value: "2/3", label: "2/3" }, { value: "3/4", label: "3/4" },
    { value: "4/5", label: "4/5" }, { value: "1", label: "1/1 (No Change)" }, { value: "5/4", label: "5/4" },
    { value: "4/3", label: "4/3" }, { value: "3/2", label: "3/2" }, { value: "5/3", label: "5/3" },
    { value: "2", label: "2/1" }, { value: "5/2", label: "5/2" }, { value: "3", label: "3/1 (Slowest)" },
];

const inversionOptions = [
    { value: 'off', label: 'Off' },
    { value: 'global', label: 'Global (Entire Track)' },
    { value: '1beat', label: 'Every Beat' },
    { value: '2beats', label: 'Every 2 Beats' },
    { value: 'measure', label: 'Every Measure' },
    { value: '2measures', label: 'Every 2 Measures' },
    { value: '4measures', label: 'Every 4 Measures' },
    { value: '8measures', label: 'Every 8 Measures' },
];

interface TransformSettingsProps {
    inversionStats?: InversionStats | null;
}

export default function TransformSettings({ inversionStats }: TransformSettingsProps) {
    const { settings, setters } = useSettings();
    const {
        transpositionSemitones, transpositionOctaves, noteTimeScale, inversionMode,
        melodicInversion, detectOrnaments, removeShortNotesThresholdIndex
    } = settings;
    const {
        setTranspositionSemitones, setTranspositionOctaves, setNoteTimeScale, setInversionMode,
        setMelodicInversion, setDetectOrnaments, setRemoveShortNotesThresholdIndex
    } = setters;

    const handleMelodicChange = (field: keyof MelodicInversionOptions, val: any) => {
        setMelodicInversion({ ...melodicInversion, [field]: val });
    };

    return (
        <div className="border-t border-gray-medium pt-4">
            <h3 className="text-lg font-semibold text-gray-light mb-4">Musical Transformations</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Transposition</label>
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                            <input type="number" value={transpositionSemitones} onChange={(e) => setTranspositionSemitones(e.target.value)} min="-11" max="11" className="w-full bg-gray-darker border border-gray-medium rounded-md py-2 px-3 text-center sm:text-sm text-gray-light" />
                            <p className="text-xs text-gray-500 text-center mt-1">Semitones</p>
                        </div>
                        <div className="flex-1">
                            <input type="number" value={transpositionOctaves} onChange={(e) => setTranspositionOctaves(e.target.value)} min="-5" max="5" className="w-full bg-gray-darker border border-gray-medium rounded-md py-2 px-3 text-center sm:text-sm text-gray-light" />
                            <p className="text-xs text-gray-500 text-center mt-1">Octaves</p>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Shift all notes up or down in pitch.</p>
                </div>

                <div>
                    <label htmlFor="note-time-scale" className="block text-sm font-medium text-gray-400 mb-1">Augmentation / Diminution</label>
                    <select id="note-time-scale" value={noteTimeScale} onChange={(e) => setNoteTimeScale(e.target.value)} className="block w-full bg-gray-darker border border-gray-medium rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm text-gray-light">
                        {timeScaleOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Scales note durations. &lt;1 is faster (Diminution), &gt;1 is slower (Augmentation).</p>
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-400 mb-1">Remove Notes Shorter Than</label>
                    <div className="flex items-center gap-4 bg-gray-darker p-3 rounded-lg border border-gray-medium hover:border-brand-secondary/50 transition-colors">
                        <input
                            type="range"
                            min="0" max={MUSICAL_TIME_OPTIONS.length - 1} step="1"
                            value={removeShortNotesThresholdIndex}
                            onChange={(e) => setRemoveShortNotesThresholdIndex(Number(e.target.value))}
                            className="flex-grow h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                        />
                        <span className="text-xs font-mono text-brand-primary w-12 text-right">{MUSICAL_TIME_OPTIONS[removeShortNotesThresholdIndex].label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Filters out ghost notes or glitches below this duration.</p>
                </div>

                {/* Retrograde Section */}
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <label htmlFor="inversion-mode" className="block text-sm font-bold text-gray-300 mb-1">Retrograde (Time Reversal)</label>
                    <select id="inversion-mode" value={inversionMode} onChange={(e) => setInversionMode(e.target.value as InversionMode)} className="block w-full bg-gray-900 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm text-gray-light">
                        {inversionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <p className="text-xs text-gray-500 mt-2">Plays the track backwards in time segments.</p>
                </div>

                {/* Melodic Inversion Section */}
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={melodicInversion.enabled} 
                                onChange={(e) => handleMelodicChange('enabled', e.target.checked)} 
                                className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-brand-primary"
                            />
                            <span className="ml-3 font-bold text-gray-300">Melodic Inversion</span>
                        </label>
                    </div>
                    
                    {melodicInversion.enabled && (
                        <div className="space-y-4 animate-fade-in flex-grow">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Start Measure</label>
                                    <input 
                                        type="number" min="1" 
                                        value={melodicInversion.startMeasure} 
                                        onChange={(e) => handleMelodicChange('startMeasure', Number(e.target.value))}
                                        className="w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-sm text-gray-light"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">End Measure</label>
                                    <input 
                                        type="number" min="1" 
                                        value={melodicInversion.endMeasure} 
                                        onChange={(e) => handleMelodicChange('endMeasure', Number(e.target.value))}
                                        className="w-full bg-gray-900 border border-gray-600 rounded-md py-1 px-2 text-sm text-gray-light"
                                    />
                                </div>
                            </div>

                            {/* Live Feedback Panel */}
                            {inversionStats ? (
                                <div className="bg-gray-900/50 p-3 rounded border border-gray-700 text-xs">
                                    <h4 className="font-bold text-gray-400 mb-2 uppercase tracking-wider text-[10px]">Transformation Preview</h4>
                                    <div className="space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Anchor Note:</span>
                                            <span className="text-brand-primary font-mono font-bold">{inversionStats.anchorNoteName}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Affected Notes:</span>
                                            <span className="text-gray-200 font-mono">{inversionStats.totalNotes}</span>
                                        </div>
                                        {inversionStats.hasPolyphony && (
                                            <div className="mt-2 text-yellow-500 bg-yellow-900/20 p-1.5 rounded border border-yellow-800/50">
                                                <strong>Warning:</strong> Selected range contains chords (polyphony). Inversion may produce voice crossings.
                                            </div>
                                        )}
                                        {inversionStats.totalNotes === 0 && (
                                            <div className="mt-2 text-red-400 italic">
                                                No notes found in measures {melodicInversion.startMeasure}-{melodicInversion.endMeasure}.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center text-gray-600 italic text-xs py-2">
                                    Select a track to see preview stats.
                                </div>
                            )}
                        </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2">Inverts intervals relative to the <strong>first note</strong> in the selection.</p>
                </div>

                <div className="md:col-span-2">
                    <label className="flex items-center p-3 bg-gray-darker rounded-lg border border-gray-medium hover:border-brand-secondary/50 transition-colors cursor-pointer w-full">
                        <input
                            type="checkbox"
                            checked={detectOrnaments}
                            onChange={(e) => setDetectOrnaments(e.target.checked)}
                            className="h-5 w-5 rounded bg-gray-dark border-gray-medium text-brand-primary focus:ring-brand-primary focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-darker"
                        />
                        <div className="ml-3">
                            <span className="font-semibold text-gray-light">Identify Ornaments</span>
                            <p className="text-xs text-gray-400">Detects Trills, Turns, and Grace Notes and keeps them attached to their principal note during processing.</p>
                        </div>
                    </label>
                </div>
            </div>
        </div>
    );
}
