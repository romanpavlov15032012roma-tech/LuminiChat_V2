
import { GoogleGenAI } from "@google/genai";
import { Attachment } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `Ты — Lumina, продвинутый ИИ-ассистент. 
Твои возможности:
1. 🎨 ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ: Если пользователь просит "нарисуй", "сгенерируй картинку", "сделай фото" — ты используешь свои встроенные возможности генерации.
2. 🎬 ГЕНЕРАЦИЯ ВИДЕО: Если пользователь просит "сделай видео", "сгенерируй клип", "покажи видео" — ты используешь модель Veo.
3. 👀 ЗРЕНИЕ: Ты видишь изображения и можешь читать текстовые файлы, которые прикрепляет пользователь.
4. ЭМОЦИИ: Используй эмодзи, чтобы оживить диалог.

Важно: Не отказывайся от выполнения творческих задач. Если просят нарисовать или сделать видео — подтверди и приступай.`;

// Helper to compress image to fit Firestore 1MB limit
const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 800; // Resize to max 800px to ensure < 1MB
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
            console.warn("Failed to compress image, using original.");
            resolve(base64Str);
        };
    });
};

async function generateImage(prompt: string): Promise<Attachment | null> {
    try {
        console.log("🎨 Starting image generation with Gemini 2.5 Flash Image for prompt:", prompt);
        
        // Use generateContent for gemini-2.5-flash-image
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: prompt }]
            }
        });

        // The model returns the image in the inlineData of a part
        if (response.candidates && response.candidates.length > 0) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    console.log("✅ Image generated successfully");
                    
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    const rawBase64 = `data:${mimeType};base64,${part.inlineData.data}`;
                    
                    // Compress before returning to ensure it fits in Firestore
                    const compressedBase64 = await compressImage(rawBase64);
                    
                    return {
                        id: Date.now().toString(),
                        type: 'image',
                        url: compressedBase64,
                        name: 'AI_Gen_Image.jpg',
                        size: '800x800'
                    };
                }
            }
        }
        
        console.warn("⚠️ No image data found in response parts");
        return null;
    } catch (e) {
        console.error("❌ Image generation failed:", e);
        return null;
    }
}

async function generateVideo(prompt: string): Promise<Attachment | null> {
    try {
        console.log("🎬 Starting video generation with Veo for prompt:", prompt);
        
        // 1. Initiate Generation
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9'
            }
        });

        console.log("⏳ Video operation started:", operation.name);

        // 2. Polling Loop
        let attempts = 0;
        const maxAttempts = 60; // 10 minutes (60 * 10s)
        let consecutiveErrors = 0;
        
        while (!operation.done && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s between checks
            
            try {
                // Pass operation object as per guidelines
                operation = await ai.operations.getVideosOperation({
                    operation: operation
                });
                consecutiveErrors = 0; // Reset error counter on success
            } catch (pollError) {
                console.warn(`Polling error (attempt ${attempts}):`, pollError);
                consecutiveErrors++;
                if (consecutiveErrors > 3) {
                    throw new Error("Repeated polling failures. Aborting video generation.");
                }
            }
            
            console.log(`Checking video status (${attempts}/${maxAttempts})...`, operation.metadata?.state);
            
            if (operation.error) {
                throw new Error(`Video generation error: ${operation.error.message}`);
            }
            
            attempts++;
        }

        if (!operation.done && operation.metadata?.state !== 'SUCCEEDED') {
            throw new Error("Video generation timed out or did not succeed.");
        }

        // 3. Extract Video URI
        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        
        if (videoUri) {
            console.log("✅ Video generated at URI:", videoUri);
            
            const separator = videoUri.includes('?') ? '&' : '?';
            const fetchUrl = `${videoUri}${separator}key=${process.env.API_KEY}`;
            
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
            
            const blob = await response.blob();
            
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                   resolve({
                       id: Date.now().toString(),
                       type: 'video',
                       url: reader.result as string,
                       name: 'AI_Gen_Veo3.mp4',
                       size: '720p'
                   });
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
        return null;
    } catch (e) {
        console.error("❌ Video generation failed:", e);
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
    
    // 1. Video Detection
    const videoKeywords = ['видео', 'video', 'клип', 'clip', 'фильм', 'movie', 'анимация'];
    const actionKeywords = ['сделай', 'создай', 'сгенерируй', 'покажи', 'create', 'generate', 'make', 'show'];
    
    const isVideoRequest = 
        (videoKeywords.some(k => lowerMsg.includes(k)) && actionKeywords.some(k => lowerMsg.includes(k))) ||
        lowerMsg.includes('veo') || lowerMsg.includes('снять видео');
    
    // 2. Image Detection
    // Expanded keywords for better detection
    const imageKeywords = [
        'нарисуй', 'изобрази', 'сгенерируй фото', 'сгенерируй изображение', 'картинку', 'фото', 
        'draw', 'paint', 'generate image', 'picture of', 'photo of', 'create image', 'make a picture'
    ];
    const isImageRequest = imageKeywords.some(k => lowerMsg.includes(k));

    if (isVideoRequest && message.length > 5) {
        // --- VIDEO PATH ---
        const videoAttachment = await generateVideo(message || "Abstract visualization");
        
        if (videoAttachment) {
            return {
                text: "✨ Видео готово! Я сгенерировала его с помощью модели Veo 3.",
                attachments: [videoAttachment]
            };
        } else {
            return {
                text: "Извините, генерация видео заняла слишком много времени или произошла ошибка. Попробуйте упростить запрос.",
                attachments: []
            };
        }
    } else if (isImageRequest && message.length > 3) {
        // --- IMAGE PATH ---
        const imageAttachment = await generateImage(message);

        if (imageAttachment) {
             return {
                text: "🎨 Вот изображение по вашему запросу.",
                attachments: [imageAttachment]
            };
        } else {
             return {
                text: "Не удалось сгенерировать изображение. Попробуйте изменить описание.",
                attachments: []
            };
        }
    } else {
        // --- TEXT / CHAT PATH ---
        const model = 'gemini-2.5-flash';
        
        const currentParts: any[] = [];
        
        if (message) {
            currentParts.push({ text: message });
        }

        for (const att of attachments) {
            if (att.type === 'image') {
                const base64Data = att.url.split(',')[1]; 
                currentParts.push({ 
                    inlineData: { 
                        mimeType: 'image/jpeg', 
                        data: base64Data 
                    } 
                });
            } else if (att.type === 'file' && att.url.startsWith('data:text')) {
                try {
                     const base64Data = att.url.split(',')[1];
                     const textContent = atob(base64Data);
                     currentParts.push({ text: `[Attached File: ${att.name}]\n${textContent}` });
                } catch (e) {
                    console.warn("Failed to decode text file for AI", e);
                }
            } else if (att.type === 'file' && att.url.startsWith('data:application/pdf')) {
                 const base64Data = att.url.split(',')[1];
                 currentParts.push({ 
                    inlineData: { 
                        mimeType: 'application/pdf', 
                        data: base64Data 
                    } 
                });
            }
        }
        
        if (currentParts.length === 0) {
            return { text: "Пожалуйста, отправьте текст или файл.", attachments: [] };
        }

        const response = await ai.models.generateContent({
          model: model,
          contents: [
            ...history,
            {
              role: 'user',
              parts: currentParts
            }
          ],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
          }
        });

        return {
            text: response.text || "Извините, я не смог сформировать ответ.",
            attachments: []
        };
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
        text: "Произошла ошибка при связи с ИИ. Попробуйте позже.",
        attachments: []
    };
  }
};
