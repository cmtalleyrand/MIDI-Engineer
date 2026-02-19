
import React, { useRef } from 'react';
import { TrackAnalysisData, ChordEvent } from '../types';
import { generateAnalysisReport } from './services/midiAnalysis';
import { DocumentTextIcon } from './Icons';
import RhythmicIntegrityReport from './analysis/RhythmicIntegrityReport';
import KeyPredictionPanel from './analysis/KeyPredictionPanel';
import VoiceLeadingPanel from './analysis/VoiceLeadingPanel';
import ChordProgressionPanel from './analysis/ChordProgressionPanel';

interface TrackAnalysisProps {
  data: TrackAnalysisData;
}

export default function TrackAnalysis({ data }: TrackAnalysisProps) {
  const latestChordsRef = useRef<Record<string, ChordEvent[]>>({
      attack: data.chordsAttack,
      sustain: data.chordsSustain,
      hybrid: [],
      beat_synced: data.chordsBucketed || []
  });

  const handleRecalculation = (mode: string, chords: ChordEvent[]) => {
      latestChordsRef.current[mode] = chords;
  };

  const handleDownloadReport = () => {
      const reportData = { 
          ...data, 
          chordsAttack: latestChordsRef.current['attack'] || [], 
          chordsSustain: latestChordsRef.current['sustain'] || [], 
          chordsHybrid: latestChordsRef.current['hybrid'], 
          chordsBucketed: latestChordsRef.current['beat_synced']
      };
      const reportText = generateAnalysisReport(reportData);
      const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.trackName}_Harmonic_Analysis.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 bg-gray-900 rounded-lg text-gray-200">
        <div className="flex justify-end mb-6">
            <button 
                onClick={handleDownloadReport}
                className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded hover:bg-brand-secondary transition-colors text-sm font-bold"
            >
                <DocumentTextIcon className="w-5 h-5" />
                Download Full Report
            </button>
        </div>

        <RhythmicIntegrityReport data={data} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="space-y-6">
                <KeyPredictionPanel histogram={data.pitchClassHistogram} totalNotes={data.totalNotes} />
            </div>
            <div className="space-y-6">
                <VoiceLeadingPanel voiceIntervals={data.voiceIntervals} />
            </div>
        </div>

        <ChordProgressionPanel data={data} onRecalculationComplete={handleRecalculation} />
    </div>
  );
}
