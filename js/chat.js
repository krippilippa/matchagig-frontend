// Chat functionality and event handling

import { askCandidate } from './api.js';
import { saveChatHistory, loadChatHistory } from './database.js';

// Simple state tracking
let currentDisplayedCandidate = null;
let currentChatLog = null;

export function setupChatEventListeners(state, chatLog, chatText, jdTextEl) {
  // Always set up event listeners when called
  // This ensures quick question buttons work after candidate selection
  
  const btnSend = document.getElementById('btnSend');
  
  // Clean up old event listeners first to prevent duplicates
  cleanupOldEventListeners();
  
  // Centralized function to handle message sending
  function handleSendMessage() {
    const text = chatText.value.trim();
    if (!text) return;
    
    chatText.value = '';
    
    // Send message and let the system handle everything
    if (state.currentCandidate && state.currentCandidate.resumeId) {
      sendMessage(state.currentCandidate.resumeId, text);
    }
  }
  
  if (btnSend) {
    btnSend.addEventListener('click', handleSendMessage);
  }
  
  // Add Enter key handler for chat input
  if (chatText) {
    chatText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });
  }
  
  // Setup quick question buttons
  setupQuickQuestionButtons(chatText);
}

// Clean up old event listeners to prevent duplicates
function cleanupOldEventListeners() {
  const quickQuestionButtons = document.querySelectorAll('.quick-question');
  
  quickQuestionButtons.forEach(button => {
    // Clone the button to remove all event listeners
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
  });
}

function setupQuickQuestionButtons(chatText) {
  const quickQuestionButtons = document.querySelectorAll('.quick-question');
  
  quickQuestionButtons.forEach((button, index) => {
    
    button.addEventListener('click', function() {
      
      const fullQuestion = this.getAttribute('data-question');
      
      // Put the question in the input like user typed it
      chatText.value = fullQuestion;
      
      // Trigger the existing send logic
      const btnSend = document.getElementById('btnSend');
      if (btnSend && !btnSend.disabled) {
        btnSend.click();
      }
    });
    
  });
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

// ============================================================================
// ACTION LAYER - Functions that change state
// ============================================================================

export function sendMessage(candidateId, message) {
  
  // Store user message
  addMessageToCandidate(candidateId, 'user', message);
  
  // Add to transit tracking and update button states
  if (window.currentChatState) {
    window.currentChatState.candidatesInTransit.add(candidateId);
    updateButtonStates(window.currentChatState);
  }
  
  // NEW: Immediately refresh UI to show user message + loading (only if this candidate is currently displayed)
  if (currentDisplayedCandidate === candidateId && currentChatLog) {
    refreshChatDisplay(candidateId, currentChatLog);
  }
  
  // Send to API
  askCandidate(candidateId, message)
    .then(response => {
      
      // Store AI response
      addMessageToCandidate(candidateId, 'assistant', response.text);
      
      // Remove from transit tracking and update button states
      if (window.currentChatState) {
        window.currentChatState.candidatesInTransit.delete(candidateId);
        updateButtonStates(window.currentChatState);
      }
      
      // Notify UI to refresh
      notifyMessageReceived(candidateId);
      
      // Button state management is now handled by the unified system
      // No need to manually re-enable buttons here
    })
    .catch(error => {
      console.error(`Failed to get response for ${candidateId}:`, error);
      
      // Remove from transit tracking on error and update button states
      if (window.currentChatState) {
        window.currentChatState.candidatesInTransit.delete(candidateId);
        updateButtonStates(window.currentChatState);
      }
      
      // Button state management is now handled by the unified system
      // No need to manually re-enable buttons here
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
  
  // Display all messages
  messages.forEach(msg => {
    appendMsg(chatLogElement, msg.role, msg.content);
  });
  
  // Show transit indicator if needed
  // No more transit state, so this function is effectively removed
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
    
    // Button state management is now handled by the unified system
    // No need to manually re-enable buttons here
  }
}

export function setCurrentChatContext(candidateId, chatLogElement, state) {
  
  currentDisplayedCandidate = candidateId;
  currentChatLog = chatLogElement;
  
  // NEW: Store state globally so chat functions can access it for button state management
  if (state) {
    window.currentChatState = state;
  }
}

// ============================================================================
// UNIFIED BUTTON STATE MANAGEMENT
// ============================================================================

// Helper functions to enable/disable all chat functionality at once
function enableChatFunctionality() {
  const btnSend = document.getElementById('btnSend');
  const chatText = document.getElementById('chatText');
  const quickQuestionButtons = document.querySelectorAll('.quick-question');
  
  if (btnSend) btnSend.disabled = false;
  if (chatText) chatText.disabled = false;
  quickQuestionButtons.forEach(btn => btn.disabled = false);
}

function disableChatFunctionality() {
  const btnSend = document.getElementById('btnSend');
  const chatText = document.getElementById('chatText');
  const quickQuestionButtons = document.querySelectorAll('.quick-question');
  
  if (btnSend) btnSend.disabled = true;
  if (chatText) chatText.disabled = true;
  quickQuestionButtons.forEach(btn => btn.disabled = true);
}

// Unified button state management function
// Considers: candidate readiness + current selection + transit state
export function updateButtonStates(state) {
  // Check if we have a current candidate
  if (!state.currentCandidate || !state.currentCandidate.resumeId) {
    // No candidate selected - disable everything
    disableChatFunctionality();
    return;
  }
  
  const candidateId = state.currentCandidate.resumeId;
  const isSeeded = state.seededCandidates && state.seededCandidates.has(candidateId);
  const hasMessageInTransit = state.candidatesInTransit && state.candidatesInTransit.has(candidateId);
  
  if (isSeeded && !hasMessageInTransit) {
    // Ready and no message in transit - enable everything
    enableChatFunctionality();
  } else if (isSeeded && hasMessageInTransit) {
    // Ready but message in transit - disable everything
    disableChatFunctionality();
  } else {
    // Not ready - disable everything
    disableChatFunctionality();
  }
}
