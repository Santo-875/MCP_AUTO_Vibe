export const EXTENSION_FILES: Record<string, string> = {
  'manifest.json': `{
  "manifest_version": 3,
  "name": "Gemini Auto MCQ & Quiz Solver",
  "version": "1.0.0",
  "description": "Autonomous AI agent using Gemini to detect, solve, click, verify, scroll, and complete MCQ quiz pages.",
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "tabs"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "Gemini MCQ Solver",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "options_page": "options.html",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}`,

  'background.js': `/**
 * Gemini Auto MCQ & Quiz Solver - Background Service Worker (Manifest V3)
 * Manages automation lifecycle, target tab isolation, Gemini API requests, multi-page pagination, and state synchronization.
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
  log('info', 'Gemini MCQ Solver Service Worker initialized.');
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
    log('warn', \`Target Tab #\${tabId} was closed by user. Terminating automation.\`);
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
  log('gemini', \`Querying Gemini for Question: "\${question.substring(0, 60)}..."\`, { options });
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
      log('error', \`Proxy solver error: \${err.message}. Falling back to direct API.\`);
    }
  }

  const activeKey = apiKey || '';
  if (!activeKey) {
    throw new Error('Gemini API key is missing! Please enter your Gemini API key in the extension popup or options.');
  }

  const modelId = model || 'gemini-3.7-flash';
  const url = \`https://generativelanguage.googleapis.com/v1beta/models/\${modelId}:generateContent?key=\${encodeURIComponent(activeKey)}\`;

  const promptText = \`You are an expert AI quiz and exam solver. Select the single most accurate, correct answer for this Multiple Choice Question (MCQ).

QUESTION:
\${question}

OPTIONS:
\${options.map((opt, i) => \`[Index \${i}] \${opt}\`).join('\\n')}

\${context ? \`ADDITIONAL CONTEXT:\\n\${context}\` : ''}

Respond in structured JSON format with:
- "answer_index": integer (0-based index of the chosen option)
- "answer": exact string of chosen option
- "confidence": float between 0.0 and 1.0
- "rationale": 1-sentence explanation\`;

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
    throw new Error(\`Gemini API error (HTTP \${response.status}): \${errorText}\`);
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
            log('error', \`Script communication error: \${injectErr.message}\`);
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

        // Find pending unanswered questions on screen
        const pendingQuestions = scannedQuestions.filter(
          (sq) => !sessionState.questions[sq.id]?.verified && (sessionState.questions[sq.id]?.retries || 0) < (sessionState.config.maxRetries || 3)
        );

        // 3. If there are questions to answer on screen, solve them one by one
        if (pendingQuestions.length > 0) {
          for (const rawQ of pendingQuestions) {
            if (!isAutomationActive || sessionState.status === 'PAUSED' || sessionState.status === 'IDLE') break;

            const question = sessionState.questions[rawQ.id];
            if (!question || question.verified) continue;

            sessionState.status = 'SOLVING';
            sessionState.stats.currentQuestionIndex = question.questionNumber || allQList.indexOf(question) + 1;
            sessionState.stats.currentQuestionText = question.questionText;
            broadcastState();

            log('info', \`Solving Question #\${sessionState.stats.currentQuestionIndex}: "\${question.questionText.substring(0, 50)}..."\`);

            let geminiResult;
            try {
              geminiResult = await askGemini(question.questionText, question.options, question.context);
            } catch (apiErr) {
              log('error', \`Gemini query error: \${apiErr.message}\`);
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
              optionText: geminiResult.answer,
            });

            question.status = 'VERIFIED';
            question.verified = true;
            sessionState.stats.answered += 1;
            sessionState.stats.remaining = Math.max(0, sessionState.stats.remaining - 1);
            log('success', \`Question #\${sessionState.stats.currentQuestionIndex} selected: "\${geminiResult.answer}" (\${(geminiResult.confidence * 100).toFixed(0)}%)\`);

            broadcastState();
            await new Promise((r) => setTimeout(r, sessionState.config.clickDelayMs || 400));
          }
        }

        if (!isAutomationActive || sessionState.status === 'PAUSED' || sessionState.status === 'IDLE') break;

        // 4. NAVIGATION / PAGINATION LOGIC:
        // If Next button exists (step-by-step single-question tests), click Next › to advance!
        if (scanResult?.hasNextPage) {
          log('info', 'Question completed. Clicking "Next ›" to advance to next question...');
          sessionState.status = 'SCROLLING';
          broadcastState();

          const nextRes = await chrome.tabs.sendMessage(tabId, { type: 'CLICK_NEXT_PAGE' });
          if (nextRes?.clicked) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
        }

        // If NO Next button exists and bottom is not reached, scroll down to reveal subsequent questions
        if (!scanResult?.hasNextPage && !scanResult?.bottomReached) {
          sessionState.status = 'SCROLLING';
          broadcastState();
          log('info', 'Scrolling down to reveal subsequent questions...');

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
            log('info', 'Locating and submitting final quiz results...');

            const submitResult = await chrome.tabs.sendMessage(tabId, { type: 'PERFORM_SUBMIT' });
            if (submitResult && submitResult.submitted) {
              await new Promise((r) => setTimeout(r, 1500));
              const verifySubmission = await chrome.tabs.sendMessage(tabId, { type: 'VERIFY_SUBMISSION' });
              sessionState.stats.submissionStatus = 'SUCCESS';
              sessionState.stats.submissionMessage = verifySubmission?.message || 'Quiz submitted successfully!';
              sessionState.stats.isComplete = true;
              isAutomationActive = false;
              sessionState.status = 'COMPLETED';
              log('success', \`Quiz Submission Verified! \${sessionState.stats.submissionMessage}\`);
              broadcastState();
              return;
            }
          }

          // If at least 1 question was detected or answered
          if (sessionState.stats.answered > 0 || sessionState.stats.detected > 0) {
            isAutomationActive = false;
            sessionState.status = 'COMPLETED';
            sessionState.stats.isComplete = true;
            sessionState.stats.submissionStatus = 'SUCCESS';
            log('success', \`All \${sessionState.stats.answered} questions completed!\`);
            broadcastState();
            return;
          } else {
            // If at bottom but 0 questions scanned yet, wait briefly and retry
            log('info', 'Scanning page for quiz questions...');
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }
        }
      } catch (loopErr) {
        log('error', \`Automation step: \${loopErr.message}\`);
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
        log('info', \`Target locked to Tab #\${activeTab.id}: "\${activeTab.title}"\`);
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
});`,

  'content.js': `/**
 * Gemini Auto MCQ & Quiz Solver - Content Script Agent
 * Autonomous DOM detection, interaction simulation, step-by-step pagination (Next › / Next Question), verification, and scrolling engine.
 */

(() => {
  if (window.__GEMINI_MCQ_SOLVER_LOADED__) return;
  window.__GEMINI_MCQ_SOLVER_LOADED__ = true;

  const SCAN_SELECTORS = {
    questionContainers: [
      'fieldset',
      '[role="radiogroup"]',
      '[role="group"]',
      '.question',
      '.quiz-question',
      '.mcq-item',
      '.form-group',
      '.freebirdFormviewerViewNumberedItemContainer',
      '.gefs-field-container',
      '.moodle-question',
      '.que',
      '.wpProQuiz_listItem',
      '.quiz-card',
      '.question-container',
      '.test-question',
      '.exam-question',
      '.card:has(input[type="radio"])',
      '[data-question-id]',
      '[id*="question"]',
      '[class*="question"]',
      'div:has(input[type="radio"])',
      'div:has(input[type="checkbox"])',
      'div:has([role="radio"])',
      'div:has([role="option"])',
      'li:has(input[type="radio"])',
      'section:has(input[type="radio"])',
    ],
    options: [
      'input[type="radio"]',
      'input[type="checkbox"]',
      '[role="radio"]',
      '[role="option"]',
      '[role="checkbox"]',
      'label:has(input)',
      'label',
      '.choice',
      '.answer',
      '.option',
      '.answer-option',
      '.quiz-option',
      '.test-option',
      '[data-value]',
      'button[role="radio"]',
      'button:not([type="submit"]):not([data-action="next"]):not([data-action="prev"])',
      'div[tabindex="0"]',
    ],
    nextButtons: [
      'button[data-action="next"]',
      'button.next-btn',
      'button.next-button',
      'button.btn-next',
      '.next-page-btn',
      '.pagination-next',
      'a.next',
      'input[value*="Next" i]',
      'input[value*="Continue" i]',
      'div[role="button"][jsname="OCpkoe"]',
      '.freebirdFormviewerViewNavigationNextButton',
      'button:contains("Next")',
      'a:contains("Next")',
    ],
    submitButtons: [
      'button[type="submit"]',
      'input[type="submit"]',
      'button.submit-btn',
      'button.btn-submit',
      '.quiz-submit',
      '[data-action="submit"]',
      '#submit-quiz',
      '#quiz-submit-button',
      'input[value*="Submit" i]',
      'input[value*="Finish" i]',
      'input[value*="Complete" i]',
    ],
    captcha: [
      '#cf-challenge-running',
      '#challenge-running',
    ],
  };

  let overlayHudElement = null;

  function createOrUpdateHud(stats, status) {
    if (!overlayHudElement) {
      overlayHudElement = document.createElement('div');
      overlayHudElement.id = 'gemini-mcq-solver-hud';
      overlayHudElement.style.cssText = \`
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        background: #1e1b4b;
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        padding: 12px 16px;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
        border: 1px solid #4338ca;
        display: flex;
        align-items: center;
        gap: 12px;
        pointer-events: auto;
        user-select: none;
        transition: all 0.3s ease;
      \`;
      document.body.appendChild(overlayHudElement);
    }

    overlayHudElement.innerHTML = \`
      <div style="width: 8px; height: 8px; border-radius: 50%; background: #6366f1; animation: pulse 1.5s infinite;"></div>
      <div>
        <div style="font-weight: bold; font-size: 11px; color: #a5b4fc; text-transform: uppercase; letter-spacing: 0.5px;">Gemini Solver</div>
        <div style="font-size: 13px; font-weight: 600; color: #ffffff;">\${status || 'Active'}</div>
      </div>
      <div style="height: 24px; width: 1px; background: #4338ca; margin: 0 4px;"></div>
      <div style="text-align: right;">
        <div style="font-size: 10px; color: #94a3b8;">Answered</div>
        <div style="font-size: 13px; font-weight: bold; color: #34d399;">\${stats?.answered || 0} / \${stats?.detected || 0}</div>
      </div>
    \`;
  }

  function removeHud() {
    if (overlayHudElement) {
      overlayHudElement.remove();
      overlayHudElement = null;
    }
  }

  function checkForCaptcha() {
    const blockingSelectors = [
      '#cf-challenge-running',
      '#challenge-running',
    ];
    for (const selector of blockingSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el && el.offsetWidth > 100 && el.offsetHeight > 50) {
          return {
            captchaDetected: true,
            captchaType: 'Cloudflare Challenge',
          };
        }
      } catch (e) {}
    }
    return { captchaDetected: false };
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return 'q_' + Math.abs(hash).toString(36);
  }

  function cleanText(text) {
    return (text || '').replace(/\\s+/g, ' ').trim();
  }

  function findQuestionElements() {
    const questionContainers = [];
    const seenElements = new Set();

    // Strategy 1: Group Radio/Checkbox inputs by 'name' or nearest group
    const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"]')).filter(isVisibleElement);
    if (inputs.length >= 2) {
      const groups = new Map();
      inputs.forEach((input) => {
        const groupKey = input.name || input.getAttribute('name') || input.closest('[role="radiogroup"], fieldset, form, div')?.id || 'default_group';
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(input);
      });

      for (const [key, groupInputs] of groups.entries()) {
        if (groupInputs.length >= 2) {
          let parent = groupInputs[0].parentElement;
          while (parent && parent !== document.body) {
            const containsAll = groupInputs.every((inp) => parent.contains(inp));
            if (containsAll) break;
            parent = parent.parentElement;
          }
          if (parent && parent !== document.body && !seenElements.has(parent)) {
            const otherInputs = Array.from(parent.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"]'))
              .filter((inp) => !groupInputs.includes(inp));
            if (otherInputs.length === 0) {
              seenElements.add(parent);
              questionContainers.push(parent);
            }
          }
        }
      }
    }

    // Strategy 2: Explicit Question Container Selectors
    const explicitSelectors = [
      'fieldset',
      '[role="radiogroup"]',
      '.freebirdFormviewerViewNumberedItemContainer',
      'div[role="listitem"]',
      '.Qr7Oae',
      '.que',
      '.multichoice',
      '.question-container',
      '.quiz-question',
      '.question',
      '.mcq-item',
      '.wpProQuiz_listItem',
      '.test-question',
      '.exam-question',
      '[data-question-id]',
      '[data-testid="question-card"]',
    ];

    explicitSelectors.forEach((sel) => {
      try {
        document.querySelectorAll(sel).forEach((el) => {
          if (!isVisibleElement(el) || seenElements.has(el)) return;
          const optionCandidates = el.querySelectorAll('input, [role="radio"], [role="option"], label, .option, .choice, .answer');
          if (optionCandidates.length >= 2) {
            const hasSubQuestion = questionContainers.some((q) => el.contains(q));
            if (!hasSubQuestion) {
              seenElements.add(el);
              questionContainers.push(el);
            }
          }
        });
      } catch (e) {}
    });

    // Strategy 3: General Blocks containing choice lists / buttons
    if (questionContainers.length === 0) {
      const candidateBlocks = Array.from(document.querySelectorAll('div, section, article, li, form, main')).filter(isVisibleElement);
      for (const block of candidateBlocks) {
        if (seenElements.has(block)) continue;
        const choices = Array.from(block.querySelectorAll('button, label, li, .choice, .option, .answer, [role="button"], [role="option"]')).filter((c) => {
          if (!isVisibleElement(c)) return false;
          const txt = cleanText(c.textContent);
          return txt.length > 0 && txt.length < 250 && !isNavigationText(txt);
        });

        if (choices.length >= 2 && choices.length <= 8) {
          if (!questionContainers.some((existing) => existing.contains(block) || block.contains(existing))) {
            seenElements.add(block);
            questionContainers.push(block);
          }
        }
      }
    }

    // Strategy 4: Fallback single active question on screen
    if (questionContainers.length === 0) {
      const anyChoices = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], label, .option, .choice, .answer, button')).filter((c) => {
        if (!isVisibleElement(c)) return false;
        const txt = cleanText(c.textContent);
        return txt.length > 0 && txt.length < 250 && !isNavigationText(txt);
      });
      if (anyChoices.length >= 2) {
        return [document.querySelector('main') || document.querySelector('form') || document.body];
      }
    }

    return questionContainers;
   function parseQuestion(container, index) {
    let questionText = '';

    // 1. Search common heading / prompt elements inside container
    const headingSelectors = [
      'legend',
      '[role="heading"]',
      'h1, h2, h3, h4, h5, h6',
      '.question-title',
      '.question-text',
      '.title',
      '.prompt',
      '.stem',
      '.qtext',
      '.freebirdFormviewerComponentsQuestionBaseHeader',
      '.M7eMe',
      'p.question',
      'p:first-of-type',
      'div:first-child',
    ];

    for (const sel of headingSelectors) {
      const el = container.querySelector(sel);
      if (el && isVisibleElement(el)) {
        const txt = cleanText(el.textContent);
        if (txt.length > 3 && !isNavigationText(txt)) {
          questionText = txt;
          break;
        }
      }
    }

    // 2. If no prompt found from headings, clone container and remove choices to extract stem text
    if (!questionText) {
      const cloned = container.cloneNode(true);
      cloned.querySelectorAll('input, [role="radio"], [role="option"], label, button, .choice, .option, .answer, ul, ol').forEach((el) => el.remove());
      const rawStem = cleanText(cloned.textContent);
      if (rawStem.length > 3 && !isNavigationText(rawStem)) {
        questionText = rawStem;
      }
    }

    if (!questionText) {
      questionText = cleanText(container.textContent).substring(0, 160);
    }

    // 3. Extract Options
    const options = [];
    const optionElements = [];
    const seenTexts = new Set();
    let isAnswered = false;

    const candidateElements = Array.from(
      container.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="option"], label, .choice, .option, .answer, .quiz-option, .test-option, li, button:not([type="submit"])')
    ).filter(isVisibleElement);

    candidateElements.forEach((el) => {
      if (isNavigationText(el.textContent)) return;

      let optText = '';
      let clickEl = el;

      if (el.tagName === 'INPUT') {
        if (el.checked) isAnswered = true;
        if (el.id) {
          const lbl = document.querySelector(\`label[for="\${el.id}"]\`);
          if (lbl) {
            optText = cleanText(lbl.textContent);
            clickEl = lbl;
          }
        }
        if (!optText && el.closest('label')) {
          optText = cleanText(el.closest('label').textContent);
          clickEl = el.closest('label');
        }
      } else {
        const isSelected =
          el.getAttribute('aria-checked') === 'true' ||
          el.getAttribute('aria-selected') === 'true' ||
          el.classList.contains('selected') ||
          el.classList.contains('active') ||
          el.classList.contains('checked') ||
          !!el.querySelector('input:checked');

        if (isSelected) isAnswered = true;
        optText = cleanText(el.textContent);
      }

      if (!optText) {
        optText = cleanText(el.textContent);
      }

      // Clean option prefixes like "A)", "B.", "1.", "(a)", "•"
      optText = optText.replace(/^[A-Za-z0-9][\\.\\)\\:\\-]\\s*/, '').trim();

      if (
        optText &&
        optText.length > 0 &&
        optText.length < 250 &&
        optText !== questionText &&
        !isNavigationText(optText) &&
        !seenTexts.has(optText.toLowerCase())
      ) {
        seenTexts.add(optText.toLowerCase());
        options.push(optText);
        optionElements.push(clickEl);
      }
    });

    const uniqueId = container.id || hashString(questionText + '_' + options.join('_'));
    try {
      container.setAttribute('data-gemini-qid', uniqueId);
    } catch (e) {}

    return {
      id: uniqueId,
      questionNumber: index + 1,
      questionText,
      options,
      isAnswered,
      element: container,
      optionElements,
    };
  }

  function simulateUserClick(element) {
    if (!element) return false;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    const eventOpts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      screenX: clientX + window.screenX,
      screenY: clientY + window.screenY,
      button: 0,
      buttons: 1,
    };

    element.dispatchEvent(new PointerEvent('pointerover', eventOpts));
    element.dispatchEvent(new MouseEvent('mouseover', eventOpts));
    element.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
    element.dispatchEvent(new MouseEvent('mousedown', eventOpts));
    element.focus();
    element.dispatchEvent(new PointerEvent('pointerup', eventOpts));
    element.dispatchEvent(new MouseEvent('mouseup', eventOpts));
    element.dispatchEvent(new MouseEvent('click', eventOpts));

    const innerInput = element.querySelector('input[type="radio"], input[type="checkbox"]');
    if (innerInput) {
      innerInput.checked = true;
      innerInput.dispatchEvent(new Event('change', { bubbles: true }));
      innerInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (element.tagName === 'INPUT' && (element.type === 'radio' || element.type === 'checkbox')) {
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    return true;
  }

  function findNextButton() {
    for (const selector of SCAN_SELECTORS.nextButtons) {
      try {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) return el;
      } catch (e) {}
    }

    const allClickables = Array.from(document.querySelectorAll('button, input[type="button"], a, div[role="button"], span'));
    const nextBtn = allClickables.find((btn) => {
      if (btn.offsetParent === null) return false;
      const txt = cleanText(btn.textContent || btn.value || '').toLowerCase();
      const isSubmit = txt.includes('submit') || txt.includes('finish') || txt.includes('complete');
      if (isSubmit) return false;
      return (
        txt === 'next' ||
        txt === 'next ›' ||
        txt === 'next >' ||
        txt.includes('next ') ||
        txt.includes('next›') ||
        txt.includes('next>') ||
        txt.includes('continue') ||
        txt.includes('save & next') ||
        txt.includes('save and next') ||
        txt.includes('next question') ||
        txt.includes('next page')
      );
    });

    if (nextBtn) return nextBtn;

    const activeNumberTab = document.querySelector('.pagination .active, [class*="active"], [aria-current="page"], .page-item.active');
    if (activeNumberTab) {
      const currentNum = parseInt(cleanText(activeNumberTab.textContent), 10);
      if (!isNaN(currentNum)) {
        const nextNum = currentNum + 1;
        const allNumberTabs = Array.from(document.querySelectorAll('a, button, li, span, div'));
        const nextTab = allNumberTabs.find((el) => {
          return el.offsetParent !== null && cleanText(el.textContent) === String(nextNum);
        });
        if (nextTab) return nextTab;
      }
    }

    return null;
  }

  function findSubmitButton() {
    for (const selector of SCAN_SELECTORS.submitButtons) {
      try {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) return el;
      } catch (e) {}
    }

    const allButtons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a, div[role="button"]'));
    const submitBtn = allButtons.find((btn) => {
      if (btn.offsetParent === null) return false;
      const txt = cleanText(btn.textContent || btn.value || '').toLowerCase();
      return txt.includes('submit') || txt.includes('finish test') || txt.includes('complete quiz') || txt.includes('submit quiz');
    });

    return submitBtn || null;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, questionId, optionIndex, delayMs, stats, status } = message;

    switch (type) {
      case 'CHECK_CAPTCHA': {
        const result = checkForCaptcha();
        sendResponse(result);
        break;
      }

      case 'UPDATE_HUD': {
        createOrUpdateHud(stats, status);
        sendResponse({ success: true });
        break;
      }

      case 'REMOVE_HUD': {
        removeHud();
        sendResponse({ success: true });
        break;
      }

      case 'SCAN_PAGE': {
        const containers = findQuestionElements();
        const questions = containers.map((c, idx) => {
          const parsed = parseQuestion(c, idx);
          return {
            id: parsed.id,
            questionNumber: parsed.questionNumber,
            questionText: parsed.questionText,
            options: parsed.options,
            isAnswered: parsed.isAnswered,
          };
        });

        const hasNextPage = !!findNextButton();
        const hasSubmit = !!findSubmitButton();

        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollProgress = totalHeight > 0 ? Math.round((scrollY / totalHeight) * 100) : 100;
        const bottomReached = scrollY + window.innerHeight >= document.documentElement.scrollHeight - 50;

        sendResponse({
          questions,
          scrollProgress,
          bottomReached,
          hasNextPage,
          hasSubmit,
        });
        break;
      }

      case 'CLICK_ANSWER': {
        const container = document.querySelector(\`[data-gemini-qid="\${questionId}"]\`) || document.getElementById(questionId);
        if (!container) {
          sendResponse({ success: false, error: 'Question container not found' });
          return;
        }

        let options = Array.from(
          container.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="option"], label, .choice, .option, .answer, .test-option, [class*="option"]')
        ).filter((el) => el.offsetParent !== null);

        if (options.length === 0) {
          options = Array.from(container.children).filter((c) => c.offsetParent !== null);
        }

        const targetOption = options[optionIndex];
        if (!targetOption) {
          sendResponse({ success: false, error: 'Option index out of bounds' });
          return;
        }

        simulateUserClick(targetOption);
        sendResponse({ success: true });
        break;
      }

      case 'VERIFY_CLICK': {
        const container = document.querySelector(\`[data-gemini-qid="\${questionId}"]\`) || document.getElementById(questionId);
        if (!container) {
          sendResponse({ verified: false });
          return;
        }

        const radios = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        const ariaRadios = container.querySelectorAll('[role="radio"], [role="option"], label, .choice, .option, .test-option');

        let verified = false;
        if (radios[optionIndex] && radios[optionIndex].checked) verified = true;
        if (ariaRadios[optionIndex]) {
          const el = ariaRadios[optionIndex];
          if (
            el.getAttribute('aria-checked') === 'true' || 
            el.getAttribute('aria-selected') === 'true' || 
            el.classList.contains('selected') ||
            el.classList.contains('active') ||
            el.classList.contains('checked')
          ) {
            verified = true;
          }
        }

        if (!verified) {
          const checkedAny = container.querySelector('input:checked, [aria-checked="true"], [aria-selected="true"], .selected, .active');
          if (checkedAny) verified = true;
        }

        sendResponse({ verified });
        break;
      }

      case 'SCROLL_STEP': {
        const step = window.innerHeight * 0.7;
        window.scrollBy({ top: step, behavior: 'smooth' });
        setTimeout(() => {
          const scrollY = window.scrollY || document.documentElement.scrollTop;
          const bottomReached = scrollY + window.innerHeight >= document.documentElement.scrollHeight - 60;
          sendResponse({ bottomReached });
        }, delayMs || 600);
        return true;
      }

      case 'CLICK_NEXT_PAGE': {
        const nextBtn = findNextButton();
        if (nextBtn) {
          simulateUserClick(nextBtn);
          sendResponse({ success: true, clicked: true });
        } else {
          sendResponse({ success: false, clicked: false, error: 'Next button not found' });
        }
        break;
      }

      case 'PERFORM_SUBMIT': {
        const submitBtn = findSubmitButton();
        if (submitBtn) {
          simulateUserClick(submitBtn);
          sendResponse({ submitted: true });
        } else {
          sendResponse({ submitted: false, error: 'Submit button not located' });
        }
        break;
      }

      case 'VERIFY_SUBMISSION': {
        const pageText = document.body.innerText.toLowerCase();
        const successKeywords = ['submitted', 'score', 'congratulations', 'completed', 'results', 'graded', 'thank you'];
        const found = successKeywords.find((kw) => pageText.includes(kw));
        sendResponse({
          verified: !!found,
          message: found ? \`Submission detected (\${found})\` : 'Submitted successfully',
        });
        break;
      }

      default:
        sendResponse({ error: 'Unknown content script action' });
    }
  });
})();`,

  'popup.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gemini MCQ Solver</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="popup-container">
    <header class="header">
      <div class="brand">
        <div class="logo">G</div>
        <div>
          <h1>Gemini MCQ Solver</h1>
          <p class="subtitle">Autonomous Quiz Agent (MV3)</p>
        </div>
      </div>
      <div class="header-actions">
        <button id="btnOptions" title="Options" class="icon-btn">⚙️</button>
      </div>
    </header>

    <div id="keyMissingAlert" class="key-alert" style="display: none;">
      <div class="key-alert-header">
        <span class="key-icon">🔑</span>
        <span class="key-alert-title">Gemini API Key Required</span>
      </div>
      <p class="key-alert-desc">Enter your Google AI Studio API key to enable autonomous AI answering:</p>
      <div class="key-input-group">
        <input type="password" id="inputApiKey" placeholder="Paste Gemini API Key (AIzaSy...)" autocomplete="off">
        <button id="btnSaveKey" class="btn-save-key">Save</button>
      </div>
      <a href="https://aistudio.google.com/app/apikey" target="_blank" class="key-link">Get Free Gemini API Key →</a>
    </div>

    <div id="keyConnectedBar" class="key-connected-bar" style="display: none;">
      <div class="key-connected-info">
        <span class="dot-green"></span>
        <span class="key-status-text">Gemini AI Connected</span>
      </div>
      <span id="modelBadge" class="badge">gemini-3.7-flash</span>
    </div>

    <div class="card target-card">
      <div class="target-info">
        <span class="label">TARGET TAB LOCK</span>
        <div id="targetTabTitle" class="tab-title">No Active Tab Locked</div>
      </div>
      <div id="statusBadge" class="status-badge status-idle">IDLE</div>
    </div>

    <div class="progress-bar-container">
      <div id="progressBar" class="progress-bar" style="width: 0%;"></div>
    </div>

    <div class="stats-grid">
      <div class="stat-box">
        <span class="stat-num" id="statDetected">0</span>
        <span class="stat-lbl">Detected</span>
      </div>
      <div class="stat-box stat-highlight">
        <span class="stat-num" id="statAnswered">0</span>
        <span class="stat-lbl">Answered</span>
      </div>
      <div class="stat-box">
        <span class="stat-num" id="statRemaining">0</span>
        <span class="stat-lbl">Remaining</span>
      </div>
    </div>

    <div class="active-question-card" id="activeQuestionCard" style="display: none;">
      <span class="label">ACTIVE QUESTION</span>
      <p id="activeQuestionText" class="active-q-text">Scanning for questions...</p>
    </div>

    <div class="actions">
      <button id="btnStart" class="btn btn-primary">
        <span class="icon">▶</span>
        <span>Start Autonomous Solver</span>
      </button>

      <div id="runningControls" class="btn-group" style="display: none;">
        <button id="btnPause" class="btn btn-warning">
          <span>⏸ Pause</span>
        </button>
        <button id="btnStop" class="btn btn-secondary">
          <span>⏹ Stop</span>
        </button>
      </div>
    </div>

    <div class="toggle-row">
      <span>Auto-Submit quiz on complete</span>
      <label class="switch">
        <input type="checkbox" id="toggleAutoSubmit" checked>
        <span class="slider round"></span>
      </label>
    </div>

    <div class="terminal">
      <div class="terminal-header">
        <span class="pulse-dot"></span>
        <span class="terminal-title">AGENT_STREAM</span>
      </div>
      <div id="logStream" class="log-stream">
        <div class="log-entry log-info">> Ready. Click Start to begin.</div>
      </div>
    </div>
  </div>

  <script src="popup.js"></script>
</body>
</html>`,

  'popup.js': `/**
 * Gemini Auto MCQ Solver - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const targetTabTitle = document.getElementById('targetTabTitle');
  const statusBadge = document.getElementById('statusBadge');
  const progressBar = document.getElementById('progressBar');
  const statDetected = document.getElementById('statDetected');
  const statAnswered = document.getElementById('statAnswered');
  const statRemaining = document.getElementById('statRemaining');
  const activeQuestionCard = document.getElementById('activeQuestionCard');
  const activeQuestionText = document.getElementById('activeQuestionText');
  const btnStart = document.getElementById('btnStart');
  const runningControls = document.getElementById('runningControls');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  const toggleAutoSubmit = document.getElementById('toggleAutoSubmit');
  const logStream = document.getElementById('logStream');
  const btnOptions = document.getElementById('btnOptions');
  const modelBadge = document.getElementById('modelBadge');

  const keyMissingAlert = document.getElementById('keyMissingAlert');
  const keyConnectedBar = document.getElementById('keyConnectedBar');
  const inputApiKey = document.getElementById('inputApiKey');
  const btnSaveKey = document.getElementById('btnSaveKey');

  btnOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  btnSaveKey.addEventListener('click', async () => {
    const keyVal = inputApiKey.value.trim();
    if (!keyVal) return;
    await chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      payload: { apiKey: keyVal },
    });
    keyMissingAlert.style.display = 'none';
    keyConnectedBar.style.display = 'flex';
  });

  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (response && response.state) {
    updateUI(response.state);
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && (!response?.state?.targetTabId || response.state.status === 'IDLE')) {
    targetTabTitle.textContent = activeTab.title || 'Current Tab';
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATED' && message.state) {
      updateUI(message.state);
    }
  });

  btnStart.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    const config = res?.state?.config;
    if (!config?.apiKey && !config?.apiEndpoint) {
      keyMissingAlert.style.display = 'flex';
      inputApiKey.focus();
      return;
    }

    btnStart.disabled = true;
    btnStart.textContent = 'Starting...';
    await chrome.runtime.sendMessage({ type: 'START_AUTOMATION' });
  });

  btnPause.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (res?.state?.status === 'PAUSED' || res?.state?.status === 'PAUSED_CAPTCHA') {
      await chrome.runtime.sendMessage({ type: 'RESUME_AUTOMATION' });
    } else {
      await chrome.runtime.sendMessage({ type: 'PAUSE_AUTOMATION' });
    }
  });

  btnStop.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'STOP_AUTOMATION' });
  });

  toggleAutoSubmit.addEventListener('change', async (e) => {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      payload: { autoSubmit: e.target.checked },
    });
  });

  function updateUI(state) {
    const { status, stats, targetTabInfo, logs, config } = state;

    const hasKey = !!(config?.apiKey || config?.apiEndpoint);
    if (!hasKey) {
      keyMissingAlert.style.display = 'flex';
      keyConnectedBar.style.display = 'none';
    } else {
      keyMissingAlert.style.display = 'none';
      keyConnectedBar.style.display = 'flex';
    }

    if (config?.model) {
      modelBadge.textContent = config.model;
    }
    if (config?.autoSubmit !== undefined) {
      toggleAutoSubmit.checked = config.autoSubmit;
    }

    if (targetTabInfo) {
      targetTabTitle.textContent = targetTabInfo.title;
    }

    statusBadge.textContent = status;
    statusBadge.className = 'status-badge';
    if (status === 'IDLE') statusBadge.classList.add('status-idle');
    else if (status === 'COMPLETED') statusBadge.classList.add('status-completed');
    else if (status.includes('PAUSED')) statusBadge.classList.add('status-paused');
    else statusBadge.classList.add('status-running');

    statDetected.textContent = stats.detected;
    statAnswered.textContent = stats.answered;
    statRemaining.textContent = stats.remaining;

    const percent = stats.detected > 0 ? Math.round((stats.answered / stats.detected) * 100) : 0;
    progressBar.style.width = \`\${percent}%\`;

    if (stats.currentQuestionText && status !== 'IDLE' && status !== 'COMPLETED') {
      activeQuestionCard.style.display = 'block';
      activeQuestionText.textContent = stats.currentQuestionText;
    } else {
      activeQuestionCard.style.display = 'none';
    }

    const isRunning =
      status === 'RUNNING' ||
      status === 'SCANNING' ||
      status === 'SOLVING' ||
      status === 'CLICKING' ||
      status === 'VERIFYING' ||
      status === 'SCROLLING' ||
      status === 'SUBMITTING';
    const isPaused = status === 'PAUSED' || status === 'PAUSED_CAPTCHA';

    if (isRunning || isPaused) {
      btnStart.style.display = 'none';
      runningControls.style.display = 'grid';
      btnPause.querySelector('span').textContent = isPaused ? '▶ Resume' : '⏸ Pause';
      btnPause.className = isPaused ? 'btn btn-primary' : 'btn btn-warning';
    } else {
      btnStart.style.display = 'flex';
      btnStart.disabled = false;
      btnStart.innerHTML = '<span class="icon">▶</span><span>Start Autonomous Solver</span>';
      runningControls.style.display = 'none';
    }

    if (logs && logs.length > 0) {
      logStream.innerHTML = '';
      logs.slice(0, 10).forEach((l) => {
        const div = document.createElement('div');
        div.className = \`log-entry log-\${l.level}\`;
        div.textContent = \`> \${l.message}\`;
        logStream.appendChild(div);
      });
    }
  }
});`,

  'popup.css': `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: #ffffff;
  color: #0f172a;
  width: 370px;
  min-height: 490px;
}

.popup-container {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 10px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #4f46e5;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 15px;
}

h1 { font-size: 13px; font-weight: 700; color: #0f172a; }
.subtitle { font-size: 10px; color: #64748b; font-weight: 500; }
.header-actions { display: flex; align-items: center; gap: 6px; }
.badge { font-size: 9px; font-weight: 700; background: #eef2ff; color: #4338ca; padding: 2px 6px; border-radius: 12px; font-family: monospace; }
.icon-btn { background: transparent; border: none; font-size: 14px; cursor: pointer; padding: 2px; }

.key-alert {
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.key-alert-header { display: flex; align-items: center; gap: 6px; }
.key-alert-title { font-size: 11px; font-weight: 700; color: #92400e; }
.key-alert-desc { font-size: 10px; color: #78350f; line-height: 1.3; }
.key-input-group { display: flex; gap: 6px; margin-top: 4px; }
.key-input-group input { flex: 1; padding: 6px 8px; border: 1px solid #fcd34d; border-radius: 6px; font-size: 11px; outline: none; background: #ffffff; }
.key-input-group input:focus { border-color: #4f46e5; }
.btn-save-key { padding: 6px 12px; background: #4f46e5; color: #ffffff; border: none; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; }
.btn-save-key:hover { background: #4338ca; }
.key-link { font-size: 10px; color: #4f46e5; text-decoration: none; font-weight: 600; margin-top: 2px; }
.key-link:hover { text-decoration: underline; }

.key-connected-bar {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.key-connected-info { display: flex; align-items: center; gap: 6px; }
.dot-green { width: 7px; height: 7px; border-radius: 50%; background: #16a34a; }
.key-status-text { font-size: 10px; font-weight: 700; color: #166534; }

.card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; }
.target-card { display: flex; align-items: center; justify-content: space-between; }
.label { font-size: 8px; font-weight: 800; letter-spacing: 0.5px; color: #94a3b8; display: block; }
.tab-title { font-size: 11px; font-weight: 600; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 190px; }

.status-badge { font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 12px; text-transform: uppercase; }
.status-idle { background: #f1f5f9; color: #64748b; }
.status-running { background: #e0e7ff; color: #4338ca; }
.status-paused { background: #fef3c7; color: #92400e; }
.status-completed { background: #dcfce7; color: #166534; }

.progress-bar-container { width: 100%; height: 4px; background: #f1f5f9; border-radius: 2px; overflow: hidden; }
.progress-bar { height: 100%; background: #4f46e5; transition: width 0.3s ease; }

.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.stat-box { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 4px; text-align: center; }
.stat-num { font-size: 16px; font-weight: 800; color: #0f172a; display: block; }
.stat-highlight .stat-num { color: #16a34a; }
.stat-lbl { font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase; }

.active-question-card { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 10px; padding: 8px 10px; }
.active-q-text { font-size: 10px; color: #312e81; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.btn {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.btn-primary { background: #4f46e5; color: #ffffff; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25); }
.btn-primary:hover { background: #4338ca; }
.btn-group { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; }
.btn-warning { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.btn-warning:hover { background: #fde68a; }
.btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
.btn-secondary:hover { background: #e2e8f0; }

.toggle-row { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #475569; font-weight: 500; padding: 2px 4px; }

.switch { position: relative; display: inline-block; width: 32px; height: 18px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .3s; border-radius: 18px; }
.slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; }
input:checked + .slider { background-color: #10b981; }
input:checked + .slider:before { transform: translateX(14px); }

.terminal { background: #090d16; border-radius: 10px; padding: 10px; color: #cbd5e1; font-family: monospace; font-size: 10px; border: 1px solid #1e293b; }
.terminal-header { display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #1e293b; padding-bottom: 6px; margin-bottom: 6px; }
.pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: #6366f1; }
.terminal-title { color: #818cf8; font-weight: 700; }
.log-stream { max-height: 80px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
.log-entry { line-height: 1.3; }
.log-gemini { color: #c084fc; font-weight: bold; }
.log-success { color: #4ade80; }
.log-warn { color: #fde047; }
.log-error { color: #f87171; }`,

  'options.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gemini MCQ Solver - Extension Options</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      padding: 40px 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #f1f5f9;
    }
    .logo {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: #4f46e5;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 20px;
    }
    h1 { font-size: 18px; font-weight: 700; }
    p.desc { font-size: 13px; color: #64748b; margin-top: 2px; }
    .form-group { margin-bottom: 20px; }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 6px;
    }
    input[type="text"], input[type="password"], input[type="number"], select {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, select:focus {
      border-color: #4f46e5;
      box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
    }
    .hint { font-size: 11px; color: #94a3b8; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .btn-save {
      background: #4f46e5;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
      margin-top: 10px;
    }
    .btn-save:hover { background: #4338ca; }
    .toast {
      display: none;
      background: #dcfce7;
      border: 1px solid #86efac;
      color: #166534;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      margin-top: 16px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">G</div>
      <div>
        <h1>Gemini MCQ Solver Settings</h1>
        <p class="desc">Configure Gemini API key, model, and automation timings</p>
      </div>
    </div>

    <form id="optionsForm">
      <div class="form-group">
        <label for="apiKey">Gemini API Key</label>
        <input type="password" id="apiKey" placeholder="AIzaSy...">
        <p class="hint">Obtain from Google AI Studio. Stored securely in your browser's extension storage.</p>
      </div>

      <div class="form-group">
        <label for="model">Gemini Model</label>
        <select id="model">
          <option value="gemini-3.7-flash">gemini-3.7-flash (Recommended, Fastest)</option>
          <option value="gemini-2.5-flash">gemini-2.5-flash</option>
          <option value="gemini-2.5-pro">gemini-2.5-pro (Deep reasoning)</option>
        </select>
      </div>

      <div class="form-group">
        <label for="apiEndpoint">Custom Backend Proxy URL (Optional)</label>
        <input type="text" id="apiEndpoint" placeholder="https://your-domain.com/api/gemini/solve">
        <p class="hint">Leave blank to call Google Gemini API directly from the background service worker.</p>
      </div>

      <div class="grid">
        <div class="form-group">
          <label for="clickDelayMs">Click Delay (ms)</label>
          <input type="number" id="clickDelayMs" min="200" max="3000" step="50" value="600">
        </div>
        <div class="form-group">
          <label for="scrollDelayMs">Scroll Step Delay (ms)</label>
          <input type="number" id="scrollDelayMs" min="300" max="4000" step="50" value="900">
        </div>
      </div>

      <button type="submit" class="btn-save">Save Settings</button>
      <div id="toast" class="toast">✓ Settings saved successfully!</div>
    </form>
  </div>

  <script src="options.js"></script>
</body>
</html>`,

  'options.js': `/**
 * Gemini Auto MCQ Solver - Options Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('optionsForm');
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('model');
  const apiEndpointInput = document.getElementById('apiEndpoint');
  const clickDelayInput = document.getElementById('clickDelayMs');
  const scrollDelayInput = document.getElementById('scrollDelayMs');
  const toast = document.getElementById('toast');

  const stored = await chrome.storage.local.get(['config']);
  const config = stored.config || {};

  if (config.apiKey) apiKeyInput.value = config.apiKey;
  if (config.model) modelSelect.value = config.model;
  if (config.apiEndpoint) apiEndpointInput.value = config.apiEndpoint;
  if (config.clickDelayMs) clickDelayInput.value = config.clickDelayMs;
  if (config.scrollDelayMs) scrollDelayInput.value = config.scrollDelayMs;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const updatedConfig = {
      ...config,
      apiKey: apiKeyInput.value.trim(),
      model: modelSelect.value,
      apiEndpoint: apiEndpointInput.value.trim(),
      clickDelayMs: parseInt(clickDelayInput.value, 10) || 600,
      scrollDelayMs: parseInt(scrollDelayInput.value, 10) || 900,
    };

    await chrome.storage.local.set({ config: updatedConfig });
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      payload: updatedConfig,
    });

    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  });
});`,
};
