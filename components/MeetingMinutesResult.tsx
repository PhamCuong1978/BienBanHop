import React from 'react';
import { DownloadIcon, EyeIcon } from './icons';

interface MeetingMinutesResultProps {
    htmlContent: string;
}

const MeetingMinutesResult: React.FC<MeetingMinutesResultProps> = ({ htmlContent }) => {
    
    const getHtmlBlob = () => new Blob([htmlContent], { type: 'text/html' });

    const handleDownload = () => {
        const blob = getHtmlBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'meeting-minutes.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handlePreview = () => {
        const blob = getHtmlBlob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    };

    return (
        <div className="relative bg-gray-700/50 p-4 rounded-lg space-y-4">
            <div className="absolute top-2 right-2 flex space-x-2 z-10">
                <button
                    onClick={handlePreview}
                    className="p-1.5 bg-gray-600 rounded-md hover:bg-gray-500 text-gray-300 hover:text-white transition"
                    title="Preview in new tab"
                    aria-label="Preview in new tab"
                >
                    <EyeIcon className="w-5 h-5" />
                </button>
                <button
                    onClick={handleDownload}
                    className="p-1.5 bg-gray-600 rounded-md hover:bg-gray-500 text-gray-300 hover:text-white transition"
                    title="Download as .html"
                    aria-label="Download as .html"
                >
                    <DownloadIcon className="w-5 h-5" />
                </button>
            </div>
            <div className="w-full h-72 sm:h-80 bg-white rounded-md overflow-hidden">
                 <iframe
                    srcDoc={htmlContent}
                    title="Meeting Minutes Preview"
                    className="w-full h-full border-0"
                    sandbox="allow-scripts"
                />
            </div>
        </div>
    );
};

export default MeetingMinutesResult;