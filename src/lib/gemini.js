import { GoogleGenAI } from '@google/genai';

export async function generateGeminiContent(prompt) {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_GEMINI_API_KEY is missing in environment variables. Please add it to your .env.local file to use the AI generator.');
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Prioritized list of active, supported Gemini models
  const candidateModels = [
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite'
  ];

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

  // Dynamic fallback: If hardcoded candidate models fail, query available models for this API key
  if (!questionsText) {
    try {
      const modelList = await ai.models.list();
      for await (const m of modelList) {
        const cleanName = m.name ? m.name.replace(/^models\//, '') : '';
        if (!cleanName || candidateModels.includes(cleanName)) continue;
        
        if (cleanName.includes('flash') || cleanName.includes('lite') || cleanName.includes('pro')) {
          try {
            const fallbackRes = await ai.models.generateContent({
              model: cleanName,
              contents: prompt,
              config: {
                responseMimeType: 'application/json'
              }
            });
            if (fallbackRes && fallbackRes.text) {
              questionsText = fallbackRes.text;
              break;
            }
          } catch (innerErr) {
            console.warn(`Dynamic model ${cleanName} failed:`, innerErr.message);
          }
        }
      }
    } catch (listErr) {
      console.warn('Failed to dynamically query models list:', listErr.message);
    }
  }

  if (!questionsText) {
    throw lastError || new Error('Failed to generate questions with available Gemini models.');
  }

  return questionsText;
}
