
const CACHE_NAME = 'midi-combiner-v4';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './index.tsx',
  './App.tsx',
  './types.ts',
  './constants.ts',
  './manifest.json',
  './icon.svg',
  './metadata.json',
  // Hooks
  './hooks/useMidiController.ts',
  './hooks/useConversionSettings.ts',
  // Components
  './components/Header.tsx',
  './components/InstallBanner.tsx',
  './components/FileUpload.tsx',
  './components/TrackList.tsx',
  './components/TrackItem.tsx',
  './components/Icons.tsx',
  './components/Notification.tsx',
  './components/Modal.tsx',
  './components/PianoRoll.tsx',
  './components/TrackAnalysis.tsx',
  './components/ConversionSettings.tsx',
  './components/ActionPanel.tsx',
  './components/midiPlaybackService.ts',
  // Settings Components
  './components/settings/TempoTimeSettings.tsx',
  './components/settings/TransformSettings.tsx',
  './components/settings/VoiceSettings.tsx',
  './components/settings/KeyModeSettings.tsx',
  './components/settings/QuantizationSettings.tsx',
  './components/settings/FilterSettings.tsx',
  // Services
  './components/services/midiService.ts',
  './components/services/midiCore.ts',
  './components/services/midiVoices.ts',
  './components/services/midiHarmony.ts',
  './components/services/midiTransform.ts',
  './components/services/midiPipeline.ts',
  './components/services/midiAbc.ts',
  './components/services/midiAnalysis.ts',
  './components/services/musicTheory.ts',
  './components/services/abcUtils.ts',
  './components/services/shadowQuantizer.ts',
  // Analysis Components
  './components/analysis/AnalysisShared.tsx',
  './components/analysis/RhythmicIntegrityReport.tsx',
  './components/analysis/KeyPredictionPanel.tsx',
  './components/analysis/VoiceLeadingPanel.tsx',
  './components/analysis/ChordProgressionPanel.tsx',
  // Services Analysis
  './components/services/analysis/transformationAnalysis.ts',
  './components/services/analysis/keyPrediction.ts',
  './components/services/analysis/rhythmAnalysis.ts',
  './components/services/analysis/FilterSettings.tsx'
];

self.addEventListener('install', (event) => {
  // Force this new service worker to become the active one, bypassing the wait
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request because it's a one-time use stream
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          (response) => {
            // Check if we received a valid response
            if(!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
              return response;
            }

            // Clone response to cache it
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                // Cache dynamically loaded files (like external CDNs)
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  // Claim clients immediately so the user sees the update without reopening the tab
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim() 
    ])
  );
});
