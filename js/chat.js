// Chat functionality and event handling

import { chatWithCandidate, askCandidate } from './api.js';
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
  
  const btnExplain = document.getElementById('btnExplain');
  const btnSend = document.getElementById('btnSend');
  const modeButtons = document.querySelectorAll('#chatActions [data-mode]');
  
  if (btnExplain) {
    btnExplain.addEventListener('click', () => {
      const message = 'Give me a succinct 30-second assessment of fit.';
      
      // Store user message in candidate's chat history
      if (state.currentCandidate && state.currentCandidate.resumeId) {
        addMessageToCandidate(state.currentCandidate.resumeId, 'user', message);
      }
      
      appendMsg(chatLog, 'user', message);
      callChat(state, chatLog, jdTextEl); // no mode = general
    });
  }
  
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      const message = `[${mode}]`;
      
      // Store user message in candidate's chat history
      if (state.currentCandidate && state.currentCandidate.resumeId) {
        addMessageToCandidate(state.currentCandidate.resumeId, 'user', message);
      }
      
      appendMsg(chatLog, 'user', message);
      callChat(state, chatLog, jdTextEl, mode);
    });
  });
  
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
      callChat(state, chatLog, jdTextEl, text); // Pass text as mode for freeform
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
        callChat(state, chatLog, jdTextEl, text); // Pass text as mode for freeform
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
  
  if (!state.currentCandidate) {
    appendMsg(chatLog, 'assistant', 'Please select a candidate first');
    return;
  }

  const candidateId = state.currentCandidate.resumeId;
  
  // Check if this candidate has been seeded for stateful chat
  if (state.seededCandidates && state.seededCandidates.has(candidateId)) {
    try {
      console.log('🔄 Using stateful chat for candidate:', candidateId);
      console.log('🔄 Seeded candidates set:', Array.from(state.seededCandidates));
      
      // For stateful chat, we need to get the user message from the current input
      // This will be passed as the mode parameter for freeform text, or we can get it from the last message
      let userMessage;
      
      if (mode && mode !== 'interview_questions' && mode !== 'email_candidate' && mode !== 'email_hiring_manager') {
        // This is freeform text from the user
        userMessage = mode;
      } else {
        // For predefined modes, we need to get the last user message from chat history
        userMessage = getLastUserMessage(state.chatHistory[candidateId]);
      }
      
      console.log('🔄 User message for stateful chat:', userMessage);
      
      if (!userMessage) {
        appendMsg(chatLog, 'assistant', 'Error: No user message found for stateful chat');
        return;
      }
      
      // Use the new stateful chat API
      const { text: md } = await askCandidate(candidateId, userMessage);
      
      // Store the response in the correct candidate's chat history
      if (state.currentCandidate && state.currentCandidate.resumeId) {
        addMessageToCandidate(state.currentCandidate.resumeId, 'assistant', md);
      }
      
      appendMsg(chatLog, 'assistant', md);
      return;
    } catch (error) {
      console.error('❌ Stateful chat failed, falling back to legacy:', error);
      // Fall back to legacy method
    }
  }
  
  // Legacy chat method (fallback)
  console.log('🔄 Using legacy chat method for candidate:', candidateId);
  
  // For legacy chat, we need JD hash validation
  if (!state.jdHash) {
    appendMsg(chatLog, 'assistant', 'Error: JD hash not found for legacy chat');
    return;
  }
  
  const jdHash = state.jdHash;
  const resumeText = state.currentCandidate.canonicalText;
  // Use existing messages from state if available, otherwise load from storage
  const messages = getCandidateMessages(state.currentCandidate.resumeId, state.chatHistory[state.currentCandidate.resumeId]);
  
  try {
    const md = await chatWithCandidate(jdHash, resumeText, messages, mode);
    
    // Store the response in the correct candidate's chat history
    if (state.currentCandidate && state.currentCandidate.resumeId) {
      addMessageToCandidate(state.currentCandidate.resumeId, 'assistant', md);
    }
    
    appendMsg(chatLog, 'assistant', md);
  } catch (error) {
    const errorMsg = error.message;
    
    // Store the error in the correct candidate's chat history
    if (state.currentCandidate && state.currentCandidate.resumeId) {
      addMessageToCandidate(state.currentCandidate.resumeId, 'assistant', errorMsg);
    }
    
    appendMsg(chatLog, 'assistant', errorMsg);
  }
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

export function getCandidateMessages(candidateId, existingMessages = null) {
  console.log('🔧 getCandidateMessages()', candidateId, !!existingMessages);
  if (!candidateId) return [];
  if (existingMessages) return existingMessages;
  return loadChatHistory(candidateId);
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
  
  // Check if we have a current candidate and if it's seeded
  if (state.currentCandidate && state.currentCandidate.resumeId) {
    const candidateId = state.currentCandidate.resumeId;
    const isSeeded = state.seededCandidates && state.seededCandidates.has(candidateId);
    
    if (isSeeded) {
      // Enable chat for seeded candidates
      btnSend.disabled = false;
      btnSend.style.opacity = '1';
      btnSend.style.cursor = 'pointer';
      chatText.disabled = false;
      chatText.style.opacity = '1';
      chatText.placeholder = 'Ask something...';
      
      console.log('✅ Chat enabled for seeded candidate:', candidateId);
    } else {
      // Disable chat for unseeded candidates
      btnSend.disabled = true;
      btnSend.style.opacity = '0.5';
      btnSend.style.cursor = 'not-allowed';
      chatText.disabled = true;
      chatText.style.opacity = '0.5';
      chatText.placeholder = 'Please select a candidate first to enable chat...';
      
      console.log('🚫 Chat disabled for unseeded candidate:', candidateId);
    }
  } else {
    // No candidate selected
    btnSend.disabled = true;
    btnSend.style.opacity = '0.5';
    btnSend.style.cursor = 'not-allowed';
    chatText.disabled = true;
    chatText.style.opacity = '0.5';
    chatText.placeholder = 'Please select a candidate first...';
    
    console.log('🚫 Chat disabled - no candidate selected');
  }
}
