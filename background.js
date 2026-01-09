// Service worker for Paperless Web Capture extension

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capturePage') {
    capturePage(request.tabId)
      .then(result => sendResponse({ success: true, message: result }))
      .catch(error => sendResponse({ success: false, message: error.message }));
    return true; // Will respond asynchronously
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

// Capture current page as PDF and upload to Paperless
async function capturePage(tabId) {
  // Get settings
  const settings = await chrome.storage.sync.get(['serverUrl', 'apiToken']);
  
  if (!settings.serverUrl || !settings.apiToken) {
    throw new Error('Please configure Paperless server settings first');
  }
  
  // Get tab info for title
  const tab = await chrome.tabs.get(tabId);
  const pageTitle = tab.title || 'Untitled';
  
  // Check if this tab is displaying a PDF
  const isPdf = await checkIfPdf(tabId);
  
  if (isPdf) {
    const pdfBytes = await fetchPdfBytesFromTab(tabId, tab.url);
    await uploadToPaperless(pdfBytes, pageTitle, tab.url, settings);
    return `Successfully sent "${pageTitle}" to Paperless`;
  }
  
  // HTML page -> use DevTools printToPDF
  let attached = false;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached = true;
    
    const result = await chrome.debugger.sendCommand({ tabId }, 'Page.printToPDF', {
      landscape: false,
      displayHeaderFooter: false,
      printBackground: true,
      preferCSSPageSize: true,
      paperWidth: 8.27, // A4 width in inches
      paperHeight: 11.69, // A4 height in inches
      marginTop: 0.4,
      marginBottom: 0.4,
      marginLeft: 0.4,
      marginRight: 0.4
    });
    
    await chrome.debugger.detach({ tabId });
    attached = false;
    
    const pdfBytes = Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
    
    await uploadToPaperless(pdfBytes, pageTitle, tab.url, settings);
    
    return `Successfully sent "${pageTitle}" to Paperless`;
    
  } catch (error) {
    if (attached) {
      try {
        await chrome.debugger.detach({ tabId });
      } catch (e) {}
    }
    throw error;
  }
}

// Check if tab is displaying a PDF using document.contentType
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

// Fetch PDF bytes directly from the page
async function fetchPdfBytesFromTab(tabId, tabUrl) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (url) => {
        const resp = await fetch(url, { credentials: 'include' });
        if (!resp.ok) {
          throw new Error(`Failed to fetch PDF: ${resp.status}`);
        }
        const buf = await resp.arrayBuffer();
        return Array.from(new Uint8Array(buf)); // serializable
      },
      args: [tabUrl]
    });

    if (!result?.result) {
      throw new Error('Failed to fetch PDF from page');
    }
    return new Uint8Array(result.result);
  } catch (e) {
    throw new Error(`Could not fetch PDF: ${e.message}`);
  }
}

// Upload PDF to Paperless server
async function uploadToPaperless(pdfData, title, sourceUrl, settings) {
  const formData = new FormData();
  
  // Create blob from PDF data
  const blob = new Blob([pdfData], { type: 'application/pdf' });
  const filename = sanitizeFilename(title) + '.pdf';
  formData.append('document', blob, filename);
  formData.append('title', title);
  
  // Add source URL as custom field if available
  if (sourceUrl) {
    formData.append('custom_field_source_url', sourceUrl);
  }
  
  // Ensure serverUrl doesn't have trailing slash
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

// Test connection to Paperless server
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

// Sanitize filename for safe usage
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .substring(0, 100);
}
