// Chat functionality and event handling

import { askCandidate } from './api.js';
import { saveChatHistory, loadChatHistory } from './database.js';

// Flag to prevent multiple event listener setups
let chatEventListenersSetup = false;

export function setupChatEventListeners(state, chatLog, chatText, jdTextEl) {
  console.log('🔧 setupChatEventListeners()');
  // Prevent multiple setups
  if (chatEventListenersSetup) {
    console.log('Chat event listeners already setup, skipping...');
    return;
  }
  
  const btnSend = document.getElementById('btnSend');
  
  if (btnSend) {
    console.log('🔧 Setting up Send button click listener');
    btnSend.addEventListener('click', () => {
      console.log('🔧 Send button clicked!');
      console.log('🔍 Current state when Send clicked:', {
        currentCandidate: state.currentCandidate,
        seededCandidates: Array.from(state.seededCandidates || [])
      });
      
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
  console.log('🔧 appendMsg()', role);
  if (!chatLog) {
    console.error('Chat log element not found');
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
  console.log('🔧 callChat()', mode);

  // Safety check - this should never happen since buttons are disabled, but let's be safe
  if (!state.currentCandidate || !state.currentCandidate.resumeId) {
    console.error('❌ No current candidate when callChat was called');
    appendMsg(chatLog, 'assistant', 'Error: No candidate selected. Please select a candidate first.');
    return;
  }

  const candidateId = state.currentCandidate.resumeId;
  
  // Store the candidate ID that this call belongs to - this prevents race conditions
  const callCandidateId = candidateId;
  console.log('🔒 Chat call locked to candidate:', callCandidateId);
  
  // Check if this candidate has been seeded for stateful chat
  if (state.seededCandidates && state.seededCandidates.has(candidateId)) {
    try {
      console.log('🔄 Using stateful chat for candidate:', candidateId);
      console.log('🔄 Seeded candidates set:', Array.from(state.seededCandidates));
      
      // For stateful chat, the mode parameter now contains the actual question text
      // from the button clicks, or freeform text from the user input
      let userMessage = mode;
      
      console.log('🔄 User message for stateful chat:', userMessage);
      
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
      console.error('❌ Stateful chat failed, falling back to legacy:', error);
      // Fall back to legacy method
    }
  }
  
  // If we reach here, something went wrong with stateful chat
  console.error('❌ Stateful chat failed and no fallback available');
  appendMsg(chatLog, 'assistant', 'Error: Chat system unavailable. Please try refreshing the page.');
}

export function resetChatEventListeners() {
  console.log('🔧 resetChatEventListeners()');
  chatEventListenersSetup = false;
}

// Chat history management functions
export function addMessageToCandidate(candidateId, role, content) {
  console.log('🔧 addMessageToCandidate()', candidateId, role);
  if (!candidateId) {
    console.error('No candidate ID provided for message');
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
    console.error('Failed to save chat history:', error);
  }
  
  return messages;
}



export function clearCandidateChatHistory(candidateId) {
  console.log('🔧 clearCandidateChatHistory()', candidateId);
  if (!candidateId) return;
  
  try {
    saveChatHistory(candidateId, []);
    console.log('Chat history cleared for candidate:', candidateId);
  } catch (error) {
    console.error('Failed to clear chat history:', error);
  }
}

export function loadChatHistoryForCandidate(candidateId) {
  console.log('🔧 loadChatHistoryForCandidate()', candidateId);
  if (!candidateId) return [];
  
  try {
    const messages = loadChatHistory(candidateId);
    console.log('Loaded chat history for candidate:', candidateId, 'Messages:', messages.length);
    return messages;
  } catch (error) {
    console.error('Failed to load chat history for candidate:', candidateId, error);
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
  console.log('🔧 updateChatButtonStates()');
  
  const btnSend = document.getElementById('btnSend');
  const chatText = document.getElementById('chatText');
  
  if (!btnSend || !chatText) {
    console.warn('⚠️ Chat elements not found for button state update');
    return;
  }
  
  console.log('🔍 Button state debug:', {
    btnSend: btnSend,
    chatText: chatText,
    currentCandidate: state.currentCandidate,
    seededCandidates: Array.from(state.seededCandidates || [])
  });
  
  // Check if we have a current candidate and if it's seeded
  if (state.currentCandidate && state.currentCandidate.resumeId) {
    const candidateId = state.currentCandidate.resumeId;
    const isSeeded = state.seededCandidates && state.seededCandidates.has(candidateId);
    
    console.log('🔍 Candidate state:', { candidateId, isSeeded });
    
    if (isSeeded) {
      // Enable chat for seeded candidates
      btnSend.disabled = false;
      chatText.disabled = false;
      chatText.placeholder = 'Ask something...';
      
      console.log('✅ Chat enabled for seeded candidate:', candidateId);
    } else {
      // Disable chat for unseeded candidates
      btnSend.disabled = true;
      chatText.disabled = true;
      chatText.placeholder = 'Please select a candidate first to enable chat...';
      
      console.log('🚫 Chat disabled for unseeded candidate:', candidateId);
    }
  } else {
    // No candidate selected
    btnSend.disabled = true;
    chatText.disabled = true;
    chatText.placeholder = 'Please select a candidate first...';
    
    console.log('🚫 Chat disabled - no candidate selected');
  }
}
