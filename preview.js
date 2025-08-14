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

  function replaceDropzoneWithPdf(file, serverData) {
    var leftCol = document.querySelector('.left-col');
    if (!leftCol) return;

    var drop = document.getElementById('drop-zone');
    if (drop && drop.parentNode) {
      drop.parentNode.removeChild(drop);
    }
    var status = document.getElementById('status-text');
    if (status && status.parentNode) {
      // Keep status if desired; for now remove to maximize preview space
      status.parentNode.removeChild(status);
    }

    var embed = document.getElementById('pdf-embed');
    if (!embed) {
      embed = document.createElement('embed');
      embed.id = 'pdf-embed';
      embed.type = 'application/pdf';
      embed.style.width = '100%';
      embed.style.height = '85vh';
      leftCol.insertBefore(embed, leftCol.firstChild);
    }
    showPdf(file, serverData);
  }

  window.Preview = { showPdf: showPdf, replaceDropzoneWithPdf: replaceDropzoneWithPdf };
})();


