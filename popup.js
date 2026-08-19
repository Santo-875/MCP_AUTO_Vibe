/**
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

  // Persistent storage key loader
  const storedData = await chrome.storage.local.get(['gemini_api_key', 'config']);
  const savedKey = storedData.gemini_api_key || storedData.config?.apiKey || '';
  if (savedKey) {
    inputApiKey.value = savedKey;
    keyMissingAlert.style.display = 'none';
    keyConnectedBar.style.display = 'flex';
  }

  btnSaveKey.addEventListener('click', async () => {
    const keyVal = inputApiKey.value.trim();
    if (!keyVal) return;
    await chrome.storage.local.set({ gemini_api_key: keyVal });
    await chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      payload: { apiKey: keyVal },
    });
    keyMissingAlert.style.display = 'none';
    keyConnectedBar.style.display = 'flex';
  });

  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (response && response.state) {
    if (savedKey && !response.state.config.apiKey) {
      response.state.config.apiKey = savedKey;
    }
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
    const stored = await chrome.storage.local.get(['gemini_api_key', 'config']);
    const hasKey = stored.gemini_api_key || stored.config?.apiKey;
    if (!hasKey) {
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

    const hasKey = !!(config?.apiKey || inputApiKey.value.trim());
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
    progressBar.style.width = `${percent}%`;

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
    } else {
      btnStart.style.display = 'flex';
      btnStart.disabled = false;
      btnStart.textContent = '🚀 Start Auto Solver';
      runningControls.style.display = 'none';
    }

    // Render Logs Stream
    if (logs && logs.length > 0) {
      logStream.innerHTML = logs
        .slice(0, 30)
        .map(
          (l) => `
          <div class="log-item">
            <span class="log-time">${l.timestamp}</span>
            <span class="log-badge ${l.level}">${l.level}</span>
            <span class="log-msg">${escapeHtml(l.message)}</span>
          </div>
        `
        )
        .join('');
    }
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
