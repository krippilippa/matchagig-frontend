(function () {
  'use strict';

  var API_BASE = 'http://localhost:8787';

  function uploadFile(file) {
    var formData = new FormData();
    formData.append('file', file);
    return fetch(API_BASE + '/v1/upload', { method: 'POST', body: formData })
      .then(function (res) { if (!res.ok) return res.json().then(function (j){ throw j; }); return res.json(); });
  }

  function getOverview(resumeId) {
    return fetch(API_BASE + '/v1/overview', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ resumeId: resumeId })
    }).then(function (res) { if (!res.ok) return res.json().then(function (j){ throw j; }); return res.json(); });
  }

  function getAvailableResumeIds() {
    return fetch(API_BASE + '/v1/resumes', { method: 'GET' })
      .then(function (res) { 
        if (!res.ok) {
          // If the endpoint doesn't exist, return empty array
          if (res.status === 404) return { resumeIds: [] };
          return res.json().then(function (j){ throw j; }); 
        }
        return res.json(); 
      })
      .catch(function(err) {
        // Return empty array if endpoint doesn't exist
        console.log('Available resumes endpoint not found, using empty list');
        return { resumeIds: [] };
      });
  }

  window.Api = { uploadFile: uploadFile, getOverview: getOverview, getAvailableResumeIds: getAvailableResumeIds };
})();


