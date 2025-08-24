// Chat functionality and event handling

import { askCandidate } from './api.js';
import { saveChatHistory, loadChatHistory } from './database.js';

// Flag to prevent multiple event listener setups
let chatEventListenersSetup = false;

// Simple state tracking
const pendingMessages = new Map(); // candidateId -> { message, timestamp }
let currentDisplayedCandidate = null;
let currentChatLog = null;

export function setupChatEventListeners(state, chatLog, chatText, jdTextEl) {
  // Prevent multiple setups
  if (chatEventListenersSetup) {
    return;
  }
  
  const btnSend = document.getElementById('btnSend');
  
  if (btnSend) {
    btnSend.addEventListener('click', () => {
      const text = chatText.value.trim();
      if (!text) return;
      chatText.value = '';
      
      // Send message and let the system handle everything
      if (state.currentCandidate && state.currentCandidate.resumeId) {
        sendMessage(state.currentCandidate.resumeId, text);
      }
    });
  }
  
  // Add Enter key handler for chat input
  if (chatText) {
    chatText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = chatText.value.trim();
        if (!text) return;
        chatText.value = '';
        
        // Send message and let the system handle everything
        if (state.currentCandidate && state.currentCandidate.resumeId) {
          sendMessage(state.currentCandidate.resumeId, text);
        }
      }
    });
  }
  
  // Mark as setup
  chatEventListenersSetup = true;
}

function appendMsg(chatLog, role, content) {
  if (!chatLog) {
    return;
  }
  
  const wrap = document.createElement('div');
  wrap.className = role;
  
  // Render Markdown for assistant messages
  if (role === 'assistant') {
    wrap.classList.add('markdown');
    // Use marked.js to parse Markdown
    if (window.marked) {
      wrap.innerHTML = window.marked.parse(content);
    } else {
      wrap.textContent = content;
    }
  } else {
    wrap.textContent = content;
  }
  
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
}



function resetChatEventListeners() {
  chatEventListenersSetup = false;
}

// Chat history management functions (internal - used by new API functions)
function addMessageToCandidate(candidateId, role, content) {
  if (!candidateId) {
    return;
  }
  
  // Get or create chat history for this candidate
  let messages = loadChatHistory(candidateId);
  if (!messages) {
    messages = [];
  }
  
  // Add the new message
  messages.push({ role, content });
  
  // Save to storage
  try {
    saveChatHistory(candidateId, messages);
  } catch (error) {
    // Silently handle storage errors
  }
  
  return messages;
}



function clearCandidateChatHistory(candidateId) {
  if (!candidateId) return;
  
  try {
    saveChatHistory(candidateId, []);
  } catch (error) {
    // Silently handle storage errors
  }
}



// Helper function to get the last user message from chat history
function getLastUserMessage(messages) {
  if (!messages || messages.length === 0) return null;
  
  // Find the last user message (going backwards through the array)
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].content;
    }
  }
  
  return null;
}





// ============================================================================
// DATA LAYER - Pure functions that return data
// ============================================================================

function getChatHistory(candidateId) {
  return loadChatHistory(candidateId);
}

function isInTransit(candidateId) {
  return pendingMessages.has(candidateId);
}

// ============================================================================
// ACTION LAYER - Functions that change state
// ============================================================================

export function sendMessage(candidateId, message) {
  // Store user message
  addMessageToCandidate(candidateId, 'user', message);
  
  // Set transit state
  pendingMessages.set(candidateId, { message, timestamp: Date.now() });
  
  // NEW: Immediately refresh UI to show user message + loading (only if this candidate is currently displayed)
  if (currentDisplayedCandidate === candidateId && currentChatLog) {
    console.log(`🔄 Immediate UI refresh for ${candidateId} - showing user message + loading`);
    refreshChatDisplay(candidateId, currentChatLog);
  } else {
    console.log(`⏸️ No immediate UI refresh for ${candidateId} - not currently displayed (current: ${currentDisplayedCandidate})`);
  }
  
  // Send to API
  askCandidate(candidateId, message)
    .then(response => {
      console.log(`✅ AI response received for ${candidateId} - clearing transit state`);
      
      // Store AI response
      addMessageToCandidate(candidateId, 'assistant', response.text);
      
      // Clear transit state
      pendingMessages.delete(candidateId);
      
      // Notify UI to refresh
      notifyMessageReceived(candidateId);
    })
    .catch(error => {
      console.error(`Failed to get response for ${candidateId}:`, error);
      pendingMessages.delete(candidateId);
    });
}

// ============================================================================
// UI LAYER - Functions that update the display
// ============================================================================

export function refreshChatDisplay(candidateId, chatLogElement) {
  // Clear current display
  chatLogElement.innerHTML = '';
  
  // Get fresh data
  const messages = getChatHistory(candidateId);
  const inTransit = isInTransit(candidateId);
  
  // Display all messages
  messages.forEach(msg => {
    appendMsg(chatLogElement, msg.role, msg.content);
  });
  
  // Show transit indicator if needed
  if (inTransit) {
    showTransitIndicator(chatLogElement, candidateId);
  }
}

function displayStatusMessage(chatLogElement, message) {
  appendMsg(chatLogElement, 'assistant', message);
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

function notifyMessageReceived(candidateId) {
  // If this candidate is currently displayed, refresh the UI
  if (currentDisplayedCandidate === candidateId && currentChatLog) {
    refreshChatDisplay(candidateId, currentChatLog);
  }
}

export function setCurrentChatContext(candidateId, chatLogElement) {
  currentDisplayedCandidate = candidateId;
  currentChatLog = chatLogElement;
}

function showTransitIndicator(chatLogElement, candidateId) {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'assistant loading';
  loadingDiv.innerHTML = '<span class="spinner">⏳</span> Waiting for response...';
  loadingDiv.dataset.candidateId = candidateId;
  chatLogElement.appendChild(loadingDiv);
}



// Update chat button states based on candidate seeding status
export function updateChatButtonStates(state) {
  const btnSend = document.getElementById('btnSend');
  const chatText = document.getElementById('chatText');
  
  if (!btnSend || !chatText) {
    return;
  }
  
  console.log(`🔍 updateChatButtonStates called:`);
  console.log(`  - state.currentCandidate:`, state.currentCandidate);
  console.log(`  - state.seededCandidates:`, state.seededCandidates);
  
  // Check if we have a current candidate and if it's seeded
  if (state.currentCandidate && state.currentCandidate.resumeId) {
    const candidateId = state.currentCandidate.resumeId;
    const isSeeded = state.seededCandidates && state.seededCandidates.has(candidateId);
    
    console.log(`  - candidateId: ${candidateId}`);
    console.log(`  - isSeeded: ${isSeeded}`);
    
    if (isSeeded) {
      // Enable chat for seeded candidates
      btnSend.disabled = false;
      chatText.disabled = false;
      chatText.placeholder = 'Ask something...';
      console.log(`✅ Chat enabled for ${candidateId}`);
    } else {
      // Disable chat for unseeded candidates
      btnSend.disabled = true;
      chatText.disabled = true;
      chatText.placeholder = 'Please select a candidate first to enable chat...';
      console.log(`❌ Chat disabled for ${candidateId} - not seeded`);
    }
  } else {
    // No candidate selected
    btnSend.disabled = true;
    chatText.disabled = true;
    chatText.placeholder = 'Please select a candidate first...';
    console.log(`❌ Chat disabled - no current candidate`);
  }
}
