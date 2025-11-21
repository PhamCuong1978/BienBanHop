
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenaiBlob } from '@google/genai';
import { MicrophoneIcon, StopIcon } from './icons';

interface LiveTranscriptionProps {
    onComplete: (text: string) => void;
    disabled: boolean;
}

// Helper function to encode raw audio data to base64
function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Helper function to create a GenAI Blob from raw audio data
function createBlob(data: Float32Array): GenaiBlob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}

const LiveTranscription: React.FC<LiveTranscriptionProps> = ({ onComplete, disabled }) => {
    const [isLive, setIsLive] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);

    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    const stopRecordingCleanup = useCallback(() => {
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close());
            sessionPromiseRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsLive(false);
    }, []);

    const handleStart = async () => {
        if (isLive || disabled) return;
        setTranscript('');
        setError(null);
        setIsLive(true);

        try {
            // Helper to get API Key safely from multiple sources (Duplicate logic to avoid import issues for now)
            let apiKey = '';
            if (typeof process !== 'undefined' && process.env) {
                if (process.env.API_KEY) apiKey = process.env.API_KEY;
                else if (process.env.REACT_APP_API_KEY) apiKey = process.env.REACT_APP_API_KEY;
            }
            // @ts-ignore
            if (!apiKey && typeof import.meta !== 'undefined' && import.meta.env) {
                // @ts-ignore
                if (import.meta.env.VITE_API_KEY) apiKey = import.meta.env.VITE_API_KEY;
                // @ts-ignore
                else if (import.meta.env.API_KEY) apiKey = import.meta.env.API_KEY;
            }

            if (!apiKey) {
                throw new Error("API_KEY is not configured.");
            }
            const ai = new GoogleGenAI({ apiKey });
            
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

            const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        if (!audioContextRef.current || !streamRef.current) return;
                        sourceRef.current = audioContextRef.current.createMediaStreamSource(streamRef.current);
                        const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;

                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then((session) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            }
                        };
                        sourceRef.current.connect(scriptProcessor);
                        scriptProcessor.connect(audioContextRef.current.destination);
                    },
                    onmessage: (message: LiveServerMessage) => {
                        const newText = message.serverContent?.inputTranscription?.text;
                        if (newText) {
                            setTranscript(prev => prev + newText);
                        }
                        if (message.serverContent?.turnComplete) {
                            setTranscript(prev => prev + '\n\n');
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Live session error:', e);
                        setError('An error occurred during the live session. Please try again.');
                        stopRecordingCleanup();
                    },
                    onclose: () => {
                        // Handled by user action or error
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO], // Required, but we won't process the audio output
                    inputAudioTranscription: {},
                },
            });

        } catch (err) {
            console.error("Failed to start live transcription:", err);
            setError(err instanceof Error ? err.message : "Could not start recording. Please check microphone permissions.");
            stopRecordingCleanup();
        }
    };

    const handleStop = () => {
        if (!isLive) return;
        onComplete(transcript);
        stopRecordingCleanup();
    };
    
    // Cleanup on unmount
    useEffect(() => {
        return () => stopRecordingCleanup();
    }, [stopRecordingCleanup]);


    return (
        <div className="space-y-4">
             <div className="text-center">
                {isLive ? (
                     <button
                        type="button"
                        onClick={handleStop}
                        disabled={disabled}
                        className="w-full sm:w-auto flex items-center justify-center gap-x-3 px-6 py-3 bg-red-600 text-white font-bold rounded-lg shadow-lg hover:bg-red-700 disabled:bg-gray-600 transition-all duration-300"
                    >
                        <StopIcon className="w-5 h-5" />
                        <span>Stop Recording & Finalize</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleStart}
                        disabled={disabled}
                        className="w-full sm:w-auto flex items-center justify-center gap-x-3 px-6 py-3 bg-cyan-500 text-white font-bold rounded-lg shadow-lg hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 disabled:scale-100"
                    >
                         <MicrophoneIcon className="w-5 h-5" />
                        <span>Start Live Transcription</span>
                    </button>
                )}
            </div>

            {(isLive || transcript) && (
                <div className="space-y-2">
                    <h3 className="text-md font-semibold text-gray-300">
                        {isLive ? '🔴 Live Transcription in Progress...' : 'Final Transcript'}
                    </h3>
                    <div className="relative bg-gray-700/50 p-4 rounded-lg">
                        <p className="text-gray-200 whitespace-pre-wrap font-mono text-sm leading-relaxed p-2 h-48 sm:h-64 overflow-y-auto">
                            {transcript || <span className="text-gray-400">Waiting for speech...</span>}
                        </p>
                    </div>
                </div>
            )}
             {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
        </div>
    );
};

export default LiveTranscription;
