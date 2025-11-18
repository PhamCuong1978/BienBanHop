
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { UploadIcon, MicrophoneIcon, StopIcon } from './icons';

interface FileUploadProps {
    onFileSelect: (files: File[]) => void;
    disabled: boolean;
}

interface FileDetails {
    name: string;
    size: string;
    duration: string;
}

// Helper to format bytes into a readable string (KB, MB, etc.)
const formatBytes = (bytes: number, decimals = 2): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Helper to format seconds into a MM:SS or HH:MM:SS string
const formatDuration = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts: string[] = [];
    if (hours > 0) {
        parts.push(String(hours).padStart(2, '0'));
    }
    parts.push(String(minutes).padStart(2, '0'));
    parts.push(String(secs).padStart(2, '0'));
    
    return parts.join(':');
};

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, disabled }) => {
    const [fileDetailsList, setFileDetailsList] = useState<FileDetails[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerIntervalRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const processFiles = useCallback((files: File[]) => {
        if (!files || files.length === 0) {
            onFileSelect([]);
            setFileDetailsList([]);
            return;
        }

        onFileSelect(files);
        setFileDetailsList([]); // Reset for new selection

        files.forEach(file => {
            const isAudio = file.type.startsWith('audio/');
            const isText = file.type.startsWith('text/');

            const initialDetails: FileDetails = {
                name: file.name,
                size: formatBytes(file.size),
                duration: isAudio ? '...' : (isText ? 'Text file' : 'Unsupported type')
            };

            setFileDetailsList(prev => [...prev, initialDetails]);

            if (isAudio) {
                const audioUrl = URL.createObjectURL(file);
                const audioElement = new Audio(audioUrl);

                const cleanup = () => {
                    URL.revokeObjectURL(audioUrl);
                    audioElement.removeEventListener('loadedmetadata', handleMetadata);
                    audioElement.removeEventListener('error', handleError);
                };

                const handleMetadata = () => {
                    setFileDetailsList(prev => prev.map(d => 
                        d.name === file.name ? { ...d, duration: formatDuration(audioElement.duration) } : d
                    ));
                    cleanup();
                };

                const handleError = () => {
                     setFileDetailsList(prev => prev.map(d => 
                        d.name === file.name ? { ...d, duration: 'Invalid audio' } : d
                    ));
                    cleanup();
                };

                audioElement.addEventListener('loadedmetadata', handleMetadata);
                audioElement.addEventListener('error', handleError);
            }
        });
    }, [onFileSelect]);


    const stopRecordingCleanup = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        setIsRecording(false);
        setRecordingTime(0);
        audioChunksRef.current = [];
    }, []);

    const handleStartRecording = async () => {
        if (isRecording) return;
        handleClear(); // Clear previous selections before starting a new recording
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                if (audioChunksRef.current.length > 0) {
                    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
                    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                    const fileExtension = mimeType.split('/')[1].split(';')[0];
                    const audioFile = new File([audioBlob], `recording-${Date.now()}.${fileExtension}`, { type: mimeType });
                    processFiles([audioFile]);
                }
                stopRecordingCleanup();
            };

            mediaRecorder.start();
            setIsRecording(true);
            timerIntervalRef.current = window.setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone. Please ensure permissions are granted.");
            stopRecordingCleanup();
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
        }
    };

    const handleClear = useCallback(() => {
        if (isRecording) {
            mediaRecorderRef.current?.stop();
        } else {
            stopRecordingCleanup();
        }
        setFileDetailsList([]);
        onFileSelect([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [onFileSelect, isRecording, stopRecordingCleanup]);
    
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (isRecording) {
                 stopRecordingCleanup();
            }
        };
    }, [isRecording, stopRecordingCleanup]);


    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        processFiles(Array.from(event.target.files || []));
        if(event.target) {
            event.target.value = '';
        }
    };

    const handleDragOver = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
    }, []);
    
    const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        if (disabled || isRecording) return;
        processFiles(Array.from(event.dataTransfer.files));
    }, [disabled, isRecording, processFiles]);

    const isBusy = disabled || isRecording;

    return (
        <div>
            <label 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center w-full h-32 px-4 transition bg-gray-700 border-2 border-gray-600 border-dashed rounded-md appearance-none ${isBusy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-cyan-400'}`}
            >
                <span className="flex items-center space-x-2">
                    <UploadIcon className="w-6 h-6 text-gray-400" />
                    <span className="font-medium text-gray-300">
                        Drop files to Attach, or <span className="text-cyan-400 underline">browse</span>
                    </span>
                </span>
                <input
                    ref={fileInputRef}
                    type="file"
                    name="file_upload"
                    className="hidden"
                    multiple
                    onChange={handleFileChange}
                    accept="audio/*,text/plain,.txt,.md"
                    disabled={isBusy}
                />
            </label>
            {fileDetailsList.length > 0 && (
                 <div className="mt-3 text-center text-sm">
                    <div className="max-h-24 overflow-y-auto bg-gray-700/50 p-2 rounded-md space-y-2 text-left scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                        {fileDetailsList.map((details, index) => (
                            <div key={`${details.name}-${index}`}>
                                <p className="text-gray-200 truncate font-semibold text-xs" title={details.name}>{details.name}</p>
                                <p className="text-gray-400 text-xs">
                                    {details.size} &bull; {details.duration}
                                </p>
                            </div>
                        ))}
                    </div>
                    <button 
                        onClick={handleClear} 
                        disabled={disabled}
                        className="mt-2 text-xs text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Clear Selection
                    </button>
                </div>
            )}
            
            <div className="flex items-center my-4">
                <div className="flex-grow border-t border-gray-600"></div>
                <span className="flex-shrink mx-4 text-gray-400 text-sm font-semibold">OR</span>
                <div className="flex-grow border-t border-gray-600"></div>
            </div>

            <div className="text-center">
                {isRecording ? (
                     <button
                        type="button"
                        onClick={handleStopRecording}
                        disabled={disabled}
                        className="w-full sm:w-auto flex items-center justify-center gap-x-3 px-6 py-2 bg-red-600 text-white font-bold rounded-lg shadow-lg hover:bg-red-700 disabled:bg-gray-600 transition-all duration-300"
                    >
                        <StopIcon className="w-5 h-5" />
                        <span>Stop Recording ({formatDuration(recordingTime)})</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleStartRecording}
                        disabled={disabled || fileDetailsList.length > 0}
                        className="w-full sm:w-auto flex items-center justify-center gap-x-3 px-6 py-2 bg-gray-600 text-white font-bold rounded-lg shadow-lg hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all duration-300"
                    >
                         <MicrophoneIcon className="w-5 h-5" />
                        <span>Record with Microphone</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default FileUpload;
