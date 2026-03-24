import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

/**
 * Capture the report DOM and export as a multi-page A4 PDF.
 * Uses html-to-image (foreignObject-based) which handles inline SVGs
 * (Recharts, etc.) far more reliably than html2canvas.
 *
 * Throws on failure so the caller can show a toast.
 */
export async function exportReportAsPdf(
  element: HTMLElement,
  playerName: string,
): Promise<void> {
  const PDF_CLASS = 'pdf-export-active';
  element.classList.add(PDF_CLASS);

  await new Promise((r) => setTimeout(r, 150));

  try {
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
        if (
          node.tagName === 'BUTTON' &&
          !node.hasAttribute('data-pdf-include')
        )
          return false;
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
    const margin = 10;
    const headerH = 8;
    const footerH = 8;
    const contentWidth = pdfWidth - margin * 2;
    const contentHeight = pdfHeight - margin * 2 - headerH - footerH;

    const ratio = contentWidth / (imgWidth / pixelRatio);
    const scaledTotalHeight = (imgHeight / pixelRatio) * ratio;
    const totalPages = Math.max(1, Math.ceil(scaledTotalHeight / contentHeight));

    const pdf = new jsPDF('p', 'mm', 'a4');

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();

      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 140);
      pdf.text('PrepSuite.ai Scouting Report', margin, margin);
      pdf.text(playerName, pdfWidth - margin, margin, { align: 'right' });

      const srcYPx = page * (contentHeight / ratio) * pixelRatio;
      const srcHPx = Math.min(
        (contentHeight / ratio) * pixelRatio,
        imgHeight - srcYPx,
      );
      const destH = (srcHPx / pixelRatio) * ratio;

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
        `Page ${page + 1} of ${totalPages}`,
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
    element.classList.remove(PDF_CLASS);
  }
}
