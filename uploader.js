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

  function handleFiles(files){ if (!files || !files.length) return; var f = files[0]; if (f.size > 10*1024*1024) { setStatus('File exceeds 10MB.'); return; } upload(f); }

  function upload(file){
    setStatus('Uploading…');
    if (output) output.value = '';
    Api.uploadFile(file)
      .then(function(data){
        setStatus('Uploaded successfully. fileId: ' + data.fileId + (file && file.name ? ' (' + file.name + ')' : ''));
        if (output) output.value = data && data.text ? data.text : '';
        State.upsertCandidate({ id: data.fileId || '', name: data.name || file.name || 'Unnamed', email: data.email || '', blurb: data.blurb || '', text: data.text || '', pdfUrl: data.pdfUrl || '' });
        State.setLastFileId(data.fileId || '');
        Sidebar.renderAllResumesList();
        // In the current layout we use the left drop zone instead of preview embed
        // If we later want to show PDF, call: Preview.showPdf(file, data);
      })
      .catch(function(err){ var message = 'Upload failed'; try{ if (err && err.error && err.error.message) message = err.error.message; } catch(_){} setStatus(message); });
  }

  window.Uploader = { init: initUploader };
})();


