// Chat functionality and event handling

import { chatWithCandidate } from './api.js';

// Flag to prevent multiple event listener setups
let chatEventListenersSetup = false;

export function setupChatEventListeners(state, chatLog, chatText, jdTextEl) {
  // Prevent multiple setups
  if (chatEventListenersSetup) {
    console.log('Chat event listeners already setup, skipping...');
    return;
  }
  
  console.log('Setting up chat event listeners...');
  
  const btnExplain = document.getElementById('btnExplain');
  const btnSend = document.getElementById('btnSend');
  const modeButtons = document.querySelectorAll('#chatActions [data-mode]');
  
  console.log('Chat elements found:', {
    btnExplain: !!btnExplain,
    btnSend: !!btnSend,
    modeButtons: modeButtons.length,
    chatLog: !!chatLog,
    chatText: !!chatText
  });
  
  if (btnExplain) {
    btnExplain.addEventListener('click', () => {
      const message = 'Give me a succinct 30-second assessment of fit.';
      
      // Store user message in candidate's chat history
      if (state.currentCandidate && state.currentCandidate.resumeId) {
        if (window.addMessageToCandidate) {
          window.addMessageToCandidate(state.currentCandidate.resumeId, 'user', message);
        }
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
        if (window.addMessageToCandidate) {
          window.addMessageToCandidate(state.currentCandidate.resumeId, 'user', message);
        }
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
        if (window.addMessageToCandidate) {
          window.addMessageToCandidate(state.currentCandidate.resumeId, 'user', text);
        }
      }
      
      appendMsg(chatLog, 'user', text);
      callChat(state, chatLog, jdTextEl); // general freeform
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
          if (window.addMessageToCandidate) {
            window.addMessageToCandidate(state.currentCandidate.resumeId, 'user', text);
          }
        }
        
        appendMsg(chatLog, 'user', text);
        callChat(state, chatLog, jdTextEl); // general freeform
      }
    });
  }
  
  // Mark as setup
  chatEventListenersSetup = true;
  console.log('Chat event listeners setup complete');
}

export function appendMsg(chatLog, role, content) {
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
  if (!jdTextEl) {
    console.error('JD text element not found');
    appendMsg(chatLog, 'assistant', 'Error: JD text element not found');
    return;
  }
  
  if (!state.currentCandidate) {
    appendMsg(chatLog, 'assistant', 'Please select a candidate first');
    return;
  }

  if (!state.jdHash) {
    appendMsg(chatLog, 'assistant', 'Please set a JD hash first');
    return;
  }

  const jdHash = state.jdHash;
  const resumeText = state.currentCandidate.canonicalText;
  const messages = state.chatHistory[state.currentCandidate.resumeId] || [];
  
  try {
    const md = await chatWithCandidate(jdHash, resumeText, messages, mode);
    
    // Store the response in the correct candidate's chat history
    if (state.currentCandidate && state.currentCandidate.resumeId) {
      // Import the function from main.js
      if (window.addMessageToCandidate) {
        window.addMessageToCandidate(state.currentCandidate.resumeId, 'assistant', md);
      }
    }
    
    appendMsg(chatLog, 'assistant', md);
  } catch (error) {
    const errorMsg = error.message;
    
    // Store the error in the correct candidate's chat history
    if (state.currentCandidate && state.currentCandidate.resumeId) {
      if (window.addMessageToCandidate) {
        window.addMessageToCandidate(state.currentCandidate.resumeId, 'assistant', errorMsg);
      }
    }
    
    appendMsg(chatLog, 'assistant', errorMsg);
  }
}

export function resetChatEventListeners() {
  chatEventListenersSetup = false;
}
