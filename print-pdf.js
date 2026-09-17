/* PDF gerado localmente: a impressão não depende da paginação HTML do iOS. */
let pdfLibraries;
function loadPdfLibraries() {
  if (pdfLibraries) return pdfLibraries;
  const load = (source, available) => available() ? Promise.resolve() : new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(source, document.baseURI).href;
    script.onload = () => available() ? resolve() : reject(new Error('Biblioteca indisponível'));
    script.onerror = () => { script.remove(); reject(new Error('Falha no carregamento do PDF')); };
    document.head.append(script);
  });
  pdfLibraries = Promise.all([
    load('vendor/html2canvas-1.4.1.min.js', () => typeof window.html2canvas === 'function'),
    load('vendor/jspdf-4.2.1.umd.min.js', () => typeof window.jspdf?.jsPDF === 'function')
  ]).catch(error => { pdfLibraries = undefined; throw error; });
  return pdfLibraries;
}
async function createPreviewPdf(preview) {
  await loadPdfLibraries();
  await document.fonts.ready;
  const pages = [...preview.querySelectorAll(':scope > .paper, :scope > .special-sheet')];
  if (!pages.length) throw new Error('Nenhuma folha disponível');
  const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: 'Flow Receita — Documento', creator: 'Flow Receita' });
  for (const [index, page] of pages.entries()) {
    const canvas = await window.html2canvas(page, {
      scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true,
      windowWidth: window.innerWidth, windowHeight: window.innerHeight,
      onclone: cloned => {
        const overlay = cloned.getElementById('printPreview');
        overlay.style.cssText += ';position:static!important;inset:auto!important;overflow:visible!important;padding:0!important;';
        overlay.querySelector('.preview-toolbar').style.display = 'none';
        cloned.querySelectorAll('body > .screen, body > .toast').forEach(element => element.remove());
        cloned.querySelectorAll('.clinic-fallback').forEach(element => {
          element.style.display = 'flex'; element.style.alignItems = 'center'; element.style.justifyContent = 'center';
        });
      }
    });
    if (index) pdf.addPage('a4', 'portrait');
    // Cada folha vira uma página física, inclusive as duas vias especiais.
    const factor = Math.min(210 / canvas.width, 297 / canvas.height);
    const width = canvas.width * factor, height = canvas.height * factor;
    pdf.addImage(canvas, 'JPEG', (210 - width) / 2, 0, width, height, undefined, 'FAST');
    canvas.width = 0; canvas.height = 0;
  }
  return pdf.output('blob');
}
async function printPreviewPdf(preview) {
  const button = preview.querySelector('#confirmPrint');
  if (button.disabled) return false;
  // Abre durante o toque, antes das operações assíncronas, para permitir a nova aba no iOS.
  const viewer = window.open('', '_blank');
  if (!viewer) { toast('Permita abrir a nova aba para visualizar e imprimir o PDF.'); return false; }
  viewer.opener = null;
  viewer.document.title = 'Preparando documento';
  viewer.document.body.textContent = 'Preparando PDF para imprimir ou salvar…';
  const controls = [...preview.querySelectorAll('button, input')].filter(control => control !== button);
  const states = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  const label = button.textContent;
  button.disabled = true; button.textContent = 'Preparando PDF…';
  try {
    const blob = await createPreviewPdf(preview);
    const url = URL.createObjectURL(blob);
    if (viewer.closed) { URL.revokeObjectURL(url); throw new Error('Visualização fechada'); }
    viewer.location.replace(url);
    // A aba do PDF permanece disponível para impressão e compartilhamento.
    window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true });
    toast('PDF aberto. Use Compartilhar → Imprimir no iPhone/iPad.');
    return true;
  } catch (error) {
    if (!viewer.closed) viewer.close();
    toast('Não foi possível preparar o PDF. Tente novamente.');
    return false;
  } finally {
    button.disabled = false; button.textContent = label;
    controls.forEach((control, index) => { control.disabled = states[index]; });
  }
}
