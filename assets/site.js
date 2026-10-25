(function () {
  'use strict';
  var d = document;

  // Home ledger: choose a category on the side and its law shows beside it.
  // On a narrow screen the same list starts closed and opens one category at a time.
  d.querySelectorAll('[data-picker]').forEach(function (root) {
    var buttons = Array.prototype.slice.call(root.querySelectorAll('.pk'));
    function wide() { return getComputedStyle(root).gridTemplateColumns.split(' ').length > 1; }
    function panel(b) { return d.getElementById(b.getAttribute('aria-controls')); }
    function show(index, toggle) {
      buttons.forEach(function (b, i) {
        var open = i === index && !(toggle && b.getAttribute('aria-expanded') === 'true');
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        panel(b).hidden = !open;
      });
    }
    buttons.forEach(function (b, i) {
      b.addEventListener('click', function () {
        if (wide()) { show(i); return; }
        show(i, true);
        // Closing the category above moves this one up; keep it on screen.
        if (b.getAttribute('aria-expanded') === 'true') b.scrollIntoView({ block: 'nearest' });
      });
      b.addEventListener('keydown', function (e) {
        var to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        var next = buttons[(to + buttons.length) % buttons.length];
        next.focus();
        if (wide()) show(buttons.indexOf(next));
      });
    });
    show(wide() ? 0 : -1);
    root.setAttribute('data-ready', '');
    window.addEventListener('resize', function () {
      if (wide() && !buttons.some(function (b) { return b.getAttribute('aria-expanded') === 'true'; })) show(0);
    });
  });

  // Annotated article: the list of definitions in the sidebar follows the one in view.
  var terms = Array.prototype.slice.call(d.querySelectorAll('.side-nav .terms a'));
  var defs = terms.map(function (a) { return d.getElementById(a.hash.slice(1)); });
  if (terms.length && defs.every(Boolean)) {
    // The definition being read is the last one whose top has reached the top of the screen.
    var spy = function () {
      if (!terms[0].offsetParent) return;
      var current = 0;
      defs.forEach(function (el, i) { if (el.getBoundingClientRect().top <= 96) current = i; });
      terms.forEach(function (a, i) { a.classList.toggle('on', i === current); });
    };
    var queued = false;
    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; spy(); });
    }, { passive: true });
    window.addEventListener('load', spy);
    spy();
  }

  // Copy a citation, share a page.
  d.querySelectorAll('[data-copy]').forEach(function (b) {
    var source = d.getElementById(b.getAttribute('data-copy'));
    if (!source || !navigator.clipboard) return;
    var label = b.querySelector('span');
    var idle = label.textContent;
    b.hidden = false;
    b.addEventListener('click', function () {
      navigator.clipboard.writeText(source.textContent.replace(/\s+/g, ' ').trim()).then(function () {
        label.textContent = b.getAttribute('data-done');
        b.classList.add('done');
        setTimeout(function () { label.textContent = idle; b.classList.remove('done'); }, 1800);
      });
    });
  });
  var canonical = d.querySelector('link[rel="canonical"]');
  d.querySelectorAll('[data-share]').forEach(function (b) {
    if (!navigator.share) return;
    b.hidden = false;
    b.addEventListener('click', function () {
      navigator.share({ title: d.title, url: canonical ? canonical.href : location.href }).catch(function () {});
    });
  });

  // Old links to a record on the register page open the record's own page.
  if (d.querySelector('main.register') && /^#ACB-\d{4}-\d{3}$/.test(location.hash)) {
    location.replace(location.pathname + location.hash.slice(1) + '/');
  }

  // The site as an app: saved for reading offline, and installable where the browser allows it.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
  var installers = d.querySelectorAll('.install');
  var offer = null;
  function offerInstall(on) { installers.forEach(function (b) { b.hidden = !on; }); }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    offer = e;
    offerInstall(true);
  });
  installers.forEach(function (b) {
    b.addEventListener('click', function () {
      if (!offer) return;
      offer.prompt();
      offer.userChoice.then(function () { offer = null; offerInstall(false); });
    });
  });
  window.addEventListener('appinstalled', function () { offer = null; offerInstall(false); });
})();
