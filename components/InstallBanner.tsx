
import React, { useState } from 'react';
import { InstallIcon, CloseIcon } from './Icons';

interface InstallBannerProps {
    onInstallClick: () => void;
}

export default function InstallBanner({ onInstallClick }: InstallBannerProps) {
    const [isVisible, setIsVisible] = useState(true);

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[100] p-4">
            <div className="max-w-4xl mx-auto bg-brand-primary rounded-xl shadow-2xl p-4 flex items-center justify-between ring-4 ring-black/20">
                <div className="flex items-center gap-4 text-gray-900">
                    <div className="bg-white/20 p-2 rounded-full">
                        <InstallIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="font-bold text-lg leading-tight">Install App</p>
                        <p className="text-sm font-medium opacity-80">Add to Home Screen for offline use</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={onInstallClick}
                        className="bg-gray-900 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-md hover:bg-gray-800 transition-colors whitespace-nowrap"
                    >
                        Install
                    </button>
                    <button 
                        onClick={() => setIsVisible(false)}
                        className="p-2 text-gray-900 hover:bg-black/10 rounded-full transition-colors"
                        aria-label="Dismiss"
                    >
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
