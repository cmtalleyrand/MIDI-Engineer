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

const STYLE_DESCRIPTIONS: Record<DrumStyle, string> = {
  four_on_floor: 'Kick on every beat, clap on beats 2 & 4. Off-beat kicks appear above 60% density.',
  martial: 'Snare-heavy with kick on downbeats. Ghost snares appear above 50% density.',
  timpani_melodic: 'Three toms mapped to source pitch (low/mid/high). Rolls appear above 65% density.',
  cinematic_toms: 'Deep low-tom pulse with mid-tom accents every 3 hits. Crash peaks appear above 70% density.',
  electro_pulse: 'Kick + off-beat hi-hat grid, clap on beat 2. Extra hi-hat subdivisions appear above 45% density.',
};

function getDensityLabel(v: number): string {
  if (v < 0.35) return 'Sparse — base pattern only, no fills';
  if (v < 0.55) return 'Moderate — occasional extra hits';
  if (v < 0.70) return 'Dense — frequent fills added';
  return 'Heavy — maximum fills and extras';
}

function getIntensityLabel(v: number): string {
  if (v < 0.30) return 'Soft — ghost notes, quiet hits';
  if (v < 0.55) return 'Light — gentle accent';
  if (v < 0.75) return 'Medium — standard accent';
  return 'Hard — full forte, punchy hits';
}

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
            <p className="text-xs text-gray-500 mt-2">
              {STYLE_DESCRIPTIONS[drumGeneration.style]}
            </p>
            <p className="text-xs text-gray-600 mt-1">MIDI export only — ABC export ignores generated drums.</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-400">
                Fill Density
              </label>
              <span className="text-xs font-mono text-brand-primary">{Math.round(drumGeneration.density * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(drumGeneration.density * 100)}
              onChange={(e) => handlePatch({ density: Number(e.target.value) / 100 })}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-0.5 px-0.5">
              <span>Sparse</span>
              <span>Moderate</span>
              <span>Dense</span>
              <span>Heavy</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {getDensityLabel(drumGeneration.density)}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-400">
                Hit Strength
              </label>
              <span className="text-xs font-mono text-brand-primary">{Math.round(drumGeneration.intensity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(drumGeneration.intensity * 100)}
              onChange={(e) => handlePatch({ intensity: Number(e.target.value) / 100 })}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-0.5 px-0.5">
              <span>Soft</span>
              <span>Light</span>
              <span>Medium</span>
              <span>Hard</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {getIntensityLabel(drumGeneration.intensity)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
