/**
 * Gemini Auto MCQ Solver - Popup Controller (Manifest V3)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
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

  // Load current active tab info for preview
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      tabTitle.innerText = tabs[0].title || 'Active Tab';
    }
  });

  // Fetch initial background state
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (response && response.state) {
      renderState(response.state);
    }
  });

  // Listen for state broadcast updates from background worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATED' && message.state) {
      renderState(message.state);
    }
  });

  // Render State
  function renderState(state) {
    if (!state) return;

    // Status Pill
    statusText.innerText = state.status;
    statusPill.className = 'status-pill';
    if (state.status === 'RUNNING' || state.status === 'SCANNING' || state.status === 'SOLVING' || state.status === 'CLICKING' || state.status === 'VERIFYING' || state.status === 'SCROLLING' || state.status === 'SUBMITTING') {
      statusPill.classList.add('status-running');
    } else if (state.status === 'PAUSED' || state.status === 'PAUSED_CAPTCHA') {
      statusPill.classList.add('status-paused');
      statusText.innerText = state.status === 'PAUSED_CAPTCHA' ? 'CAPTCHA PAUSE' : 'PAUSED';
    } else if (state.status === 'COMPLETED') {
      statusPill.classList.add('status-completed');
    }

    // Stats
    statDetected.innerText = state.stats.detected || 0;
    statAnswered.innerText = state.stats.answered || 0;
    statRemaining.innerText = state.stats.remaining || 0;

    // Current Task
    if (state.stats.currentQuestionText) {
      currentQuestionTag.innerText = `QUESTION #${state.stats.currentQuestionIndex || 1}`;
      currentQuestionText.innerText = state.stats.currentQuestionText;
    } else if (state.status === 'COMPLETED') {
      currentQuestionTag.innerText = 'STATUS';
      currentQuestionText.innerText = 'All questions solved! ' + (state.stats.submissionMessage || 'Ready.');
    } else {
      currentQuestionTag.innerText = 'STATUS';
      currentQuestionText.innerText = state.status === 'IDLE' ? 'Ready to solve questions on active tab.' : `Status: ${state.status}`;
    }

    // Confidence
    const qList = Object.values(state.questions || {});
    const lastAnswered = qList.filter((q) => q.confidence).pop();
    if (lastAnswered && lastAnswered.confidence) {
      confidenceTag.innerText = `Confidence: ${(lastAnswered.confidence * 100).toFixed(0)}%`;
    } else {
      confidenceTag.innerText = 'Confidence: --';
    }

    // Controls Visibility
    const isRunning = state.status !== 'IDLE' && state.status !== 'COMPLETED';
    btnStart.style.display = isRunning ? 'none' : 'flex';
    activeControls.style.display = isRunning ? 'grid' : 'none';

    if (state.status === 'PAUSED' || state.status === 'PAUSED_CAPTCHA') {
      btnPause.style.display = 'none';
      btnResume.style.display = 'flex';
    } else {
      btnPause.style.display = 'flex';
      btnResume.style.display = 'none';
    }

    // Config Toggles
    if (state.config) {
      toggleAutoSubmit.checked = state.config.autoSubmit !== false;
      toggleHud.checked = state.config.showOverlayHud !== false;
    }

    // Target Tab Card
    if (state.targetTabInfo) {
      tabTitle.innerText = state.targetTabInfo.title || `Tab #${state.targetTabInfo.id}`;
    }

    // Render Logs
    if (state.logs && state.logs.length > 0) {
      logsList.innerHTML = state.logs
        .slice(0, 30)
        .map(
          (log) => `
          <div class="log-item ${log.level}">
            <span class="time">${log.timestamp}</span>
            <span class="msg">${escapeHtml(log.message)}</span>
          </div>
        `
        )
        .join('');
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text || '';
    return div.innerHTML;
  }

  // Button Actions
  btnStart.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'START_AUTOMATION' }, (res) => {
      if (res && res.error) {
        alert(res.error);
      }
    });
  });

  btnPause.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'PAUSE_AUTOMATION' });
  });

  btnResume.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'RESUME_AUTOMATION' });
  });

  btnStop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_AUTOMATION' });
  });

  toggleAutoSubmit.addEventListener('change', (e) => {
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      payload: { autoSubmit: e.target.checked },
    });
  });

  toggleHud.addEventListener('change', (e) => {
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      payload: { showOverlayHud: e.target.checked },
    });
  });

  btnClearLogs.addEventListener('click', () => {
    logsList.innerHTML = '<div class="log-item info"><span class="time">--:--</span><span class="msg">Logs cleared.</span></div>';
  });
});
