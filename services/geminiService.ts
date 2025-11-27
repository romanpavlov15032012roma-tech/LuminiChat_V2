
import { GoogleGenAI } from "@google/genai";
import { Attachment } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `Ты полезный и дружелюбный ассистент в мессенджере Lumina. 
Ты умеешь:
1. Отвечать на вопросы кратко и по существу.
2. Поддерживать диалог, используя контекст.
3. Генерировать видео с помощью модели Veo 3. Если пользователь пишет "сделай видео", "сгенерируй видео" или описывает сцену для видео, ты должен подтвердить это.
4. Использовать эмодзи для придания эмоциональной окраски.
5. Форматировать текст (списки, жирный шрифт).

Твои ограничения:
- Если запрос касается создания видео, отвечай в духе: "Конечно, начинаю генерацию видео..." (приложение само перехватит этот запрос и отправит его в модель Veo).
- Не говори, что ты не умеешь генерировать видео. Ты умеешь.

Стиль общения: вежливый, современный, иногда с юмором.`;

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

        // Polling loop
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5s
            operation = await ai.operations.getVideosOperation({operation: operation});
            console.log("Checking video status...", operation.metadata?.state);
        }

        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        
        if (videoUri) {
            // Fetch the actual video bytes using the URI and API Key
            const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
            if (!response.ok) throw new Error("Failed to download generated video");
            
            const blob = await response.blob();
            
            // Convert to base64/dataURL for storage in our app's attachment format
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
  history: { role: 'user' | 'model'; parts: { text: string }[] }[]
): Promise<{ text: string, attachments: Attachment[] }> => {
  try {
    const lowerMsg = message.toLowerCase();
    
    // Improved detection logic
    const videoKeywords = ['видео', 'video', 'клип', 'ролик'];
    const actionKeywords = ['сгенерируй', 'создай', 'сделай', 'generate', 'create', 'make', 'покажи'];
    
    const hasVideoKeyword = videoKeywords.some(k => lowerMsg.includes(k));
    const hasActionKeyword = actionKeywords.some(k => lowerMsg.includes(k));
    
    // Check for specific phrases or combination
    const isVideoRequest = (hasVideoKeyword && hasActionKeyword) || 
                           lowerMsg.includes('veo') || 
                           lowerMsg.includes('снять видео');

    if (isVideoRequest) {
        // Handle Video Generation
        const videoAttachment = await generateVideo(message);
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
        // Handle Text Generation
        const model = 'gemini-2.5-flash';
        
        const response = await ai.models.generateContent({
          model: model,
          contents: [
            ...history,
            {
              role: 'user',
              parts: [{ text: message }]
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
