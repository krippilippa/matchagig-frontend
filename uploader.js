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
  }

  function setStatus(message){ statusText.textContent = message || ''; }

  function handleFiles(files){
    if (!files || !files.length) return;
    var f = files[0];
    if (f.size > 10*1024*1024) { setStatus('File exceeds 10MB.'); return; }
    var forced = (window.Config && window.Config.FORCED_FILE_ID) ? window.Config.FORCED_FILE_ID : '';
    if (forced) {
      // Dev mode: skip upload entirely, preview immediately and run queries with forced id
      setStatus('Using dev fileId ' + forced + ' …');
      Preview.replaceDropzoneWithPdf(f, null);
      triggerRightSideFetches(forced, null);
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
        setStatus('Uploaded successfully. fileId: ' + data.fileId + (file && file.name ? ' (' + file.name + ')' : ''));
        if (output) output.value = data && data.text ? data.text : '';
        State.upsertCandidate({ id: data.fileId || '', name: data.name || file.name || 'Unnamed', email: data.email || '', blurb: data.blurb || '', text: data.text || '', pdfUrl: data.pdfUrl || '' });
        State.setLastFileId(data.fileId || '');
        Sidebar.renderAllResumesList();
        // Ensure preview points at the server version if available
        Preview.showPdf(file, data);
        // Kick off summary and red flags using forced fileId (dev) or returned id
        var forced = (window.Config && window.Config.FORCED_FILE_ID) ? window.Config.FORCED_FILE_ID : null;
        var useId = forced || data.fileId;
        triggerRightSideFetches(useId, data.text);
      })
      .catch(function(err){ var message = 'Upload failed'; try{ if (err && err.error && err.error.message) message = err.error.message; } catch(_){} setStatus(message); });
  }

  function triggerRightSideFetches(fileId, fallbackText){
    var jobTitleEl = document.getElementById('job-title');
    var jobTitleVal = jobTitleEl ? jobTitleEl.value : undefined;
    var summaryBox = document.getElementById('all-summary');
    var redflagsBox = document.getElementById('all-redflags');
    if (summaryBox) summaryBox.value = '';
    if (redflagsBox) redflagsBox.value = '';

    if (fileId) {
      Api.summarize({ fileId: fileId, jobTitle: jobTitleVal }).then(function(r){ if (summaryBox) summaryBox.value = formatSummaryResponse(r); });
      Api.redflags({ fileId: fileId }).then(function(r){ if (redflagsBox) redflagsBox.value = formatRedflagsResponse(r); });
    } else if (fallbackText) {
      Api.summarize({ text: fallbackText, jobTitle: jobTitleVal }).then(function(r){ if (summaryBox) summaryBox.value = formatSummaryResponse(r); });
      Api.redflags({ text: fallbackText }).then(function(r){ if (redflagsBox) redflagsBox.value = formatRedflagsResponse(r); });
    }
  }

  function formatRedflagsResponse(resp){
    try {
      if (resp && Array.isArray(resp.items)) {
        if (resp.items.length === 0) return 'No major red flags';
        return resp.items.map(function(it){
          var title = it && it.title ? it.title : '';
          var desc = it && it.description ? it.description : '';
          if (title && desc) return '- ' + title + ': ' + desc;
          return '- ' + (title || desc || '');
        }).join('\n');
      }
      if (resp && typeof resp.text === 'string') return resp.text; // backward compat
    } catch (_) {}
    return '';
  }

  function formatSummaryResponse(resp){
    // New structured format per README. Fallback to legacy text if present.
    try {
      if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
        if (typeof resp.text === 'string') return resp.text; // legacy support

        var lines = [];
        var years = typeof resp.yearsExperience === 'number' ? resp.yearsExperience : undefined;
        var jobsCount = typeof resp.jobsCount === 'number' ? resp.jobsCount : undefined;
        if (years != null || jobsCount != null) {
          var parts = [];
          if (years != null) parts.push(years + ' yrs exp');
          if (jobsCount != null) parts.push(jobsCount + ' roles');
          lines.push('Experience: ' + parts.join(', '));
        }

        if (Array.isArray(resp.companies) && resp.companies.length) {
          lines.push('Companies: ' + resp.companies.slice(0, 5).join(', '));
        }

        if (Array.isArray(resp.roles) && resp.roles.length) {
          lines.push('Roles: ' + resp.roles.slice(0, 5).join(', '));
        }

        if (Array.isArray(resp.education) && resp.education.length) {
          var e = resp.education[0] || {};
          var edu = [e.degree, e.field, e.institution, e.year].filter(Boolean).join(', ');
          if (edu) lines.push('Education: ' + edu);
        }

        if (Array.isArray(resp.hardSkills) && resp.hardSkills.length) {
          lines.push('Hard skills: ' + resp.hardSkills.slice(0, 8).join(', '));
        }

        if (!lines.length && Array.isArray(resp.softSkills) && resp.softSkills.length) {
          lines.push('Soft skills: ' + resp.softSkills.slice(0, 8).join(', '));
        }

        // Ensure roughly 5 lines; trim if overly long
        return lines.slice(0, 5).join('\n');
      }
    } catch (_) {}
    return '';
  }

  window.Uploader = { init: initUploader };
})();


