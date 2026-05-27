// nav.js — inject shared navigation bar into #nav-root on every page
(function () {
  var PAGES = [
    { label: 'Classic',      href: 'index.html',        mode: 'classic' },
    { label: 'Bomb Mode',    href: 'bomb-mode.html',    mode: 'bomb' },
    { label: '86 Bunnies',   href: '86-bunnies.html',   mode: '86bunnies' },
    { label: 'Hare Line',    href: 'hare-line.html',    mode: 'hareline' },
    { label: 'Shroom Mode',  href: 'shroom-mode.html',  mode: 'shroom' },
    { label: 'Bunny Hop',    href: 'bunny-hop.html',    mode: 'bunnyhop' },
    { label: 'Cabbage Drop', href: 'cabbage-drop.html', mode: 'cabbagdrop' },
    { label: 'HexFlip',      href: 'hexflip.html',      mode: 'hexflip' },
  ];

  // Determine active page from the URL pathname
  var filename = window.location.pathname.split('/').pop() || '';
  var activeMode = 'classic'; // default: root or index.html = Classic
  for (var i = 0; i < PAGES.length; i++) {
    var p = PAGES[i];
    if (filename === p.href || filename === p.href.replace('.html', '')) {
      activeMode = p.mode;
      break;
    }
  }

  // Build nav HTML and inject into #nav-root, then re-id it to #mode-tabs
  var root = document.getElementById('nav-root');
  if (!root) return;

  var html = '';
  for (var j = 0; j < PAGES.length; j++) {
    var pg = PAGES[j];
    var cls = 'mode-tab' + (pg.mode === activeMode ? ' active' : '');
    html += '<a class="' + cls + '" data-mode="' + pg.mode + '" href="' + pg.href + '">' + pg.label + '</a>';
  }
  root.innerHTML = html;
  root.id = 'mode-tabs';

  // Scroll the active tab into center view
  var activeEl = root.querySelector('.mode-tab.active');
  if (activeEl) {
    requestAnimationFrame(function () {
      activeEl.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' });
    });
  }
})();
