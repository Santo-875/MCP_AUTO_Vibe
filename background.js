/**
 * Gemini Auto MCQ & Quiz Solver - Background Service Worker (Manifest V3)
 * Manages automation lifecycle, target tab isolation, Gemini API requests, and state synchronization.
 */

const DEFAULT_CONFIG = {
  autoSubmit: true,
  clickDelayMs: 600,
  scrollDelayMs: 900,
  maxRetries: 3,
  apiEndpoint: '',
  apiKey: '',
  model: 'gemini-3.7-flash',
  showOverlayHud: true,
  smoothScroll: true,
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
  const stored = await chrome.storage.local.get(['config']);
  if (stored.config) {
    sessionState.config = { ...DEFAULT_CONFIG, ...stored.config };
  } else {
    await chrome.storage.local.set({ config: DEFAULT_CONFIG });
  }
  log('info', 'Gemini MCQ Solver Background Service Worker initialized.');
});

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
  chrome.storage.local.set({ sessionState });
  chrome.runtime.sendMessage({ type: 'STATE_UPDATED', state: sessionState }).catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (sessionState.targetTabId === tabId) {
    log('warn', `Target Tab #${tabId} was closed by user. Terminating automation.`);
    resetSession('IDLE');
  }
});

function resetSession(newStatus = 'IDLE') {
  sessionState.status = newStatus;
  sessionState.targetTabId = null;
  sessionState.targetTabInfo = null;
  sessionState.stats = {
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
  };
  sessionState.questions = {};
  broadcastState();
}

async function askGemini(question, options, context = '') {
  log('gemini', `Querying Gemini for Question: "${question.substring(0, 60)}..."`, { options });
  const { apiKey, apiEndpoint, model } = sessionState.config;

  if (apiEndpoint && apiEndpoint.trim().length > 0) {
    try {
      const response = await fetch(apiEndpoint.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          options,
          context,
          customApiKey: apiKey || undefined,
          modelName: model || 'gemini-3.7-flash',
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Server proxy returned failure');
      return {
        answer_index: data.answer_index,
        answer: data.answer,
        confidence: data.confidence || 0.95,
        rationale: data.rationale || '',
      };
    } catch (err) {
      log('error', `Proxy solver error: ${err.message}. Falling back to direct API.`);
    }
  }

  const activeKey = apiKey || '';
  if (!activeKey) {
    throw new Error('No Gemini API key configured. Please set your API key in extension options or popup settings.');
  }

  const modelId = model || 'gemini-3.7-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(activeKey)}`;

  const promptText = `You are an expert AI quiz and exam solver. Select the single most accurate, correct answer for this Multiple Choice Question (MCQ).

QUESTION:
${question}

OPTIONS:
${options.map((opt, i) => `[Index ${i}] ${opt}`).join('\n')}

${context ? `ADDITIONAL CONTEXT:\n${context}` : ''}

Respond in structured JSON format with:
- "answer_index": integer (0-based index)
- "answer": exact string of chosen option
- "confidence": float 0.0 to 1.0
- "rationale": 1-sentence explanation`;

  const payload = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          answer_index: { type: 'INTEGER' },
          answer: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
          rationale: { type: 'STRING' },
        },
        required: ['answer_index', 'answer', 'confidence'],
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API returned HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOutput) throw new Error('Empty response received from Gemini API');

  const parsed = JSON.parse(textOutput);
  let answerIndex = parsed.answer_index;
  if (typeof answerIndex !== 'number' || answerIndex < 0 || answerIndex >= options.length) {
    const idx = options.findIndex((opt) => parsed.answer && opt.toLowerCase().includes(parsed.answer.toLowerCase()));
    answerIndex = idx >= 0 ? idx : 0;
  }

  return {
    answer_index: answerIndex,
    answer: parsed.answer || options[answerIndex],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
    rationale: parsed.rationale || '',
  };
}

async function runAutomationLoop(tabId) {
  if (sessionState.targetTabId !== tabId) return;

  while (
    sessionState.targetTabId === tabId &&
    (sessionState.status === 'RUNNING' ||
      sessionState.status === 'SCANNING' ||
      sessionState.status === 'SOLVING' ||
      sessionState.status === 'CLICKING' ||
      sessionState.status === 'VERIFYING' ||
      sessionState.status === 'SCROLLING')
  ) {
    try {
      const captchaCheck = await chrome.tabs.sendMessage(tabId, { type: 'CHECK_CAPTCHA' });
      if (captchaCheck && captchaCheck.captchaDetected) {
        log('warn', `CAPTCHA / Human Verification detected (${captchaCheck.captchaType}). Pausing automation.`);
        sessionState.status = 'PAUSED_CAPTCHA';
        broadcastState();
        return;
      }

      sessionState.status = 'SCANNING';
      broadcastState();
      const scanResult = await chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE' });

      if (scanResult && scanResult.questions) {
        scanResult.questions.forEach((q) => {
          if (!sessionState.questions[q.id]) {
            sessionState.questions[q.id] = {
              ...q,
              status: q.isAnswered ? 'ANSWERED' : 'UNANSWERED',
              retries: 0,
              verified: q.isAnswered || false,
            };
          }
        });
      }

      const allQList = Object.values(sessionState.questions);
      const unansweredQList = allQList.filter((q) => q.status === 'UNANSWERED' || q.status === 'FAILED');
      const answeredCount = allQList.filter((q) => q.status === 'ANSWERED' || q.status === 'VERIFIED').length;

      sessionState.stats.detected = allQList.length;
      sessionState.stats.answered = answeredCount;
      sessionState.stats.remaining = unansweredQList.length;
      sessionState.stats.scrollProgress = scanResult?.scrollProgress || 0;
      sessionState.stats.bottomReached = scanResult?.bottomReached || false;
      broadcastState();

      if (unansweredQList.length > 0) {
        for (const question of unansweredQList) {
          if (
            sessionState.targetTabId !== tabId ||
            sessionState.status === 'PAUSED' ||
            sessionState.status === 'PAUSED_CAPTCHA' ||
            sessionState.status === 'IDLE'
          )
            return;

          sessionState.status = 'SOLVING';
          sessionState.stats.currentQuestionIndex = question.questionNumber || allQList.indexOf(question) + 1;
          sessionState.stats.currentQuestionText = question.questionText;
          broadcastState();

          log('info', `Solving Question #${sessionState.stats.currentQuestionIndex}: "${question.questionText.substring(0, 50)}..."`);

          let geminiResult;
          try {
            geminiResult = await askGemini(question.questionText, question.options, question.context);
          } catch (apiErr) {
            log('error', `Gemini query failed: ${apiErr.message}`);
            question.status = 'FAILED';
            question.retries += 1;
            broadcastState();
            continue;
          }

          question.selectedOptionIndex = geminiResult.answer_index;
          question.selectedOptionText = geminiResult.answer;
          question.confidence = geminiResult.confidence;
          question.rationale = geminiResult.rationale;

          sessionState.status = 'CLICKING';
          broadcastState();

          await chrome.tabs.sendMessage(tabId, {
            type: 'CLICK_ANSWER',
            questionId: question.id,
            optionIndex: geminiResult.answer_index,
            optionText: geminiResult.answer,
            delayMs: sessionState.config.clickDelayMs,
          });

          sessionState.status = 'VERIFYING';
          broadcastState();

          const verifyResult = await chrome.tabs.sendMessage(tabId, {
            type: 'VERIFY_CLICK',
            questionId: question.id,
            optionIndex: geminiResult.answer_index,
          });

          if (verifyResult && verifyResult.verified) {
            question.status = 'VERIFIED';
            question.verified = true;
            sessionState.stats.answered += 1;
            sessionState.stats.remaining = Math.max(0, sessionState.stats.remaining - 1);
            log('success', `Question #${sessionState.stats.currentQuestionIndex} verified: "${geminiResult.answer}" (${(geminiResult.confidence * 100).toFixed(0)}%)`);
          } else {
            log('warn', `Verification failed for Question #${sessionState.stats.currentQuestionIndex}. Retrying click...`);
            await new Promise((r) => setTimeout(r, 400));
            await chrome.tabs.sendMessage(tabId, {
              type: 'CLICK_ANSWER',
              questionId: question.id,
              optionIndex: geminiResult.answer_index,
              optionText: geminiResult.answer,
              forceRetry: true,
            });

            const retryVerify = await chrome.tabs.sendMessage(tabId, {
              type: 'VERIFY_CLICK',
              questionId: question.id,
              optionIndex: geminiResult.answer_index,
            });

            if (retryVerify && retryVerify.verified) {
              question.status = 'VERIFIED';
              question.verified = true;
              sessionState.stats.answered += 1;
              sessionState.stats.remaining = Math.max(0, sessionState.stats.remaining - 1);
              log('success', `Question #${sessionState.stats.currentQuestionIndex} verified after retry!`);
            } else {
              question.status = 'FAILED';
              question.retries += 1;
              log('error', `Could not verify answer for Question #${sessionState.stats.currentQuestionIndex}.`);
            }
          }

          broadcastState();
          await new Promise((r) => setTimeout(r, sessionState.config.clickDelayMs || 400));
        }
      }

      if (!scanResult?.bottomReached) {
        sessionState.status = 'SCROLLING';
        broadcastState();
        log('info', 'Scrolling down to discover additional or lazy-loaded questions...');

        const scrollResponse = await chrome.tabs.sendMessage(tabId, {
          type: 'SCROLL_STEP',
          delayMs: sessionState.config.scrollDelayMs,
        });

        await new Promise((r) => setTimeout(r, sessionState.config.scrollDelayMs || 800));
        if (scrollResponse?.bottomReached) sessionState.stats.bottomReached = true;
      } else {
        log('info', 'Bottom reached. Performing final scan across entire document.');
        await chrome.tabs.sendMessage(tabId, { type: 'FINAL_SCAN' });
        const remainingUnanswered = Object.values(sessionState.questions).filter(
          (q) => q.status === 'UNANSWERED' || q.status === 'FAILED'
        );

        if (remainingUnanswered.length === 0) {
          log('success', `All ${sessionState.stats.detected} questions answered successfully!`);

          if (sessionState.config.autoSubmit) {
            sessionState.status = 'SUBMITTING';
            sessionState.stats.submissionStatus = 'SUBMITTING';
            broadcastState();
            log('info', 'Locating and clicking final Quiz Submit/Complete button...');

            const submitResult = await chrome.tabs.sendMessage(tabId, { type: 'PERFORM_SUBMIT' });
            if (submitResult && submitResult.submitted) {
              await new Promise((r) => setTimeout(r, 2000));
              const verifySubmission = await chrome.tabs.sendMessage(tabId, { type: 'VERIFY_SUBMISSION' });
              sessionState.stats.submissionStatus = 'SUCCESS';
              sessionState.stats.submissionMessage = verifySubmission?.message || 'Quiz submitted successfully!';
              sessionState.stats.isComplete = true;
              sessionState.status = 'COMPLETED';
              log('success', `Quiz Completion Verified! Message: ${sessionState.stats.submissionMessage}`);
            } else {
              sessionState.stats.submissionStatus = 'FAILED';
              sessionState.status = 'COMPLETED';
              log('warn', 'Submission finished.');
            }
          } else {
            sessionState.status = 'COMPLETED';
            sessionState.stats.isComplete = true;
            log('info', 'All questions completed. Auto-submit is OFF.');
          }

          broadcastState();
          return;
        } else {
          log('info', `${remainingUnanswered.length} unanswered questions remaining. Re-navigating.`);
          await chrome.tabs.sendMessage(tabId, {
            type: 'FOCUS_QUESTION',
            questionId: remainingUnanswered[0].id,
          });
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    } catch (loopErr) {
      log('error', `Automation loop error: ${loopErr.message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'GET_STATE':
      sendResponse({ state: sessionState });
      break;

    case 'UPDATE_CONFIG':
      sessionState.config = { ...sessionState.config, ...payload };
      chrome.storage.local.set({ config: sessionState.config });
      log('info', 'Configuration updated.');
      broadcastState();
      sendResponse({ success: true, config: sessionState.config });
      break;

    case 'START_AUTOMATION':
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs || tabs.length === 0 || !tabs[0].id) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }
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
      if (sessionState.status !== 'IDLE' && sessionState.status !== 'COMPLETED') {
        sessionState.status = 'PAUSED';
        log('warn', 'Automation paused by user.');
        broadcastState();
      }
      sendResponse({ success: true });
      break;

    case 'RESUME_AUTOMATION':
      if (sessionState.targetTabId && (sessionState.status === 'PAUSED' || sessionState.status === 'PAUSED_CAPTCHA')) {
        sessionState.status = 'RUNNING';
        log('info', 'Automation resumed.');
        broadcastState();
        runAutomationLoop(sessionState.targetTabId);
      }
      sendResponse({ success: true });
      break;

    case 'STOP_AUTOMATION':
      log('info', 'Automation stopped and session reset.');
      resetSession('IDLE');
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
  return true;
});
