// Pick PDFs → zip in browser → POST /v1/bulk-zip → show ranked list.
// Store PDFs + canonicalText in IndexedDB keyed by resumeId.

const $ = (id) => document.getElementById(id);
const pdfInput   = $('pdfInput');
const jdTextEl   = $('jdText');
const jdHashEl   = $('jdHash');
const sendBtn    = $('sendBtn');
const statusEl   = $('status');
const listEl     = $('list');
const pdfFrame   = $('pdfFrame');
const viewerTitle= $('viewerTitle');
const explainMd  = $('explainMd');
const jdTextarea = $('jdText');
const jdStatusEl = $('jdStatus');
const refreshBtn = $('refreshBtn');
const clearStorageBtn = $('clearStorageBtn');

// --- State Management ---
const state = {
  jdHash: null,
  jdTextSnapshot: '',   // the JD textarea value that produced jdHash
  candidates: []        // from /v1/bulk-zip
};

// --- IndexedDB (minimal) ---
const DB_NAME = 'bulkzip-demo';
const DB_VERSION = 1;
const STORE = 'resumes';

function openDB() {
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

            async function putResume(record) {
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

async function getResume(resumeId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(resumeId);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

// --- Helpers ---
function setStatus(msg) { statusEl.textContent = msg || ''; }
function baseName(path) { return (path || '').split(/[\\/]/).pop() || path; }
function fmtCos(x) { return (typeof x === 'number') ? x.toFixed(3) : ''; }

let selectedFiles = [];  // File[]

// Invalidate hash if the user edits the JD text
jdTextarea.addEventListener('input', () => {
  const current = jdTextarea.value;
  if (state.jdHash && current !== state.jdTextSnapshot) {
    state.jdHash = null;
    jdStatusEl.textContent = 'JD edited — not linked';
  }
});

// Handle manual JD hash input
jdHashEl.addEventListener('input', () => {
  const hash = jdHashEl.value.trim();
  if (hash) {
    state.jdHash = hash;
    state.jdTextSnapshot = jdTextarea.value;
    jdStatusEl.textContent = `JD linked ✓ (${hash})`;
  } else {
    state.jdHash = null;
    jdStatusEl.textContent = '';
  }
});

// Initialize JD status display
if (jdHashEl.value.trim()) {
  const hash = jdHashEl.value.trim();
  state.jdHash = hash;
  state.jdTextSnapshot = jdTextarea.value;
  jdStatusEl.textContent = `JD linked ✓ (${hash})`;
}

// Load stored candidates from IndexedDB on page load
async function loadStoredCandidates() {
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
    

    
    if (allRecords && allRecords.length > 0) {
              // Reconstruct the results array from stored data
        const results = allRecords.map(record => {
          // Recreate objectUrl for PDF preview
          let objectUrl = '';
          if (record.file) {
            objectUrl = URL.createObjectURL(record.file);
          }
          
          return {
            resumeId: record.resumeId,
            filename: record.meta.filename,
            email: record.meta.email,
            cosine: record.meta.cosine,
            bytes: record.meta.bytes,
            canonicalText: record.canonicalText,
            objectUrl: objectUrl
          };
        });
      
      state.candidates = results;
      
              // Restore JD hash from localStorage
        try {
          const storedJdHash = localStorage.getItem('matchagig_jdHash');
          const storedJdTextSnapshot = localStorage.getItem('matchagig_jdTextSnapshot');
          

          
                      if (storedJdHash) {
              state.jdHash = storedJdHash;
              state.jdTextSnapshot = storedJdTextSnapshot || '';
            }
        } catch (error) {
          console.error('❌ Failed to restore JD hash from localStorage:', error);
        }
      
      // Make sure DOM is ready before rendering
      if (listEl && statusEl) {

        
        renderList(results);
        setStatus(`Loaded ${results.length} stored candidate(s).`);
        
        // Check if we have a stored JD hash
        if (state.jdHash) {
          jdStatusEl.textContent = `JD linked ✓ (${state.jdHash})`;
        }
      } else {

        setTimeout(loadStoredCandidates, 100);
      }
    }
  } catch (error) {
    console.error('❌ Error loading stored candidates:', error);
  }
}

// Wait for DOM to be ready before loading candidates
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadStoredCandidates);
} else {
  loadStoredCandidates();
}

// Add refresh button functionality
refreshBtn.addEventListener('click', () => {
  loadStoredCandidates();
});

// Add clear storage functionality
clearStorageBtn.addEventListener('click', async () => {
  if (confirm('⚠️ This will clear ALL stored data (candidates, PDFs, JD hash). Are you sure?')) {
    try {
      // Clear IndexedDB
      const db = await openDB();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      await store.clear();
      
      // Clear localStorage
      localStorage.removeItem('matchagig_jdHash');
      localStorage.removeItem('matchagig_jdTextSnapshot');
      
      // Reset state
      state.jdHash = null;
      state.jdTextSnapshot = '';
      state.candidates = [];
      
      // Clear UI
      listEl.innerHTML = '';
      pdfFrame.src = '';
      viewerTitle.textContent = 'No candidate selected';
      explainMd.textContent = '';
      jdStatusEl.textContent = '';
      
      // Update status
      setStatus('All storage cleared. Ready for fresh upload.');
    } catch (error) {
      console.error('❌ Error clearing storage:', error);
      setStatus('Error clearing storage: ' + error.message);
    }
  }
});

pdfInput.addEventListener('change', (e) => {
  selectedFiles = Array.from(e.target.files || []).filter(f => /\.pdf$/i.test(f.name));
  setStatus(`${selectedFiles.length} PDF(s) ready`);
});

sendBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) { setStatus('Select PDFs first.'); return; }

  sendBtn.disabled = true;
  setStatus('Zipping…');

  try {
    // 1) Build the zip in-browser (keep original basenames)
    const zip = new JSZip();
    for (const f of selectedFiles) {
      zip.file(baseName(f.name), f);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // 2) Submit to /v1/bulk-zip (multipart) with JD
    const form = new FormData();
    form.append('zip', zipBlob, 'resumes.zip');
    const jdText = jdTextEl.value.trim();
    const jdHash = jdHashEl.value.trim();
    if (jdText) form.append('jdText', jdText);
    if (jdHash) form.append('jdHash', jdHash);
    // We want canonical text back for client-side storage
    form.append('wantCanonicalText', 'true');
    // Limit return size (optional)
    form.append('topN', '200');

    setStatus('Uploading…');
    const resp = await fetch('http://localhost:8787/v1/bulk-zip', { method: 'POST', body: form });
    if (!resp.ok) throw new Error(`/v1/bulk-zip failed: ${resp.status}`);
    const data = await resp.json();

    // Check if backend returned a JD hash from bulk processing
    if (data.jdHash) {
      state.jdHash = data.jdHash;
      state.jdTextSnapshot = jdTextEl.value.trim();
      jdStatusEl.textContent = `JD linked ✓ (${data.jdHash})`;

      
      // Store JD hash in localStorage for persistence
      try {
        localStorage.setItem('matchagig_jdHash', data.jdHash);
        localStorage.setItem('matchagig_jdTextSnapshot', state.jdTextSnapshot);
      } catch (error) {
        console.error('❌ Failed to store JD hash in localStorage:', error);
      }
    }

    // 3) Build a quick lookup filename -> File for local preview storage
    const fileMap = new Map(selectedFiles.map(f => [baseName(f.name), f]));

    // 4) Persist PDFs + canonicalText in IDB by resumeId
    for (const row of (data.results || [])) {
      const file = fileMap.get(baseName(row.filename));
      const objectUrl = file ? URL.createObjectURL(file) : '';
      
      const record = {
        resumeId: row.resumeId,
        file: file || null,             // stored as Blob within the record
        canonicalText: row.canonicalText || '', // full normalized
        meta: {
          resumeId: row.resumeId,
          filename: baseName(row.filename),
          bytes: row.bytes || (file ? file.size : 0),
          email: row.email || null,
          cosine: row.cosine,
          objectUrl
        }
      };
      

      await putResume(record);
    }


                    // 5) Build candidates array with objectUrl for immediate use
                state.candidates = (data.results || []).map(row => {
                  const file = fileMap.get(baseName(row.filename));
                  const objectUrl = file ? URL.createObjectURL(file) : '';
                  

                  
                  return {
                    ...row,
                    objectUrl: objectUrl
                  };
                });
                

                renderList(state.candidates);
    
    // Update status with JD hash info if available
    let statusMsg = `Processed ${state.candidates.length} candidate(s).`;
    if (data.jdHash) {
      statusMsg += ` JD linked ✓ (${data.jdHash})`;
    }
    setStatus(statusMsg);
  } catch (e) {
    console.error(e);
    setStatus(e.message || 'Failed.');
  } finally {
    sendBtn.disabled = false;
  }
});

function renderList(rows) {
  const sorted = rows.slice().sort((a, b) => (b.cosine ?? 0) - (a.cosine ?? 0));
  
  listEl.innerHTML = '';
  
  for (const r of sorted) {
    const label = r.email || baseName(r.filename) || r.resumeId;
    const div = document.createElement('div');
    div.className = 'row';
    div.dataset.resumeId = r.resumeId;
    div.innerHTML = `<span>${label}</span><span>${fmtCos(r.cosine)}</span>`;
    div.addEventListener('click', onSelectCandidate);
    listEl.appendChild(div);
  }
}

async function onSelectCandidate(e) {
  const rid = e.currentTarget.dataset.resumeId;
  
  // Find the candidate in our reconstructed state
  const candidate = state.candidates.find(c => c.resumeId === rid);
  if (!candidate) { 
    setStatus('Candidate not found in state.'); 
    return; 
  }

  // Get the full record from IndexedDB for additional data
  const rec = await getResume(rid);
  if (!rec) { setStatus('Not found in IndexedDB.'); return; }

  viewerTitle.textContent = candidate.email || candidate.filename || candidate.resumeId;
  
  // Use the reconstructed objectUrl for PDF preview
  if (candidate.objectUrl) {
    pdfFrame.src = candidate.objectUrl;
  } else {
    pdfFrame.src = '';
  }

  try {
    await explainCandidate(rec);
  } catch (err) {
    console.error(err);
    explainMd.textContent = 'Could not generate explanation.';
  }
}

async function explainCandidate(rec) {
  const useHash = !!state.jdHash;
  const payload = {
    resumeText: rec.canonicalText,
    // prefer jdHash, else jdText
    ...(useHash ? { jdHash: state.jdHash } : { jdText: jdTextarea.value }),
    topKGlobal: 14,
    includePerTerm: true
  };



  const res = await fetch('http://localhost:8787/v1/explain-llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/markdown' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    document.getElementById('explainMd').textContent = `Explain failed: ${res.status}`;
    return;
  }

  // Adopt the JD hash if backend used/created one
  const jdHashHeader = res.headers.get('X-JD-Hash');
  if (jdHashHeader) {
    state.jdHash = jdHashHeader;
    state.jdTextSnapshot = jdTextarea.value;
    jdStatusEl.textContent = `JD linked ✓ (${jdHashHeader})`;
  }

  const md = await res.text();
  document.getElementById('explainMd').textContent = md; // render as plain text or via a markdown renderer
}


