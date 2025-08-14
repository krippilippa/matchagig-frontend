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
    // Structured containers
    var infoContainer = document.getElementById('general-info');
    var flagsContainer = document.getElementById('redflags-list');
    if (infoContainer) infoContainer.innerHTML = '';
    if (flagsContainer) flagsContainer.innerHTML = '';

    if (fileId) {
      Api.summarize({ fileId: fileId, jobTitle: jobTitleVal }).then(function(r){ renderSummary(infoContainer, r); });
      Api.redflags({ fileId: fileId }).then(function(r){ renderRedflags(flagsContainer, r); });
    } else if (fallbackText) {
      Api.summarize({ text: fallbackText, jobTitle: jobTitleVal }).then(function(r){ renderSummary(infoContainer, r); });
      Api.redflags({ text: fallbackText }).then(function(r){ renderRedflags(flagsContainer, r); });
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
          lines.push('Companies: ' + resp.companies.join(', '));
        }

        if (Array.isArray(resp.roles) && resp.roles.length) {
          lines.push('Roles: ' + resp.roles.join(', '));
        }

        if (Array.isArray(resp.education) && resp.education.length) {
          resp.education.forEach(function(e){
            var edu = [e.degree, e.field, e.institution, e.year].filter(Boolean).join(', ');
            if (edu) lines.push('Education: ' + edu);
          });
        }

        if (Array.isArray(resp.hardSkills) && resp.hardSkills.length) {
          lines.push('Hard skills: ' + resp.hardSkills.join(', '));
        }

        if (Array.isArray(resp.softSkills) && resp.softSkills.length) {
          lines.push('Soft skills: ' + resp.softSkills.join(', '));
        }

        return lines.join('\n');
      }
    } catch (_) {}
    return '';
  }

  function renderSummary(container, resp){
    if (!container) return;
    var text = formatSummaryResponse(resp);
    if (text) {
      // If legacy text, show as a single paragraph
      var p = document.createElement('div');
      p.textContent = text;
      container.appendChild(p);
      return;
    }
    try {
      if (!resp || typeof resp !== 'object') return;
      function item(key, value) {
        var wrap = document.createElement('div'); wrap.className = 'info-item';
        var k = document.createElement('div'); k.className = 'info-key'; k.textContent = key;
        var v = document.createElement('div'); v.textContent = value;
        wrap.appendChild(k); wrap.appendChild(v); container.appendChild(wrap);
      }
      var years = typeof resp.yearsExperience === 'number' ? resp.yearsExperience + ' years' : '';
      var rolesCount = typeof resp.jobsCount === 'number' ? resp.jobsCount + ' roles' : '';
      var exp = [years, rolesCount].filter(Boolean).join(', ');
      if (exp) item('Experience', exp);

      if (Array.isArray(resp.companies) && resp.companies.length) item('Companies', resp.companies.join(', '));
      if (Array.isArray(resp.roles) && resp.roles.length) item('Roles', resp.roles.join(', '));

      if (Array.isArray(resp.education) && resp.education.length) {
        resp.education.forEach(function(e){
          var edu = [e.degree, e.field, e.institution, e.year].filter(Boolean).join(', ');
          if (edu) item('Education', edu);
        });
      }

      if (Array.isArray(resp.hardSkills) && resp.hardSkills.length) item('Hard skills', resp.hardSkills.join(', '));
      if (Array.isArray(resp.softSkills) && resp.softSkills.length) item('Soft skills', resp.softSkills.join(', '));
    } catch (_) {}
  }

  function renderRedflags(container, resp){
    if (!container) return;
    try {
      if (resp && Array.isArray(resp.items)) {
        if (resp.items.length === 0) {
          var ok = document.createElement('div'); ok.className = 'flag'; ok.textContent = 'No major red flags'; container.appendChild(ok); return;
        }
        resp.items.forEach(function(it){
          var box = document.createElement('div'); box.className = 'flag';
          var title = it && it.title ? it.title : '';
          var desc = it && it.description ? it.description : '';
          var t = document.createElement('div'); t.className = 'flag-title'; t.textContent = title;
          var d = document.createElement('div'); d.textContent = desc;
          if (title) box.appendChild(t);
          if (desc) box.appendChild(d);
          container.appendChild(box);
        });
        return;
      }
      var text = formatRedflagsResponse(resp);
      if (text) { var b = document.createElement('div'); b.className = 'flag'; b.textContent = text; container.appendChild(b); }
    } catch (_) {}
  }

  window.Uploader = { init: initUploader };
})();


