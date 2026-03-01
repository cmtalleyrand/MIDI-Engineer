import React from 'react';
import { DrumStyle } from '../../types';
import { useSettings } from '../../context/SettingsContext';

const STYLE_LABELS: Record<DrumStyle, string> = {
  four_on_floor: 'Four on the Floor',
  martial: 'Martial Snare',
  timpani_melodic: 'Melodic Timpani',
  cinematic_toms: 'Cinematic Toms',
  electro_pulse: 'Electro Pulse (Hat)'
};

export default function RhythmDrumsSettings() {
  const { settings, setters } = useSettings();
  const { drumGeneration } = settings;
  const { setDrumGeneration } = setters;

  const handlePatch = (patch: Partial<typeof drumGeneration>) => {
    setDrumGeneration({ ...drumGeneration, ...patch });
  };

  return (
    <div className="border-t border-gray-medium pt-4">
      <h3 className="text-lg font-semibold text-gray-light mb-4">Rhythm → Drums Generator</h3>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={drumGeneration.enabled}
            onChange={(e) => handlePatch({ enabled: e.target.checked })}
            className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-brand-primary"
          />
          <span className="ml-3 font-bold text-gray-200">Add generated drum track</span>
        </label>

        <div className={`${!drumGeneration.enabled ? 'opacity-50 pointer-events-none' : ''} space-y-4`}>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Style</label>
            <select
              value={drumGeneration.style}
              onChange={(e) => handlePatch({ style: e.target.value as DrumStyle })}
              className="block w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-sm text-gray-light"
            >
              {Object.entries(STYLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">MIDI export only: ABC export ignores generated drums. Orchestral/pop/electronic presets; only Electro Pulse is hi-hat forward.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Density ({Math.round(drumGeneration.density * 100)}%)</label>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(drumGeneration.density * 100)}
              onChange={(e) => handlePatch({ density: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Intensity ({Math.round(drumGeneration.intensity * 100)}%)</label>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(drumGeneration.intensity * 100)}
              onChange={(e) => handlePatch({ intensity: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
