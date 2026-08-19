/**
 * Gemini Auto MCQ Solver - Options Page Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const apiKey = document.getElementById('apiKey');
  const apiEndpoint = document.getElementById('apiEndpoint');
  const model = document.getElementById('model');
  const clickDelayMs = document.getElementById('clickDelayMs');
  const scrollDelayMs = document.getElementById('scrollDelayMs');
  const maxRetries = document.getElementById('maxRetries');
  const settingsForm = document.getElementById('settingsForm');
  const saveSuccess = document.getElementById('saveSuccess');

  // Load saved config
  chrome.storage.local.get(['config'], (result) => {
    const config = result.config || {};
    if (config.apiKey) apiKey.value = config.apiKey;
    if (config.apiEndpoint) apiEndpoint.value = config.apiEndpoint;
    if (config.model) model.value = config.model;
    if (config.clickDelayMs) clickDelayMs.value = config.clickDelayMs;
    if (config.scrollDelayMs) scrollDelayMs.value = config.scrollDelayMs;
    if (config.maxRetries) maxRetries.value = config.maxRetries;
  });

  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const updatedConfig = {
      apiKey: apiKey.value.trim(),
      apiEndpoint: apiEndpoint.value.trim(),
      model: model.value,
      clickDelayMs: parseInt(clickDelayMs.value, 10) || 600,
      scrollDelayMs: parseInt(scrollDelayMs.value, 10) || 900,
      maxRetries: parseInt(maxRetries.value, 10) || 3,
    };

    chrome.runtime.sendMessage(
      { type: 'UPDATE_CONFIG', payload: updatedConfig },
      () => {
        saveSuccess.style.display = 'inline';
        setTimeout(() => {
          saveSuccess.style.display = 'none';
        }, 3000);
      }
    );
  });
});
