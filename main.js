(function () {
  'use strict';

  // Boot minimal app in All resumes mode only
  Sidebar.load().then(function(){
    var sectionAllResumes = document.getElementById('section-allresumes');
    if (sectionAllResumes) sectionAllResumes.hidden = false;
    Uploader.init();
  });
})();


