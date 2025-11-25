import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const sendMessageToGemini = async (
  message: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[]
): Promise<string> => {
  try {
    const model = 'gemini-2.5-flash';
    
    // We construct a chat session for context, although for this simple demo 
    // we could also use generateContent with history prepended.
    // Using generateContent for simplicity with the provided text.
    
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
        systemInstruction: "Ты полезный и дружелюбный ассистент в мессенджере Lumina. Отвечай кратко, по существу, но вежливо. Используй эмодзи.",
      }
    });

    return response.text || "Извините, я не смог сформировать ответ.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Произошла ошибка при связи с ИИ.";
  }
};