
let statusTimeout;

document.addEventListener('DOMContentLoaded', async () => {
  const captureBtn = document.getElementById('captureBtn');
  const captureSection = document.getElementById('captureSection');
  const settingsPanel = document.getElementById('settingsPanel');
  const serverUrlInput = document.getElementById('serverUrl');
  const apiTokenInput = document.getElementById('apiToken');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const toggleSettingsLink = document.getElementById('toggleSettingsLink');
  const gearIcon = document.getElementById('gearIcon');
  const backIcon = document.getElementById('backIcon');
  const serverUrlDisplay = document.getElementById('serverUrlDisplay');
  const instantModeCheckbox = document.getElementById('instantModeCheckbox');
  const captureBtnText = document.getElementById('captureBtnText');
  const DEFAULT_CAPTURE_TEXT = captureBtnText.textContent;
  let captureBtnResetTimeout;

  const handleEnterToSave = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveSettingsBtn.click();
    }
  };

  serverUrlInput.addEventListener('keydown', handleEnterToSave);
  apiTokenInput.addEventListener('keydown', handleEnterToSave);
  serverUrlInput.addEventListener('input', () => updateConnectBtnState());
  apiTokenInput.addEventListener('input', () => updateConnectBtnState());

  let currentSettings = await chrome.storage.sync.get(['serverUrl', 'apiToken', 'instantMode']);

  const hasSettings = () => Boolean(currentSettings.serverUrl && currentSettings.apiToken);

  const updateConnectBtnState = () => {
    const serverUrl = serverUrlInput.value.trim();
    const apiToken = apiTokenInput.value.trim();
    const unchanged = serverUrl === (currentSettings.serverUrl || '') && apiToken === (currentSettings.apiToken || '');
    saveSettingsBtn.disabled = !serverUrl || !apiToken || unchanged;
  };

  const setMode = (mode) => {
    if (mode === 'settings') {
      settingsPanel.classList.remove('hidden');
      captureSection.classList.add('hidden');
      gearIcon.classList.add('hidden');
      backIcon.classList.remove('hidden');
      serverUrlInput.value = currentSettings.serverUrl || '';
      apiTokenInput.value = currentSettings.apiToken || '';
      instantModeCheckbox.checked = Boolean(currentSettings.instantMode);
      updateConnectBtnState();
      captureBtn.disabled = true;
    } else {
      settingsPanel.classList.add('hidden');
      if (hasSettings()) {
        captureSection.classList.remove('hidden');
        captureBtn.disabled = false;
        serverUrlDisplay.textContent = currentSettings.serverUrl;
      } else {
        captureSection.classList.add('hidden');
        captureBtn.disabled = true;
      }
      gearIcon.classList.remove('hidden');
      backIcon.classList.add('hidden');
    }
  };

  const updateUI = () => {
    if (hasSettings()) {
      setMode('capture');
    } else {
      setMode('settings');
    }
  };

  const resetCaptureBtn = () => {
    captureBtnText.textContent = DEFAULT_CAPTURE_TEXT;
    captureBtn.disabled = false;
  };

  const sendPage = async () => {
    clearTimeout(captureBtnResetTimeout);
    captureBtn.disabled = true;
    captureBtnText.textContent = 'Sending...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.runtime.sendMessage(
        { action: 'capturePage', tabId: tab.id },
        (response) => {
          if (response && response.success) {
            captureBtnText.textContent = 'Successfully sent!';
            captureBtnResetTimeout = setTimeout(resetCaptureBtn, 2000);
          } else {
            const message = response?.message || 'Unknown error';
            showStatus(`Error: ${message}`, 'error');
            resetCaptureBtn();
          }
        }
      );
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
      resetCaptureBtn();
    }
  };

  updateUI();

  if (hasSettings() && currentSettings.instantMode) {
    sendPage();
  }

  captureBtn.addEventListener('click', sendPage);

  instantModeCheckbox.addEventListener('change', () => {
    currentSettings.instantMode = instantModeCheckbox.checked;
    chrome.storage.sync.set({ instantMode: instantModeCheckbox.checked });
  });

  toggleSettingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (settingsPanel.classList.contains('hidden')) {
      setMode('settings');
    } else if (hasSettings()) {
      setMode('capture');
    }
  });

  saveSettingsBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const serverUrl = serverUrlInput.value.trim();
    const apiToken = apiTokenInput.value.trim();

    try {
      new URL(serverUrl);
    } catch (_) {
      showStatus('Invalid server URL format', 'error');
      return;
    }

    saveSettingsBtn.disabled = true;
    showStatus('Testing connection...', 'info');

    chrome.runtime.sendMessage({ action: 'testConnection', serverUrl, apiToken }, (response) => {
      updateConnectBtnState();

      if (chrome.runtime.lastError) {
        showStatus('Connection failed', 'error');
        return;
      }

      if (response && response.success) {
        chrome.storage.sync.set({ serverUrl, apiToken });
        currentSettings = { ...currentSettings, serverUrl, apiToken };
        setMode('capture');
        showStatus('Succesfully connected', 'success');
      } else {
        showStatus('Connection failed', 'error');
      }
    });
  });
});

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    statusDiv.style.display = 'none';
    statusDiv.textContent = '';
    statusDiv.className = 'status';
  }, 8000);
}
