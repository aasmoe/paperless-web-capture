
let statusTimeout;

document.addEventListener('DOMContentLoaded', async () => {
  const captureBtn = document.getElementById('captureBtn');
  const captureSection = document.getElementById('captureSection');
  const settingsPanel = document.getElementById('settingsPanel');
  const serverUrlInput = document.getElementById('serverUrl');
  const apiTokenInput = document.getElementById('apiToken');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
  const toggleSettingsLink = document.getElementById('toggleSettingsLink');
  const gearIcon = document.getElementById('gearIcon');
  const backIcon = document.getElementById('backIcon');
  const serverUrlDisplay = document.getElementById('serverUrlDisplay');

  const handleEnterToSave = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveSettingsBtn.click();
    }
  };

  serverUrlInput.addEventListener('keydown', handleEnterToSave);
  apiTokenInput.addEventListener('keydown', handleEnterToSave);

  let currentSettings = await chrome.storage.sync.get(['serverUrl', 'apiToken']);

  const hasSettings = () => Boolean(currentSettings.serverUrl && currentSettings.apiToken);

  const setMode = (mode) => {
    if (mode === 'settings') {
      settingsPanel.classList.remove('hidden');
      captureSection.classList.add('hidden');
      gearIcon.classList.add('hidden');
      backIcon.classList.remove('hidden');
      serverUrlInput.value = currentSettings.serverUrl || '';
      apiTokenInput.value = currentSettings.apiToken || '';
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

  updateUI();

  captureBtn.addEventListener('click', async () => {
    captureBtn.disabled = true;
    showStatus('Generating PDF...', 'info');
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.runtime.sendMessage(
        { action: 'capturePage', tabId: tab.id },
        (response) => {
          if (response && response.success) {
            showStatus(response.message, 'success');
          } else {
            const message = response?.message || 'Unknown error';
            showStatus(`Error: ${message}`, 'error');
          }
          captureBtn.disabled = false;
        }
      );
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
      captureBtn.disabled = false;
    }
  });

  toggleSettingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (settingsPanel.classList.contains('hidden')) {
      setMode('settings');
    } else if (hasSettings()) {
      setMode('capture');
    }
  });

  cancelSettingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (hasSettings()) {
      setMode('capture');
      showStatus('Settings unchanged', 'info');
    } else {
      setMode('settings');
    }
  });

  saveSettingsBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const serverUrl = serverUrlInput.value.trim();
    const apiToken = apiTokenInput.value.trim();

    if (!serverUrl || !apiToken) {
      showStatus('Both server URL and API token are required', 'error');
      return;
    }

    try {
      new URL(serverUrl);
    } catch (_) {
      showStatus('Invalid server URL format', 'error');
      return;
    }

    saveSettingsBtn.disabled = true;
    cancelSettingsBtn.disabled = true;
    showStatus('Testing connection...', 'info');

    chrome.runtime.sendMessage({ action: 'testConnection', serverUrl, apiToken }, (response) => {
      saveSettingsBtn.disabled = false;
      cancelSettingsBtn.disabled = false;

      if (chrome.runtime.lastError) {
        showStatus('Connection failed', 'error');
        return;
      }

      if (response && response.success) {
        chrome.storage.sync.set({ serverUrl, apiToken });
        currentSettings = { serverUrl, apiToken };
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
