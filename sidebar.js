(function () {
  'use strict';

  function load() {
    return fetch('sidebar.html').then(function(res){ return res.text(); }).then(function(html){
      var el = document.getElementById('sidebar');
      el.innerHTML = html;
      wire();
      renderAllResumesList();
    });
  }

  function wire() {
    var allBtn = document.getElementById('btn-all-resumes');
    if (allBtn) allBtn.addEventListener('click', function(){ renderAllResumesList(); });
    var container = document.getElementById('sidebar-content');
    if (!container) return;
    container.addEventListener('click', function(e){
      var t = e.target; if (t && t.classList.contains('resume-link')) { /* placeholder for future selection */ }
    });
  }

  function renderAllResumesList() {
    var container = document.getElementById('sidebar-content');
    if (!container) return;
    container.innerHTML = '';
    var list = document.createElement('ul'); list.className = 'resume-list';
    var candidates = State.getCandidates();
    candidates.forEach(function(c){
      var li = document.createElement('li');
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'resume-link';
      btn.textContent = c.name || 'Unnamed'; 
      btn.title = c.email || c.phone || 'Resume'; // Use email or phone as tooltip instead of blurb
      btn.setAttribute('data-resume-id', c.id);
      li.appendChild(btn); list.appendChild(li);
    });
    container.appendChild(list);
  }

  function clearRightPanel() {
    var right = document.getElementById('allresumes-right');
    if (right) right.innerHTML = document.getElementById('allresumes-right').innerHTML; // noop to keep boxes
  }

  window.Sidebar = { load: load, renderAllResumesList: renderAllResumesList, clearRightPanel: clearRightPanel };
})();


