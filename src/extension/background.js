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

chrome.runtime.onInstalled.addListener(async () => {
  await hydrateConfig();
  log('info', 'Gemini MCQ Solver Service Worker initialized.');
});

chrome.runtime.onStartup.addListener(async () => {
  await hydrateConfig();
  if (isAutomationActive && sessionState.targetTabId && !isLoopRunning) {
    runAutomationLoop(sessionState.targetTabId);
  }
});

chrome.alarms.create('gemini_solver_keepalive', { periodInMinutes: 0.2 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'gemini_solver_keepalive') {
    if (sessionState.targetTabId) {
      try {
        const tab = await chrome.tabs.get(sessionState.targetTabId);
        if (!tab) {
          log('warn', 'Target tab was closed in background.');
          resetSession('IDLE');
        } else if (isAutomationActive && !isLoopRunning) {
          runAutomationLoop(sessionState.targetTabId);
        }
      } catch (e) {}
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === sessionState.targetTabId && changeInfo.status === 'complete') {
    if (isAutomationActive && !isLoopRunning) {
      runAutomationLoop(tabId);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === sessionState.targetTabId) {
    log('warn', 'Target tab closed. Resetting solver state.');
    isAutomationActive = false;
    isLoopRunning = false;
    resetSession('IDLE');
  }
});

async function hydrateConfig() {
  const stored = await chrome.storage.local.get(['config', 'gemini_api_key', 'gemini_model', 'active_session_state']);
  if (stored.config) {
    sessionState.config = { ...DEFAULT_CONFIG, ...stored.config };
  }
  if (stored.gemini_api_key) {
    sessionState.config.apiKey = stored.gemini_api_key;
  }
  if (stored.gemini_model) {
    sessionState.config.model = stored.gemini_model;
  }
  if (stored.active_session_state) {
    sessionState.targetTabId = stored.active_session_state.targetTabId || sessionState.targetTabId;
    sessionState.targetTabInfo = stored.active_session_state.targetTabInfo || sessionState.targetTabInfo;
    const s = stored.active_session_state.status;
    if (s === 'RUNNING' || s === 'SCANNING' || s === 'SOLVING' || s === 'CLICKING' || s === 'SCROLLING') {
      sessionState.status = s;
      isAutomationActive = true;
    }
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
  chrome.storage.local.set({ active_session_state: sessionState }).catch(() => {});

  chrome.runtime.sendMessage({
    type: 'STATE_UPDATED',
    state: sessionState,
  }).catch(() => {});

  if (sessionState.targetTabId && sessionState.config.showOverlayHud) {
    chrome.tabs.sendMessage(sessionState.targetTabId, {
      type: 'UPDATE_HUD',
      stats: sessionState.stats,
      status: sessionState.status,
      currentQuestion: {
        index: sessionState.stats.currentQuestionIndex,
        text: sessionState.stats.currentQuestionText,
        answer: sessionState.stats.currentAnswerText,
        answerIndex: sessionState.stats.currentAnswerIndex,
        confidence: sessionState.stats.currentConfidence,
        rationale: sessionState.stats.currentRationale,
        options: sessionState.stats.currentOptions || [],
      },
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
    currentAnswerText: '',
    currentAnswerIndex: null,
    currentOptions: [],
    currentConfidence: null,
    currentRationale: '',
    scrollProgress: 0,
    bottomReached: false,
    isComplete: newStatus === 'COMPLETED',
    submissionStatus: newStatus === 'COMPLETED' ? 'SUCCESS' : 'NOT_SUBMITTED',
  };
  sessionState.questions = {};
  broadcastState();
}

/**
 * Call Gemini API for Multi-type Questions (Radio, Checkbox, Dropdown, Text)
 */
async function askGemini(questionText, options = [], context = '', questionType = 'RADIO') {
  await hydrateConfig();
  const { apiKey, apiEndpoint, model } = sessionState.config;

  const activeKey = apiKey || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY ? process.env.GEMINI_API_KEY : '');
  const activeEndpoint = apiEndpoint || 'https://generativelanguage.googleapis.com/v1beta';
  const activeModel = model || 'gemini-3.7-flash';

  if (!activeKey) {
    throw new Error('Gemini API key is missing. Enter it in the extension popup or options.');
  }

  const prompt = `You are an expert exam and quiz solver. Solve this question accurately.

Question Type: ${questionType}
Question:
"${questionText}"

${context ? `Context:\n"${context}"\n` : ''}
${options && options.length > 0 ? `Options:\n${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}` : ''}

Instructions based on Question Type:
- RADIO (single choice): return 0-based integer in "answer_index" and option text in "answer".
- CHECKBOX (multiple choice): return array of 0-based integers in "answer_indices" and list in "answer".
- DROPDOWN: return 0-based integer in "answer_index" and chosen option text in "answer".
- TEXT (short answer/numeric): return exact filled string in "text_answer" and "answer".

Respond ONLY with a valid JSON object in this exact schema:
{
  "question_type": "${questionType.toLowerCase()}",
  "answer_index": 0,
  "answer_indices": [0],
  "text_answer": "",
  "answer": "<exact option text or text response>",
  "confidence": 0.95,
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

  if (questionType === 'CHECKBOX' && !Array.isArray(parsed.answer_indices)) {
    parsed.answer_indices = typeof parsed.answer_index === 'number' ? [parsed.answer_index] : [0];
  }

  if (typeof parsed.answer_index !== 'number' && options.length > 0) {
    if (parsed.answer) {
      const matchIdx = options.findIndex((opt) => opt.toLowerCase().includes(parsed.answer.toLowerCase()));
      parsed.answer_index = matchIdx >= 0 ? matchIdx : 0;
    } else {
      parsed.answer_index = 0;
    }
  }

  return parsed;
}

let isLoopRunning = false;
let isAutomationActive = false;

/**
 * Main Autonomous Automation Loop
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
  const MAX_ITERATIONS = 1000;

  try {
    while (isAutomationActive && sessionState.status !== 'PAUSED' && sessionState.status !== 'COMPLETED' && sessionState.status !== 'IDLE' && loopIterations < MAX_ITERATIONS) {
      loopIterations++;

      try {
        // --- 1. Verify tab is still alive ---
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

        // --- 2. Scan the page fresh every iteration ---
        sessionState.status = 'SCANNING';
        broadcastState();

        let scanResult;
        try {
          scanResult = await chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE' });
        } catch (e) {
          try {
            await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
            await new Promise((r) => setTimeout(r, 300));
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

        // Register any new questions we haven't seen yet
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
          } else if (q.isAnswered && !sessionState.questions[q.id].verified) {
            sessionState.questions[q.id].verified = true;
            sessionState.questions[q.id].status = 'VERIFIED';
          }
        });

        const allQList = Object.values(sessionState.questions);
        sessionState.stats.detected = allQList.length;
        sessionState.stats.answered = allQList.filter((q) => q.verified).length;
        sessionState.stats.remaining = Math.max(0, sessionState.stats.detected - sessionState.stats.answered);
        sessionState.stats.scrollProgress = scanResult.scrollProgress || 0;

        if (scannedQuestions.length === 0) {
          log('info', 'Scanning page for quiz questions and options...');
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }

        // --- 3. Find the FIRST unanswered question on this page ---
        const nextPending = scannedQuestions.find(
          (sq) => !sessionState.questions[sq.id]?.verified && (sessionState.questions[sq.id]?.retries || 0) < (sessionState.config.maxRetries || 3)
        );

        if (nextPending) {
          // Process exactly ONE question then loop back (re-scan for fresh DOM refs)
          const question = sessionState.questions[nextPending.id];
          if (!question || question.verified) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }

          const qNumber = question.questionNumber || (allQList.indexOf(question) + 1);
          sessionState.status = 'SOLVING';
          sessionState.stats.currentQuestionIndex = qNumber;
          sessionState.stats.currentQuestionText = question.questionText;
          sessionState.stats.currentOptions = question.options || [];
          broadcastState();

          log('info', `[Q#${qNumber}/${scannedQuestions.length}] [${question.questionType || 'RADIO'}] Asking Gemini: "${question.questionText.substring(0, 60)}..."`);

          // --- 4. Ask Gemini ---
          let geminiResult;
          try {
            geminiResult = await askGemini(question.questionText, question.options, question.context, question.questionType || 'RADIO');
          } catch (apiErr) {
            log('error', `Gemini API error on Q#${qNumber}: ${apiErr.message}`);
            question.status = 'FAILED';
            question.retries = (question.retries || 0) + 1;
            broadcastState();
            if (apiErr.message.includes('missing') || apiErr.message.includes('API key')) {
              isAutomationActive = false;
              sessionState.status = 'PAUSED';
              broadcastState();
              return;
            }
            await new Promise((r) => setTimeout(r, 800));
            continue;
          }

          if (!isAutomationActive || sessionState.status === 'PAUSED' || sessionState.status === 'IDLE') break;

          question.selectedOptionIndex = geminiResult.answer_index;
          question.selectedOptionText = geminiResult.text_answer || geminiResult.answer;
          question.confidence = geminiResult.confidence;
          question.rationale = geminiResult.rationale;

          sessionState.stats.currentAnswerText = geminiResult.text_answer || geminiResult.answer;
          sessionState.stats.currentAnswerIndex = typeof geminiResult.answer_index === 'number' ? geminiResult.answer_index : null;
          sessionState.stats.currentConfidence = geminiResult.confidence;
          sessionState.stats.currentRationale = geminiResult.rationale;
          sessionState.stats.currentOptions = question.options || [];

          log('info', `[Q#${qNumber}] Gemini says: "${geminiResult.text_answer || geminiResult.answer}" (${Math.round((geminiResult.confidence || 0.95) * 100)}% confident)`);

          // --- 5. Click the answer ---
          sessionState.status = 'CLICKING';
          broadcastState();

          let clickResult;
          try {
            clickResult = await chrome.tabs.sendMessage(tabId, {
              type: 'CLICK_ANSWER',
              questionId: question.id,
              questionType: question.questionType,
              optionIndex: geminiResult.answer_index,
              optionIndices: geminiResult.answer_indices,
              optionText: geminiResult.answer,
              textAnswer: geminiResult.text_answer || geminiResult.answer,
              delayMs: sessionState.config.clickDelayMs,
            });
          } catch (clickErr) {
            log('error', `Click failed on Q#${qNumber}: ${clickErr.message}`);
            question.retries = (question.retries || 0) + 1;
            await new Promise((r) => setTimeout(r, 600));
            continue; // Re-scan and retry this question
          }

          if (!clickResult?.success) {
            log('warn', `[Q#${qNumber}] Click returned failure: ${clickResult?.error || 'unknown'}. Retrying...`);
            question.retries = (question.retries || 0) + 1;
            await new Promise((r) => setTimeout(r, 600));
            continue; // Re-scan and retry
          }

          // --- 6. Wait a moment for DOM to settle, then verify ---
          await new Promise((r) => setTimeout(r, sessionState.config.clickDelayMs || 500));

          sessionState.status = 'VERIFYING';
          broadcastState();

          try {
            await chrome.tabs.sendMessage(tabId, {
              type: 'VERIFY_CLICK',
              questionId: question.id,
              optionIndex: geminiResult.answer_index,
              optionText: geminiResult.answer,
            });
          } catch (e) {
            // Verification failure is non-fatal; proceed
          }

          // --- 7. Mark as answered and loop back to re-scan ---
          question.status = 'VERIFIED';
          question.verified = true;
          sessionState.stats.answered = allQList.filter((q) => q.verified).length + 1;
          sessionState.stats.remaining = Math.max(0, (sessionState.stats.detected || scannedQuestions.length) - sessionState.stats.answered);

          log('success', `✔ [Q#${qNumber}] Answered: "${geminiResult.text_answer || geminiResult.answer}" (${Math.round((geminiResult.confidence || 0.95) * 100)}% confidence)`);

          broadcastState();
          // Short pause before re-scanning for the next question
          await new Promise((r) => setTimeout(r, sessionState.config.clickDelayMs || 500));
          continue; // ← Go back to top: re-scan page and pick next pending question
        }

        // --- 8. All visible questions answered — check whether to advance ---
        const allPageQuestionsAnswered = scannedQuestions.every((sq) => {
          const stored = sessionState.questions[sq.id];
          return (
            sq.isAnswered ||
            stored?.verified ||
            stored?.status === 'FAILED' ||
            (stored?.retries || 0) >= (sessionState.config.maxRetries || 3)
          );
        });

        if (!allPageQuestionsAnswered) {
          log('info', 'Waiting for all questions on this page to be completed...');
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }

        // --- 9. Advance to next page if available ---
        if (scanResult?.hasNextPage) {
          log('info', `All ${sessionState.stats.answered} questions answered. Clicking "Next" to advance...`);
          sessionState.status = 'SCROLLING';
          broadcastState();

          const nextRes = await chrome.tabs.sendMessage(tabId, { type: 'CLICK_NEXT_PAGE' });
          if (nextRes?.clicked) {
            await new Promise((r) => setTimeout(r, 1800));
            // Reset question map so fresh IDs are registered for new page
            sessionState.questions = {};
            continue;
          }
        }

        // --- 10. Scroll down if there might be more questions below ---
        if (!scanResult?.hasNextPage && !scanResult?.bottomReached) {
          sessionState.status = 'SCROLLING';
          broadcastState();
          log('info', 'Scrolling down to reveal more questions...');

          const scrollResponse = await chrome.tabs.sendMessage(tabId, {
            type: 'SCROLL_STEP',
            delayMs: sessionState.config.scrollDelayMs,
          });

          await new Promise((r) => setTimeout(r, sessionState.config.scrollDelayMs || 800));
          if (scrollResponse?.bottomReached) sessionState.stats.bottomReached = true;
          continue;
        }

        // --- 11. Bottom reached or submit available ---
        if (scanResult?.bottomReached || scanResult?.hasSubmit) {
          if (sessionState.config.autoSubmit && scanResult?.hasSubmit) {
            sessionState.status = 'SUBMITTING';
            sessionState.stats.submissionStatus = 'SUBMITTING';
            broadcastState();
            log('info', 'All questions answered! Submitting quiz...');

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
        log('error', `Automation step error: ${loopErr.message}`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  } finally {
    isLoopRunning = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'GET_STATE':
      sendResponse({ state: sessionState });
      break;

    case 'UPDATE_CONFIG':
      if (payload) {
        sessionState.config = { ...sessionState.config, ...payload };
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
