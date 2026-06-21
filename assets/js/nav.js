// nav.js — inject shared navigation bar into #nav-root on every page
(function () {
  // Active-tab detection — only the four tabbed destinations get active state.
  // index.html and all game pages not listed below return null (no active tab).
  var PAGE_MODES = {
    'classic.html': 'classic',
    'classic':      'classic',
    'cubrick.html': 'cubrick',
    'cubrick':      'cubrick',
    'hexflip.html': 'hexflip',
    'hexflip':      'hexflip',
    'cropped.html': 'cropped',
    'cropped':      'cropped'
  };

  var filename   = window.location.pathname.split('/').pop() || '';
  var activeMode = PAGE_MODES[filename] || null;

  var root = document.getElementById('nav-root');
  if (!root) return;

  var html = '';

  // Home — never active (index.html has no active tab)
  html += '<a class="mode-tab" data-mode="home" href="index.html">Home</a>';

  // All Games — never active (same destination, different mental model)
  html += '<a class="mode-tab" data-mode="allgames" href="index.html">All Games</a>';

  // "Popular Games →" separator
  html += '<span class="tab-separator">Popular Games →</span>';

  // Bunny Game — links to classic.html, active on classic.html
  var bgCls = 'mode-tab' + (activeMode === 'classic' ? ' active' : '');
  html += '<a class="' + bgCls + '" data-mode="classic" href="classic.html">'
        + '<img class="tab-logo tab-logo--bunnygame" src="/Icons/BunnyGameLogo.svg" alt="Bunny Game">'
        + '</a>';

  // NOON external tab — inlined SVG so CSS can override fill
  html += '<a class="mode-tab" data-mode="noon" href="https://www.noonwords.com" target="_blank" rel="noopener noreferrer">'
        + '<span class="tab-logo--noon">'
        + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="151 240 396 112" height="20">'
        + '<path d="M215.411,245.198h23.371v101.505h-25.307l-33.189-59.188v59.188h-23.371v-101.229h25.445l33.051,59.05v-59.327Z"/>'
        + '<path d="M347.337,295.812c0,28.073-22.818,50.752-50.891,50.752s-50.752-22.68-50.752-50.752,22.68-50.753,50.752-50.753,50.891,22.68,50.891,50.753Z"/>'
        + '<path d="M452.294,295.812c0,28.073-22.818,50.752-50.891,50.752s-50.753-22.68-50.753-50.752,22.68-50.753,50.753-50.753,50.891,22.68,50.891,50.753Z"/>'
        + '<path d="M517.701,245.198h23.371v101.505h-25.307l-33.19-59.188v59.188h-23.371v-101.229h25.446l33.051,59.05v-59.327Z"/>'
        + '</svg>'
        + '</span>'
        + '</a>';

  // Cubrick tab — logo image
  var cubrickCls = 'mode-tab' + (activeMode === 'cubrick' ? ' active' : '');
  html += '<a class="' + cubrickCls + '" data-mode="cubrick" href="cubrick.html">'
        + '<img class="tab-logo" src="/assets/logos/cubrick_logo.svg" alt="Cubrick">'
        + '</a>';

  // HexFlip tab — logo image
  var hfCls = 'mode-tab' + (activeMode === 'hexflip' ? ' active' : '');
  html += '<a class="' + hfCls + '" data-mode="hexflip" href="hexflip.html">'
        + '<img class="tab-logo" src="/assets/logos/Hexflip_Logo.svg" alt="HexFlip">'
        + '</a>';

  // Cropped tab — logo image
  var crCls = 'mode-tab' + (activeMode === 'cropped' ? ' active' : '');
  html += '<a class="' + crCls + '" data-mode="cropped" href="cropped.html">'
        + '<img class="tab-logo" src="/assets/logos/cropped_logo.svg" alt="Cropped">'
        + '</a>';

  root.innerHTML = html;
  root.id = 'mode-tabs';

  // Make the header logo a link to the lobby on every page
  var h1 = document.querySelector('#header h1');
  if (h1 && !h1.querySelector('a')) {
    var logoImg = h1.querySelector('img');
    if (logoImg) {
      var logoLink = document.createElement('a');
      logoLink.href = 'index.html';
      logoLink.style.cssText = 'display:block;line-height:0;';
      h1.insertBefore(logoLink, logoImg);
      logoLink.appendChild(logoImg);
    }
  }

  // Scroll the active tab into center view
  var activeEl = root.querySelector('.mode-tab.active');
  if (activeEl) {
    requestAnimationFrame(function () {
      activeEl.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' });
    });
  }
})();
