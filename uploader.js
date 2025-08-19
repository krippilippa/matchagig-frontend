(function () {
  'use strict';

  var dropZone, fileInput, chooseBtn, statusText;

  function initUploader() {
    dropZone = document.getElementById('drop-zone');
    fileInput = document.getElementById('file-input');
    chooseBtn = document.getElementById('choose-file-btn');
    statusText = document.getElementById('status-text');

    ['dragenter','dragover'].forEach(function(evt){
      dropZone.addEventListener(evt, function(e){ e.preventDefault(); e.stopPropagation(); dropZone.classList.add('dragover'); });
    });
    ['dragleave','drop'].forEach(function(evt){
      dropZone.addEventListener(evt, function(e){ e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('dragover'); });
    });
    dropZone.addEventListener('drop', function(e){ handleFiles(e.dataTransfer && e.dataTransfer.files); });
    dropZone.addEventListener('click', function(){ fileInput.click(); });
    chooseBtn.addEventListener('click', function(){ fileInput.click(); });
    fileInput.addEventListener('change', function(e){ handleFiles(e.target.files); });
    
    // Wire up manual overview generation
    var generateBtn = document.getElementById('generate-overview-btn');
    if (generateBtn) {
      generateBtn.addEventListener('click', function() {
        var resumeId = document.getElementById('resume-id-input').value.trim();
        if (resumeId) {
          State.setLastResumeId(resumeId);
          triggerOverviewFetch(resumeId);
        } else {
          setStatus('Please enter a resume ID');
        }
      });
    }
    
    // Wire up quick test ID buttons
    var quickTestButtons = document.querySelectorAll('.known-ids .btn[data-resume-id]');
    quickTestButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var resumeId = this.getAttribute('data-resume-id');
        if (resumeId) {
          // Auto-fill the input and generate overview
          var resumeIdInput = document.getElementById('resume-id-input');
          if (resumeIdInput) {
            resumeIdInput.value = resumeId;
          }
          State.setLastResumeId(resumeId);
          triggerOverviewFetch(resumeId);
        }
      });
    });
  }

  function setStatus(message){ statusText.textContent = message || ''; }

  function handleFiles(files){
    if (!files || !files.length) return;
    var f = files[0];
    if (f.size > 10*1024*1024) { setStatus('File exceeds 10MB.'); return; }
    upload(f);
  }

  function upload(file){
    setStatus('Uploading…');
    // Replace dropzone immediately for better UX (optimistic preview)
    Preview.replaceDropzoneWithPdf(file, null);
    
    Api.uploadFile(file)
      .then(function(data){
        setStatus('Uploaded successfully. Resume ID: ' + data.resumeId + (file && file.name ? ' (' + file.name + ')' : ''));
        
        // Store candidate data with only the fields we actually get from the API
        State.upsertCandidate({ 
          id: data.resumeId || '', 
          name: data.name || file.name || 'Unnamed', 
          email: data.email || '', 
          phone: data.phone || '',
          length: data.length || 0
        });
        
        State.setLastResumeId(data.resumeId || '');
        Sidebar.renderAllResumesList();
        
        // Show the file preview (local file, not server URL)
        Preview.showPdf(file, null);
        
        // Display upload results
        displayUploadResults(data);
        
        // Auto-fill the resume ID input for easy overview generation
        var resumeIdInput = document.getElementById('resume-id-input');
        if (resumeIdInput && data.resumeId) {
          resumeIdInput.value = data.resumeId;
        }
      })
      .catch(function(err){ 
        var message = 'Upload failed'; 
        try{ if (err && err.error && err.error.message) message = err.error.message; } catch(_){} 
        setStatus(message); 
      });
  }

  function displayUploadResults(data) {
    var uploadResults = document.getElementById('upload-results');
    var uploadData = document.getElementById('upload-data');
    
    if (!uploadResults || !uploadData) return;
    
    // Show the upload results section
    uploadResults.style.display = 'block';
    
    // Clear previous data
    uploadData.innerHTML = '';
    
    // Create formatted display of upload response - only show fields that exist
    var resultsHtml = '<div class="upload-info">';
    
    if (data.resumeId) {
      resultsHtml += '<div class="info-item"><span class="label">Resume ID:</span> <span class="value code">' + data.resumeId + '</span></div>';
    }
    
    if (data.name) {
      resultsHtml += '<div class="info-item"><span class="label">Name:</span> <span class="value">' + data.name + '</span></div>';
    }
    
    if (data.email) {
      resultsHtml += '<div class="info-item"><span class="label">Email:</span> <span class="value">' + data.email + '</span></div>';
    }
    
    if (data.phone) {
      resultsHtml += '<div class="info-item"><span class="label">Phone:</span> <span class="value">' + data.phone + '</span></div>';
    }
    
    if (data.length) {
      resultsHtml += '<div class="info-item"><span class="label">Text Length:</span> <span class="value">' + data.length + ' characters</span></div>';
    }
    
    // Add any other fields that might exist in the future
    Object.keys(data).forEach(function(key) {
      if (!['resumeId', 'name', 'email', 'phone', 'length'].includes(key) && data[key]) {
        resultsHtml += '<div class="info-item"><span class="label">' + key + ':</span> <span class="value">' + data[key] + '</span></div>';
      }
    });
    
    resultsHtml += '</div>';
    
    uploadData.innerHTML = resultsHtml;
  }

  function triggerOverviewFetch(resumeId){
    var overviewContainer = document.getElementById('resume-overview');
    if (overviewContainer) {
      overviewContainer.innerHTML = '';
      
      // Show loading state
      var loadingEl = document.createElement('div');
      loadingEl.className = 'loading';
      loadingEl.innerHTML = '<div class="loading-spinner"></div><div>Generating overview...</div>';
      overviewContainer.appendChild(loadingEl);
    }
    
    if (resumeId) {
      setStatus('Generating overview...');
      fetchOverviewWithRetry(resumeId, overviewContainer, 3); // Retry up to 3 times
    }
  }

  function fetchOverviewWithRetry(resumeId, container, retriesLeft) {
    Api.getOverview(resumeId)
      .then(function(data){ 
        renderOverview(container, data); 
        setStatus('Overview generated successfully');
      })
      .catch(function(err){ 
        var message = 'Overview generation failed'; 
        try{ if (err && err.error && err.error.message) message = err.error.message; } catch(_){} 
        
        // Check if it's a connection error and we have retries left
        if (retriesLeft > 0 && (err.message === 'Failed to fetch' || err.message.includes('ERR_CONNECTION_REFUSED'))) {
          setStatus('Server temporarily unavailable, retrying in 2 seconds... (' + retriesLeft + ' retries left)');
          setTimeout(function() {
            fetchOverviewWithRetry(resumeId, container, retriesLeft - 1);
          }, 2000);
          return;
        }
        
        setStatus(message);
        
        // Show error in the overview container
        if (container) {
          var errorEl = document.createElement('div');
          errorEl.className = 'error';
          errorEl.innerHTML = '<strong>Overview generation failed:</strong><br>' + message;
          container.appendChild(errorEl);
        }
      });
  }

  function renderOverview(container, data){
    if (!container || !data) return;
    
    try {
      // Clear container
      container.innerHTML = '';
      
      // Add retry button at the top
      var retryButton = document.createElement('button');
      retryButton.type = 'button';
      retryButton.className = 'btn';
      retryButton.textContent = 'Refresh Overview';
      retryButton.onclick = function() {
        var currentResumeId = State.getLastResumeId();
        if (currentResumeId) {
          triggerOverviewFetch(currentResumeId);
        }
      };
      container.appendChild(retryButton);
      
      // Show the raw API response first for debugging
      var rawDataSection = document.createElement('div');
      rawDataSection.className = 'overview-section';
      rawDataSection.innerHTML = '<h3>🔍 Raw API Response (Debug)</h3>';
      
      var rawDataEl = document.createElement('pre');
      rawDataEl.style.cssText = 'background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 12px; overflow-x: auto; white-space: pre-wrap;';
      rawDataEl.textContent = JSON.stringify(data, null, 2);
      rawDataSection.appendChild(rawDataEl);
      container.appendChild(rawDataSection);
      
      // Show ALL top-level fields from the API response
      var allFieldsSection = document.createElement('div');
      allFieldsSection.className = 'overview-section';
      allFieldsSection.innerHTML = '<h3>📋 All API Fields</h3>';
      
      Object.keys(data).forEach(function(key) {
        var fieldEl = document.createElement('div');
        fieldEl.className = 'info-item';
        var value = data[key];
        var displayValue = '';
        
        if (value === null) {
          displayValue = '<em style="color: #999;">null</em>';
        } else if (value === undefined) {
          displayValue = '<em style="color: #999;">undefined</em>';
        } else if (value === '') {
          displayValue = '<em style="color: #999;">empty string</em>';
        } else if (Array.isArray(value)) {
          displayValue = value.length === 0 ? '<em style="color: #999;">empty array</em>' : '[' + value.length + ' items] ' + JSON.stringify(value);
        } else if (typeof value === 'object') {
          displayValue = Object.keys(value).length === 0 ? '<em style="color: #999;">empty object</em>' : JSON.stringify(value);
        } else {
          displayValue = String(value);
        }
        
        fieldEl.innerHTML = '<span class="label">' + key + ':</span> <span class="value">' + displayValue + '</span>';
        allFieldsSection.appendChild(fieldEl);
      });
      
      container.appendChild(allFieldsSection);
      
      // If there's an overview object, show ALL its fields too
      if (data.overview && typeof data.overview === 'object') {
        var overviewFieldsSection = document.createElement('div');
        overviewFieldsSection.className = 'overview-section';
        overviewFieldsSection.innerHTML = '<h3>📊 Overview Object Fields</h3>';
        
        Object.keys(data.overview).forEach(function(key) {
          var fieldEl = document.createElement('div');
          fieldEl.className = 'info-item';
          var value = data.overview[key];
          var displayValue = '';
          
          if (value === null) {
            displayValue = '<em style="color: #999;">null</em>';
          } else if (value === undefined) {
            displayValue = '<em style="color: #999;">undefined</em>';
          } else if (value === '') {
            displayValue = '<em style="color: #999;">empty string</em>';
          } else if (Array.isArray(value)) {
            displayValue = value.length === 0 ? '<em style="color: #999;">empty array</em>' : '[' + value.length + ' items] ' + JSON.stringify(value);
          } else if (typeof value === 'object') {
            displayValue = Object.keys(value).length === 0 ? '<em style="color: #999;">empty object</em>' : JSON.stringify(value);
          } else {
            displayValue = String(value);
          }
          
          fieldEl.innerHTML = '<span class="label">overview.' + key + ':</span> <span class="value">' + displayValue + '</span>';
          overviewFieldsSection.appendChild(fieldEl);
        });
        
        container.appendChild(overviewFieldsSection);
      }
      
      // If there's a metadata object, show ALL its fields too
      if (data.metadata && typeof data.metadata === 'object') {
        var metadataFieldsSection = document.createElement('div');
        metadataFieldsSection.className = 'overview-section';
        metadataFieldsSection.innerHTML = '<h3>📈 Metadata Object Fields</h3>';
        
        Object.keys(data.metadata).forEach(function(key) {
          var fieldEl = document.createElement('div');
          fieldEl.className = 'info-item';
          var value = data.metadata[key];
          var displayValue = '';
          
          if (value === null) {
            displayValue = '<em style="color: #999;">null</em>';
          } else if (value === undefined) {
            displayValue = '<em style="color: #999;">undefined</em>';
          } else if (value === '') {
            displayValue = '<em style="color: #999;">empty string</em>';
          } else if (Array.isArray(value)) {
            displayValue = value.length === 0 ? '<em style="color: #999;">empty array</em>' : '[' + value.length + ' items] ' + JSON.stringify(value);
          } else if (typeof value === 'object') {
            displayValue = Object.keys(value).length === 0 ? '<em style="color: #999;">empty object</em>' : JSON.stringify(value);
          } else {
            displayValue = String(value);
          }
          
          fieldEl.innerHTML = '<span class="label">metadata.' + key + ':</span> <span class="value">' + displayValue + '</span>';
          metadataFieldsSection.appendChild(fieldEl);
        });
        
        container.appendChild(metadataFieldsSection);
      }
      
    } catch (error) {
      console.error('Error rendering overview:', error);
      var errorEl = document.createElement('div');
      errorEl.className = 'error';
      errorEl.textContent = 'Error rendering overview data: ' + error.message;
      container.appendChild(errorEl);
    }
  }

  // Simplified - just keep the basic functions
  window.Uploader = { 
    init: initUploader
  };
})();


