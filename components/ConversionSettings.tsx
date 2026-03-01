
import React from 'react';
import { MidiEventCounts, InversionStats } from '../types';
import TempoTimeSettings from './settings/TempoTimeSettings';
import TransformSettings from './settings/TransformSettings';
import VoiceSettings from './settings/VoiceSettings';
import KeyModeSettings from './settings/KeyModeSettings';
import QuantizationSettings from './settings/QuantizationSettings';
import FilterSettings from './settings/FilterSettings';
import RhythmDrumsSettings from './settings/RhythmDrumsSettings';

interface ConversionSettingsProps {
    eventCounts: MidiEventCounts | null;
    quantizationWarning?: { message: string, details: string[] } | null;
    inversionStats?: InversionStats | null;
}

export default function ConversionSettings({ eventCounts, quantizationWarning, inversionStats }: ConversionSettingsProps) {
  return (
    <div className="w-full bg-gray-dark p-6 rounded-2xl shadow-2xl border border-gray-medium mt-6 animate-slide-up">
        <div className="border-b border-gray-medium pb-4 mb-4">
            <h2 className="text-xl font-bold text-gray-light">Configuration</h2>
        </div>

        <div className="space-y-6">
            <TempoTimeSettings />
            <TransformSettings inversionStats={inversionStats} />
            <VoiceSettings />
            <KeyModeSettings />
            <QuantizationSettings quantizationWarning={quantizationWarning} />
            <FilterSettings eventCounts={eventCounts} />
            <RhythmDrumsSettings />
        </div>
    </div>
  );
}
