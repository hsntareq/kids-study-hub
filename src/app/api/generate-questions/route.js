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
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return NextResponse.json({ questions: response.text });
  } catch (error) {
    console.error('Error generating questions:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate questions' }, { status: 500 });
  }
}
