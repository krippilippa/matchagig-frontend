// Chat functionality and event handling

import { askCandidate } from './api.js';
import { saveChatHistory, loadChatHistory } from './database.js';

// Flag to prevent multiple event listener setups
let chatEventListenersSetup = false;

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
      
      // Store user message in candidate's chat history
      if (state.currentCandidate && state.currentCandidate.resumeId) {
        addMessageToCandidate(state.currentCandidate.resumeId, 'user', text);
      }
      
      appendMsg(chatLog, 'user', text);
      callChat(state, chatLog, jdTextEl, text);
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
        
        // Store user message in candidate's chat history
        if (state.currentCandidate && state.currentCandidate.resumeId) {
          addMessageToCandidate(state.currentCandidate.resumeId, 'user', text);
        }
        
        appendMsg(chatLog, 'user', text);
        callChat(state, chatLog, jdTextEl, text);
      }
    });
  }
  
  // Mark as setup
  chatEventListenersSetup = true;
}

export function appendMsg(chatLog, role, content) {
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

export async function callChat(state, chatLog, jdTextEl, mode) {
  // Safety check - this should never happen since buttons are disabled, but let's be safe
  if (!state.currentCandidate || !state.currentCandidate.resumeId) {
    appendMsg(chatLog, 'assistant', 'Error: No candidate selected. Please select a candidate first.');
    return;
  }

  const candidateId = state.currentCandidate.resumeId;
  
  // Store the candidate ID that this call belongs to - this prevents race conditions
  const callCandidateId = candidateId;
  
  // Check if this candidate has been seeded for stateful chat
  if (state.seededCandidates && state.seededCandidates.has(candidateId)) {
    try {
      // For stateful chat, the mode parameter now contains the actual question text
      // from the button clicks, or freeform text from the user input
      let userMessage = mode;
      
      if (!userMessage) {
        appendMsg(chatLog, 'assistant', 'Error: No user message found for stateful chat');
        return;
      }
      
      // Use the new stateful chat API
      const { text: md } = await askCandidate(candidateId, userMessage);
      
      // Always save the response to the correct candidate's chat history
      addMessageToCandidate(callCandidateId, 'assistant', md);
      
      // Only display if we're still on the same candidate
      if (state.currentCandidate && state.currentCandidate.resumeId === callCandidateId) {
        appendMsg(chatLog, 'assistant', md);
      }
      return;
    } catch (error) {
      appendMsg(chatLog, 'assistant', 'Chat request failed. Please try again.');
      return;
    }
  }
  
  // If we reach here, something went wrong with stateful chat
  appendMsg(chatLog, 'assistant', 'Error: Chat system unavailable. Please try refreshing the page.');
}

export function resetChatEventListeners() {
  chatEventListenersSetup = false;
}

// Chat history management functions
export function addMessageToCandidate(candidateId, role, content) {
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



export function clearCandidateChatHistory(candidateId) {
  if (!candidateId) return;
  
  try {
    saveChatHistory(candidateId, []);
  } catch (error) {
    // Silently handle storage errors
  }
}

export function loadChatHistoryForCandidate(candidateId) {
  if (!candidateId) return [];
  
  try {
    const messages = loadChatHistory(candidateId);
    return messages;
  } catch (error) {
    return [];
  }
}

// Helper function to get the last user message from chat history
export function getLastUserMessage(messages) {
  if (!messages || messages.length === 0) return null;
  
  // Find the last user message (going backwards through the array)
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].content;
    }
  }
  
  return null;
}

// Update chat button states based on candidate seeding status
export function updateChatButtonStates(state) {
  const btnSend = document.getElementById('btnSend');
  const chatText = document.getElementById('chatText');
  
  if (!btnSend || !chatText) {
    return;
  }
  
  // Check if we have a current candidate and if it's seeded
  if (state.currentCandidate && state.currentCandidate.resumeId) {
    const candidateId = state.currentCandidate.resumeId;
    const isSeeded = state.seededCandidates && state.seededCandidates.has(candidateId);
    
    if (isSeeded) {
      // Enable chat for seeded candidates
      btnSend.disabled = false;
      chatText.disabled = false;
      chatText.placeholder = 'Ask something...';
    } else {
      // Disable chat for unseeded candidates
      btnSend.disabled = true;
      chatText.disabled = true;
      chatText.placeholder = 'Please select a candidate first to enable chat...';
    }
  } else {
    // No candidate selected
    btnSend.disabled = true;
    chatText.disabled = true;
    chatText.placeholder = 'Please select a candidate first...';
  }
}
