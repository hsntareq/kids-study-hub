import { GoogleGenAI } from '@google/genai';

export async function generateGeminiContent(prompt) {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_GEMINI_API_KEY is missing in environment variables. Please add it to your .env.local file to use the AI generator.');
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  let lastError = null;
  let questionsText = null;

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
      if (response && response.text) {
        questionsText = response.text;
        break;
      }
    } catch (err) {
      console.warn(`Model ${model} failed, attempting fallback:`, err.message);
      lastError = err;
    }
  }

  if (!questionsText) {
    throw lastError || new Error('Failed to generate questions with available models.');
  }

  return questionsText;
}
