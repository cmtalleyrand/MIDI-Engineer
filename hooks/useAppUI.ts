import { useState, useEffect, useCallback } from 'react';
import { AppState, PianoRollTrackData, TrackAnalysisData } from '../types';
import type { TrackAbcPreview } from '../components/services/midiAbc';

// The non-standard PWA install event (not in the DOM lib typings).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const useAppUI = () => {
  const [uiState, setUiState] = useState<AppState>(AppState.IDLE);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [isExportingAbc, setIsExportingAbc] = useState<boolean>(false);
  const [abcPreviews, setAbcPreviews] = useState<TrackAbcPreview[]>([]);

  // Modals
  const [isPianoRollVisible, setIsPianoRollVisible] = useState<boolean>(false);
  const [pianoRollTrackData, setPianoRollTrackData] = useState<PianoRollTrackData | null>(null);
  const [isAnalysisVisible, setIsAnalysisVisible] = useState<boolean>(false);
  const [analysisData, setAnalysisData] = useState<TrackAnalysisData | null>(null);
  const [isDrumGeneratorVisible, setIsDrumGeneratorVisible] = useState<boolean>(false);

  // PWA
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    // Note: We deliberately do NOT automatically set isInstalled to true based on window.matchMedia
    // because preview iframes often incorrectly report standalone mode, hiding the button.
    // We rely on the user's install action or explicit browser events.

    const handler = (e: Event) => {
      // Prevent Chrome from automatically showing the prompt
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      // If the event fires, we are definitely not installed.
      setIsInstalled(false);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = useCallback(() => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          setInstallPrompt(null);
          // Optionally set isInstalled to true here if we want to hide it immediately after acceptance
        }
      });
    } else {
      // Fallback: If no prompt event fired (e.g., Firefox, Safari, or PWA criteria not met yet),
      // show the manual instructions.
      setShowInstallHelp(true);
    }
  }, [installPrompt]);

  const clearMessages = useCallback(() => {
    setErrorMessage('');
    setSuccessMessage('');
    if (uiState === AppState.DOWNLOAD_ERROR || uiState === AppState.SUCCESS) {
      setUiState(AppState.LOADED);
    }
  }, [uiState]);

  return {
    uiState,
    setUiState,
    errorMessage,
    setErrorMessage,
    successMessage,
    setSuccessMessage,
    isExportingAbc,
    setIsExportingAbc,
    abcPreviews,
    setAbcPreviews,
    isPianoRollVisible,
    setIsPianoRollVisible,
    pianoRollTrackData,
    setPianoRollTrackData,
    isAnalysisVisible,
    setIsAnalysisVisible,
    analysisData,
    setAnalysisData,
    isDrumGeneratorVisible,
    setIsDrumGeneratorVisible,
    installPrompt,
    isInstalled,
    showInstallHelp,
    setShowInstallHelp,
    handleInstallClick,
    clearMessages,
  };
};
