
import React, { useState, useCallback } from 'react';
import { Midi } from '@tonejs/midi';
import Modal from '../Modal';
import { DrumPattern, DrumGeneratorOptions, generateDrumTrack, downloadMidi } from './services/drumGenerator';

interface DrumGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    midiData: Midi;
    selectedTracks: Set<number>;
    timeSignature: { numerator: number; denominator: number };
    tempo: number;
    fileName: string;
}

const PATTERNS: { id: DrumPattern; name: string; description: string }[] = [
    {
        id: 'four_on_floor',
        name: 'Four on the Floor',
        description: 'Kick every beat, snare on 2 & 4, ride on 8th notes. Dance/rock feel.',
    },
    {
        id: 'orchestral_timpani',
        name: 'Orchestral Timpani',
        description: 'Timpani on downbeats and dominant, rolls at phrase boundaries. Key-aware pitched notes.',
    },
    {
        id: 'brushes_ride',
        name: 'Brushes / Ride',
        description: 'Ride quarter notes, cross-stick backbeat, ghost snare fills. Jazz feel, no hi-hats.',
    },
];

interface SliderProps {
    label: string;
    value: number;
    onChange: (v: number) => void;
    leftLabel: string;
    rightLabel: string;
}

function Slider({ label, value, onChange, leftLabel, rightLabel }: SliderProps) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">{label}</label>
                <span className="text-sm font-mono text-gray-400 tabular-nums w-8 text-right">{value}</span>
            </div>
            <input
                type="range"
                min={0}
                max={100}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-brand-primary bg-gray-medium"
            />
            <div className="flex justify-between text-[10px] text-gray-500">
                <span>{leftLabel}</span>
                <span>{rightLabel}</span>
            </div>
        </div>
    );
}

export default function DrumGeneratorModal({
    isOpen,
    onClose,
    midiData,
    selectedTracks,
    timeSignature,
    tempo,
    fileName,
}: DrumGeneratorModalProps) {
    const [pattern, setPattern] = useState<DrumPattern>('four_on_floor');
    const [density, setDensity] = useState(50);
    const [swing, setSwing] = useState(20);
    const [dynamicsRange, setDynamicsRange] = useState(60);

    const handleGenerate = useCallback(() => {
        const trackIds = Array.from(selectedTracks);
        if (trackIds.length === 0) {
            // If no tracks selected, use all tracks for rhythm detection
            for (let i = 0; i < midiData.tracks.length; i++) trackIds.push(i);
        }

        const options: DrumGeneratorOptions = { pattern, density, swing, dynamicsRange };
        const drumMidi = generateDrumTrack(midiData, trackIds, options, timeSignature, tempo);

        const baseName = fileName.replace(/\.mid(i)?$/i, '');
        const patternSuffix = pattern === 'orchestral_timpani' ? '_timpani' : '_drums';
        downloadMidi(drumMidi, `${baseName}${patternSuffix}.mid`);
    }, [midiData, selectedTracks, pattern, density, swing, dynamicsRange, timeSignature, tempo, fileName]);

    const activePatternInfo = PATTERNS.find(p => p.id === pattern);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Drum Generator">
            <div className="max-w-2xl mx-auto space-y-8 py-4">
                {/* Pattern selector */}
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Pattern</h3>
                    <div className="grid grid-cols-3 gap-3">
                        {PATTERNS.map(p => (
                            <button
                                key={p.id}
                                onClick={() => setPattern(p.id)}
                                className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                                    pattern === p.id
                                        ? 'border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary/50'
                                        : 'border-gray-medium bg-gray-dark hover:border-gray-light hover:bg-gray-medium/50'
                                }`}
                            >
                                <span className={`text-sm font-bold block ${pattern === p.id ? 'text-brand-primary' : 'text-gray-200'}`}>
                                    {p.name}
                                </span>
                            </button>
                        ))}
                    </div>
                    {activePatternInfo && (
                        <p className="text-xs text-gray-400 px-1">{activePatternInfo.description}</p>
                    )}
                </div>

                {/* Sliders */}
                <div className="space-y-5">
                    <Slider label="Density" value={density} onChange={setDensity} leftLabel="Sparse" rightLabel="Busy" />
                    <Slider label="Swing" value={swing} onChange={setSwing} leftLabel="Straight" rightLabel="Swung" />
                    <Slider label="Dynamics" value={dynamicsRange} onChange={setDynamicsRange} leftLabel="Flat" rightLabel="Punchy" />
                </div>

                {/* Generate button */}
                <div className="pt-2">
                    <button
                        onClick={handleGenerate}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-brand-primary text-white font-bold rounded-lg shadow-lg transition-all duration-300 hover:bg-brand-secondary focus:outline-none focus:ring-4 focus:ring-brand-primary/50"
                    >
                        Download Drum Track MIDI
                    </button>
                    <p className="text-[10px] text-gray-500 text-center mt-2">
                        Generates a standalone MIDI file with the drum track. Duration matches the loaded file.
                        {selectedTracks.size === 0 && ' All tracks will be used for rhythm detection.'}
                    </p>
                </div>
            </div>
        </Modal>
    );
}
