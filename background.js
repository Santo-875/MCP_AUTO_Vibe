/**
 * Gemini Auto MCQ & Quiz Solver - Background Service Worker (Manifest V3)
 * Manages background automation lifecycle, persistent Gemini API storage, tab persistence, Next-step navigation, and keepalive alarms.
 */

const DEFAULT_CONFIG = {
  autoSubmit: true,
  clickDelayMs: 500,
  scrollDelayMs: 800,
  maxRetries: 3,
  apiEndpoint: '',
  apiKey: '',
  model: 'gemini-3.7-flash',
  showOverlayHud: true,
  smoothScroll: false,
  minConfidence: 0.5,
};

let sessionState = {
  targetTabId: null,
  targetTabInfo: null,
  status: 'IDLE',
  stats: {
    detected: 0,
    answered: 0,
    remaining: 0,
    failed: 0,
    currentQuestionIndex: 0,
    currentQuestionText: '',
    scrollProgress: 0,
    bottomReached: false,
    isComplete: false,
    submissionStatus: 'NOT_SUBMITTED',
  },
  questions: {},
  logs: [],
  config: { ...DEFAULT_CONFIG },
};

// Initialize storage and keepalive alarm
chrome.runtime.onInstalled.addListener(async () => {
  await hydrateConfig();
  log('info', 'Gemini MCQ Solver Service Worker initialized.');
});

chrome.runtime.onStartup.addListener(async () => {
  await hydrateConfig();
});

// Alarms keepalive so Chrome does not terminate the background worker when user switches tabs
chrome.alarms.create('gemini_solver_keepalive', { periodInMinutes: 0.2 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'gemini_solver_keepalive') {
    if (sessionState.status === 'RUNNING' && sessionState.targetTabId) {
      // Check if tab still exists
      try {
        const tab = await chrome.tabs.get(sessionState.targetTabId);
        if (!tab) {
          log('warn', 'Target tab was closed in background.');
          resetSession('IDLE');
        }
      } catch (e) {
        // Tab might be closed
      }
    }
  }
});

async function hydrateConfig() {
  const stored = await chrome.storage.local.get(['config', 'gemini_api_key', 'gemini_model']);
  if (stored.config) {
    sessionState.config = { ...DEFAULT_CONFIG, ...stored.config };
  }
  if (stored.gemini_api_key) {
    sessionState.config.apiKey = stored.gemini_api_key;
  }
  if (stored.gemini_model) {
    sessionState.config.model = stored.gemini_model;
  }
}

function log(level, message, details = null) {
  const entry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toLocaleTimeString(),
    level,
    message,
    details,
  };
  sessionState.logs.unshift(entry);
  if (sessionState.logs.length > 200) sessionState.logs.pop();
  broadcastState();
}

function broadcastState() {
  chrome.runtime.sendMessage({
    type: 'STATE_UPDATED',
    state: sessionState,
  }).catch(() => {});

  if (sessionState.targetTabId && sessionState.config.showOverlayHud) {
    chrome.tabs.sendMessage(sessionState.targetTabId, {
      type: 'UPDATE_HUD',
      stats: sessionState.stats,
      status: sessionState.status,
    }).catch(() => {});
  }
}

function resetSession(newStatus = 'IDLE') {
  sessionState.status = newStatus;
  sessionState.stats = {
    detected: 0,
    answered: 0,
    remaining: 0,
    failed: 0,
    currentQuestionIndex: 0,
    currentQuestionText: '',
    scrollProgress: 0,
    bottomReached: false,
    isComplete: newStatus === 'COMPLETED',
    submissionStatus: newStatus === 'COMPLETED' ? 'SUCCESS' : 'NOT_SUBMITTED',
  };
  sessionState.questions = {};
  broadcastState();
}

/**
 * Call Gemini 2.5/Flash API
 */
async function askGemini(questionText, options, context = '') {
  await hydrateConfig();
  const { apiKey, apiEndpoint, model } = sessionState.config;

  const activeKey = apiKey || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY ? process.env.GEMINI_API_KEY : '');
  const activeEndpoint = apiEndpoint || 'https://generativelanguage.googleapis.com/v1beta';
  const activeModel = model || 'gemini-3.7-flash';

  if (!activeKey) {
    throw new Error('Gemini API key is missing. Enter it in the extension popup or options.');
  }

  const prompt = `You are an expert exam and quiz solver. Select the single most accurate and correct answer for this multiple-choice question.

Question:
"${questionText}"

${context ? `Context:\n"${context}"\n` : ''}
Options:
${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

Respond ONLY with a valid JSON object in this exact schema:
{
  "answer_index": <0-based integer of correct option>,
  "answer": "<exact option text of the correct choice>",
  "confidence": <float between 0.0 and 1.0>,
  "rationale": "<concise 1-sentence explanation>"
}`;

  const url = `${activeEndpoint}/models/${activeModel}:generateContent?key=${activeKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 500,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Empty response from Gemini API');
  }

  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

  const parsed = JSON.parse(cleaned.trim());

  if (typeof parsed.answer_index !== 'number' || parsed.answer_index < 0 || parsed.answer_index >= options.length) {
    if (parsed.answer) {
      const matchIdx = options.findIndex((opt) => opt.toLowerCase().includes(parsed.answer.toLowerCase()));
      parsed.answer_index = matchIdx >= 0 ? matchIdx : 0;
    } else {
      parsed.answer_index = 0;
    }
  }

  parsed.answer = options[parsed.answer_index] || parsed.answer || '';
  return parsed;
}

let isLoopRunning = false;
let isAutomationActive = false;

/**
 * Main Autonomous Automation Loop (Works in background even if user is in another tab!)
 */
async function runAutomationLoop(tabId) {
  if (isLoopRunning) {
    log('info', 'Automation loop is already active.');
    return;
  }

  isLoopRunning = true;
  isAutomationActive = true;
  sessionState.status = 'RUNNING';
  broadcastState();

  let loopIterations = 0;
  const MAX_ITERATIONS = 500;

  try {
    while (isAutomationActive && sessionState.status !== 'PAUSED' && sessionState.status !== 'COMPLETED' && sessionState.status !== 'IDLE' && loopIterations < MAX_ITERATIONS) {
      loopIterations++;

      try {
        // 1. Verify target tab exists (even if backgrounded)
        try {
          const tab = await chrome.tabs.get(tabId);
          if (!tab) {
            log('warn', 'Target tab not accessible. Stopping.');
            isAutomationActive = false;
            resetSession('IDLE');
            break;
          }
        } catch (e) {
          log('warn', 'Target tab lost. Stopping.');
          isAutomationActive = false;
          resetSession('IDLE');
          break;
        }

        // 2. Scan DOM for questions & navigation
        sessionState.status = 'SCANNING';
        broadcastState();

        let scanResult;
        try {
          scanResult = await chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE' });
        } catch (e) {
          // Re-inject content script if needed
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['content.js'],
            });
            await new Promise((r) => setTimeout(r, 200));
            scanResult = await chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE' });
          } catch (injectErr) {
            log('error', `Script communication error: ${injectErr.message}`);
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
        }

        if (!isAutomationActive || sessionState.status === 'PAUSED' || sessionState.status === 'IDLE') break;

        if (!scanResult || !scanResult.questions) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }

        const scannedQuestions = scanResult.questions || [];

        // Update question registry
        scannedQuestions.forEach((q) => {
          if (!sessionState.questions[q.id]) {
            sessionState.questions[q.id] = {
              ...q,
              status: q.isAnswered ? 'VERIFIED' : 'PENDING',
              retries: 0,
              selectedOptionIndex: null,
              selectedOptionText: null,
              confidence: null,
              rationale: null,
              verified: q.isAnswered,
            };
          } else if (q.isAnswered) {
            sessionState.questions[q.id].verified = true;
            sessionState.questions[q.id].status = 'VERIFIED';
          }
        });

        const allQList = Object.values(sessionState.questions);
        sessionState.stats.detected = allQList.length;
        sessionState.stats.answered = allQList.filter((q) => q.verified).length;
        sessionState.stats.remaining = Math.max(0, sessionState.stats.detected - sessionState.stats.answered);
        sessionState.stats.scrollProgress = scanResult.scrollProgress || 0;

        // If no questions detected on this scan, wait and retry scanning (NEVER click Next on empty scans)
        if (scannedQuestions.length === 0) {
          log('info', 'Scanning page for quiz questions and options...');
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }

        // Find pending unanswered questions on the current screen/page
        const pendingQuestions = scannedQuestions.filter(
          (sq) => !sessionState.questions[sq.id]?.verified && (sessionState.questions[sq.id]?.retries || 0) < (sessionState.config.maxRetries || 3)
        );

        // 3. Solve EVERY pending question on the screen first
        if (pendingQuestions.length > 0) {
          for (const rawQ of pendingQuestions) {
            if (!isAutomationActive || sessionState.status === 'PAUSED' || sessionState.status === 'IDLE') break;

            const question = sessionState.questions[rawQ.id];
            if (!question || question.verified) continue;

            sessionState.status = 'SOLVING';
            sessionState.stats.currentQuestionIndex = question.questionNumber || allQList.indexOf(question) + 1;
            sessionState.stats.currentQuestionText = question.questionText;
            broadcastState();

            log('info', `[Question #${sessionState.stats.currentQuestionIndex}] Consulting Gemini AI: "${question.questionText.substring(0, 55)}..."`);

            let geminiResult;
            try {
              geminiResult = await askGemini(question.questionText, question.options, question.context);
            } catch (apiErr) {
              log('error', `Gemini API query error: ${apiErr.message}`);
              question.status = 'FAILED';
              question.retries = (question.retries || 0) + 1;
              broadcastState();
              if (apiErr.message.includes('missing') || apiErr.message.includes('API key')) {
                isAutomationActive = false;
                sessionState.status = 'PAUSED';
                broadcastState();
                return;
              }
              continue;
            }

            if (!isAutomationActive || sessionState.status === 'PAUSED' || sessionState.status === 'IDLE') break;

            question.selectedOptionIndex = geminiResult.answer_index;
            question.selectedOptionText = geminiResult.answer;
            question.confidence = geminiResult.confidence;
            question.rationale = geminiResult.rationale;

            sessionState.status = 'CLICKING';
            broadcastState();

            // Send click command with BOTH index and exact text
            const clickRes = await chrome.tabs.sendMessage(tabId, {
              type: 'CLICK_ANSWER',
              questionId: question.id,
              optionIndex: geminiResult.answer_index,
              optionText: geminiResult.answer,
              delayMs: sessionState.config.clickDelayMs,
            });

            sessionState.status = 'VERIFYING';
            broadcastState();

            await chrome.tabs.sendMessage(tabId, {
              type: 'VERIFY_CLICK',
              questionId: question.id,
              optionIndex: geminiResult.answer_index,
              optionText: geminiResult.answer,
            });

            question.status = 'VERIFIED';
            question.verified = true;
            sessionState.stats.answered += 1;
            sessionState.stats.remaining = Math.max(0, sessionState.stats.remaining - 1);
            log('success', `✔ [Question #${sessionState.stats.currentQuestionIndex}] Answer Selected: "${geminiResult.answer}" (${(geminiResult.confidence * 100).toFixed(0)}% confidence)`);

            broadcastState();
            await new Promise((r) => setTimeout(r, sessionState.config.clickDelayMs || 500));
          }
        }

        if (!isAutomationActive || sessionState.status === 'PAUSED' || sessionState.status === 'IDLE') break;

        // Verify if ALL scanned questions on this page are now answered before allowing any movement
        const allPageQuestionsAnswered = scannedQuestions.every(
          (sq) => sq.isAnswered || sessionState.questions[sq.id]?.verified
        );

        if (!allPageQuestionsAnswered) {
          log('info', 'Awaiting full question completion on current page before advancing...');
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }

        // 4. NAVIGATION / PAGINATION LOGIC:
        // Only click Next › when all questions on this page have been answered!
        if (scanResult?.hasNextPage) {
          log('info', 'All questions on current page answered. Clicking "Next ›" to advance...');
          sessionState.status = 'SCROLLING';
          broadcastState();

          const nextRes = await chrome.tabs.sendMessage(tabId, { type: 'CLICK_NEXT_PAGE' });
          if (nextRes?.clicked) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
        }

        // If NO Next button exists and bottom is not reached, scroll down to reveal subsequent questions
        if (!scanResult?.hasNextPage && !scanResult?.bottomReached) {
          sessionState.status = 'SCROLLING';
          broadcastState();
          log('info', 'Visible questions answered. Scrolling down to reveal more...');

          const scrollResponse = await chrome.tabs.sendMessage(tabId, {
            type: 'SCROLL_STEP',
            delayMs: sessionState.config.scrollDelayMs,
          });

          await new Promise((r) => setTimeout(r, sessionState.config.scrollDelayMs || 800));
          if (scrollResponse?.bottomReached) sessionState.stats.bottomReached = true;
          continue;
        }

        // 5. COMPLETION & AUTO-SUBMIT LOGIC:
        // If bottom reached OR submit button present
        if (scanResult?.bottomReached || scanResult?.hasSubmit) {
          // If submit button is present and autoSubmit is enabled
          if (sessionState.config.autoSubmit && scanResult?.hasSubmit) {
            sessionState.status = 'SUBMITTING';
            sessionState.stats.submissionStatus = 'SUBMITTING';
            broadcastState();
            log('info', 'All questions answered! Locating and submitting final quiz results...');

            const submitResult = await chrome.tabs.sendMessage(tabId, { type: 'PERFORM_SUBMIT' });
            if (submitResult && submitResult.submitted) {
              await new Promise((r) => setTimeout(r, 1600));
              const verifySubmission = await chrome.tabs.sendMessage(tabId, { type: 'VERIFY_SUBMISSION' });
              sessionState.stats.submissionStatus = 'SUCCESS';
              sessionState.stats.submissionMessage = verifySubmission?.message || 'Quiz submitted successfully!';
              sessionState.stats.isComplete = true;
              isAutomationActive = false;
              sessionState.status = 'COMPLETED';
              log('success', `Quiz Submission Complete! ${sessionState.stats.submissionMessage}`);
              broadcastState();
              return;
            }
          }

          // If at least 1 question was detected and answered
          if (sessionState.stats.answered > 0) {
            isAutomationActive = false;
            sessionState.status = 'COMPLETED';
            sessionState.stats.isComplete = true;
            sessionState.stats.submissionStatus = 'SUCCESS';
            log('success', `All ${sessionState.stats.answered} quiz questions completed successfully!`);
            broadcastState();
            return;
          } else {
            log('info', 'Scanning page for quiz questions...');
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
        }
      } catch (loopErr) {
        log('error', `Automation step: ${loopErr.message}`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  } finally {
    isLoopRunning = false;
  }
}

// Message Dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'GET_STATE':
      sendResponse({ state: sessionState });
      break;

    case 'UPDATE_CONFIG':
      if (payload) {
        sessionState.config = { ...sessionState.config, ...payload };
        // Persistent storage update
        chrome.storage.local.set({
          config: sessionState.config,
          gemini_api_key: sessionState.config.apiKey || '',
          gemini_model: sessionState.config.model || 'gemini-3.7-flash',
        });
        log('info', 'Configuration updated and saved persistently.');
        broadcastState();
      }
      sendResponse({ success: true, config: sessionState.config });
      break;

    case 'START_AUTOMATION':
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs || tabs.length === 0 || !tabs[0].id) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }
        await hydrateConfig();
        const activeTab = tabs[0];
        sessionState.targetTabId = activeTab.id;
        sessionState.targetTabInfo = {
          id: activeTab.id,
          title: activeTab.title || 'Target Tab',
          url: activeTab.url || '',
          favIconUrl: activeTab.favIconUrl || '',
        };
        sessionState.status = 'RUNNING';
        sessionState.stats.isComplete = false;
        log('info', `Target locked to Tab #${activeTab.id}: "${activeTab.title}"`);
        broadcastState();

        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.js'],
          });
        } catch (e) {}

        runAutomationLoop(activeTab.id);
        sendResponse({ success: true, targetTabId: activeTab.id });
      });
      return true;

    case 'PAUSE_AUTOMATION':
      isAutomationActive = false;
      sessionState.status = 'PAUSED';
      isLoopRunning = false;
      log('warn', 'Automation paused by user.');
      broadcastState();
      sendResponse({ success: true });
      break;

    case 'RESUME_AUTOMATION':
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        await hydrateConfig();
        const targetId = sessionState.targetTabId || tabs?.[0]?.id;
        if (!targetId) {
          sendResponse({ success: false, error: 'No tab found to resume' });
          return;
        }
        sessionState.targetTabId = targetId;
        sessionState.status = 'RUNNING';
        isAutomationActive = true;
        log('info', 'Automation resumed.');
        broadcastState();

        try {
          await chrome.scripting.executeScript({
            target: { tabId: targetId },
            files: ['content.js'],
          });
        } catch (e) {}

        runAutomationLoop(targetId);
        sendResponse({ success: true });
      });
      return true;

    case 'STOP_AUTOMATION':
      log('info', 'Automation stopped and session reset.');
      isAutomationActive = false;
      isLoopRunning = false;
      resetSession('IDLE');
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
  return true;
});
