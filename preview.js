(function () {
  'use strict';

  function showPdf(file, serverData) {
    var embed = document.getElementById('pdf-embed');
    if (!embed) return;
    if (file && /\.pdf$/i.test(file.name)) {
      try { embed.src = URL.createObjectURL(file); } catch (_) {}
      return;
    }
    if (serverData && serverData.pdfUrl) embed.src = serverData.pdfUrl;
  }

  window.Preview = { showPdf: showPdf };
})();


