
const I18N = {
  ru: {
    tagline: "Универсальный инструмент для работы с документами: объединение, сжатие, распознавание текста и конвертация — полностью офлайн.",
    offlineBadge: "● Полностью офлайн, включая OCR",
    tabMerge: "Собрать PDF",
    tabConvert: "PDF → JPEG",
    dropTitle: "Нажмите, чтобы выбрать файлы",
    dropSubtitle: "Фото, PDF или Word — можно комбинировать",
    batchNote: "⚠ Больше 25 страниц — результат будет автоматически разбит на несколько PDF-файлов.",
    docTitleLabel: "Название документа",
    docTitlePlaceholder: "например: Отчёт за июль",
    paramsLabel: "Параметры",
    targetSizeLabel: "Желаемый размер файла",
    bwLabel: "Чёрно-белый режим (меньше вес для сканов текста)",
    stampLabel: "Штамп даты и номера страницы",
    ocrLabel: "Распознавание текста OCR (офлайн)",
    dragHint: "Порядок страниц — перетащите файлы в списке выше за значок ☰.",
    buildBtn: "Собрать PDF",
    preparing: "Готовим…",
    techDetails: "Технические детали",
    ocrResultLabel: "Распознанный текст (OCR)",
    copyText: "Скопировать текст",
    downloadTxt: "Скачать .txt",
    dropConvertTitle: "Нажмите, чтобы выбрать PDF",
    dropConvertSubtitle: "Каждая страница станет отдельным изображением JPEG",
    convertResultLabel: "Результат",
    downloadAllZip: "Скачать все страницы (.zip)",
    footerText: "Работает полностью офлайн, на устройстве. Файлы и данные никуда не отправляются.",
    copied: "Текст скопирован в буфер обмена",
    noFilesSelected: "Сначала добавьте файлы.",
    initBuild: "Инициализация сборки…",
    totalPhotos: (n,b) => `Всего страниц: ${n}, частей PDF: ${b}`,
    loadingPart: (i,t) => `Часть ${i} из ${t}: загружаем файлы…`,
    loadingFiles: "Загружаем файлы…",
    decoding: (i,t) => `Обрабатываем файл ${i} из ${t}…`,
    compressTry: (q,d,s,t) => `Подбор сжатия: ${q}% качества, до ${d}px (попытка ${s}/${t})…`,
    ocrRecognizing: (i,t) => `Распознаём текст (OCR): страница ${i} из ${t}…`,
    ocrInit: "Инициализируем офлайн-модуль OCR…",
    assembling: "Собираем страницы в PDF…",
    done: "Готово. Файлы доступны для скачивания ниже.",
    convertSelectPdf: "Выберите PDF-файл для конвертации в изображения.",
    convertProcessing: (i,t) => `Обработка страницы ${i} из ${t}…`,
    convertDone: (n) => `Готово: ${n} стр. Нажмите на страницу, чтобы скачать отдельно.`,
    wordConverting: "Конвертируем Word-документ в изображения страниц…",
  },
  en: {
    tagline: "A universal document toolkit: merge, compress, recognize text and convert — fully offline.",
    offlineBadge: "● Fully offline, including OCR",
    tabMerge: "Build PDF",
    tabConvert: "PDF → JPEG",
    dropTitle: "Tap to choose files",
    dropSubtitle: "Photos, PDF or Word — mix freely",
    batchNote: "⚠ More than 25 pages — result will be split into several PDF files automatically.",
    docTitleLabel: "Document title",
    docTitlePlaceholder: "e.g. July Report",
    paramsLabel: "Settings",
    targetSizeLabel: "Desired file size",
    bwLabel: "Black & white mode (smaller size for text scans)",
    stampLabel: "Date and page number stamp",
    ocrLabel: "OCR text recognition (offline)",
    dragHint: "Page order — drag files above by the ☰ handle.",
    buildBtn: "Build PDF",
    preparing: "Preparing…",
    techDetails: "Technical details",
    ocrResultLabel: "Recognized text (OCR)",
    copyText: "Copy text",
    downloadTxt: "Download .txt",
    dropConvertTitle: "Tap to choose a PDF",
    dropConvertSubtitle: "Each page becomes a separate JPEG image",
    convertResultLabel: "Result",
    downloadAllZip: "Download all pages (.zip)",
    footerText: "Works fully offline, on your device. Files and data are never sent anywhere.",
    copied: "Text copied to clipboard",
    noFilesSelected: "Add files first.",
    initBuild: "Initializing…",
    totalPhotos: (n,b) => `Total pages: ${n}, PDF parts: ${b}`,
    loadingPart: (i,t) => `Part ${i} of ${t}: loading files…`,
    loadingFiles: "Loading files…",
    decoding: (i,t) => `Processing file ${i} of ${t}…`,
    compressTry: (q,d,s,t) => `Compression attempt: ${q}% quality, up to ${d}px (try ${s}/${t})…`,
    ocrRecognizing: (i,t) => `Recognizing text (OCR): page ${i} of ${t}…`,
    ocrInit: "Initializing offline OCR module…",
    assembling: "Assembling pages into PDF…",
    done: "Done. Files are available for download below.",
    convertSelectPdf: "Select a PDF file to convert to images.",
    convertProcessing: (i,t) => `Processing page ${i} of ${t}…`,
    convertDone: (n) => `Done: ${n} pages. Tap a page to download it separately.`,
    wordConverting: "Converting Word document to page images…",
  }
};

let currentLang = 'ru';

function t(key, ...args) {
  const entry = I18N[currentLang][key] ?? I18N.ru[key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (I18N[currentLang][key]) el.textContent = I18N[currentLang][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (I18N[currentLang][key]) el.setAttribute('placeholder', I18N[currentLang][key]);
  });
}

function setLang(lang) {
  currentLang = I18N[lang] ? lang : 'ru';
  applyI18n();
}
