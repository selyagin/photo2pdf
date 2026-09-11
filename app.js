// Temporary runtime patch: restore the app and add a searchable PDF OCR layer.
(async () => {
  const url = 'https://raw.githubusercontent.com/selyagin/photo2pdf/fix/searchable-pdf-ocr/app.js';
  let source = await (await fetch(url, { cache: 'no-store' })).text();
  source = source.replace(`  let ocrPageTexts = [];
  if (ocrMode) {
    for (let i = 0; i < chosenCanvases.length; i++) {
      setStatus(t('ocrRecognizing', i+1, chosenCanvases.length));
      const data = await runQualityOcr(chosenCanvases[i]);
      if (data && data.text) ocrPageTexts.push(data.text.trim());
      barFill.style.width = \`${65 + Math.round(((i+1)/chosenCanvases.length)*10)}%\`;
    }
  }
`, `  const ocrPageData = [], ocrPageTexts = [];
  if (ocrMode) for (let i = 0; i < chosenCanvases.length; i++) {
    setStatus(t('ocrRecognizing', i+1, chosenCanvases.length));
    const data = await runQualityOcr(chosenCanvases[i]);
    ocrPageData.push(data || null);
    if (data && data.text) ocrPageTexts.push(data.text.trim());
    barFill.style.width = \`${65 + Math.round(((i+1)/chosenCanvases.length)*10)}%\`;
  }
`);
  source = source.replace(`    pdf.addImage(dataUrl,'JPEG',0,0,pageWmm,pageHmm,undefined,'FAST');
    barFill.style.width = \`${75 + Math.round(((i+1)/chosenBlobs.length)*20)}%\`;
`, `    pdf.addImage(dataUrl,'JPEG',0,0,pageWmm,pageHmm,undefined,'FAST');
    if (ocrMode) addSearchableOcrLayer(pdf, ocrPageData[i], w, h, pageWmm, pageHmm);
    barFill.style.width = \`${75 + Math.round(((i+1)/chosenBlobs.length)*20)}%\`;
`);
  source = source.replace('\nfunction downscaleCanvas', `
function addSearchableOcrLayer(pdf,data,w,h,pw,ph){const words=data&&Array.isArray(data.words)?data.words:[],sx=pw/w,sy=ph/h,old=pdf.getFontSize();words.forEach(q=>{const t=typeof q.text==='string'?q.text.trim():'',b=q.bbox||{},c=Number(q.confidence??q.conf??0),x=Number(b.x0),y=Number(b.y1),z=y-Number(b.y0);if(!t||c<25||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z)||z<=0)return;try{pdf.setFontSize(Math.max(3,z*sy*2.83464567*.82));pdf.text(t,x*sx,y*sy,{baseline:'alphabetic',renderingMode:'invisible'});}catch(e){log('OCR word skipped: '+e.message,'warn');}});pdf.setFontSize(old);}
function downscaleCanvas`);
  (0, eval)(source);
})().catch((error) => console.error('OCR PDF patch failed:', error));
