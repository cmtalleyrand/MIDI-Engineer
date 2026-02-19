
import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { PianoRollTrackData, VoiceExplanation, VoiceAllocationMath } from '../types';
import { getVoiceLabel } from './services/midiVoices';
import { CloseIcon } from './Icons';

interface PianoRollProps {
  trackData: PianoRollTrackData;
}

const NOTE_HEIGHT = 14;
const MIN_MIDI = 21; // A0
const MAX_MIDI = 108; // C8
const NUM_NOTES = MAX_MIDI - MIN_MIDI + 1;
const KEY_WIDTH = 60;
const RULER_HEIGHT = 32;

// Voice Colors (for up to 8 voices)
const VOICE_COLORS = [
    '#3b82f6', // Blue (Voice 1 - Low)
    '#ef4444', // Red (Voice 2)
    '#10b981', // Green (Voice 3)
    '#f59e0b', // Amber (Voice 4)
    '#8b5cf6', // Violet (Voice 5)
    '#ec4899', // Pink (Voice 6)
    '#6366f1', // Indigo (Voice 7)
    '#14b8a6', // Teal (fallback)
];

const getShortVoiceLabel = (index: number, total: number) => {
    if (index === -1) return 'Orph';
    if (total === 4) return ['S', 'A', 'T', 'B'][index] || `V${index}`;
    if (total === 2) return index === 0 ? 'S' : 'B';
    return `V${index}`;
};

const isBlackKey = (midi: number) => {
  const note = midi % 12;
  return note === 1 || note === 3 || note === 6 || note === 8 || note === 10;
};

const MathTable: React.FC<{ math: VoiceAllocationMath[], currentNoteMidi: number }> = ({ math, currentNoteMidi }) => (
    <div className="overflow-x-auto mt-2 bg-black/40 rounded p-2 border border-gray-700">
        <table className="w-full text-[10px] font-mono text-gray-300">
            <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                    <th className="text-left pb-1">Voice</th>
                    <th className="text-right pb-1">Note</th>
                    <th className="text-right pb-1">Centroid</th>
                    <th className="text-right pb-1">Δ</th>
                    <th className="text-right pb-1">Cost²</th>
                </tr>
            </thead>
            <tbody>
                {math.map((row, i) => (
                    <tr key={i} className={row.noteMidi === currentNoteMidi ? "text-brand-primary font-bold bg-white/5" : ""}>
                        <td className="py-1">{row.voiceName}</td>
                        <td className="text-right">{row.noteMidi}</td>
                        <td className="text-right">{row.voiceCentroid}</td>
                        <td className="text-right">{typeof row.delta === 'number' ? row.delta.toFixed(1) : row.delta}</td>
                        <td className="text-right">{typeof row.costSquared === 'number' ? row.costSquared.toFixed(1) : row.costSquared}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const PianoRoll: React.FC<PianoRollProps> = ({ trackData }) => {
  const { notes, ppq, timeSignature } = trackData;
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const keysContainerRef = useRef<HTMLDivElement>(null);
  const rulerContainerRef = useRef<HTMLDivElement>(null);

  // Zoom state: 1.0 is default (0.15px per tick)
  const [zoom, setZoom] = useState(1.0);
  const [showVoices, setShowVoices] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  
  // Calculate max voice count for labeling
  const maxVoiceIdx = notes.reduce((max, n) => Math.max(max, n.voiceIndex ?? -1), -1);
  const totalVoices = maxVoiceIdx + 1;

  // Auto-scroll to the average pitch of the notes on mount
  useEffect(() => {
    if (gridContainerRef.current && notes.length > 0) {
      const sumMidi = notes.reduce((sum, n) => sum + n.midi, 0);
      const avgMidi = sumMidi / notes.length;
      const targetMidi = Math.min(Math.max(avgMidi, MIN_MIDI), MAX_MIDI);
      // Center the view on the average pitch
      const y = (MAX_MIDI - targetMidi) * NOTE_HEIGHT;
      const containerHeight = gridContainerRef.current.clientHeight;
      gridContainerRef.current.scrollTop = y - containerHeight / 2;
    }
  }, [notes]); // Only depend on notes changing, not zoom

  // Synchronize scrolling between the grid, keys (vertical), and ruler (horizontal)
  const handleGridScroll = () => {
    if (gridContainerRef.current) {
        if (keysContainerRef.current) {
            keysContainerRef.current.scrollTop = gridContainerRef.current.scrollTop;
        }
        if (rulerContainerRef.current) {
            rulerContainerRef.current.scrollLeft = gridContainerRef.current.scrollLeft;
        }
    }
  };

  if (!notes || notes.length === 0) {
    return <div className="flex items-center justify-center h-full text-gray-400">No notes to display.</div>;
  }

  // Calculate dimensions
  const totalTicks = Math.max(...notes.map(n => n.ticks + n.durationTicks), ppq * 4 * timeSignature.numerator);
  const ticksPerMeasure = ppq * timeSignature.numerator * (4 / timeSignature.denominator);
  const totalMeasures = Math.ceil(totalTicks / ticksPerMeasure) + 1; // +1 for buffer
  
  // Dynamic width based on zoom
  const BASE_TICK_WIDTH = 0.15; 
  const TICK_WIDTH = BASE_TICK_WIDTH * zoom;
  const SVG_WIDTH = Math.max(totalTicks * TICK_WIDTH + 100, 100); 
  const SVG_HEIGHT = NUM_NOTES * NOTE_HEIGHT;

  const tickToX = (tick: number) => tick * TICK_WIDTH;
  const midiToY = (midi: number) => (MAX_MIDI - midi) * NOTE_HEIGHT;

  const performZoom = (newZoom: number) => {
      // Calculate center point time before zoom
      if (!gridContainerRef.current) {
          setZoom(newZoom);
          return;
      }
      
      const container = gridContainerRef.current;
      const scrollCenterPixel = container.scrollLeft + (container.clientWidth / 2);
      const centerTick = scrollCenterPixel / TICK_WIDTH; // Using OLD tick width (based on current zoom state)
      
      setZoom(newZoom);
      
      // We must wait for render to update scroll position using the NEW tick width
      // Using requestAnimationFrame to ensure the DOM has updated width
      requestAnimationFrame(() => {
          if (!gridContainerRef.current) return;
          const newTickWidth = BASE_TICK_WIDTH * newZoom;
          const newScrollLeft = (centerTick * newTickWidth) - (gridContainerRef.current.clientWidth / 2);
          gridContainerRef.current.scrollLeft = newScrollLeft;
      });
  };

  const handleZoomIn = () => performZoom(Math.min(zoom * 1.25, 4));
  const handleZoomOut = () => performZoom(Math.max(zoom * 0.8, 0.1));

  // Unique ID for pattern to force redraw on zoom
  const patternId = `beatPattern-${zoom}`;

  return (
    <div className="flex flex-col h-full bg-gray-900 border border-gray-700 rounded-lg overflow-hidden select-none relative">
       {/* Zoom Controls Bar */}
       <div className="flex items-center justify-between px-3 py-1 bg-gray-800 border-b border-gray-700 z-20">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">Zoom</span>
                    <div className="flex items-center bg-gray-700 rounded-md">
                        <button 
                            onClick={handleZoomOut}
                            className="p-1 px-2 text-gray-300 hover:text-white hover:bg-gray-600 rounded-l-md transition-colors"
                            title="Zoom Out"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                        </button>
                        <span className="text-xs text-gray-300 w-12 text-center border-l border-r border-gray-600 px-1 select-none">
                            {Math.round(zoom * 100)}%
                        </span>
                        <button 
                            onClick={handleZoomIn}
                            className="p-1 px-2 text-gray-300 hover:text-white hover:bg-gray-600 rounded-r-md transition-colors"
                            title="Zoom In"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* View Voices Toggle */}
                <label className="flex items-center cursor-pointer gap-2">
                    <div className="relative">
                        <input type="checkbox" className="sr-only" checked={showVoices} onChange={(e) => setShowVoices(e.target.checked)} />
                        <div className={`block w-8 h-4 rounded-full transition-colors ${showVoices ? 'bg-brand-primary' : 'bg-gray-600'}`}></div>
                        <div className={`absolute left-1 top-0.5 bg-white w-3 h-3 rounded-full transition-transform ${showVoices ? 'transform translate-x-4' : ''}`}></div>
                    </div>
                    <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">Show Voices</span>
                </label>
            </div>

            <div className="text-xs text-gray-500">
                {timeSignature.numerator}/{timeSignature.denominator} Time • {ppq} PPQ
            </div>
       </div>

       {/* Info Overlay Panel */}
       {selectedNote && (
           <div className="absolute top-12 right-4 z-50 w-80 bg-gray-800/95 backdrop-blur border border-gray-600 shadow-2xl rounded-lg p-4 animate-fade-in text-sm text-gray-200">
               <div className="flex justify-between items-start mb-2 border-b border-gray-600 pb-2">
                   <div>
                       <h4 className="font-bold text-white text-lg">{selectedNote.name}</h4>
                       <span className="text-xs text-brand-primary font-mono">Tick: {selectedNote.ticks}</span>
                   </div>
                   <button onClick={() => setSelectedNote(null)} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5"/></button>
               </div>
               
               <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                   <div>
                       <span className="text-xs text-gray-500 uppercase font-bold">Assigned Voice</span>
                       <div className="flex items-center gap-2 mt-1">
                            <span 
                                className="w-4 h-4 rounded-sm inline-block"
                                style={{ backgroundColor: selectedNote.voiceIndex >= 0 ? VOICE_COLORS[selectedNote.voiceIndex % VOICE_COLORS.length] : (selectedNote.voiceIndex === -1 ? '#fff' : 'transparent') }}
                            ></span>
                            <div className="flex items-baseline gap-2">
                                <p className="font-bold text-white text-2xl">
                                    {getShortVoiceLabel(selectedNote.voiceIndex, totalVoices)} 
                                </p>
                                <span className="text-xs font-normal text-gray-500">
                                    ({getVoiceLabel(selectedNote.voiceIndex, totalVoices)})
                                </span>
                            </div>
                       </div>
                   </div>
                   
                   {selectedNote.explanation ? (
                       <div className="mt-3">
                           <span className="text-xs text-gray-500 uppercase font-bold block mb-1">Decision Logic</span>
                           <div className="bg-gray-900 rounded p-2 text-xs font-mono border border-gray-700">
                               <p className="text-yellow-500 font-bold mb-1">{selectedNote.explanation.phase}</p>
                               {selectedNote.explanation.text && <p className="mb-2 whitespace-pre-wrap leading-relaxed">{selectedNote.explanation.text}</p>}
                               
                               {/* Render Detailed Math Table for Phase 1 */}
                               {selectedNote.explanation.math && (
                                   <MathTable math={selectedNote.explanation.math} currentNoteMidi={selectedNote.midi} />
                               )}

                               {/* Render Cost List for Phase 2 */}
                               {selectedNote.explanation.costs && (
                                   <div className="space-y-1 mt-2">
                                       {selectedNote.explanation.costs.map((c: any, idx: number) => {
                                            const voiceName = getVoiceLabel(selectedNote.explanation.winner, totalVoices);
                                            // Fallback logic to check if this row represents the winning voice
                                            const isWinner = c.voice === voiceName || (typeof c.voice === 'string' && c.voice.includes(getVoiceLabel(selectedNote.explanation.winner, totalVoices)));
                                            
                                            return (
                                               <div key={idx} className={`flex justify-between ${isWinner ? 'text-green-400 font-bold bg-green-900/20 px-1 rounded' : 'text-gray-400'}`}>
                                                   <span>{c.voice}:</span>
                                                   <div className="text-right">
                                                       <span>{c.cost}</span>
                                                       <span className="block text-[10px] opacity-70">{c.details}</span>
                                                   </div>
                                               </div>
                                           );
                                       })}
                                   </div>
                               )}
                               
                               {selectedNote.explanation.reason && <p className="text-red-400">{selectedNote.explanation.reason}</p>}
                           </div>
                       </div>
                   ) : (
                       <p className="text-gray-500 italic text-xs mt-2">No detailed explanation available (Logic was run before logging enabled or note is raw).</p>
                   )}
               </div>
           </div>
       )}

       {/* Top Header: Empty corner + Ruler */}
       <div className="flex flex-shrink-0 h-[32px] bg-gray-800 border-b border-gray-700 z-10">
          <div className="w-[60px] flex-shrink-0 border-r border-gray-700 bg-gray-800 flex items-center justify-center">
            <span className="text-[10px] text-gray-500 font-mono">Key</span>
          </div>
          <div 
            ref={rulerContainerRef} 
            className="flex-grow overflow-hidden relative bg-gray-800"
          >
             <svg width={SVG_WIDTH} height={RULER_HEIGHT}>
                {Array.from({ length: totalMeasures }).map((_, i) => {
                    const x = tickToX(i * ticksPerMeasure);
                    return (
                        <g key={i} transform={`translate(${x}, 0)`}>
                            <line x1={0} y1={15} x2={0} y2={32} stroke="#6b7280" strokeWidth={1} />
                            <text x={4} y={24} fill="#9ca3af" fontSize="11" fontFamily="monospace" fontWeight="bold">
                                {i + 1}
                            </text>
                        </g>
                    );
                })}
             </svg>
          </div>
       </div>

       {/* Main Area: Keys + Grid */}
       <div className="flex flex-grow overflow-hidden relative">
          
          {/* Piano Keys (Vertical Scroll synced via JS) */}
          <div 
             ref={keysContainerRef} 
             className="w-[60px] flex-shrink-0 overflow-hidden border-r border-gray-700 bg-gray-800"
          >
            <svg width={KEY_WIDTH} height={SVG_HEIGHT}>
                {Array.from({ length: NUM_NOTES }, (_, i) => {
                    const midi = MAX_MIDI - i;
                    const y = i * NOTE_HEIGHT;
                    const black = isBlackKey(midi);
                    const isC = midi % 12 === 0;
                    
                    return (
                        <g key={midi}>
                           <rect 
                              x={0} y={y} width={KEY_WIDTH} height={NOTE_HEIGHT} 
                              fill={black ? '#1f2937' : '#f9fafb'} 
                              stroke="#374151" strokeWidth={0.5}
                            />
                            {/* Label Cs and Fs for better orientation */}
                            {(isC || midi % 12 === 5) && (
                                <text 
                                    x={KEY_WIDTH - 4} 
                                    y={y + NOTE_HEIGHT - 3} 
                                    textAnchor="end" 
                                    fontSize="10" 
                                    fill={black ? '#9ca3af' : '#374151'} 
                                    fontWeight={isC ? "bold" : "normal"}
                                >
                                    {isC ? `C${Math.floor(midi/12)-1}` : 'F'}
                                </text>
                            )}
                        </g>
                    )
                })}
            </svg>
          </div>

          {/* Note Grid (Main Scroll Area) */}
          <div 
             ref={gridContainerRef}
             onScroll={handleGridScroll}
             className="flex-grow overflow-auto bg-gray-900 relative"
          >
            <svg width={SVG_WIDTH} height={SVG_HEIGHT}>
                <defs>
                    <pattern id={patternId} x="0" y="0" width={tickToX(ppq)} height={SVG_HEIGHT} patternUnits="userSpaceOnUse">
                         <line x1={tickToX(ppq)} y1={0} x2={tickToX(ppq)} y2={SVG_HEIGHT} stroke="#374151" strokeWidth={0.5} strokeDasharray="2,2" />
                    </pattern>
                </defs>

                {/* Background Rows (Zebra striping matching keys) */}
                {Array.from({ length: NUM_NOTES }, (_, i) => {
                     const midi = MAX_MIDI - i;
                     const y = i * NOTE_HEIGHT;
                     const black = isBlackKey(midi);
                     return (
                         <rect key={`bg-${midi}`} x={0} y={y} width={SVG_WIDTH} height={NOTE_HEIGHT} 
                         fill={black ? '#111827' : '#1f2937'} fillOpacity={black ? 1 : 0.5} />
                     );
                })}
                
                {/* Octave dividers */}
                {Array.from({ length: NUM_NOTES }, (_, i) => {
                    const midi = MAX_MIDI - i;
                    if (midi % 12 === 0 && midi !== MAX_MIDI) { // Draw line above C
                         return <line key={`oct-${midi}`} x1={0} y1={i * NOTE_HEIGHT} x2={SVG_WIDTH} y2={i * NOTE_HEIGHT} stroke="#4b5563" strokeWidth={1} />;
                    }
                    return null;
                })}

                {/* Beat Grid */}
                <rect x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} fill={`url(#${patternId})`} />

                {/* Measure Lines (Stronger) */}
                {Array.from({ length: totalMeasures }).map((_, i) => (
                     <line 
                        key={`meas-${i}`} 
                        x1={tickToX(i * ticksPerMeasure)} y1={0} 
                        x2={tickToX(i * ticksPerMeasure)} y2={SVG_HEIGHT} 
                        stroke="#6b7280" strokeWidth={1} opacity={0.6}
                     />
                ))}

                {/* Notes */}
                {notes.map((note, idx) => {
                    // Determine Color
                    let noteColor = '#14b8a6'; // Default Teal
                    let strokeColor = '#0f766e';
                    let opacity = 1;
                    let dashArray = "";
                    const isSelected = selectedNote === note;

                    if (note.isOrnament) {
                        opacity = 0.6; // Fade out ornaments
                        strokeColor = 'rgba(255,255,255,0.3)';
                    }

                    if (showVoices && note.voiceIndex !== undefined) {
                        if (note.voiceIndex === -1) {
                            // ORPHAN VISUALIZATION
                            noteColor = '#ffffff'; // White
                            strokeColor = '#ff0000'; // Red Outline (or maybe just standard)
                            dashArray = "2,2"; // Dashed stroke
                        } else {
                            const colorIdx = note.voiceIndex % VOICE_COLORS.length;
                            noteColor = VOICE_COLORS[colorIdx];
                            strokeColor = 'rgba(0,0,0,0.3)';
                        }
                    }

                    // Get Voice Name
                    const voiceName = note.voiceIndex !== undefined ? getVoiceLabel(note.voiceIndex, totalVoices) : 'N/A';

                    return (
                        <rect 
                            key={idx}
                            x={tickToX(note.ticks)}
                            y={midiToY(note.midi) + 1}
                            width={Math.max(tickToX(note.durationTicks), 2)}
                            height={NOTE_HEIGHT - 2}
                            fill={noteColor}
                            fillOpacity={opacity}
                            rx={2}
                            stroke={isSelected ? '#ffffff' : strokeColor}
                            strokeWidth={isSelected ? 2 : (note.voiceIndex === -1 && showVoices ? 2 : 1)}
                            strokeDasharray={dashArray}
                            className="hover:opacity-80 transition-opacity cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedNote(note);
                            }}
                        >
                            <title>{`${note.name} | Vel: ${Math.round(note.velocity * 127)} | Tick: ${note.ticks} | ${voiceName} ${note.isOrnament ? '(Ornament)' : ''}`}</title>
                        </rect>
                    );
                })}
            </svg>
          </div>
       </div>
    </div>
  );
};

export default PianoRoll;
