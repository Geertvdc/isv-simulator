if (new URLSearchParams(window.location.search).has('studies')) {
  void import('./studies');
} else {
  void import('./kitSheet');
}
