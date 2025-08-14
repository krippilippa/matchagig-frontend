(function () {
  'use strict';

  function setView(view){
    var sectionHeader = document.getElementById('section-header');
    var sectionOutput = document.getElementById('section-output');
    var sectionSummary = document.getElementById('section-summary');
    var sectionRedflags = document.getElementById('section-redflags');
    var sectionAllResumes = document.getElementById('section-allresumes');
    if (view === 'all') {
      sectionHeader.hidden = true;
      sectionOutput.hidden = true;
      sectionSummary.hidden = false; // show right-side placeholders
      sectionRedflags.hidden = false; // show right-side placeholders
      sectionAllResumes.hidden = false;
    } else {
      sectionHeader.hidden = false;
      sectionOutput.hidden = false;
      sectionSummary.hidden = false;
      sectionRedflags.hidden = false;
      sectionAllResumes.hidden = true;
    }
  }

  function setSelectedResume(id){
    // For now, only ensure left PDF remains; right boxes are placeholders
    // In future steps we’ll fill summary/redflags by calling APIs
  }

  window.Main = { setView: setView, setSelectedResume: setSelectedResume };

  // Boot
  Sidebar.load().then(function(){
    Uploader.init();
    Main.setView('all');
  });
})();


