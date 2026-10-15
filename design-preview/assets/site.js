(function () {
  var btn = document.querySelector('.menu-btn');
  var menu = document.getElementById('menu');
  if (!btn || !menu) return;
  var root = document.documentElement;
  function set(open) {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', btn.getAttribute(open ? 'data-close' : 'data-open'));
    root.classList.toggle('menu-open', open);
  }
  btn.addEventListener('click', function () { set(menu.hidden); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); }
  });
  menu.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) set(false);
  });
})();
