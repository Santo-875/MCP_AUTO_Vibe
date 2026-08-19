import { SolveResponse } from '../types';

export async function solveMcqWithGemini(
  question: string,
  options: string[],
  context?: string,
  customApiKey?: string,
  modelName?: string
): Promise<SolveResponse> {
  try {
    const response = await fetch('/api/gemini/solve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        options,
        context,
        customApiKey,
        modelName: modelName || 'gemini-3.7-flash',
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server returned HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error('solveMcqWithGemini failed:', error);
    return {
      success: false,
      answer_index: 0,
      answer: options[0] || '',
      confidence: 0,
      error: error.message || 'Failed to reach Gemini solver endpoint.',
    };
  }
}
