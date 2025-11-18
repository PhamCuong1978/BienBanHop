
import React, { useState } from 'react';
import { CopyIcon, DownloadIcon, CheckIcon } from './icons';

interface TranscriptionResultProps {
    text: string;
}

const TranscriptionResult: React.FC<TranscriptionResultProps> = ({ text }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transcription.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="relative bg-gray-700/50 p-4 rounded-lg">
            <div className="absolute top-2 right-2 flex space-x-2">
                <button
                    onClick={handleCopy}
                    className="p-1.5 bg-gray-600 rounded-md hover:bg-gray-500 text-gray-300 hover:text-white transition"
                    title="Copy to clipboard"
                >
                    {copied ? <CheckIcon className="w-5 h-5 text-green-400" /> : <CopyIcon className="w-5 h-5" />}
                </button>
                <button
                    onClick={handleDownload}
                    className="p-1.5 bg-gray-600 rounded-md hover:bg-gray-500 text-gray-300 hover:text-white transition"
                    title="Download as .txt"
                >
                    <DownloadIcon className="w-5 h-5" />
                </button>
            </div>
            <p className="text-gray-200 whitespace-pre-wrap font-mono text-sm leading-relaxed p-2 h-48 sm:h-64 overflow-y-auto">
                {text}
            </p>
        </div>
    );
};

export default TranscriptionResult;