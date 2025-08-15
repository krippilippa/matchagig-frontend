// Simple persistent state helpers
(function () {
  'use strict';

  function getCandidates() {
    try {
      var stored = JSON.parse(localStorage.getItem('candidates') || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch (_) { return []; }
  }

  function upsertCandidate(candidate) {
    var list = getCandidates();
    var idx = list.findIndex(function (c) { return c.id === candidate.id; });
    if (idx >= 0) list[idx] = candidate; else list.push(candidate);
    localStorage.setItem('candidates', JSON.stringify(list));
  }

  function setLastResumeId(id) { try { localStorage.setItem('lastResumeId', id || ''); } catch (_) {} }
  function getLastResumeId() { try { return localStorage.getItem('lastResumeId') || ''; } catch (_) { return ''; } }

  window.State = {
    getCandidates: getCandidates,
    upsertCandidate: upsertCandidate,
    setLastResumeId: setLastResumeId,
    getLastResumeId: getLastResumeId,
  };
})();


