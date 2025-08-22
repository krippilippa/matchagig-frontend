// API calls to backend endpoints

export async function bulkZipUpload(zipBlob, jdText, jdHash) {
  console.log('🔧 bulkZipUpload()', !!zipBlob, !!jdText, !!jdHash);
  const form = new FormData();
  form.append('zip', zipBlob, 'resumes.zip');
  if (jdText) form.append('jdText', jdText);
  if (jdHash) form.append('jdHash', jdHash);
  // We want canonical text back for client-side storage
  form.append('wantCanonicalText', 'true');
  // Limit return size (optional)
  form.append('topN', '200');

  const resp = await fetch('http://localhost:8787/v1/bulk-zip', { 
    method: 'POST', 
    body: form 
  });
  
  if (!resp.ok) {
    throw new Error(`/v1/bulk-zip failed: ${resp.status}`);
  }
  
  return await resp.json();
}





// New stateful chat API functions
export async function seedCandidateThread(candidateId, jdHash, resumeText) {
  console.log('🔧 seedCandidateThread()', candidateId, jdHash, resumeText?.length);
  
  const r = await fetch('http://localhost:8787/v1/chat/seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateId, jdHash, resumeText })
  });
  
  if (!r.ok) {
    const errorData = await r.json().catch(() => ({}));
    throw new Error(errorData?.message || `Seed failed: ${r.status}`);
  }
  
  return r.json(); // { ok: true, previousResponseId }
}

export async function askCandidate(candidateId, text) {
  console.log('🔧 askCandidate()', candidateId, text?.length);
  
  const r = await fetch('http://localhost:8787/v1/chat/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateId, text })
  });
  
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e?.message || `Ask failed: ${r.status}`);
  }
  
  return r.json(); // { text, previousResponseId }
}
