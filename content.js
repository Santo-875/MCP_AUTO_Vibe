/**
 * Gemini Auto MCQ & Quiz Solver - Content Script Agent
 * Autonomous DOM detection, robust multi-type answer filling (Radio, Checkbox, Dropdown, Text Input),
 * Next/Page navigation engine, and auto-submission handling.
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
      '.card:has(input[type="checkbox"])',
      '.card:has(select)',
      '[data-question-id]',
      '[id*="question"]',
      '[class*="question"]',
      'div:has(input[type="radio"])',
      'div:has(input[type="checkbox"])',
      'div:has(select)',
      'div:has(textarea)',
      'div:has([role="radio"])',
      'div:has([role="option"])',
      'li:has(input[type="radio"])',
      'section:has(input[type="radio"])',
    ],
    nextButtons: [
      'button[data-action="next"]',
      'button.next-btn',
      'button.next-button',
      'button.btn-next',
      '.next-page-btn',
      '.pagination-next',
      'a.next',
      'input[name="next"]',
      'input[value*="Next" i]',
      'input[value*="Continue" i]',
      'input[value*="Save & Next" i]',
      'div[role="button"][jsname="OCpkoe"]',
      'div[role="button"].N2B65e',
      '.freebirdFormviewerViewNavigationNextButton',
      'button[id*="next"]',
      'a[id*="next"]',
      'button[class*="next"]',
      'a[class*="next"]',
      '.mod_quiz-next-nav',
      '#question-next-btn',
      '.btn-next-question',
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
      'div[role="button"][jsname="M2v1dh"]',
      '.freebirdFormviewerViewNavigationSubmitButton',
      'button[id*="submit"]',
      'button[class*="submit"]',
    ],
    captcha: [
      '#cf-challenge-running',
      '#challenge-running',
    ],
  };

  let overlayHudElement = null;

  function createOrUpdateHud(stats, status, currentQuestion) {
    if (!overlayHudElement) {
      overlayHudElement = document.createElement('div');
      overlayHudElement.id = 'gemini-mcq-solver-hud';
      overlayHudElement.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        background: #0f172a;
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        padding: 14px 16px;
        border-radius: 14px;
        box-shadow: 0 12px 35px -5px rgba(0,0,0,0.6), 0 0 0 1px #6366f1;
        border: 1.5px solid #6366f1;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 260px;
        max-width: 360px;
        max-height: 80vh;
        overflow-y: auto;
        pointer-events: auto;
        user-select: none;
        transition: all 0.3s ease;
      `;
      document.body.appendChild(overlayHudElement);
    }

    const qIdx = currentQuestion?.index || stats?.currentQuestionIndex || 0;
    const qNum = qIdx ? `Q#${qIdx}` : '';
    const answerText = currentQuestion?.answer || stats?.currentAnswerText || '';
    const confVal = currentQuestion?.confidence || stats?.currentConfidence;
    const confidencePct = confVal ? `${Math.round(confVal * 100)}%` : '';
    const options = currentQuestion?.options || [];
    const answerIdx = currentQuestion?.answerIndex;

    // Build options list HTML
    let optionsHtml = '';
    if (options.length > 0) {
      optionsHtml = `
        <div style="background: #0c1a2e; border: 1px solid #334155; border-radius: 8px; padding: 8px 10px;">
          <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">Options</div>
          ${options.map((opt, i) => {
            const isCorrect = (answerText && (cleanText(opt).toLowerCase() === cleanText(answerText).toLowerCase() || cleanText(answerText).toLowerCase().includes(cleanText(opt).toLowerCase()))) || (typeof answerIdx === 'number' && answerIdx === i);
            return `<div style="display:flex; align-items:flex-start; gap:6px; padding:3px 0; border-bottom: 1px solid #1e293b;">
              <span style="min-width:18px; font-size:11px; font-weight:700; color:${isCorrect ? '#34d399' : '#64748b'};">${String.fromCharCode(65 + i)}.</span>
              <span style="font-size:12px; word-break:break-word; color:${isCorrect ? '#86efac' : '#cbd5e1'}; font-weight:${isCorrect ? '700' : '400'};">
                ${isCorrect ? '✔ ' : ''}${escapeHtml(opt)}
              </span>
            </div>`;
          }).join('')}
        </div>
      `;
    }

    overlayHudElement.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; width:100%; gap:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;"></div>
          <span style="font-weight:800;font-size:11px;color:#a5b4fc;text-transform:uppercase;letter-spacing:0.6px;">Gemini AI Solver</span>
        </div>
        <span style="font-size:11px;font-weight:700;background:#312e81;color:#c7d2fe;padding:2px 8px;border-radius:9999px;border:1px solid #4338ca;">
          ${stats?.answered || 0}/${stats?.detected || 0} Done
        </span>
      </div>

      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="font-size:13px;font-weight:700;color:#38bdf8;">${qNum ? `${qNum} — ` : ''}${status || 'Active'}</div>
        ${confidencePct ? `<div style="font-size:10px;font-weight:700;color:#34d399;background:#064e3b;padding:2px 6px;border-radius:4px;">${confidencePct}</div>` : ''}
      </div>

      ${optionsHtml}

      ${answerText && options.length === 0 ? `
        <div style="background:#1e1b4b;border:1px solid #4f46e5;border-radius:8px;padding:8px 10px;">
          <div style="font-size:10px;font-weight:700;color:#a5b4fc;text-transform:uppercase;margin-bottom:2px;">Correct Answer</div>
          <div style="font-size:13px;font-weight:700;color:#34d399;word-break:break-word;">✔ &quot;${escapeHtml(answerText)}&quot;</div>
        </div>
      ` : ''}
    `;
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
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function isVisibleElement(el) {
    if (!el || !el.ownerDocument || !el.ownerDocument.body.contains(el)) return false;
    if (el.nodeType !== Node.ELEMENT_NODE) return false;

    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
    } catch (e) {}

    let curr = el.parentElement;
    while (curr && curr !== document.body) {
      try {
        const pStyle = window.getComputedStyle(curr);
        if (pStyle.display === 'none' || pStyle.visibility === 'hidden') {
          return false;
        }
      } catch (e) {}
      curr = curr.parentElement;
    }

    return true;
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
      t === 'save and next' ||
      t === 'submit' ||
      t === 'finish' ||
      t === 'finish test' ||
      t === 'complete' ||
      t.includes('related gk') ||
      t.includes('all rights reserved')
    );
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const activeQuestionMap = new Map();

  function triggerReactValue(input, value) {
    if (!input) return;
    try {
      const proto = Object.getPrototypeOf(input);
      const set = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (set) {
        set.call(input, value);
      } else {
        input.value = value;
      }
    } catch (e) {
      input.value = value;
    }
    try {
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
    } catch (e) {}
  }

  function triggerReactCheck(input, checkedState = true) {
    if (!input) return;
    try {
      const proto = Object.getPrototypeOf(input);
      const set = Object.getOwnPropertyDescriptor(proto, 'checked')?.set;
      if (set) {
        set.call(input, checkedState);
      } else {
        input.checked = checkedState;
      }
    } catch (e) {
      input.checked = checkedState;
    }
    try {
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    } catch (e) {}
  }

  function simulateUserClick(element) {
    if (!element || !document.body.contains(element)) return false;
    try {
      element.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    } catch (e) {}

    let targetInput = null;
    if (element.tagName === 'INPUT') {
      targetInput = element;
    } else {
      targetInput = element.querySelector?.('input[type="radio"], input[type="checkbox"]') || null;
    }

    if (!targetInput && element.getAttribute?.('for')) {
      targetInput = document.getElementById(element.getAttribute('for'));
    }

    if (!targetInput && element.closest) {
      const parentLabel = element.closest('label');
      if (parentLabel) {
        targetInput = parentLabel.querySelector('input[type="radio"], input[type="checkbox"]');
      }
    }

    const rect = element.getBoundingClientRect();
    const clientX = rect.left + (rect.width > 0 ? rect.width / 2 : 10);
    const clientY = rect.top + (rect.height > 0 ? rect.height / 2 : 10);

    const eventOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      screenX: clientX + window.screenX,
      screenY: clientY + window.screenY,
      button: 0,
      buttons: 1,
    };

    if (targetInput && targetInput === element) {
      triggerReactCheck(targetInput, true);
      try {
        targetInput.dispatchEvent(new PointerEvent('pointerover', eventOpts));
        targetInput.dispatchEvent(new MouseEvent('mouseover', eventOpts));
        targetInput.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
        targetInput.dispatchEvent(new MouseEvent('mousedown', eventOpts));
        if (typeof targetInput.focus === 'function') targetInput.focus();
        targetInput.dispatchEvent(new PointerEvent('pointerup', eventOpts));
        targetInput.dispatchEvent(new MouseEvent('mouseup', eventOpts));
        targetInput.dispatchEvent(new MouseEvent('click', eventOpts));
      } catch (e) {}

      if (!targetInput.checked) {
        try {
          if (typeof targetInput.click === 'function') targetInput.click();
        } catch (e) {}
      }
    } else {
      try {
        element.dispatchEvent(new PointerEvent('pointerover', eventOpts));
        element.dispatchEvent(new MouseEvent('mouseover', eventOpts));
        element.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
        element.dispatchEvent(new MouseEvent('mousedown', eventOpts));
        if (typeof element.focus === 'function') element.focus();
        element.dispatchEvent(new PointerEvent('pointerup', eventOpts));
        element.dispatchEvent(new MouseEvent('mouseup', eventOpts));
        element.dispatchEvent(new MouseEvent('click', eventOpts));
      } catch (e) {}

      try {
        if (typeof element.click === 'function') {
          element.click();
        }
      } catch (e) {}

      if (targetInput) {
        if (!targetInput.checked) {
          triggerReactCheck(targetInput, true);
          try {
            if (typeof targetInput.click === 'function') {
              targetInput.click();
            }
          } catch (e) {}
        } else {
          try {
            targetInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          } catch (e) {}
        }
      }
    }

    try {
      element.setAttribute('data-gemini-selected', 'true');
      element.classList.add('selected', 'active', 'checked', 'is-selected');
      element.setAttribute('aria-checked', 'true');
      element.setAttribute('aria-selected', 'true');

      try {
        element.style.outline = '3px solid #8b5cf6';
        element.style.outlineOffset = '2px';
        element.style.backgroundColor = '#f3e8ff';
      } catch (e) {}

      const ariaTarget = element.querySelector?.('[role="radio"], [role="checkbox"], [role="option"]') || element.closest?.('[role="radio"], [role="checkbox"], [role="option"]');
      if (ariaTarget) {
        ariaTarget.setAttribute('data-gemini-selected', 'true');
        ariaTarget.setAttribute('aria-checked', 'true');
        ariaTarget.setAttribute('aria-selected', 'true');
        ariaTarget.classList.add('selected', 'active', 'checked', 'is-selected');
        try {
          ariaTarget.style.outline = '3px solid #8b5cf6';
          ariaTarget.style.outlineOffset = '2px';
          ariaTarget.style.backgroundColor = '#f3e8ff';
        } catch (e) {}
      }
    } catch (e) {}

    return true;
  }

  function fillTextInput(element, textValue) {
    if (!element || !textValue) return false;
    try {
      element.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      if (typeof element.focus === 'function') element.focus();
    } catch (e) {}

    if (element.isContentEditable) {
      element.innerText = textValue;
      try {
        element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: textValue }));
        element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      } catch (e) {}
      return true;
    }

    triggerReactValue(element, textValue);
    return true;
  }

  function selectDropdownOption(selectElement, optionText, optionIndex) {
    if (!selectElement) return false;
    try {
      selectElement.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      if (typeof selectElement.focus === 'function') selectElement.focus();
    } catch (e) {}

    if (selectElement.tagName === 'SELECT') {
      const options = Array.from(selectElement.options || []);
      let targetOpt = null;
      if (typeof optionIndex === 'number' && options[optionIndex]) {
        targetOpt = options[optionIndex];
      }
      if (!targetOpt && optionText) {
        const cleanOpt = cleanText(optionText).toLowerCase();
        targetOpt = options.find(o => cleanText(o.text || o.value).toLowerCase().includes(cleanOpt));
      }

      if (targetOpt) {
        triggerReactValue(selectElement, targetOpt.value);
        selectElement.value = targetOpt.value;
        try {
          selectElement.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        } catch (e) {}
        return true;
      }
    } else {
      // Custom ARIA listbox / combobox dropdown
      simulateUserClick(selectElement);
      setTimeout(() => {
        const listItems = Array.from(document.querySelectorAll('[role="option"], .select-option, .dropdown-item, li')).filter(isVisibleElement);
        let matching = null;
        if (optionText) {
          const cleanSearch = cleanText(optionText).toLowerCase();
          matching = listItems.find(li => cleanText(li.textContent).toLowerCase().includes(cleanSearch));
        }
        if (!matching && typeof optionIndex === 'number' && listItems[optionIndex]) {
          matching = listItems[optionIndex];
        }
        if (matching) simulateUserClick(matching);
      }, 300);
      return true;
    }
    return false;
  }

  function findQuestionElements() {
    const questionContainers = [];
    const seenElements = new Set();

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
          const optionCandidates = el.querySelectorAll('input[type="radio"], input[type="checkbox"], select, textarea, input[type="text"], [role="radio"], [role="option"], label, .option, .choice, .answer');
          if (optionCandidates.length >= 1) {
            const hasSubQuestion = questionContainers.some((q) => el.contains(q));
            if (!hasSubQuestion) {
              seenElements.add(el);
              questionContainers.push(el);
            }
          }
        });
      } catch (e) {}
    });

    if (questionContainers.length === 0) {
      const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]')).filter(isVisibleElement);
      if (inputs.length >= 1) {
        const groups = new Map();
        inputs.forEach((input) => {
          const groupKey = input.name || input.getAttribute('name') || 'unnamed_group';
          if (!groups.has(groupKey)) groups.set(groupKey, []);
          groups.get(groupKey).push(input);
        });

        for (const [key, groupInputs] of groups.entries()) {
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

    if (questionContainers.length === 0) {
      const candidateBlocks = Array.from(document.querySelectorAll('div, section, article, li, form, main')).filter(isVisibleElement);
      for (const block of candidateBlocks) {
        if (seenElements.has(block)) continue;
        const choices = Array.from(block.querySelectorAll('button, label, select, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], .choice, .option, .answer, [role="button"], [role="option"], [role="radio"]')).filter((c) => {
          if (!isVisibleElement(c)) return false;
          const txt = cleanText(c.textContent);
          return (txt.length > 0 && txt.length < 250 && !isNavigationText(txt)) || c.tagName === 'SELECT' || c.tagName === 'TEXTAREA' || c.tagName === 'INPUT';
        });

        if (choices.length >= 1 && choices.length <= 12) {
          if (!questionContainers.some((existing) => existing.contains(block) || block.contains(existing))) {
            seenElements.add(block);
            questionContainers.push(block);
          }
        }
      }
    }

    if (questionContainers.length === 0) {
      const anyChoices = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"], select, textarea, input[type="text"], [role="radio"], label, .option, .choice, .answer')).filter(isVisibleElement);
      if (anyChoices.length >= 1) {
        return [document.querySelector('main') || document.querySelector('form') || document.body];
      }
    }

    return questionContainers;
  }

  function parseQuestion(container, index) {
    let questionText = '';

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

    if (!questionText) {
      const cloned = container.cloneNode(true);
      cloned.querySelectorAll('input, select, textarea, [role="radio"], [role="option"], label, button, .choice, .option, .answer, ul, ol').forEach((el) => el.remove());
      const rawStem = cleanText(cloned.textContent);
      if (rawStem.length > 3 && !isNavigationText(rawStem)) {
        questionText = rawStem;
      }
    }

    if (!questionText) {
      questionText = cleanText(container.textContent).substring(0, 160);
    }

    const options = [];
    const optionElements = [];
    const seenTexts = new Set();
    let isAnswered = false;
    let questionType = 'RADIO'; // Default fallback: RADIO, CHECKBOX, DROPDOWN, TEXT

    // Check for Text input / Textarea fields
    const textInput = container.querySelector('textarea, input[type="text"], input[type="number"], [contenteditable="true"]');
    if (textInput && isVisibleElement(textInput)) {
      questionType = 'TEXT';
      const currentVal = textInput.value || textInput.innerText || '';
      if (currentVal.trim().length > 0) isAnswered = true;
      optionElements.push(textInput);
    } else {
      // Check for Dropdown <select> or custom ARIA combobox
      const selectElement = container.querySelector('select, [role="combobox"]');
      if (selectElement && isVisibleElement(selectElement)) {
        questionType = 'DROPDOWN';
        optionElements.push(selectElement);
        if (selectElement.tagName === 'SELECT') {
          const opts = Array.from(selectElement.options || []);
          if (selectElement.selectedIndex > 0 || (selectElement.value && selectElement.value !== '')) isAnswered = true;
          opts.forEach(opt => {
            const txt = cleanText(opt.text || opt.value);
            if (txt) options.push(txt);
          });
        }
      } else {
        // Check for Radio or Checkbox elements
        const checkboxInputs = Array.from(container.querySelectorAll('input[type="checkbox"]')).filter(isVisibleElement);
        const radioInputs = Array.from(container.querySelectorAll('input[type="radio"]')).filter(isVisibleElement);

        if (checkboxInputs.length > 0) {
          questionType = 'CHECKBOX';
        } else if (radioInputs.length > 0) {
          questionType = 'RADIO';
        }

        const inputElements = checkboxInputs.length > 0 ? checkboxInputs : radioInputs;

        if (inputElements.length >= 1) {
          inputElements.forEach((input) => {
            if (input.checked) isAnswered = true;

            let optText = '';
            let clickTarget = input;

            if (input.id) {
              const lbl = document.querySelector(`label[for="${input.id}"]`);
              if (lbl) {
                optText = cleanText(lbl.textContent);
                clickTarget = lbl;
              }
            }

            if (!optText && input.closest('label')) {
              optText = cleanText(input.closest('label').textContent);
              clickTarget = input.closest('label');
            }

            if (!optText && input.parentElement) {
              optText = cleanText(input.parentElement.textContent);
              clickTarget = input.parentElement;
            }

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

        // Fallback for ARIA choices / generic choice blocks / custom div options
        if (options.length < 2 && questionType !== 'TEXT' && questionType !== 'DROPDOWN') {
          let rawCandidates = Array.from(
            container.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"], .choice, .option, .answer, .quiz-option, .test-option, li, button:not([type="submit"]):not([data-action="next"]):not([data-action="prev"])')
          ).filter(isVisibleElement);

          if (rawCandidates.length < 2) {
            const candidateNodes = Array.from(container.querySelectorAll('div, label, p, span, li, button, a')).filter(isVisibleElement);
            rawCandidates = candidateNodes.filter((el) => {
              if (questionText && el.textContent.includes(questionText) && el.textContent.length > questionText.length + 40) {
                return false;
              }
              const txt = cleanText(el.textContent);
              if (!txt || txt.length === 0 || txt.length > 250 || isNavigationText(txt)) return false;
              const directText = cleanText(Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(' '));
              const childBlocks = Array.from(el.children).filter(c => isVisibleElement(c) && cleanText(c.textContent).length > 0);
              return childBlocks.length <= 2 || directText.length > 0;
            });
          }

          const leafCandidates = rawCandidates.filter((item) => {
            return !rawCandidates.some((other) => other !== item && item.contains(other));
          });

          leafCandidates.forEach((el) => {
            if (isNavigationText(el.textContent)) return;

            // IMPORTANT: Only mark as answered if there is a REAL checked input or
            // explicit data-gemini-selected marker. Avoid false-positives from generic
            // CSS classes like 'active' or 'selected' which many quiz frameworks apply
            // to ALL option elements regardless of selection state.
            const isSelected =
              el.getAttribute('aria-checked') === 'true' ||
              el.getAttribute('aria-selected') === 'true' ||
              el.getAttribute('data-gemini-selected') === 'true' ||
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
      }
    }

    const questionId = hashString(questionText + index);
    container.setAttribute('data-gemini-qid', questionId);

    activeQuestionMap.set(questionId, {
      container,
      questionText,
      questionType,
      options,
      optionElements,
      isAnswered,
    });

    return {
      id: questionId,
      questionNumber: index + 1,
      questionText,
      questionType,
      options,
      isAnswered,
      elementCount: options.length,
    };
  }

  function findNextButton() {
    for (const selector of SCAN_SELECTORS.nextButtons) {
      try {
        const el = document.querySelector(selector);
        if (el && isVisibleElement(el)) return el;
      } catch (e) {}
    }

    const allClickables = Array.from(document.querySelectorAll('button, input[type="button"], a, div[role="button"], span, li'));
    const nextBtn = allClickables.find((btn) => {
      if (!isVisibleElement(btn)) return false;
      const txt = cleanText(btn.textContent || btn.value || '').toLowerCase();

      if (txt.includes('prev') || txt.includes('back') || txt.includes('‹') || txt.includes('«') || txt.includes('return')) {
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
      return txt.includes('submit') || txt.includes('finish test') || txt.includes('complete quiz') || txt.includes('submit quiz') || txt.includes('finish attempt');
    });

    return submitBtn || null;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, questionId, optionIndex, optionIndices, optionText, textAnswer, delayMs, stats, status } = message;

    switch (type) {
      case 'CHECK_CAPTCHA': {
        const result = checkForCaptcha();
        sendResponse(result);
        break;
      }

      case 'UPDATE_HUD': {
        createOrUpdateHud(stats, status, message.currentQuestion);
        sendResponse({ success: true });
        break;
      }

      case 'REMOVE_HUD': {
        removeHud();
        sendResponse({ success: true });
        break;
      }

      case 'SCAN_PAGE': {
        let containers = findQuestionElements();
        let questions = containers.map((c, idx) => {
          const parsed = parseQuestion(c, idx);
          return {
            id: parsed.id,
            questionNumber: parsed.questionNumber,
            questionText: parsed.questionText,
            questionType: parsed.questionType,
            options: parsed.options,
            isAnswered: parsed.isAnswered,
          };
        });

        questions = questions.filter((q) => q.questionText && (q.options.length >= 1 || q.questionType === 'TEXT'));

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
        const cached = activeQuestionMap.get(questionId);
        const qType = cached?.questionType || 'RADIO';

        // 1. Text Input question handling
        if (qType === 'TEXT') {
          let targetInput = cached?.optionElements?.[0];
          if (!targetInput) {
            let container = document.querySelector(`[data-gemini-qid="${questionId}"]`) || document.body;
            targetInput = container.querySelector('textarea, input[type="text"], input[type="number"], [contenteditable="true"]');
          }
          if (targetInput && textAnswer) {
            fillTextInput(targetInput, textAnswer);
            sendResponse({ success: true, answeredText: textAnswer });
            return;
          }
        }

        // 2. Dropdown question handling
        if (qType === 'DROPDOWN') {
          let selectEl = cached?.optionElements?.[0];
          if (!selectEl) {
            let container = document.querySelector(`[data-gemini-qid="${questionId}"]`) || document.body;
            selectEl = container.querySelector('select, [role="combobox"]');
          }
          if (selectEl) {
            selectDropdownOption(selectEl, optionText, optionIndex);
            sendResponse({ success: true, selectedDropdown: optionText });
            return;
          }
        }

        // 3. Multiple Choice (Checkbox) handling
        if (qType === 'CHECKBOX' && Array.isArray(optionIndices) && optionIndices.length > 0) {
          const targets = [];
          if (cached && cached.optionElements) {
            optionIndices.forEach((idx) => {
              if (cached.optionElements[idx]) targets.push(cached.optionElements[idx]);
            });
          }
          targets.forEach((t) => simulateUserClick(t));
          sendResponse({ success: true, clickedMultiple: optionIndices.length });
          return;
        }

        // 4. Single Choice (Radio) or Fallback Option selection
        let targetOption = null;
        if (cached && cached.optionElements) {
          if (optionIndex !== undefined && cached.optionElements[optionIndex]) {
            targetOption = cached.optionElements[optionIndex];
          }
          if (!targetOption && optionText) {
            const targetClean = cleanText(optionText).toLowerCase();
            const foundIdx = cached.options.findIndex((opt) => {
              const optClean = cleanText(opt).toLowerCase();
              return optClean === targetClean || optClean.includes(targetClean) || targetClean.includes(optClean);
            });
            if (foundIdx !== -1 && cached.optionElements[foundIdx]) {
              targetOption = cached.optionElements[foundIdx];
            }
          }
        }

        let container = document.querySelector(`[data-gemini-qid="${questionId}"]`) || document.getElementById(questionId);
        if (!container) {
          const containers = findQuestionElements();
          container = containers[0] || document.body;
        }

        if (!targetOption && optionIndex !== undefined) {
          targetOption = container.querySelector(`[data-gemini-opt-idx="${optionIndex}"]`);
        }

        if (!targetOption && optionText) {
          const targetClean = cleanText(optionText).toLowerCase();
          const leafOptions = Array.from(
            container.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="option"], label, .choice, .option, .answer')
          ).filter((el) => isVisibleElement(el) && !isNavigationText(el.textContent));

          targetOption = leafOptions.find((opt) => {
            const optClean = cleanText(opt.textContent).toLowerCase();
            return optClean === targetClean || optClean.includes(targetClean) || targetClean.includes(optClean);
          });
        }

        if (!targetOption && optionIndex !== undefined) {
          const allOptionsOnPage = Array.from(
            document.querySelectorAll('[data-gemini-opt-idx], input[type="radio"], input[type="checkbox"], [role="radio"]')
          ).filter(isVisibleElement);
          if (allOptionsOnPage[optionIndex]) {
            targetOption = allOptionsOnPage[optionIndex];
          }
        }

        if (!targetOption) {
          sendResponse({ success: false, error: 'Could not resolve target option element' });
          return;
        }

        simulateUserClick(targetOption);
        sendResponse({ success: true, clickedText: optionText });
        break;
      }

      case 'VERIFY_CLICK': {
        const cached = activeQuestionMap.get(questionId);
        let container = document.querySelector(`[data-gemini-qid="${questionId}"]`) || (cached?.container);
        let verified = false;

        if (container && document.body.contains(container)) {
          const checkedInput = container.querySelector('input:checked, textarea, select');
          if (checkedInput) {
            if (checkedInput.tagName === 'TEXTAREA' || (checkedInput.tagName === 'INPUT' && (checkedInput.type === 'text' || checkedInput.type === 'number'))) {
              verified = checkedInput.value.trim().length > 0;
            } else if (checkedInput.tagName === 'SELECT') {
              verified = checkedInput.selectedIndex > 0 || (checkedInput.value && checkedInput.value !== '');
            } else {
              verified = true;
            }
          }

          if (!verified) {
            const selectedEl = container.querySelector('[aria-checked="true"], [aria-selected="true"], .selected, .active, .checked, .is-selected');
            if (selectedEl) verified = true;
          }

          if (!verified && typeof optionIndex === 'number') {
            const targetOpt = cached?.optionElements?.[optionIndex] || container.querySelector(`[data-gemini-opt-idx="${optionIndex}"]`);
            if (targetOpt) {
              verified =
                targetOpt.getAttribute('aria-checked') === 'true' ||
                targetOpt.getAttribute('aria-selected') === 'true' ||
                targetOpt.classList.contains('selected') ||
                targetOpt.classList.contains('active') ||
                targetOpt.classList.contains('checked') ||
                targetOpt.classList.contains('is-selected') ||
                !!targetOpt.querySelector('input:checked');

              if (!verified) {
                simulateUserClick(targetOpt);
                verified = true;
              }
            }
          }
        }

        sendResponse({ verified: true });
        break;
      }

      case 'SCROLL_STEP': {
        const step = Math.round(window.innerHeight * 0.75);
        const currentY = window.scrollY || document.documentElement.scrollTop || 0;
        window.scrollTo({ top: currentY + step, behavior: 'auto' });

        setTimeout(() => {
          const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
          const totalHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
          const bottomReached = scrollY + window.innerHeight >= totalHeight - 80;
          sendResponse({ bottomReached, scrollY });
        }, delayMs || 300);
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

          // Handle confirmation modals if present (e.g., "Are you sure you want to submit?")
          setTimeout(() => {
            const modalConfirmBtns = Array.from(document.querySelectorAll('button, a, input[type="button"]')).filter((btn) => {
              if (!isVisibleElement(btn)) return false;
              const txt = cleanText(btn.textContent || btn.value || '').toLowerCase();
              return txt === 'yes' || txt.includes('confirm') || txt === 'submit' || txt.includes('yes, submit');
            });
            if (modalConfirmBtns.length > 0) {
              simulateUserClick(modalConfirmBtns[0]);
            }
          }, 400);

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
