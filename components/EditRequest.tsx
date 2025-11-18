
import React, { useState, useEffect, useRef } from 'react';
import { MicrophoneIcon } from './icons';

// Types for the Web Speech API
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
interface SpeechRecognitionEvent extends Event { readonly results: SpeechRecognitionResultList; }
interface SpeechRecognitionResultList { readonly length: number; item(index: number): SpeechRecognitionResult;[index: number]: SpeechRecognitionResult; }
interface SpeechRecognitionResult { readonly length: number; item(index: number): SpeechRecognitionAlternative;[index: number]: SpeechRecognitionAlternative; }
interface SpeechRecognitionAlternative { readonly transcript: string; }
interface SpeechRecognitionErrorEvent extends Event { readonly error: string; }
declare global {
    interface Window {
        SpeechRecognition: new () => SpeechRecognition;
        webkitSpeechRecognition: new () => SpeechRecognition;
    }
}


interface EditRequestProps {
    onSubmit: (editText: string) => void;
    disabled: boolean;
}

const EditRequest: React.FC<EditRequestProps> = ({ onSubmit, disabled }) => {
    const [editText, setEditText] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [micSupported, setMicSupported] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setMicSupported(false);
            return;
        }

        setMicSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.trim();
            setEditText(prev => (prev ? prev + ' ' : '') + transcript);
        };
        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setIsListening(false);
        };
        recognition.onend = () => {
            setIsListening(false);
        };
        
        recognitionRef.current = recognition;
        
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, []);

    const handleMicClick = () => {
        if (!micSupported || !recognitionRef.current) return;
        
        if (isListening) {
             recognitionRef.current.stop();
        } else {
            setIsListening(true);
            try {
                recognitionRef.current.start();
            } catch (e) {
                console.error("Error starting speech recognition:", e);
                setIsListening(false); 
            }
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editText.trim()) {
            onSubmit(editText);
            setEditText(''); // Clear after submit
        }
    };

    const getButtonText = () => {
        if (isListening) return 'Listening...';
        if (disabled) return 'Processing...';
        return 'Submit Edit Request';
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-gray-700/50 rounded-lg">
            <label htmlFor="edit-request" className="block text-sm font-medium text-gray-300">
                Enter your edit requests here. For example: "Add ABC to the attendee list" or "Clarify decision number 2".
            </label>
            <div className="relative">
                <textarea
                    id="edit-request"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder={isListening ? 'Listening...' : 'Write your request...'}
                    disabled={disabled}
                    rows={4}
                    className="w-full bg-gray-600 border border-gray-500 text-white rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500 pr-10"
                    aria-label="Request Edits"
                />
                 {micSupported && (
                    <button
                        type="button"
                        onClick={handleMicClick}
                        disabled={disabled}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Dictate edit request"
                    >
                        <MicrophoneIcon className={`w-5 h-5 ${isListening ? 'text-red-500 animate-pulse' : ''}`} />
                    </button>
                )}
            </div>
            <div className="text-center">
                <button
                    type="submit"
                    disabled={disabled || !editText.trim() || isListening}
                    className="w-full sm:w-auto px-6 py-2 bg-green-600 text-white font-bold rounded-lg shadow-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 disabled:scale-100"
                >
                    {getButtonText()}
                </button>
            </div>
        </form>
    );
};

export default EditRequest;
