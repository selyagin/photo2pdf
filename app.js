
// ---------- Photo -> PDF PWA (client-side, offline) ----------

let selectedFiles = []; // {file, id}
let idCounter = 0;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileListEl = document.getElementById('fileList');
const buildBtn = document.getElementById('buildBtn');
const progressWrap = document.getElementById('progressWrap');
const barFill = document.getElementById('barFill');
const statusText = document.getElementById('statusText');
const resultBox = document.getElementById('resultBox');
const finalSizeEl = document.getElementById('finalSize');
const downloadLink = document.getElementById('downloadLink');
const resetBtn = document.getElementById('resetBtn');
const targetSizeSelect = document.getElementById('targetSizeMB');
const orderModeSelect = document.getElementById('orderMode');

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
  const arr = Array.from(fileListInput).filter(f => f.type.startsWith('image/'));
  arr.forEach(f => selectedFiles.push({ file: f, id: idCounter++ }));
  renderFileList();
}

function renderFileList() {
  fileListEl.innerHTML = '';
  selectedFiles.forEach(item => {
    const li = document.createElement('li');
    const mb = (item.file.size / (1024*1024)).toFixed(1);
    li.innerHTML = `<span>${escapeHtml(item.file.name)}</span><span class="size">${mb} МБ<span class="rm" data-id="${item.id}"> ✕</span></span>`;
    fileListEl.appendChild(li);
  });
  fileListEl.querySelectorAll('.rm').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.id, 10);
      selectedFiles = selectedFiles.filter(x => x.id !== id);
      renderFileList();
    });
  });
  buildBtn.disabled = selectedFiles.length === 0;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

resetBtn.addEventListener('click', () => {
  selectedFiles = [];
  renderFileList();
  resultBox.style.display = 'none';
  progressWrap.style.display = 'none';
  fileInput.value = '';
});

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

// Draw image to a canvas honoring EXIF orientation and a max dimension / scale
function drawToCanvas(img, orientation, maxDim) {
  let { naturalWidth: w, naturalHeight: h } = img;
  let scale = 1;
  if (maxDim && Math.max(w, h) > maxDim) {
    scale = maxDim / Math.max(w, h);
  }
  let cw = Math.round(w * scale);
  let ch = Math.round(h * scale);

  const swapDims = orientation >= 5 && orientation <= 8;
  const canvas = document.createElement('canvas');
  canvas.width = swapDims ? ch : cw;
  canvas.height = swapDims ? cw : ch;
  const ctx = canvas.getContext('2d');

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
  return canvas;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

// ---- Build PDF ----
buildBtn.addEventListener('click', buildPdf);

async function buildPdf() {
  buildBtn.disabled = true;
  progressWrap.style.display = 'block';
  resultBox.style.display = 'none';
  barFill.style.width = '0%';

  let files = [...selectedFiles];
  if (orderModeSelect.value === 'name') {
    files.sort((a, b) => a.file.name.localeCompare(b.file.name, 'ru'));
  }

  const targetMB = parseFloat(targetSizeSelect.value);
  const targetBytes = targetMB * 1024 * 1024 * 0.95; // safety margin

  // Step 1: decode all images once (orientation + natural size), keep in memory
  statusText.textContent = 'Загружаем фотографии…';
  const decoded = [];
  for (let i = 0; i < files.length; i++) {
    const { img, orientation } = await loadImageWithOrientation(files[i].file);
    decoded.push({ img, orientation });
    barFill.style.width = `${Math.round(((i + 1) / files.length) * 15)}%`;
  }

  // Step 2: iterative compression — try decreasing quality/maxDim combos
  // until estimated total <= targetBytes, then assemble final PDF once.
  const settingsList = [
    { maxDim: 2480, quality: 0.82 }, // ~A4 300dpi long side, high quality
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

  for (let s = 0; s < settingsList.length; s++) {
    const { maxDim, quality } = settingsList[s];
    statusText.textContent = `Пробуем качество ${Math.round(quality * 100)}%, макс. сторона ${maxDim}px…`;
    const blobs = [];
    const dims = [];
    let totalSize = 0;

    for (let i = 0; i < decoded.length; i++) {
      const canvas = drawToCanvas(decoded[i].img, decoded[i].orientation, maxDim);
      const blob = await canvasToBlob(canvas, quality);
      blobs.push(blob);
      dims.push({ w: canvas.width, h: canvas.height });
      totalSize += blob.size;

      const progress = 15 + Math.round(((s * decoded.length + i + 1) / (settingsList.length * decoded.length)) * 65);
      barFill.style.width = `${Math.min(progress, 80)}%`;

      // early bail-out if this pass already exceeds target badly, no need to finish
      if (totalSize > targetBytes * 1.6 && i > 2) break;
    }

    if (totalSize <= targetBytes || s === settingsList.length - 1) {
      chosenBlobs = blobs.length === decoded.length ? blobs : null;
      chosenDims = dims;
      if (chosenBlobs) break;
      if (s === settingsList.length - 1) {
        // last resort: force finish full pass at lowest setting even if bail-out triggered
        const blobs2 = [];
        const dims2 = [];
        for (let i = 0; i < decoded.length; i++) {
          const canvas = drawToCanvas(decoded[i].img, decoded[i].orientation, maxDim);
          const blob = await canvasToBlob(canvas, quality);
          blobs2.push(blob);
          dims2.push({ w: canvas.width, h: canvas.height });
        }
        chosenBlobs = blobs2;
        chosenDims = dims2;
      }
    }
  }

  // Step 3: assemble PDF with jsPDF, one image per page sized to image aspect ratio
  statusText.textContent = 'Собираем PDF…';
  const { jsPDF } = window.jspdf;
  let pdf = null;

  for (let i = 0; i < chosenBlobs.length; i++) {
    const blob = chosenBlobs[i];
    const dataUrl = await blobToDataURL(blob);
    const { w, h } = chosenDims[i];

    // Convert pixel size to mm at 150dpi effective for page sizing (keeps proportions, reasonable page size)
    const dpi = 150;
    const pageWmm = (w / dpi) * 25.4;
    const pageHmm = (h / dpi) * 25.4;
    const orientation = pageWmm > pageHmm ? 'l' : 'p';

    if (i === 0) {
      pdf = new jsPDF({ orientation, unit: 'mm', format: [pageWmm, pageHmm], compress: true });
    } else {
      pdf.addPage([pageWmm, pageHmm], orientation);
    }
    pdf.addImage(dataUrl, 'JPEG', 0, 0, pageWmm, pageHmm, undefined, 'FAST');

    barFill.style.width = `${80 + Math.round(((i + 1) / chosenBlobs.length) * 18)}%`;
  }

  const pdfBlob = pdf.output('blob');
  barFill.style.width = '100%';
  statusText.textContent = 'Готово';

  const finalMB = (pdfBlob.size / (1024 * 1024)).toFixed(2);
  finalSizeEl.textContent = `${finalMB} МБ`;
  finalSizeEl.className = pdfBlob.size <= targetMB * 1024 * 1024 ? 'size-big size-ok' : 'size-big';

  const url = URL.createObjectURL(pdfBlob);
  downloadLink.href = url;
  downloadLink.download = `document_${new Date().toISOString().slice(0,10)}.pdf`;

  progressWrap.style.display = 'none';
  resultBox.style.display = 'block';
  buildBtn.disabled = false;
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// ---- Register service worker for offline/PWA behavior ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
