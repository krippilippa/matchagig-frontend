(function () {
  'use strict';

  var dropZone, fileInput, chooseBtn, statusText, output;

  function initUploader() {
    dropZone = document.getElementById('drop-zone');
    fileInput = document.getElementById('file-input');
    chooseBtn = document.getElementById('choose-file-btn');
    statusText = document.getElementById('status-text');
    output = document.getElementById('output-text');

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
    
    // Load available resume IDs from state
    loadAvailableResumeIds();
  }

  function setStatus(message){ statusText.textContent = message || ''; }

  function handleFiles(files){
    if (!files || !files.length) return;
    var f = files[0];
    if (f.size > 10*1024*1024) { setStatus('File exceeds 10MB.'); return; }
    var forced = (window.Config && window.Config.FORCED_RESUME_ID) ? window.Config.FORCED_RESUME_ID : '';
    if (forced) {
      // Dev mode: skip upload entirely, preview immediately and run queries with forced id
      setStatus('Using dev resumeId ' + forced + ' …');
      Preview.replaceDropzoneWithPdf(f, null);
      triggerOverviewFetch(forced);
      return;
    }
    upload(f);
  }

  function upload(file){
    setStatus('Uploading…');
    // Replace dropzone immediately for better UX (optimistic preview)
    Preview.replaceDropzoneWithPdf(file, null);
    if (output) output.value = '';
    Api.uploadFile(file)
      .then(function(data){
        setStatus('Uploaded successfully. Resume ID: ' + data.resumeId + (file && file.name ? ' (' + file.name + ')' : ''));
        if (output) output.value = data && data.text ? data.text : '';
        State.upsertCandidate({ id: data.resumeId || '', name: data.name || file.name || 'Unnamed', email: data.email || '', blurb: data.blurb || '', text: data.text || '', pdfUrl: data.pdfUrl || '' });
        State.setLastResumeId(data.resumeId || '');
        Sidebar.renderAllResumesList();
        // Ensure preview points at the server version if available
        Preview.showPdf(file, data);
        
        // Display upload results
        displayUploadResults(data);
        
        // Auto-fill the resume ID input for easy overview generation
        var resumeIdInput = document.getElementById('resume-id-input');
        if (resumeIdInput && data.resumeId) {
          resumeIdInput.value = data.resumeId;
        }
        
        // Fetch overview data using the returned resumeId
        var useId = data.resumeId;
        if (useId) {
          triggerOverviewFetch(useId);
        }
      })
      .catch(function(err){ var message = 'Upload failed'; try{ if (err && err.error && err.error.message) message = err.error.message; } catch(_){} setStatus(message); });
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
      retryButton.className = 'btn btn-retry';
      retryButton.textContent = 'Refresh Overview';
      retryButton.onclick = function() {
        var currentResumeId = State.getLastResumeId();
        if (currentResumeId) {
          triggerOverviewFetch(currentResumeId);
        }
      };
      container.appendChild(retryButton);
      
      // Basic info section
      if (data.name || data.email || data.phone) {
        var basicInfo = document.createElement('div');
        basicInfo.className = 'overview-section';
        basicInfo.innerHTML = '<h3>Contact Information</h3>';
        
        if (data.name) {
          var nameEl = document.createElement('div');
          nameEl.className = 'info-item';
          nameEl.innerHTML = '<span class="label">Name:</span> <span class="value">' + data.name + '</span>';
          basicInfo.appendChild(nameEl);
        }
        
        if (data.email) {
          var emailEl = document.createElement('div');
          emailEl.className = 'info-item';
          emailEl.innerHTML = '<span class="label">Email:</span> <span class="value">' + data.email + '</span>';
          basicInfo.appendChild(emailEl);
        }
        
        if (data.phone) {
          var phoneEl = document.createElement('div');
          phoneEl.className = 'info-item';
          phoneEl.innerHTML = '<span class="label">Phone:</span> <span class="value">' + data.phone + '</span>';
          basicInfo.appendChild(phoneEl);
        }
        
        container.appendChild(basicInfo);
      }
      
      // Overview data section
      if (data.overview) {
        var overview = data.overview;
        
        // Current position
        if (overview.title || overview.employer) {
          var positionSection = document.createElement('div');
          positionSection.className = 'overview-section';
          positionSection.innerHTML = '<h3>Current Position</h3>';
          
          if (overview.title) {
            var titleEl = document.createElement('div');
            titleEl.className = 'info-item highlight';
            titleEl.innerHTML = '<span class="label">Title:</span> <span class="value">' + overview.title + '</span>';
            positionSection.appendChild(titleEl);
          }
          
          if (overview.employer) {
            var employerEl = document.createElement('div');
            employerEl.className = 'info-item';
            employerEl.innerHTML = '<span class="label">Company:</span> <span class="value">' + overview.employer + '</span>';
            positionSection.appendChild(employerEl);
          }
          
          if (overview.seniorityHint) {
            var seniorityEl = document.createElement('div');
            seniorityEl.className = 'info-item';
            seniorityEl.innerHTML = '<span class="label">Level:</span> <span class="value">' + overview.seniorityHint + '</span>';
            positionSection.appendChild(seniorityEl);
          }
          
          container.appendChild(positionSection);
        }
        
        // Experience
        if (overview.yoe) {
          var experienceSection = document.createElement('div');
          experienceSection.className = 'overview-section';
          experienceSection.innerHTML = '<h3>Experience</h3>';
          
          var yoeEl = document.createElement('div');
          yoeEl.className = 'info-item highlight';
          yoeEl.innerHTML = '<span class="label">Years of Experience:</span> <span class="value">' + overview.yoe + ' years</span>';
          experienceSection.appendChild(yoeEl);
          
          if (overview.yoeBasis) {
            var basisEl = document.createElement('div');
            basisEl.className = 'info-item';
            basisEl.innerHTML = '<span class="label">Source:</span> <span class="value">' + overview.yoeBasis + '</span>';
            experienceSection.appendChild(basisEl);
          }
          
          container.appendChild(experienceSection);
        }
        
        // Education
        if (overview.education && overview.education.level) {
          var educationSection = document.createElement('div');
          educationSection.className = 'overview-section';
          educationSection.innerHTML = '<h3>Education</h3>';
          
          var eduEl = document.createElement('div');
          eduEl.className = 'info-item';
          var eduParts = [overview.education.level, overview.education.degreeName, overview.education.field, overview.education.institution, overview.education.year].filter(Boolean);
          eduEl.innerHTML = '<span class="label">Highest Degree:</span> <span class="value">' + eduParts.join(', ') + '</span>';
          educationSection.appendChild(eduEl);
          
          container.appendChild(educationSection);
        }
        
        // Functions
        if (overview.functions && overview.functions.length) {
          var functionsSection = document.createElement('div');
          functionsSection.className = 'overview-section';
          functionsSection.innerHTML = '<h3>Professional Functions</h3>';
          
          var functionsEl = document.createElement('div');
          functionsEl.className = 'info-item';
          functionsEl.innerHTML = '<span class="label">Domains:</span> <span class="value">' + overview.functions.join(', ') + '</span>';
          functionsSection.appendChild(functionsEl);
          
          container.appendChild(functionsSection);
        }
        
        // Top Achievements
        if (overview.topAchievements && overview.topAchievements.length) {
          var achievementsSection = document.createElement('div');
          achievementsSection.className = 'overview-section';
          achievementsSection.innerHTML = '<h3>Key Achievements</h3>';
          
          var achievementsList = document.createElement('div');
          achievementsList.className = 'achievements-list';
          overview.topAchievements.forEach(function(achievement) {
            var achievementEl = document.createElement('div');
            achievementEl.className = 'achievement-item';
            achievementEl.textContent = achievement;
            achievementsList.appendChild(achievementEl);
          });
          
          achievementsSection.appendChild(achievementsList);
          container.appendChild(achievementsSection);
        }
        
        // Location
        if (overview.location && (overview.location.city || overview.location.country)) {
          var locationSection = document.createElement('div');
          locationSection.className = 'overview-section';
          locationSection.innerHTML = '<h3>Location</h3>';
          
          var locationEl = document.createElement('div');
          locationEl.className = 'info-item';
          var locationParts = [overview.location.city, overview.location.country].filter(Boolean);
          locationEl.innerHTML = '<span class="label">Location:</span> <span class="value">' + locationParts.join(', ') + '</span>';
          locationSection.appendChild(locationEl);
          
          container.appendChild(locationSection);
        }
      }
      
      // Metadata
      if (data.metadata) {
        var metadataSection = document.createElement('div');
        metadataSection.className = 'overview-section metadata';
        metadataSection.innerHTML = '<h3>Processing Info</h3>';
        
        if (data.metadata.timestamp) {
          var timestampEl = document.createElement('div');
          timestampEl.className = 'info-item small';
          var date = new Date(data.metadata.timestamp);
          timestampEl.innerHTML = '<span class="label">Processed:</span> <span class="value">' + date.toLocaleString() + '</span>';
          metadataSection.appendChild(timestampEl);
        }
        
        if (data.metadata.canonicalTextLength) {
          var lengthEl = document.createElement('div');
          lengthEl.className = 'info-item small';
          lengthEl.innerHTML = '<span class="label">Text Length:</span> <span class="value">' + data.metadata.canonicalTextLength + ' characters</span>';
          metadataSection.appendChild(lengthEl);
        }
        
        container.appendChild(metadataSection);
      }
      
    } catch (error) {
      console.error('Error rendering overview:', error);
      var errorEl = document.createElement('div');
      errorEl.className = 'error';
      errorEl.textContent = 'Error rendering overview data';
      container.appendChild(errorEl);
    }
  }

  function displayUploadResults(data) {
    var uploadResults = document.getElementById('upload-results');
    var uploadData = document.getElementById('upload-data');
    
    if (!uploadResults || !uploadData) return;
    
    // Show the upload results section
    uploadResults.style.display = 'block';
    
    // Clear previous data
    uploadData.innerHTML = '';
    
    // Create formatted display of upload response
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
    
    // Add any other fields from the response
    Object.keys(data).forEach(function(key) {
      if (!['resumeId', 'name', 'email', 'phone', 'length'].includes(key) && data[key]) {
        resultsHtml += '<div class="info-item"><span class="label">' + key + ':</span> <span class="value">' + data[key] + '</span></div>';
      }
    });
    
    resultsHtml += '</div>';
    
    uploadData.innerHTML = resultsHtml;
  }

  function loadAvailableResumeIds() {
    // This function is no longer needed since we have hardcoded known IDs
    // Keeping it for future use if needed
  }

  // Global function to set resume ID from known IDs buttons
  window.setResumeId = function(resumeId) {
    var input = document.getElementById('resume-id-input');
    if (input) {
      input.value = resumeId;
      // Auto-generate overview when ID is set
      State.setLastResumeId(resumeId);
      triggerOverviewFetch(resumeId);
    }
  };

  window.Uploader = { 
    init: initUploader,
    // Manual trigger for testing - call from browser console: Uploader.manualOverview('77b120d8-00eb-42b0-a5c7-32fd918048a2')
    manualOverview: function(resumeId) {
      if (resumeId) {
        State.setLastResumeId(resumeId);
        triggerOverviewFetch(resumeId);
      } else {
        console.log('Please provide a resume ID: Uploader.manualOverview("your-resume-id-here")');
      }
    }
  };
})();


