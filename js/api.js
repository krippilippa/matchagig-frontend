// API calls to backend endpoints
import { getApiUrl, CONFIG } from './config.js';

export async function bulkZipUpload(zipBlob, jdText, jdHash) {
  const form = new FormData();
  form.append('zip', zipBlob, 'resumes.zip');
  if (jdText) form.append('jdText', jdText);
  if (jdHash) form.append('jdHash', jdHash);
  // We want canonical text back for client-side storage
  form.append('wantCanonicalText', 'true');
  // Limit return size (optional)
  form.append('topN', '200');

  const resp = await fetch(getApiUrl(CONFIG.ENDPOINTS.BULK_ZIP), { 
    method: 'POST', 
    body: form 
  });
  
  if (!resp.ok) {
    throw new Error(`Bulk upload failed: ${resp.status} - ${resp.statusText}`);
  }
  
  return await resp.json();
}





// New stateful chat API functions
export async function seedCandidateThread(candidateId, jdHash, resumeText) {
  const r = await fetch(getApiUrl(CONFIG.ENDPOINTS.CHAT_SEED), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateId, jdHash, resumeText })
  });
  
  if (!r.ok) {
    const errorData = await r.json().catch(() => ({}));
    throw new Error(errorData?.message || `Chat initialization failed: ${r.status}`);
  }
  
  return r.json(); // { ok: true, previousResponseId }
}

export async function askCandidate(candidateId, text) {
  const r = await fetch(getApiUrl(CONFIG.ENDPOINTS.CHAT_ASK), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateId, text })
  });
  
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e?.message || `Chat request failed: ${r.status}`);
  }
  
  return r.json(); // { text, previousResponseId }
}

export async function extractResumeData(canonicalText) {
  console.log(`🌐 Calling resume extraction API...`);
  
  const response = await fetch(getApiUrl(CONFIG.ENDPOINTS.RESUME_EXTRACT), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ canonicalText })
  });
  
  console.log(`📡 API response status: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ API extraction failed: ${response.status} - ${errorText}`);
    throw new Error(`Extraction failed: ${response.status}`);
  }
  
  const data = await response.json();
  return data;
}
