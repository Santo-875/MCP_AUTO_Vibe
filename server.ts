import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

let filenameStr = '';
try {
  filenameStr = fileURLToPath(import.meta.url);
} catch (e) {
  filenameStr = typeof __filename !== 'undefined' ? __filename : '';
}
const __filenamePath = filenameStr;
const __dirnamePath = path.dirname(__filenamePath || process.cwd());

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/gemini/solve', async (req, res) => {
    try {
      const { question, options = [], context, customApiKey, modelName, questionType = 'RADIO' } = req.body;

      if (!question) {
        return res.status(400).json({
          error: 'Invalid request: "question" string is required.',
        });
      }

      const client = customApiKey
        ? new GoogleGenAI({
            apiKey: customApiKey,
            httpOptions: {
              headers: { 'User-Agent': 'aistudio-build' },
            },
          })
        : ai;

      const model = modelName || 'gemini-3.7-flash';

      const prompt = `You are an expert AI quiz and exam solver. Your task is to accurately solve this question.

Question Type: ${questionType}
QUESTION:
${question}

${options && options.length > 0 ? `OPTIONS:\n${options.map((opt: string, idx: number) => `[Index ${idx}] ${opt}`).join('\n')}` : ''}

${context ? `ADDITIONAL PAGE CONTEXT:\n${context}\n` : ''}

Instructions:
1. Identify the single best option or text answer based on Question Type (${questionType}).
2. Provide the exact text of the answer.
3. Estimate your confidence level from 0.0 to 1.0.
4. Provide a brief 1-sentence rationale.`;

      const response = await client.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          systemInstruction:
            'You are an authoritative MCQ and quiz solver. Always return valid structured JSON adhering strictly to the requested schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer_index: {
                type: Type.INTEGER,
                description: 'The 0-based index of the correct option if options exist.',
              },
              answer: {
                type: Type.STRING,
                description: 'The exact text string of the selected answer option or filled response.',
              },
              confidence: {
                type: Type.NUMBER,
                description: 'Confidence score between 0.0 and 1.0.',
              },
              rationale: {
                type: Type.STRING,
                description: 'A brief explanation of why this answer is correct.',
              },
            },
            required: ['answer', 'confidence'],
          },
        },
      });

      const responseText = response.text || '{}';
      let parsed;
      try {
        parsed = JSON.parse(responseText.trim());
      } catch (parseErr) {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          throw new Error('Failed to parse model JSON output');
        }
      }

      if (
        options && options.length > 0 &&
        (typeof parsed.answer_index !== 'number' ||
          parsed.answer_index < 0 ||
          parsed.answer_index >= options.length)
      ) {
        const matchedIdx = options.findIndex((opt: string) =>
          parsed.answer ? opt.toLowerCase().includes(parsed.answer.toLowerCase()) : false
        );
        parsed.answer_index = matchedIdx >= 0 ? matchedIdx : 0;
        parsed.answer = options[parsed.answer_index] || parsed.answer;
      }

      return res.json({
        success: true,
        answer_index: parsed.answer_index ?? 0,
        answer: parsed.answer,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
        rationale: parsed.rationale || 'Selected based on domain knowledge.',
        modelUsed: model,
      });
    } catch (error: any) {
      console.error('Error solving MCQ with Gemini:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error while evaluating question with Gemini.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gemini MCQ Extension Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
