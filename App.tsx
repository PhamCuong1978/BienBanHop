
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { transcribeAudio, generateMeetingMinutes, regenerateMeetingMinutes, identifySpeakers } from './services/geminiService';
import { processAudio } from './services/audioProcessor';
import FileUpload from './components/FileUpload';
import Options, { ProcessingOptions } from './components/Options';
import TranscriptionResult from './components/TranscriptionResult';
import ProgressBar from './components/ProgressBar';
import { GithubIcon, UsersIcon } from './components/icons';
import ModelSelector from './components/ModelSelector';
import MeetingMinutesGenerator, { MeetingDetails } from './components/MeetingMinutesGenerator';
import MeetingMinutesResult from './components/MeetingMinutesResult';
import EditRequest from './components/EditRequest';
import LiveTranscription from './components/LiveTranscription';
import SpeakerNamer from './components/SpeakerNamer';
import SavedSessionsList from './components/SavedSessionsList';

// Helper function to extract the topic from the generated HTML
const extractTopicFromHtml = (htmlContent: string): string | null => {
    try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        
        // Find all text nodes in the document body to search for the topic label
        const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
        let node;
        while ((node = walker.nextNode())) {
            const nodeText = node.textContent || '';
            if (nodeText.includes('Chủ đề / Mục đích cuộc họp')) {
                // Found the label. The actual topic is likely in the text immediately following the colon,
                // or in the next sibling element of its parent.
                
                // Case 1: Topic is in the same text node after the label
                const match = nodeText.match(/Chủ đề \/ Mục đích cuộc họp:\s*(.+)/);
                if (match && match[1].trim()) {
                    const topic = match[1].trim();
                     if (!topic.toLowerCase().includes('(not provided)')) return topic;
                }
                
                // Case 2: Topic is in the next element sibling
                let parent = node.parentElement;
                let nextElement = parent?.nextElementSibling;
                while (nextElement) {
                    const topic = nextElement.textContent?.trim();
                    if (topic && !topic.toLowerCase().includes('(not provided)')) {
                        return topic;
                    }
                    nextElement = nextElement.nextElementSibling;
                }
            }
        }
    } catch(e) {
        console.error("Error parsing HTML for topic extraction:", e);
    }
    return null;
};

export interface SavedSession {
  id: string;
  createdAt: string;
  name: string;
  transcription: string;
  meetingMinutesHtml: string;
  meetingDetails: MeetingDetails;
}

const HISTORY_KEY = 'gemini_meeting_minutes_history';

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'file' | 'live' | 'history'>('file');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-pro');
    const [transcription, setTranscription] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [progress, setProgress] = useState<number>(0);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
        convertToMono16kHz: true,
        noiseReduction: true,
        normalizeVolume: true,
        removeSilence: true,
    });

    const [meetingMinutesHtml, setMeetingMinutesHtml] = useState<string>('');
    const [isGeneratingMinutes, setIsGeneratingMinutes] = useState<boolean>(false);
    const [minutesError, setMinutesError] = useState<string | null>(null);
    const [lastMeetingDetails, setLastMeetingDetails] = useState<MeetingDetails | null>(null);
    const [minutesGenerationProgress, setMinutesGenerationProgress] = useState(0);
    const [minutesGenerationStatus, setMinutesGenerationStatus] = useState('');

    const [isEditingMinutes, setIsEditingMinutes] = useState<boolean>(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [editProgress, setEditProgress] = useState<number>(0);
    const [editStatusMessage, setEditStatusMessage] = useState<string>('');

    const [isDiarizing, setIsDiarizing] = useState<boolean>(false);
    const [diarizationError, setDiarizationError] = useState<string | null>(null);
    const [diarizationProgress, setDiarizationProgress] = useState(0);

    const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);

    const cancelRequestRef = useRef<boolean>(false);

    // Load history from localStorage on initial render
    useEffect(() => {
        try {
            const savedHistory = localStorage.getItem(HISTORY_KEY);
            if (savedHistory) {
                setSavedSessions(JSON.parse(savedHistory));
            }
        } catch (error) {
            console.error("Failed to load history from localStorage", error);
        }
    }, []);

    // Save history to localStorage whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(savedSessions));
        } catch (error) {
            console.error("Failed to save history to localStorage", error);
        }
    }, [savedSessions]);

    const resetState = () => {
        setTranscription('');
        setError(null);
        setProgress(0);
        setStatusMessage('');
        setMeetingMinutesHtml('');
        setMinutesError(null);
        setLastMeetingDetails(null);
        setEditError(null);
        setDiarizationError(null);
        setIsDiarizing(false);
    }

    const handleFileSelect = (files: File[]) => {
        setSelectedFiles(files);
        resetState();
    };
    
    const handleLiveTranscriptionComplete = (text: string) => {
        resetState();
        setTranscription(text);
    };

    const handleCancel = () => {
        cancelRequestRef.current = true;
        if (isLoading) {
            setIsLoading(false);
            setProgress(0);
            setStatusMessage('Processing cancelled by user.');
        }
        if (isGeneratingMinutes) {
            setIsGeneratingMinutes(false);
            setMinutesError('Minute generation cancelled by user.');
        }
        if (isEditingMinutes) {
            setIsEditingMinutes(false);
            setEditError('Edit request cancelled by user.');
        }
        if (isDiarizing) {
            setIsDiarizing(false);
            setDiarizationError('Speaker identification cancelled by user.');
        }
    };

    const handleLoadSession = (sessionId: string) => {
        const sessionToLoad = savedSessions.find(s => s.id === sessionId);
        if (sessionToLoad) {
            resetState();
            setTranscription(sessionToLoad.transcription);
            setMeetingMinutesHtml(sessionToLoad.meetingMinutesHtml);
            setLastMeetingDetails(sessionToLoad.meetingDetails);
            setSelectedFiles([]); // Clear file selection
            setActiveTab('file'); // Switch back to the main view
        }
    };

    const handleDeleteSession = (sessionId: string) => {
        if (window.confirm("Bạn có chắc chắn muốn xóa phiên đã lưu này không? Hành động này không thể hoàn tác.")) {
             setSavedSessions(prev => prev.filter(s => s.id !== sessionId));
        }
    };


    const handleProcessFile = useCallback(async () => {
        if (selectedFiles.length === 0) {
            setError("Please select one or more files first.");
            return;
        }

        setIsLoading(true);
        cancelRequestRef.current = false;
        resetState();

        const allContent: string[] = [];
        try {
             for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                if (cancelRequestRef.current) return;

                const fileProgressStart = (i / selectedFiles.length) * 100;
                const fileProgressSpan = 100 / selectedFiles.length;
                
                setStatusMessage(`Processing file ${i + 1}/${selectedFiles.length}: ${file.name}`);

                if (file.type.startsWith('text/')) {
                    setProgress(fileProgressStart + fileProgressSpan * 0.5);
                    await new Promise(res => setTimeout(res, 200)); // UI delay
                    if (cancelRequestRef.current) return;

                    const textContent = await file.text();
                    if (cancelRequestRef.current) return;

                    allContent.push(`--- Start of content from ${file.name} ---\n${textContent}\n--- End of content from ${file.name} ---`);
                    setProgress(fileProgressStart + fileProgressSpan);

                } else if (file.type.startsWith('audio/')) {
                    let fileToProcess = file;
                    const isAnyOptionEnabled = Object.values(processingOptions).some(option => option === true);

                    if (isAnyOptionEnabled) {
                        try {
                            setStatusMessage(`(File ${i + 1}/${selectedFiles.length}) Pre-processing audio...`);
                            setProgress(fileProgressStart + fileProgressSpan * 0.1);
                            await new Promise(res => setTimeout(res, 200));
                            if (cancelRequestRef.current) return;

                            fileToProcess = await processAudio(file, processingOptions);
                            if (cancelRequestRef.current) return;
                        } catch (conversionError: any) {
                            if (cancelRequestRef.current) return;
                            console.warn(`Audio processing failed for ${file.name}, proceeding with original file. Error:`, conversionError);
                            setStatusMessage(`(File ${i + 1}/${selectedFiles.length}) Audio processing failed, using original file.`);
                            await new Promise(res => setTimeout(res, 1000));
                            fileToProcess = file;
                        }
                    }

                    setProgress(fileProgressStart + fileProgressSpan * 0.2);
                    setStatusMessage(`(File ${i + 1}/${selectedFiles.length}) Sending to Gemini for transcription...`);

                    let intervalId: number | null = null;
                    try {
                        const progressTarget = fileProgressStart + fileProgressSpan * 0.9;
                        intervalId = window.setInterval(() => {
                            if (cancelRequestRef.current) {
                                if (intervalId) clearInterval(intervalId);
                                return;
                            }
                            setProgress(prev => {
                                if (prev >= progressTarget) {
                                    if (intervalId) clearInterval(intervalId);
                                    return prev;
                                }
                                const increment = Math.random() * 2;
                                return Math.min(prev + increment, progressTarget);
                            });
                        }, 400);

                        const result = await transcribeAudio(fileToProcess, selectedModel);
                        if (intervalId) clearInterval(intervalId);
                        if (cancelRequestRef.current) return;

                        setProgress(fileProgressStart + fileProgressSpan * 0.95);
                        setStatusMessage(`(File ${i + 1}/${selectedFiles.length}) Receiving transcription...`);
                        await new Promise(res => setTimeout(res, 200));
                        if (cancelRequestRef.current) return;
                        
                        allContent.push(`--- Start of transcription from ${file.name} ---\n${result}\n--- End of transcription from ${file.name} ---`);
                        setProgress(fileProgressStart + fileProgressSpan);
                    } catch (e) {
                        if (intervalId) clearInterval(intervalId);
                        throw e; // re-throw to be caught by outer catch
                    }
                } else {
                     allContent.push(`--- Skipped unsupported file: ${file.name} (type: ${file.type || 'unknown'}) ---`);
                     setProgress(fileProgressStart + fileProgressSpan);
                }
            }

            setTranscription(allContent.join('\n\n'));
            setProgress(100);
            setStatusMessage('✅ Processing complete!');

        } catch (err) {
            if (cancelRequestRef.current) return;
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setError(errorMessage);
            setProgress(0);
            setStatusMessage('Processing failed!');
        } finally {
            setIsLoading(false);
        }
    }, [selectedFiles, selectedModel, processingOptions]);

    const handleIdentifySpeakers = useCallback(async () => {
        if (!transcription) {
            setDiarizationError("A transcription must exist before identifying speakers.");
            return;
        }

        setIsDiarizing(true);
        cancelRequestRef.current = false;
        setDiarizationError(null);
        setDiarizationProgress(0);

        const intervalId = window.setInterval(() => {
            if (cancelRequestRef.current) {
                clearInterval(intervalId);
                return;
            }
            setDiarizationProgress(prev => Math.min(prev + Math.floor(Math.random() * 5) + 2, 95));
        }, 500);

        try {
            const result = await identifySpeakers(transcription, selectedModel);
            if (cancelRequestRef.current) return;
            setTranscription(result);
        } catch (err) {
            if (cancelRequestRef.current) return;
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setDiarizationError(errorMessage);
        } finally {
            clearInterval(intervalId);
            setIsDiarizing(false);
            setDiarizationProgress(100);
        }

    }, [transcription, selectedModel]);


    const handleGenerateMinutes = useCallback(async (details: MeetingDetails) => {
        if (!transcription) {
            setMinutesError("A transcription must exist before generating minutes.");
            return;
        }

        setIsGeneratingMinutes(true);
        cancelRequestRef.current = false;
        setMeetingMinutesHtml('');
        setMinutesError(null);
        setEditError(null);
        setLastMeetingDetails(details);

        setMinutesGenerationProgress(0);
        setMinutesGenerationStatus('Initializing...');
        const intervalId = window.setInterval(() => {
            if (cancelRequestRef.current) {
                clearInterval(intervalId);
                return;
            }
            setMinutesGenerationProgress(prev => {
                const next = prev + Math.floor(Math.random() * 5) + 2;
                if (next >= 95) {
                    clearInterval(intervalId);
                    return 95;
                }
                if (next < 20) setMinutesGenerationStatus('Sending transcription...');
                else if (next < 70) setMinutesGenerationStatus('Analyzing content...');
                else setMinutesGenerationStatus('Structuring the minutes...');
                return next;
            });
        }, 600);


        try {
            const resultHtml = await generateMeetingMinutes(transcription, details, selectedModel);
            clearInterval(intervalId);
            if (cancelRequestRef.current) return;

            setMinutesGenerationProgress(100);
            setMinutesGenerationStatus('✅ Minutes generated!');
            await new Promise(res => setTimeout(res, 800));

            setMeetingMinutesHtml(resultHtml);

            // Save new session to history
            const extractedTopic = extractTopicFromHtml(resultHtml);
            const sessionTopic = extractedTopic || details.topic || 'Biên bản không có tiêu đề';
            
            const newSession: SavedSession = {
                id: Date.now().toString(),
                createdAt: new Date().toISOString(),
                name: `${new Date().toLocaleDateString()} - ${sessionTopic}`,
                transcription,
                meetingMinutesHtml: resultHtml,
                meetingDetails: details,
            };
            setSavedSessions(prev => [newSession, ...prev]);

        } catch (err) {
            clearInterval(intervalId);
            if (cancelRequestRef.current) return;
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setMinutesError(errorMessage);
        } finally {
            clearInterval(intervalId);
            setIsGeneratingMinutes(false);
        }
    }, [transcription, selectedModel]);

    const handleRequestEdits = useCallback(async (editText: string) => {
        if (!transcription || !meetingMinutesHtml || !lastMeetingDetails) {
            setEditError("Cannot request edits without an existing transcription, generated minutes, and meeting details.");
            return;
        }

        setIsEditingMinutes(true);
        cancelRequestRef.current = false;
        setEditError(null);
        setEditProgress(0);
        setEditStatusMessage('Initializing edit...');

        const intervalId = window.setInterval(() => {
            if (cancelRequestRef.current) {
                clearInterval(intervalId);
                return;
            }
            setEditProgress(prev => {
                const next = prev + Math.floor(Math.random() * 6) + 3;
                if (next >= 95) {
                    clearInterval(intervalId);
                    return 95;
                }
                if (next < 30) setEditStatusMessage('Processing your request...');
                else if (next < 80) setEditStatusMessage('Applying changes...');
                else setEditStatusMessage('Finalizing new version...');
                return next;
            });
        }, 500);


        try {
            const resultHtml = await regenerateMeetingMinutes(transcription, lastMeetingDetails, meetingMinutesHtml, editText, selectedModel);
            clearInterval(intervalId);
            if (cancelRequestRef.current) return;

            setEditProgress(100);
            setEditStatusMessage('✅ Edits applied successfully!');
            await new Promise(res => setTimeout(res, 800));

            setMeetingMinutesHtml(resultHtml);

            // Save edited version as a new session
            const extractedTopic = extractTopicFromHtml(resultHtml);
            const sessionTopic = extractedTopic || lastMeetingDetails.topic || 'Biên bản không có tiêu đề';
            
            const newSession: SavedSession = {
                id: Date.now().toString(),
                createdAt: new Date().toISOString(),
                name: `${new Date().toLocaleDateString()} - ${sessionTopic} (Đã chỉnh sửa)`,
                transcription,
                meetingMinutesHtml: resultHtml,
                meetingDetails: lastMeetingDetails,
            };
            setSavedSessions(prev => [newSession, ...prev]);

        } catch (err) {
            clearInterval(intervalId);
            if (cancelRequestRef.current) return;
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setEditError(errorMessage);
        } finally {
            clearInterval(intervalId);
            setIsEditingMinutes(false);
        }
    }, [transcription, meetingMinutesHtml, selectedModel, lastMeetingDetails]);

    const isBusy = isLoading || isGeneratingMinutes || isEditingMinutes || isDiarizing;

    const TabButton: React.FC<{ tabName: 'file' | 'live' | 'history'; children: React.ReactNode }> = ({ tabName, children }) => (
        <button
            onClick={() => setActiveTab(tabName)}
            disabled={isBusy}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 ${activeTab === tabName ? 'bg-gray-700 text-cyan-400' : 'bg-transparent text-gray-400 hover:bg-gray-700/50 hover:text-white'}`}
        >
            {children}
        </button>
    );

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-2xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                        Gemini Meeting Minutes Assistant
                    </h1>
                    <p className="text-gray-400 mt-2">
                        Transcribe audio or use existing text to generate professional meeting minutes with AI.
                    </p>
                </header>
                
                <main className="space-y-6 bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-2xl border border-gray-700">
                     <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-cyan-400 border-b border-gray-600 pb-2">1. Get Content</h2>
                        <div className="flex border-b border-gray-600 -mt-2">
                           <TabButton tabName="file">From File(s)</TabButton>
                           <TabButton tabName="live">Live Recording</TabButton>
                           <TabButton tabName="history">Biên bản đã lưu</TabButton>
                        </div>
                        <div className="pt-2">
                            {activeTab === 'file' ? (
                                <FileUpload onFileSelect={handleFileSelect} disabled={isBusy} />
                            ) : activeTab === 'live' ? (
                                <LiveTranscription onComplete={handleLiveTranscriptionComplete} disabled={isBusy} />
                            ) : (
                                <SavedSessionsList
                                    sessions={savedSessions}
                                    onLoad={handleLoadSession}
                                    onDelete={handleDeleteSession}
                                    disabled={isBusy}
                                />
                            )}
                        </div>
                    </div>
                    
                    {activeTab === 'file' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h2 className="text-lg font-semibold text-cyan-400 border-b border-gray-600 pb-2">2. Audio Options</h2>
                                    <Options 
                                        disabled={isBusy} 
                                        options={processingOptions}
                                        onOptionChange={setProcessingOptions}
                                    />
                                </div>
                                 <div className="space-y-4">
                                    <h2 className="text-lg font-semibold text-cyan-400 border-b border-gray-600 pb-2">3. Select Model</h2>
                                    <ModelSelector 
                                        initialModel={selectedModel}
                                        onModelChange={setSelectedModel} 
                                        disabled={isBusy}
                                    />
                                </div>
                            </div>
                        
                            <div className="text-center">
                                <button
                                    onClick={handleProcessFile}
                                    disabled={selectedFiles.length === 0 || isBusy}
                                    className="w-full sm:w-auto px-8 py-3 bg-cyan-500 text-white font-bold rounded-lg shadow-lg hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 disabled:scale-100"
                                >
                                    {isLoading ? 'Processing...' : `▶️ Process ${selectedFiles.length} File(s)`}
                                </button>
                                {error && (
                                    <div className="mt-6 mx-auto max-w-lg p-4 bg-red-900/20 border border-red-500/50 rounded-xl text-left">
                                        <div className="flex items-start gap-3">
                                            <div className="text-red-400 text-xl">⚠️</div>
                                            <div className="flex-1">
                                                <h3 className="text-red-400 font-bold text-sm uppercase tracking-wide mb-1">Lỗi Cấu Hình</h3>
                                                <p className="text-white font-medium mb-2">{error}</p>
                                                
                                                {error.includes("API_KEY") && (
                                                    <div className="text-sm text-gray-300 space-y-3 bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                                                        <p className="text-cyan-300 font-semibold">Bạn đang chạy trên Vercel?</p>
                                                        <p>Bạn cần thiết lập biến môi trường trong phần cài đặt của Vercel:</p>
                                                        <ol className="list-decimal list-inside space-y-1 ml-1 text-gray-400 text-xs sm:text-sm">
                                                            <li>Vào <strong>Settings</strong> &rarr; <strong>Environment Variables</strong></li>
                                                            <li>Key: <code className="text-yellow-400 bg-gray-800 px-1 rounded">API_KEY</code></li>
                                                            <li>Value: <em>(Dán khóa API Gemini của bạn)</em></li>
                                                            <li>Nhấn <strong>Save</strong> và <strong>Redeploy</strong> lại dự án.</li>
                                                        </ol>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    
                    {isLoading && (
                        <div className="space-y-4 pt-4 border-t border-gray-700">
                             <h2 className="text-lg font-semibold text-cyan-400">Processing...</h2>
                            <div className="space-y-3">
                                <ProgressBar progress={progress} message={statusMessage} />
                                <div className="text-center">
                                    <button 
                                        onClick={handleCancel}
                                        className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 disabled:bg-gray-500 transition-all"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {!isLoading && transcription && (
                        <>
                            <div className="space-y-4 pt-4 border-t border-gray-700">
                                <h2 className="text-lg font-semibold text-cyan-400">4. Transcription &amp; Speaker Tools</h2>
                                <TranscriptionResult text={transcription} />
                                
                                <div className="p-4 bg-gray-700/50 rounded-lg text-center space-y-4">
                                    <p className="text-sm text-gray-400">Identify different speakers in the transcript and assign names to them.</p>
                                    <button
                                        onClick={handleIdentifySpeakers}
                                        disabled={isBusy}
                                        className="inline-flex items-center gap-x-2 w-full sm:w-auto px-6 py-2 bg-yellow-600 text-white font-bold rounded-lg shadow-lg hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 disabled:scale-100"
                                    >
                                        <UsersIcon className="w-5 h-5" />
                                        {isDiarizing ? 'Identifying Speakers...' : 'Identify Speakers'}
                                    </button>
                                    {isDiarizing && <ProgressBar progress={diarizationProgress} message="Analyzing..." />}
                                    {diarizationError && <p className="text-red-400 mt-2">{diarizationError}</p>}
                                </div>
                                
                                <SpeakerNamer
                                    transcription={transcription}
                                    onUpdateTranscription={setTranscription}
                                    disabled={isBusy}
                                />
                            </div>

                            <div className="space-y-4 pt-4 border-t border-gray-700">
                                <h2 className="text-lg font-semibold text-purple-400">5. Generate Meeting Minutes</h2>
                                {isGeneratingMinutes ? (
                                     <div className="text-center space-y-3 p-4 bg-gray-700/50 rounded-lg">
                                        <ProgressBar progress={minutesGenerationProgress} message={minutesGenerationStatus} />
                                        <button 
                                            onClick={handleCancel}
                                            className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 disabled:bg-gray-500 transition-all"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <MeetingMinutesGenerator 
                                            onSubmit={handleGenerateMinutes} 
                                            disabled={isGeneratingMinutes || isEditingMinutes}
                                            initialDetails={lastMeetingDetails}
                                        />
                                        {minutesError && <p className="text-red-400 mt-2 text-center">{minutesError}</p>}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                    
                    {!isGeneratingMinutes && meetingMinutesHtml && (
                        <>
                            <div className="space-y-4 pt-4 border-t border-gray-700">
                                <h2 className="text-lg font-semibold text-purple-400">6. View &amp; Download Minutes</h2>
                                <MeetingMinutesResult htmlContent={meetingMinutesHtml} />
                            </div>
                    
                            <div className="space-y-4 pt-4 border-t border-gray-700">
                                <h2 className="text-lg font-semibold text-green-400">7. Request Edits</h2>
                                {isEditingMinutes ? (
                                    <div className="text-center space-y-3 p-4 bg-gray-700/50 rounded-lg">
                                        <ProgressBar progress={editProgress} message={editStatusMessage} />
                                        <button 
                                            onClick={handleCancel}
                                            className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition-all"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <EditRequest
                                        onSubmit={handleRequestEdits}
                                        disabled={isEditingMinutes}
                                    />
                                )}
                                {editError && <p className="text-red-400 mt-2 text-center">{editError}</p>}
                            </div>
                        </>
                    )}

                </main>
                 <footer className="text-center mt-8">
                    <a href="https://github.com/google/gemini-api" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-gray-500 hover:text-cyan-400 transition-colors">
                        <GithubIcon className="w-5 h-5 mr-2" />
                        Powered by Google Gemini API
                    </a>
                </footer>
            </div>
        </div>
    );
};

export default App;
