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
  const line = (value, x, y, width, size = 8) => {
    const text = clean(value).replace(/\s+/g, ' ').trim();
    if (!text) return;
    while (font.widthOfTextAtSize(text, size) > width && size > 6) size -= 0.25;
    if (font.widthOfTextAtSize(text, size) > width) throw new Error('Reduza um dos textos para caber no formulário AIH.');
    page.drawText(text, { x, y, size, font, color });
  };
  const block = (value, x, y, width, maxLines, size = 8, lineHeight = 10) => {
    const lines = [];
    for (const paragraph of clean(value).split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (font.widthOfTextAtSize(word, size) > width) throw new Error('Há uma palavra longa demais para o formulário AIH.');
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
        else { lines.push(current); current = word; }
      }
      lines.push(current);
    }
    if (lines.length > maxLines) throw new Error('Reduza o texto da justificativa para caber no formulário AIH.');
    lines.forEach((text, index) => { if (text) page.drawText(text, { x, y: y - index * lineHeight, size, font, color }); });
  };
  line(values.placeName, 60, 744, 408);
  line(values.cnes, 480, 744, 95);
  line(values.executorName, 60, 719, 408);
  line(values.executorCnes, 480, 719, 95);
  line(values.patient, 60, 680, 414);
  line(values.recordNumber, 485, 680, 90);
  line(values.cns, 60, 656, 240);
  line(values.birthDate, 316, 656, 100);
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
  block(values.symptoms, 60, 526, 515, 8);
  block(values.conditions, 60, 420, 515, 4);
  block(values.tests, 60, 365, 515, 3);
  line(values.diagnosis, 112, 313, 165);
  line(values.cid, 287, 313, 82);
  line(values.secondaryCid, 379, 313, 82);
  line(values.associatedCid, 470, 313, 105);
  if (font.widthOfTextAtSize(clean(values.procedure), 6) > 397) block(values.procedure, 42, 278, 397, 2, 6, 7);
  else line(values.procedure, 42, 275, 397);
  line(values.code, 449, 275, 125);
  line(values.clinic, 64, 252, 66);
  line(values.admission, 140, 252, 112);
  if (values.professionalCpf) {
    line('X', 294, 253, 9);
    line(values.professionalCpf, 335, 252, 239);
  }
  line(values.professional, 42, 228, 246);
  line(values.date, 297, 228, 78);
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
