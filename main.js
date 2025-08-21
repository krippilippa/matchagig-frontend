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
const jdHashEl   = $('jdHash');
const statusEl   = $('status');
const listEl     = $('list');
const pdfFrame   = $('pdfFrame');
const viewerTitle= $('viewerTitle');
const jdStatusEl = $('jdStatus');
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
runMatchBtn.addEventListener('click', async () => {
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
  // Note: jdTextEl textarea was removed, so we don't set its value anymore
  
  // Switch to main interface
  landingPage.style.display = 'none';
  mainInterface.style.display = 'flex';
  
  // Set selected files and trigger the matching process
  selectedFiles = Array.from(files).filter(f => /\.pdf$/i.test(f.name));
  setStatus(statusEl, `${selectedFiles.length} PDF(s) ready`);
  
  // Automatically trigger the matching process
  try {
    runMatchBtn.disabled = true;
    runMatchBtn.textContent = 'Processing...';
    
    // Trigger the existing upload flow automatically
    await processResumes();
    
  } catch (error) {
    console.error('Error during matching:', error);
    setStatus(statusEl, 'Error during matching: ' + error.message);
  } finally {
    runMatchBtn.disabled = false;
    runMatchBtn.textContent = 'Run Match';
  }
});

// Handle Back to Demo button
backToDemoBtn.addEventListener('click', async () => {
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
    state.messages = [];
    state.currentCandidate = null;
    
    // Clear UI
    clearUI(listEl, pdfFrame, viewerTitle, jdStatusEl, chatLog);
    
    // Reset chat event listeners
    resetChatEventListeners();
    
    // Switch back to landing page
    mainInterface.style.display = 'none';
    landingPage.style.display = 'block';
    
    // Reset landing page
    landingPdfInput.value = '';
    landingJdText.value = '';
    updateUploadStatus(0);
    
    // Update status
    setStatus(statusEl, 'Demo reset. Ready for fresh upload.');
  } catch (error) {
    console.error('❌ Error resetting demo:', error);
    setStatus(statusEl, 'Error resetting demo: ' + error.message);
  }
});

// --- State Management ---
const state = {
  jdHash: null,
  jdTextSnapshot: '',   // the JD textarea value that produced jdHash
  candidates: [],        // from /v1/bulk-zip
  messages: [],          // running chat
  currentCandidate: null, // { canonicalText, pdfUrl, email, ... }
  jobTitle: '' // Added for job title
};

// --- Event Listeners ---

// Handle manual JD hash input (for bulk-zip compatibility)
jdHashEl.addEventListener('input', () => {
  const hash = jdHashEl.value.trim();
  if (hash) {
    state.jdHash = hash;
    state.jdTextSnapshot = landingJdText.value;
    // JD status is hidden in demo mode
  } else {
    state.jdHash = null;
    state.jdTextSnapshot = '';
  }
});

// Initialize JD status display
if (jdHashEl.value.trim()) {
  const hash = jdHashEl.value.trim();
  state.jdHash = hash;
  state.jdTextSnapshot = landingJdText.value;
  // JD status is hidden in demo mode
}

// Add clear storage functionality
// clearStorageBtn.addEventListener('click', async () => {
//   if (confirm('⚠️ This will clear ALL stored data (candidates, PDFs, JD hash). Are you sure?')) {
//     try {
//       // Clear IndexedDB
//       await clearAllResumes();
      
//       // Clear localStorage
//       localStorage.removeItem('matchagig_jdHash');
//       localStorage.removeItem('matchagig_jdTextSnapshot');
      
//       // Reset state
//       state.jdHash = null;
//       state.jdTextSnapshot = '';
//       state.candidates = [];
      
//       // Clear UI
//       clearUI(listEl, pdfFrame, viewerTitle, jdStatusEl, chatLog);
      
//       // Clear chat state
//       state.messages = [];
//       state.currentCandidate = null;
      
//       // Reset event listener flag so they can be setup again if needed
//       resetChatEventListeners();
      
//       // Update status
//       setStatus(statusEl, 'All storage cleared. Ready for fresh upload.');
//     } catch (error) {
//       console.error('❌ Error clearing storage:', error);
//       setStatus(statusEl, 'Error clearing storage: ' + error.message);
//     }
//   }
// });

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
            // JD status is hidden in demo mode
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
    setupChatEventListeners(state, chatLog, chatText, landingJdText);
  });
} else {
  loadStoredCandidates();
  setupChatEventListeners(state, chatLog, chatText, landingJdText);
}

// Add refresh button functionality
// refreshBtn.addEventListener('click', () => {
//   loadStoredCandidates();
// });

let selectedFiles = [];  // File[]

pdfInput.addEventListener('change', (e) => {
  selectedFiles = Array.from(e.target.files || []).filter(f => /\.pdf$/i.test(f.name));
  setStatus(statusEl, `${selectedFiles.length} PDF(s) ready`);
});

// sendBtn.addEventListener('click', async () => {
//   await processResumes();
// });

async function onSelectCandidate(e) {
  const rid = e.currentTarget.dataset.resumeId;
  console.log('🎯 Candidate clicked:', rid);
  
  // Find the candidate in our reconstructed state
  const candidate = state.candidates.find(c => c.resumeId === rid);
  if (!candidate) { 
    console.error('❌ Candidate not found in state:', rid);
    setStatus(statusEl, 'Candidate not found in state.'); 
    return; 
  }
  
  console.log('✅ Found candidate:', candidate);

  // Get the full record from IndexedDB for additional data
  const rec = await getResume(rid);
  if (!rec) { 
    console.error('❌ Not found in IndexedDB:', rid);
    setStatus(statusEl, 'Not found in IndexedDB.'); 
    return; 
  }
  
  console.log('✅ Found record in IndexedDB:', rec);

  // Set current candidate for chat
  state.currentCandidate = rec;
  state.messages = []; // start a fresh chat per candidate
  chatLog.innerHTML = '';

  viewerTitle.textContent = candidate.email || candidate.filename || candidate.resumeId;
  
  // Use the reconstructed objectUrl for PDF preview
  if (candidate.objectUrl) {
    console.log('📄 Setting PDF frame src to:', candidate.objectUrl);
    pdfFrame.src = candidate.objectUrl;
  } else {
    console.log('❌ No objectUrl found, clearing PDF frame');
    pdfFrame.src = '';
  }

  // Debug: Check current state
  console.log('🔍 Current state:', {
    jdHash: state.jdHash,
    jdTextSnapshot: state.jdTextSnapshot,
    currentCandidate: !!state.currentCandidate,
    candidateId: state.currentCandidate?.resumeId
  });

  // Show loading state in chat
  appendMsg(chatLog, state, 'assistant', 'Generating initial assessment...');
  
  try {
    console.log('🚀 Calling explainCandidateHandler...');
    await explainCandidateHandler(rec);
    console.log('✅ explainCandidateHandler completed successfully');
  } catch (err) {
    console.error('❌ Error in explainCandidateHandler:', err);
    appendMsg(chatLog, state, 'assistant', 'Could not generate initial assessment: ' + err.message);
  }
}

async function explainCandidateHandler(rec) {
  console.log('🔍 explainCandidateHandler called with record:', rec.resumeId);
  
  // Check if we have a cached LLM response
  if (rec.llmResponse && rec.llmResponseTimestamp) {
    const age = Date.now() - rec.llmResponseTimestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (age < maxAge) {
      console.log('✅ Using cached LLM response (age:', age, 'ms)');
      appendMsg(chatLog, state, 'assistant', rec.llmResponse);
      return;
    } else {
      console.log('⏰ Cached response expired (age:', age, 'ms)');
    }
  }

  // API contract: use jdHash and resumeText
  console.log('🔑 Checking JD hash:', state.jdHash);
  if (!state.jdHash) {
    console.error('❌ No JD hash found in state');
    appendMsg(chatLog, state, 'assistant', '❌ JD Hash required. Please enter a valid JD hash in the hash field above.');
    return;
  }

  console.log('📝 Resume text length:', rec.canonicalText?.length || 0);
  if (!rec.canonicalText) {
    console.error('❌ No canonical text found in record');
    appendMsg(chatLog, state, 'assistant', '❌ No resume text found for this candidate.');
    return;
  }

  try {
    console.log('🚀 Calling explainCandidate API...');
    const result = await explainCandidate(state.jdHash, rec.canonicalText);
    console.log('✅ API call successful, response length:', result.markdown?.length || 0);
    
    // Adopt the JD hash if backend used/created one
    if (result.jdHashHeader) {
      console.log('🔄 Backend provided JD hash:', result.jdHashHeader);
      state.jdHash = result.jdHashHeader;
      state.jdTextSnapshot = landingJdText.value;
    }

    // Send the LLM response to chat
    appendMsg(chatLog, state, 'assistant', result.markdown);
    
    // Store the LLM response in IndexedDB
    try {
      await updateResumeLLMResponse(rec.resumeId, result.markdown);
      console.log('💾 LLM response stored in IndexedDB');
    } catch (error) {
      console.error('❌ Failed to store LLM response:', error);
    }
  } catch (error) {
    console.error('❌ API call failed:', error);
    appendMsg(chatLog, state, 'assistant', '❌ Error: ' + error.message);
  }
}

// Extract the resume processing logic into a reusable function
async function processResumes() {
  if (!selectedFiles.length) { 
    setStatus(statusEl, 'Select PDFs first.'); 
    return; 
  }

  // sendBtn.disabled = true; // Removed sendBtn
  setStatus(statusEl, 'Zipping…');

  try {
    // 1) Build the zip in-browser (keep original basenames)
    const zipBlob = await createZipFromFiles(selectedFiles);

    // 2) Submit to /v1/bulk-zip (multipart) with JD
    const jdText = landingJdText.value.trim();
    const jdHash = jdHashEl.value.trim();
    
    setStatus(statusEl, 'Uploading…');
    const data = await bulkZipUpload(zipBlob, jdText, jdHash);

    // Debug: Log the full API response
    console.log('🔍 Full API response from /v1/bulk-zip:', data);
    console.log('🔍 Data.jd structure:', data.jd);
    console.log('🔍 Data.jd.roleOrg:', data.jd?.roleOrg);
    console.log('🔍 Data.jd.roleOrg.title:', data.jd?.roleOrg?.title);

    // Extract job title from the response
    if (data.jd && data.jd.roleOrg && data.jd.roleOrg.title) {
      console.log('🏷️ Job title extracted:', data.jd.roleOrg.title);
      state.jobTitle = data.jd.roleOrg.title;
      
      // Update the job title display
      const jobTitleDisplay = document.getElementById('jobTitleDisplay');
      if (jobTitleDisplay) {
        jobTitleDisplay.textContent = data.jd.roleOrg.title;
      }
    } else {
      console.log('⚠️ No job title found in response. Data.jd.roleOrg:', data.jd?.roleOrg);
    }

    // Check if backend returned a JD hash from bulk processing
    if (data.jdHash) {
      console.log('🔑 Backend returned JD hash:', data.jdHash);
      state.jdHash = data.jdHash;
      state.jdTextSnapshot = landingJdText.value.trim();
      // JD status is hidden in demo mode
      
      // Store JD hash in localStorage for persistence
      try {
        localStorage.setItem('matchagig_jdHash', data.jdHash);
        localStorage.setItem('matchagig_jdTextSnapshot', state.jdTextSnapshot);
        console.log('💾 JD hash stored in localStorage');
      } catch (error) {
        console.error('❌ Failed to store JD hash in localStorage:', error);
      }
    } else {
      console.log('⚠️ No JD hash returned from backend');
    }

    console.log('🔍 Final state after processing:', {
      jdHash: state.jdHash,
      jdTextSnapshot: state.jdTextSnapshot,
      candidatesCount: state.candidates.length
    });

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
      statusMsg = `Successfully processed ${state.candidates.length} candidate(s).`;
    }
    setStatus(statusEl, statusMsg);
    
  } catch (e) {
    console.error(e);
    setStatus(statusEl, e.message || 'Failed.');
    throw e; // Re-throw to be caught by the calling function
  } finally {
    // sendBtn.disabled = false; // Removed sendBtn
  }
}




