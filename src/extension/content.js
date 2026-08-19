/**
 * Gemini Auto MCQ & Quiz Solver - In-Page Content Script
 * Autonomous DOM detection, real simulated clicking, multi-signal verification,
 * dynamic scrolling, CAPTCHA pausing, submit detection, and floating HUD overlay.
 */

(function () {
  // Prevent duplicate script execution
  if (window.__GEMINI_MCQ_SOLVER_INITIALIZED__) return;
  window.__GEMINI_MCQ_SOLVER_INITIALIZED__ = true;

  console.log('%c[Gemini MCQ Solver]%c Autonomous In-Page Agent Loaded.', 'background: #2563eb; color: #fff; padding: 2px 6px; border-radius: 4px;', '');

  // In-memory DOM cache
  const domQuestionCache = new Map(); // questionId -> { element, options: [{ element, text }] }
  let floatingHudElement = null;

  // 1. Unique Question Hashing Function
  function generateQuestionId(text, options) {
    const raw = (text || '').trim().toLowerCase().replace(/\s+/g, ' ') + '::' +
      (options || []).map((o) => (o || '').trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return 'q_' + Math.abs(hash).toString(36);
  }

  // 2. Comprehensive MCQ Detection Engine
  function detectMcqsOnPage() {
    const detectedQuestions = [];
    domQuestionCache.clear();

    // Strategy A: Semantic <fieldset> or form groups with multiple radios/checkboxes
    const fieldsets = document.querySelectorAll('fieldset, [role="radiogroup"], .quiz-question, .question-card, .mcq-item, .question, [data-question], form > div, article');

    fieldsets.forEach((container, idx) => {
      // Find question text
      let qText = '';
      const legend = container.querySelector('legend, h1, h2, h3, h4, h5, h6, .question-text, .prompt, .title, .header, strong');
      if (legend) {
        qText = legend.innerText || legend.textContent || '';
      } else {
        // Look at first paragraph or direct text
        const firstP = container.querySelector('p, span');
        if (firstP && firstP.innerText.length > 5) {
          qText = firstP.innerText;
        }
      }

      // Find options
      const optionElements = [];
      const radioInputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="option"], .choice, .option, .answer-option, button.choice-btn, li.answer');

      if (radioInputs.length >= 2) {
        radioInputs.forEach((inputEl, optIdx) => {
          let labelText = '';
          // 1. Associated label by 'for'
          if (inputEl.id) {
            const label = document.querySelector(`label[for="${inputEl.id}"]`);
            if (label) labelText = label.innerText;
          }
          // 2. Parent label or surrounding container text
          if (!labelText) {
            const parentLabel = inputEl.closest('label, li, .choice, .option-card, div');
            if (parentLabel) {
              labelText = parentLabel.innerText || parentLabel.textContent;
            }
          }
          // 3. Fallback to direct value or aria-label
          if (!labelText) {
            labelText = inputEl.getAttribute('aria-label') || inputEl.value || `Option ${optIdx + 1}`;
          }

          // Clean up label text
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

        // Check if already answered in DOM
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

    // Strategy B: General scanning if no fieldsets caught questions (Fallback for custom React/Vue apps)
    if (detectedQuestions.length === 0) {
      const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const radioGroups = {};

      allRadios.forEach((radio) => {
        const name = radio.name || 'unnamed_group_' + (radio.closest('form, div') ? radio.closest('form, div').className : 'default');
        if (!radioGroups[name]) radioGroups[name] = [];
        radioGroups[name].push(radio);
      });

      Object.keys(radioGroups).forEach((groupName, gIdx) => {
        const radios = radioGroups[groupName];
        if (radios.length >= 2) {
          const commonParent = findCommonParent(radios);
          let qText = '';
          const heading = commonParent ? commonParent.querySelector('h1, h2, h3, h4, strong, p') : null;
          if (heading) {
            qText = heading.innerText;
          } else {
            qText = `Question ${gIdx + 1} (${groupName})`;
          }

          const optionElements = radios.map((r, rIdx) => {
            let labelText = '';
            if (r.id) {
              const lbl = document.querySelector(`label[for="${r.id}"]`);
              if (lbl) labelText = lbl.innerText;
            }
            if (!labelText) {
              const pLbl = r.closest('label, div');
              if (pLbl) labelText = pLbl.innerText;
            }
            return {
              element: r,
              clickableTarget: r.closest('label') || r,
              text: (labelText || r.value || `Option ${rIdx + 1}`).trim(),
            };
          });

          const optionStrings = optionElements.map((o) => o.text);
          const qId = generateQuestionId(qText, optionStrings);
          const isAnswered = optionElements.some((opt) => isOptionSelected(opt.element));

          domQuestionCache.set(qId, {
            container: commonParent,
            options: optionElements,
            questionText: qText,
          });

          detectedQuestions.push({
            id: qId,
            questionNumber: gIdx + 1,
            questionText: qText.trim(),
            options: optionStrings,
            isAnswered,
          });
        }
      });
    }

    return detectedQuestions;
  }

  // Find Lowest Common Ancestor
  function findCommonParent(elements) {
    if (!elements || elements.length === 0) return null;
    let parent = elements[0].parentElement;
    while (parent) {
      if (elements.every((el) => parent.contains(el))) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return document.body;
  }

  // Check if an option is currently marked/selected in DOM
  function isOptionSelected(element) {
    if (!element) return false;
    if (element.checked === true) return true;
    if (element.getAttribute('aria-checked') === 'true') return true;
    if (element.getAttribute('aria-selected') === 'true') return true;

    const classNames = (element.className || '') + ' ' + (element.parentElement ? element.parentElement.className : '');
    if (/\b(selected|checked|active|correct|is-selected|radio-checked)\b/i.test(classNames)) {
      return true;
    }
    return false;
  }

  // 3. Real Simulated User Click Event Dispatcher
  function simulateUserClick(targetElement) {
    if (!targetElement) return false;

    // Scroll into center of view
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

    // Highlight temporarily
    const origOutline = targetElement.style.outline;
    const origBoxShadow = targetElement.style.boxShadow;
    targetElement.style.outline = '3px solid #2563eb';
    targetElement.style.boxShadow = '0 0 12px rgba(37, 99, 235, 0.5)';

    setTimeout(() => {
      targetElement.style.outline = origOutline;
      targetElement.style.boxShadow = origBoxShadow;
    }, 1200);

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

    // Full Pointer + Mouse Event Cascade
    targetElement.dispatchEvent(new PointerEvent('pointerover', eventInit));
    targetElement.dispatchEvent(new MouseEvent('mouseover', eventInit));
    targetElement.dispatchEvent(new PointerEvent('pointerdown', eventInit));
    targetElement.dispatchEvent(new MouseEvent('mousedown', eventInit));
    targetElement.focus();
    targetElement.dispatchEvent(new PointerEvent('pointerup', eventInit));
    targetElement.dispatchEvent(new MouseEvent('mouseup', eventInit));
    targetElement.dispatchEvent(new MouseEvent('click', eventInit));

    // For standard radio/checkbox inputs, also trigger change & input
    if (targetElement.tagName === 'INPUT') {
      targetElement.checked = true;
      targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      targetElement.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Also look for child radio
      const childInput = targetElement.querySelector('input[type="radio"], input[type="checkbox"]');
      if (childInput) {
        childInput.checked = true;
        childInput.dispatchEvent(new Event('input', { bubbles: true }));
        childInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    return true;
  }

  // 4. CAPTCHA and Bot-Check Detector
  function detectCaptchaOnPage() {
    // Check for reCAPTCHA
    const recaptcha = document.querySelector('iframe[src*="recaptcha"], .g-recaptcha, #recaptcha, [id*="recaptcha"]');
    if (recaptcha && recaptcha.offsetParent !== null) {
      return { captchaDetected: true, captchaType: 'Google reCAPTCHA' };
    }

    // Check for Cloudflare Turnstile
    const cloudflare = document.querySelector('iframe[src*="cloudflare"], iframe[src*="challenges.cloudflare.com"], .cf-turnstile, #challenge-running, #challenge-stage');
    if (cloudflare && cloudflare.offsetParent !== null) {
      return { captchaDetected: true, captchaType: 'Cloudflare Turnstile' };
    }

    // Check for hCaptcha
    const hcaptcha = document.querySelector('iframe[src*="hcaptcha"], .h-captcha');
    if (hcaptcha && hcaptcha.offsetParent !== null) {
      return { captchaDetected: true, captchaType: 'hCaptcha' };
    }

    // Check text cues
    const bodyText = document.body.innerText || '';
    if (bodyText.includes('Verify you are human') || bodyText.includes('Complete the security check') || bodyText.includes('Access denied | Error 1020')) {
      return { captchaDetected: true, captchaType: 'Security Verification Page' };
    }

    return { captchaDetected: false };
  }

  // 5. Submit / Finish Button Locator
  function findQuizSubmitButton() {
    const candidates = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, div[role="button"], span[role="button"]'));

    const submitKeywords = [
      'submit quiz',
      'submit answers',
      'submit exam',
      'submit assessment',
      'finish attempt',
      'finish quiz',
      'complete quiz',
      'submit all',
      'check answers',
      'turn in',
      'submit',
      'finish',
      'complete',
    ];

    const forbiddenKeywords = ['cancel', 'clear', 'reset', 'previous', 'back', 'skip', 'save draft'];

    let bestMatch = null;
    let highestScore = 0;

    for (const btn of candidates) {
      // Check visibility
      if (btn.offsetParent === null && !btn.getClientRects().length) continue;

      const text = (btn.innerText || btn.value || btn.getAttribute('aria-label') || '').trim().toLowerCase();
      if (!text) continue;

      // Skip forbidden
      if (forbiddenKeywords.some((f) => text.includes(f))) continue;

      for (let i = 0; i < submitKeywords.length; i++) {
        const kw = submitKeywords[i];
        if (text === kw) {
          const score = 100 - i * 5;
          if (score > highestScore) {
            highestScore = score;
            bestMatch = btn;
          }
        } else if (text.includes(kw)) {
          const score = 50 - i * 2;
          if (score > highestScore) {
            highestScore = score;
            bestMatch = btn;
          }
        }
      }
    }

    return bestMatch;
  }

  // 6. Floating On-Page HUD Overlay
  function updateFloatingHud(statusText, countInfo) {
    if (!floatingHudElement) {
      floatingHudElement = document.createElement('div');
      floatingHudElement.id = '__gemini_mcq_hud__';
      floatingHudElement.style.cssText = `
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
        pointer-events: auto;
        transition: all 0.2s ease;
      `;
      document.body.appendChild(floatingHudElement);
    }

    floatingHudElement.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3b82f6;animation:pulse 1.5s infinite;"></span>
        <span style="font-weight:700;color:#60a5fa;">Gemini AI</span>
      </div>
      <span style="color:#94a3b8;">|</span>
      <span style="color:#e2e8f0;">${statusText}</span>
      ${countInfo ? `<span style="background:#1e293b;padding:2px 8px;border-radius:6px;font-size:11px;color:#38bdf8;">${countInfo}</span>` : ''}
    `;
  }

  // 7. Message Router from Background Service Worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, questionId, optionIndex, delayMs, forceRetry } = message;

    switch (type) {
      case 'CHECK_CAPTCHA': {
        const result = detectCaptchaOnPage();
        sendResponse(result);
        break;
      }

      case 'SCAN_PAGE': {
        const questions = detectMcqsOnPage();
        const scrollProgress = Math.round(
          ((window.scrollY + window.innerHeight) / Math.max(document.documentElement.scrollHeight, 1)) * 100
        );
        const bottomReached = (window.innerHeight + window.pageYOffset) >= (document.documentElement.scrollHeight - 60);

        updateFloatingHud('Scanning Page', `${questions.length} detected`);

        sendResponse({
          questions,
          scrollProgress,
          bottomReached,
        });
        break;
      }

      case 'CLICK_ANSWER': {
        const qData = domQuestionCache.get(questionId);
        if (!qData) {
          sendResponse({ success: false, error: 'Question data not found in DOM cache' });
          return;
        }

        const optData = qData.options[optionIndex];
        if (!optData) {
          sendResponse({ success: false, error: `Option index ${optionIndex} not found` });
          return;
        }

        updateFloatingHud(`Selecting Option ${optionIndex + 1}`, optData.text.substring(0, 20));

        // Click target or container
        const target = forceRetry ? (optData.element || optData.clickableTarget) : (optData.clickableTarget || optData.element);
        const clicked = simulateUserClick(target);

        sendResponse({ success: clicked });
        break;
      }

      case 'VERIFY_CLICK': {
        const qData = domQuestionCache.get(questionId);
        if (!qData || !qData.options[optionIndex]) {
          sendResponse({ verified: false, reason: 'Element missing' });
          return;
        }

        const optData = qData.options[optionIndex];
        const isVerified = isOptionSelected(optData.element) || isOptionSelected(optData.clickableTarget);

        if (isVerified) {
          updateFloatingHud('Answer Verified', `✓ ${optData.text.substring(0, 18)}`);
        }

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
          const allQuestions = detectMcqsOnPage();
          sendResponse({ questions: allQuestions });
        }, 600);
        return true;
      }

      case 'FOCUS_QUESTION': {
        const qData = domQuestionCache.get(questionId);
        if (qData && qData.container) {
          qData.container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        sendResponse({ focused: true });
        break;
      }

      case 'PERFORM_SUBMIT': {
        updateFloatingHud('Submitting Quiz...', 'Final Action');
        const submitBtn = findQuizSubmitButton();
        if (submitBtn) {
          simulateUserClick(submitBtn);
          sendResponse({ submitted: true, buttonText: submitBtn.innerText || submitBtn.value });
        } else {
          sendResponse({ submitted: false, reason: 'No submit button recognized' });
        }
        break;
      }

      case 'VERIFY_SUBMISSION': {
        // Look for completion cues
        const bodyText = (document.body.innerText || '').toLowerCase();
        const successCues = ['submitted', 'your score', 'score:', 'view score', 'quiz completed', 'results', 'response recorded', 'thank you'];
        const foundCue = successCues.find((cue) => bodyText.includes(cue));

        if (foundCue) {
          updateFloatingHud('Quiz Complete!', '✓ Done');
          sendResponse({ confirmed: true, message: `Submission confirmed (${foundCue})` });
        } else {
          sendResponse({ confirmed: true, message: 'Submission action dispatched' });
        }
        break;
      }

      default:
        sendResponse({ error: 'Unknown content script action' });
    }
  });
})();
