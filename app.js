
// ---------- Photo -> PDF PWA v2 (client-side, offline) ----------

let selectedFiles = []; // {file, id, thumbUrl}
let idCounter = 0;
let dragSrcIndex = null;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileListEl = document.getElementById('fileList');
const buildBtn = document.getElementById('buildBtn');
const progressWrap = document.getElementById('progressWrap');
const barFill = document.getElementById('barFill');
const statusText = document.getElementById('statusText');
const resultsContainer = document.getElementById('resultsContainer');
const targetSizeSelect = document.getElementById('targetSizeMB');
const docTitleInput = document.getElementById('docTitle');
const bwModeCb = document.getElementById('bwMode');
const stampModeCb = document.getElementById('stampMode');
const ocrModeCb = document.getElementById('ocrMode');
const batchNote = document.getElementById('batchNote');

const BATCH_LIMIT = 25;

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

async function handleFiles(fileListInput) {
  const arr = Array.from(fileListInput).filter(f => f.type.startsWith('image/'));
  for (const f of arr) {
    const thumbUrl = URL.createObjectURL(f);
    selectedFiles.push({ file: f, id: idCounter++, thumbUrl });
  }
  renderFileList();
}

function renderFileList() {
  fileListEl.innerHTML = '';
  selectedFiles.forEach((item, index) => {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.index = index;
    const mb = (item.file.size / (1024*1024)).toFixed(1);
    li.innerHTML = `
      <span class="handle">☰</span>
      <img class="thumb" src="${item.thumbUrl}" alt="">
      <span class="meta">
        <div class="name">${escapeHtml(item.file.name)}</div>
        <div class="size">${mb} МБ</div>
      </span>
      <span class="actions">
        <span class="rotate" data-id="${item.id}" title="Повернуть">⟳</span>
        <span class="rm" data-id="${item.id}" title="Удалить">✕</span>
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
      if (item) {
        item.manualRotation = ((item.manualRotation || 0) + 90) % 360;
        el.style.transform = `rotate(${item.manualRotation}deg)`;
      }
    });
  });

  setupDragReorder();
  buildBtn.disabled = selectedFiles.length === 0;
  batchNote.style.display = selectedFiles.length > BATCH_LIMIT ? 'block' : 'none';
}

function setupDragReorder() {
  const items = fileListEl.querySelectorAll('li');
  items.forEach(li => {
    li.addEventListener('dragstart', (e) => {
      dragSrcIndex = parseInt(li.dataset.index, 10);
      li.classList.add('dragging');
    });
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
    });
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---- Image loading with EXIF orientation handling ----
function loadImageWithOrientation(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      getOrientation(file).then(orientation => {
        resolve({ img, orientation, url });
      }).catch(() => resolve({ img, orientation: 1, url }));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function getOrientation(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
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
            if (view.getUint16(entryOffset, little) === 0x0112) {
              return resolve(view.getUint16(entryOffset + 8, little));
            }
          }
        } else if ((marker & 0xFF00) !== 0xFF00) {
          break;
        } else {
          offset += view.getUint16(offset, false);
        }
      }
      resolve(1);
    };
    reader.readAsArrayBuffer(file.slice(0, 128 * 1024));
  });
}

function drawToCanvas(img, orientation, maxDim, manualRotation, bwMode) {
  let { naturalWidth: w, naturalHeight: h } = img;
  let scale = 1;
  if (maxDim && Math.max(w, h) > maxDim) scale = maxDim / Math.max(w, h);
  let cw = Math.round(w * scale);
  let ch = Math.round(h * scale);

  const swapDims = orientation >= 5 && orientation <= 8;
  let canvas = document.createElement('canvas');
  canvas.width = swapDims ? ch : cw;
  canvas.height = swapDims ? cw : ch;
  let ctx = canvas.getContext('2d');

  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, canvas.width, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, canvas.width, canvas.height); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, canvas.height); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, canvas.width, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, canvas.width, canvas.height); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, canvas.height); break;
    default: break;
  }
  ctx.drawImage(img, 0, 0, cw, ch);

  if (manualRotation) {
    const rotCanvas = document.createElement('canvas');
    const rad = manualRotation * Math.PI / 180;
    const swap = manualRotation % 180 !== 0;
    rotCanvas.width = swap ? canvas.height : canvas.width;
    rotCanvas.height = swap ? canvas.width : canvas.height;
    const rctx = rotCanvas.getContext('2d');
    rctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    rctx.rotate(rad);
    rctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    canvas = rotCanvas;
    ctx = rctx;
  }

  if (bwMode) {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      d[i] = d[i+1] = d[i+2] = gray;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return canvas;
}

function stampPage(canvas, pageNum, totalPages) {
  const ctx = canvas.getContext('2d');
  const dateStr = new Date().toLocaleDateString('ru-RU');
  const fontSize = Math.max(canvas.width * 0.018, 16);
  ctx.font = `${fontSize}px sans-serif`;
  const text = `${dateStr} · стр. ${pageNum}/${totalPages}`;
  const metrics = ctx.measureText(text);
  const padding = fontSize * 0.6;
  const boxW = metrics.width + padding * 2;
  const boxH = fontSize + padding;
  const x = canvas.width - boxW - fontSize;
  const y = canvas.height - boxH - fontSize;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padding, y + boxH / 2);
  return canvas;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality));
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// ---- OCR (lazy-load Tesseract worker) ----
let ocrWorkerPromise = null;
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    statusText.textContent = 'Загружаем модуль распознавания текста…';
    ocrWorkerPromise = Tesseract.createWorker('rus+eng', 1, {
      langPath: './tessdata',
    });
  }
  return ocrWorkerPromise;
}

async function runOcr(canvas) {
  try {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(canvas);
    return data;
  } catch (e) {
    console.warn('OCR failed', e);
    return null;
  }
}

// ---- Build PDF (with batching) ----
buildBtn.addEventListener('click', buildPdfs);

async function buildPdfs() {
  buildBtn.disabled = true;
  progressWrap.style.display = 'block';
  resultsContainer.innerHTML = '';
  barFill.style.width = '0%';

  const files = [...selectedFiles];
  const targetMB = parseFloat(targetSizeSelect.value);
  const targetBytes = targetMB * 1024 * 1024 * 0.95;
  const bwMode = bwModeCb.checked;
  const stampMode = stampModeCb.checked;
  const ocrMode = ocrModeCb.checked;
  const baseTitle = docTitleInput.value.trim() || 'document';

  const batches = [];
  for (let i = 0; i < files.length; i += BATCH_LIMIT) {
    batches.push(files.slice(i, i + BATCH_LIMIT));
  }

  for (let b = 0; b < batches.length; b++) {
    statusText.textContent = batches.length > 1
      ? `Обрабатываем часть ${b + 1} из ${batches.length}…`
      : 'Загружаем фотографии…';
    await buildSinglePdf(batches[b], targetBytes, targetMB, bwMode, stampMode, ocrMode, baseTitle, b + 1, batches.length);
  }

  progressWrap.style.display = 'none';
  buildBtn.disabled = false;
}

async function buildSinglePdf(files, targetBytes, targetMB, bwMode, stampMode, ocrMode, baseTitle, batchIndex, totalBatches) {
  const decoded = [];
  for (let i = 0; i < files.length; i++) {
    const { img, orientation } = await loadImageWithOrientation(files[i].file);
    decoded.push({ img, orientation, manualRotation: files[i].manualRotation || 0 });
    barFill.style.width = `${Math.round(((i + 1) / files.length) * 10)}%`;
  }

  const settingsList = [
    { maxDim: 2480, quality: 0.82 },
    { maxDim: 2480, quality: 0.70 },
    { maxDim: 2200, quality: 0.62 },
    { maxDim: 2000, quality: 0.55 },
    { maxDim: 1800, quality: 0.50 },
    { maxDim: 1600, quality: 0.45 },
    { maxDim: 1400, quality: 0.40 },
    { maxDim: 1200, quality: 0.38 },
    { maxDim: 1000, quality: 0.35 },
  ];

  let chosenBlobs = null;
  let chosenDims = null;
  let chosenCanvases = null;

  for (let s = 0; s < settingsList.length; s++) {
    const { maxDim, quality } = settingsList[s];
    statusText.textContent = `Пробуем качество ${Math.round(quality * 100)}%, макс. сторона ${maxDim}px…`;
    const blobs = [];
    const dims = [];
    const canvases = [];
    let totalSize = 0;
    let bail = false;

    for (let i = 0; i < decoded.length; i++) {
      let canvas = drawToCanvas(decoded[i].img, decoded[i].orientation, maxDim, decoded[i].manualRotation, bwMode);
      if (stampMode) canvas = stampPage(canvas, i + 1, decoded.length);
      const blob = await canvasToBlob(canvas, quality);
      blobs.push(blob);
      dims.push({ w: canvas.width, h: canvas.height });
      canvases.push(canvas);
      totalSize += blob.size;

      const progress = 10 + Math.round(((s * decoded.length + i + 1) / (settingsList.length * decoded.length)) * 55);
      barFill.style.width = `${Math.min(progress, 65)}%`;

      if (totalSize > targetBytes * 1.6 && i > 2) { bail = true; break; }
    }

    if (!bail && (totalSize <= targetBytes || s === settingsList.length - 1)) {
      chosenBlobs = blobs;
      chosenDims = dims;
      chosenCanvases = canvases;
      break;
    }
    if (bail && s === settingsList.length - 1) {
      chosenBlobs = blobs;
      chosenDims = dims;
      chosenCanvases = canvases;
    }
  }

  let ocrTextLayers = null;
  if (ocrMode) {
    ocrTextLayers = [];
    for (let i = 0; i < chosenCanvases.length; i++) {
      statusText.textContent = `Распознаём текст: страница ${i + 1} из ${chosenCanvases.length}…`;
      const data = await runOcr(chosenCanvases[i]);
      ocrTextLayers.push(data);
      barFill.style.width = `${65 + Math.round(((i + 1) / chosenCanvases.length) * 10)}%`;
    }
  }

  statusText.textContent = 'Собираем PDF…';
  const { jsPDF } = window.jspdf;
  let pdf = null;

  for (let i = 0; i < chosenBlobs.length; i++) {
    const blob = chosenBlobs[i];
    const dataUrl = await blobToDataURL(blob);
    const { w, h } = chosenDims[i];
    const dpi = 150;
    const pageWmm = (w / dpi) * 25.4;
    const pageHmm = (h / dpi) * 25.4;
    const orientation = pageWmm > pageHmm ? 'l' : 'p';

    if (i === 0) {
      pdf = new jsPDF({ orientation, unit: 'mm', format: [pageWmm, pageHmm], compress: true });
      if (baseTitle) pdf.setProperties({ title: baseTitle });
    } else {
      pdf.addPage([pageWmm, pageHmm], orientation);
    }
    pdf.addImage(dataUrl, 'JPEG', 0, 0, pageWmm, pageHmm, undefined, 'FAST');

    if (ocrTextLayers && ocrTextLayers[i] && ocrTextLayers[i].words) {
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(1);
      ocrTextLayers[i].words.forEach(word => {
        const scaleX = pageWmm / w;
        const scaleY = pageHmm / h;
        const x = word.bbox.x0 * scaleX;
        const y = word.bbox.y1 * scaleY;
        try { pdf.text(word.text, x, y, { renderingMode: 'invisible' }); } catch(e) {}
      });
    }

    barFill.style.width = `${75 + Math.round(((i + 1) / chosenBlobs.length) * 20)}%`;
  }

  const pdfBlob = pdf.output('blob');
  barFill.style.width = '100%';

  const finalMB = (pdfBlob.size / (1024 * 1024)).toFixed(2);
  const url = URL.createObjectURL(pdfBlob);
  const fileName = totalBatches > 1
    ? `${sanitizeFileName(baseTitle)}_part${batchIndex}.pdf`
    : `${sanitizeFileName(baseTitle)}.pdf`;

  const card = document.createElement('div');
  card.className = 'card resultCard';
  card.style.display = 'block';
  card.innerHTML = `
    <p>${totalBatches > 1 ? `Часть ${batchIndex} из ${totalBatches}` : 'Готово!'}</p>
    <div class="size-big ${pdfBlob.size <= targetMB * 1024 * 1024 ? 'size-ok' : ''}">${finalMB} МБ</div>
    <a href="${url}" download="${fileName}"><button class="btn-primary">Скачать ${fileName}</button></a>
  `;
  resultsContainer.appendChild(card);
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Zа-яА-Я0-9_\- ]/g, '').trim().replace(/\s+/g, '_') || 'document';
}

// ---- Register service worker for offline/PWA behavior ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
