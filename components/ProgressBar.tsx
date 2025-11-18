
import React from 'react';

interface ProgressBarProps {
    progress: number;
    message: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, message }) => {
    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <p className="text-sm text-gray-300">{message}</p>
                 <p className="text-sm font-semibold text-cyan-400">{progress}%</p>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div
                    className="bg-cyan-500 h-2.5 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                ></div>
            </div>
        </div>
    );
};

export default ProgressBar;
