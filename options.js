/**
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

  const stored = await chrome.storage.local.get(['config', 'gemini_api_key', 'gemini_model']);
  const config = stored.config || {};

  const savedKey = stored.gemini_api_key || config.apiKey || '';
  if (savedKey) apiKeyInput.value = savedKey;
  if (stored.gemini_model || config.model) modelSelect.value = stored.gemini_model || config.model;
  if (config.apiEndpoint) apiEndpointInput.value = config.apiEndpoint;
  if (config.clickDelayMs) clickDelayInput.value = config.clickDelayMs;
  if (config.scrollDelayMs) scrollDelayInput.value = config.scrollDelayMs;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const keyVal = apiKeyInput.value.trim();
    const modelVal = modelSelect.value;

    const updatedConfig = {
      ...config,
      apiKey: keyVal,
      model: modelVal,
      apiEndpoint: apiEndpointInput.value.trim(),
      clickDelayMs: parseInt(clickDelayInput.value, 10) || 500,
      scrollDelayMs: parseInt(scrollDelayInput.value, 10) || 800,
    };

    await chrome.storage.local.set({
      config: updatedConfig,
      gemini_api_key: keyVal,
      gemini_model: modelVal,
    });

    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      payload: updatedConfig,
    });

    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  });
});
