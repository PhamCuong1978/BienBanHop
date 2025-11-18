
import React, { useState, useEffect, useRef } from 'react';
import { MicrophoneIcon } from './icons';

// Fix: Add types for the Web Speech API to resolve TypeScript errors.
// These interfaces define the shape of the SpeechRecognition API for TypeScript.
interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
    onend: () => void;
}

interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
    readonly transcript: string;
}

interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
}

declare global {
    interface Window {
        SpeechRecognition: new () => SpeechRecognition;
        webkitSpeechRecognition: new () => SpeechRecognition;
    }
}

export interface MeetingDetails {
    timeAndPlace: string;
    attendees: string;
    chair: string;
    topic: string;
}

interface MeetingMinutesGeneratorProps {
    onSubmit: (details: MeetingDetails) => void;
    disabled: boolean;
    initialDetails: MeetingDetails | null;
}

const InputField: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    disabled: boolean;
    onMicClick: () => void;
    isListening: boolean;
    micSupported: boolean;
}> = ({ label, value, onChange, placeholder, disabled, onMicClick, isListening, micSupported }) => (
    <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        <div className="relative">
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={isListening ? 'Listening...' : placeholder}
                disabled={disabled}
                className="w-full bg-gray-600 border border-gray-500 text-white rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500 pr-10"
                aria-label={label}
            />
            {micSupported && (
                 <button
                    type="button"
                    onClick={onMicClick}
                    disabled={disabled}
                    className={`absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                    title={`Dictate for ${label}`}
                >
                    <MicrophoneIcon className={`w-5 h-5 ${isListening ? 'text-red-500 animate-pulse' : ''}`} />
                </button>
            )}
        </div>
    </div>
);


const MeetingMinutesGenerator: React.FC<MeetingMinutesGeneratorProps> = ({ onSubmit, disabled, initialDetails }) => {
    const [details, setDetails] = useState<MeetingDetails>({
        timeAndPlace: '',
        attendees: '',
        chair: '',
        topic: '',
    });

    const [listeningField, setListeningField] = useState<keyof MeetingDetails | null>(null);
    const [micSupported, setMicSupported] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const activeFieldRef = useRef<keyof MeetingDetails | null>(null);
    
    useEffect(() => {
        if (initialDetails) {
            setDetails(initialDetails);
        }
    }, [initialDetails]);


    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setMicSupported(false);
            console.warn('Speech Recognition not supported by this browser.');
            return;
        }

        setMicSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US'; // Set language to English

        recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.trim();
            const fieldToUpdate = activeFieldRef.current;
            if (fieldToUpdate) {
                setDetails(prevDetails => {
                    const existingText = prevDetails[fieldToUpdate];
                    return {
                        ...prevDetails,
                        [fieldToUpdate]: (existingText ? existingText + ' ' : '') + transcript,
                    };
                });
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (activeFieldRef.current) {
                setListeningField(null);
                activeFieldRef.current = null;
            }
        };

        recognition.onend = () => {
             if (activeFieldRef.current) {
                setListeningField(null);
                activeFieldRef.current = null;
            }
        };
        
        recognitionRef.current = recognition;
        
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, []);

    const handleMicClick = (field: keyof MeetingDetails) => {
        if (!micSupported || !recognitionRef.current) return;

        const isCurrentlyListening = listeningField !== null;
        const isThisFieldListening = listeningField === field;

        if (isThisFieldListening) {
             recognitionRef.current.stop();
        } else if (isCurrentlyListening) {
            // Stop the current one, then start the new one.
            // For simplicity, we'll just require the user to stop the active one first.
            // The UI already disables other buttons.
        }
        else {
            activeFieldRef.current = field;
            setListeningField(field);
            try {
                recognitionRef.current.start();
            } catch (e) {
                console.error("Error starting speech recognition:", e);
                setListeningField(null); 
                activeFieldRef.current = null;
            }
        }
    };

    const handleChange = (field: keyof MeetingDetails, value: string) => {
        setDetails(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(details);
    };

    const renderInputField = (fieldKey: keyof MeetingDetails, label: string, placeholder: string) => {
         const isAnyFieldListening = listeningField !== null;
         const isThisFieldListening = listeningField === fieldKey;

        return (
            <InputField
                label={label}
                value={details[fieldKey]}
                onChange={v => handleChange(fieldKey, v)}
                placeholder={placeholder}
                disabled={disabled || (isAnyFieldListening && !isThisFieldListening)}
                onMicClick={() => handleMicClick(fieldKey)}
                isListening={isThisFieldListening}
                micSupported={micSupported}
            />
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-gray-700/50 rounded-lg">
            <p className="text-sm text-gray-400">Provide optional details to include in the minutes. The AI will attempt to fill in any missing information from the transcript. Click the microphone to dictate.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {renderInputField('timeAndPlace', 'Time & Place', "e.g., 2 PM, Oct 26, 2023, Room 4")}
                {renderInputField('attendees', 'Attendees', "e.g., John D, Jane S, Marketing Team")}
                {renderInputField('chair', 'Chairperson', "e.g., John Doe")}
                {renderInputField('topic', 'Topic / Purpose', "e.g., Q4 Marketing Strategy")}
            </div>
            <div className="text-center pt-2">
                <button
                    type="submit"
                    disabled={disabled || listeningField !== null}
                    className="w-full sm:w-auto px-6 py-2 bg-purple-600 text-white font-bold rounded-lg shadow-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 disabled:scale-100"
                >
                    {disabled ? 'Generating...' : '📝 Generate Meeting Minutes'}
                </button>
            </div>
        </form>
    );
};

export default MeetingMinutesGenerator;
