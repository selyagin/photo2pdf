
// ---------- Photo -> PDF PWA v2.2 (flat structure, robust image decode, fully offline) ----------

let selectedFiles = [];
let idCounter = 0;
let dragSrcIndex = null;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileListEl = document.getElementById('fileList');
const buildBtn = document.getElementById('buildBtn');
const progressWrap = document.getElementById('progressWrap');
const barFill = document.getElementById('barFill');
const statusText = document.getElementById('statusText');
const statusLog = document.getElementById('statusLog');
const resultsContainer = document.getElementById('resultsContainer');
const targetSizeSelect = document.getElementById('targetSizeMB');
const docTitleInput = document.getElementById('docTitle');
const bwModeCb = document.getElementById('bwMode');
const stampModeCb = document.getElementById('stampMode');
const ocrModeCb = document.getElementById('ocrMode');
const batchNote = document.getElementById('batchNote');
const warnNote = document.getElementById('warnNote');

const BATCH_LIMIT = 25;

function log(msg, level) {
  console.log('[Photo2PDF]', msg);
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
  setStatus('Ошибка: ' + (err && err.message ? err.message : String(err)));
  log('ОШИБКА СБОРКИ: ' + (err && err.message ? err.message : String(err)), 'err');
  progressWrap.style.display = 'block';
  barFill.style.background = '#ff6b6b';
  buildBtn.disabled = false;
}

window.addEventListener('error', (e) => log('JS ошибка: ' + e.message, 'err'));
window.addEventListener('unhandledrejection', (e) => log('Необработанная ошибка: ' + (e.reason && e.reason.message ? e.reason.message : e.reason), 'err'));

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

function handleFiles(fileListInput) {
  const arr = Array.from(fileListInput).filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  const skipped = fileListInput.length - arr.length;
  if (skipped > 0) log(`Пропущено файлов (не изображения): ${skipped}`, 'warn');
  for (const f of arr) {
    selectedFiles.push({ file: f, id: idCounter++, thumbUrl: null, manualRotation: 0, decodeOk: null });
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
    li.innerHTML = `
      <span class="handle">☰</span>
      <span class="thumb" data-thumb-id="${item.id}">…</span>
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
    warnNote.textContent = `⚠ ${failed.length} файл(ов) не удалось прочитать как изображение (возможно формат HEIC без поддержки в этом браузере или повреждённый файл). Они будут пропущены при сборке PDF.`;
  } else {
    warnNote.style.display = 'none';
  }
}

async function generateThumbnails() {
  for (const item of selectedFiles) {
    if (item.thumbUrl !== null || item.decodeOk === false) continue;
    const el = fileListEl.querySelector(`[data-thumb-id="${item.id}"]`);
    try {
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
    } catch (err) {
      item.decodeOk = false;
      log(`Не удалось декодировать превью для "${item.file.name}": ${err.message}`, 'warn');
      if (el) el.textContent = '⚠';
      updateWarnNote();
    }
  }
}

// Robust decode: tries createImageBitmap first (handles HEIC on modern Safari),
// falls back to classic <img> + object URL decode.
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
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('формат не поддерживается браузером')); };
    img.src = url;
  });
}

function setupDragReorder() {
  const items = fileListEl.querySelectorAll('li');
  items.forEach(li => {
    li.addEventListener('dragstart', () => {
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
      generateThumbnails();
    });
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function loadImageWithOrientation(file) {
  return new Promise((resolve, reject) => {
    decodeImageRobust(file).then((imgOrBitmap) => {
      getOrientation(file).then(orientation => {
        resolve({ img: imgOrBitmap, orientation });
      }).catch(() => resolve({ img: imgOrBitmap, orientation: 1 }));
    }).catch((err) => reject(new Error(`Не удалось загрузить "${file.name}": ${err.message}`)));
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
      } catch (err) {
        resolve(1);
      }
    };
    reader.onerror = () => resolve(1);
    reader.readAsArrayBuffer(file.slice(0, 128 * 1024));
  });
}

function getDims(imgOrBitmap) {
  return {
    w: imgOrBitmap.naturalWidth || imgOrBitmap.width,
    h: imgOrBitmap.naturalHeight || imgOrBitmap.height,
  };
}

function drawToCanvas(imgOrBitmap, orientation, maxDim, manualRotation, bwMode) {
  const { w, h } = getDims(imgOrBitmap);
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
  ctx.drawImage(imgOrBitmap, 0, 0, cw, ch);

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
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob вернул null'));
    }, 'image/jpeg', quality);
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Не удалось прочитать blob'));
    reader.readAsDataURL(blob);
  });
}

// ---- OCR: fully offline, flat file paths, local language data ----
let ocrWorkerPromise = null;
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    setStatus('Инициализируем офлайн-модуль OCR…');
    ocrWorkerPromise = Tesseract.createWorker('rus+eng', 1, {
      workerPath: './worker.min.js',
      corePath: './tesseract-core-simd.wasm.js',
      langPath: './',
      gzip: true,
      logger: (m) => {
        if (m.status && typeof m.progress === 'number') {
          log(`OCR: ${m.status} ${Math.round(m.progress * 100)}%`);
        }
      },
    }).catch((err) => {
      log('Не удалось запустить OCR-движок: ' + err.message, 'err');
      throw err;
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
    log('OCR ошибка (страница пропущена в текстовом слое): ' + e.message, 'warn');
    return null;
  }
}

// ---- Build PDF (batched, detailed status, skips broken images) ----
buildBtn.addEventListener('click', () => {
  buildPdfs().catch(showFatalError);
});

async function buildPdfs() {
  const validFiles = selectedFiles.filter(f => f.decodeOk !== false);
  if (validFiles.length === 0) {
    setStatus('Нет читаемых изображений для сборки.');
    return;
  }

  buildBtn.disabled = true;
  progressWrap.style.display = 'block';
  barFill.style.background = '';
  if (statusLog) statusLog.innerHTML = '';
  resultsContainer.innerHTML = '';
  barFill.style.width = '0%';
  setStatus('Инициализация сборки…');

  const skippedCount = selectedFiles.length - validFiles.length;
  if (skippedCount > 0) log(`Пропущено нечитаемых файлов: ${skippedCount}`, 'warn');

  const targetMB = parseFloat(targetSizeSelect.value);
  const targetBytes = targetMB * 1024 * 1024 * 0.95;
  const bwMode = bwModeCb.checked;
  const stampMode = stampModeCb.checked;
  const ocrMode = ocrModeCb.checked;
  const baseTitle = docTitleInput.value.trim() || 'document';

  const batches = [];
  for (let i = 0; i < validFiles.length; i += BATCH_LIMIT) {
    batches.push(validFiles.slice(i, i + BATCH_LIMIT));
  }

  log(`Всего фото к сборке: ${validFiles.length}, частей PDF: ${batches.length}`);

  for (let b = 0; b < batches.length; b++) {
    setStatus(batches.length > 1
      ? `Часть ${b + 1} из ${batches.length}: загружаем фотографии…`
      : 'Загружаем фотографии…');
    await buildSinglePdf(batches[b], targetBytes, targetMB, bwMode, stampMode, ocrMode, baseTitle, b + 1, batches.length);
  }

  setStatus('Готово. Файлы доступны для скачивания ниже.');
  barFill.style.width = '100%';
  buildBtn.disabled = false;
}

async function buildSinglePdf(files, targetBytes, targetMB, bwMode, stampMode, ocrMode, baseTitle, batchIndex, totalBatches) {
  const decoded = [];
  for (let i = 0; i < files.length; i++) {
    setStatus(`Декодируем фото ${i + 1} из ${files.length}…`);
    try {
      const { img, orientation } = await loadImageWithOrientation(files[i].file);
      decoded.push({ img, orientation, manualRotation: files[i].manualRotation || 0 });
    } catch (err) {
      log(`Пропущено (ошибка декодирования): ${files[i].file.name} — ${err.message}`, 'err');
    }
    barFill.style.width = `${Math.round(((i + 1) / files.length) * 10)}%`;
  }

  if (decoded.length === 0) {
    throw new Error('Ни одно изображение в этой партии не удалось декодировать');
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
    setStatus(`Подбор сжатия: ${Math.round(quality * 100)}% качества, до ${maxDim}px (попытка ${s + 1}/${settingsList.length})…`);
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

    log(`Попытка ${s + 1}: итоговый размер ~${(totalSize/1024/1024).toFixed(2)} МБ`);

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

  if (!chosenBlobs || chosenBlobs.length === 0) {
    throw new Error('Не удалось сжать изображения — попробуйте меньше фото за раз');
  }

  let ocrTextLayers = null;
  if (ocrMode) {
    ocrTextLayers = [];
    for (let i = 0; i < chosenCanvases.length; i++) {
      setStatus(`Распознаём текст (OCR): страница ${i + 1} из ${chosenCanvases.length}…`);
      const data = await runOcr(chosenCanvases[i]);
      ocrTextLayers.push(data);
      barFill.style.width = `${65 + Math.round(((i + 1) / chosenCanvases.length) * 10)}%`;
    }
  }

  setStatus('Собираем страницы в PDF…');
  const { jsPDF } = window.jspdf;
  if (!jsPDF) throw new Error('Библиотека jsPDF не загрузилась (jspdf.umd.min.js)');
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

  const finalMB = (pdfBlob.size / (1024 * 1024)).toFixed(2);
  const url = URL.createObjectURL(pdfBlob);
  const fileName = totalBatches > 1
    ? `${sanitizeFileName(baseTitle)}_part${batchIndex}.pdf`
    : `${sanitizeFileName(baseTitle)}.pdf`;

  log(`${fileName}: ${finalMB} МБ`);

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

// ---- Robust SW registration: force-activate updates immediately ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            log('Обнаружена новая версия приложения — активируем…', 'warn');
            newWorker.postMessage('SKIP_WAITING');
          }
        });
      });
      reg.update();
    }).catch((e) => log('SW ошибка: ' + e.message, 'warn'));

    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    });
  });
}

log('Приложение загружено. jsPDF: ' + (window.jspdf ? 'OK' : 'НЕ НАЙДЕН') + ', Tesseract: ' + (window.Tesseract ? 'OK' : 'НЕ НАЙДЕН'));
