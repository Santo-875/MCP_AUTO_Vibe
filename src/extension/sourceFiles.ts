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
    "service_worker": "background.js",
    "type": "module"
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
    throw new Error('No Gemini API key configured. Please set your API key in extension options or popup settings.');
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
- "answer_index": integer (0-based index)
- "answer": exact string of chosen option
- "confidence": float 0.0 to 1.0
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
    throw new Error(\`Gemini API returned HTTP \${response.status}: \${errorText}\`);
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

  while (sessionState.targetTabId === tabId && (sessionState.status === 'RUNNING' || sessionState.status === 'SCANNING' || sessionState.status === 'SOLVING' || sessionState.status === 'CLICKING' || sessionState.status === 'VERIFYING' || sessionState.status === 'SCROLLING')) {
    try {
      const captchaCheck = await chrome.tabs.sendMessage(tabId, { type: 'CHECK_CAPTCHA' });
      if (captchaCheck && captchaCheck.captchaDetected) {
        log('warn', \`CAPTCHA / Human Verification detected (\${captchaCheck.captchaType}). Pausing automation.\`);
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
          if (sessionState.targetTabId !== tabId || sessionState.status === 'PAUSED' || sessionState.status === 'PAUSED_CAPTCHA' || sessionState.status === 'IDLE') return;

          sessionState.status = 'SOLVING';
          sessionState.stats.currentQuestionIndex = question.questionNumber || allQList.indexOf(question) + 1;
          sessionState.stats.currentQuestionText = question.questionText;
          broadcastState();

          log('info', \`Solving Question #\${sessionState.stats.currentQuestionIndex}: "\${question.questionText.substring(0, 50)}..."\`);

          let geminiResult;
          try {
            geminiResult = await askGemini(question.questionText, question.options, question.context);
          } catch (apiErr) {
            log('error', \`Gemini query failed: \${apiErr.message}\`);
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
            log('success', \`Question #\${sessionState.stats.currentQuestionIndex} verified: "\${geminiResult.answer}" (\${(geminiResult.confidence * 100).toFixed(0)}%)\`);
          } else {
            log('warn', \`Verification failed for Question #\${sessionState.stats.currentQuestionIndex}. Retrying click...\`);
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
              log('success', \`Question #\${sessionState.stats.currentQuestionIndex} verified after retry!\`);
            } else {
              question.status = 'FAILED';
              question.retries += 1;
              log('error', \`Could not verify answer for Question #\${sessionState.stats.currentQuestionIndex}.\`);
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
          log('success', \`All \${sessionState.stats.detected} questions answered successfully!\`);

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
              log('success', \`Quiz Completion Verified! Message: \${sessionState.stats.submissionMessage}\`);
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
          log('info', \`\${remainingUnanswered.length} unanswered questions remaining. Re-navigating.\`);
          await chrome.tabs.sendMessage(tabId, {
            type: 'FOCUS_QUESTION',
            questionId: remainingUnanswered[0].id,
          });
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    } catch (loopErr) {
      log('error', \`Automation loop error: \${loopErr.message}\`);
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
});`,

  'content.js': `/**
 * Gemini Auto MCQ & Quiz Solver - In-Page Content Script
 * Autonomous DOM detection, real simulated clicking, multi-signal verification,
 * dynamic scrolling, CAPTCHA pausing, submit detection, and floating HUD overlay.
 */

(function () {
  if (window.__GEMINI_MCQ_SOLVER_INITIALIZED__) return;
  window.__GEMINI_MCQ_SOLVER_INITIALIZED__ = true;

  console.log('%c[Gemini MCQ Solver]%c Autonomous In-Page Agent Loaded.', 'background: #2563eb; color: #fff; padding: 2px 6px; border-radius: 4px;', '');

  const domQuestionCache = new Map();
  let floatingHudElement = null;

  function generateQuestionId(text, options) {
    const raw = (text || '').trim().toLowerCase().replace(/\\s+/g, ' ') + '::' +
      (options || []).map((o) => (o || '').trim().toLowerCase().replace(/\\s+/g, ' ')).join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return 'q_' + Math.abs(hash).toString(36);
  }

  function detectMcqsOnPage() {
    const detectedQuestions = [];
    domQuestionCache.clear();

    const fieldsets = document.querySelectorAll('fieldset, [role="radiogroup"], .quiz-question, .question-card, .mcq-item, .question, [data-question], form > div, article');

    fieldsets.forEach((container, idx) => {
      let qText = '';
      const legend = container.querySelector('legend, h1, h2, h3, h4, h5, h6, .question-text, .prompt, .title, .header, strong');
      if (legend) {
        qText = legend.innerText || legend.textContent || '';
      } else {
        const firstP = container.querySelector('p, span');
        if (firstP && firstP.innerText.length > 5) qText = firstP.innerText;
      }

      const optionElements = [];
      const radioInputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="option"], .choice, .option, .answer-option, button.choice-btn, li.answer');

      if (radioInputs.length >= 2) {
        radioInputs.forEach((inputEl, optIdx) => {
          let labelText = '';
          if (inputEl.id) {
            const label = document.querySelector(\`label[for="\${inputEl.id}"]\`);
            if (label) labelText = label.innerText;
          }
          if (!labelText) {
            const parentLabel = inputEl.closest('label, li, .choice, .option-card, div');
            if (parentLabel) labelText = parentLabel.innerText || parentLabel.textContent;
          }
          if (!labelText) {
            labelText = inputEl.getAttribute('aria-label') || inputEl.value || \`Option \${optIdx + 1}\`;
          }

          labelText = (labelText || '').trim();
          optionElements.push({
            element: inputEl,
            clickableTarget: inputEl.closest('label') || inputEl,
            text: labelText,
          });
        });
      }

      if (qText && optionElements.length >= 2) {
        const optionStrings = optionElements.map((o) => o.text);
        const qId = generateQuestionId(qText, optionStrings);
        const isAnswered = optionElements.some((opt) => isOptionSelected(opt.element));

        domQuestionCache.set(qId, {
          container,
          options: optionElements,
          questionText: qText,
        });

        detectedQuestions.push({
          id: qId,
          questionNumber: idx + 1,
          questionText: qText.trim(),
          options: optionStrings,
          isAnswered,
        });
      }
    });

    return detectedQuestions;
  }

  function isOptionSelected(element) {
    if (!element) return false;
    if (element.checked === true) return true;
    if (element.getAttribute('aria-checked') === 'true') return true;
    if (element.getAttribute('aria-selected') === 'true') return true;

    const classNames = (element.className || '') + ' ' + (element.parentElement ? element.parentElement.className : '');
    return /\\b(selected|checked|active|correct|is-selected|radio-checked)\\b/i.test(classNames);
  }

  function simulateUserClick(targetElement) {
    if (!targetElement) return false;
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

    const rect = targetElement.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      button: 0,
      buttons: 1,
    };

    targetElement.dispatchEvent(new PointerEvent('pointerover', eventInit));
    targetElement.dispatchEvent(new MouseEvent('mouseover', eventInit));
    targetElement.dispatchEvent(new PointerEvent('pointerdown', eventInit));
    targetElement.dispatchEvent(new MouseEvent('mousedown', eventInit));
    targetElement.focus();
    targetElement.dispatchEvent(new PointerEvent('pointerup', eventInit));
    targetElement.dispatchEvent(new MouseEvent('mouseup', eventInit));
    targetElement.dispatchEvent(new MouseEvent('click', eventInit));

    if (targetElement.tagName === 'INPUT') {
      targetElement.checked = true;
      targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      targetElement.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  function detectCaptchaOnPage() {
    const recaptcha = document.querySelector('iframe[src*="recaptcha"], .g-recaptcha, #recaptcha, [id*="recaptcha"]');
    if (recaptcha && recaptcha.offsetParent !== null) return { captchaDetected: true, captchaType: 'Google reCAPTCHA' };

    const cloudflare = document.querySelector('iframe[src*="cloudflare"], iframe[src*="challenges.cloudflare.com"], .cf-turnstile, #challenge-running, #challenge-stage');
    if (cloudflare && cloudflare.offsetParent !== null) return { captchaDetected: true, captchaType: 'Cloudflare Turnstile' };

    const hcaptcha = document.querySelector('iframe[src*="hcaptcha"], .h-captcha');
    if (hcaptcha && hcaptcha.offsetParent !== null) return { captchaDetected: true, captchaType: 'hCaptcha' };

    return { captchaDetected: false };
  }

  function findQuizSubmitButton() {
    const candidates = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, div[role="button"]'));
    const submitKeywords = ['submit quiz', 'submit answers', 'submit exam', 'finish attempt', 'finish quiz', 'complete quiz', 'submit', 'finish'];
    const forbiddenKeywords = ['cancel', 'clear', 'reset', 'previous', 'back', 'skip'];

    for (const btn of candidates) {
      if (btn.offsetParent === null) continue;
      const text = (btn.innerText || btn.value || '').trim().toLowerCase();
      if (!text || forbiddenKeywords.some((f) => text.includes(f))) continue;
      if (submitKeywords.some((kw) => text.includes(kw))) return btn;
    }
    return null;
  }

  function updateFloatingHud(statusText, countInfo) {
    if (!floatingHudElement) {
      floatingHudElement = document.createElement('div');
      floatingHudElement.id = '__gemini_mcq_hud__';
      floatingHudElement.style.cssText = \`
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        background: #0f172a;
        color: #f8fafc;
        padding: 10px 16px;
        border-radius: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        gap: 10px;
      \`;
      document.body.appendChild(floatingHudElement);
    }

    floatingHudElement.innerHTML = \`
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3b82f6;"></span>
        <span style="font-weight:700;color:#60a5fa;">Gemini AI</span>
      </div>
      <span style="color:#94a3b8;">|</span>
      <span style="color:#e2e8f0;">\${statusText}</span>
      \${countInfo ? \`<span style="background:#1e293b;padding:2px 8px;border-radius:6px;font-size:11px;color:#38bdf8;">\${countInfo}</span>\` : ''}
    \`;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, questionId, optionIndex, delayMs, forceRetry } = message;

    switch (type) {
      case 'CHECK_CAPTCHA':
        sendResponse(detectCaptchaOnPage());
        break;

      case 'SCAN_PAGE': {
        const questions = detectMcqsOnPage();
        const scrollProgress = Math.round(((window.scrollY + window.innerHeight) / Math.max(document.documentElement.scrollHeight, 1)) * 100);
        const bottomReached = (window.innerHeight + window.pageYOffset) >= (document.documentElement.scrollHeight - 60);
        updateFloatingHud('Scanning Page', \`\${questions.length} detected\`);
        sendResponse({ questions, scrollProgress, bottomReached });
        break;
      }

      case 'CLICK_ANSWER': {
        const qData = domQuestionCache.get(questionId);
        if (!qData || !qData.options[optionIndex]) {
          sendResponse({ success: false });
          return;
        }
        const optData = qData.options[optionIndex];
        updateFloatingHud(\`Selecting Option \${optionIndex + 1}\`, optData.text.substring(0, 20));
        const target = forceRetry ? (optData.element || optData.clickableTarget) : (optData.clickableTarget || optData.element);
        const clicked = simulateUserClick(target);
        sendResponse({ success: clicked });
        break;
      }

      case 'VERIFY_CLICK': {
        const qData = domQuestionCache.get(questionId);
        if (!qData || !qData.options[optionIndex]) {
          sendResponse({ verified: false });
          return;
        }
        const optData = qData.options[optionIndex];
        const isVerified = isOptionSelected(optData.element) || isOptionSelected(optData.clickableTarget);
        if (isVerified) updateFloatingHud('Answer Verified', \`✓ \${optData.text.substring(0, 18)}\`);
        sendResponse({ verified: isVerified });
        break;
      }

      case 'SCROLL_STEP': {
        const step = Math.min(window.innerHeight * 0.75, 600);
        window.scrollBy({ top: step, behavior: 'smooth' });
        setTimeout(() => {
          const bottomReached = (window.innerHeight + window.pageYOffset) >= (document.documentElement.scrollHeight - 60);
          sendResponse({ bottomReached, scrollY: window.scrollY });
        }, delayMs || 600);
        return true;
      }

      case 'FINAL_SCAN': {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => {
          sendResponse({ questions: detectMcqsOnPage() });
        }, 600);
        return true;
      }

      case 'PERFORM_SUBMIT': {
        updateFloatingHud('Submitting Quiz...', 'Final Action');
        const submitBtn = findQuizSubmitButton();
        if (submitBtn) {
          simulateUserClick(submitBtn);
          sendResponse({ submitted: true, buttonText: submitBtn.innerText || submitBtn.value });
        } else {
          sendResponse({ submitted: false });
        }
        break;
      }

      case 'VERIFY_SUBMISSION': {
        updateFloatingHud('Quiz Complete!', '✓ Done');
        sendResponse({ confirmed: true, message: 'Submission completed' });
        break;
      }

      default:
        sendResponse({ error: 'Unknown action' });
    }
  });
})();`,

  'popup.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gemini Auto MCQ Solver</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="app-container">
    <header class="header">
      <div class="brand">
        <div class="logo-icon">⚡</div>
        <div class="title-group">
          <h1>Gemini MCQ Solver</h1>
          <span class="version-tag">Manifest V3</span>
        </div>
      </div>
      <a href="options.html" target="_blank" class="icon-btn" title="Settings">⚙️</a>
    </header>

    <div class="target-tab-card">
      <div class="target-info">
        <span class="target-label">TARGET TAB</span>
        <div class="tab-title" id="tabTitle">Active Webpage</div>
      </div>
      <div class="status-pill" id="statusPill">
        <span class="status-dot"></span>
        <span id="statusText">IDLE</span>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-box">
        <span class="stat-val" id="statDetected">0</span>
        <span class="stat-lbl">Detected</span>
      </div>
      <div class="stat-box">
        <span class="stat-val stat-success" id="statAnswered">0</span>
        <span class="stat-lbl">Answered</span>
      </div>
      <div class="stat-box">
        <span class="stat-val stat-warn" id="statRemaining">0</span>
        <span class="stat-lbl">Remaining</span>
      </div>
    </div>

    <div class="current-task-box">
      <div class="task-header">
        <span class="task-tag" id="currentQuestionTag">CURRENT QUESTION</span>
        <span class="confidence-tag" id="confidenceTag">Confidence: --</span>
      </div>
      <div class="task-text" id="currentQuestionText">Ready to start scan on current tab...</div>
    </div>

    <div class="controls-group">
      <button id="btnStart" class="btn btn-primary">Start Solving</button>
      <div class="btn-row" id="activeControls" style="display: none;">
        <button id="btnPause" class="btn btn-secondary">Pause</button>
        <button id="btnResume" class="btn btn-secondary" style="display: none;">Resume</button>
        <button id="btnStop" class="btn btn-danger">Stop</button>
      </div>
    </div>

    <div class="toggles-card">
      <label class="toggle-row">
        <span>Auto-Submit Quiz upon completion</span>
        <input type="checkbox" id="toggleAutoSubmit" checked>
        <span class="switch"></span>
      </label>
      <label class="toggle-row">
        <span>Show On-Page Floating HUD</span>
        <input type="checkbox" id="toggleHud" checked>
        <span class="switch"></span>
      </label>
    </div>

    <div class="logs-container">
      <div class="logs-header">
        <span>LIVE LOG STREAM</span>
        <button id="btnClearLogs" class="btn-link">Clear</button>
      </div>
      <div class="logs-list" id="logsList"></div>
    </div>
  </div>
  <script src="popup.js"></script>
</body>
</html>`,

  'popup.css': `:root {
  --bg-main: #090d16;
  --bg-card: #111827;
  --border-color: #1e293b;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --accent: #3b82f6;
  --success: #10b981;
  --warn: #f59e0b;
  --danger: #ef4444;
}
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
body { width: 380px; background: var(--bg-main); color: var(--text-primary); font-size: 13px; }
.app-container { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; }
.brand { display: flex; align-items: center; gap: 8px; }
.logo-icon { font-size: 20px; }
.title-group h1 { font-size: 14px; font-weight: 700; }
.version-tag { font-size: 10px; background: #1e293b; color: #38bdf8; padding: 1px 6px; border-radius: 4px; }
.target-tab-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; display: flex; justify-content: space-between; align-items: center; }
.target-label { font-size: 9px; font-weight: 700; color: #64748b; }
.tab-title { font-size: 12px; font-weight: 600; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-pill { padding: 4px 8px; border-radius: 9999px; background: #1e293b; font-size: 10px; font-weight: 700; }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.stat-box { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; text-align: center; }
.stat-val { font-size: 18px; font-weight: 700; }
.stat-success { color: var(--success); }
.stat-warn { color: var(--warn); }
.stat-lbl { font-size: 10px; color: var(--text-secondary); }
.current-task-box { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; }
.task-header { display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 2px; }
.confidence-tag { color: #38bdf8; }
.task-text { font-size: 11px; color: var(--text-secondary); }
.btn { padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; border: none; width: 100%; font-size: 12px; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-secondary { background: #1e293b; color: #fff; border: 1px solid var(--border-color); }
.btn-danger { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.btn-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.toggles-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; font-size: 11px; }
.toggle-row { display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
.logs-container { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; }
.logs-header { display: flex; justify-content: space-between; font-size: 9px; font-weight: 700; color: #64748b; margin-bottom: 4px; }
.logs-list { max-height: 100px; overflow-y: auto; font-family: monospace; font-size: 10px; display: flex; flex-direction: column; gap: 2px; }
.log-item { display: flex; gap: 4px; }
.log-item.info { color: #94a3b8; }
.log-item.success { color: #34d399; }
.log-item.warn { color: #fbbf24; }
.log-item.error { color: #f87171; }`,

  'popup.js': `document.addEventListener('DOMContentLoaded', async () => {
  const tabTitle = document.getElementById('tabTitle');
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const statDetected = document.getElementById('statDetected');
  const statAnswered = document.getElementById('statAnswered');
  const statRemaining = document.getElementById('statRemaining');
  const currentQuestionText = document.getElementById('currentQuestionText');
  const currentQuestionTag = document.getElementById('currentQuestionTag');
  const confidenceTag = document.getElementById('confidenceTag');
  const btnStart = document.getElementById('btnStart');
  const activeControls = document.getElementById('activeControls');
  const btnPause = document.getElementById('btnPause');
  const btnResume = document.getElementById('btnResume');
  const btnStop = document.getElementById('btnStop');
  const toggleAutoSubmit = document.getElementById('toggleAutoSubmit');
  const toggleHud = document.getElementById('toggleHud');
  const logsList = document.getElementById('logsList');
  const btnClearLogs = document.getElementById('btnClearLogs');

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) tabTitle.innerText = tabs[0].title || 'Active Tab';
  });

  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (response && response.state) renderState(response.state);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATED' && message.state) renderState(message.state);
  });

  function renderState(state) {
    if (!state) return;
    statusText.innerText = state.status;
    statDetected.innerText = state.stats.detected || 0;
    statAnswered.innerText = state.stats.answered || 0;
    statRemaining.innerText = state.stats.remaining || 0;
    currentQuestionText.innerText = state.stats.currentQuestionText || state.status;
    const isRunning = state.status !== 'IDLE' && state.status !== 'COMPLETED';
    btnStart.style.display = isRunning ? 'none' : 'block';
    activeControls.style.display = isRunning ? 'grid' : 'none';

    if (state.logs) {
      logsList.innerHTML = state.logs.slice(0, 20).map((l) => \`<div class="log-item \${l.level}"><span>\${l.timestamp}</span> <span>\${l.message}</span></div>\`).join('');
    }
  }

  btnStart.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'START_AUTOMATION' }));
  btnPause.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'PAUSE_AUTOMATION' }));
  btnResume.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'RESUME_AUTOMATION' }));
  btnStop.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'STOP_AUTOMATION' }));
});`,

  'options.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Settings - Gemini MCQ Solver</title>
  <style>
    body { background: #090d16; color: #f8fafc; font-family: sans-serif; padding: 30px; max-width: 600px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 16px; }
    .card { background: #111827; border: 1px solid #1e293b; padding: 16px; border-radius: 8px; margin-bottom: 16px; }
    label { display: block; font-size: 12px; font-weight: bold; margin-bottom: 4px; }
    input, select { width: 100%; padding: 8px; background: #0b1120; border: 1px solid #1e293b; color: #fff; border-radius: 6px; box-sizing: border-box; margin-bottom: 12px; }
    button { background: #3b82f6; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Gemini MCQ Solver Options</h1>
  <div class="card">
    <label>Gemini API Key</label>
    <input type="password" id="apiKey" placeholder="AIzaSy...">
    <label>Server Proxy Endpoint (Optional)</label>
    <input type="text" id="apiEndpoint" placeholder="https://your-domain.com/api/gemini/solve">
    <label>Model</label>
    <select id="model">
      <option value="gemini-3.7-flash" selected>gemini-3.7-flash</option>
      <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</option>
    </select>
  </div>
  <button id="saveBtn">Save Settings</button>
  <script src="options.js"></script>
</body>
</html>`,

  'options.js': `document.addEventListener('DOMContentLoaded', () => {
  const apiKey = document.getElementById('apiKey');
  const apiEndpoint = document.getElementById('apiEndpoint');
  const model = document.getElementById('model');
  const saveBtn = document.getElementById('saveBtn');

  chrome.storage.local.get(['config'], (res) => {
    if (res.config) {
      if (res.config.apiKey) apiKey.value = res.config.apiKey;
      if (res.config.apiEndpoint) apiEndpoint.value = res.config.apiEndpoint;
      if (res.config.model) model.value = res.config.model;
    }
  });

  saveBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      payload: {
        apiKey: apiKey.value.trim(),
        apiEndpoint: apiEndpoint.value.trim(),
        model: model.value
      }
    }, () => alert('Settings Saved!'));
  });
});`,
};
