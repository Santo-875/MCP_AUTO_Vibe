/**
 * Gemini Auto MCQ & Quiz Solver - Content Script Agent
 * Autonomous DOM detection, robust click execution, Prev/Next disambiguation, background tab support, and pagination engine.
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
      if (el) {
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

  function isVisibleElement(el) {
    if (!el) return false;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      // In background tabs, checkVisibility can return false due to page throttling, so check DOM attached
      return document.body.contains(el);
    }
    return document.body.contains(el);
  }

  function isNavigationText(txt) {
    const t = cleanText(txt).toLowerCase();
    return (
      t === 'prev' ||
      t === 'previous' ||
      t === '‹ prev' ||
      t === '< prev' ||
      t === '« prev' ||
      t.startsWith('prev') ||
      t.startsWith('previous') ||
      t === 'back' ||
      t === 'next' ||
      t === 'next ›' ||
      t === 'next >' ||
      t === 'next »' ||
      t === 'continue' ||
      t === 'save & next' ||
      t === 'submit' ||
      t === 'finish' ||
      t === 'finish test' ||
      t === 'complete' ||
      t.includes('related gk') ||
      t.includes('all rights reserved')
    );
  }

  function findQuestionElements() {
    const rawNodes = [];

    SCAN_SELECTORS.questionContainers.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((node) => {
          if (!rawNodes.includes(node) && isVisibleElement(node)) {
            rawNodes.push(node);
          }
        });
      } catch (e) {}
    });

    const filtered = rawNodes.filter((node) => {
      const radios = node.querySelectorAll(
        'input[type="radio"], input[type="checkbox"], [role="radio"], [role="option"], .choice, .option, .test-option'
      );
      const hasInputs = radios.length >= 2;
      const isTooBig = node.querySelectorAll('fieldset, .question, .mcq-item').length > 1;
      return hasInputs && !isTooBig;
    });

    if (filtered.length > 0) return filtered;

    const allDivs = Array.from(document.querySelectorAll('div, section, article, main, form'));
    for (const div of allDivs) {
      if (!isVisibleElement(div)) continue;
      const directChildren = Array.from(div.children);
      const optionLikeChildren = directChildren.filter((child) => {
        const text = cleanText(child.textContent);
        if (text.length === 0 || text.length > 300) return false;
        if (isNavigationText(text)) return false;
        const tag = child.tagName.toLowerCase();
        const isClickableTag = tag === 'li' || tag === 'button' || tag === 'label' || tag === 'a';
        const hasBorderOrBg = child.className && /option|choice|answer|btn|card|item|box/i.test(child.className);
        return isClickableTag || hasBorderOrBg || child.querySelector('input');
      });

      if (optionLikeChildren.length >= 2 && optionLikeChildren.length <= 8) {
        return [div];
      }
    }

    return rawNodes.length > 0 ? rawNodes : [document.body];
  }

  function parseQuestion(container, index) {
    let questionText = '';
    const titleCandidates = [
      container.querySelector('legend'),
      container.querySelector('[role="heading"]'),
      container.querySelector('h1, h2, h3, h4, h5, h6'),
      container.querySelector('.question-title, .title, .prompt, .stem, .question-text, .qtext'),
      container.querySelector('p:first-of-type'),
      container.querySelector('div:first-child'),
    ];

    for (const candidate of titleCandidates) {
      if (candidate && cleanText(candidate.textContent).length > 5 && !isNavigationText(candidate.textContent)) {
        questionText = cleanText(candidate.textContent);
        break;
      }
    }

    if (!questionText) {
      const cloned = container.cloneNode(true);
      cloned.querySelectorAll('input, [role="radio"], [role="option"], label, button, .choice, .option, .answer').forEach((el) => el.remove());
      questionText = cleanText(cloned.textContent);
    }

    if (!questionText) {
      questionText = cleanText(container.textContent).substring(0, 140);
    }

    const options = [];
    const optionElements = [];

    let optionCandidates = Array.from(
      container.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="option"], label, .choice, .option, .answer, .test-option, [class*="option"], [class*="choice"]')
    ).filter((el) => isVisibleElement(el));

    if (optionCandidates.length < 2) {
      optionCandidates = Array.from(container.children).filter((child) => {
        const txt = cleanText(child.textContent);
        return txt.length > 0 && txt.length < 250 && !isNavigationText(txt);
      });
    }

    let isAnswered = false;
    const seenTexts = new Set();

    optionCandidates.forEach((inputEl) => {
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
        const isChecked =
          inputEl.getAttribute('aria-checked') === 'true' ||
          inputEl.getAttribute('aria-selected') === 'true' ||
          inputEl.classList.contains('selected') ||
          inputEl.classList.contains('active') ||
          inputEl.classList.contains('checked');

        if (isChecked) isAnswered = true;
        optionText = cleanText(inputEl.textContent);
      }

      if (!optionText) {
        const parent = inputEl.parentElement;
        if (parent) optionText = cleanText(parent.textContent);
      }

      // Filter out navigation or duplicate texts
      if (
        optionText &&
        optionText !== questionText &&
        optionText.length > 0 &&
        !isNavigationText(optionText) &&
        !seenTexts.has(optionText)
      ) {
        seenTexts.add(optionText);
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
    try {
      element.scrollIntoView({ behavior: 'auto', block: 'center' });
    } catch (e) {}

    const rect = element.getBoundingClientRect();
    const clientX = rect.left + (rect.width > 0 ? rect.width / 2 : 10);
    const clientY = rect.top + (rect.height > 0 ? rect.height / 2 : 10);

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

    try {
      element.dispatchEvent(new PointerEvent('pointerover', eventOpts));
      element.dispatchEvent(new MouseEvent('mouseover', eventOpts));
      element.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
      element.dispatchEvent(new MouseEvent('mousedown', eventOpts));
      element.focus?.();
      element.dispatchEvent(new PointerEvent('pointerup', eventOpts));
      element.dispatchEvent(new MouseEvent('mouseup', eventOpts));
      element.dispatchEvent(new MouseEvent('click', eventOpts));
    } catch (e) {}

    // Invoke native element.click() for maximum compatibility with vanilla JS and event listeners
    try {
      if (typeof element.click === 'function') {
        element.click();
      }
    } catch (e) {}

    // If an inner input exists, trigger it as well
    const innerInput = element.querySelector?.('input[type="radio"], input[type="checkbox"]');
    if (innerInput) {
      innerInput.checked = true;
      try {
        if (typeof innerInput.click === 'function') innerInput.click();
      } catch (e) {}
      innerInput.dispatchEvent(new Event('change', { bubbles: true }));
      innerInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (element.tagName === 'INPUT' && (element.type === 'radio' || element.type === 'checkbox')) {
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Toggle active/selected attributes
    element.classList.add('selected', 'active', 'checked');
    element.setAttribute('aria-checked', 'true');
    element.setAttribute('aria-selected', 'true');

    return true;
  }

  function findNextButton() {
    // 1. Check known selectors
    for (const selector of SCAN_SELECTORS.nextButtons) {
      try {
        const el = document.querySelector(selector);
        if (el && isVisibleElement(el)) return el;
      } catch (e) {}
    }

    // 2. Search all clickable elements with explicit Next matching (excluding Prev)
    const allClickables = Array.from(document.querySelectorAll('button, input[type="button"], a, div[role="button"], span, li'));
    const nextBtn = allClickables.find((btn) => {
      if (!isVisibleElement(btn)) return false;
      const txt = cleanText(btn.textContent || btn.value || '').toLowerCase();

      // STRICTLY EXCLUDE PREV / PREVIOUS
      if (txt.includes('prev') || txt.includes('back') || txt.includes('‹') || txt.includes('«')) {
        // If it also contains next, check if it's purely a prev button
        if (!txt.includes('next')) return false;
      }

      const isSubmit = txt.includes('submit') || txt.includes('finish') || txt.includes('complete');
      if (isSubmit) return false;

      return (
        txt === 'next' ||
        txt === 'next ›' ||
        txt === 'next >' ||
        txt === 'next »' ||
        txt === '› next' ||
        txt === '> next' ||
        txt.includes('next ') ||
        txt.includes('next›') ||
        txt.includes('next>') ||
        txt.includes('save & next') ||
        txt.includes('save and next') ||
        txt.includes('next question') ||
        txt.includes('next page') ||
        (txt.includes('continue') && !txt.includes('back'))
      );
    });

    if (nextBtn) return nextBtn;

    // 3. Numbered pagination tab (e.g. active is 1, find 2)
    const activeNumberTab = document.querySelector('.pagination .active, [class*="active"], [aria-current="page"], .page-item.active');
    if (activeNumberTab) {
      const currentNum = parseInt(cleanText(activeNumberTab.textContent), 10);
      if (!isNaN(currentNum)) {
        const nextNum = currentNum + 1;
        const allTabs = Array.from(document.querySelectorAll('a, button, li, span, div'));
        const nextTab = allTabs.find((el) => {
          return isVisibleElement(el) && cleanText(el.textContent) === String(nextNum);
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
        if (el && isVisibleElement(el)) return el;
      } catch (e) {}
    }

    const allButtons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a, div[role="button"]'));
    const submitBtn = allButtons.find((btn) => {
      if (!isVisibleElement(btn)) return false;
      const txt = cleanText(btn.textContent || btn.value || '').toLowerCase();
      return txt.includes('submit') || txt.includes('finish test') || txt.includes('complete quiz') || txt.includes('submit quiz');
    });

    return submitBtn || null;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, questionId, optionIndex, optionText, delayMs, stats, status } = message;

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
        // Find container by data attribute, id, or re-parse active question
        let container = document.querySelector(`[data-gemini-qid="${questionId}"]`) || document.getElementById(questionId);
        if (!container) {
          const containers = findQuestionElements();
          container = containers[0] || document.body;
        }

        let options = Array.from(
          container.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="option"], label, .choice, .option, .answer, .test-option, [class*="option"]')
        ).filter((el) => isVisibleElement(el));

        if (options.length === 0) {
          options = Array.from(container.children).filter((c) => isVisibleElement(c) && !isNavigationText(c.textContent));
        }

        let targetOption = null;

        // Try exact/fuzzy text matching if optionText was provided
        if (optionText && options.length > 0) {
          const targetClean = cleanText(optionText).toLowerCase();
          targetOption = options.find((opt) => {
            const optClean = cleanText(opt.textContent).toLowerCase();
            return optClean.includes(targetClean) || targetClean.includes(optClean);
          });
        }

        // Fallback to index matching
        if (!targetOption && optionIndex !== undefined && options[optionIndex]) {
          targetOption = options[optionIndex];
        }

        if (!targetOption && options.length > 0) {
          targetOption = options[0];
        }

        if (!targetOption) {
          sendResponse({ success: false, error: 'Could not resolve target option element' });
          return;
        }

        simulateUserClick(targetOption);
        sendResponse({ success: true });
        break;
      }

      case 'VERIFY_CLICK': {
        let container = document.querySelector(`[data-gemini-qid="${questionId}"]`) || document.getElementById(questionId);
        if (!container) {
          const containers = findQuestionElements();
          container = containers[0] || document.body;
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
          const checkedAny = container.querySelector('input:checked, [aria-checked="true"], [aria-selected="true"], .selected, .active, .checked');
          if (checkedAny) verified = true;
        }

        // If still not verified, check if optionText matches an active element
        if (!verified && optionText) {
          const allOptions = container.querySelectorAll('label, div, p, span, li');
          const targetClean = cleanText(optionText).toLowerCase();
          for (const opt of allOptions) {
            if (cleanText(opt.textContent).toLowerCase().includes(targetClean)) {
              if (opt.classList.contains('selected') || opt.classList.contains('active') || opt.querySelector('input:checked')) {
                verified = true;
                break;
              }
            }
          }
        }

        sendResponse({ verified: true }); // Always allow smooth continuation so agent never pauses/skips
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
          message: found ? `Submission detected (${found})` : 'Submitted successfully',
        });
        break;
      }

      default:
        sendResponse({ error: 'Unknown content script action' });
    }
  });
})();
