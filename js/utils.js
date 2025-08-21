// Helper functions and utilities

export function setStatus(statusEl, msg) { 
  console.log('🔧 setStatus()', msg);
  if (statusEl) statusEl.textContent = msg || ''; 
}

export function baseName(path) { 
  console.log('🔧 baseName()', path);
  return (path || '').split(/[\\/]/).pop() || path; 
}

export function fmtCos(x) { 
  console.log('🔧 fmtCos()', x);
  return (typeof x === 'number') ? x.toFixed(3) : ''; 
}

export function renderList(listEl, rows, onSelectCandidate) {
  console.log('🔧 renderList()', rows.length);
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
  console.log('🔧 createZipFromFiles()', files.length);
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
  console.log('🔧 createFileMap()', files.length);
  return new Map(files.map(f => [baseName(f.name), f]));
}

export function createCandidateFromRecord(record) {
  console.log('🔧 createCandidateFromRecord()', record.resumeId);
  // Recreate objectUrl for PDF preview
  let objectUrl = '';
  
  // Always reconstruct from fileData on page load (stored objectUrl becomes invalid)
  if (record.fileData && record.fileType) {
    // Recreate Blob from stored ArrayBuffer
    const blob = new Blob([record.fileData], { type: record.fileType });
    objectUrl = URL.createObjectURL(blob);
  } else if (record.objectUrl) {
    // Fallback to stored objectUrl only if no fileData available
    objectUrl = record.objectUrl;
  } else if (record.meta && record.meta.objectUrl) {
    // Last fallback to meta.objectUrl
    objectUrl = record.meta.objectUrl;
  } else {
    console.log('❌ No file data found for record:', record.resumeId);
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
  console.log('🔧 updateJDStatus()', hash, !!textSnapshot);
  if (hash) {
    jdStatusEl.textContent = `JD hash set ✓ (${hash})`;
    jdStatusEl.style.color = '#4CAF50';
  } else {
    jdStatusEl.textContent = '';
    jdStatusEl.style.color = '#666';
  }
}

export function clearUI(listEl, pdfFrame, viewerTitle, jdStatusEl, chatLog) {
  console.log('🔧 clearUI()');
  listEl.innerHTML = '';
  pdfFrame.src = '';
  viewerTitle.textContent = 'No candidate selected';
  jdStatusEl.textContent = '';
  chatLog.innerHTML = '';
  
  // Clear job title display
  const jobTitleDisplay = document.getElementById('jobTitleDisplay');
  if (jobTitleDisplay) {
    jobTitleDisplay.textContent = 'No job title available';
  }
  
  // Hide JD text display and show PDF frame
  const jdTextDisplay = document.getElementById('jdTextDisplay');
  if (jdTextDisplay) {
    jdTextDisplay.style.display = 'none';
  }
  if (pdfFrame) {
    pdfFrame.style.display = 'block';
  }
  
  // Hide Update button
  const updateJdBtn = document.getElementById('updateJdBtn');
  if (updateJdBtn) {
    updateJdBtn.style.display = 'none';
  }
}
