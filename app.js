// Emergency compatibility loader: load the known-good application as a classic script.
(() => {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/gh/selyagin/photo2pdf@48db663d1f79c1e15736584a7015aa7bd7fa3a1d/app.js';
  script.onerror = () => console.error('Could not load the application source.');
  document.head.appendChild(script);
})();
