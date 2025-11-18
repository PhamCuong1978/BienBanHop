import React, { useState, useEffect, useMemo } from 'react';
import { UsersIcon } from './icons';

interface SpeakerNamerProps {
    transcription: string;
    onUpdateTranscription: (newTranscription: string) => void;
    disabled: boolean;
}

const SpeakerNamer: React.FC<SpeakerNamerProps> = ({ transcription, onUpdateTranscription, disabled }) => {
    const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({});

    const detectedSpeakers = useMemo(() => {
        const speakerRegex = /\[NGƯỜI NÓI \d+\]:/g;
        const matches = transcription.match(speakerRegex);
        if (!matches) return [];
        // Get unique speakers and sort them numerically
        // Fix: Explicitly type 'a' and 'b' as strings to resolve TypeScript error on '.match'.
        return [...new Set(matches)].sort((a: string, b: string) => {
            const numA = parseInt(a.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.match(/\d+/)?.[0] || '0');
            return numA - numB;
        });
    }, [transcription]);

    useEffect(() => {
        // Reset speaker names when the detected speakers change
        setSpeakerMap(
            detectedSpeakers.reduce((acc, speaker) => {
                acc[speaker] = '';
                return acc;
            }, {} as Record<string, string>)
        );
    }, [detectedSpeakers]);

    const handleNameChange = (speakerLabel: string, newName: string) => {
        setSpeakerMap(prev => ({
            ...prev,
            [speakerLabel]: newName,
        }));
    };

    const handleApplyNames = () => {
        let updatedTranscription = transcription;
        for (const [speakerLabel, newName] of Object.entries(speakerMap)) {
            // Fix: Add a type guard to ensure newName is a string before calling trim().
            if (typeof newName === 'string' && newName.trim()) {
                // Escape special characters in the label for use in the regex
                const escapedLabel = speakerLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const searchRegex = new RegExp(escapedLabel, 'g');
                // Replace the label with the new name and a colon
                updatedTranscription = updatedTranscription.replace(searchRegex, `${newName.trim()}:`);
            }
        }
        onUpdateTranscription(updatedTranscription);
    };

    if (detectedSpeakers.length === 0) {
        return null; // Don't render if no speakers are detected
    }

    return (
        <div className="space-y-4 p-4 bg-gray-700/50 rounded-lg">
            <h3 className="text-md font-semibold text-gray-300 flex items-center gap-x-2">
                <UsersIcon className="w-5 h-5 text-yellow-400" />
                Name Detected Speakers
            </h3>
            <div className="space-y-3">
                {detectedSpeakers.map(speakerLabel => (
                    <div key={speakerLabel} className="grid grid-cols-3 items-center gap-3">
                        <label htmlFor={`speaker-${speakerLabel}`} className="text-sm font-medium text-gray-300 text-right">
                            {speakerLabel.replace(':', '')}
                        </label>
                        <div className="col-span-2">
                            <input
                                id={`speaker-${speakerLabel}`}
                                type="text"
                                value={speakerMap[speakerLabel] || ''}
                                onChange={e => handleNameChange(speakerLabel, e.target.value)}
                                placeholder="Enter name..."
                                disabled={disabled}
                                className="w-full bg-gray-600 border border-gray-500 text-white rounded-lg p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500"
                            />
                        </div>
                    </div>
                ))}
            </div>
            <div className="text-center pt-2">
                <button
                    onClick={handleApplyNames}
                    // Fix: Explicitly type 'name' as a string to resolve TypeScript error on '.trim'.
                    disabled={disabled || Object.values(speakerMap).every((name: string) => !name.trim())}
                    className="w-full sm:w-auto px-6 py-2 bg-yellow-600 text-white font-bold rounded-lg shadow-lg hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all"
                >
                    Apply Names
                </button>
            </div>
        </div>
    );
};

export default SpeakerNamer;
