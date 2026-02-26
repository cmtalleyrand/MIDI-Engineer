
import React from 'react';
import { CHROMATIC_NAMES } from '../services/musicTheory';
import { useSettings } from '../../context/SettingsContext';

const MODES = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Natural Minor': [0, 2, 3, 5, 7, 8, 10],
    'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
    'Dorian': [0, 2, 3, 5, 7, 9, 10],
    'Phrygian': [0, 1, 3, 5, 7, 8, 10],
    'Lydian': [0, 2, 4, 6, 7, 9, 11],
    'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'Locrian': [0, 1, 3, 5, 6, 8, 10],
    'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};

const ABC_MODES = ['maj', 'min', 'dor', 'phr', 'lyd', 'mix', 'loc'];
const ABC_ACCIDENTALS = ['__', '_', '=', '^', '^^'] as const;
const ABC_TONIC_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
const ABC_NOTE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

const getDegreeLabel = (interval: number, modeIntervals: number[]) => {
    const degreeIndex = modeIntervals.indexOf(interval);
    if (degreeIndex !== -1) return `Degree ${degreeIndex + 1}`;
    switch(interval) {
        case 0: return "Root (1)";
        case 1: return "Min 2nd (b2)";
        case 2: return "Maj 2nd (2)";
        case 3: return "Min 3rd (b3)";
        case 4: return "Maj 3rd (3)";
        case 5: return "Perfect 4th (4)";
        case 6: return "Aug 4 / Dim 5";
        case 7: return "Perfect 5th (5)";
        case 8: return "Min 6th (b6)";
        case 9: return "Maj 6th (6)";
        case 10: return "Min 7th (b7)";
        case 11: return "Maj 7th (7)";
        default: return "";
    }
};

const getNoteName = (root: number, interval: number) => CHROMATIC_NAMES[(root + interval) % 12];

export default function KeyModeSettings() {
    const { settings, setters } = useSettings();
    const {
        modalRoot, modalModeName, isModalConversionEnabled, modalMappings, keySignatureSpelling, abcKeyExport
    } = settings;
    const {
        setModalRoot, setModalModeName, setIsModalConversionEnabled, setModalMappings, setKeySignatureSpelling, setAbcKeyExport
    } = setters;

    const modeIntervals = MODES[modalModeName as keyof typeof MODES] || MODES['Major'];

    return (
        <div className="border-t border-gray-medium pt-4">
            <h3 className="text-lg font-semibold text-gray-light mb-4">Key & Mode</h3>
            <div className="bg-gray-darker p-4 rounded-lg border border-gray-medium">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Key Root</label>
                        <select value={modalRoot} onChange={(e) => setModalRoot(Number(e.target.value))} className="block w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-gray-light">
                            {CHROMATIC_NAMES.map((k, i) => <option key={k} value={i}>{k}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Mode</label>
                        <select value={modalModeName} onChange={(e) => setModalModeName(e.target.value)} className="block w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-gray-light">
                            {Object.keys(MODES).map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Key Spelling</label>
                        <select 
                            value={keySignatureSpelling} 
                            onChange={(e) => setKeySignatureSpelling(e.target.value as 'auto' | 'sharp' | 'flat')} 
                            className="block w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-gray-light"
                        >
                            <option value="auto">Auto (Context)</option>
                            <option value="sharp">Force Sharps (#)</option>
                            <option value="flat">Force Flats (b)</option>
                        </select>
                    </div>
                </div>

                <div className="mt-4 p-3 border border-gray-700 rounded-md bg-gray-900/40">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-sm font-medium text-gray-300">Override ABC export key (K:)</span>
                            <p className="text-xs text-gray-500 mt-1">Choose tonic, mode and additional accidentals using ABC key syntax.</p>
                        </div>
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only"
                                checked={abcKeyExport.enabled}
                                onChange={(e) => setAbcKeyExport({ ...abcKeyExport, enabled: e.target.checked })}
                            />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${abcKeyExport.enabled ? 'bg-brand-primary' : 'bg-gray-700'}`}></div>
                        </label>
                    </div>

                    {abcKeyExport.enabled && (
                        <div className="mt-3 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Tonic Letter</label>
                                    <select
                                        value={abcKeyExport.tonicLetter}
                                        onChange={(e) => setAbcKeyExport({ ...abcKeyExport, tonicLetter: e.target.value as typeof ABC_TONIC_LETTERS[number] })}
                                        className="block w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-gray-light"
                                    >
                                        {ABC_TONIC_LETTERS.map(letter => <option key={letter} value={letter}>{letter}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Tonic Accidental</label>
                                    <select
                                        value={abcKeyExport.tonicAccidental}
                                        onChange={(e) => setAbcKeyExport({ ...abcKeyExport, tonicAccidental: e.target.value as typeof ABC_ACCIDENTALS[number] })}
                                        className="block w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-gray-light"
                                    >
                                        {ABC_ACCIDENTALS.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Mode</label>
                                    <select
                                        value={abcKeyExport.mode}
                                        onChange={(e) => setAbcKeyExport({ ...abcKeyExport, mode: e.target.value })}
                                        className="block w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-gray-light"
                                    >
                                        {ABC_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-xs font-medium text-gray-400">Additional accidentals</label>
                                    <button
                                        type="button"
                                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
                                        onClick={() => setAbcKeyExport({
                                            ...abcKeyExport,
                                            additionalAccidentals: [...abcKeyExport.additionalAccidentals, { accidental: '^', letter: 'f' }]
                                        })}
                                    >
                                        + Add accidental
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {abcKeyExport.additionalAccidentals.map((item, index) => (
                                        <div key={`${item.letter}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                            <select
                                                value={item.letter}
                                                onChange={(e) => {
                                                    const next = [...abcKeyExport.additionalAccidentals];
                                                    next[index] = { ...next[index], letter: e.target.value as typeof ABC_NOTE_LETTERS[number] };
                                                    setAbcKeyExport({ ...abcKeyExport, additionalAccidentals: next });
                                                }}
                                                className="bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-gray-light"
                                            >
                                                {ABC_NOTE_LETTERS.map(letter => <option key={letter} value={letter}>{letter}</option>)}
                                            </select>
                                            <select
                                                value={item.accidental}
                                                onChange={(e) => {
                                                    const next = [...abcKeyExport.additionalAccidentals];
                                                    next[index] = { ...next[index], accidental: e.target.value as typeof ABC_ACCIDENTALS[number] };
                                                    setAbcKeyExport({ ...abcKeyExport, additionalAccidentals: next });
                                                }}
                                                className="bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-gray-light"
                                            >
                                                {ABC_ACCIDENTALS.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                                            </select>
                                            <button
                                                type="button"
                                                className="px-2 py-1 rounded bg-red-900/40 hover:bg-red-900/60 text-red-200"
                                                onClick={() => {
                                                    setAbcKeyExport({
                                                        ...abcKeyExport,
                                                        additionalAccidentals: abcKeyExport.additionalAccidentals.filter((_, i) => i !== index)
                                                    });
                                                }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-700">
                    <div>
                        <span className="text-sm font-medium text-gray-300">Enable Note Remapping</span>
                        <p className="text-xs text-gray-500 mt-1">Allows you to remap notes from the source key to a target scale (e.g. Major to Minor conversion).</p>
                    </div>
                    <label className="flex items-center cursor-pointer">
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={isModalConversionEnabled} onChange={(e) => setIsModalConversionEnabled(e.target.checked)} />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${isModalConversionEnabled ? 'bg-brand-primary' : 'bg-gray-700'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isModalConversionEnabled ? 'transform translate-x-4' : ''}`}></div>
                        </div>
                    </label>
                </div>
                {isModalConversionEnabled && (
                    <div className="mt-4 overflow-x-auto animate-fade-in">
                        <table className="w-full text-sm text-left text-gray-400">
                            <thead>
                                <tr><th className="px-4 py-2">Source</th><th></th><th className="px-4 py-2">Target</th></tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <tr key={i} className={`border-b border-gray-700 ${modeIntervals.includes(i) ? 'bg-gray-800/50' : ''}`}>
                                        <td className="px-4 py-2 font-medium">{getNoteName(modalRoot, i)} <span className="text-xs text-gray-500">({getDegreeLabel(i, modeIntervals)})</span></td>
                                        <td className="text-center">→</td>
                                        <td className="px-4 py-2">
                                            <select
                                                value={modalMappings[i] ?? i}
                                                onChange={(e) => setModalMappings({ ...modalMappings, [i]: Number(e.target.value) })}
                                                className="bg-gray-900 border border-gray-700 rounded py-1 px-2 text-gray-light w-full"
                                            >
                                                {Array.from({ length: 12 }).map((_, tIdx) => (
                                                    <option key={tIdx} value={tIdx}>{getNoteName(modalRoot, tIdx)} - {getDegreeLabel(tIdx, modeIntervals)}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
