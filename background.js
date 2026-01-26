
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capturePage') {
    capturePage(request.tabId)
      .then(result => sendResponse({ success: true, message: result }))
      .catch(error => sendResponse({ success: false, message: error.message }));
    return true;
  }
  
  if (request.action === 'testConnection') {
    const settings = request.serverUrl && request.apiToken 
      ? { serverUrl: request.serverUrl, apiToken: request.apiToken }
      : undefined;
    testPaperlessConnection(settings)
      .then(result => sendResponse({ success: true, message: result }))
      .catch(error => sendResponse({ success: false, message: error.message }));
    return true;
  }
});

async function capturePage(tabId) {
  const settings = await chrome.storage.sync.get(['serverUrl', 'apiToken']);
  
  if (!settings.serverUrl || !settings.apiToken) {
    throw new Error('Please configure Paperless server settings first');
  }
  
  const tab = await chrome.tabs.get(tabId);
  const pageTitle = tab.title || 'Untitled';
  
  const isPdf = await checkIfPdf(tabId);
  
  const pdfBytes = isPdf 
    ? await fetchPdfBytesFromTab(tabId, tab.url)
    : await printHtmlToPdf(tabId);
  
  await uploadToPaperless(pdfBytes, pageTitle, tab.url, settings);
  return `Successfully sent "${pageTitle}" to Paperless`;
}

async function checkIfPdf(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.contentType === 'application/pdf'
    });
    return result?.result === true;
  } catch (e) {
    return false;
  }
}

async function printHtmlToPdf(tabId) {
  let attached = false;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached = true;
    
    const result = await chrome.debugger.sendCommand({ tabId }, 'Page.printToPDF', {
      landscape: false,
      displayHeaderFooter: false,
      printBackground: true,
      preferCSSPageSize: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.4,
      marginBottom: 0.4,
      marginLeft: 0.4,
      marginRight: 0.4
    });
    
    await chrome.debugger.detach({ tabId });
    attached = false;
    
    return Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
    
  } catch (error) {
    if (attached) {
      try {
        await chrome.debugger.detach({ tabId });
      } catch (e) {}
    }
    throw error;
  }
}

async function fetchPdfBytesFromTab(tabId, tabUrl) {
  try {
    const resp = await fetch(tabUrl);
    if (!resp.ok) {
      throw new Error(`Failed to fetch PDF: ${resp.status}`);
    }
    const buf = await resp.arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) {
    throw new Error(`Could not fetch PDF: ${e.message}`);
  }
}

async function uploadToPaperless(pdfData, title, sourceUrl, settings) {
  const formData = new FormData();
  
  const blob = new Blob([pdfData], { type: 'application/pdf' });
  const filename = sanitizeFilename(title) + '.pdf';
  formData.append('document', blob, filename);
  formData.append('title', title);
  
  if (sourceUrl) {
    formData.append('custom_field_source_url', sourceUrl);
  }
  
  const serverUrl = settings.serverUrl.replace(/\/$/, '');
  const uploadUrl = `${serverUrl}/api/documents/post_document/`;
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${settings.apiToken}`
    },
    body: formData
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
  }
  
  return await response.json();
}

async function testPaperlessConnection(overrideSettings) {
  let settings = overrideSettings;
  if (!settings) {
    settings = await chrome.storage.sync.get(['serverUrl', 'apiToken']);
  }
  
  if (!settings.serverUrl || !settings.apiToken) {
    throw new Error('Please configure server URL and API token');
  }
  
  const serverUrl = settings.serverUrl.replace(/\/$/, '');
  const testUrl = `${serverUrl}/api/`;
  
  const response = await fetch(testUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Token ${settings.apiToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Connection failed: ${response.status}`);
  }
  
  return 'Connection successful!';
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .substring(0, 100);
}
