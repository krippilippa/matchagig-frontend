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
  explainCandidate,
  seedCandidateThread
} from './js/api.js';

import { 
  setupChatEventListeners, 
  appendMsg, 
  resetChatEventListeners,
  addMessageToCandidate,
  getCandidateMessages,
  loadChatHistoryForCandidate,
  updateChatButtonStates
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

// ============================================================================
// DOM ELEMENT REFERENCES
// ============================================================================

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
const pdfInput = $('pdfInput');
const jdHashEl = $('jdHash');
const statusEl = $('status');
const listEl = $('list');
const pdfFrame = $('pdfFrame');
const viewerTitle = $('viewerTitle');
const jdStatusEl = $('jdStatus');
const chatLog = $('chatLog');
const chatText = $('chatText');
const jobTitleDisplay = $('jobTitleDisplay');
const jdTextDisplay = $('jdTextDisplay');
const jdTextContent = $('jdTextContent');
const updateJdBtn = $('updateJdBtn');

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  jdHash: null,
  jdTextSnapshot: '',   // the JD textarea value that produced jdHash
  candidates: [],        // from /v1/bulk-zip
  currentCandidate: null, // { canonicalText, pdfUrl, email, ... }
  jobTitle: '', // Added for job title
  chatHistory: {}, // Store chat history for each candidate: { candidateId: [messages] }
  selectedCandidateId: null, // Track which candidate is currently selected
  seededCandidates: new Set() // Track which candidates have been seeded for stateful chat
};

let selectedFiles = [];  // File[]

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================

function setupEventListeners() {
  console.log('🔧 setupEventListeners()');
  // Landing page events
  uploadArea.addEventListener('click', handleUploadClick);
  uploadArea.addEventListener('dragover', handleDragOver);
  uploadArea.addEventListener('dragleave', handleDragLeave);
  uploadArea.addEventListener('drop', handleFileDrop);
  landingPdfInput.addEventListener('change', handleFileSelect);
  runMatchBtn.addEventListener('click', handleRunMatch);
  backToDemoBtn.addEventListener('click', handleBackToDemo);

  // Main interface events
  pdfInput.addEventListener('change', handlePdfInputChange);
  jdHashEl.addEventListener('input', handleJdHashInput);
  jobTitleDisplay.addEventListener('click', handleJobTitleClick);
  jdTextContent.addEventListener('input', handleJdTextChange);
  updateJdBtn.addEventListener('click', handleUpdateJdClick);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Landing page event handlers
function handleUploadClick() {
  console.log('🔧 handleUploadClick()');
  landingPdfInput.click();
}

function handleDragOver(e) {
  console.log('🔧 handleDragOver()');
  e.preventDefault();
  uploadArea.style.borderColor = '#666';
}

function handleDragLeave(e) {
  console.log('🔧 handleDragLeave()');
  e.preventDefault();
  uploadArea.style.borderColor = '#ccc';
}

function handleFileDrop(e) {
  console.log('🔧 handleFileDrop()');
  e.preventDefault();
  uploadArea.style.borderColor = '#ccc';
  
  const files = Array.from(e.dataTransfer.files).filter(f => /\.pdf$/i.test(f.name));
  if (files.length > 0) {
    landingPdfInput.files = e.dataTransfer.files;
    updateUploadStatus(files.length);
  }
}

function handleFileSelect(e) {
  console.log('🔧 handleFileSelect()');
  const files = Array.from(e.target.files || []).filter(f => /\.pdf$/i.test(f.name));
  updateUploadStatus(files.length);
}

async function handleRunMatch() {
  console.log('🔧 handleRunMatch()');
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
}

async function handleBackToDemo() {
  console.log('🔧 handleBackToDemo()');
  try {
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
    state.seededCandidates.clear();

    // Clear UI
    clearUI(listEl, pdfFrame, viewerTitle, jdStatusEl, chatLog);
    
    // Update chat button states after clearing
    updateChatButtonStates(state);

    // Switch back to landing page
    mainInterface.style.display = 'none';
    landingPage.style.display = 'block';
    
    // Reset landing page inputs
    landingPdfInput.value = '';
    landingJdText.value = '';
    updateUploadStatus(0);
    
    console.log('🔄 Back to Demo: All storage cleared and UI reset.');
  } catch (error) {
    console.error('❌ Error clearing storage or resetting UI:', error);
    alert('Error resetting demo: ' + error.message);
  }
}

// Main interface event handlers
function handlePdfInputChange(e) {
  console.log('🔧 handlePdfInputChange()');
  selectedFiles = Array.from(e.target.files || []).filter(f => /\.pdf$/i.test(f.name));
  setStatus(statusEl, `${selectedFiles.length} PDF(s) ready`);
}

function handleJdHashInput() {
  console.log('🔧 handleJdHashInput()');
  const hash = jdHashEl.value.trim();
  if (hash) {
    state.jdHash = hash;
    state.jdTextSnapshot = landingJdText.value;
  } else {
    state.jdHash = null;
    state.jdTextSnapshot = '';
  }
}

function handleJobTitleClick() {
  console.log('🔧 handleJobTitleClick()');
  if (state.jdTextSnapshot && state.jdTextSnapshot.trim()) {
    // Show JD text view
    jdTextDisplay.style.display = 'block';
    pdfFrame.style.display = 'none';
    viewerTitle.textContent = 'Job Description';
    updateJdBtn.style.display = 'block';
    
    // Populate the JD text content
    jdTextContent.value = state.jdTextSnapshot;
  } else {
    console.log('⚠️ No JD text available to display');
    alert('No job description text available to display.');
  }
}

function handleJdTextChange() {
  console.log('🔧 handleJdTextChange()');
  const currentText = jdTextContent.value.trim();
  const originalText = state.jdTextSnapshot.trim();
  
  if (currentText !== originalText) {
    updateJdBtn.disabled = false;
    updateJdBtn.style.opacity = '1';
  } else {
    updateJdBtn.disabled = true;
    updateJdBtn.style.opacity = '0.3';
  }
}

function handleUpdateJdClick() {
  console.log('🔧 handleUpdateJdClick()');
  if (!updateJdBtn.disabled) {
    alert('Coming in next version!');
  }
}

// ============================================================================
// BUSINESS LOGIC FUNCTIONS
// ============================================================================

// Upload status management
function updateUploadStatus(fileCount) {
  console.log('🔧 updateUploadStatus()', fileCount);
  if (fileCount > 0) {
    uploadArea.innerHTML = `<strong>${fileCount} PDF file(s) selected</strong><br>Ready to process`;
    uploadArea.style.borderColor = '#4CAF50';
  } else {
    uploadArea.innerHTML = `<strong>Click to select PDFs</strong><br>or drag and drop here`;
    uploadArea.style.borderColor = '#ccc';
  }
}

// Resume processing
async function processResumes() {
  console.log('🔧 processResumes()');
  if (!selectedFiles.length) { 
    setStatus(statusEl, 'Select PDFs first.'); 
    return; 
  }

  setStatus(statusEl, 'Zipping…');

  try {
    // 1) Build the zip in-browser (keep original basenames)
    const zipBlob = await createZipFromFiles(selectedFiles);

    // 2) Submit to /v1/bulk-zip (multipart) with JD
    const jdText = landingJdText.value.trim();
    const jdHash = jdHashEl.value.trim();
    
    setStatus(statusEl, 'Uploading…');
    const data = await bulkZipUpload(zipBlob, jdText, jdHash);
    
    // Extract job title from the response
    if (data.jd && data.jd.roleOrg && data.jd.roleOrg.title) {
      state.jobTitle = data.jd.roleOrg.title;
      
      // Update the job title display
      const jobTitleDisplay = document.getElementById('jobTitleDisplay');
      if (jobTitleDisplay) {
        jobTitleDisplay.textContent = data.jd.roleOrg.title;
      }
    }

    // Check if backend returned a JD hash from bulk processing
    if (data.jdHash) {
      state.jdHash = data.jdHash;
      state.jdTextSnapshot = landingJdText.value.trim();
      
      // Store JD data in storage
      try {
        saveJDData(data.jdHash, state.jdTextSnapshot, state.jobTitle);
      } catch (error) {
        console.error('❌ Failed to store JD data:', error);
      }
    }

    // 3) Build a quick lookup filename -> File for local preview storage
    const fileMap = createFileMap(selectedFiles);

    // 4) Persist PDFs + canonicalText in IDB by resumeId
    for (const row of (data.results || [])) {
      const filename = baseName(row.filename);  // Call once, store result
      const file = fileMap.get(filename);
      const objectUrl = file ? URL.createObjectURL(file) : '';
      
      const record = {
        resumeId: row.resumeId,
        fileData: file ? await file.arrayBuffer() : null,
        fileType: file ? file.type : null,
        canonicalText: row.canonicalText || '',
        objectUrl: objectUrl,
        meta: {
          resumeId: row.resumeId,
          filename: filename,  // Use stored result
          bytes: row.bytes || (file ? file.size : 0),
          email: row.email || null,
          cosine: row.cosine
        }
      };
      
      await putResume(record);
    }

    // 5) Build candidates array with objectUrl for immediate use
    state.candidates = (data.results || []).map(row => {
      const filename = baseName(row.filename);  // Call once, store result
      const file = fileMap.get(filename);
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
    } else {
      setStatus(statusEl, `✅ ${state.candidates.length} candidates processed.`);
    }
    
  } catch (e) {
    console.error(e);
    setStatus(statusEl, e.message || 'Failed.');
    throw e;
  }
}

// Candidate selection and management
async function onSelectCandidate(e) {
  console.log('🔧 onSelectCandidate()');
  const rid = e.currentTarget.dataset.resumeId;
  
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

  // Always load fresh chat history for the selected candidate
  let candidateChatHistory = loadChatHistoryForCandidate(rid);
  state.chatHistory[rid] = candidateChatHistory;  // Update cache with fresh data

  // Update the PDF viewer
  if (candidate.objectUrl) {    
    pdfFrame.src = candidate.objectUrl;
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
  
  // Seed the candidate thread if not already done
  if (!state.seededCandidates.has(rid)) {
    try {
      console.log('🌱 Seeding candidate thread for:', rid);
      console.log('🌱 JD Hash:', state.jdHash);
      console.log('🌱 Resume text length:', rec.canonicalText?.length);
      appendMsg(chatLog, 'assistant', 'Initializing chat context...');
      
      const seedResult = await seedCandidateThread(rid, state.jdHash, rec.canonicalText);
      console.log('🌱 Seed result:', seedResult);
      
      state.seededCandidates.add(rid);
      
      // Add context loaded message
      appendMsg(chatLog, 'assistant', 'Context loaded. Ask me anything.');
      addMessageToCandidate(rid, 'assistant', 'Context loaded. Ask me anything.');
      
      console.log('✅ Candidate thread seeded successfully');
      
      // Update button states now that candidate is seeded
      updateChatButtonStates(state);
    } catch (error) {
      console.error('❌ Failed to seed candidate thread:', error);
      appendMsg(chatLog, 'assistant', `Failed to initialize chat: ${error.message}`);
      addMessageToCandidate(rid, 'assistant', `Failed to initialize chat: ${error.message}`);
      
      // Fall back to old method
      if (candidateChatHistory.length === 0) {
        addMessageToCandidate(rid, 'assistant', 'Generating initial assessment...');
        appendMsg(chatLog, 'assistant', 'Generating initial assessment...');
        await explainCandidateHandler(rec);
      }
    }
  } else {
    console.log('✅ Candidate thread already seeded for:', rid);
  }
  
  // Restore chat history if it exists
  if (candidateChatHistory.length > 0) {
    candidateChatHistory.forEach(msg => {
      appendMsg(chatLog, msg.role, msg.content);
    });
  }
  
  // Update chat button states after candidate selection
  updateChatButtonStates(state);
}

// LLM explanation handling
async function explainCandidateHandler(rec) {
  console.log('🔧 explainCandidateHandler()');
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

  if (!state.jdHash) {
    console.error('❌ No JD hash found in state');
    const errorMsg = '❌ JD Hash required. Please enter a valid JD hash in the hash field above.';
    addMessageToCandidate(rec.resumeId, 'assistant', errorMsg);
    if (rec.resumeId === state.selectedCandidateId) {
      appendMsg(chatLog, 'assistant', errorMsg);
    }
    return;
  }

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
    const result = await explainCandidate(state.jdHash, rec.canonicalText);
    
    // Adopt the JD hash if backend used/created one
    if (result.jdHashHeader) {
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
    } catch (error) {
      console.error('❌ Failed to store LLM response:', error);
    }
    
    // Update button states after LLM response
    updateChatButtonStates(state);
  } catch (error) {
    console.error('❌ API call failed:', error);
    const errorMsg = '❌ Error: ' + error.message;
    addMessageToCandidate(rec.resumeId, 'assistant', errorMsg);
    if (rec.resumeId === state.selectedCandidateId) {
      appendMsg(chatLog, 'assistant', errorMsg);
    }
    
    // Update button states even on error
    updateChatButtonStates(state);
  }
}





// Data loading and state restoration
async function loadStoredCandidates() {
  console.log('🔧 loadStoredCandidates()');
  try {
    const allRecords = await getAllResumes();
    
    if (allRecords && allRecords.length > 0) {
      //console.log('📱 Loading', allRecords.length, 'candidates from IndexedDB...');
      
      // Reconstruct the results array from stored data
      const results = allRecords.map(record => createCandidateFromRecord(record));
      //console.log('✅ Reconstructed', results.length, 'candidates');
      
      state.candidates = results;
      
      // Don't load chat history upfront - will load on-demand when candidates are selected
      // This avoids unnecessary loading and improves app startup performance
      
      // Make sure DOM is ready before rendering
      if (listEl && statusEl) {
        renderList(listEl, results, onSelectCandidate);
        setStatus(statusEl, `Loaded ${results.length} stored candidate(s).`);
        
        // Initialize chat
        chatLog.innerHTML = '';
        state.currentCandidate = null;
      } else {
        setTimeout(loadStoredCandidates, 100);
      }
    }
  } catch (error) {
    console.error('❌ Error loading stored candidates:', error);
  }
}

// Old checkAndSkipLanding function removed - replaced with cleaner logic

// ============================================================================
// INITIALIZATION
// ============================================================================

// Simple check if we should skip landing page
function checkIfShouldSkipLanding() {
  console.log('🔧 checkIfShouldSkipLanding()');
  
  try {
    const jdData = loadJDData();
    const hasJdHash = !!(jdData.jdHash);
    
    console.log('📱 Landing check:', { hasJdHash });
    
    return hasJdHash;
  } catch (error) {
    console.error('❌ Error checking landing state:', error);
    return false;
  }
}

// Setup main interface (candidates list, PDF viewer, chat)
function setupMainInterface() {
  console.log('🔧 setupMainInterface()');
  
  // Setup all event listeners
  setupEventListeners();
  
  // Setup chat event listeners
  setupChatEventListeners(state, chatLog, chatText, landingJdText);
  
  // Switch to main interface
  landingPage.style.display = 'none';
  mainInterface.style.display = 'flex';
  
  // Add click handler for job title display
  if (jobTitleDisplay) {
    jobTitleDisplay.addEventListener('click', handleJobTitleClick);
  }
  
  // Initialize chat button states
  updateChatButtonStates(state);
}

// Setup landing page interface
function setupLandingInterface() {
  console.log('🔧 setupLandingInterface()');
  
  // Setup all event listeners
  setupEventListeners();
  
  // Show landing page
  landingPage.style.display = 'block';
  mainInterface.style.display = 'none';
}

// Load existing data for main interface
async function loadExistingData() {
  console.log('🔧 loadExistingData()');
  
  try {
    // Get JD data from storage (we already know it exists)
    const jdData = loadJDData();
    
    // Restore state from storage
    state.jdHash = jdData.jdHash;
    state.jdTextSnapshot = jdData.jdTextSnapshot || '';
    state.jobTitle = jdData.jobTitle || '';
    
    // Restore job title display
    if (jdData.jdTextSnapshot) {
      const lines = jdData.jdTextSnapshot.split('\n');
      let jobTitle = '';
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line && line !== 'About the job' && (line.includes('Representative') || line.includes('Developer') || line.includes('Manager') || line.includes('Engineer') || line.includes('Specialist') || line.includes('Analyst') || line.includes('Consultant'))) {
          jobTitle = line;
          break;
        }
      }
      
      if (jobTitle) {
        state.jobTitle = jobTitle;
        const jobTitleDisplay = document.getElementById('jobTitleDisplay');
        if (jobTitleDisplay) {
          jobTitleDisplay.textContent = jobTitle;
        }
      } else {
        state.jobTitle = 'No job title available';
      }
    } else {
      state.jobTitle = 'No job title available';
    }
    
    // Load basic candidate list (names/IDs only, no heavy data)
    await loadStoredCandidates();
    
    // Update chat button states after loading data
    updateChatButtonStates(state);
    
  } catch (error) {
    console.error('❌ Error loading existing data:', error);
  }
}

function initializeApp() {
  console.log('🔧 initializeApp()');
  
  // 1. Simple check if we should skip landing
  const shouldSkipLanding = checkIfShouldSkipLanding();
  
  // 2. Setup the appropriate interface
  if (shouldSkipLanding) {
    setupMainInterface();
    loadExistingData();
  } else {
    setupLandingInterface();
  }
}

// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}




