/** A4 content area in mm. Keep each section intact, including oversized charts. */
export const PDF_PAGE = { width: 210, height: 297, margin: 14, top: 25, bottom: 280, gap: 5 };
export function placePdfSections(sizes: {width: number; height: number}[]) {
  let page = 0, y = PDF_PAGE.top;
  const availableWidth = PDF_PAGE.width - 2 * PDF_PAGE.margin;
  const availableHeight = PDF_PAGE.bottom - PDF_PAGE.top;
  return sizes.map(size => {
    if (!(size.width > 0 && size.height > 0)) throw new Error('Empty PDF section');
    const scale = Math.min(availableWidth / size.width, availableHeight / size.height);
    const width = size.width * scale, height = size.height * scale;
    if (y + height > PDF_PAGE.bottom + 0.01) { page++; y = PDF_PAGE.top; }
    const placement = {page, x: (PDF_PAGE.width - width) / 2, y, width, height};
    y += height + PDF_PAGE.gap;
    return placement;
  });
}
