// Helper functions and utilities

export function setStatus(statusEl, msg) { 
  if (statusEl) statusEl.textContent = msg || ''; 
}

export function baseName(path) { 
  return (path || '').split(/[\\/]/).pop() || path; 
}

export function fmtCos(x) { 
  return (typeof x === 'number') ? x.toFixed(3) : ''; 
}

export function renderList(listEl, rows, onSelectCandidate) {
  const sorted = rows.slice().sort((a, b) => (b.cosine ?? 0) - (a.cosine ?? 0));
  
  listEl.innerHTML = '';
  
  for (const r of sorted) {
    const label = r.email || baseName(r.filename) || r.resumeId;
    const div = document.createElement('div');
    div.className = 'row';
    div.dataset.resumeId = r.resumeId;
    div.innerHTML = `<span>${label}</span><span>${fmtCos(r.cosine)}</span>`;
    
    // Add click event listener
    div.addEventListener('click', onSelectCandidate);
    
    listEl.appendChild(div);
  }
}

export function createZipFromFiles(files) {
  return new Promise(async (resolve) => {
    const JSZip = window.JSZip;
    if (!JSZip) {
      throw new Error('JSZip not loaded');
    }
    
    const zip = new JSZip();
    for (const f of files) {
      zip.file(baseName(f.name), f);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    resolve(zipBlob);
  });
}

export function createFileMap(files) {
  return new Map(files.map(f => [baseName(f.name), f]));
}

export function createCandidateFromRecord(record) {
  // Recreate objectUrl for PDF preview
  let objectUrl = '';
  if (record.fileData && record.fileType) {
    // Recreate Blob from stored ArrayBuffer
    const blob = new Blob([record.fileData], { type: record.fileType });
    objectUrl = URL.createObjectURL(blob);
    console.log('Created blob from ArrayBuffer:', blob, 'objectUrl:', objectUrl);
  } else if (record.meta && record.meta.objectUrl) {
    // If we have a stored objectUrl, use it
    objectUrl = record.meta.objectUrl;
    console.log('Using stored objectUrl:', objectUrl);
  } else {
    console.log('No file data found for record:', record.resumeId);
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
}

export function updateJDStatus(jdStatusEl, hash, textSnapshot) {
  if (hash) {
    jdStatusEl.textContent = `JD hash set ✓ (${hash})`;
    jdStatusEl.style.color = '#4CAF50';
  } else {
    jdStatusEl.textContent = '';
    jdStatusEl.style.color = '#666';
  }
}

export function clearUI(listEl, pdfFrame, viewerTitle, explainMd, jdStatusEl, chatLog) {
  listEl.innerHTML = '';
  pdfFrame.src = '';
  viewerTitle.textContent = 'No candidate selected';
  explainMd.textContent = '';
  explainMd.style.borderLeft = '';
  explainMd.title = '';
  jdStatusEl.textContent = '';
  chatLog.innerHTML = '';
}
