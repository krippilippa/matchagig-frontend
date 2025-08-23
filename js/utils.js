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

export function renderList(listEl, rows, onSelectCandidate, extractionStatuses = {}) {
  const sorted = rows.slice().sort((a, b) => (b.cosine ?? 0) - (a.cosine ?? 0));
  
  listEl.innerHTML = '';
  
  for (const r of sorted) {
    const label = r.email || baseName(r.filename) || r.resumeId;
    const extractionStatus = extractionStatuses[r.resumeId] || 'pending';
    
    const div = document.createElement('div');
    div.className = 'row';
    div.dataset.resumeId = r.resumeId;
    div.innerHTML = `
      <div class="progress-dot ${extractionStatus}" data-resume-id="${r.resumeId}"></div>
      <span>${label}</span>
      <span>${fmtCos(r.cosine)}</span>
    `;
    
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

export function updateProgressDot(resumeId, status) {
  const dot = document.querySelector(`.progress-dot[data-resume-id="${resumeId}"]`);
  if (dot) {
    // Remove all status classes first
    dot.classList.remove('processing', 'extracted', 'failed');
    // Add the new status class
    dot.classList.add(status);
  }
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

export function clearUI(listEl, pdfFrame, viewerTitle, jdStatusEl, chatLog) {
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
  
  // Hide toggle buttons and extracted data display
  const viewToggleButtons = document.getElementById('viewToggleButtons');
  if (viewToggleButtons) {
    viewToggleButtons.style.display = 'none';
  }
  
  const extractedDataDisplay = document.getElementById('extractedDataDisplay');
  if (extractedDataDisplay) {
    extractedDataDisplay.style.display = 'none';
  }
}

export function formatExtractedData(data) {
  if (!data || !data.extraction) {
    return 'No extracted data available';
  }
  
  const basic = data.extraction.basic || {};
  
  return `
    <h1>${basic.name || 'Name not available'}</h1>
    <h2>${basic.title || 'Title not available'}</h2>
    <p>${basic.location || 'Location not available'}</p>
    <p><strong>${basic.blurb || 'No blurb available'}</strong></p>
    <p>${basic.summary || 'No summary available'}</p>
  `;
}
