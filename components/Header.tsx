
import React from 'react';
import { MusicNoteIcon, InstallIcon } from './Icons';

interface HeaderProps {
    onInstallClick?: () => void;
    isInstalled?: boolean;
}

export default function Header({ onInstallClick, isInstalled = false }: HeaderProps) {
  return (
    <header className="w-full max-w-4xl mx-auto flex flex-col items-center mb-8">
       <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-6 p-2">
          {/* Logo & Title */}
          <div className="flex items-center gap-4">
            <div className="bg-brand-primary p-3 rounded-full shadow-lg">
               <MusicNoteIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-light to-brand-primary text-center sm:text-left">
              MIDI Track Combiner
            </h1>
          </div>

          {/* Install Button */}
          {!isInstalled && onInstallClick && (
               <button 
                   onClick={onInstallClick}
                   className="flex items-center gap-2 px-6 py-2.5 bg-brand-primary hover:bg-brand-secondary text-gray-900 font-bold rounded-lg shadow-lg hover:shadow-brand-primary/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
               >
                   <InstallIcon className="w-5 h-5" />
                   <span>Install App</span>
               </button>
          )}
       </div>

      <p className="mt-4 text-lg text-gray-400 text-center max-w-2xl">
        Upload a MIDI file, select the tracks you want, and combine them into one.
      </p>
    </header>
  );
}
