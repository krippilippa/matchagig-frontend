/*
  MatchaGig — minimal vanilla uploader
  - Drag/drop or select a PDF/DOCX/TXT
  - Uploads to backend /v1/upload
  - Shows cleaned text response in textarea
*/

(function () {
  'use strict';

  var API_BASE = 'http://localhost:8787';
  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var chooseBtn = document.getElementById('choose-file-btn');
  var output = document.getElementById('output-text');
  var statusText = document.getElementById('status-text');
  var jobTitleInput = document.getElementById('job-title');
  var summaryStatus = document.getElementById('summary-status');
  var summaryOut = document.getElementById('summary-text');
  var btnSummaryFileId = document.getElementById('btn-summary-fileid');
  var btnSummaryText = document.getElementById('btn-summary-text');
  var redflagsStatus = document.getElementById('redflags-status');
  var redflagsOut = document.getElementById('redflags-text');
  var btnRedflagsFileId = document.getElementById('btn-redflags-fileid');
  var btnRedflagsText = document.getElementById('btn-redflags-text');

  function setStatus(message) {
    statusText.textContent = message || '';
  }

  function isSupportedFile(file) {
    if (!file) return false;
    var name = (file.name || '').toLowerCase();
    var type = (file.type || '').toLowerCase();
    var isPdf = type === 'application/pdf' || name.endsWith('.pdf');
    var isDocx = type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx');
    var isTxt = type === 'text/plain' || name.endsWith('.txt');
    return isPdf || isDocx || isTxt;
  }

  function handleFiles(files) {
    if (!files || !files.length) return;
    var file = files[0];
    if (!isSupportedFile(file)) {
      setStatus('Unsupported file type. Use PDF, DOCX, or TXT.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus('File exceeds 10MB.');
      return;
    }
    upload(file);
  }

  function upload(file) {
    setStatus('Uploading…');
    output.value = '';

    var formData = new FormData();
    formData.append('file', file);

    fetch(API_BASE + '/v1/upload', {
      method: 'POST',
      body: formData,
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (j) { throw j; });
        return res.json();
      })
      .then(function (data) {
        // Expected shape: { fileId, text, sections: [...] }
        setStatus('Uploaded successfully. fileId: ' + data.fileId);
        output.value = data && data.text ? data.text : '';
        // Store fileId for potential future queries
        try { localStorage.setItem('lastFileId', data.fileId || ''); } catch (_) {}
      })
      .catch(function (err) {
        var message = 'Upload failed';
        try {
          if (err && err.error && err.error.message) message = err.error.message;
        } catch (_) {}
        setStatus(message);
      });
  }

  function summarizeUsingFileId() {
    var fileId = '';
    try { fileId = localStorage.getItem('lastFileId') || ''; } catch (_) {}
    if (!fileId) {
      summaryStatus.textContent = 'No stored fileId found. Upload a file first.';
      return;
    }
    summarize({ fileId: fileId, jobTitle: jobTitleInput.value || undefined });
  }

  function summarizeUsingText() {
    var text = output.value || '';
    if (!text) {
      summaryStatus.textContent = 'No text available. Upload a file first.';
      return;
    }
    summarize({ text: text, jobTitle: jobTitleInput.value || undefined });
  }

  function summarize(payload) {
    summaryStatus.textContent = 'Summarizing…';
    summaryOut.value = '';
    fetch(API_BASE + '/v1/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (j) { throw j; });
        return res.json();
      })
      .then(function (data) {
        summaryStatus.textContent = 'OK';
        summaryOut.value = data && data.text ? data.text : '';
      })
      .catch(function (err) {
        var message = 'Summary failed';
        try { if (err && err.error && err.error.message) message = err.error.message; } catch (_) {}
        summaryStatus.textContent = message;
      });
  }

  function redflagsUsingFileId() {
    var fileId = '';
    try { fileId = localStorage.getItem('lastFileId') || ''; } catch (_) {}
    if (!fileId) {
      redflagsStatus.textContent = 'No stored fileId found. Upload a file first.';
      return;
    }
    redflags({ fileId: fileId });
  }

  function redflagsUsingText() {
    var text = output.value || '';
    if (!text) {
      redflagsStatus.textContent = 'No text available. Upload a file first.';
      return;
    }
    redflags({ text: text });
  }

  function redflags(payload) {
    redflagsStatus.textContent = 'Scanning…';
    redflagsOut.value = '';
    fetch(API_BASE + '/v1/redflags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (j) { throw j; });
        return res.json();
      })
      .then(function (data) {
        redflagsStatus.textContent = 'OK';
        redflagsOut.value = data && data.text ? data.text : '';
      })
      .catch(function (err) {
        var message = 'Red flags failed';
        try { if (err && err.error && err.error.message) message = err.error.message; } catch (_) {}
        redflagsStatus.textContent = message;
      });
  }

  // Drag and drop events
  ['dragenter', 'dragover'].forEach(function (evtName) {
    dropZone.addEventListener(evtName, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(function (evtName) {
    dropZone.addEventListener(evtName, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', function (e) {
    var dt = e.dataTransfer;
    var files = dt && dt.files ? dt.files : [];
    handleFiles(files);
  });

  // Click to select
  dropZone.addEventListener('click', function () { fileInput.click(); });
  chooseBtn.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function (e) { handleFiles(e.target.files); });

  // Summary buttons
  btnSummaryFileId.addEventListener('click', summarizeUsingFileId);
  btnSummaryText.addEventListener('click', summarizeUsingText);
  btnRedflagsFileId.addEventListener('click', redflagsUsingFileId);
  btnRedflagsText.addEventListener('click', redflagsUsingText);
})();


