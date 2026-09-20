/* Preenche o modelo PDF fornecido pelo usuário, preservando sua página original. */
async function createApacTemplatePdf(values, templateBytes, PDFLib) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const document = await PDFDocument.load(templateBytes);
  if (document.getPageCount() !== 1) throw new Error('Modelo APAC inesperado');
  const page = document.getPage(0);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const color = rgb(0.07, 0.13, 0.2);
  const clean = value => Array.from(String(value ?? '').replace(/\r/g, ''))
    .map(character => { try { font.encodeText(character); return character; } catch { return '?'; } }).join('');
  const fit = (value, x, y, width, size = 9) => {
    const text = clean(value).replace(/\s+/g, ' ').trim();
    while (text && font.widthOfTextAtSize(text, size) > width && size > 6) size -= 0.5;
    if (text && font.widthOfTextAtSize(text, size) > width) throw new Error('Reduza um dos nomes para caber no modelo APAC');
    if (text) page.drawText(text, { x, y, size, font, color });
  };
  const wrapped = (value, x, y, width, size, maxLines, lineHeight) => {
    const paragraphs = clean(value).split('\n');
    const lines = [];
    for (const paragraph of paragraphs) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
        else {
          if (line) lines.push(line);
          line = word;
          if (font.widthOfTextAtSize(line, size) > width) throw new Error('Há uma palavra longa demais para o modelo APAC');
        }
      }
      lines.push(line);
    }
    if (lines.length > maxLines) throw new Error('Reduza o texto do diagnóstico ou das observações para caber no modelo APAC');
    lines.forEach((line, index) => { if (line) page.drawText(line, { x, y: y - index * lineHeight, size, font, color }); });
  };
  const procedureName = clean(values.procedure).replace(/\s+/g, ' ').trim();
  let procedureLines;
  let procedureSize;
  for (let size = 8.5; size >= 6.5; size -= 0.5) {
    const lines = [''];
    for (const word of procedureName.split(' ')) {
      const index = lines.length - 1;
      const candidate = lines[index] ? `${lines[index]} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= 267) lines[index] = candidate;
      else lines.push(word);
    }
    if (lines.length <= 2 && lines.every(line => font.widthOfTextAtSize(line, size) <= 267)) {
      procedureLines = lines; procedureSize = size; break;
    }
  }
  if (!procedureLines) {
    const size = 6;
    const lines = [''];
    for (const word of procedureName.split(' ')) {
      const index = lines.length - 1;
      const candidate = lines[index] ? `${lines[index]} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= 267) lines[index] = candidate;
      else lines.push(word);
    }
    if (lines.length <= 3 && lines.every(line => font.widthOfTextAtSize(line, size) <= 267)) {
      procedureLines = lines; procedureSize = size;
    }
  }
  if (!procedureLines) throw new Error('O nome do procedimento não cabe no campo do modelo APAC');
  procedureLines.forEach((line, index) => page.drawText(line, {
    x: 217, y: procedureLines.length === 1 ? 541 : procedureLines.length === 2 ? 547 - index * 8.5 : 549 - index * 5.5,
    size: procedureSize, font, color
  }));
  const code = String(values.code || '').replace(/\D/g, '');
  if (code.length !== 10) throw new Error('O código SIGTAP deve ter 10 dígitos');
  [...code].forEach((digit, index) => {
    const center = 42.5 + index * 17.6;
    page.drawText(digit, { x: center - font.widthOfTextAtSize(digit, 9) / 2, y: 539, size: 9, font, color });
  });
  const drawDate = (value, centers, y, label) => {
    if (!value) return;
    const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value));
    if (!parts) throw new Error(`${label} inválida`);
    parts.slice(1).forEach((part, index) => page.drawText(part, {
      x: centers[index] - font.widthOfTextAtSize(part, 9) / 2, y, size: 9, font, color
    }));
  };
  drawDate(values.date, [309.5, 334, 362], 211, 'Data da solicitação');
  drawDate(values.birthDate, [317, 342, 372], 676, 'Data de nascimento');
  fit(values.cnes, 495, 739, 60, 9);
  fit(values.patient, 36, 700, 423, 9);
  fit(values.quantity, 508, 539, 43, 9);
  wrapped(values.diagnosis, 36, 348, 291, 8, 2, 9);
  fit(values.cid, 337, 347, 52, 9);
  wrapped(values.notes, 36, 315, 515, 9, 7, 10);
  fit(values.professional, 36, 211, 248, 9);
  document.setTitle('Laudo para Solicitação/Autorização de Procedimento Ambulatorial');
  return document.save();
}

let apacPdfLibrary;
function loadApacPdfLibrary() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!apacPdfLibrary) apacPdfLibrary = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('vendor/pdf-lib-1.17.1.min.js', document.baseURI).href;
    script.onload = () => window.PDFLib ? resolve(window.PDFLib) : reject(new Error('Biblioteca PDF indisponível'));
    script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca PDF'));
    document.head.append(script);
  }).catch(error => { apacPdfLibrary = undefined; throw error; });
  return apacPdfLibrary;
}

async function openApacTemplatePdf(values) {
  const viewer = window.open('', '_blank');
  if (!viewer) { toast('Permita abrir uma nova aba para visualizar a APAC.'); return false; }
  viewer.opener = null;
  viewer.document.title = 'Preparando APAC';
  viewer.document.body.textContent = 'Preparando PDF da APAC…';
  try {
    const [library, response] = await Promise.all([loadApacPdfLibrary(), fetch('assets/apac-modelo.pdf?v=20260920-birth')]);
    if (!response.ok) throw new Error('Modelo APAC indisponível');
    const bytes = await createApacTemplatePdf(values, await response.arrayBuffer(), library);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (viewer.closed) { URL.revokeObjectURL(url); return false; }
    viewer.location.replace(url);
    window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true });
    toast('PDF da APAC aberto para imprimir ou salvar.');
    return true;
  } catch (error) {
    if (!viewer.closed) viewer.close();
    toast(error.message || 'Não foi possível gerar a APAC.');
    return false;
  }
}

if (typeof module !== 'undefined') module.exports = { createApacTemplatePdf };
