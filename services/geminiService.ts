
import { GoogleGenAI, Modality } from "@google/genai";
import { MeetingDetails } from "../components/MeetingMinutesGenerator";

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // We only need the base64 part of the data URL
            resolve(result.split(',')[1]);
        };
        reader.onerror = error => reject(error);
    });
};

const handleGeminiError = (error: unknown): Error => {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('api key not valid') || message.includes('api_key_invalid')) {
            return new Error("Invalid API Key. Please ensure your API key is correctly configured and enabled.");
        }
        if (message.includes('quota')) {
            return new Error("API quota exceeded. Please check your Google Cloud project billing and quota settings.");
        }
        if (message.includes('request payload size exceeds')) {
            return new Error("The audio file is too large to be processed. Please try a smaller file.");
        }
        if (message.includes('deadline exceeded')) {
            return new Error("The request timed out. This may be due to a large file or slow network. Please try again.");
        }
        if (message.includes('fetch')) {
            return new Error("A network error occurred. Please check your internet connection and try again.");
        }
        // Return a slightly cleaner version of the original error
        return new Error(`An unexpected error occurred: ${error.message}`);
    }
    return new Error("An unknown error occurred.");
};

// Helper to safely get the API Key
export const getApiKey = (): string | undefined => {
    // Strictly use process.env.API_KEY as requested.
    // Note: In Vercel + Vite/Webpack, ensure 'API_KEY' is exposed via define/env config if not using standard prefix.
    // However, this strictly follows the instruction to use process.env.API_KEY.
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        return process.env.API_KEY;
    }
    return undefined;
};

export const transcribeAudio = async (file: File, modelName: string): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("API_KEY is not configured.");
    }

    const ai = new GoogleGenAI({ apiKey });

    try {
        const audioData = await fileToBase64(file);
        
        const audioPart = {
            inlineData: {
                mimeType: file.type,
                data: audioData,
            },
        };

        const textPart = {
            text: "Transcribe this audio file completely and accurately. Provide only the transcribed text as a single block of text."
        };

        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [audioPart, textPart] },
        });
        
        return response.text;
    } catch (error) {
        console.error("Error calling Gemini API for transcription:", error);
        throw handleGeminiError(error);
    }
};

export const identifySpeakers = async (transcription: string, modelName: string): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("API_KEY is not configured.");
    }
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an expert in analyzing conversation transcripts. Your task is to identify the different speakers in the following text.
    
Instruction:
- Read the entire transcript provided below.
- Distinguish between the different people speaking.
- Rewrite the entire transcript, but prefix each person's dialogue with a label like "[NGƯỜI NÓI 1]:", "[NGƯỜI NÓI 2]:", etc.
- IMPORTANT: The label MUST be on the same line as the dialogue it corresponds to.
- Ensure the spoken text itself remains unchanged.
- If the text is not a conversation or you cannot distinguish different speakers, return the original text without any labels.

Here is the transcript:
---
${transcription}
---
`;

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [{ text: prompt }] },
        });
        return response.text;
    } catch (error) {
        console.error("Error calling Gemini API for speaker identification:", error);
        throw handleGeminiError(error);
    }
};


export const generateMeetingMinutes = async (
    transcription: string,
    details: MeetingDetails,
    modelName: string
): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("API_KEY is not configured.");
    }

    const ai = new GoogleGenAI({ apiKey });

    const promptTemplate = `Bạn là thư ký chuyên nghiệp với hơn 10 năm kinh nghiệm trong việc ghi chép và tóm tắt biên bản các cuộc họp nội bộ và cuộc họp với đối tác.
Nhiệm vụ của bạn là tổng hợp nội dung cuộc họp một cách ngắn gọn, chính xác và có thể hành động được.
Chỉ dẫn (Instruction):
Dựa vào nội dung cuộc họp trong file đính kèm hoặc văn bản phía dưới, hãy soạn biên bản cuộc họp theo cấu trúc sau:
A. THÔNG TIN CUỘC HỌP
Thời gian & địa điểm: (Ghi rõ ngày, giờ, địa điểm nếu có)
Thành phần tham dự: (Danh sách hoặc nhóm chức danh tham dự)
Chủ trì: (Tên người chủ trì hoặc điều phối cuộc họp)
Chủ đề / Mục đích cuộc họp: (Tóm tắt mục tiêu chính của cuộc họp)
B. NỘI DUNG CHÍNH
Tổng quan cuộc họp: (Tóm tắt nội dung chính đã được trình bày và thảo luận)
Các ý kiến đóng góp / phản hồi nổi bật: (Ghi tóm tắt từng ý quan trọng, có thể trình bày dạng bullet point)
Các quyết định / kết luận chính: (Liệt kê rõ ràng từng quyết định được thống nhất)
C. KẾ HOẠCH HÀNH ĐỘNG
Mục tiêu sau cuộc họp: (Mục tiêu cụ thể cần đạt được)
Danh sách hành động chi tiết: (Trình bày dạng bảng)
D. KÝ XÁC NHẬN
Thêm mục này vào cuối biên bản. Tạo không gian cho chữ ký và họ tên của "Thư ký cuộc họp" và một khu vực riêng cho "Các thành viên tham dự" ký xác nhận nội dung.
Yêu cầu trình bày:
Dùng ngôn ngữ trang trọng, rõ ràng, dễ đọc.
Tóm tắt ngắn gọn nhưng đầy đủ ý chính.
Không viết lại nguyên văn lời nói — chỉ nêu kết luận và hành động cụ thể.`;
    
    const fullPrompt = `${promptTemplate}

Here is the meeting transcription:
---
${transcription}
---

Here are the specific details provided for the "A. THÔNG TIN CUỘC HỌP" section. Use them, and fill in any blanks from the transcription if possible:
- Thời gian & địa điểm: ${details.timeAndPlace || '(not provided)'}
- Thành phần tham dự: ${details.attendees || '(not provided)'}
- Chủ trì: ${details.chair || '(not provided)'}
- Chủ đề / Mục đích cuộc họp: ${details.topic || '(not provided)'}

Please generate the meeting minutes in a single, complete HTML file format. The HTML should be well-structured and include some basic inline CSS for professional styling and readability (e.g., for headings, tables). Do not include any markdown, backticks, or other text outside of the HTML itself. The entire response must be only the raw HTML code, starting with <!DOCTYPE html>.`;


    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [{ text: fullPrompt }] },
        });
        
        let htmlResponse = response.text;
        // Clean up potential markdown formatting from the response
        if (htmlResponse.startsWith('```html')) {
            htmlResponse = htmlResponse.substring(7);
        }
        if (htmlResponse.endsWith('```')) {
            htmlResponse = htmlResponse.slice(0, -3);
        }

        return htmlResponse.trim();
    } catch (error) {
        console.error("Error calling Gemini API for meeting minutes:", error);
        throw handleGeminiError(error);
    }
};

export const regenerateMeetingMinutes = async (
    transcription: string,
    details: MeetingDetails,
    previousHtml: string,
    editRequest: string,
    modelName: string
): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("API_KEY is not configured.");
    }

    const ai = new GoogleGenAI({ apiKey });

    const promptTemplate = `Bạn là một thư ký chuyên nghiệp, đang hỗ trợ người dùng chỉnh sửa một biên bản cuộc họp đã được tạo trước đó.
Nhiệm vụ của bạn là nhận biên bản cuộc họp hiện tại (dưới dạng HTML), cùng với các yêu cầu chỉnh sửa từ người dùng, và tạo ra một phiên bản HTML mới đã được cập nhật.

Dưới đây là các thông tin bạn cần sử dụng:
1.  **Nội dung cuộc họp gốc (Transcription):** Đây là văn bản gốc để tham chiếu nếu cần.
2.  **Thông tin cuộc họp (Meeting Details):** Các chi tiết ban đầu do người dùng cung cấp.
3.  **Biên bản HTML hiện tại (Current HTML):** Đây là phiên bản bạn cần chỉnh sửa.
4.  **Yêu cầu chỉnh sửa của người dùng (User's Edit Request):** Đây là những thay đổi cụ thể mà người dùng muốn bạn thực hiện.

Chỉ dẫn (Instruction):
-   Đọc kỹ "Yêu cầu chỉnh sửa của người dùng".
-   Áp dụng các thay đổi đó vào "Biên bản HTML hiện tại".
-   Đảm bảo phiên bản mới vẫn giữ nguyên cấu trúc, định dạng chuyên nghiệp và văn phong trang trọng.
-   Chỉ trả về nội dung HTML hoàn chỉnh. Phản hồi của bạn phải bắt đầu bằng \`<!DOCTYPE html>\` và không chứa bất kỳ văn bản, markdown hay giải thích nào khác bên ngoài mã HTML.`;

    const fullPrompt = `${promptTemplate}

---
**1. Nội dung cuộc họp gốc (Transcription):**
${transcription}
---
**2. Thông tin cuộc họp (Meeting Details):**
- Thời gian & địa điểm: ${details.timeAndPlace || '(not provided)'}
- Thành phần tham dự: ${details.attendees || '(not provided)'}
- Chủ trì: ${details.chair || '(not provided)'}
- Chủ đề / Mục đích cuộc họp: ${details.topic || '(not provided)'}
---
**3. Biên bản HTML hiện tại (Current HTML):**
\`\`\`html
${previousHtml}
\`\`\`
---
**4. Yêu cầu chỉnh sửa của người dùng (User's Edit Request):**
${editRequest}
---

Bây giờ, hãy tạo lại toàn bộ tệp HTML đã được chỉnh sửa theo yêu cầu.`;

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [{ text: fullPrompt }] },
        });

        let htmlResponse = response.text;
        // Clean up potential markdown formatting from the response
        if (htmlResponse.startsWith('```html')) {
            htmlResponse = htmlResponse.substring(7);
        }
        if (htmlResponse.endsWith('```')) {
            htmlResponse = htmlResponse.slice(0, -3);
        }

        return htmlResponse.trim();
    } catch (error) {
        console.error("Error calling Gemini API for meeting minutes regeneration:", error);
        throw handleGeminiError(error);
    }
};

export const liveTranscriptionSession = async (callbacks: any) => {
     const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("API_KEY is not configured.");
    }
    const ai = new GoogleGenAI({ apiKey });
    return ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks,
        config: {
             responseModalities: [Modality.AUDIO], 
             inputAudioTranscription: {},
        }
    });
}
