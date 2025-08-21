// Pick PDFs → zip in browser → POST /v1/bulk-zip → show ranked list.
// Store PDFs + canonicalText in IndexedDB keyed by resumeId.

import { 
  putResume, 
  getResume, 
  getAllResumes, 
  clearAllResumes,
  updateResumeLLMResponse
} from './js/database.js';

import { 
  bulkZipUpload, 
  explainCandidate 
} from './js/api.js';

import { 
  setupChatEventListeners, 
  appendMsg, 
  resetChatEventListeners 
} from './js/chat.js';

import { 
  setStatus, 
  baseName, 
  fmtCos, 
  renderList, 
  createZipFromFiles, 
  createFileMap, 
  createCandidateFromRecord, 
  updateJDStatus, 
  clearUI 
} from './js/utils.js';

const $ = (id) => document.getElementById(id);

// Landing page elements
const landingPage = $('landingPage');
const mainInterface = $('mainInterface');
const landingPdfInput = $('landingPdfInput');
const landingJdText = $('landingJdText');
const uploadArea = $('uploadArea');
const runMatchBtn = $('runMatchBtn');
const backToDemoBtn = $('backToDemoBtn');

// Main interface elements
const pdfInput   = $('pdfInput');
const jdTextEl   = $('jdText');
const jdHashEl   = $('jdHash');
const sendBtn    = $('sendBtn');
const statusEl   = $('status');
const listEl     = $('list');
const pdfFrame   = $('pdfFrame');
const viewerTitle= $('viewerTitle');
const explainMd  = $('explainMd');
const jdTextarea = $('jdText');
const jdStatusEl = $('jdStatus');
const refreshBtn = $('refreshBtn');
const clearStorageBtn = $('clearStorageBtn');
const chatLog    = $('chatLog');
const chatText   = $('chatText');

// --- Landing Page Flow Control ---

// Handle file upload area click
uploadArea.addEventListener('click', () => {
  landingPdfInput.click();
});

// Handle drag and drop
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = '#666';
});

uploadArea.addEventListener('dragleave', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = '#ccc';
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = '#ccc';
  
  const files = Array.from(e.dataTransfer.files).filter(f => /\.pdf$/i.test(f.name));
  if (files.length > 0) {
    landingPdfInput.files = e.dataTransfer.files;
    updateUploadStatus(files.length);
  }
});

// Handle file selection
landingPdfInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []).filter(f => /\.pdf$/i.test(f.name));
  updateUploadStatus(files.length);
});

// Update upload area status
function updateUploadStatus(fileCount) {
  if (fileCount > 0) {
    uploadArea.innerHTML = `<strong>${fileCount} PDF file(s) selected</strong><br>Ready to process`;
    uploadArea.style.borderColor = '#4CAF50';
  } else {
    uploadArea.innerHTML = `<strong>Drag & drop résumés here</strong><br>or click to select files. We never save your files.`;
    uploadArea.style.borderColor = '#ccc';
  }
}

// Handle Run Match button
runMatchBtn.addEventListener('click', () => {
  const files = landingPdfInput.files;
  const jdText = landingJdText.value.trim();
  
  if (!files || files.length === 0) {
    alert('Please select at least one PDF file.');
    return;
  }
  
  if (!jdText) {
    alert('Please enter a job description.');
    return;
  }
  
  // Transfer data to main interface
  pdfInput.files = files;
  jdTextEl.value = jdText;
  
  // Switch to main interface
  landingPage.style.display = 'none';
  mainInterface.style.display = 'flex';
  
  // Trigger the existing upload flow
  selectedFiles = Array.from(files).filter(f => /\.pdf$/i.test(f.name));
  setStatus(statusEl, `${selectedFiles.length} PDF(s) ready`);
});

// Handle Back to Demo button
backToDemoBtn.addEventListener('click', () => {
  // Clear the main interface
  clearUI(listEl, pdfFrame, viewerTitle, explainMd, jdStatusEl, chatLog);
  
  // Reset state
  state.candidates = [];
  state.messages = [];
  state.currentCandidate = null;
  
  // Switch back to landing page
  mainInterface.style.display = 'none';
  landingPage.style.display = 'block';
  
  // Reset landing page
  landingPdfInput.value = '';
  landingJdText.value = '';
  updateUploadStatus(0);
});

// --- State Management ---
const state = {
  jdHash: null,
  jdTextSnapshot: '',   // the JD textarea value that produced jdHash
  candidates: [],        // from /v1/bulk-zip
  messages: [],          // running chat
  currentCandidate: null // { canonicalText, pdfUrl, email, ... }
};

// --- Event Listeners ---

// Handle manual JD hash input (for bulk-zip compatibility)
jdHashEl.addEventListener('input', () => {
  const hash = jdHashEl.value.trim();
  if (hash) {
    state.jdHash = hash;
    state.jdTextSnapshot = jdTextarea.value;
    updateJDStatus(jdStatusEl, hash, state.jdTextSnapshot);
  } else {
    state.jdHash = null;
    state.jdTextSnapshot = '';
    updateJDStatus(jdStatusEl, null, '');
  }
});

// Initialize JD status display
if (jdHashEl.value.trim()) {
  const hash = jdHashEl.value.trim();
  state.jdHash = hash;
  state.jdTextSnapshot = jdTextarea.value;
  updateJDStatus(jdStatusEl, hash, state.jdTextSnapshot);
}

// Add clear storage functionality
clearStorageBtn.addEventListener('click', async () => {
  if (confirm('⚠️ This will clear ALL stored data (candidates, PDFs, JD hash). Are you sure?')) {
    try {
      // Clear IndexedDB
      await clearAllResumes();
      
      // Clear localStorage
      localStorage.removeItem('matchagig_jdHash');
      localStorage.removeItem('matchagig_jdTextSnapshot');
      
      // Reset state
      state.jdHash = null;
      state.jdTextSnapshot = '';
      state.candidates = [];
      
      // Clear UI
      clearUI(listEl, pdfFrame, viewerTitle, explainMd, jdStatusEl, chatLog);
      
      // Clear chat state
      state.messages = [];
      state.currentCandidate = null;
      
      // Reset event listener flag so they can be setup again if needed
      resetChatEventListeners();
      
      // Update status
      setStatus(statusEl, 'All storage cleared. Ready for fresh upload.');
    } catch (error) {
      console.error('❌ Error clearing storage:', error);
      setStatus(statusEl, 'Error clearing storage: ' + error.message);
    }
  }
});

// Load stored candidates from IndexedDB on page load
async function loadStoredCandidates() {
  try {
    const allRecords = await getAllResumes();
    
    if (allRecords && allRecords.length > 0) {
      console.log('Loaded records from IndexedDB:', allRecords);
      
      // Reconstruct the results array from stored data
      const results = allRecords.map(record => createCandidateFromRecord(record));
      console.log('Reconstructed candidates:', results);
      
      state.candidates = results;
      
      // Restore JD hash from localStorage
      try {
        const storedJdHash = localStorage.getItem('matchagig_jdHash');
        const storedJdTextSnapshot = localStorage.getItem('matchagig_jdTextSnapshot');
        
        if (storedJdHash) {
          state.jdHash = storedJdHash;
          state.jdTextSnapshot = storedJdTextSnapshot || '';
        }
      } catch (error) {
        console.error('❌ Failed to restore JD hash from localStorage:', error);
      }
      
              // Make sure DOM is ready before rendering
        if (listEl && statusEl) {
          renderList(listEl, results, onSelectCandidate);
          setStatus(statusEl, `Loaded ${results.length} stored candidate(s).`);
          
          // Check if we have a stored JD hash
          if (state.jdHash) {
            updateJDStatus(jdStatusEl, state.jdHash, state.jdTextSnapshot);
          }
          
          // Initialize chat
          chatLog.innerHTML = '';
          state.messages = [];
          state.currentCandidate = null;
        } else {
          setTimeout(loadStoredCandidates, 100);
        }
    }
  } catch (error) {
    console.error('❌ Error loading stored candidates:', error);
  }
}

// Wait for DOM to be ready before loading candidates
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    loadStoredCandidates();
    setupChatEventListeners(state, chatLog, chatText, jdTextEl);
  });
} else {
  loadStoredCandidates();
  setupChatEventListeners(state, chatLog, chatText, jdTextEl);
}

// Add refresh button functionality
refreshBtn.addEventListener('click', () => {
  loadStoredCandidates();
});

let selectedFiles = [];  // File[]

pdfInput.addEventListener('change', (e) => {
  selectedFiles = Array.from(e.target.files || []).filter(f => /\.pdf$/i.test(f.name));
  setStatus(statusEl, `${selectedFiles.length} PDF(s) ready`);
});

sendBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) { setStatus(statusEl, 'Select PDFs first.'); return; }

  sendBtn.disabled = true;
  setStatus(statusEl, 'Zipping…');

  try {
    // 1) Build the zip in-browser (keep original basenames)
    const zipBlob = await createZipFromFiles(selectedFiles);

    // 2) Submit to /v1/bulk-zip (multipart) with JD
    const jdText = jdTextEl.value.trim();
    const jdHash = jdHashEl.value.trim();
    
    setStatus(statusEl, 'Uploading…');
    const data = await bulkZipUpload(zipBlob, jdText, jdHash);

    // Check if backend returned a JD hash from bulk processing
    if (data.jdHash) {
      state.jdHash = data.jdHash;
      state.jdTextSnapshot = jdTextEl.value.trim();
      updateJDStatus(jdStatusEl, data.jdHash, state.jdTextSnapshot);
      
      // Store JD hash in localStorage for persistence
      try {
        localStorage.setItem('matchagig_jdHash', data.jdHash);
        localStorage.setItem('matchagig_jdTextSnapshot', state.jdTextSnapshot);
      } catch (error) {
        console.error('❌ Failed to store JD hash in localStorage:', error);
      }
    }

    // 3) Build a quick lookup filename -> File for local preview storage
    const fileMap = createFileMap(selectedFiles);

          // 4) Persist PDFs + canonicalText in IDB by resumeId
      for (const row of (data.results || [])) {
        const file = fileMap.get(baseName(row.filename));
        const objectUrl = file ? URL.createObjectURL(file) : '';
        
        console.log('Storing record for:', row.filename, 'file:', file, 'objectUrl:', objectUrl);
        
        const record = {
          resumeId: row.resumeId,
          fileData: file ? await file.arrayBuffer() : null, // Store as ArrayBuffer
          fileType: file ? file.type : null,
          canonicalText: row.canonicalText || '', // full normalized
          meta: {
            resumeId: row.resumeId,
            filename: baseName(row.filename),
            bytes: row.bytes || (file ? file.size : 0),
            email: row.email || null,
            cosine: row.cosine,
            objectUrl
          }
        };
        
        await putResume(record);
      }

    // 5) Build candidates array with objectUrl for immediate use
    state.candidates = (data.results || []).map(row => {
      const file = fileMap.get(baseName(row.filename));
      const objectUrl = file ? URL.createObjectURL(file) : '';
      
      return {
        ...row,
        objectUrl: objectUrl
      };
    });
    
         renderList(listEl, state.candidates, onSelectCandidate);
    
    // Update status with JD hash info if available
    let statusMsg = `Processed ${state.candidates.length} candidate(s).`;
    if (data.jdHash) {
      statusMsg += ` JD linked ✓ (${data.jdHash})`;
    }
    setStatus(statusEl, statusMsg);
  } catch (e) {
    console.error(e);
    setStatus(statusEl, e.message || 'Failed.');
  } finally {
    sendBtn.disabled = false;
  }
});

async function onSelectCandidate(e) {
  const rid = e.currentTarget.dataset.resumeId;
  console.log('Candidate clicked:', rid);
  
  // Find the candidate in our reconstructed state
  const candidate = state.candidates.find(c => c.resumeId === rid);
  if (!candidate) { 
    console.error('Candidate not found in state:', rid);
    setStatus(statusEl, 'Candidate not found in state.'); 
    return; 
  }
  
  console.log('Found candidate:', candidate);

  // Get the full record from IndexedDB for additional data
  const rec = await getResume(rid);
  if (!rec) { 
    console.error('Not found in IndexedDB:', rid);
    setStatus(statusEl, 'Not found in IndexedDB.'); 
    return; 
  }
  
  console.log('Found record in IndexedDB:', rec);

  // Set current candidate for chat
  state.currentCandidate = rec;
  state.messages = []; // start a fresh chat per candidate
  chatLog.innerHTML = '';

  viewerTitle.textContent = candidate.email || candidate.filename || candidate.resumeId;
  
  // Use the reconstructed objectUrl for PDF preview
  if (candidate.objectUrl) {
    console.log('Setting PDF frame src to:', candidate.objectUrl);
    pdfFrame.src = candidate.objectUrl;
  } else {
    console.log('No objectUrl found, clearing PDF frame');
    pdfFrame.src = '';
  }

  // Show loading state
  explainMd.textContent = 'Generating explanation...';
  explainMd.style.borderLeft = '4px solid #FF9800';
  explainMd.title = 'Loading...';
  
  try {
    await explainCandidateHandler(rec);
  } catch (err) {
    console.error(err);
    explainMd.textContent = 'Could not generate explanation.';
    explainMd.style.borderLeft = '4px solid #f44336';
    explainMd.title = 'Error occurred while generating explanation';
  }
}

async function explainCandidateHandler(rec) {
  // Check if we have a cached LLM response
  if (rec.llmResponse && rec.llmResponseTimestamp) {
    const age = Date.now() - rec.llmResponseTimestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (age < maxAge) {
      // Use cached response if it's less than 24 hours old
      explainMd.textContent = rec.llmResponse;
      // Add a small indicator that this is cached
      explainMd.style.borderLeft = '4px solid #4CAF50';
      explainMd.title = `Cached response from ${new Date(rec.llmResponseTimestamp).toLocaleString()}`;
      return;
    }
  }

  // API contract: use jdHash and resumeText
  if (!state.jdHash) {
    explainMd.textContent = '❌ JD Hash required. Please enter a valid JD hash in the hash field above.';
    explainMd.style.borderLeft = '4px solid #f44336';
    explainMd.title = 'JD Hash missing - enter hash for LLM explanations';
    return;
  }

  try {
    const result = await explainCandidate(state.jdHash, rec.canonicalText);
    
    // Adopt the JD hash if backend used/created one
    if (result.jdHashHeader) {
      state.jdHash = result.jdHashHeader;
      state.jdTextSnapshot = jdTextarea.value;
      updateJDStatus(jdStatusEl, result.jdHashHeader, state.jdTextSnapshot);
    }

    explainMd.textContent = result.markdown;
    explainMd.style.borderLeft = '4px solid #2196F3';
    explainMd.title = 'Fresh response generated just now';
    
    // Store the LLM response in IndexedDB
    try {
      await updateResumeLLMResponse(rec.resumeId, result.markdown);
    } catch (error) {
      console.error('Failed to store LLM response:', error);
    }
  } catch (error) {
    explainMd.textContent = error.message;
    explainMd.style.borderLeft = '4px solid #f44336';
    explainMd.title = `Error: ${error.message}`;
  }
}




