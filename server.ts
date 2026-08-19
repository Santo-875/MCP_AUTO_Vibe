import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Initialize Gemini SDK with User-Agent telemetry
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  // Core Gemini MCQ Solver API Endpoint (used by both web testbench and extension)
  app.post('/api/gemini/solve', async (req, res) => {
    try {
      const { question, options, context, customApiKey, modelName } = req.body;

      if (!question || !Array.isArray(options) || options.length === 0) {
        return res.status(400).json({
          error: 'Invalid request: "question" string and non-empty "options" array are required.',
        });
      }

      // If a custom API key was provided by extension settings, use it, else use server key
      const client = customApiKey
        ? new GoogleGenAI({
            apiKey: customApiKey,
            httpOptions: {
              headers: { 'User-Agent': 'aistudio-build' },
            },
          })
        : ai;

      const model = modelName || 'gemini-3.7-flash';

      const prompt = `You are an expert AI quiz and exam solver. Your task is to select the single most accurate, correct answer for the provided Multiple Choice Question (MCQ).

QUESTION:
${question}

OPTIONS:
${options.map((opt: string, idx: number) => `[Index ${idx}] ${opt}`).join('\n')}

${context ? `ADDITIONAL PAGE CONTEXT:\n${context}\n` : ''}

Instructions:
1. Carefully analyze the question and all options.
2. Select the index (0-based) of the most accurate answer.
3. Provide the exact text of the chosen answer option.
4. Estimate your confidence level from 0.0 to 1.0.
5. Provide a brief 1-sentence rationale.`;

      const response = await client.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          systemInstruction:
            'You are an authoritative MCQ and quiz solver. Always return valid structured JSON adhering strictly to the requested schema. Ensure answer_index is a valid 0-based integer pointing to the chosen option.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer_index: {
                type: Type.INTEGER,
                description: 'The 0-based index of the correct option in the supplied options array.',
              },
              answer: {
                type: Type.STRING,
                description: 'The exact text string of the selected answer option.',
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
            required: ['answer_index', 'answer', 'confidence'],
          },
        },
      });

      const responseText = response.text || '{}';
      let parsed;
      try {
        parsed = JSON.parse(responseText.trim());
      } catch (parseErr) {
        // Fallback extraction if JSON had formatting
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          throw new Error('Failed to parse model JSON output');
        }
      }

      // Validate answer_index boundary
      if (
        typeof parsed.answer_index !== 'number' ||
        parsed.answer_index < 0 ||
        parsed.answer_index >= options.length
      ) {
        // Safe fallback: match by string or default to 0
        const matchedIdx = options.findIndex((opt: string) =>
          parsed.answer ? opt.toLowerCase().includes(parsed.answer.toLowerCase()) : false
        );
        parsed.answer_index = matchedIdx >= 0 ? matchedIdx : 0;
        parsed.answer = options[parsed.answer_index];
      }

      return res.json({
        success: true,
        answer_index: parsed.answer_index,
        answer: parsed.answer || options[parsed.answer_index],
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

  // Vite middleware setup
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
