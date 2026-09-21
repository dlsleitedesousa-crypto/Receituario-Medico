/* Preenche o laudo AIH original fornecido pelo usuário. */
async function createAihTemplatePdf(values, templateBytes, PDFLib) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.load(templateBytes);
  if (pdf.getPageCount() !== 1) throw new Error('Modelo AIH inesperado.');
  const page = pdf.getPage(0);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const color = rgb(0.07, 0.13, 0.2);
  const clean = value => Array.from(String(value ?? '').replace(/\r/g, ''))
    .map(char => { try { font.encodeText(char); return char; } catch { return '?'; } }).join('');
  const line = (value, x, y, width, size = 10, label = 'texto') => {
    const text = clean(value).replace(/\s+/g, ' ').trim();
    if (!text) return;
    while (font.widthOfTextAtSize(text, size) > width && size > 6) size -= 0.25;
    if (font.widthOfTextAtSize(text, size) > width) throw new Error(`Reduza o ${label} para caber na lacuna do formulário AIH.`);
    page.drawText(text, { x, y, size, font, color });
  };
  const wrap = (value, width, size) => {
    const lines = [];
    for (const paragraph of clean(value).split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (font.widthOfTextAtSize(word, size) > width) return null;
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
        else { lines.push(current); current = word; }
      }
      lines.push(current);
    }
    return lines;
  };
  const block = (value, x, y, width, height, label) => {
    if (!String(value || '').trim()) return;
    let size, lines, lineHeight;
    for (let candidate = 12; candidate >= 7; candidate -= 0.5) {
      const wrapped = wrap(value, width, candidate);
      const leading = candidate + 2;
      if (wrapped && (wrapped.length - 1) * leading <= height) { size = candidate; lines = wrapped; lineHeight = leading; break; }
    }
    if (!lines) throw new Error(`Reduza ${label} para caber na lacuna do formulário AIH.`);
    lines.forEach((text, index) => { if (text) page.drawText(text, { x, y: y - index * lineHeight, size, font, color }); });
  };
  const boxedDigits = (value, count, firstCenter, spacing, y, label) => {
    if (!value) return;
    const digits = String(value).replace(/\D/g, '');
    if (digits.length !== count) throw new Error(`${label} deve ter ${count} dígitos.`);
    [...digits].forEach((digit, index) => page.drawText(digit, {
      x: firstCenter + index * spacing - font.widthOfTextAtSize(digit, 10) / 2,
      y, size: 10, font, color
    }));
  };
  const boxedDate = (value, positions, y, label) => {
    if (!value) return;
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) throw new Error(`${label} inválida.`);
    positions.forEach((left, index) => line(match[index + 1], left, y, index === 2 ? 35 : 18, 10));
  };
  line(values.placeName, 60, 744, 408);
  boxedDigits(values.cnes, 7, 477.5, 15, 744, 'CNES');
  line(values.executorName, 60, 719, 408);
  boxedDigits(values.executorCnes, 7, 477.5, 15, 719, 'CNES executante');
  line(values.patient, 60, 680, 414);
  line(values.recordNumber, 485, 680, 90);
  line(values.cns, 60, 656, 240);
  boxedDate(values.birthDate, [316, 340, 360], 656, 'Data de nascimento');
  if (values.sex === 'Masculino') line('X', 400, 657, 12);
  if (values.sex === 'Feminino') line('X', 454, 657, 12);
  line(values.race, 520, 656, 55);
  line(values.mother, 60, 632, 350);
  line(values.contact, 424, 632, 150);
  line(values.responsible, 60, 608, 350);
  line(values.responsibleContact, 424, 608, 150);
  line(values.address, 60, 590, 515);
  line(values.city, 60, 566, 295);
  line(values.cityCode, 365, 566, 78);
  line(values.state, 454, 566, 50);
  line(values.postcode, 515, 566, 60);
  block(values.symptoms, 60, 526, 515, 80, 'os sinais e sintomas');
  block(values.conditions, 60, 420, 515, 30, 'as condições que justificam');
  block(values.tests, 60, 365, 515, 26, 'os resultados diagnósticos');
  line(values.diagnosis, 35, 313, 230, 10, 'diagnóstico');
  line(values.cid, 287, 313, 82);
  line(values.secondaryCid, 379, 313, 82);
  line(values.associatedCid, 470, 313, 105);
  const procedureText = clean(values.procedure).replace(/\s+/g, ' ').trim();
  if (font.widthOfTextAtSize(procedureText, 8) <= 335) line(procedureText, 42, 275, 335, 10, 'procedimento');
  else {
    let size, lines;
    for (const candidate of [7.5, 7, 6.5, 6]) {
      const wrapped = wrap(procedureText, 335, candidate);
      if (wrapped && wrapped.length <= 2) { size = candidate; lines = wrapped; break; }
    }
    if (!lines) throw new Error('Reduza o procedimento para caber na lacuna do formulário AIH.');
    lines.forEach((text, index) => page.drawText(text, { x: 42, y: 279 - index * size, size, font, color }));
  }
  boxedDigits(values.code, 10, 408.75, 17.5, 275, 'Código SIGTAP');
  line(values.clinic, 64, 252, 66);
  line(values.admission, 140, 252, 112);
  if (values.professionalCpf) {
    line('X', 294, 253, 9);
    boxedDigits(values.professionalCpf, 11, 356.25, 15.5, 252, 'CPF do profissional');
  }
  line(values.professional, 42, 228, 246);
  boxedDate(values.date, [299, 326, 352], 228, 'Data da solicitação');
  const accidentY = { transito: 194, trabalho: 180, trajeto: 166 };
  if (accidentY[values.accident]) line('X', 52, accidentY[values.accident], 9);
  line(values.insurer, 198, 190, 228);
  line(values.ticket, 439, 190, 81);
  line(values.series, 530, 190, 45);
  line(values.company, 198, 164, 224);
  line(values.cnae, 433, 164, 86);
  line(values.cbor, 530, 164, 45);
  const socialX = { Empregado: 50, Empregador: 139, 'Autônomo': 232, Desempregado: 317, Aposentado: 417, 'Não segurado': 507 };
  if (socialX[values.socialSecurity]) line('X', socialX[values.socialSecurity], 142, 9);
  pdf.setTitle('Laudo para Solicitação de Autorização de Internação Hospitalar');
  return pdf.save();
}

async function openAihTemplatePdf(values) {
  const viewer = window.open('', '_blank');
  if (!viewer) { toast('Permita abrir uma nova aba para visualizar a AIH.'); return false; }
  viewer.opener = null;
  viewer.document.title = 'Preparando AIH';
  viewer.document.body.textContent = 'Preparando PDF da AIH…';
  try {
    const [library, response] = await Promise.all([loadApacPdfLibrary(), fetch('assets/aih-modelo.pdf?v=20260921')]);
    if (!response.ok) throw new Error('Modelo AIH indisponível.');
    const bytes = await createAihTemplatePdf(values, await response.arrayBuffer(), library);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (viewer.closed) { URL.revokeObjectURL(url); return false; }
    viewer.location.replace(url);
    window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true });
    toast('PDF da AIH aberto para imprimir ou salvar.');
    return true;
  } catch (error) {
    if (!viewer.closed) viewer.close();
    toast(error.message || 'Não foi possível gerar a AIH.');
    return false;
  }
}

if (typeof module !== 'undefined') module.exports = { createAihTemplatePdf };
