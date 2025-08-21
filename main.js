// Pick PDFs → zip in browser → POST /v1/bulk-zip → show ranked list.
// Store PDFs + canonicalText in IndexedDB keyed by resumeId.

import { 
  putResume, 
  getResume, 
  getAllResumes, 
  clearAllResumes,
  updateResumeLLMResponse,
  saveJDData,
  loadJDData,
  clearAllStorage
} from './js/database.js';

import { 
  bulkZipUpload, 
  explainCandidate 
} from './js/api.js';

import { 
  setupChatEventListeners, 
  appendMsg, 
  resetChatEventListeners,
  addMessageToCandidate,
  getCandidateMessages,
  loadChatHistoryForCandidate
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
    uploadArea.innerHTML = `<strong>Click to select PDFs</strong><br>or drag and drop here`;
    uploadArea.style.borderColor = '#ccc';
  }
}

// --- Run Match Button ---
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
    
    // Clear all storage using consolidated function
    await clearAllStorage();
    
    // Reset state
    state.candidates = [];
    state.jdHash = null;
    state.jdTextSnapshot = '';
    state.jobTitle = '';
    state.selectedCandidateId = null;
    state.chatHistory = {};
    state.currentCandidate = null;
    state.autoSummariesGenerated = false;

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
  currentCandidate: null, // { canonicalText, pdfUrl, email, ... }
  jobTitle: '', // Added for job title
  chatHistory: {}, // Store chat history for each candidate: { candidateId: [messages] }
  selectedCandidateId: null, // Track which candidate is currently selected
  autoSummariesGenerated: false // Prevent duplicate auto-summary generation
};

// Chat history management is now handled by chat.js module

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

// Clear storage functionality is now handled by the clearAllStorage function in database.js

// Load stored candidates from IndexedDB on page load
async function loadStoredCandidates() {
  try {
    const allRecords = await getAllResumes();
    
    if (allRecords && allRecords.length > 0) {
      console.log('📱 Loading', allRecords.length, 'candidates from IndexedDB...');
      
      // Reconstruct the results array from stored data
      const results = allRecords.map(record => createCandidateFromRecord(record));
      console.log('✅ Reconstructed', results.length, 'candidates');
      
      state.candidates = results;
      
      // Restore JD data from storage
      try {
        const jdData = loadJDData();
        if (jdData.jdHash) {
          state.jdHash = jdData.jdHash;
          state.jdTextSnapshot = jdData.jdTextSnapshot || '';
          state.jobTitle = jdData.jobTitle || '';
        }
      } catch (error) {
        console.error('❌ Failed to restore JD data from storage:', error);
      }
      
      // Load chat history for all candidates BEFORE generating auto-summaries
      for (const candidate of results) {
        const candidateId = candidate.resumeId;
        const candidateChatHistory = loadChatHistoryForCandidate(candidateId);
        if (candidateChatHistory.length > 0) {
          // Store in state for backward compatibility during transition
          state.chatHistory[candidateId] = candidateChatHistory;
          console.log('📱 Loaded chat history for', candidateId, ':', candidateChatHistory.length, 'messages');
        }
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
        state.currentCandidate = null;
        
        // Auto-generate summaries for top 5 candidates
        if (state.jdHash && results.length > 0) {
          generateAutoSummaries(results);
        }
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
        const jdData = loadJDData();
        const allRecords = await getAllResumes();
        
        // Debug: Log what data is found
        console.log('🔄 State Restoration Check:', {
          hasJdHash: !!jdData.jdHash,
          hasJdText: !!jdData.jdTextSnapshot,
          hasJobTitle: !!jdData.jobTitle,
          hasRecords: !!allRecords,
          recordCount: allRecords?.length || 0
        });
        
        if (jdData.jdHash && allRecords && allRecords.length > 0) {
          console.log('🚀 Found existing data, skipping to main interface');
          
          // Restore state from storage
          state.jdHash = jdData.jdHash;
          state.jdTextSnapshot = jdData.jdTextSnapshot || '';
          state.jobTitle = jdData.jobTitle || '';
      
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
      
      // Auto-generate summaries for top 5 candidates if we have JD hash
      if (state.jdHash && state.candidates.length > 0) {
        generateAutoSummaries(state.candidates);
      }
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

// Refresh functionality can be added here if needed

let selectedFiles = [];  // File[]

pdfInput.addEventListener('change', (e) => {
  selectedFiles = Array.from(e.target.files || []).filter(f => /\.pdf$/i.test(f.name));
  setStatus(statusEl, `${selectedFiles.length} PDF(s) ready`);
});

// Manual send button functionality removed - now automatic

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

  // Get the full record from IndexedDB for additional data
  const rec = await getResume(rid);
  if (!rec) { 
    console.error('❌ Not found in IndexedDB:', rid);
    setStatus(statusEl, 'Not found in IndexedDB.'); 
    return; 
  }
  
  // Set current candidate for chat
  state.currentCandidate = rec;
  state.selectedCandidateId = rid;

        // Load chat history for this candidate
      const candidateChatHistory = loadChatHistoryForCandidate(rid);
      if (!state.chatHistory[rid]) {
        state.chatHistory[rid] = [];
      }
      state.chatHistory[rid] = candidateChatHistory;
  
  // Debug: Log what chat history was loaded
  console.log('🔍 Individual candidate chat history loaded:', {
    candidateId: rid,
    loadedMessages: candidateChatHistory.length,
    totalStateHistory: Object.keys(state.chatHistory).length,
    stateHistoryKeys: Object.keys(state.chatHistory)
  });

  // Update the PDF viewer
  if (candidate.objectUrl) {
    // Debug: Log PDF loading details
    console.log('🔍 PDF Loading for candidate:', rid, {
      candidateObjectUrl: candidate.objectUrl,
      candidateKeys: Object.keys(candidate),
      pdfFrameState: {
        src: pdfFrame.src,
        dimensions: { width: pdfFrame.offsetWidth, height: pdfFrame.offsetHeight }
      }
    });
    
    pdfFrame.src = candidate.objectUrl;
    console.log('📄 PDF loaded:', candidate.objectUrl);
  } else {
    pdfFrame.src = '';
    console.warn('⚠️ No objectUrl for PDF:', candidate);
  }

  viewerTitle.textContent = candidate.email || candidate.filename || candidate.resumeId;
  
  // Switch back to PDF view when candidate is selected
  jdTextDisplay.style.display = 'none';
  pdfFrame.style.display = 'block';
  updateJdBtn.style.display = 'none';

  // Clear chat display and restore this candidate's chat history
  chatLog.innerHTML = '';
  
  // Restore chat history if it exists
  if (candidateChatHistory.length > 0) {
    console.log('📱 Restoring', candidateChatHistory.length, 'messages for candidate:', rid);
    candidateChatHistory.forEach(msg => {
      appendMsg(chatLog, msg.role, msg.content);
    });
  } else {
    // Start fresh conversation with initial assessment
    addMessageToCandidate(rid, 'assistant', 'Generating initial assessment...');
    appendMsg(chatLog, 'assistant', 'Generating initial assessment...');
    
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
      addMessageToCandidate(rec.resumeId, 'assistant', rec.llmResponse);
      if (rec.resumeId === state.selectedCandidateId) {
        appendMsg(chatLog, 'assistant', rec.llmResponse);
      }
      return;
    } else {
      console.log('⏰ Cached response expired (age:', age, 'ms)');
    }
  }

  // API contract: use jdHash and resumeText
  console.log('🔑 Checking JD hash:', state.jdHash);
  if (!state.jdHash) {
    console.error('❌ No JD hash found in state');
    const errorMsg = '❌ JD Hash required. Please enter a valid JD hash in the hash field above.';
    addMessageToCandidate(rec.resumeId, 'assistant', errorMsg);
    if (rec.resumeId === state.selectedCandidateId) {
      appendMsg(chatLog, 'assistant', errorMsg);
    }
    return;
  }

  console.log('📝 Resume text length:', rec.canonicalText?.length || 0);
  if (!rec.canonicalText) {
    console.error('❌ No canonical text found in record');
    const errorMsg = '❌ No resume text found for this candidate.';
    addMessageToCandidate(rec.resumeId, 'assistant', errorMsg);
    if (rec.resumeId === state.selectedCandidateId) {
      appendMsg(chatLog, 'assistant', errorMsg);
    }
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
    addMessageToCandidate(rec.resumeId, 'assistant', result.markdown);
    if (rec.resumeId === state.selectedCandidateId) {
      appendMsg(chatLog, 'assistant', result.markdown);
    }
    
    // Store the LLM response in IndexedDB
    try {
      await updateResumeLLMResponse(rec.resumeId, result.markdown);
      console.log('💾 LLM response stored in IndexedDB');
    } catch (error) {
      console.error('❌ Failed to store LLM response:', error);
    }
  } catch (error) {
    console.error('❌ API call failed:', error);
    const errorMsg = '❌ Error: ' + error.message;
    addMessageToCandidate(rec.resumeId, 'assistant', errorMsg);
    if (rec.resumeId === state.selectedCandidateId) {
      appendMsg(chatLog, 'assistant', errorMsg);
    }
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
    console.log('🔍 API response received, processing candidates...');
    
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
      console.log('⚠️ No job title found in response');
    }

    // Check if backend returned a JD hash from bulk processing
    if (data.jdHash) {
      console.log('🔑 Backend returned JD hash:', data.jdHash);
      state.jdHash = data.jdHash;
      state.jdTextSnapshot = landingJdText.value.trim();
      // JD status is hidden in demo mode
      
      // Store JD data in storage
      try {
        saveJDData(data.jdHash, state.jdTextSnapshot, state.jobTitle);
        console.log('💾 JD data stored');
      } catch (error) {
        console.error('❌ Failed to store JD data:', error);
      }
    } else {
      console.log('⚠️ No JD hash returned from backend');
    }

    // 3) Build a quick lookup filename -> File for local preview storage
    const fileMap = createFileMap(selectedFiles);

    // 4) Persist PDFs + canonicalText in IDB by resumeId
    for (const row of (data.results || [])) {
      const file = fileMap.get(baseName(row.filename));
      const objectUrl = file ? URL.createObjectURL(file) : '';
      
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
    if (state.jdHash) {
      setStatus(statusEl, `✅ ${state.candidates.length} candidates processed. JD hash: ${state.jdHash}`);
      
      // Auto-generate summaries for top 5 candidates
      generateAutoSummaries(state.candidates);
    } else {
      setStatus(statusEl, `✅ ${state.candidates.length} candidates processed.`);
    }
    
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

// Function to handle job title display click
function jobTitleDisplayClickHandler() {
  // Show JD text display and hide PDF frame
  jdTextDisplay.style.display = 'block';
  pdfFrame.style.display = 'none';
  
  // Update viewer title
  viewerTitle.textContent = 'Job Description';
  
  // Populate JD text content
  jdTextContent.value = state.jdTextSnapshot || '';
  
  // Show update button
  updateJdBtn.style.display = 'block';
  
  console.log('📝 Showing job description text for editing');
}

// Function to automatically generate summaries for top candidates
async function generateAutoSummaries(candidates) {
  // Prevent duplicate generation
  if (state.autoSummariesGenerated) {
    console.log('🚫 Auto-summaries already generated, skipping...');
    return;
  }
  
  const topCandidates = candidates.slice(0, 5); // First 5 candidates
  console.log('🚀 Auto-generating summaries for top', topCandidates.length, 'candidates');
  
  // Set flag to prevent duplicate calls
  state.autoSummariesGenerated = true;
  
  for (const candidate of topCandidates) {
    const candidateId = candidate.resumeId;
    
    // Check if this candidate already has a summary using the new chat system
    const existingHistory = getCandidateMessages(candidateId);
    const hasSummary = existingHistory.some(msg => 
      msg.role === 'assistant' && 
      msg.content !== 'Generating initial assessment...' &&
      msg.content !== '❌ Failed to generate assessment:' &&
      (msg.content.includes('assessment') || 
       msg.content.includes('summary') ||
       msg.content.includes('fit') ||
       msg.content.includes('Technical Sales Representative') ||
       msg.content.includes('experience') ||
       msg.content.includes('skills') ||
       msg.content.includes('background'))
    );
    
    if (!hasSummary) {
      console.log('📝 Generating auto-summary for candidate:', candidateId);
      
      // Add loading message to candidate's history
      addMessageToCandidate(candidateId, 'assistant', 'Generating initial assessment...');
      
      try {
        // Get the full record from IndexedDB
        const rec = await getResume(candidateId);
        if (rec) {
          // Generate the summary in the background
          generateCandidateSummary(rec);
        }
      } catch (error) {
        console.error('❌ Error generating auto-summary for candidate:', candidateId, error);
        addMessageToCandidate(candidateId, 'assistant', '❌ Failed to generate assessment: ' + error.message);
      }
    } else {
      // Debug: Log what summary was found
      const summaryMsg = existingHistory.find(msg => 
        msg.role === 'assistant' && 
        msg.content !== 'Generating initial assessment...' &&
        msg.content !== '❌ Failed to generate assessment:' &&
        (msg.content.includes('assessment') || 
         msg.content.includes('summary') ||
         msg.content.includes('fit') ||
         msg.content.includes('Technical Sales Representative') ||
         msg.content.includes('experience') ||
         msg.content.includes('skills') ||
         msg.content.includes('background'))
      );
      
      if (summaryMsg) {
        console.log('✅ Candidate already has summary:', candidateId, 'Content preview:', summaryMsg.content.substring(0, 50) + '...');
      } else {
        console.log('⚠️ Candidate has loading/error state, will regenerate summary:', candidateId);
      }
    }
  }
}

// Function to generate candidate summary in background
async function generateCandidateSummary(rec) {
  try {
    console.log('🔍 Generating summary for candidate:', rec.resumeId);
    
    // Call the LLM API - parameters should be (jdHash, resumeText)
    const result = await explainCandidate(state.jdHash, rec.canonicalText);
    
    // Store the response in the correct candidate's chat history
    addMessageToCandidate(rec.resumeId, 'assistant', result.markdown);
    
    // Store the LLM response in IndexedDB for caching
    rec.llmResponse = result.markdown;
    rec.llmResponseTimestamp = Date.now();
    await putResume(rec);
    
    console.log('✅ Summary generated and stored for candidate:', rec.resumeId);
  } catch (error) {
    console.error('❌ Error generating summary for candidate:', rec.resumeId, error);
    addMessageToCandidate(rec.resumeId, 'assistant', '❌ Failed to generate assessment: ' + error.message);
  }
}




