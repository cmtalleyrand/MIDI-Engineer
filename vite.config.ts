import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// IMPORTANT: This app is deployed to GitHub Pages at https://cmtalleyrand.github.io/MIDI-Engineer/
// The base path MUST be '/MIDI-Engineer/' in production to resolve assets correctly.
// DO NOT change to './' or relative paths - it breaks module loading on GitHub Pages.
// If deploying to a different URL, update the base path accordingly.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const base = env.VITE_BASE_PATH || (mode === 'production' ? '/MIDI-Engineer/' : '/');

  return {
    base,
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
