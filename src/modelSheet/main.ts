if (new URLSearchParams(window.location.search).has('cast')) {
  void import('./cast');
} else if (new URLSearchParams(window.location.search).has('studies')) {
  void import('./studies');
} else {
  void import('./kitSheet');
}
