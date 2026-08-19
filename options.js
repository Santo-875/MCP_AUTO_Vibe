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

  const stored = await chrome.storage.local.get(['config']);
  const config = stored.config || {};

  if (config.apiKey) apiKeyInput.value = config.apiKey;
  if (config.model) modelSelect.value = config.model;
  if (config.apiEndpoint) apiEndpointInput.value = config.apiEndpoint;
  if (config.clickDelayMs) clickDelayInput.value = config.clickDelayMs;
  if (config.scrollDelayMs) scrollDelayInput.value = config.scrollDelayMs;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const updatedConfig = {
      ...config,
      apiKey: apiKeyInput.value.trim(),
      model: modelSelect.value,
      apiEndpoint: apiEndpointInput.value.trim(),
      clickDelayMs: parseInt(clickDelayInput.value, 10) || 600,
      scrollDelayMs: parseInt(scrollDelayInput.value, 10) || 900,
    };

    await chrome.storage.local.set({ config: updatedConfig });
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
