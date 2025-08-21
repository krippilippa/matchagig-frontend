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
      appendMsg(chatLog, state, 'user', 'Give me a succinct 30-second assessment of fit.');
      callChat(state, chatLog, jdTextEl); // no mode = general
    });
  }
  
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      appendMsg(chatLog, state, 'user', `[${mode}]`);
      callChat(state, chatLog, jdTextEl, mode);
    });
  });
  
  if (btnSend) {
    btnSend.addEventListener('click', () => {
      const text = chatText.value.trim();
      if (!text) return;
      chatText.value = '';
      appendMsg(chatLog, state, 'user', text);
      callChat(state, chatLog, jdTextEl); // general freeform
    });
  }
  
  // Mark as setup
  chatEventListenersSetup = true;
  console.log('Chat event listeners setup complete');
}

export function appendMsg(chatLog, state, role, content) {
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
  
  // Keep local history
  state.messages.push({ role, content });
  
  // Save chat history to localStorage if we have a current candidate
  if (state.currentCandidate && state.currentCandidate.resumeId) {
    const saveChatHistory = (candidateId, messages) => {
      try {
        const chatKey = `matchagig_chat_${candidateId}`;
        localStorage.setItem(chatKey, JSON.stringify(messages));
      } catch (error) {
        console.error('❌ Failed to save chat history:', error);
      }
    };
    
    saveChatHistory(state.currentCandidate.resumeId, state.messages);
  }
}

async function callChat(state, chatLog, jdTextEl, mode) {
  // Defensive checks
  if (!jdTextEl) {
    console.error('JD text element not found');
    appendMsg(chatLog, state, 'assistant', 'Error: JD text element not found');
    return;
  }
  
  if (!state.currentCandidate) {
    appendMsg(chatLog, state, 'assistant', 'Please select a candidate first');
    return;
  }

  if (!state.jdHash) {
    appendMsg(chatLog, state, 'assistant', 'Please set a JD hash first');
    return;
  }

  const jdHash = state.jdHash;
  const resumeText = state.currentCandidate?.canonicalText || '';
  const messages = state.messages;

  try {
    const md = await chatWithCandidate(jdHash, resumeText, messages, mode);
    appendMsg(chatLog, state, 'assistant', md);
  } catch (error) {
    appendMsg(chatLog, state, 'assistant', error.message);
  }
}

export function resetChatEventListeners() {
  chatEventListenersSetup = false;
}
