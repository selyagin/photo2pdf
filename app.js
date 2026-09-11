// Temporary emergency recovery loader.
(async () => {
  const url = 'https://raw.githubusercontent.com/selyagin/photo2pdf/fix/searchable-pdf-ocr/app.js';
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not restore application source: ' + response.status);
  const source = await response.text();
  (0, eval)(source);
})().catch((error) => console.error('Emergency app restore failed:', error));
