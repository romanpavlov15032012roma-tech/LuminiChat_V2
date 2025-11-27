import { GoogleGenAI } from "@google/genai";
import { Attachment } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `Ты — Lumina, продвинутый ИИ-ассистент. 
Твои возможности:
1. 🎨 ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ: Если пользователь просит "нарисуй", "сгенерируй картинку", "сделай фото", "image of" — ты используешь свои встроенные возможности (Imagen).
2. 🎬 ГЕНЕРАЦИЯ ВИДЕО: Если пользователь просит "сделай видео", "сгенерируй клип", "video of" — ты используешь модель Veo.
3. 👀 ЗРЕНИЕ: Ты видишь изображения и можешь читать текстовые файлы.

ВАЖНО: Если ты сгенерировал медиа-файл, не пиши много текста, просто скажи "Вот ваш результат".`;

// Helper to compress image to fit Firestore 1MB limit
const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 1024; 
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
                // Compress to JPEG with 0.85 quality (High Quality)
                resolve(canvas.toDataURL('image/jpeg', 0.85));
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
    // Enhance prompt for better quality as requested
    const enhancedPrompt = `${prompt}, cinematic lighting, 8k resolution, photorealistic, highly detailed, masterpiece, sharp focus, vibrant colors, professional photography`;
    console.log("🎨 [Imagen] Starting generation for:", enhancedPrompt);
    
    try {
        // Attempt 1: Imagen 3 (Best Quality)
        const response = await ai.models.generateImages({
            model: 'imagen-3.0-generate-001',
            prompt: enhancedPrompt,
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
        
        // Attempt 2: Fallback to Gemini 2.5 Flash Image (General Generation)
        try {
            console.log("🎨 [Fallback] Trying Gemini 2.5 Flash Image...");
            // gemini-2.5-flash-image supports generation via prompt
            const fallbackResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ text: enhancedPrompt }] }
            });

            // Iterate parts to find inline data
            for (const part of fallbackResponse.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                     const base64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                     const compressed = await compressImage(base64);
                     return {
                        id: Date.now().toString(),
                        type: 'image',
                        url: compressed,
                        name: 'generated_image_flash.jpg',
                        size: 'Flash'
                     };
                }
            }
        } catch (flashError) {
             console.error("❌ [Fallback Flash] Failed:", flashError);
        }

        // Attempt 3: SVG Fallback (Last Resort)
        try {
            console.log("🎨 [Fallback SVG] Trying SVG generation...");
            const svgResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Generate a simplified SVG code for an image representing: ${prompt}. Only return the SVG code, nothing else.`,
            });
            
            const text = svgResponse.text;
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
        } catch (svgError) {
             console.error("❌ [Fallback SVG] Failed:", svgError);
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
        let consecutiveErrors = 0;
        
        while (Date.now() - startTime < TIMEOUT_MS) {
            await new Promise(r => setTimeout(r, 10000)); // 10s wait

            try {
                // Pass the operation object itself to update status
                operation = await ai.operations.getVideosOperation({
                    operation: operation
                });
                consecutiveErrors = 0; // Reset on success
            } catch (pollError) {
                console.warn("Polling warning:", pollError);
                consecutiveErrors++;
                // Increased tolerance for network flakes
                if (consecutiveErrors >= 5) throw new Error("Connection unstable, stopped polling.");
                continue;
            }

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

        const separator = videoUri.includes('?') ? '&' : '?';
        const fetchUrl = `${videoUri}${separator}key=${process.env.API_KEY}`;

        console.log("✅ [Veo] Video URI:", videoUri);

        // 4. Download (Try Fetch, fallback to Link)
        try {
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
            
            // Return special attachment that ChatWindow will render as a link button
            return {
                id: Date.now().toString(),
                type: 'video', // keep type video
                url: fetchUrl, // External URL
                name: 'veo_link_video.mp4',
                size: 'External Link'
            };
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
    // Expanded keywords to catch "video of..." without explicitly saying "create"
    const isVideo = (lowerMsg.includes('видео') || lowerMsg.includes('video')) && 
                    (lowerMsg.includes('создай') || lowerMsg.includes('сделай') || lowerMsg.includes('create') || lowerMsg.includes('generate') || lowerMsg.startsWith('video of') || lowerMsg.startsWith('видео '));
    
    // Image detection
    const isImage = (lowerMsg.includes('нарисуй') || lowerMsg.includes('фото') || lowerMsg.includes('изображение') || lowerMsg.includes('image') || lowerMsg.includes('draw') || lowerMsg.includes('picture') || lowerMsg.includes('paint')) &&
                    !isVideo;

    if (isVideo) {
        try {
            const video = await generateVideo(message);
            if (video) {
                // Check if it's a link (fallback) or a blob
                const isLink = video.url.startsWith('http');
                const msgText = isLink 
                    ? "Видео сгенерировано! К сожалению, из-за настроек безопасности браузера его нельзя показать прямо здесь, но вы можете открыть его по ссылке." 
                    : "Видео готово! (Veo 3.1)";
                return { text: msgText, attachments: [video] };
            } else {
                return { text: "Не удалось сгенерировать видео. Сервис временно недоступен или перегружен.", attachments: [] };
            }
        } catch (videoError) {
            console.error("Video generation failed logic", videoError);
            return { text: "Произошла ошибка при генерации видео.", attachments: [] };
        }
    }

    if (isImage) {
        const image = await generateImage(message);
        if (image) {
            return { text: "Ваше изображение готово (Enhanced Quality).", attachments: [image] };
        } else {
            return { text: "Не удалось сгенерировать изображение.", attachments: [] };
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