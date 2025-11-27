
import { GoogleGenAI } from "@google/genai";
import { Attachment } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `Ты полезный и дружелюбный ассистент в мессенджере Lumina. 
Ты умеешь:
1. Отвечать на вопросы кратко и по существу.
2. Поддерживать диалог, используя контекст.
3. Генерировать видео с помощью модели Veo, если пользователь попросит (например: "сгенерируй видео", "создай видео").
4. Использовать эмодзи для придания эмоциональной окраски.
5. Форматировать текст (списки, жирный шрифт).

Твои ограничения:
- Если тебя просят создать видео, просто ответь подтверждением, что ты приступаешь к генерации (код приложения сам обработает запрос к видео-модели).
- Не придумывай функции, которых нет в интерфейсе (например, отправка денег).

Стиль общения: вежливый, современный, иногда с юмором.`;

async function generateVideo(prompt: string): Promise<Attachment | null> {
    try {
        console.log("Starting video generation with Veo...");
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: '16:9'
            }
        });

        // Polling loop
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5s
            operation = await ai.operations.getVideosOperation({operation: operation});
            console.log("Checking video status...");
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
                       name: 'AI Generated Video.mp4',
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
    const isVideoRequest = lowerMsg.includes('сгенерируй видео') || 
                           lowerMsg.includes('создай видео') || 
                           lowerMsg.includes('create video') || 
                           lowerMsg.includes('generate video');

    if (isVideoRequest) {
        // Handle Video Generation
        const videoAttachment = await generateVideo(message);
        if (videoAttachment) {
            return {
                text: "Готово! Вот видео по вашему запросу 🎥",
                attachments: [videoAttachment]
            };
        } else {
            return {
                text: "Извините, не удалось сгенерировать видео. Попробуйте еще раз или уточните запрос.",
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
