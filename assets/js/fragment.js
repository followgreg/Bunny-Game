// fragment.js — Fragment 3D polycube puzzle
// Part 2: page scaffold — directions wiring only, no canvas rendering yet.

// Directions text — full copy provided in Part 5, placeholder for now.
var FRAGMENT_DIRECTIONS = 'Fragment is a 3D assembly puzzle. Your goal is to fill the cube completely using all eight pieces. Each piece is a unique three-dimensional shape that spans multiple layers of the cube. Select a piece from the tray, choose which layer to place it on using the dots on the left, then tap a cell on the cube to place it. Pieces anchor at the cell you tap and extend through the cube according to their shape. If a piece does not fit where you tapped, try a different cell or a different layer. Use undo to take back your last placement. Use reset to start the puzzle over. There is no time limit. Your score is how many moves it took to fill the cube. Every puzzle is different. The satisfaction is in the solve.';

document.getElementById('help-btn').addEventListener('click', function () {
  openDirections(FRAGMENT_DIRECTIONS);
});

document.getElementById('new-btn').addEventListener('click', function () {
  // Implemented in Part 3+
});

// Show directions automatically on first page load each session.
openDirections(FRAGMENT_DIRECTIONS);
