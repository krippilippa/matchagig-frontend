// IndexedDB operations for storing resume data

const DB_NAME = 'bulkzip-demo';
const DB_VERSION = 2; // Increment version for new schema
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
    throw error;
  }
}



// Store seeding status for a candidate
export async function markCandidateAsSeeded(resumeId) {
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
          // Update the record with seeding status
          record.isSeeded = true;
          record.seededAt = Date.now();
          
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
    throw error;
  }
}

// Check if a candidate is already seeded
export async function isCandidateSeeded(resumeId) {
  try {
    const record = await getResume(resumeId);
    return record && record.isSeeded === true;
  } catch (error) {
    return false;
  }
}

export async function getResume(resumeId) {  
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(resumeId);
    r.onsuccess = () => {
      const result = r.result || null;
      resolve(result);
    };
    r.onerror = () => {
      console.error(`💥 Error getting resume from database: ${resumeId}`, r.error);
      reject(r.error);
    };
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
    throw error;
  }
}

// Chat history storage functions
export function saveChatHistory(candidateId, messages) {
  try {
    const chatKey = `matchagig_chat_${candidateId}`;
    localStorage.setItem(chatKey, JSON.stringify(messages));
    
  } catch (error) {
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
    // Silently handle loading errors
  }
  return [];
}

export function clearChatHistory(candidateId) {
  try {
    const chatKey = `matchagig_chat_${candidateId}`;
    localStorage.removeItem(chatKey);
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
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
    return { jdHash: null, jdTextSnapshot: '', jobTitle: '' };
  }
}

export function clearJDData() {
  try {
    localStorage.removeItem('matchagig_jdHash');
    localStorage.removeItem('matchagig_jdTextSnapshot');
    localStorage.removeItem('matchagig_jobTitle');
  } catch (error) {
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
  } catch (error) {
    throw error;
  }
}

// Clear seeding status for a specific candidate
export async function clearCandidateSeedingStatus(resumeId) {
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
          // Remove seeding status
          delete record.isSeeded;
          delete record.seededAt;
          
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
    throw error;
  }
}

// Clear seeding status for all candidates (for demo reset)
export async function clearAllSeedingStatus() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    
    // Get all records and clear their seeding status
    const allRecords = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    // Update each record to remove seeding status
    for (const record of allRecords) {
      if (record.isSeeded) {
        delete record.isSeeded;
        delete record.seededAt;
        await new Promise((resolve, reject) => {
          const putRequest = store.put(record);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        });
      }
    }
    
  } catch (error) {
    throw error;
  }
}

// NEW: Update extraction status and data for a resume
export async function updateExtractionStatus(resumeId, status, extractedData = null) {
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
          // Update the record with extraction data
          record.extractionStatus = status;
          if (extractedData) {
            record.extractedData = extractedData;
          }
          
          // Put the updated record back
          const putRequest = store.put(record);
          putRequest.onsuccess = () => {
            resolve();
          };
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          console.error(`❌ Record not found for ${resumeId} when trying to update extraction status`);
          reject(new Error('Resume not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error(`💥 Error updating extraction status for ${resumeId}:`, error);
    throw error;
  }
}
