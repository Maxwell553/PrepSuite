import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { PDF_PAGE, placePdfSections } from './pdfLayout';

const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

async function waitForReport(element: HTMLElement) {
  await frame();
  const deadline = Date.now() + 25000;
  while (element.querySelector('[data-pdf-loading="true"]')) {
    if (Date.now() > deadline) throw new Error('Rating history is still loading. Please try again.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await document.fonts.ready;
  // Allow ResizeObserver and React's chart layout to settle after export width changes.
  await frame(); await frame(); await frame();
}

const capture = (element: HTMLElement, backgroundColor: string) => toPng(element, {
  pixelRatio: 2,
  backgroundColor,
  // Export uses system fonts explicitly. Do not inspect cross-origin Google CSS rules.
  skipFonts: true,
  style: {position: 'static', left: 'auto', top: 'auto', zIndex: 'auto', margin: '0'},
  filter: node => !(node instanceof HTMLElement) ||
    (!node.classList.contains('print:hidden') && !node.hasAttribute('data-pdf-exclude')),
});

/** Export complete cards, not slices of one tall bitmap. Independent of viewport width. */
export async function exportReportAsPdf(element: HTMLElement, playerName: string): Promise<void> {
  const originalStyle = element.style.cssText;
  const fixes: {el: HTMLElement; style: string}[] = [];
  const details = Array.from(element.querySelectorAll<HTMLDetailsElement>('details[data-pdf-section]'));
  const detailStates = details.map(el => el.open);
  try {
    element.classList.add('pdf-export-active');
    Object.assign(element.style, {width: '1000px', minWidth: '1000px', maxWidth: 'none'});
    details.forEach(el => {el.open = true;});
    element.querySelectorAll<HTMLElement>('[data-pdf-section], [data-pdf-section] *').forEach(el => {
      if (el.style.maxHeight || /overflow-(hidden|auto|[xy]-auto)/.test(el.className)) {
        fixes.push({el, style: el.style.cssText});
        el.style.maxHeight = 'none'; el.style.overflow = 'visible';
      }
    });
    await waitForReport(element);
    const sections = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-section]'))
      .filter(el => !el.parentElement?.closest('[data-pdf-section]') && el.getBoundingClientRect().height > 0);
    // Keep the actionable plan with the overview, before the detailed charts.
    const order = ['report-panel-overview','report-panel-preparation','report-panel-openings','report-panel-games','report-panel-activity'];
    sections.sort((a,b) => order.indexOf(a.closest('[role=tabpanel]')?.id || '') - order.indexOf(b.closest('[role=tabpanel]')?.id || ''));
    if (!sections.length) throw new Error('No report content to export');
    const images: {data: string; width: number; height: number}[] = [];
    for (const section of sections) {
      const {width, height} = section.getBoundingClientRect();
      images.push({data: await capture(section, '#101525'), width, height});
    }
    const positions = placePdfSections(images);
    const pdf = new jsPDF('p', 'mm', 'a4');
    let page = 0;
    images.forEach((image, i) => {
      const p = positions[i];
      while (page < p.page) {pdf.addPage(); page++;}
      pdf.addImage(image.data, 'PNG', p.x, p.y, p.width, p.height, undefined, 'FAST');
    });
    for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
      pdf.setPage(i); pdf.setFontSize(9); pdf.setTextColor(70, 70, 85);
      pdf.text('PrepSuite.ai | Opponent scouting', PDF_PAGE.margin, 15);
      pdf.setFontSize(7);
      pdf.text(`Generated ${new Date().toISOString().slice(0, 10)} | Historical results; verify independently.`, PDF_PAGE.margin, 289);
      pdf.text(`${i} / ${pdf.getNumberOfPages()}`, 196, 289, {align: 'right'});
    }
    pdf.save(`PrepSuite_${playerName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}_${new Date().toISOString().slice(0, 10)}.pdf`);
  } finally {
    fixes.forEach(({el, style}) => {el.style.cssText = style;});
    details.forEach((el, i) => {el.open = detailStates[i];});
    element.style.cssText = originalStyle;
    element.classList.remove('pdf-export-active');
  }
}

/** Compact, one-page sheet rendered from the currently selected preparation filters. */
export async function exportRoundSheetAsPdf(element: HTMLElement): Promise<void> {
  await document.fonts.ready;
  await frame();
  const image = await capture(element, '#ffffff');
  const {width, height} = element.getBoundingClientRect();
  const scale = Math.min(182 / width, 265 / height);
  const pdf = new jsPDF('p', 'mm', 'a4');
  pdf.addImage(image, 'PNG', (210 - width * scale) / 2, 14, width * scale, height * scale, undefined, 'FAST');
  pdf.save('round-preparation.pdf');
}
