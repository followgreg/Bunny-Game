// shared.js — directions popup and share utilities used by every game page

// --------------------------------------------------------------------------
// Directions popup
// Call openDirections(text) from each game's JS to show the how-to-play modal.
// --------------------------------------------------------------------------
function openDirections(text) {
  var el = document.getElementById('directions-text');
  if (el) el.textContent = text;
  var overlay = document.getElementById('directions-overlay');
  if (overlay) overlay.classList.remove('hidden');
  var modal = overlay && overlay.querySelector('.directions-modal');
  if (modal) {
    if (document.body.dataset.tab === 'cubrick') {
      modal.classList.add('popup--cubrick');
    } else {
      modal.classList.remove('popup--cubrick');
    }
  }
}

(function () {
  var btn = document.getElementById('dir-close-btn');
  if (btn) {
    btn.addEventListener('click', function () {
      var overlay = document.getElementById('directions-overlay');
      if (overlay) overlay.classList.add('hidden');
      var modal = overlay && overlay.querySelector('.directions-modal');
      if (modal) modal.classList.remove('popup--cubrick');
    });
  }
})();

// --------------------------------------------------------------------------
// Share / copy-to-clipboard
// Call shareText(text, title) from each game's JS.
// --------------------------------------------------------------------------
function shareText(text, title) {
  if (navigator.share) {
    navigator.share({ title: title || 'Bunny Game', text: text });
  } else {
    navigator.clipboard.writeText(text).then(function () {
      var btn = document.getElementById('share-btn');
      if (!btn) return;
      var orig = btn.textContent;
      btn.textContent = '✓ Copied to clipboard';
      setTimeout(function () { btn.textContent = orig; }, 2500);
    });
  }
}
