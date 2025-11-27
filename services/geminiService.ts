import { GoogleGenAI } from "@google/genai";
import { Attachment } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `Ты — Lumina, продвинутый ИИ-ассистент. 
Твои возможности:
1. ГЕНЕРАЦИЯ ВИДЕО: Если пользователь просит "сделай видео", "сгенерируй клип", "покажи видео" или описывает сцену для видео — ты МОЖЕШЬ это сделать. Просто ответь текстом, описывающим результат, и система автоматически прикрепит сгенерированное видео.
2. ЗРЕНИЕ: Ты видишь изображения и можешь читать текстовые файлы, которые прикрепляет пользователь. Используй это для ответов.
3. ПОИСК: Ты можешь отвечать на вопросы, используя свои знания.
4. ЭМОЦИИ: Используй эмодзи, чтобы оживить диалог.

Важно: Никогда не говори, что ты не умеешь создавать видео. Просто подтверди запрос (например, "Генерирую видео по вашему запросу..."), и система передаст его модели Veo.`;

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
        // We iterate for up to ~120 seconds (24 * 5s). Veo Fast is usually 10-20s, but can spike.
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max
        
        while (!operation.done && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Critical: Refresh the operation status using its name
            operation = await ai.operations.getVideosOperation({
                operation: operation
            });
            
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
            
            // Append key correctly for download
            const separator = videoUri.includes('?') ? '&' : '?';
            const fetchUrl = `${videoUri}${separator}key=${process.env.API_KEY}`;
            
            // 4. Download Video (Proxy via fetch to get Blob)
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
            
            const blob = await response.blob();
            
            // 5. Convert to Base64/DataURL for frontend display
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
    
    // Improved detection logic for Video requests
    const videoKeywords = ['видео', 'video', 'клип', 'clip', 'фильм', 'movie', 'анимация'];
    const actionKeywords = ['сделай', 'создай', 'сгенерируй', 'нарисуй', 'покажи', 'create', 'generate', 'make', 'show'];
    
    const isVideoRequest = 
        videoKeywords.some(k => lowerMsg.includes(k)) && 
        actionKeywords.some(k => lowerMsg.includes(k));
    
    const explicitRequest = lowerMsg.includes('veo') || lowerMsg.includes('снять видео');

    if ((isVideoRequest || explicitRequest) && message.length > 5) {
        // VIDEO PATH
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
    } else {
        // TEXT / IMAGE PATH
        const model = 'gemini-2.5-flash';
        
        // Prepare content parts (Text + Images/Files)
        const currentParts: any[] = [];
        
        if (message) {
            currentParts.push({ text: message });
        }

        for (const att of attachments) {
            if (att.type === 'image') {
                // Remove data:image/xxx;base64, prefix for API
                const base64Data = att.url.split(',')[1]; 
                currentParts.push({ 
                    inlineData: { 
                        mimeType: 'image/jpeg', 
                        data: base64Data 
                    } 
                });
            } else if (att.type === 'file' && att.url.startsWith('data:text')) {
                // For text files, we decode and pass as text
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
        
        // If we have attachments but no text, ensure we send something
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