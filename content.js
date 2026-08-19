/**
 * Gemini Auto MCQ & Quiz Solver - Content Script Agent
 * Autonomous DOM detection, interaction simulation, verification, and scrolling engine.
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
      '[data-question-id]',
      '[id*="question"]',
      '[class*="question"]',
      'div:has(input[type="radio"])',
      'div:has([role="radio"])',
      'div:has([role="option"])',
      'li:has(input[type="radio"])',
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
      '[data-value]',
      'button[role="radio"]',
      'button:not([type="submit"])',
      'div[tabindex="0"]',
    ],
    submitButtons: [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has(span:contains("Submit"))',
      'button:has(span:contains("Finish"))',
      'button:has(span:contains("Complete"))',
      'a.submit-button',
      '.quiz-submit',
      '[data-action="submit"]',
      '#submit-quiz',
      '#quiz-submit-button',
    ],
    captcha: [
      'iframe[src*="recaptcha"]',
      'iframe[src*="turnstile"]',
      'iframe[src*="hcaptcha"]',
      '.g-recaptcha',
      '.cf-turnstile',
      '#turnstile-wrapper',
      '#recaptcha',
      '[id*="captcha"]',
      '[class*="captcha"]',
    ],
  };

  let overlayHudElement = null;

  function createOrUpdateHud(stats, status) {
    if (!overlayHudElement) {
      overlayHudElement = document.createElement('div');
      overlayHudElement.id = 'gemini-mcq-solver-hud';
      overlayHudElement.style.cssText = `
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
      `;
      document.body.appendChild(overlayHudElement);
    }

    overlayHudElement.innerHTML = `
      <div style="width: 8px; height: 8px; border-radius: 50%; background: #6366f1; animation: pulse 1.5s infinite;"></div>
      <div>
        <div style="font-weight: bold; font-size: 11px; color: #a5b4fc; text-transform: uppercase; letter-spacing: 0.5px;">Gemini Solver</div>
        <div style="font-size: 13px; font-weight: 600; color: #ffffff;">${status || 'Active'}</div>
      </div>
      <div style="height: 24px; width: 1px; background: #4338ca; margin: 0 4px;"></div>
      <div style="text-align: right;">
        <div style="font-size: 10px; color: #94a3b8;">Answered</div>
        <div style="font-size: 13px; font-weight: bold; color: #34d399;">${stats?.answered || 0} / ${stats?.detected || 0}</div>
      </div>
    `;
  }

  function removeHud() {
    if (overlayHudElement) {
      overlayHudElement.remove();
      overlayHudElement = null;
    }
  }

  function checkForCaptcha() {
    for (const selector of SCAN_SELECTORS.captcha) {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        return {
          captchaDetected: true,
          captchaType: selector.includes('turnstile') ? 'Cloudflare Turnstile' : 'reCAPTCHA / Security Challenge',
        };
      }
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
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function findQuestionElements() {
    const rawNodes = [];
    SCAN_SELECTORS.questionContainers.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((node) => {
          if (!rawNodes.includes(node) && node.offsetParent !== null) {
            rawNodes.push(node);
          }
        });
      } catch (e) {}
    });

    const filtered = rawNodes.filter((node) => {
      const radios = node.querySelectorAll('input[type="radio"], [role="radio"], [role="option"]');
      const hasInputs = radios.length >= 2;
      const isTooBig = node.querySelectorAll('fieldset, .question').length > 1;
      return hasInputs && !isTooBig;
    });

    return filtered.length > 0 ? filtered : rawNodes;
  }

  function parseQuestion(container, index) {
    let questionText = '';
    const titleCandidates = [
      container.querySelector('legend'),
      container.querySelector('[role="heading"]'),
      container.querySelector('h1, h2, h3, h4, h5, h6'),
      container.querySelector('.question-title, .title, .prompt, .stem, .question-text'),
      container.querySelector('div:first-child'),
    ];

    for (const candidate of titleCandidates) {
      if (candidate && cleanText(candidate.textContent).length > 5) {
        questionText = cleanText(candidate.textContent);
        break;
      }
    }

    if (!questionText) {
      const cloned = container.cloneNode(true);
      cloned.querySelectorAll('input, [role="radio"], label, button, .choice, .option').forEach((el) => el.remove());
      questionText = cleanText(cloned.textContent);
    }

    if (!questionText) {
      questionText = cleanText(container.textContent).substring(0, 100);
    }

    const options = [];
    const optionElements = [];

    const radioInputs = Array.from(
      container.querySelectorAll('input[type="radio"], [role="radio"], [role="option"], .choice, .option')
    ).filter((el) => el.offsetParent !== null);

    let isAnswered = false;

    radioInputs.forEach((inputEl, optIdx) => {
      let optionText = '';
      let targetClickElement = inputEl;

      if (inputEl.tagName === 'INPUT') {
        if (inputEl.checked) isAnswered = true;
        if (inputEl.id) {
          const label = document.querySelector(`label[for="${inputEl.id}"]`);
          if (label) {
            optionText = cleanText(label.textContent);
            targetClickElement = label;
          }
        }
        if (!optionText && inputEl.closest('label')) {
          optionText = cleanText(inputEl.closest('label').textContent);
          targetClickElement = inputEl.closest('label');
        }
      } else {
        if (inputEl.getAttribute('aria-checked') === 'true' || inputEl.getAttribute('aria-selected') === 'true') {
          isAnswered = true;
        }
        optionText = cleanText(inputEl.textContent);
      }

      if (!optionText) {
        const parent = inputEl.parentElement;
        if (parent) optionText = cleanText(parent.textContent);
      }

      if (optionText) {
        options.push(optionText);
        optionElements.push(targetClickElement);
      }
    });

    const uniqueId = container.id || hashString(questionText);
    container.setAttribute('data-gemini-qid', uniqueId);

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

    if (element.tagName === 'INPUT' && element.type === 'radio') {
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    return true;
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

        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollProgress = totalHeight > 0 ? Math.round((scrollY / totalHeight) * 100) : 100;
        const bottomReached = scrollY + window.innerHeight >= document.documentElement.scrollHeight - 50;

        sendResponse({
          questions,
          scrollProgress,
          bottomReached,
        });
        break;
      }

      case 'CLICK_ANSWER': {
        const container = document.querySelector(`[data-gemini-qid="${questionId}"]`) || document.getElementById(questionId);
        if (!container) {
          sendResponse({ success: false, error: 'Question container not found' });
          return;
        }

        const options = Array.from(
          container.querySelectorAll('input[type="radio"], [role="radio"], [role="option"], label, .choice, .option')
        ).filter((el) => el.offsetParent !== null);

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
        const container = document.querySelector(`[data-gemini-qid="${questionId}"]`) || document.getElementById(questionId);
        if (!container) {
          sendResponse({ verified: false });
          return;
        }

        const radio = container.querySelectorAll('input[type="radio"]')[optionIndex];
        const ariaRadio = container.querySelectorAll('[role="radio"], [role="option"]')[optionIndex];

        let verified = false;
        if (radio && radio.checked) verified = true;
        if (ariaRadio && (ariaRadio.getAttribute('aria-checked') === 'true' || ariaRadio.getAttribute('aria-selected') === 'true')) {
          verified = true;
        }
        if (ariaRadio && ariaRadio.classList.contains('selected')) verified = true;

        if (!verified) {
          const checkedAny = container.querySelector('input:checked, [aria-checked="true"], [aria-selected="true"]');
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

      case 'PERFORM_SUBMIT': {
        let submitBtn = null;
        for (const selector of SCAN_SELECTORS.submitButtons) {
          const el = document.querySelector(selector);
          if (el && el.offsetParent !== null) {
            submitBtn = el;
            break;
          }
        }

        if (!submitBtn) {
          const allButtons = Array.from(document.querySelectorAll('button, input[type="button"], a.btn'));
          submitBtn = allButtons.find((btn) => {
            const txt = cleanText(btn.textContent).toLowerCase();
            return txt.includes('submit') || txt.includes('finish') || txt.includes('complete');
          });
        }

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
        const successKeywords = ['submitted', 'score', 'congratulations', 'completed', 'results', 'graded'];
        const found = successKeywords.find((kw) => pageText.includes(kw));
        sendResponse({
          verified: !!found,
          message: found ? `Submission detected (${found})` : 'Submitted successfully',
        });
        break;
      }

      default:
        sendResponse({ error: 'Unknown content script action' });
    }
  });
})();
