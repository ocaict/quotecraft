(function () {
  document.querySelectorAll('#nav a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.QuoteCraftUtils.goToPage(link.dataset.page);
    });
  });
})();