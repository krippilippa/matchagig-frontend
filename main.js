// Pick PDFs → zip in browser → POST /v1/bulk-zip → show ranked list.
// Store PDFs + canonicalText in IndexedDB keyed by resumeId.

import { 
  putResume, 
  getResume, 
  getAllResumes, 
  clearAllResumes,
  saveJDData,
  loadJDData,
  clearAllStorage,
  markCandidateAsSeeded,
  isCandidateSeeded,
  clearAllSeedingStatus,
  clearCandidateSeedingStatus,
  updateExtractionStatus
} from './js/database.js';
import { CONFIG } from './js/config.js';

import { 
  bulkZipUpload, 
  seedCandidateThread,
  extractResumeData
} from './js/api.js';

import { 
  setupChatEventListeners, 
  appendMsg, 
  resetChatEventListeners,
  addMessageToCandidate,
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
  clearUI,
  updateProgressDot,
  formatExtractedData
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
const viewToggleButtons = $('viewToggleButtons');
const pdfViewBtn = $('pdfViewBtn');
const dataViewBtn = $('dataViewBtn');
const extractedDataDisplay = $('extractedDataDisplay');
const extractedDataContent = $('extractedDataContent');

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
  // Landing page events
  uploadArea.addEventListener('click', handleUploadClick);
  uploadArea.addEventListener('dragOver', handleDragOver);
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
  pdfViewBtn.addEventListener('click', handlePdfViewClick);
  dataViewBtn.addEventListener('click', handleDataViewClick);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Landing page event handlers
function handleUploadClick() {
  landingPdfInput.click();
}

function handleDragOver(e) {
  e.preventDefault();
  uploadArea.style.borderColor = '#666';
}

function handleDragLeave(e) {
  e.preventDefault();
  uploadArea.style.borderColor = '#ccc';
}

function handleFileDrop(e) {
  e.preventDefault();
  uploadArea.style.borderColor = '#ccc';
  
  const files = Array.from(e.dataTransfer.files).filter(f => /\.pdf$/i.test(f.name));
  if (files.length > 0) {
    landingPdfInput.files = e.dataTransfer.files;
    updateUploadStatus(files.length);
  }
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files || []).filter(f => /\.pdf$/i.test(f.name));
  updateUploadStatus(files.length);
}

async function handleRunMatch() {
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
    
    // Setup chat event listeners AFTER candidates are processed
    setupChatEventListeners(state, chatLog, chatText, landingJdText);
    
    // Initialize chat button states AFTER everything is set up
    updateChatButtonStates(state);
    
  } catch (error) {
    setStatus(statusEl, 'Error during matching: ' + error.message);
  } finally {
    runMatchBtn.disabled = false;
    runMatchBtn.textContent = 'Run Match';
  }
}

async function handleBackToDemo() {
  try {
    // Clear all storage using consolidated function
    await clearAllStorage();
    
    // Clear seeding status for all candidates
    await clearAllSeedingStatus();
    
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
    
  } catch (error) {
    alert('Error resetting demo: ' + error.message);
  }
}

// Main interface event handlers
function handlePdfInputChange(e) {
  selectedFiles = Array.from(e.target.files || []).filter(f => /\.pdf$/i.test(f.name));
  setStatus(statusEl, `${selectedFiles.length} PDF(s) ready`);
}

function handleJdHashInput() {
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
  if (state.jdTextSnapshot && state.jdTextSnapshot.trim()) {
    // Hide toggle buttons when viewing JD
    viewToggleButtons.style.display = 'none';
    
    // Show JD text view
    jdTextDisplay.style.display = 'block';
    pdfFrame.style.display = 'none';
    extractedDataDisplay.style.display = 'none';
    viewerTitle.textContent = 'Job Description';
    updateJdBtn.style.display = 'block';
    
    // Populate the JD text content
    jdTextContent.value = state.jdTextSnapshot;
  } else {
    alert('No job description text available to display.');
  }
}

function handleJdTextChange() {
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
  if (!updateJdBtn.disabled) {
    alert('Coming in next version!');
  }
}

function handlePdfViewClick() {
  // Hide extracted data and JD text, show PDF
  extractedDataDisplay.style.display = 'none';
  jdTextDisplay.style.display = 'none';
  pdfFrame.style.display = 'block';
}

function handleDataViewClick() {
  // Hide PDF and JD text, show extracted data
  pdfFrame.style.display = 'none';
  jdTextDisplay.style.display = 'none';
  extractedDataDisplay.style.display = 'block';
}

// ============================================================================
// BUSINESS LOGIC FUNCTIONS
// ============================================================================

// Helper function to check if a candidate is fully ready (extracted + seeded)
async function isCandidateFullyReady(resumeId) {
  try {
    const record = await getResume(resumeId);
    if (!record) return false;
    
    const isSeeded = await isCandidateSeeded(resumeId);
    const isExtracted = record.extractionStatus === 'extracted';
    
    return isSeeded && isExtracted;
  } catch (error) {
    console.error('Error checking candidate readiness:', error);
    return false;
  }
}

// Upload status management
function updateUploadStatus(fileCount) {
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
        // Silently handle storage errors
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
        extractionStatus: 'pending', // Store at top level
        extractedData: null,         // Store at top level
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
    
    // Get extraction statuses for all candidates before rendering
    const extractionStatuses = {};
    for (const candidate of state.candidates) {
      const existingRecord = await getResume(candidate.resumeId);
      extractionStatuses[candidate.resumeId] = existingRecord?.extractionStatus || 'pending';
    }
    
    // Render list with correct dot colors from the start
    renderList(listEl, state.candidates, onSelectCandidate, extractionStatuses);
    
    // Update status with JD hash info if available
    if (state.jdHash) {
      setStatus(statusEl, `✅ ${state.candidates.length} candidates processed. JD hash: ${state.jdHash}`);
    } else {
      setStatus(statusEl, `✅ ${state.candidates.length} candidates processed.`);
    }
    
    // NEW: Start sequential extraction for all resumes
    await processSequentialExtractions();
    
  } catch (e) {
    setStatus(statusEl, e.message || 'Failed.');
    throw e;
  }
}

// NEW: Sequential extraction processing
async function processSequentialExtractions() {
  try {
    console.log('🔄 Starting sequential extraction process...');
    
    // Use state.candidates which are already sorted by cosine score from backend
    const candidatesToProcess = state.candidates;
    console.log(`📊 Found ${candidatesToProcess.length} candidates to process`);
    
    if (candidatesToProcess.length === 0) {
      console.log('❌ No candidates found, skipping extraction');
      return;
    }
    
    // Process each candidate sequentially, one by one
    for (let i = 0; i < candidatesToProcess.length; i++) {
      const candidate = candidatesToProcess[i];
      console.log(`🔍 Processing candidate ${i + 1}/${candidatesToProcess.length}: ${candidate.resumeId} (${candidate.filename || 'unknown'})`);
      
      try {
        // Check if this resume already has extracted data
        const existingRecord = await getResume(candidate.resumeId);
        if (existingRecord && existingRecord.extractionStatus === 'extracted') {
          console.log(`⏭️ Skipping ${candidate.resumeId} - already extracted`);
                  // Update dot to show already completed
        updateProgressDot(candidate.resumeId, 'processed');
          continue;
        }
        
        // Update dot to show processing
        updateProgressDot(candidate.resumeId, 'processing');
        
        // Do BOTH extraction AND seeding in parallel
        const [extractedData, seedResult] = await Promise.all([
          extractResumeData(candidate.canonicalText),
          seedCandidateThread(candidate.resumeId, state.jdHash, candidate.canonicalText)
        ]);
        
        // Update the record with extracted data using the new function
        await updateExtractionStatus(candidate.resumeId, 'extracted', extractedData);
        
        // Mark as seeded in storage
        await markCandidateAsSeeded(candidate.resumeId);
        
        // Update dot to show completed (both operations done)
        updateProgressDot(candidate.resumeId, 'processed');
        
      } catch (error) {
        console.error(`❌ Processing failed for ${candidate.resumeId}:`, error);
        
        // Mark extraction as failed
        await updateExtractionStatus(candidate.resumeId, 'failed');
        
        // Clear seeding status if it was set
        try {
          await clearCandidateSeedingStatus(candidate.resumeId);
        } catch (seedError) {
          console.error('Failed to clear seeding status:', seedError);
        }
        
        // Update dot to show failed
        updateProgressDot(candidate.resumeId, 'failed');
      }
    }
    
    console.log('🎉 Sequential extraction process completed');
    
  } catch (error) {
    console.error('💥 Error in sequential extraction process:', error);
  }
}

// Candidate selection and management
async function onSelectCandidate(e) {
  const rid = e.currentTarget.dataset.resumeId;
  console.log(`👤 Candidate selected: ${rid}`);
  
  // GET THE DOT'S CURRENT STATE FROM THE DOM
  const dot = document.querySelector(`.progress-dot[data-resume-id="${rid}"]`);
  let dotStatus = 'pending'; // default
  
  if (dot) {
    if (dot.classList.contains('processing')) {
      dotStatus = 'processing';
    } else if (dot.classList.contains('processed')) {
      dotStatus = 'processed';
    } else if (dot.classList.contains('failed')) {
      dotStatus = 'failed';
    } else {
      dotStatus = 'pending'; // just has .progress-dot class
    }
  }
  
  console.log(`Dot status for ${rid}: ${dotStatus}`);
  
  // Find the candidate in our reconstructed state
  const candidate = state.candidates.find(c => c.resumeId === rid);
  if (!candidate) { 
    console.error(`❌ Candidate not found in state: ${rid}`);
    setStatus(statusEl, 'Candidate not found in state.'); 
    return; 
  }

  // Get the full record from IndexedDB for additional data
  const rec = await getResume(rid);
  if (!rec) { 
    console.error(`❌ Resume not found in IndexedDB: ${rid}`);
    setStatus(statusEl, 'Not found in IndexedDB.'); 
    return; 
  }
  
  // Set current candidate for chat
  state.currentCandidate = rec;
  state.selectedCandidateId = rid;

  // Clear chat display immediately for clean slate
  chatLog.innerHTML = '';

  // ALWAYS set up the UI first (PDF viewer, toggle buttons, etc.)
  // Update the PDF viewer
  if (candidate.objectUrl) {    
    pdfFrame.src = candidate.objectUrl;
  } else {
    pdfFrame.src = '';
  }

  viewerTitle.textContent = candidate.email || candidate.filename || candidate.resumeId;
  
  // Show toggle buttons for candidate view
  viewToggleButtons.style.display = 'flex';
  
  // Check if extracted data exists and show appropriate view
  if (rec.extractedData) {
    // Show extracted data by default, hide PDF
    extractedDataDisplay.style.display = 'block';
    pdfFrame.style.display = 'none';
    jdTextDisplay.style.display = 'none';
    
    // Display the extracted data in a nice format
    extractedDataContent.innerHTML = formatExtractedData(rec.extractedData);
  } else {
    // No extracted data, show PDF by default
    pdfFrame.style.display = 'block';
    extractedDataDisplay.style.display = 'none';
    jdTextDisplay.style.display = 'none';
  }
  
  // Hide JD text display when candidate is selected
  jdTextDisplay.style.display = 'none';
  updateJdBtn.style.display = 'none';

  // Always load fresh chat history for the selected candidate
  let candidateChatHistory = loadChatHistoryForCandidate(rid);
  state.chatHistory[rid] = candidateChatHistory;  // Update cache with fresh data

  // NOW check processing status and update UI accordingly
  // Use the dot's current state from the DOM
  const displayStatus = dotStatus;

  if (displayStatus === 'pending' || displayStatus === 'processing') {
    // Show appropriate message based on display status
    if (displayStatus === 'processing') {
      appendMsg(chatLog, 'assistant', 'This candidate is currently being processed. Please wait...');
    } else {
      appendMsg(chatLog, 'assistant', 'This candidate is waiting to be processed. Please wait...');
    }
    
    // Disable chat
    const btnSend = document.getElementById('btnSend');
    const chatText = document.getElementById('chatText');
    if (btnSend) btnSend.disabled = true;
    if (chatText) chatText.disabled = true;
    
    // Disable data view button and show appropriate text
    const dataViewBtn = document.getElementById('dataViewBtn');
    if (dataViewBtn) {
      dataViewBtn.disabled = true;
      if (displayStatus === 'processing') {
        dataViewBtn.innerHTML = '<span class="spinner">⏳</span> Processing...';
      } else {
        dataViewBtn.innerHTML = '<span class="spinner">⏳</span> Waiting...';
      }
      dataViewBtn.style.opacity = '0.5';
    }
    
    // Enable PDF view button (can still view PDF)
    const pdfViewBtn = document.getElementById('pdfViewBtn');
    if (pdfViewBtn) {
      pdfViewBtn.disabled = false;
      pdfViewBtn.style.opacity = '1';
    }
    
    // Don't proceed with chat setup, but UI is already set up
    return;
  }

  // If we get here, candidate is ready - enable everything
  const dataViewBtn = document.getElementById('dataViewBtn');
  if (dataViewBtn) {
    dataViewBtn.disabled = false;
    dataViewBtn.innerHTML = 'Data View';
    dataViewBtn.style.opacity = '1';
  }

  const pdfViewBtn = document.getElementById('pdfViewBtn');
  if (pdfViewBtn) {
    pdfViewBtn.disabled = false;
    pdfViewBtn.style.opacity = '1';
  }

  // Immediately disable chat while loading new candidate
  updateChatButtonStates(state);
  
  // Check if candidate is actually seeded and extracted
  const isActuallySeeded = await isCandidateSeeded(rid);
  const isActuallyExtracted = rec.extractionStatus === 'extracted';

  if (isActuallySeeded && isActuallyExtracted) {
  // Add to in-memory set for consistency
  state.seededCandidates.add(rid);
  
  // Check if "Context loaded" message already exists in chat history
  const hasContextMessage = candidateChatHistory.some(msg => 
    msg.role === 'assistant' && msg.content === 'Context loaded. Ask me anything.'
  );
  
  // Only add context message if it doesn't already exist
  if (!hasContextMessage) {
    appendMsg(chatLog, 'assistant', 'Context loaded. Ask me anything.');
    addMessageToCandidate(rid, 'assistant', 'Context loaded. Ask me anything.');
  }
  
  // THEN restore chat history if it exists
  if (candidateChatHistory.length > 0) {
    candidateChatHistory.forEach(msg => {
      appendMsg(chatLog, msg.role, msg.content);
    });
  }
} else {
  // Something went wrong during processing
  appendMsg(chatLog, 'assistant', 'This candidate is not ready for chat yet. Processing may have failed or is still in progress.');
  
  // Disable chat for this candidate
  updateChatButtonStates(state);
  return; // Don't proceed with chat setup
}

// Update button states AFTER ensuring seededCandidates is updated
updateChatButtonStates(state);
}







// Data loading and state restoration
async function loadStoredCandidates() {
  try {
    const allRecords = await getAllResumes();
    
    if (allRecords && allRecords.length > 0) {
      // Reconstruct the results array from stored data
      const results = allRecords.map(record => createCandidateFromRecord(record));
      
      state.candidates = results;
      
      // Don't load chat history upfront - will load on-demand when candidates are selected
      // This avoids unnecessary loading and improves app startup performance
      
      // Make sure DOM is ready before rendering
      if (listEl && statusEl) {
        // Get extraction statuses for all candidates before rendering
        const extractionStatuses = {};
        for (const record of allRecords) {
          extractionStatuses[record.resumeId] = record.extractionStatus || 'pending';
        }
        
        // Render list with correct dot colors from the start
        renderList(listEl, results, onSelectCandidate, extractionStatuses);
        setStatus(statusEl, `Loaded ${results.length} stored candidate(s).`);
        
        // Initialize chat
        chatLog.innerHTML = '';
        state.currentCandidate = null;
      } else {
        setTimeout(loadStoredCandidates, 100);
      }
    }
  } catch (error) {
    // Silently handle loading errors
  }
}

// Old checkAndSkipLanding function removed - replaced with cleaner logic

// ============================================================================
// INITIALIZATION
// ============================================================================

// Simple check if we should skip landing page
function checkIfShouldSkipLanding() {
  try {
    const jdData = loadJDData();
    const hasJdHash = !!(jdData.jdHash);
    
    return hasJdHash;
  } catch (error) {
    return false;
  }
}

// Setup main interface (candidates list, PDF viewer, chat)
function setupMainInterface() {
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
  // Setup all event listeners
  setupEventListeners();
  
  // Show landing page
  landingPage.style.display = 'block';
  mainInterface.style.display = 'none';
}

// Load existing data for main interface
async function loadExistingData() {
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
    
    // Check if any resumes are still pending and resume extraction
    const allRecords = await getAllResumes();
    const hasPendingResumes = allRecords.some(record => record.extractionStatus === 'pending');
    if (hasPendingResumes) {
      console.log('🔄 Found pending resumes, resuming extraction process...');
      // Resume extraction process
      await processSequentialExtractions();
    }
    
    // Update chat button states after loading data
    updateChatButtonStates(state);
    
  } catch (error) {
    // Silently handle loading errors
  }
}

function initializeApp() {
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




