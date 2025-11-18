
import { ProcessingOptions } from '../components/Options';

// Fix: Add a global declaration for `webkitAudioContext` to support older browsers.
declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

/**
 * Encodes an AudioBuffer into a WAV file blob.
 * @param buffer The AudioBuffer to encode.
 * @returns A Blob containing the WAV file data.
 */
const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);
    const channels: Float32Array[] = [];
    let i, sample;
    let pos = 0;

    const setUint16 = (data: number) => {
        view.setUint16(pos, data, true);
        pos += 2;
    };
    const setUint32 = (data: number) => {
        view.setUint32(pos, data, true);
        pos += 4;
    };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4);

    for (i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    let offset = 0;
    while (offset < buffer.length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([view], { type: "audio/wav" });
};

/**
 * Processes an audio file based on selected options.
 * @param file The original audio file.
 * @param options The processing options selected by the user.
 * @returns A promise that resolves to the processed WAV file.
 */
export const processAudio = async (file: File, options: ProcessingOptions): Promise<File> => {
    let originalBuffer: AudioBuffer;
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await file.arrayBuffer();
        try {
            originalBuffer = await audioContext.decodeAudioData(arrayBuffer);
        } catch (decodeError) {
            throw new Error("Audio decoding failed. The file may be corrupt or in a format not supported by your browser.");
        }
        
        let processedBuffer = originalBuffer;
        
        const needsProcessing = Object.values(options).some(v => v);
        if (!needsProcessing) return file;

        // Step 1: Resample to 16kHz and convert to mono for consistency.
        const targetSampleRate = 16000;
        const isStandardFormat = processedBuffer.sampleRate === targetSampleRate && processedBuffer.numberOfChannels === 1;
        if (!isStandardFormat) {
            const offlineContext = new OfflineAudioContext(1, originalBuffer.duration * targetSampleRate, targetSampleRate);
            const source = offlineContext.createBufferSource();
            source.buffer = originalBuffer;
            source.connect(offlineContext.destination);
            source.start(0);
            processedBuffer = await offlineContext.startRendering();
        }

        let channelData = processedBuffer.getChannelData(0);

        // Step 2: Remove Silence
        if (options.removeSilence) {
            const silenceThreshold = 0.01; // -40dBFS
            const minSilenceDuration = 0.3; // 300ms
            const paddingDuration = 0.1; // 100ms
            const sampleRate = processedBuffer.sampleRate;
            const minSilenceSamples = Math.floor(minSilenceDuration * sampleRate);
            const paddingSamples = Math.floor(paddingDuration * sampleRate);

            const soundIntervals: { start: number; end: number }[] = [];
            let inSound = false;
            let soundStart = 0;

            for (let i = 0; i < channelData.length; i++) {
                if (!inSound && Math.abs(channelData[i]) > silenceThreshold) {
                    inSound = true;
                    soundStart = i;
                } else if (inSound && Math.abs(channelData[i]) < silenceThreshold) {
                    let silenceEnd = i;
                    while (silenceEnd < channelData.length && Math.abs(channelData[silenceEnd]) < silenceThreshold) {
                        silenceEnd++;
                    }
                    if ((silenceEnd - i) >= minSilenceSamples) {
                        inSound = false;
                        soundIntervals.push({ start: soundStart, end: i });
                    }
                    i = silenceEnd -1;
                }
            }
            if(inSound) soundIntervals.push({ start: soundStart, end: channelData.length });
            
            if (soundIntervals.length > 0) {
                const totalLength = soundIntervals.reduce((sum, interval) => sum + (interval.end - interval.start) + paddingSamples * 2, 0);
                const newBuffer = audioContext.createBuffer(1, totalLength, sampleRate);
                const newChannelData = newBuffer.getChannelData(0);
                let offset = 0;
                soundIntervals.forEach(interval => {
                    const segment = channelData.slice(interval.start, interval.end);
                    newChannelData.set(new Float32Array(paddingSamples), offset);
                    offset += paddingSamples;
                    newChannelData.set(segment, offset);
                    offset += segment.length;
                    newChannelData.set(new Float32Array(paddingSamples), offset);
                    offset += paddingSamples;
                });
                processedBuffer = newBuffer;
                channelData = newChannelData;
            } else {
                 processedBuffer = audioContext.createBuffer(1, 1, sampleRate);
                 channelData = processedBuffer.getChannelData(0);
            }
        }

        // Step 3: Noise Reduction (simple gate)
        if (options.noiseReduction) {
            const noiseThreshold = 0.02; // -34dBFS
            const reductionAmount = 0.2; // Reduce to 20% volume
            for (let i = 0; i < channelData.length; i++) {
                if (Math.abs(channelData[i]) < noiseThreshold) {
                    channelData[i] *= reductionAmount;
                }
            }
        }
        
        // Step 4: Normalize Volume
        if (options.normalizeVolume) {
            const max = channelData.reduce((max, val) => Math.max(max, Math.abs(val)), 0);
            if (max > 0.001) {
                const targetPeak = 0.95; // -0.44 dBFS
                const gainValue = targetPeak / max;
                const normalizeContext = new OfflineAudioContext(1, processedBuffer.length, processedBuffer.sampleRate);
                const source = normalizeContext.createBufferSource();
                source.buffer = processedBuffer;
                const gainNode = normalizeContext.createGain();
                gainNode.gain.setValueAtTime(gainValue, 0);
                source.connect(gainNode);
                gainNode.connect(normalizeContext.destination);
                source.start(0);
                processedBuffer = await normalizeContext.startRendering();
            }
        }

        const wavBlob = audioBufferToWav(processedBuffer);
        const originalFileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const newFileName = `${originalFileName}_processed.wav`;

        return new File([wavBlob], newFileName, { type: 'audio/wav' });

    } catch (error) {
        console.error("Failed to process audio:", error);
        if (error instanceof Error) {
            throw error; // Re-throw specific errors
        }
        throw new Error("An unexpected error occurred during audio pre-processing.");
    }
};
