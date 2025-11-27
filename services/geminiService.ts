
import { GoogleGenAI } from "@google/genai";
import { Attachment } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `Ты — Lumina, продвинутый ИИ-ассистент. 
Твои возможности:
1. 🎨 ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ: Если пользователь просит "нарисуй", "сгенерируй картинку", "сделай фото" — ты используешь свои встроенные возможности (Imagen).
2. 🎬 ГЕНЕРАЦИЯ ВИДЕО: Если пользователь просит "сделай видео", "сгенерируй клип" — ты используешь модель Veo.
3. 👀 ЗРЕНИЕ: Ты видишь изображения и можешь читать текстовые файлы.

ВАЖНО: Если ты сгенерировал медиа-файл, не пиши много текста, просто скажи "Вот ваш результат".`;

// Helper to compress image to fit Firestore 1MB limit
const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 800; 
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                // Compress to JPEG with 0.6 quality
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => {
            resolve(base64Str);
        };
    });
};

async function generateImage(prompt: string): Promise<Attachment | null> {
    console.log("🎨 [Imagen] Starting generation for:", prompt);
    try {
        // Attempt 1: Imagen 3 (Best Quality)
        const response = await ai.models.generateImages({
            model: 'imagen-3.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                aspectRatio: '1:1',
                outputMimeType: 'image/jpeg'
            }
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
            const imageBytes = response.generatedImages[0].image.imageBytes;
            if (imageBytes) {
                const rawBase64 = `data:image/jpeg;base64,${imageBytes}`;
                const compressedBase64 = await compressImage(rawBase64);
                console.log("✅ [Imagen] Success");
                return {
                    id: Date.now().toString(),
                    type: 'image',
                    url: compressedBase64,
                    name: 'generated_art.jpg',
                    size: '1024x1024'
                };
            }
        }
        
        throw new Error("No image data returned from Imagen");

    } catch (e) {
        console.error("❌ [Imagen] Failed:", e);
        
        // Attempt 2: Fallback to Gemini 2.5 Flash Image (General Purpose)
        try {
            console.log("🎨 [Fallback] Trying Gemini 2.5 Flash...");
            const fallbackResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash', // Using text model to ask for SVG as last resort or description
                contents: `Generate a simplified SVG code for an image representing: ${prompt}. Only return the SVG code, nothing else.`,
            });
            
            const text = fallbackResponse.text;
            if (text && text.includes('<svg')) {
                 const svgContent = text.substring(text.indexOf('<svg'), text.lastIndexOf('</svg>') + 6);
                 const base64Svg = `data:image/svg+xml;base64,${btoa(svgContent)}`;
                 return {
                    id: Date.now().toString(),
                    type: 'image',
                    url: base64Svg,
                    name: 'generated_vector.svg',
                    size: 'SVG'
                 };
            }
        } catch (fallbackError) {
             console.error("❌ [Fallback] Failed also:", fallbackError);
        }

        return null;
    }
}

async function generateVideo(prompt: string): Promise<Attachment | null> {
    console.log("🎬 [Veo] Starting generation for:", prompt);
    try {
        // 1. Start Generation
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9'
            }
        });

        console.log("⏳ [Veo] Operation started:", operation.name);

        // 2. Poll for completion
        const startTime = Date.now();
        const TIMEOUT_MS = 600000; // 10 minutes
        
        while (Date.now() - startTime < TIMEOUT_MS) {
            await new Promise(r => setTimeout(r, 10000)); // 10s wait

            // IMPORTANT: Pass the operation object directly as required by the SDK
            operation = await ai.operations.getVideosOperation({
                operation: operation
            });

            console.log(`⏳ [Veo] Status: ${operation.metadata?.state}`);

            if (operation.done) {
                break;
            }
        }

        if (!operation.done) {
            throw new Error("Video generation timed out.");
        }

        if (operation.error) {
             throw new Error(`Veo API Error: ${operation.error.message}`);
        }

        // 3. Retrieve Result
        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!videoUri) throw new Error("No video URI in response");

        console.log("✅ [Veo] Video URI:", videoUri);

        // 4. Download (Try Fetch, fallback to Link)
        try {
            const separator = videoUri.includes('?') ? '&' : '?';
            const fetchUrl = `${videoUri}${separator}key=${process.env.API_KEY}`;
            
            const res = await fetch(fetchUrl);
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            
            const blob = await res.blob();
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });

            return {
                id: Date.now().toString(),
                type: 'video',
                url: base64,
                name: 'veo_video.mp4',
                size: '720p'
            };

        } catch (downloadError) {
            console.warn("⚠️ [Veo] Direct download failed (CORS likely). Returning link.", downloadError);
            // If download fails (CORS), return a dummy video object that acts as a link
            // Note: Since we can't display it in <video> tag if CORS blocks it, 
            // the UI might need to handle this. For now, we try to pass the URI.
            // But standard <video src="googleapis..."> won't play without auth.
            // We'll return null to fail gracefully for now, or the user sees an error.
            return null;
        }

    } catch (e) {
        console.error("❌ [Veo] Critical Error:", e);
        return null;
    }
}

export const sendMessageToGemini = async (
  message: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  attachments: Attachment[] = []
): Promise<{ text: string, attachments: Attachment[] }> => {
  try {
    const lowerMsg = message.toLowerCase();
    
    // Strict Intent Detection
    const isVideo = (lowerMsg.includes('видео') || lowerMsg.includes('video')) && 
                    (lowerMsg.includes('создай') || lowerMsg.includes('сделай') || lowerMsg.includes('create') || lowerMsg.includes('generate'));
    
    const isImage = (lowerMsg.includes('нарисуй') || lowerMsg.includes('фото') || lowerMsg.includes('изображение') || lowerMsg.includes('image') || lowerMsg.includes('draw')) &&
                    !isVideo;

    if (isVideo) {
        const video = await generateVideo(message);
        if (video) {
            return { text: "Видео готово! (Veo 3.1)", attachments: [video] };
        } else {
            return { text: "Не удалось скачать видео из-за ограничений браузера, но генерация была запущена. Попробуйте позже.", attachments: [] };
        }
    }

    if (isImage) {
        const image = await generateImage(message);
        if (image) {
            return { text: "Ваше изображение готово (Imagen 3).", attachments: [image] };
        } else {
            return { text: "Не удалось сгенерировать изображение. Возможно, сервис перегружен.", attachments: [] };
        }
    }

    // Default Chat
    const parts: any[] = [{ text: message }];
    
    // Handle attachments for Vision
    attachments.forEach(att => {
        if (att.type === 'image') {
            const base64 = att.url.split(',')[1];
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
        } else if (att.type === 'file' && att.url.startsWith('data:text')) {
             try {
                 const content = atob(att.url.split(',')[1]);
                 parts.push({ text: `\n[File Content: ${att.name}]\n${content}` });
             } catch(e) {}
        }
    });

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [...history, { role: 'user', parts: parts }],
        config: { systemInstruction: SYSTEM_INSTRUCTION }
    });

    return {
        text: response.text || "...",
        attachments: []
    };

  } catch (error) {
    console.error("API Error:", error);
    return { text: "Ошибка соединения с ИИ.", attachments: [] };
  }
};
