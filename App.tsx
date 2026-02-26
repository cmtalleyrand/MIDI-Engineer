
import React from 'react';
import { AppState } from './types';
import Header from './components/Header';
import FileUpload from './components/FileUpload';
import TrackList from './components/TrackList';
import Modal from './components/Modal';
import PianoRoll from './components/PianoRoll';
import TrackAnalysis from './components/TrackAnalysis';
import Notification from './components/Notification';
import ConversionSettings from './components/ConversionSettings';
import ActionPanel from './components/ActionPanel';
import DrumGeneratorModal from './components/DrumGeneratorModal';
import { DevicePhoneMobileIcon, GlobeAltIcon } from './components/Icons';

import { useMidiAppController } from './hooks/useMidiAppController';
import { SettingsProvider, useSettings } from './context/SettingsContext';

function MidiAppContent() {
  const { project, playback, ui, computed, handlers } = useMidiAppController();
  const { settings } = useSettings();

  const activeMessage = ui.errorMessage || project.loadError || playback.playbackError || ui.successMessage;
  const activeMessageType = (ui.errorMessage || project.loadError || playback.playbackError) ? 'error' : 'success';

  return (
    <>
      <div className="min-h-screen bg-gray-darker flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans pb-24">
        <Header 
          isInstalled={ui.isInstalled} 
          onInstallClick={ui.handleInstallClick}
        />
        <main className="w-full max-w-4xl mx-auto flex-grow flex flex-col items-center justify-center">
          {!computed.isLoadedState ? (
              <div className="w-full max-w-lg text-center">
                  <FileUpload onFileUpload={project.actions.handleFileUpload} isLoading={project.loadState === AppState.LOADING} />
                  {project.loadState === AppState.ERROR && (
                      <div className="mt-4 p-4 bg-red-900/50 border border-red-700 text-red-300 rounded-lg animate-fade-in">
                        <p className="font-bold">An Error Occurred</p>
                        <p>{project.loadError}</p>
                      </div>
                  )}
              </div>
          ) : (
            <div className="w-full animate-fade-in pb-12">
              <TrackList
                tracks={project.trackInfo}
                selectedTracks={project.selectedTracks}
                onTrackSelect={project.actions.handleTrackSelect}
                onSelectAll={project.actions.handleSelectAllTracks}
                onReset={handlers.handleReset}
                fileName={project.fileName}
                playingTrackId={playback.playingTrackId}
                onPreviewTrack={handlers.handlePreview}
                onShowPianoRoll={handlers.handleShowPianoRoll}
                onAnalyzeTrack={handlers.handleAnalyzeTrack}
              />
              
              <ConversionSettings 
                eventCounts={project.eventCounts}
                quantizationWarning={computed.quantizationWarning}
                inversionStats={computed.inversionStats}
              />

              {activeMessage && (
                  <div className="my-4">
                    <Notification 
                        message={activeMessage} 
                        type={activeMessageType} 
                        onDismiss={() => { ui.clearMessages(); playback.setPlaybackError(''); }} 
                    />
                  </div>
              )}

              <ActionPanel
                 onCombine={handlers.handleCombine}
                 onExportAbc={handlers.handleExportAbc}
                 onAnalyzeSelection={handlers.handleAnalyzeSelection}
                 onOpenDrumGenerator={handlers.handleOpenDrumGenerator}
                 isCombining={ui.uiState === AppState.COMBINING}
                 isExportingAbc={ui.isExportingAbc}
                 canProcess={project.selectedTracks.size >= 1}
                 selectedCount={project.selectedTracks.size}
              />
            </div>
          )}
        </main>
        <footer className="w-full max-w-4xl mx-auto text-center py-4 mt-8 border-t border-gray-medium text-gray-medium">
          <p>Built with React, Tailwind CSS, and @tonejs/midi</p>
        </footer>
      </div>

      {ui.isPianoRollVisible && ui.pianoRollTrackData && (
        <Modal
          isOpen={ui.isPianoRollVisible}
          onClose={() => ui.setIsPianoRollVisible(false)}
          title={`Piano Roll: ${ui.pianoRollTrackData.name}`}
        >
          <PianoRoll trackData={ui.pianoRollTrackData} />
        </Modal>
      )}
      {ui.isAnalysisVisible && ui.analysisData && (
        <Modal
          isOpen={ui.isAnalysisVisible}
          onClose={() => ui.setIsAnalysisVisible(false)}
          title={`Analysis: ${ui.analysisData.trackName}`}
        >
           <TrackAnalysis data={ui.analysisData} />
        </Modal>
      )}

      {ui.isDrumGeneratorVisible && project.midiData && (
        <DrumGeneratorModal
          isOpen={ui.isDrumGeneratorVisible}
          onClose={() => ui.setIsDrumGeneratorVisible(false)}
          midiData={project.midiData}
          selectedTracks={project.selectedTracks}
          timeSignature={{
            numerator: parseInt(settings.newTimeSignature.numerator, 10) || 4,
            denominator: parseInt(settings.newTimeSignature.denominator, 10) || 4,
          }}
          tempo={parseInt(settings.newTempo, 10) || 120}
          fileName={project.fileName}
        />
      )}

      {ui.showInstallHelp && (
        <Modal
          isOpen={ui.showInstallHelp}
          onClose={() => ui.setShowInstallHelp(false)}
          title="How to Install App"
        >
          <div className="text-gray-200 p-4 space-y-6">
            <p className="text-sm text-gray-400">
              Your browser doesn't support automatic installation triggering, but you can install this app manually to your home screen.
            </p>

            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <DevicePhoneMobileIcon className="w-6 h-6 text-brand-primary" />
                <h3 className="font-bold text-lg text-white">Android</h3>
              </div>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300 ml-1">
                <li>Tap the <strong>Menu</strong> icon (three dots <strong>⋮</strong>) in the top right corner of Chrome.</li>
                <li>Select <strong>"Install App"</strong> or <strong>"Add to Home Screen"</strong>.</li>
                <li>Confirm by tapping <strong>Install</strong>.</li>
              </ol>
            </div>

            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <GlobeAltIcon className="w-6 h-6 text-brand-primary" />
                <h3 className="font-bold text-lg text-white">iOS (iPhone/iPad)</h3>
              </div>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300 ml-1">
                <li>Tap the <strong>Share</strong> icon (square with arrow) at the bottom of Safari.</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
                <li>Tap <strong>Add</strong> in the top right corner.</li>
              </ol>
            </div>
            
            <div className="text-center pt-4">
              <button 
                onClick={() => ui.setShowInstallHelp(false)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <MidiAppContent />
    </SettingsProvider>
  );
}
