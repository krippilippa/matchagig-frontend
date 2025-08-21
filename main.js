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
const jobTitleDisplay = $('jobTitleDisplay');
const jdTextDisplay = $('jdTextDisplay');
const jdTextContent = $('jdTextContent');
const updateJdBtn = $('updateJdBtn');

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
    localStorage.removeItem('matchagig_jobTitle'); // Clear stored job title
    
    // Clear all chat history
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('matchagig_chat_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log('🗑️ Cleared chat history for all candidates');
    
    // Reset state
    state.candidates = [];
    state.jdHash = null;
    state.jdTextSnapshot = '';
    state.jobTitle = '';
    state.selectedCandidateId = null;
    state.chatHistory = {};
    state.messages = [];
    state.currentCandidate = null;

    // Clear UI
    clearUI(listEl, pdfFrame, viewerTitle, jdStatusEl, chatLog);

    // Switch back to landing page
    mainInterface.style.display = 'none';
    landingPage.style.display = 'block';
    
    // Reset landing page inputs
    landingPdfInput.value = ''; // Clear selected files
    landingJdText.value = ''; // Clear JD text
    updateUploadStatus(0); // Reset file count display
    
    console.log('🔄 Back to Demo: All storage cleared and UI reset.');
  } catch (error) {
    console.error('❌ Error clearing storage or resetting UI:', error);
    alert('Error resetting demo: ' + error.message);
  }
});

// --- State Management ---
const state = {
  jdHash: null,
  jdTextSnapshot: '',   // the JD textarea value that produced jdHash
  candidates: [],        // from /v1/bulk-zip
  messages: [],          // running chat
  currentCandidate: null, // { canonicalText, pdfUrl, email, ... }
  jobTitle: '', // Added for job title
  chatHistory: {} // Store chat history for each candidate
};

// Function to save chat history for a specific candidate
function saveChatHistory(candidateId, messages) {
  try {
    const chatKey = `matchagig_chat_${candidateId}`;
    localStorage.setItem(chatKey, JSON.stringify(messages));
    console.log('💾 Chat history saved for candidate:', candidateId);
  } catch (error) {
    console.error('❌ Failed to save chat history:', error);
  }
}

// Function to load chat history for a specific candidate
function loadChatHistory(candidateId) {
  try {
    const chatKey = `matchagig_chat_${candidateId}`;
    const stored = localStorage.getItem(chatKey);
    if (stored) {
      const messages = JSON.parse(stored);
      console.log('📱 Chat history loaded for candidate:', candidateId, 'Messages:', messages.length);
      return messages;
    }
  } catch (error) {
    console.error('❌ Failed to load chat history:', error);
  }
  return [];
}

// Function to clear chat history for a specific candidate
function clearChatHistory(candidateId) {
  try {
    const chatKey = `matchagig_chat_${candidateId}`;
    localStorage.removeItem(chatKey);
    console.log('🗑️ Chat history cleared for candidate:', candidateId);
  } catch (error) {
    console.error('❌ Failed to clear chat history:', error);
  }
}

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

// Check if we should skip the landing page and go straight to main interface
async function checkAndSkipLanding() {
  try {
    // Check if we have stored data
    const storedJdHash = localStorage.getItem('matchagig_jdHash');
    const storedJdTextSnapshot = localStorage.getItem('matchagig_jdTextSnapshot');
    const allRecords = await getAllResumes();
    
    if (storedJdHash && allRecords && allRecords.length > 0) {
      console.log('🚀 Found existing data, skipping to main interface');
      
      // Restore state from localStorage
      state.jdHash = storedJdHash;
      state.jdTextSnapshot = storedJdTextSnapshot || '';
      
      // Restore job title
      if (storedJdTextSnapshot) {
        const lines = storedJdTextSnapshot.split('\n');
        // Look for the job title line (usually after "About the job" or contains the role)
        let jobTitle = '';
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line && line !== 'About the job' && (line.includes('Representative') || line.includes('Developer') || line.includes('Manager') || line.includes('Engineer') || line.includes('Specialist') || line.includes('Analyst') || line.includes('Consultant'))) {
            jobTitle = line;
            break;
          }
        }
        
        // If we found a job title, use it
        if (jobTitle) {
          state.jobTitle = jobTitle;
          console.log('🏷️ Job title extracted from stored JD text:', jobTitle);
          const jobTitleDisplay = document.getElementById('jobTitleDisplay');
          if (jobTitleDisplay) {
            jobTitleDisplay.textContent = jobTitle;
          }
        } else {
          state.jobTitle = 'No job title available';
          console.log('⚠️ No job title could be extracted from stored JD text.');
        }
      } else {
        state.jobTitle = 'No job title available';
      }

      // Switch to main interface
      landingPage.style.display = 'none';
      mainInterface.style.display = 'flex';
      
      // Re-render candidates if needed (loadStoredCandidates already does this)
      // Ensure event listeners are set up for chat
      setupChatEventListeners(state, chatLog, chatText, landingJdText);
      
      // Add click handler for job title display
      if (jobTitleDisplay) {
        jobTitleDisplay.addEventListener('click', jobTitleDisplayClickHandler);
      }
      
      // Load the stored data
      await loadStoredCandidates();
    } else {
      console.log('📱 No existing data found, showing landing page');
    }
  } catch (error) {
    console.error('❌ Error checking for existing data:', error);
  }
}

// Call this function after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAndSkipLanding);
} else {
  checkAndSkipLanding();
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

  // Reconstruct objectUrl from stored fileData if needed
  if (rec.fileData && !rec.objectUrl) {
    try {
      const blob = new Blob([rec.fileData], { type: rec.fileType || 'application/pdf' });
      rec.objectUrl = URL.createObjectURL(blob);
      console.log('🔄 Reconstructed objectUrl from fileData:', rec.objectUrl);
    } catch (error) {
      console.error('❌ Failed to reconstruct objectUrl:', error);
    }
  }

  // Set current candidate for chat
  state.currentCandidate = rec;
  state.messages = []; // start a fresh chat per candidate
  chatLog.innerHTML = '';

  // Set the selected candidate in state
  state.selectedCandidateId = rid;

  // Load chat history for this candidate
  const candidateChatHistory = loadChatHistory(rid);
  state.messages = candidateChatHistory;
  
  // Update the PDF viewer
  if (rec.objectUrl) {
    pdfFrame.src = rec.objectUrl;
    console.log('📄 PDF loaded:', rec.objectUrl);
  } else {
    pdfFrame.src = '';
    console.warn('⚠️ No objectUrl for PDF:', rec);
    console.log('🔍 Full record object:', rec);
    console.log('🔍 Record keys:', Object.keys(rec));
    if (rec.meta) {
      console.log('🔍 Meta keys:', Object.keys(rec.meta));
    }
  }

  viewerTitle.textContent = candidate.email || candidate.filename || candidate.resumeId;
  
  // Switch back to PDF view when candidate is selected
  jdTextDisplay.style.display = 'none';
  pdfFrame.style.display = 'block';
  updateJdBtn.style.display = 'none';
  
  // Use the reconstructed objectUrl for PDF preview
  // pdfFrame.src = candidate.objectUrl; // Assuming objectUrl is part of candidate now

  // Clear previous chat messages and start new conversation
  chatLog.innerHTML = '';
  
  // Restore chat history if it exists
  if (candidateChatHistory.length > 0) {
    console.log('📱 Restoring chat history for candidate:', rid);
    candidateChatHistory.forEach(msg => {
      appendMsg(chatLog, state, msg.role, msg.content);
    });
  } else {
    // Start fresh conversation with initial assessment
    appendMsg(chatLog, state, 'assistant', 'Generating initial assessment...');
    
    // Trigger LLM explanation
    console.log('🚀 Calling explainCandidateHandler for:', rec.resumeId);
    await explainCandidateHandler(rec);
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
        objectUrl: objectUrl, // Store objectUrl at the top level for easier access
        meta: {
          resumeId: row.resumeId,
          filename: baseName(row.filename),
          bytes: row.bytes || (file ? file.size : 0),
          email: row.email || null,
          cosine: row.cosine
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

// Add click handler for job title display to show JD text
jobTitleDisplay.addEventListener('click', () => {
  if (state.jdTextSnapshot && state.jdTextSnapshot.trim()) {
    // Show JD text view
    jdTextDisplay.style.display = 'block';
    pdfFrame.style.display = 'none';
    viewerTitle.textContent = 'Job Description';
    updateJdBtn.style.display = 'block';
    
    // Populate the JD text content
    jdTextContent.value = state.jdTextSnapshot;
    
    console.log('📄 Switched to JD text view');
  } else {
    console.log('⚠️ No JD text available to display');
    alert('No job description text available to display.');
  }
});

// Handle JD text changes to show/hide Update button
jdTextContent.addEventListener('input', () => {
  const currentText = jdTextContent.value.trim();
  const originalText = state.jdTextSnapshot.trim();
  
  if (currentText !== originalText) {
    updateJdBtn.disabled = false;
    updateJdBtn.style.opacity = '1';
  } else {
    updateJdBtn.disabled = true;
    updateJdBtn.style.opacity = '0.3';
  }
});

// Handle Update button click
updateJdBtn.addEventListener('click', () => {
  if (!updateJdBtn.disabled) {
    alert('Coming in next version!');
  }
});




