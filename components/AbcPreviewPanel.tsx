import React from 'react';
import type { TrackAbcPreview } from './services/midiAbc';

interface AbcPreviewPanelProps {
    previews: TrackAbcPreview[];
    onCopy: (abc: string) => Promise<void>;
    onClear: () => void;
}

export default function AbcPreviewPanel({ previews, onCopy, onClear }: AbcPreviewPanelProps) {
    if (previews.length === 0) return null;

    return (
        <section className="w-full mt-6 bg-gray-dark p-4 rounded-2xl shadow-2xl border border-gray-medium animate-slide-up">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">ABC Preview ({previews.length} Track{previews.length !== 1 ? 's' : ''})</h3>
                <button
                    onClick={onClear}
                    className="px-3 py-1 text-xs bg-gray-medium text-white rounded hover:bg-gray-light transition-colors"
                >
                    Clear
                </button>
            </div>
            <div className="grid grid-cols-1 gap-3">
                {previews.map((preview) => (
                    <article key={preview.trackId} className="border border-gray-medium rounded-lg p-3 bg-gray-darker/70">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{preview.trackName}</p>
                                <p className="text-[11px] text-gray-400 truncate">{preview.fileName}</p>
                            </div>
                            <button
                                onClick={() => void onCopy(preview.abc)}
                                className="px-3 py-1 text-xs bg-brand-primary text-white rounded hover:bg-brand-secondary transition-colors"
                            >
                                Copy
                            </button>
                        </div>
                        <textarea
                            readOnly
                            value={preview.abc}
                            className="w-full h-48 text-xs font-mono bg-black/40 text-green-200 rounded p-2 border border-gray-700"
                        />
                    </article>
                ))}
            </div>
        </section>
    );
}
