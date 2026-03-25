import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

/**
 * Capture the report DOM and export as a multi-page A4 PDF.
 * Uses html-to-image (foreignObject-based) which handles inline SVGs
 * (Recharts, etc.) far more reliably than html2canvas.
 *
 * Section-aware page breaks avoid cutting cards/charts in half.
 */
export async function exportReportAsPdf(
  element: HTMLElement,
  playerName: string,
): Promise<void> {
  const PDF_CLASS = 'pdf-export-active';
  element.classList.add(PDF_CLASS);

  const inlineFixups: { el: HTMLElement; orig: string }[] = [];

  element.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const needsFix =
      el.style.maxHeight ||
      el.style.overflow ||
      el.classList.contains('overflow-hidden') ||
      el.classList.contains('overflow-y-auto') ||
      el.classList.contains('overflow-auto') ||
      el.classList.contains('overflow-x-auto');
    if (needsFix) {
      inlineFixups.push({ el, orig: el.style.cssText });
      el.style.overflow = 'visible';
      el.style.maxHeight = 'none';
    }
  });

  await new Promise((r) => setTimeout(r, 300));

  try {
    const rootRect = element.getBoundingClientRect();
    const sections = Array.from(
      element.querySelectorAll<HTMLElement>('[data-pdf-section]'),
    );
    const sectionTops = sections
      .map((s) => s.getBoundingClientRect().top - rootRect.top)
      .filter((t) => t > 0)
      .sort((a, b) => a - b);

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    const dataUrl = await toPng(element, {
      pixelRatio,
      backgroundColor: '#0f172a',
      cacheBust: true,
      filter: (node: HTMLElement) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.classList?.contains('print:hidden')) return false;
        if (node.id === 'chat-section') return false;
        if (node.hasAttribute('data-practice-opponent')) return false;
        return true;
      },
    });

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load captured image'));
      img.src = dataUrl;
    });

    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    const pdfWidth = 210; // A4 mm
    const pdfHeight = 297;
    const margin = 14;
    const headerH = 8;
    const footerH = 8;
    const contentWidth = pdfWidth - margin * 2;
    const contentHeight = pdfHeight - margin * 2 - headerH - footerH;

    const scale = contentWidth / (imgWidth / pixelRatio);
    const cssPageHeight = contentHeight / scale;
    const totalCssHeight = imgHeight / pixelRatio;

    const pageStartsCss: number[] = [0];
    let cursor = 0;

    while (cursor + cssPageHeight < totalCssHeight) {
      const idealEnd = cursor + cssPageHeight;

      let bestBreak = idealEnd;
      for (const top of sectionTops) {
        if (top > cursor + 40 && top <= idealEnd) {
          bestBreak = top;
        }
      }
      pageStartsCss.push(bestBreak);
      cursor = bestBreak;
    }

    const totalPages = pageStartsCss.length;
    const pdf = new jsPDF('p', 'mm', 'a4');

    for (let p = 0; p < totalPages; p++) {
      if (p > 0) pdf.addPage();

      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 140);
      pdf.text('PrepSuite.ai Scouting Report', margin, margin);
      pdf.text(playerName, pdfWidth - margin, margin, { align: 'right' });

      const startCss = pageStartsCss[p];
      const endCss =
        p + 1 < totalPages ? pageStartsCss[p + 1] : totalCssHeight;
      const sliceCss = endCss - startCss;

      const srcYPx = startCss * pixelRatio;
      const srcHPx = Math.min(sliceCss * pixelRatio, imgHeight - srcYPx);
      const destH = sliceCss * scale;

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = imgWidth;
      pageCanvas.height = Math.ceil(srcHPx);
      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(
          img,
          0,
          srcYPx,
          imgWidth,
          srcHPx,
          0,
          0,
          imgWidth,
          srcHPx,
        );
        const pageData = pageCanvas.toDataURL('image/jpeg', 0.92);
        pdf.addImage(
          pageData,
          'JPEG',
          margin,
          margin + headerH,
          contentWidth,
          destH,
        );
      }

      pdf.setFontSize(7);
      pdf.setTextColor(100, 100, 120);
      pdf.text(
        `Generated ${new Date().toLocaleDateString()} | AI analysis — verify independently`,
        margin,
        pdfHeight - 5,
      );
      pdf.text(
        `Page ${p + 1} of ${totalPages}`,
        pdfWidth - margin,
        pdfHeight - 5,
        { align: 'right' },
      );
    }

    const safeName = playerName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    pdf.save(
      `PrepSuite_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  } finally {
    inlineFixups.forEach(({ el, orig }) => {
      el.style.cssText = orig;
    });
    element.classList.remove(PDF_CLASS);
  }
}
