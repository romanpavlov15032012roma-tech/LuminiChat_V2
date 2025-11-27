
import { GoogleGenAI } from "@google/genai";
import { Attachment } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `Ты — Lumina, продвинутый ИИ-ассистент. 
Твои возможности:
1. ГЕНЕРАЦИЯ ВИДЕО: Если пользователь просит "сделай видео", "сгенерируй клип" или описывает сцену для видео — ты МОЖЕШЬ это сделать. Отвечай: "Начинаю генерацию видео..." и описывай, что именно будет в видео.
2. ЗРЕНИЕ: Ты видишь изображения и можешь читать текстовые файлы, которые прикрепляет пользователь. Используй это для ответов.
3. ПОИСК: Ты можешь отвечать на вопросы, используя свои знания.
4. ЭМОЦИИ: Используй эмодзи, чтобы оживить диалог.

Важно: Никогда не говори, что ты не умеешь создавать видео. Просто подтверди запрос, и система передаст его модели Veo.`;

async function generateVideo(prompt: string): Promise<Attachment | null> {
    try {
        console.log("Starting video generation with Veo for prompt:", prompt);
        
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9'
            }
        });

        console.log("Video operation started:", operation);

        // Polling loop with timeout safety
        let attempts = 0;
        while (!operation.done && attempts < 30) { // Max 2.5 mins
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({operation: operation});
            console.log("Checking video status...", operation.metadata?.state);
            attempts++;
        }

        if (!operation.done) throw new Error("Video generation timed out");

        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        
        if (videoUri) {
            // Append key correctly whether the URI already has params or not
            const separator = videoUri.includes('?') ? '&' : '?';
            const fetchUrl = `${videoUri}${separator}key=${process.env.API_KEY}`;
            
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`Failed to download video: ${response.statusText}`);
            
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
        console.error("Video generation failed:", e);
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
    
    // Improved detection logic for Russian and English
    const isVideoRequest = 
        (lowerMsg.includes('видео') || lowerMsg.includes('video') || lowerMsg.includes('клип')) &&
        (lowerMsg.includes('сделай') || lowerMsg.includes('создай') || lowerMsg.includes('сгенерируй') || lowerMsg.includes('нарисуй') || lowerMsg.includes('покажи') || lowerMsg.includes('create') || lowerMsg.includes('generate') || lowerMsg.includes('make'));
    
    // Check for explicit model name request or "veo"
    const explicitRequest = lowerMsg.includes('veo') || lowerMsg.includes('снять видео');

    if (isVideoRequest || explicitRequest) {
        const videoAttachment = await generateVideo(message || "Abstract video");
        if (videoAttachment) {
            return {
                text: "✨ Видео готово! Сгенерировано с помощью Veo 3.",
                attachments: [videoAttachment]
            };
        } else {
            return {
                text: "Извините, произошла ошибка при генерации видео. Попробуйте изменить запрос.",
                attachments: []
            };
        }
    } else {
        // Text/Vision Request
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
        text: "Произошла ошибка при связи с ИИ.",
        attachments: []
    };
  }
};
