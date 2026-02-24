
import React from 'react';
import { MUSICAL_TIME_OPTIONS } from '../../constants';
import { useSettings } from '../../context/SettingsContext';

export default function VoiceSettings() {
    const { settings, setters } = useSettings();
    const {
        softOverlapToleranceIndex, pitchBias, maxVoices, disableChords, orphanThreshold, outputStrategy
    } = settings;
    const {
        setSoftOverlapToleranceIndex, setPitchBias, setMaxVoices, setDisableChords, setOrphanThreshold, setOutputStrategy
    } = setters;

    return (
        <div className="border-t border-gray-medium pt-4">
            <h3 className="text-lg font-semibold text-gray-light mb-4">Voice Separation & Polyphony</h3>
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Soft Overlap Tolerance</label>
                    <div className="flex items-center gap-4 bg-gray-900 p-3 rounded-lg border border-gray-700">
                        <input
                            type="range"
                            min="0" max={MUSICAL_TIME_OPTIONS.length - 1} step="1"
                            value={softOverlapToleranceIndex}
                            onChange={(e) => setSoftOverlapToleranceIndex(Number(e.target.value))}
                            className="flex-grow h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                        />
                        <span className="text-xs font-mono text-brand-primary w-16 text-right">{MUSICAL_TIME_OPTIONS[softOverlapToleranceIndex].label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Defines how much two notes can overlap before being considered sequential neighbors; chord detection can still be conservative by design.</p>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Vertical Pitch Bias</label>
                    <div className="flex items-center gap-4 bg-gray-900 p-3 rounded-lg border border-gray-700">
                        <span className="text-xs font-bold text-gray-500">Smooth (Melody)</span>
                        <input
                            type="range"
                            min="0" max="100" step="5"
                            value={pitchBias}
                            onChange={(e) => setPitchBias(Number(e.target.value))}
                            className="flex-grow h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                        />
                        <span className="text-xs font-bold text-brand-primary w-10 text-right">{pitchBias}%</span>
                        <span className="text-xs font-bold text-gray-500">Strict (Chord)</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Controls the voice tracking logic. <br/><strong>Smooth:</strong> Prefers connecting notes closest in pitch (horizontal). <br/><strong>Strict:</strong> Prefers grouping notes starting at the exact same time (vertical).</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mb-2">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Max Voices</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number" min="0" max="16" value={maxVoices}
                                onChange={(e) => setMaxVoices(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-24 bg-gray-900 border border-gray-700 rounded-md py-2 px-3 text-center focus:ring-brand-primary focus:border-brand-primary text-gray-light"
                            />
                            <span className="text-xs font-mono text-gray-400">{maxVoices === 0 ? "(Auto)" : `Force ${maxVoices}`}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Limits the number of output voices.</p>
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Orphan Threshold</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number" min="0" max="500" step="5" value={orphanThreshold}
                                onChange={(e) => setOrphanThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-24 bg-gray-900 border border-gray-700 rounded-md py-2 px-3 text-center focus:ring-brand-primary focus:border-brand-primary text-gray-light"
                            />
                            <span className="text-xs font-mono text-gray-400">Higher = fewer orphans</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Maximum continuity/crossing cost before a note is forced to orphan lane.</p>
                    </div>
                    <div className="flex-1 flex items-end">
                        <label className="flex items-center p-2 bg-gray-900 rounded-lg border border-gray-700 cursor-pointer w-full">
                            <input type="checkbox" checked={disableChords} onChange={(e) => setDisableChords(e.target.checked)} className="h-5 w-5 rounded bg-gray-dark border-gray-medium text-brand-primary focus:ring-brand-primary focus:ring-2" />
                            <div className="ml-3">
                                <span className="font-semibold text-gray-light">Disable Chords</span>
                                <p className="text-xs text-gray-500">Force every note into a single-note voice.</p>
                            </div>
                        </label>
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-700">
                    <label className="block text-sm font-bold text-gray-300 mb-3">Output Strategy</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className={`flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${outputStrategy === 'combine' ? 'bg-brand-primary/20 border-brand-primary ring-1 ring-brand-primary' : 'bg-gray-900 border-gray-700 hover:border-gray-500'}`}>
                            <input type="radio" name="outputStrategy" value="combine" checked={outputStrategy === 'combine'} onChange={() => setOutputStrategy('combine')} className="sr-only" />
                            <span className="font-bold text-sm text-gray-200">Combine All</span>
                            <span className="text-[10px] text-gray-400 text-center mt-1">Merge selected tracks into one single track.</span>
                        </label>

                        <label className={`flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${outputStrategy === 'separate_tracks' ? 'bg-brand-primary/20 border-brand-primary ring-1 ring-brand-primary' : 'bg-gray-900 border-gray-700 hover:border-gray-500'}`}>
                            <input type="radio" name="outputStrategy" value="separate_tracks" checked={outputStrategy === 'separate_tracks'} onChange={() => setOutputStrategy('separate_tracks')} className="sr-only" />
                            <span className="font-bold text-sm text-gray-200">Keep Separate</span>
                            <span className="text-[10px] text-gray-400 text-center mt-1">Process each track independently. Do not merge.</span>
                        </label>

                        <label className={`flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${outputStrategy === 'separate_voices' ? 'bg-brand-primary/20 border-brand-primary ring-1 ring-brand-primary' : 'bg-gray-900 border-gray-700 hover:border-gray-500'}`}>
                            <input type="radio" name="outputStrategy" value="separate_voices" checked={outputStrategy === 'separate_voices'} onChange={() => setOutputStrategy('separate_voices')} className="sr-only" />
                            <span className="font-bold text-sm text-gray-200">Separate Voices</span>
                            <span className="text-[10px] text-gray-400 text-center mt-1">Merge, analyze, then split into SATB voice tracks.</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
