// IndexedDB operations for storing resume data

const DB_NAME = 'bulkzip-demo';
const DB_VERSION = 1;
const STORE = 'resumes';

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'resumeId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putResume(record) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);

      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('❌ putResume error:', error);
    throw error;
  }
}

export async function updateResumeLLMResponse(resumeId, llmResponse) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);

      // First get the existing record
      const getRequest = store.get(resumeId);
      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (record) {
          // Update the record with the LLM response
          record.llmResponse = llmResponse;
          record.llmResponseTimestamp = Date.now();
          
          // Put the updated record back
          const putRequest = store.put(record);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          reject(new Error('Resume not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('❌ updateResumeLLMResponse error:', error);
    throw error;
  }
}

export async function getResume(resumeId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(resumeId);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

export async function getAllResumes() {
  try {
    const db = await openDB();
    
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    
    // Use a Promise-based approach for getAll
    const allRecords = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    return allRecords || [];
  } catch (error) {
    console.error('❌ Error getting all resumes:', error);
    return [];
  }
}

export async function clearAllResumes() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    await store.clear();
  } catch (error) {
    console.error('❌ Error clearing resumes:', error);
    throw error;
  }
}

// Chat history storage functions
export function saveChatHistory(candidateId, messages) {
  try {
    const chatKey = `matchagig_chat_${candidateId}`;
    localStorage.setItem(chatKey, JSON.stringify(messages));
    
  } catch (error) {
    console.error('❌ Failed to save chat history:', error);
    throw error;
  }
}

export function loadChatHistory(candidateId) {
  try {
    const chatKey = `matchagig_chat_${candidateId}`;
    const stored = localStorage.getItem(chatKey);
    
    if (stored) {
      const messages = JSON.parse(stored);
      return messages;
    }
  } catch (error) {
    console.error('❌ Failed to load chat history:', error);
  }
  return [];
}

export function clearChatHistory(candidateId) {
  try {
    const chatKey = `matchagig_chat_${candidateId}`;
    localStorage.removeItem(chatKey);
    console.log('🗑️ Chat history cleared for candidate:', candidateId);
  } catch (error) {
    console.error('❌ Failed to clear chat history:', error);
    throw error;
  }
}

export function clearAllChatHistory() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('matchagig_chat_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log('🗑️ Cleared chat history for all candidates');
  } catch (error) {
    console.error('❌ Failed to clear all chat history:', error);
    throw error;
  }
}

// JD data storage functions
export function saveJDData(jdHash, jdTextSnapshot, jobTitle) {
  try {
    localStorage.setItem('matchagig_jdHash', jdHash);
    localStorage.setItem('matchagig_jdTextSnapshot', jdTextSnapshot);
    if (jobTitle) {
      localStorage.setItem('matchagig_jobTitle', jobTitle);
    }
    console.log('💾 JD data saved:', { jdHash, hasJdText: !!jdTextSnapshot, jobTitle });
  } catch (error) {
    console.error('❌ Failed to save JD data:', error);
    throw error;
  }
}

export function loadJDData() {
  try {
    const jdHash = localStorage.getItem('matchagig_jdHash');
    const jdTextSnapshot = localStorage.getItem('matchagig_jdTextSnapshot');
    const jobTitle = localStorage.getItem('matchagig_jobTitle');
    
    
    return { jdHash, jdTextSnapshot, jobTitle };
  } catch (error) {
    console.error('❌ Failed to load JD data:', error);
    return { jdHash: null, jdTextSnapshot: '', jobTitle: '' };
  }
}

export function clearJDData() {
  try {
    localStorage.removeItem('matchagig_jdHash');
    localStorage.removeItem('matchagig_jdTextSnapshot');
    localStorage.removeItem('matchagig_jobTitle');
  } catch (error) {
    console.error('❌ Failed to clear JD data:', error);
    throw error;
  }
}

export function clearAllStorage() {
  try {
    // Clear IndexedDB
    clearAllResumes();
    // Clear localStorage
    clearAllChatHistory();
    clearJDData();
    console.log('🗑️ All storage cleared');
  } catch (error) {
    console.error('❌ Failed to clear all storage:', error);
    throw error;
  }
}
