
import { RawNote, ConversionOptions, VoiceExplanation } from '../../types';

const getMidi = (n: any | RawNote) => 'midi' in n ? n.midi : (n as any).midi;
const getTicks = (n: any | RawNote) => 'ticks' in n ? n.ticks : (n as any).ticks;
const getDuration = (n: any | RawNote) => 'durationTicks' in n ? n.durationTicks : (n as any).durationTicks;
const getEnd = (n: any | RawNote) => getTicks(n) + getDuration(n);
const getName = (n: any | RawNote) => 'name' in n ? n.name : (n as any).name;

export function getVoiceLabel(index: number, total: number): string {
    if (index === -1) return 'Orph';
    if (total === 1) return 'Melody';
    if (total === 2) return index === 0 ? 'S' : 'B';
    if (total === 3) return ['S', 'T', 'B'][index] || `V${index}`;
    if (total === 4) return ['S', 'A', 'T', 'B'][index] || `V${index}`;
    
    return `V${index}`;
}

interface DensityArea {
    startTick: number;
    endTick: number;
    density: number;
    slices: any[];
}

export interface VoiceDistributionResult {
    voices: (any | RawNote)[][];
    orphans: (any | RawNote)[];
}

// Helper for combinatorial voice selection
function getCombinations(arr: number[], k: number): number[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const [first, ...rest] = arr;
    const withFirst = getCombinations(rest, k-1).map(c => [first, ...c]);
    const withoutFirst = getCombinations(rest, k);
    return [...withFirst, ...withoutFirst];
}

/**
 * Structural Analysis based on Density and Sustain criteria.
 */
export function distributeToVoices(notes: any[] | RawNote[], options?: ConversionOptions, ppq: number = 480): VoiceDistributionResult {
    if (notes.length === 0) return { voices: [], orphans: [] };

    const TS_NUM = options?.timeSignature?.numerator || 4;
    const TS_DEN = options?.timeSignature?.denominator || 4;
    const TICKS_PER_MEASURE = ppq * TS_NUM * (4 / TS_DEN);
    const EIGHTH_GAP = ppq / 2;
    
    // Strict Mode: Notes in a voice cannot overlap at all. 
    const strictMonophony = options?.voiceSeparationDisableChords === true;
    const overlapTolerance = options?.voiceSeparationOverlapTolerance || 0;

    const sortedNotes = [...notes].sort((a, b) => getTicks(a) - getTicks(b));
    const allEvents = new Set<number>();
    sortedNotes.forEach(n => { 
        allEvents.add(getTicks(n)); 
        allEvents.add(getEnd(n)); 
    });
    const sortedTimeline = Array.from(allEvents).sort((a,b) => a - b);
    
    // Create slices of the timeline to calculate precise vertical density
    const slices: { start: number, end: number, activeNotes: (any | RawNote)[] }[] = [];
    let maxGlobalDensity = 0;
    
    for (let i = 0; i < sortedTimeline.length - 1; i++) {
        const start = sortedTimeline[i];
        const end = sortedTimeline[i+1];
        const mid = (start + end) / 2;
        const active = sortedNotes.filter(n => getTicks(n) <= mid && getEnd(n) > mid);
        if (active.length > maxGlobalDensity) maxGlobalDensity = active.length;
        slices.push({ start, end, activeNotes: active });
    }

    if (maxGlobalDensity === 0) return { voices: [sortedNotes], orphans: [] };

    const findAreasAtDensity = (targetDensity: number) => {
        const areas: DensityArea[] = [];
        let currentArea: DensityArea | null = null;

        slices.forEach((slice) => {
            if (slice.activeNotes.length >= targetDensity) {
                if (!currentArea) {
                    currentArea = { startTick: slice.start, endTick: slice.end, density: targetDensity, slices: [slice] };
                } else {
                    const gap = slice.start - currentArea.endTick;
                    if (gap <= EIGHTH_GAP) {
                        currentArea.endTick = slice.end;
                        currentArea.slices.push(slice);
                    } else {
                        areas.push(currentArea);
                        currentArea = { startTick: slice.start, endTick: slice.end, density: targetDensity, slices: [slice] };
                    }
                }
            }
        });
        if (currentArea) areas.push(currentArea);
        return areas;
    };

    const checkSustain = (area: DensityArea) => {
        const len = area.endTick - area.startTick;
        return len >= TICKS_PER_MEASURE; 
    };

    let ceilingDensity = maxGlobalDensity;
    while (ceilingDensity >= 1) {
        const areas = findAreasAtDensity(ceilingDensity);
        if (areas.some(checkSustain)) break;
        ceilingDensity--;
    }

    let finalPolyphony = ceilingDensity;
    if (finalPolyphony === 0) finalPolyphony = Math.max(1, maxGlobalDensity - 1); // Fallback

    if (options?.voiceSeparationMaxVoices && options.voiceSeparationMaxVoices > 0) {
        finalPolyphony = options.voiceSeparationMaxVoices;
    }

    const voiceTracks: (any | RawNote)[][] = Array.from({ length: finalPolyphony }, () => []);
    const orphans: (any | RawNote)[] = [];
    const assignedNotes = new Set<any | RawNote>();

    // ---------------------------------------------------------
    // PHASE 1: ITERATIVE ANCHOR ASSIGNMENT (VERTICAL)
    // ---------------------------------------------------------
    // We only iterate down to the point where density implies unambiguous structure.
    for (let d = finalPolyphony; d >= finalPolyphony; d--) {
        const areas = findAreasAtDensity(d);
        const sustainedAreas = areas.filter(checkSustain);

        // Centroids are calculated but only used for display in Phase 1 now, 
        // or for tie-breaking in Phase 2.
        const voiceCentroids: number[] = [];
        for(let v=0; v<finalPolyphony; v++) {
            const notes = voiceTracks[v];
            if (notes.length > 0) {
                 const sum = notes.reduce((s, n) => s + getMidi(n), 0);
                 voiceCentroids[v] = sum / notes.length;
            } else {
                 voiceCentroids[v] = 84 - (v * (48 / Math.max(1, finalPolyphony - 1)));
            }
        }

        sustainedAreas.forEach(area => {
            area.slices.forEach(slice => {
                const activeNotes = slice.activeNotes.sort((a: any, b: any) => getMidi(b) - getMidi(a)); // Always High -> Low
                
                // Identify Unassigned notes in this slice
                const unassignedInSlice = activeNotes.filter((n: any) => !assignedNotes.has(n));
                
                if (unassignedInSlice.length === 0) return;

                // STRATEGY: MAX DENSITY BLOCK ONLY
                if (activeNotes.length >= finalPolyphony) {
                     let mathDetails: any[] = [];
                     
                     for(let k=0; k < activeNotes.length; k++) {
                         if (k >= finalPolyphony) break;

                         const note = activeNotes[k];
                         if (assignedNotes.has(note)) continue; 
                         
                         const targetVoice = k;
                         
                         voiceTracks[targetVoice].push(note);
                         assignedNotes.add(note);
                         (note as any).voiceIndex = targetVoice;
                         
                         mathDetails.push({
                             voiceName: getVoiceLabel(targetVoice, finalPolyphony),
                             voiceCentroid: `Rank ${k}`,
                             noteMidi: getMidi(note),
                             delta: 0,
                             costSquared: 0
                         });

                         (note as any).explanation = {
                            phase: "1 - Anchor (Full Block)",
                            text: `Full Density Block. Assigned to ${getVoiceLabel(targetVoice, finalPolyphony)} (Rank ${k}).`,
                            assignedVoice: targetVoice,
                            math: mathDetails
                        };
                     }
                } 
            });
        });
    }

    // ---------------------------------------------------------
    // PHASE 2: GAP FILLING (HORIZONTAL)
    // ---------------------------------------------------------
    const remainingNotes = sortedNotes.filter(n => !assignedNotes.has(n));
    
    // Changed to standard loop to allow lookahead
    for (let i = 0; i < remainingNotes.length; i++) {
        const note = remainingNotes[i];
        let bestV = -1;
        let minCost = Infinity;
        const nPitch = getMidi(note);
        const nStart = getTicks(note);
        const nEnd = getEnd(note);
        
        // ISLAND PREVENTION: Look ahead to see if this note starts a horizontal line
        let formsPhrase = false;
        // Look up to 10 notes ahead or until time gap is too large
        for(let k = i + 1; k < Math.min(i + 10, remainingNotes.length); k++) {
             const future = remainingNotes[k];
             if (getTicks(future) - nEnd > TICKS_PER_MEASURE) break; // Too far, stop looking
             
             // If a note starts strictly after this one, it extends the timeline
             if (getTicks(future) > nStart) {
                 formsPhrase = true;
                 break;
             }
        }

        const costLog: any[] = [];

        for (let v = 0; v < finalPolyphony; v++) {
            const track = voiceTracks[v];
            const voiceName = getVoiceLabel(v, finalPolyphony);
            
            const overlap = track.some(existing => {
                const eStart = getTicks(existing);
                const eEnd = getEnd(existing);
                const effStart1 = nStart; 
                const effEnd1 = Math.max(nStart, nEnd - overlapTolerance);
                const effStart2 = eStart;
                const effEnd2 = Math.max(eStart, eEnd - overlapTolerance);
                return effStart1 < effEnd2 && effEnd1 > effStart2;
            });
            
            if (overlap && strictMonophony) {
                costLog.push({ voice: voiceName, cost: 'N/A', details: 'Overlap' });
                continue;
            }
            
            // Find neighbors
            const prev = track.filter(n => getTicks(n) <= nStart && n !== note).sort((a,b) => getTicks(b) - getTicks(a))[0];
            const next = track.filter(n => getTicks(n) > nStart).sort((a,b) => getTicks(a) - getTicks(b))[0];

            let cost = 0;
            let details = [];

            // 1. Interval Cost
            let intervalCost = 0;
            if (prev) intervalCost += Math.abs(getMidi(prev) - nPitch);
            if (next) intervalCost += Math.abs(getMidi(next) - nPitch);
            cost += intervalCost;
            
            if (intervalCost > 0) details.push(`Dist: ${intervalCost}`);
            else details.push(`Dist: 0`);
            
            // 2. Zone/Centroid Bias (Tie-breaker only)
            const targetP = 84 - (v * (36 / Math.max(1, finalPolyphony - 1)));
            const centroidCost = Math.abs(targetP - nPitch) * 0.05;
            cost += centroidCost; 
            details.push(`Zone: ${centroidCost.toFixed(1)}`);

            // 3. Structural Integrity (Island/Waking Prevention)
            const prevEnd = prev ? getEnd(prev) : -Infinity;
            const nextStart = next ? getTicks(next) : Infinity;
            
            const isChordAddition = prev && (getTicks(prev) === nStart || prevEnd > nStart);
            
            let penalty = 0;
            if (isChordAddition) {
                penalty = 10;
                details.push("Chord (+10)");
            } else {
                const isPrevClose = (nStart - prevEnd) <= TICKS_PER_MEASURE;
                const isNextClose = (nextStart - nEnd) <= TICKS_PER_MEASURE;

                if (!isPrevClose && !isNextClose) {
                    if (!formsPhrase) {
                        penalty = 1000;
                        details.push("Island (+1000)");
                    } else {
                        penalty = 25; 
                        details.push("Phrase Start (+25)");
                    }
                } else if (!isPrevClose) {
                    penalty = 50;
                    details.push("Waking (+50)");
                } else if (!isNextClose) {
                     penalty = 5;
                     details.push("End (+5)");
                }
            }
            cost += penalty;

            costLog.push({ voice: voiceName, cost: cost.toFixed(1), details: details.join(', ') });

            if (cost < minCost) {
                minCost = cost;
                bestV = v;
            }
        }

        if (bestV !== -1) {
            voiceTracks[bestV].push(note);
            assignedNotes.add(note);
            (note as any).voiceIndex = bestV;
            (note as any).explanation = {
                phase: "2 - Gap Fill",
                winner: bestV,
                text: "Cost minimization.",
                costs: costLog
            };
        } else {
            orphans.push(note);
            assignedNotes.add(note);
            (note as any).voiceIndex = -1;
            (note as any).explanation = {
                phase: "3 - Orphan",
                reason: "Collision in all voices."
            };
        }
    }

    voiceTracks.forEach(t => t.sort((a,b) => getTicks(a) - getTicks(b)));
    orphans.sort((a,b) => getTicks(a) - getTicks(b));

    return { voices: voiceTracks, orphans };
}
