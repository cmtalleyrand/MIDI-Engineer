import React, { useState } from 'react';
import { DrumStyle } from '../../types';
import { useSettings } from '../../context/SettingsContext';

// ─── Style metadata ────────────────────────────────────────────────────────────

const STYLE_LABELS: Record<DrumStyle, string> = {
  four_on_floor: 'Four on the Floor',
  martial:       'Martial Snare',
  timpani_melodic: 'Melodic Timpani',
  cinematic_toms: 'Cinematic Toms',
  electro_pulse: 'Electro Pulse',
};

const STYLE_DESCRIPTIONS: Record<DrumStyle, string> = {
  four_on_floor:   'Kick on every skeleton beat. Clap on alternating beats (2 & 4 equivalent). Hi-hat pulse from part 3 up.',
  martial:         'Snare on every beat. Kick on every 4th. Off-beat hi-hat from part 3. Ghost snares from fill level 1.',
  timpani_melodic: 'Tom selected by source pitch (low/mid/high). Bass-tom accent on every 4th beat from part 2. Subtle hi-hat from part 3.',
  cinematic_toms:  'Low tom on every beat. Mid tom every 3rd beat from part 2. High tom every 5th from part 3. Crash at phrase peaks from fill level 2.',
  electro_pulse:   'Kick on every beat. Off-beat hi-hat from part 2. Clap on every 4th beat from part 3. Extra hat subdivisions from fill level 1.',
};

// ─── Parts (instrument tiers) per style ───────────────────────────────────────

const PARTS_STACK: Record<DrumStyle, string[]> = {
  four_on_floor:   ['Kick', '+ Clap (beats 2 & 4)', '+ Hi-hat pulse', '+ Off-beat kick fill', '+ 16th-note hi-hat'],
  martial:         ['Snare', '+ Kick (every 4th)', '+ Off-beat hi-hat', '+ Ghost snare', '+ Fill kick'],
  timpani_melodic: ['Tom (pitch-mapped)', '+ Bass-tom accent', '+ Subtle hi-hat', '+ Echo tom', '+ Phrase roll'],
  cinematic_toms:  ['Low tom', '+ Mid tom (every 3rd)', '+ High tom (every 5th)', '+ Crash (phrase peaks)', '+ Hi-hat tension'],
  electro_pulse:   ['Kick', '+ Off-beat hi-hat', '+ Clap (beat 2)', '+ Extra hi-hat', '+ Hat rolls'],
};

function getPartsDescription(style: DrumStyle, parts: number): string {
  const stack = PARTS_STACK[style];
  return stack.slice(0, parts).join(', ');
}

// ─── Fill level ────────────────────────────────────────────────────────────────

const FILL_LABELS = ['None', 'Light', 'Medium', 'Heavy'] as const;

const FILL_DESCRIPTIONS: Record<DrumStyle, [string, string, string, string]> = {
  four_on_floor:   [
    'Base pattern only — kick + clap + hi-hat',
    'No fills active at this level — adds at Medium',
    'Off-beat kick fills added',
    'Off-beat kick + 16th-note hi-hat fills',
  ],
  martial: [
    'Base pattern only — snare + kick + hi-hat',
    'Ghost snare between beats',
    'Ghost snare + fill kick on off-beats',
    'All fills active',
  ],
  timpani_melodic: [
    'Base pattern only — pitch-mapped toms',
    'Echo tom on adjacent pitch',
    'Echo tom + high-tom phrase rolls',
    'All fills active',
  ],
  cinematic_toms: [
    'Base pattern only — low/mid/high toms',
    'No fills at this level — adds at Medium',
    'Crash cymbal at phrase peaks',
    'Crash + hi-hat tension',
  ],
  electro_pulse: [
    'Base pattern only — kick + hi-hat + clap',
    'Extra hi-hat at ¾ position',
    'Extra hi-hat + rapid hat at ¼ position',
    'All fills active',
  ],
};

// ─── Velocity (intensity) ─────────────────────────────────────────────────────

function getVelocityLabel(v: number): string {
  if (v < 0.25) return 'pp — ghost notes, very soft';
  if (v < 0.50) return 'mp — light accent';
  if (v < 0.75) return 'mf — standard hit';
  return 'ff — hard hit, full forte';
}

// ─── Alignment helpers ────────────────────────────────────────────────────────

function getAlignRhythmLabel(v: number): string {
  if (v < -0.33) return 'Counter-rhythm — drums fill where this voice is silent';
  if (v > 0.33)  return 'Locked — drums shadow this voice\'s rhythm';
  return 'Independent — drums fire regardless of this voice';
}

function getAlignDensityLabel(v: number): string {
  if (v < -0.33) return 'Sparse preference — more hits when this voice has few notes';
  if (v > 0.33)  return 'Busy preference — more hits when this voice is active';
  return 'Neutral — hit rate unaffected by this voice\'s density';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface AlignSliderProps {
  label: string;
  value: number;
  leftLabel: string;
  rightLabel: string;
  description: string;
  onChange: (v: number) => void;
}

function AlignSlider({ label, value, leftLabel, rightLabel, description, onChange }: AlignSliderProps) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        <span className="text-[10px] font-mono text-gray-500">{pct > 0 ? `+${pct}` : pct}</span>
      </div>
      <div className="relative">
        <input
          type="range" min="-100" max="100"
          value={pct}
          onChange={e => onChange(Number(e.target.value) / 100)}
          className="w-full"
        />
        <div className="flex justify-between text-[9px] text-gray-600 mt-0.5 px-0.5">
          <span>{leftLabel}</span>
          <span>0</span>
          <span>{rightLabel}</span>
        </div>
      </div>
      <p className="text-[10px] text-gray-500 mt-0.5">{description}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RhythmDrumsSettings() {
  const { settings, setters } = useSettings();
  const { drumGeneration } = settings;
  const { setDrumGeneration } = setters;
  const [alignOpen, setAlignOpen] = useState(false);

  const patch = (p: Partial<typeof drumGeneration>) =>
    setDrumGeneration({ ...drumGeneration, ...p });

  const { style, fillLevel, intensity, parts, hatEnabled,
          rhythmAlignBass, rhythmAlignMelody,
          densityAlignBass, densityAlignMelody } = drumGeneration;

  return (
    <div className="border-t border-gray-medium pt-4">
      <h3 className="text-lg font-semibold text-gray-light mb-4">Rhythm → Drums Generator</h3>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-5">

        {/* Enable */}
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox" checked={drumGeneration.enabled}
            onChange={e => patch({ enabled: e.target.checked })}
            className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-brand-primary"
          />
          <span className="ml-3 font-bold text-gray-200">Add generated drum track</span>
        </label>

        <div className={`${!drumGeneration.enabled ? 'opacity-50 pointer-events-none' : ''} space-y-5`}>

          {/* Style */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Style</label>
            <select
              value={style}
              onChange={e => patch({ style: e.target.value as DrumStyle })}
              className="block w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-sm text-gray-light"
            >
              {Object.entries(STYLE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <div className="mt-2 p-2 bg-gray-900 rounded border border-gray-700 text-xs text-gray-400">
              {STYLE_DESCRIPTIONS[style]}
            </div>
            <p className="text-[10px] text-gray-600 mt-1">MIDI export only — ABC export ignores generated drums.</p>
          </div>

          {/* Active instruments (parts) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-400">Active Instruments</label>
              <span className="text-xs font-mono text-brand-primary">{parts} of 5</span>
            </div>
            <input
              type="range" min="1" max="5" step="1"
              value={parts}
              onChange={e => patch({ parts: Number(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5 px-0.5">
              {[1,2,3,4,5].map(n => <span key={n}>{n}</span>)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {getPartsDescription(style, parts)}
            </p>
          </div>

          {/* Hi-hat toggle */}
          <label className="flex items-center cursor-pointer gap-2">
            <input
              type="checkbox" checked={hatEnabled}
              onChange={e => patch({ hatEnabled: e.target.checked })}
              className="h-4 w-4 rounded bg-gray-900 border-gray-600 text-brand-primary focus:ring-brand-primary"
            />
            <span className="text-xs text-gray-300">Hi-hat on</span>
          </label>

          {/* Fill level */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Fills</label>
            <div className="grid grid-cols-4 gap-1">
              {([0, 1, 2, 3] as const).map(lvl => (
                <button
                  key={lvl}
                  onClick={() => patch({ fillLevel: lvl })}
                  className={`py-1.5 rounded text-xs font-medium transition-colors ${
                    fillLevel === lvl
                      ? 'bg-brand-primary text-white'
                      : 'bg-gray-900 text-gray-400 border border-gray-600 hover:border-gray-400'
                  }`}
                >
                  {FILL_LABELS[lvl]}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {FILL_DESCRIPTIONS[style][fillLevel]}
            </p>
          </div>

          {/* Velocity */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-400">Velocity</label>
              <span className="text-xs font-mono text-brand-primary">
                {intensity < 0.25 ? 'pp' : intensity < 0.50 ? 'mp' : intensity < 0.75 ? 'mf' : 'ff'}
              </span>
            </div>
            <input
              type="range" min="0" max="100"
              value={Math.round(intensity * 100)}
              onChange={e => patch({ intensity: Number(e.target.value) / 100 })}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-0.5 px-0.5">
              <span>pp</span><span>mp</span><span>mf</span><span>ff</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">{getVelocityLabel(intensity)}</p>
          </div>

          {/* Alignment section */}
          <div>
            <button
              onClick={() => setAlignOpen(o => !o)}
              className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
            >
              <span className={`transition-transform ${alignOpen ? 'rotate-90' : ''}`}>▶</span>
              Alignment
              <span className="text-[10px] text-gray-600 ml-1">(rhythm &amp; density lock to bass / melody)</span>
            </button>

            {alignOpen && (
              <div className="mt-3 space-y-4 pl-3 border-l border-gray-700">
                <p className="text-[10px] text-gray-500">
                  Bass and melody are identified using the voice allocation system.
                  Requires at least 2 distinct pitch registers in the source material.
                </p>

                <div className="space-y-1">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Rhythmic alignment — when does the drum fire?</p>
                </div>

                <AlignSlider
                  label="Rhythm → bass"
                  value={rhythmAlignBass}
                  leftLabel="Counter"
                  rightLabel="Locked"
                  description={getAlignRhythmLabel(rhythmAlignBass)}
                  onChange={v => patch({ rhythmAlignBass: v })}
                />
                <AlignSlider
                  label="Rhythm → melody"
                  value={rhythmAlignMelody}
                  leftLabel="Counter"
                  rightLabel="Locked"
                  description={getAlignRhythmLabel(rhythmAlignMelody)}
                  onChange={v => patch({ rhythmAlignMelody: v })}
                />

                <div className="space-y-1">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Density alignment — how often does the drum fire?</p>
                </div>

                <AlignSlider
                  label="Density → bass"
                  value={densityAlignBass}
                  leftLabel="Sparse →"
                  rightLabel="→ Busy"
                  description={getAlignDensityLabel(densityAlignBass)}
                  onChange={v => patch({ densityAlignBass: v })}
                />
                <AlignSlider
                  label="Density → melody"
                  value={densityAlignMelody}
                  leftLabel="Sparse →"
                  rightLabel="→ Busy"
                  description={getAlignDensityLabel(densityAlignMelody)}
                  onChange={v => patch({ densityAlignMelody: v })}
                />
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
