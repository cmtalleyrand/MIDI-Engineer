
import React from 'react';
import { Spinner, DownloadIcon, AbcIcon, ChartBarIcon } from './Icons';

interface ActionPanelProps {
    onCombine: () => void;
    onExportAbc: () => void;
    onAnalyzeSelection: () => void;
    isCombining: boolean;
    isExportingAbc: boolean;
    canProcess: boolean;
    selectedCount: number;
}

export default function ActionPanel({ onCombine, onExportAbc, onAnalyzeSelection, isCombining, isExportingAbc, canProcess, selectedCount }: ActionPanelProps) {
    // Note: The logic for button text now relies on the general context. 
    // Since outputStrategy is in the settings panel, we keep this generic "Process" text unless passed explicitly.
    // However, keeping consistent with previous UI:
    const midiButtonActionText = selectedCount > 0 ? 'Download MIDI' : 'Download';

    return (
        <div className="w-full bg-gray-dark p-6 rounded-2xl shadow-2xl border border-gray-medium mt-6 animate-slide-up">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button 
                    onClick={onCombine} 
                    disabled={!canProcess || isCombining || isExportingAbc} 
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-brand-primary text-white font-bold rounded-lg shadow-lg transition-all duration-300 ease-in-out disabled:bg-gray-medium disabled:cursor-not-allowed hover:bg-brand-secondary focus:outline-none focus:ring-4 focus:ring-brand-primary/50"
                >
                    {isCombining ? ( 
                        <><Spinner className="w-6 h-6" /><span>Processing MIDI...</span></> 
                    ) : ( 
                        <><DownloadIcon className="w-6 h-6" /><span>{midiButtonActionText} ({selectedCount} Track{selectedCount !== 1 ? 's' : ''})</span></> 
                    )}
                </button>
                <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={onExportAbc} 
                            disabled={!canProcess || isCombining || isExportingAbc} 
                            className="w-full flex items-center justify-center gap-3 px-2 py-4 bg-gray-medium/80 text-white font-bold rounded-lg shadow-lg transition-all duration-300 ease-in-out disabled:bg-gray-medium disabled:cursor-not-allowed hover:bg-gray-medium focus:outline-none focus:ring-4 focus:ring-gray-light/50"
                        >
                            {isExportingAbc ? ( 
                                <><Spinner className="w-4 h-4" /><span>Export...</span></> 
                            ) : ( 
                                <><AbcIcon className="w-4 h-4" /><span>Export ABC</span></> 
                            )}
                        </button>
                        <button 
                            onClick={onAnalyzeSelection} 
                            disabled={!canProcess || isCombining || isExportingAbc} 
                            className="w-full flex items-center justify-center gap-3 px-2 py-4 bg-gray-medium/80 text-white font-bold rounded-lg shadow-lg transition-all duration-300 ease-in-out disabled:bg-gray-medium disabled:cursor-not-allowed hover:bg-gray-medium focus:outline-none focus:ring-4 focus:ring-gray-light/50"
                        >
                            <ChartBarIcon className="w-4 h-4" /><span>Analyze Selection</span>
                        </button>
                    </div>
                    <div className="bg-yellow-900/30 border border-yellow-800 rounded px-2 py-1 text-center">
                        <p className="text-[10px] text-yellow-500">
                            Warning: ABC spelling defaults to <strong>C Major</strong> if Key is not changed.
                        </p>
                    </div>
                </div>
            </div>
            {!canProcess && !isCombining && !isExportingAbc && ( 
                <p className="text-center text-xs text-gray-400 mt-2"> Select at least 1 track to download or export. </p> 
            )}
        </div>
    );
}
