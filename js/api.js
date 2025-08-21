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

export async function explainCandidate(jdHash, resumeText) {
  console.log('🔧 explainCandidate()', jdHash, resumeText?.length);
  const payload = {
    jdHash: jdHash,
    resumeText: resumeText
  };

  // Debug: log what we're sending
  console.log('Sending to /v1/explain-llm:', {
    jdHash: jdHash,
    resumeTextLength: resumeText?.length || 0,
    payload: payload
  });

  const res = await fetch('http://localhost:8787/v1/explain-llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/markdown' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let errorMessage = `Explain failed: ${res.status}`;
    
    // Try to get more details from the response
    let responseText = '';
    try {
      responseText = await res.text();
      console.error('Backend error response:', responseText);
    } catch (e) {
      console.error('Could not read error response:', e);
    }
    
    // Provide more helpful error messages based on status
    if (res.status === 400) {
      errorMessage = `❌ Bad Request: ${responseText || 'Check that jdHash and resumeText are provided and valid'}`;
    } else if (res.status === 404) {
      errorMessage = `❌ JD Hash not found: ${responseText || 'Please check that the hash is correct'}`;
    } else if (res.status === 500) {
      errorMessage = `❌ Server Error: ${responseText || 'Please try again later'}`;
    }
    
    throw new Error(errorMessage);
  }

  const md = await res.text();
  
  // Check for JD hash header
  const jdHashHeader = res.headers.get('X-JD-Hash');
  
  return {
    markdown: md,
    jdHashHeader: jdHashHeader
  };
}

export async function chatWithCandidate(jdHash, resumeText, messages, mode) {
  console.log('🔧 chatWithCandidate()', jdHash, resumeText?.length, messages?.length, mode);
  const payload = { jdHash, resumeText, messages, mode };

  console.log('Sending to /v1/chat:', payload);

  const res = await fetch('http://localhost:8787/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/markdown' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    let errorMessage = `Chat failed: ${res.status}`;
    
    // Try to get more details from the response
    try {
      const responseText = await res.text();
      console.error('Backend error response:', responseText);
      errorMessage += `: ${responseText}`;
    } catch (e) {
      console.error('Could not read error response:', e);
    }
    
    throw new Error(errorMessage);
  }
  
  return await res.text();
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
