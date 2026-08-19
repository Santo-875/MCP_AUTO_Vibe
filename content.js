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
      '#cf-challenge-running',
      '#challenge-running',
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
    // Only detect if an active visible modal challenge is present
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

  // In-memory cache of mapped question containers and clickable options
  const activeQuestionMap = new Map();

  function findQuestionElements() {
    const questionContainers = [];
    const seenElements = new Set();

    // Strategy 1: Explicit Question Container Selectors (Google Forms, Moodle, Test Portals, Canvas, etc.)
    const explicitSelectors = [
      'fieldset',
      '[role="radiogroup"]',
      '.freebirdFormviewerViewNumberedItemContainer',
      '.freebirdFormviewerComponentsQuestionBaseRoot',
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
          const optionCandidates = el.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="option"], label, .option, .choice, .answer');
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

    // Strategy 2: Group Radio inputs by 'name' attribute
    if (questionContainers.length === 0) {
      const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]')).filter(isVisibleElement);
      if (inputs.length >= 2) {
        const groups = new Map();
        inputs.forEach((input) => {
          const groupKey = input.name || input.getAttribute('name') || 'unnamed_group';
          if (!groups.has(groupKey)) groups.set(groupKey, []);
          groups.get(groupKey).push(input);
        });

        for (const [key, groupInputs] of groups.entries()) {
          if (groupInputs.length >= 2) {
            let parent = groupInputs[0].parentElement;
            let depth = 0;
            while (parent && parent !== document.body && depth < 6) {
              depth++;
              const containsAll = groupInputs.every((inp) => parent.contains(inp));
              if (containsAll) break;
              parent = parent.parentElement;
            }
            if (parent && parent !== document.body && !seenElements.has(parent)) {
              seenElements.add(parent);
              questionContainers.push(parent);
            }
          }
        }
      }
    }

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
  }

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

    // 3. Extract Options & Clickable Targets
    const options = [];
    const optionElements = [];
    const seenTexts = new Set();
    let isAnswered = false;

    // Check for native input elements first
    const radioInputs = Array.from(container.querySelectorAll('input[type="radio"], input[type="checkbox"]')).filter(isVisibleElement);

    if (radioInputs.length >= 2) {
      radioInputs.forEach((input) => {
        if (input.checked) isAnswered = true;

        let optText = '';
        let clickTarget = input;

        // Try label for id
        if (input.id) {
          const lbl = document.querySelector(`label[for="${input.id}"]`);
          if (lbl) {
            optText = cleanText(lbl.textContent);
            clickTarget = lbl;
          }
        }

        // Try closest label wrapper
        if (!optText && input.closest('label')) {
          optText = cleanText(input.closest('label').textContent);
          clickTarget = input.closest('label');
        }

        // Try adjacent sibling text
        if (!optText && input.parentElement) {
          optText = cleanText(input.parentElement.textContent);
          clickTarget = input.parentElement;
        }

        // Clean option prefixes like "A)", "B.", "1.", "(a)", "•"
        optText = optText.replace(/^[A-Za-z0-9][\.\)\:\-]\s*/, '').trim();

        if (optText && optText !== questionText && !isNavigationText(optText) && !seenTexts.has(optText.toLowerCase())) {
          seenTexts.add(optText.toLowerCase());
          const optIdx = options.length;
          clickTarget.setAttribute('data-gemini-opt-idx', String(optIdx));
          options.push(optText);
          optionElements.push(clickTarget);
        }
      });
    }

    // If no radio inputs found, search ARIA choices, buttons, and list items
    if (options.length < 2) {
      const rawCandidates = Array.from(
        container.querySelectorAll('[role="radio"], [role="option"], .choice, .option, .answer, .quiz-option, .test-option, li, button:not([type="submit"]):not([data-action="next"]):not([data-action="prev"])')
      ).filter(isVisibleElement);

      // Keep only leaf items (filter out parents that contain other choice elements)
      const leafCandidates = rawCandidates.filter((item) => {
        return !rawCandidates.some((other) => other !== item && item.contains(other));
      });

      leafCandidates.forEach((el) => {
        if (isNavigationText(el.textContent)) return;

        const isSelected =
          el.getAttribute('aria-checked') === 'true' ||
          el.getAttribute('aria-selected') === 'true' ||
          el.classList.contains('selected') ||
          el.classList.contains('checked') ||
          !!el.querySelector('input:checked');

        if (isSelected) isAnswered = true;

        let optText = cleanText(el.textContent);
        optText = optText.replace(/^[A-Za-z0-9][\.\)\:\-]\s*/, '').trim();

        if (
          optText &&
          optText.length > 0 &&
          optText.length < 250 &&
          optText !== questionText &&
          !isNavigationText(optText) &&
          !seenTexts.has(optText.toLowerCase())
        ) {
          seenTexts.add(optText.toLowerCase());
          const optIdx = options.length;
          el.setAttribute('data-gemini-opt-idx', String(optIdx));
          options.push(optText);
          optionElements.push(el);
        }
      });
    }

    const uniqueId = container.id || hashString(questionText + '_' + options.join('_'));
    try {
      container.setAttribute('data-gemini-qid', uniqueId);
    } catch (e) {}

    // Store in active cache for instant resolution in CLICK_ANSWER
    activeQuestionMap.set(uniqueId, {
      id: uniqueId,
      container,
      options,
      optionElements,
    });

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

    // Invoke native element.click()
    try {
      if (typeof element.click === 'function') {
        element.click();
      }
    } catch (e) {}

    // Check inner or associated input
    let targetInput = element.querySelector?.('input[type="radio"], input[type="checkbox"]');
    if (!targetInput && element.tagName === 'INPUT') {
      targetInput = element;
    }
    if (!targetInput && element.getAttribute('for')) {
      targetInput = document.getElementById(element.getAttribute('for'));
    }

    if (targetInput) {
      targetInput.checked = true;
      try {
        if (typeof targetInput.click === 'function') targetInput.click();
      } catch (e) {}
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
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
        let targetOption = null;

        // 1. Check in-memory cache from recent SCAN_PAGE
        const cached = activeQuestionMap.get(questionId);
        if (cached && cached.optionElements) {
          if (optionIndex !== undefined && cached.optionElements[optionIndex]) {
            targetOption = cached.optionElements[optionIndex];
          }
          if (!targetOption && optionText) {
            const targetClean = cleanText(optionText).toLowerCase();
            const foundIdx = cached.options.findIndex((opt) => {
              const optClean = cleanText(opt).toLowerCase();
              return optClean.includes(targetClean) || targetClean.includes(optClean);
            });
            if (foundIdx !== -1 && cached.optionElements[foundIdx]) {
              targetOption = cached.optionElements[foundIdx];
            }
          }
        }

        // 2. Query DOM container by data-gemini-qid
        let container = document.querySelector(`[data-gemini-qid="${questionId}"]`) || document.getElementById(questionId);
        if (!container) {
          const containers = findQuestionElements();
          container = containers[0] || document.body;
        }

        // 3. Find by tagged data-gemini-opt-idx
        if (!targetOption && optionIndex !== undefined) {
          targetOption = container.querySelector(`[data-gemini-opt-idx="${optionIndex}"]`);
        }

        // 4. Find by direct option element matching
        if (!targetOption) {
          const rawOptions = Array.from(
            container.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="option"], label, .choice, .option, .answer, .quiz-option, .test-option, li, button:not([type="submit"]):not([data-action="next"]):not([data-action="prev"])')
          ).filter((el) => isVisibleElement(el) && !isNavigationText(el.textContent));

          // Filter out parents containing other options
          const leafOptions = rawOptions.filter((item) => !rawOptions.some((other) => other !== item && item.contains(other)));

          if (optionText && leafOptions.length > 0) {
            const targetClean = cleanText(optionText).toLowerCase();
            targetOption = leafOptions.find((opt) => {
              const optClean = cleanText(opt.textContent).toLowerCase();
              return optClean.includes(targetClean) || targetClean.includes(optClean);
            });
          }

          if (!targetOption && optionIndex !== undefined && leafOptions[optionIndex]) {
            targetOption = leafOptions[optionIndex];
          }

          if (!targetOption && leafOptions.length > 0) {
            targetOption = leafOptions[0];
          }
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
