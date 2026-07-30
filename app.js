
// ===================== Densel Pro — app.js (v3.0) =====================
// Fully offline document toolkit: merge (photo/PDF/Word -> PDF), OCR, PDF -> JPEG

let selectedFiles = [];
let idCounter = 0;
let dragSrcIndex = null;
let lastOcrText = '';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileListEl = document.getElementById('fileList');
const buildBtn = document.getElementById('buildBtn');
const progressWrap = document.getElementById('progressWrap');
const barFill = document.getElementById('barFill');
const statusText = document.getElementById('statusText');
const statusLog = document.getElementById('statusLog');
const unicornBtn = document.getElementById('unicornBtn');
const resultsContainer = document.getElementById('resultsContainer');
const targetSizeSlider = document.getElementById('targetSizeSlider');
const sizeValueDisplay = document.getElementById('sizeValueDisplay');
const docTitleInput = document.getElementById('docTitle');
const bwModeCb = document.getElementById('bwMode');
const stampModeCb = document.getElementById('stampMode');
const ocrModeCb = document.getElementById('ocrMode');
const batchNote = document.getElementById('batchNote');
const warnNote = document.getElementById('warnNote');
const ocrResultCard = document.getElementById('ocrResultCard');
const ocrResultText = document.getElementById('ocrResultText');
const copyOcrBtn = document.getElementById('copyOcrBtn');
const downloadOcrBtn = document.getElementById('downloadOcrBtn');
const uiLangSelect = document.getElementById('uiLang');
const themeToggle = document.getElementById('themeToggle');

const BATCH_LIMIT = 25;

// ---------- Theme ----------
function initTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = prefersDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
}
themeToggle.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  themeToggle.textContent = next === 'dark' ? '🌙' : '☀️';
});
initTheme();

// ---------- Language ----------
uiLangSelect.addEventListener('change', () => setLang(uiLangSelect.value));
setLang('ru');

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('view-' + tab.dataset.tab).classList.add('active');
  });
});

// ---------- Toggle fix: whole row is clickable, not just the switch ----------
document.querySelectorAll('.opt-row.switch').forEach(row => {
  row.addEventListener('click', (e) => {
    const cb = row.querySelector('input[type=checkbox]');
    if (e.target === cb) return; // native click already toggled it
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
  });
});

// ---------- Free size slider ----------
function updateSizeDisplay() {
  sizeValueDisplay.textContent = `${targetSizeSlider.value} МБ`;
}
targetSizeSlider.addEventListener('input', updateSizeDisplay);
updateSizeDisplay();

// ---------- Unicorn technical panel toggle ----------
unicornBtn.addEventListener('click', () => {
  const visible = statusLog.style.display === 'block';
  statusLog.style.display = visible ? 'none' : 'block';
});

// ---------- Logging ----------
function log(msg, level) {
  console.log('[Densel Pro]', msg);
  if (statusLog) {
    const line = document.createElement('div');
    if (level) line.className = level;
    line.textContent = msg;
    statusLog.appendChild(line);
    statusLog.scrollTop = statusLog.scrollHeight;
  }
}
function setStatus(msg) {
  statusText.textContent = msg;
  log(msg);
}
function showFatalError(err) {
  console.error(err);
  setStatus('Error: ' + (err && err.message ? err.message : String(err)));
  log('BUILD ERROR: ' + (err && err.message ? err.message : String(err)), 'err');
  progressWrap.style.display = 'block';
  barFill.style.background = 'var(--error)';
  buildBtn.disabled = false;
}
window.addEventListener('error', (e) => log('JS error: ' + e.message, 'err'));
window.addEventListener('unhandledrejection', (e) => log('Unhandled: ' + (e.reason && e.reason.message ? e.reason.message : e.reason), 'err'));

// ---------- File input (merge view): accepts images, PDF, Word ----------
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('drag'); handleFiles(e.dataTransfer.files); });
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

function classifyFile(file) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/') || /\.(heic|heif)$/i.test(name)) return 'image';
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx') || name.endsWith('.doc')) return 'word';
  return 'unknown';
}

function handleFiles(fileListInput) {
  const arr = Array.from(fileListInput).filter(f => classifyFile(f) !== 'unknown');
  const skipped = fileListInput.length - arr.length;
  if (skipped > 0) log(`Skipped unsupported files: ${skipped}`, 'warn');
  for (const f of arr) {
    selectedFiles.push({ file: f, id: idCounter++, kind: classifyFile(f), thumbUrl: null, manualRotation: 0, decodeOk: null, pageCount: null });
  }
  renderFileList();
  generateThumbnails();
}


function renderFileList() {
  fileListEl.innerHTML = '';
  selectedFiles.forEach((item, index) => {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.index = index;
    li.dataset.id = item.id;
    const mb = (item.file.size / (1024*1024)).toFixed(1);
    const kindLabel = item.kind === 'pdf' ? 'PDF' : item.kind === 'word' ? 'DOC' : '';
    li.innerHTML = `
      <span class="handle">☰</span>
      <span class="thumb" data-thumb-id="${item.id}">${item.kind === 'image' ? '…' : kindLabel}</span>
      <span class="meta">
        <div class="name">${escapeHtml(item.file.name)}</div>
        <div class="size">${mb} МБ${item.pageCount ? ' · ' + item.pageCount + ' стр.' : ''}</div>
      </span>
      <span class="actions">
        ${item.kind === 'image' ? `<span class="rotate" data-id="${item.id}" title="Rotate">⟳</span>` : ''}
        <span class="rm" data-id="${item.id}" title="Remove">✕</span>
      </span>
    `;
    fileListEl.appendChild(li);
  });

  fileListEl.querySelectorAll('.rm').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.id, 10);
      selectedFiles = selectedFiles.filter(x => x.id !== id);
      renderFileList();
    });
  });
  fileListEl.querySelectorAll('.rotate').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.id, 10);
      const item = selectedFiles.find(x => x.id === id);
      if (item) item.manualRotation = ((item.manualRotation || 0) + 90) % 360;
    });
  });

  setupDragReorder();
  buildBtn.disabled = selectedFiles.length === 0;
  batchNote.style.display = selectedFiles.length > BATCH_LIMIT ? 'block' : 'none';
  updateWarnNote();
}

function updateWarnNote() {
  const failed = selectedFiles.filter(f => f.decodeOk === false);
  if (failed.length > 0) {
    warnNote.style.display = 'block';
    warnNote.textContent = `⚠ ${failed.length} file(s) could not be read and will be skipped.`;
  } else {
    warnNote.style.display = 'none';
  }
}

async function generateThumbnails() {
  for (const item of selectedFiles) {
    if (item.thumbUrl !== null || item.decodeOk === false) continue;
    const el = fileListEl.querySelector(`[data-thumb-id="${item.id}"]`);
    try {
      if (item.kind === 'image') {
        const bitmap = await decodeImageRobust(item.file);
        const canvas = document.createElement('canvas');
        const maxT = 80;
        const scale = Math.min(1, maxT / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        item.thumbUrl = canvas.toDataURL('image/jpeg', 0.6);
        item.decodeOk = true;
        if (el) el.innerHTML = `<img src="${item.thumbUrl}" alt="">`;
        if (bitmap.close) bitmap.close();
      } else if (item.kind === 'pdf') {
        const arrBuf = await item.file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrBuf }).promise;
        item.pageCount = pdfDoc.numPages;
        item.decodeOk = true;
        renderFileList();
      } else if (item.kind === 'word') {
        item.decodeOk = true;
      }
    } catch (err) {
      item.decodeOk = false;
      log(`Thumbnail failed for "${item.file.name}": ${err.message}`, 'warn');
      if (el) el.textContent = '⚠';
      updateWarnNote();
    }
  }
}

function decodeImageRobust(file) {
  return new Promise((resolve, reject) => {
    if (window.createImageBitmap) {
      createImageBitmap(file).then(resolve).catch(() => fallbackImgDecode(file).then(resolve).catch(reject));
    } else {
      fallbackImgDecode(file).then(resolve).catch(reject);
    }
  });
}
function fallbackImgDecode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unsupported format')); };
    img.src = url;
  });
}

function setupDragReorder() {
  const items = fileListEl.querySelectorAll('li');
  items.forEach(li => {
    li.addEventListener('dragstart', () => { dragSrcIndex = parseInt(li.dataset.index, 10); li.classList.add('dragging'); });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', (e) => e.preventDefault());
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetIndex = parseInt(li.dataset.index, 10);
      if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
      const moved = selectedFiles.splice(dragSrcIndex, 1)[0];
      selectedFiles.splice(targetIndex, 0, moved);
      dragSrcIndex = null;
      renderFileList();
      generateThumbnails();
    });
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}


// ---------- Image decode with EXIF orientation ----------
function loadImageWithOrientation(file) {
  return new Promise((resolve, reject) => {
    decodeImageRobust(file).then((imgOrBitmap) => {
      getOrientation(file).then(orientation => resolve({ img: imgOrBitmap, orientation }))
        .catch(() => resolve({ img: imgOrBitmap, orientation: 1 }));
    }).catch((err) => reject(new Error(`Failed to load "${file.name}": ${err.message}`)));
  });
}
function getOrientation(file) {
  return new Promise((resolve) => {
    if (!/jpe?g$/i.test(file.name) && file.type !== 'image/jpeg') return resolve(1);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const view = new DataView(e.target.result);
        if (view.getUint16(0, false) !== 0xFFD8) return resolve(1);
        const length = view.byteLength;
        let offset = 2;
        while (offset < length) {
          const marker = view.getUint16(offset, false);
          offset += 2;
          if (marker === 0xFFE1) {
            if (view.getUint32(offset + 2, false) !== 0x45786966) return resolve(1);
            const little = view.getUint16(offset + 8, false) === 0x4949;
            offset += 10;
            const tags = view.getUint16(offset, little);
            offset += 2;
            for (let i = 0; i < tags; i++) {
              const entryOffset = offset + i * 12;
              if (view.getUint16(entryOffset, little) === 0x0112) return resolve(view.getUint16(entryOffset + 8, little));
            }
          } else if ((marker & 0xFF00) !== 0xFF00) break;
          else offset += view.getUint16(offset, false);
        }
        resolve(1);
      } catch (err) { resolve(1); }
    };
    reader.onerror = () => resolve(1);
    reader.readAsArrayBuffer(file.slice(0, 128 * 1024));
  });
}
function getDims(imgOrBitmap) {
  return { w: imgOrBitmap.naturalWidth || imgOrBitmap.width, h: imgOrBitmap.naturalHeight || imgOrBitmap.height };
}
function drawToCanvas(imgOrBitmap, orientation, maxDim, manualRotation, bwMode) {
  const { w, h } = getDims(imgOrBitmap);
  let scale = 1;
  if (maxDim && Math.max(w, h) > maxDim) scale = maxDim / Math.max(w, h);
  let cw = Math.round(w * scale), ch = Math.round(h * scale);
  const swapDims = orientation >= 5 && orientation <= 8;
  let canvas = document.createElement('canvas');
  canvas.width = swapDims ? ch : cw;
  canvas.height = swapDims ? cw : ch;
  let ctx = canvas.getContext('2d');
  switch (orientation) {
    case 2: ctx.transform(-1,0,0,1,canvas.width,0); break;
    case 3: ctx.transform(-1,0,0,-1,canvas.width,canvas.height); break;
    case 4: ctx.transform(1,0,0,-1,0,canvas.height); break;
    case 5: ctx.transform(0,1,1,0,0,0); break;
    case 6: ctx.transform(0,1,-1,0,canvas.width,0); break;
    case 7: ctx.transform(0,-1,-1,0,canvas.width,canvas.height); break;
    case 8: ctx.transform(0,-1,1,0,0,canvas.height); break;
    default: break;
  }
  ctx.drawImage(imgOrBitmap, 0, 0, cw, ch);
  if (manualRotation) {
    const rotCanvas = document.createElement('canvas');
    const rad = manualRotation * Math.PI / 180;
    const swap = manualRotation % 180 !== 0;
    rotCanvas.width = swap ? canvas.height : canvas.width;
    rotCanvas.height = swap ? canvas.width : canvas.height;
    const rctx = rotCanvas.getContext('2d');
    rctx.translate(rotCanvas.width/2, rotCanvas.height/2);
    rctx.rotate(rad);
    rctx.drawImage(canvas, -canvas.width/2, -canvas.height/2);
    canvas = rotCanvas; ctx = rctx;
  }
  if (bwMode) {
    const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
    const d = imgData.data;
    for (let i=0;i<d.length;i+=4) { const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; d[i]=d[i+1]=d[i+2]=g; }
    ctx.putImageData(imgData,0,0);
  }
  return canvas;
}
function stampPage(canvas, pageNum, totalPages) {
  const ctx = canvas.getContext('2d');
  const dateStr = new Date().toLocaleDateString();
  const fontSize = Math.max(canvas.width * 0.018, 16);
  ctx.font = `${fontSize}px sans-serif`;
  const text = `${dateStr} · ${pageNum}/${totalPages}`;
  const metrics = ctx.measureText(text);
  const padding = fontSize * 0.6;
  const boxW = metrics.width + padding*2, boxH = fontSize + padding;
  const x = canvas.width - boxW - fontSize, y = canvas.height - boxH - fontSize;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x,y,boxW,boxH);
  ctx.fillStyle = '#ffffff'; ctx.textBaseline='middle'; ctx.fillText(text, x+padding, y+boxH/2);
  return canvas;
}
function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null')), 'image/jpeg', quality);
  });
}
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read blob'));
    reader.readAsDataURL(blob);
  });
}

// ---------- PDF page -> canvas (via pdf.js) ----------
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.js';

async function pdfFileToCanvases(file, maxDim) {
  const arrBuf = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrBuf }).promise;
  const canvases = [];
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const viewport1 = page.getViewport({ scale: 1 });
    const scale = maxDim / Math.max(viewport1.width, viewport1.height);
    const viewport = page.getViewport({ scale: Math.min(scale, 3) });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    canvases.push(canvas);
  }
  return canvases;
}

// ---------- Word (.docx) -> HTML -> canvas pages (simple render) ----------
async function wordFileToCanvases(file, maxDim) {
  const arrBuf = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: arrBuf });
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-9999px;top:0;width:${maxDim}px;background:#fff;color:#000;padding:40px;font-family:Georgia,serif;font-size:22px;line-height:1.5;`;
  container.innerHTML = result.value;
  document.body.appendChild(container);
  await new Promise(r => setTimeout(r, 50));
  const totalHeight = container.scrollHeight;
  const pageHeightPx = Math.round(maxDim * 1.4142);
  const numPages = Math.max(1, Math.ceil(totalHeight / pageHeightPx));
  const canvases = [];
  for (let i = 0; i < numPages; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = maxDim;
    canvas.height = pageHeightPx;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Стр. ${i+1}/${numPages} — предпросмотр Word ограничен, используйте PDF для точной вёрстки`, 20, 30);
    canvases.push(canvas);
  }
  document.body.removeChild(container);
  return canvases;
}


// ---------- OCR (offline, bundled language data) ----------
let ocrWorkerPromise = null;
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    setStatus(t('ocrInit'));
    ocrWorkerPromise = Tesseract.createWorker('rus+eng', 1, {
      workerPath: './worker.min.js',
      corePath: './tesseract-core-simd.wasm.js',
      langPath: './',
      gzip: true,
      logger: (m) => { if (m.status && typeof m.progress === 'number') log(`OCR: ${m.status} ${Math.round(m.progress*100)}%`); },
    }).catch((err) => { log('OCR engine failed to start: ' + err.message, 'err'); throw err; });
  }
  return ocrWorkerPromise;
}
async function runOcr(canvas) {
  try {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(canvas);
    return data;
  } catch (e) {
    log('OCR error (page skipped in text layer): ' + e.message, 'warn');
    return null;
  }
}

// ---------- OCR result panel actions ----------
copyOcrBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lastOcrText);
    setStatus(t('copied'));
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = lastOcrText;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    setStatus(t('copied'));
  }
});
downloadOcrBtn.addEventListener('click', () => {
  const blob = new Blob([lastOcrText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'ocr-result.txt'; a.click();
});

// ---------- Build PDF (merge view) ----------
buildBtn.addEventListener('click', () => { buildPdfs().catch(showFatalError); });

async function buildPdfs() {
  const validFiles = selectedFiles.filter(f => f.decodeOk !== false);
  if (validFiles.length === 0) { setStatus(t('noFilesSelected')); return; }

  buildBtn.disabled = true;
  progressWrap.style.display = 'block';
  barFill.style.background = '';
  if (statusLog) statusLog.innerHTML = '';
  resultsContainer.innerHTML = '';
  ocrResultCard.style.display = 'none';
  lastOcrText = '';
  barFill.style.width = '0%';
  setStatus(t('initBuild'));

  const skippedCount = selectedFiles.length - validFiles.length;
  if (skippedCount > 0) log(`Skipped unreadable files: ${skippedCount}`, 'warn');

  const targetMB = parseFloat(targetSizeSlider.value);
  const targetBytes = targetMB * 1024 * 1024 * 0.95;
  const bwMode = bwModeCb.checked;
  const stampMode = stampModeCb.checked;
  const ocrMode = ocrModeCb.checked;
  const baseTitle = docTitleInput.value.trim() || 'document';

  // Expand PDFs/Word into page-canvases first, building a unified "page source" list
  const expandedPages = []; // {sourceCanvas: null (lazy), type:'image'|'rendered', file, manualRotation, orientation}
  for (const item of validFiles) {
    if (item.kind === 'image') {
      expandedPages.push({ kind: 'image', file: item.file, manualRotation: item.manualRotation || 0 });
    } else if (item.kind === 'pdf') {
      expandedPages.push({ kind: 'pdf', file: item.file });
    } else if (item.kind === 'word') {
      expandedPages.push({ kind: 'word', file: item.file });
    }
  }

  const batches = [];
  for (let i = 0; i < expandedPages.length; i += BATCH_LIMIT) batches.push(expandedPages.slice(i, i + BATCH_LIMIT));

  log(t('totalPhotos', expandedPages.length, batches.length));

  const allOcrTexts = [];
  for (let b = 0; b < batches.length; b++) {
    setStatus(batches.length > 1 ? t('loadingPart', b+1, batches.length) : t('loadingFiles'));
    const pageText = await buildSinglePdf(batches[b], targetBytes, targetMB, bwMode, stampMode, ocrMode, baseTitle, b+1, batches.length);
    if (pageText) allOcrTexts.push(pageText);
  }

  if (ocrMode && allOcrTexts.length > 0) {
    lastOcrText = allOcrTexts.join('\n\n---\n\n');
    ocrResultText.textContent = lastOcrText || '(текст не распознан)';
    ocrResultCard.style.display = 'block';
  }

  setStatus(t('done'));
  barFill.style.width = '100%';
  buildBtn.disabled = false;
}

async function buildSinglePdf(pageSources, targetBytes, targetMB, bwMode, stampMode, ocrMode, baseTitle, batchIndex, totalBatches) {
  // Step 1: resolve every page source into a raw canvas (before compression pass)
  const rawCanvases = [];
  for (let i = 0; i < pageSources.length; i++) {
    setStatus(t('decoding', i+1, pageSources.length));
    const src = pageSources[i];
    try {
      if (src.kind === 'image') {
        const { img, orientation } = await loadImageWithOrientation(src.file);
        const canvas = drawToCanvas(img, orientation, 2480, src.manualRotation, false);
        rawCanvases.push(canvas);
      } else if (src.kind === 'pdf') {
        const canvases = await pdfFileToCanvases(src.file, 2480);
        rawCanvases.push(...canvases);
      } else if (src.kind === 'word') {
        setStatus(t('wordConverting'));
        const canvases = await wordFileToCanvases(src.file, 1600);
        rawCanvases.push(...canvases);
      }
    } catch (err) {
      log(`Skipped (decode error): ${src.file.name} — ${err.message}`, 'err');
    }
    barFill.style.width = `${Math.round(((i+1)/pageSources.length)*10)}%`;
  }

  if (rawCanvases.length === 0) throw new Error('No pages could be decoded in this batch');

  const settingsList = [
    {maxDim:2480,quality:0.82},{maxDim:2480,quality:0.70},{maxDim:2200,quality:0.62},
    {maxDim:2000,quality:0.55},{maxDim:1800,quality:0.50},{maxDim:1600,quality:0.45},
    {maxDim:1400,quality:0.40},{maxDim:1200,quality:0.38},{maxDim:1000,quality:0.35},
  ];

  let chosenBlobs=null, chosenDims=null, chosenCanvases=null;

  for (let s = 0; s < settingsList.length; s++) {
    const { maxDim, quality } = settingsList[s];
    setStatus(t('compressTry', Math.round(quality*100), maxDim, s+1, settingsList.length));
    const blobs=[], dims=[], canvases=[];
    let totalSize=0, bail=false;

    for (let i = 0; i < rawCanvases.length; i++) {
      let canvas = downscaleCanvas(rawCanvases[i], maxDim, bwMode);
      if (stampMode) canvas = stampPage(canvas, i+1, rawCanvases.length);
      const blob = await canvasToBlob(canvas, quality);
      blobs.push(blob); dims.push({w:canvas.width,h:canvas.height}); canvases.push(canvas);
      totalSize += blob.size;
      const progress = 10 + Math.round(((s*rawCanvases.length+i+1)/(settingsList.length*rawCanvases.length))*55);
      barFill.style.width = `${Math.min(progress,65)}%`;
      if (totalSize > targetBytes*1.6 && i>2) { bail=true; break; }
    }
    log(`Attempt ${s+1}: total size ~${(totalSize/1024/1024).toFixed(2)} MB`);
    if (!bail && (totalSize <= targetBytes || s === settingsList.length-1)) { chosenBlobs=blobs; chosenDims=dims; chosenCanvases=canvases; break; }
    if (bail && s === settingsList.length-1) { chosenBlobs=blobs; chosenDims=dims; chosenCanvases=canvases; }
  }

  if (!chosenBlobs || chosenBlobs.length===0) throw new Error('Could not compress images — try fewer files at once');

  let ocrPageTexts = [];
  if (ocrMode) {
    for (let i = 0; i < chosenCanvases.length; i++) {
      setStatus(t('ocrRecognizing', i+1, chosenCanvases.length));
      const data = await runOcr(chosenCanvases[i]);
      if (data && data.text) ocrPageTexts.push(data.text.trim());
      barFill.style.width = `${65 + Math.round(((i+1)/chosenCanvases.length)*10)}%`;
    }
  }

  setStatus(t('assembling'));
  const { jsPDF } = window.jspdf;
  if (!jsPDF) throw new Error('jsPDF library did not load');
  let pdf = null;

  for (let i = 0; i < chosenBlobs.length; i++) {
    const dataUrl = await blobToDataURL(chosenBlobs[i]);
    const { w, h } = chosenDims[i];
    const dpi = 150;
    const pageWmm = (w/dpi)*25.4, pageHmm = (h/dpi)*25.4;
    const orientation = pageWmm > pageHmm ? 'l' : 'p';
    if (i===0) { pdf = new jsPDF({orientation,unit:'mm',format:[pageWmm,pageHmm],compress:true}); if (baseTitle) pdf.setProperties({title:baseTitle}); }
    else pdf.addPage([pageWmm,pageHmm], orientation);
    pdf.addImage(dataUrl,'JPEG',0,0,pageWmm,pageHmm,undefined,'FAST');
    barFill.style.width = `${75 + Math.round(((i+1)/chosenBlobs.length)*20)}%`;
  }

  const pdfBlob = pdf.output('blob');
  const finalMB = (pdfBlob.size/(1024*1024)).toFixed(2);
  const url = URL.createObjectURL(pdfBlob);
  const fileName = totalBatches>1 ? `${sanitizeFileName(baseTitle)}_part${batchIndex}.pdf` : `${sanitizeFileName(baseTitle)}.pdf`;
  log(`${fileName}: ${finalMB} MB`);

  const card = document.createElement('div');
  card.className = 'card resultCard';
  card.style.display = 'block';
  card.innerHTML = `
    <p>${totalBatches>1 ? `Part ${batchIndex}/${totalBatches}` : 'Done!'}</p>
    <div class="size-big ${pdfBlob.size <= targetMB*1024*1024 ? 'size-ok':''}">${finalMB} MB</div>
    <a href="${url}" download="${fileName}"><button class="btn-primary">${t('buildBtn')}: ${fileName}</button></a>
  `;
  resultsContainer.appendChild(card);

  return ocrPageTexts.length ? ocrPageTexts.join('\n\n') : '';
}

function downscaleCanvas(sourceCanvas, maxDim, bwMode) {
  const w = sourceCanvas.width, h = sourceCanvas.height;
  let scale = 1;
  if (maxDim && Math.max(w,h) > maxDim) scale = maxDim/Math.max(w,h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w*scale); canvas.height = Math.round(h*scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  if (bwMode) {
    const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
    const d = imgData.data;
    for (let i=0;i<d.length;i+=4) { const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; d[i]=d[i+1]=d[i+2]=g; }
    ctx.putImageData(imgData,0,0);
  }
  return canvas;
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Zа-яА-Я0-9_\- ]/g,'').trim().replace(/\s+/g,'_') || 'document';
}


// ---------- Convert view: PDF -> JPEG ----------
const dropzoneConvert = document.getElementById('dropzoneConvert');
const pdfInput = document.getElementById('pdfInput');
const convertStatus = document.getElementById('convertStatus');
const convertProgressWrap = document.getElementById('convertProgressWrap');
const convertBarFill = document.getElementById('convertBarFill');
const convertStatusText = document.getElementById('convertStatusText');
const convertResultsCard = document.getElementById('convertResultsCard');
const convertPagesEl = document.getElementById('convertPages');
const downloadAllZipBtn = document.getElementById('downloadAllZipBtn');

let convertedImages = []; // {dataUrl, blob, name}

dropzoneConvert.addEventListener('click', () => pdfInput.click());
dropzoneConvert.addEventListener('dragover', (e) => { e.preventDefault(); dropzoneConvert.classList.add('drag'); });
dropzoneConvert.addEventListener('dragleave', () => dropzoneConvert.classList.remove('drag'));
dropzoneConvert.addEventListener('drop', (e) => { e.preventDefault(); dropzoneConvert.classList.remove('drag'); if (e.dataTransfer.files[0]) convertPdfToImages(e.dataTransfer.files[0]).catch(showConvertError); });
pdfInput.addEventListener('change', (e) => { if (e.target.files[0]) convertPdfToImages(e.target.files[0]).catch(showConvertError); });

function showConvertError(err) {
  console.error(err);
  convertStatusText.textContent = 'Error: ' + err.message;
  convertBarFill.style.background = 'var(--error)';
}

async function convertPdfToImages(file) {
  convertedImages = [];
  convertResultsCard.style.display = 'none';
  convertPagesEl.innerHTML = '';
  convertProgressWrap.style.display = 'block';
  convertBarFill.style.background = '';
  convertBarFill.style.width = '0%';
  convertStatus.textContent = '';
  convertStatusText.textContent = t('convertSelectPdf');

  const arrBuf = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrBuf }).promise;
  const total = pdfDoc.numPages;
  const baseName = file.name.replace(/\.pdf$/i,'');

  for (let p = 1; p <= total; p++) {
    convertStatusText.textContent = t('convertProcessing', p, total);
    const page = await pdfDoc.getPage(p);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const blob = await canvasToBlob(canvas, 0.92);
    const dataUrl = await blobToDataURL(blob);
    const name = `${baseName}_page${p}.jpg`;
    convertedImages.push({ dataUrl, blob, name });
    convertBarFill.style.width = `${Math.round((p/total)*100)}%`;
  }

  convertStatusText.textContent = t('convertDone', total);
  renderConvertResults();
  convertResultsCard.style.display = 'block';
}

function renderConvertResults() {
  convertPagesEl.innerHTML = '';
  convertedImages.forEach((img, i) => {
    const div = document.createElement('div');
    div.className = 'page-item';
    div.innerHTML = `<img src="${img.dataUrl}" alt="page ${i+1}"><span class="num">${i+1}</span><a href="${img.dataUrl}" download="${img.name}">⬇</a>`;
    convertPagesEl.appendChild(div);
  });
}

downloadAllZipBtn.addEventListener('click', async () => {
  for (const img of convertedImages) {
    const a = document.createElement('a');
    a.href = img.dataUrl; a.download = img.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    await new Promise(r => setTimeout(r, 150));
  }
});

// ---------- Service Worker registration (network-first for core files) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            log('New version detected — activating…', 'warn');
            newWorker.postMessage('SKIP_WAITING');
          }
        });
      });
      reg.update();
    }).catch((e) => log('SW error: ' + e.message, 'warn'));

    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    });
  });
}
