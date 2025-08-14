(function () {
  'use strict';

  var API_BASE = 'http://localhost:8787';

  function uploadFile(file) {
    var formData = new FormData();
    formData.append('file', file);
    return fetch(API_BASE + '/v1/upload', { method: 'POST', body: formData })
      .then(function (res) { if (!res.ok) return res.json().then(function (j){ throw j; }); return res.json(); });
  }

  function summarize(payload) {
    return fetch(API_BASE + '/v1/summary', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(function (res) { if (!res.ok) return res.json().then(function (j){ throw j; }); return res.json(); });
  }

  function redflags(payload) {
    return fetch(API_BASE + '/v1/redflags', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(function (res) { if (!res.ok) return res.json().then(function (j){ throw j; }); return res.json(); });
  }

  window.Api = { uploadFile: uploadFile, summarize: summarize, redflags: redflags };
})();


