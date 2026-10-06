import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { prompt } = await request.json();
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is missing in server environment variables. Please add it to your .env.local file.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Attempt modern models with fallback in case of temporary high demand
    const candidateModels = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
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

    return NextResponse.json({ questions: questionsText });
  } catch (error) {
    console.error('Error generating questions:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate questions' }, { status: 500 });
  }
}
