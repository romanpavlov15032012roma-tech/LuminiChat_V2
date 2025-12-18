
import { GoogleGenAI } from "@google/genai";
import { Attachment } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `Ты — Lumina, продвинутый ИИ-ассистент. 
Твои возможности:
1. 🎨 ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ: Если пользователь просит "нарисуй", "сгенерируй картинку", "сделай фото", "image of" — ты используешь свои встроенные возможности (Imagen).
2. 🎬 ГЕНЕРАЦИЯ ВИДЕО: Если пользователь просит "сделай видео", "сгенерируй клип", "video of" — ты используешь модель Veo.
3. 👀 ЗРЕНИЕ: Ты видишь изображения и можешь читать текстовые файлы.

ВАЖНО: Если ты сгенерировал медиа-файл, не пиши много текста, просто скажи "Вот ваш результат".`;

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
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => resolve(base64Str);
    });
};

async function generateImage(prompt: string): Promise<Attachment | null> {
    const enhancedPrompt = `${prompt}. Cinematic lighting, 8k resolution, highly detailed, photorealistic masterpiece, sharp focus, professional photography, ray tracing, unreal engine 5 render, volumetric fog`;
    console.log("🎨 [Imagen] Generating with prompt:", enhancedPrompt);
    
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-3.0-generate-001',
            prompt: enhancedPrompt,
            config: {
                numberOfImages: 1,
                aspectRatio: '1:1',
                outputMimeType: 'image/jpeg'
            }
        });

        if (response.generatedImages?.[0]?.image?.imageBytes) {
            const rawBase64 = `data:image/jpeg;base64,${response.generatedImages[0].image.imageBytes}`;
            const compressedBase64 = await compressImage(rawBase64);
            return {
                id: Date.now().toString(),
                type: 'image',
                url: compressedBase64,
                name: 'lumina_art.jpg',
                size: '1024x1024'
            };
        }
        throw new Error("Empty image response");
    } catch (e) {
        console.error("❌ [Imagen] Failed, trying fallback:", e);
        try {
            const fallback = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ text: enhancedPrompt }] }
            });
            for (const part of fallback.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                     const base64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                     const compressed = await compressImage(base64);
                     return { id: Date.now().toString(), type: 'image', url: compressed, name: 'flash_art.jpg' };
                }
            }
        } catch (f) { console.error("Fallback failed", f); }
        return null;
    }
}

async function generateVideo(prompt: string): Promise<Attachment | null> {
    console.log("🎬 [Veo] Requesting video for:", prompt);
    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
        });

        const startTime = Date.now();
        const TIMEOUT = 300000; // 5 min
        
        while (!operation.done && (Date.now() - startTime < TIMEOUT)) {
            await new Promise(r => setTimeout(r, 7000));
            try {
                operation = await ai.operations.getVideosOperation({ operation: operation });
                console.log("⏳ [Veo] Status:", operation.metadata?.state);
            } catch (err) {
                console.warn("Veo poll error, retrying...", err);
            }
        }

        if (operation.done && operation.response?.generatedVideos?.[0]?.video?.uri) {
            const uri = operation.response.generatedVideos[0].video.uri;
            const finalUrl = `${uri}${uri.includes('?') ? '&' : '?'}key=${process.env.API_KEY}`;
            
            try {
                const check = await fetch(finalUrl, { method: 'HEAD' });
                if (check.ok) {
                    return { id: Date.now().toString(), type: 'video', url: finalUrl, name: 'veo_video.mp4', size: '720p' };
                }
            } catch (corsErr) {
                return { id: Date.now().toString(), type: 'video', url: finalUrl, name: 'veo_external.mp4', size: 'External Link' };
            }
        }
        return null;
    } catch (e) {
        console.error("❌ [Veo] Error:", e);
        return null;
    }
}

export const sendMessageToGemini = async (
  message: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  attachments: Attachment[] = []
): Promise<{ text: string, attachments: Attachment[] }> => {
  const lowerMsg = message.toLowerCase();
  const isVideo = (lowerMsg.includes('видео') || lowerMsg.includes('video')) && 
                  (lowerMsg.includes('сделай') || lowerMsg.includes('create') || lowerMsg.includes('создай') || lowerMsg.startsWith('video of'));
  
  if (isVideo) {
      const video = await generateVideo(message);
      return video 
        ? { text: video.size === 'External Link' ? "Видео готово! Из-за политики безопасности откройте его по ссылке." : "Ваше видео готово!", attachments: [video] }
        : { text: "Не удалось создать видео. Попробуйте другой запрос.", attachments: [] };
  }

  const isImage = (lowerMsg.includes('нарисуй') || lowerMsg.includes('сгенерируй') || lowerMsg.includes('image') || lowerMsg.includes('фото') || lowerMsg.includes('картинку'));
  if (isImage) {
      const img = await generateImage(message);
      return img ? { text: "Ваше изображение готово в высоком качестве.", attachments: [img] } : { text: "Ошибка при создании изображения.", attachments: [] };
  }

  try {
    const parts: any[] = [{ text: message }];
    attachments.forEach(att => {
        if (att.type === 'image') parts.push({ inlineData: { mimeType: 'image/jpeg', data: att.url.split(',')[1] } });
    });

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [...history, { role: 'user', parts }],
        config: { systemInstruction: SYSTEM_INSTRUCTION }
    });
    return { text: response.text || "...", attachments: [] };
  } catch (error) {
    return { text: "Ошибка ИИ. Попробуйте позже.", attachments: [] };
  }
};
