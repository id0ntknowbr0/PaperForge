import { jsPDF } from 'jspdf';
import { InteriorConfig } from '../types';
import { generateSudoku, generateWordSearch, generateMaze } from './puzzleGenerators';
import { resolveCoverPreviewElements, extractSingleCoverPageElements } from './kdpMath';

export const TRIM_DIMENSIONS_INCHES: Record<string, { width: number; height: number }> = {
  '5x8': { width: 5.0, height: 8.0 },
  '5.5x8.5': { width: 5.5, height: 8.5 },
  '6x9': { width: 6.0, height: 9.0 },
  '7x10': { width: 7.0, height: 10.0 },
  '8x10': { width: 8.0, height: 10.0 },
  '8.5x11': { width: 8.5, height: 11.0 },
  '8.25x8.25': { width: 8.25, height: 8.25 },
  '8.25x6': { width: 8.25, height: 6.0 },
};

/**
 * Rasterizes/normalizes an image URL (including PNG, JPEG, WebP, or data:image/svg+xml)
 * into a clean 8-bit PNG/JPEG data URL for reliable jsPDF embedding.
 */
async function resolvePdfEmbeddableImage(
  imageUrl: string,
  widthPt: number,
  heightPt: number
): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  if (!imageUrl) return null;

  // In browser environments, normalize through HTML5 <canvas> so any image format
  // (SVG, WebP, interlaced PNG, CMYK JPEG, etc.) is decoded cleanly into 8-bit RGBA PNG for jsPDF
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const canvasResult = await new Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null>(resolve => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(160, Math.min(2000, Math.round(widthPt * 2)));
          canvas.height = Math.max(160, Math.min(2000, Math.round(heightPt * 2)));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ dataUrl: canvas.toDataURL('image/png'), format: 'PNG' });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    });
    if (canvasResult) {
      return canvasResult;
    }
  }

  if (imageUrl.startsWith('data:image/png')) {
    return { dataUrl: imageUrl, format: 'PNG' };
  }
  if (imageUrl.startsWith('data:image/jpeg') || imageUrl.startsWith('data:image/jpg')) {
    return { dataUrl: imageUrl, format: 'JPEG' };
  }
  return null;
}

/**
 * Helper to render a list of Studio elements (images, shapes, text) onto the active jsPDF page.
 */
async function renderElementsOnPdfPage(
  doc: jsPDF,
  elements: any[],
  widthPt: number,
  heightPt: number
): Promise<void> {
  if (!elements || elements.length === 0) return;

  for (const el of elements) {
    const elX = (el.x / 100) * widthPt;
    const elY = (el.y / 100) * heightPt;
    const elW = (el.width / 100) * widthPt;
    const elH = (el.height / 100) * heightPt;

    if (el.type === 'image' && el.imageUrl) {
      try {
        const embedded = await resolvePdfEmbeddableImage(el.imageUrl, elW, elH);
        if (embedded) {
          doc.addImage(embedded.dataUrl, embedded.format, elX, elY, elW, elH);
        }
      } catch {
        // ignore unsupported data URI format in jsPDF
      }
    } else if (el.type === 'shape') {
      doc.setDrawColor(30, 30, 30);
      doc.setLineWidth(el.strokeWidth || 1.2);
      if (el.shapeType === 'line') {
        doc.line(elX, elY + elH / 2, elX + elW, elY + elH / 2);
      } else if (el.shapeType === 'circle') {
        doc.ellipse(elX + elW / 2, elY + elH / 2, elW / 2, elH / 2);
      } else {
        doc.rect(elX, elY, elW, elH);
      }
    } else if (el.type === 'text' && el.text) {
      doc.setFont('helvetica', el.fontWeight === 'bold' ? 'bold' : 'normal');
      doc.setFontSize(el.fontSize || 12);
      if (el.fill && el.fill.startsWith('#') && el.fill.length === 7) {
        const hex = el.fill.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) || 25;
        const g = parseInt(hex.substring(2, 4), 16) || 28;
        const b = parseInt(hex.substring(4, 6), 16) || 35;
        doc.setTextColor(r, g, b);
      } else {
        doc.setTextColor(25, 28, 35);
      }
      const textX = el.textAlign === 'center' ? elX + elW / 2 : el.textAlign === 'right' ? elX + elW : elX;
      doc.text(el.text, textX, elY + elH * 0.7, {
        align: el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'right' : 'left',
      });
    }
  }
}

/**
 * Generates a real, Amazon KDP compliant vector PDF ready for immediate upload.
 * When project pages are provided, includes:
 *   1. Front Paper Cover (Page 1 of PDF, with front cover image & cover elements)
 *   2. All Inner Notebook Pages (with template lines/grids & inner page background colors)
 *   3. Back Paper Cover (Final page of PDF, with back cover image & cover elements)
 */
export async function generateInteriorPdf(
  config: InteriorConfig,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const presetTrim = TRIM_DIMENSIONS_INCHES[config.trimSize] || TRIM_DIMENSIONS_INCHES['6x9'];
  const trim = {
    width: config.customWidthIn || presetTrim.width,
    height: config.customHeightIn || presetTrim.height,
  };

  // 1 inch = 72 points in PDF standard
  let widthPt = trim.width * 72;
  let heightPt = trim.height * 72;

  const bleedIn = typeof config.bleedInches === 'number' ? config.bleedInches : config.bleed ? 0.125 : 0;
  // Amazon KDP Bleed: if bleed is enabled, add bleedIn to outer width and 2 * bleedIn to total height
  if (config.bleed && bleedIn > 0) {
    widthPt += bleedIn * 72;
    heightPt += bleedIn * 2 * 72;
  }

  const orientation = widthPt > heightPt ? 'landscape' : 'portrait';
  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: [widthPt, heightPt],
  });

  const allPages = config.pages || [];
  const coverPage = allPages.find(p => p.isCover);
  const interiorPages = allPages.filter(p => !p.isCover);
  const resolvedCoverElements = resolveCoverPreviewElements(allPages);
  const coverHasOwnImages = Boolean(coverPage?.elements?.some(e => e.type === 'image'));
  const includeBookCovers = Boolean(coverPage || resolvedCoverElements.some(e => e.type === 'image'));

  const spineWidthIn = Math.max(0.05, interiorPages.length * 0.002252);
  const effectiveBleedIn = bleedIn > 0 ? bleedIn : 0.125;
  const totalSpreadWidthIn = trim.width * 2 + spineWidthIn + effectiveBleedIn * 2;

  let hasAddedFirstPdfPage = false;

  // 1. RENDER FRONT PAPER COVER (First Page of PDF)
  if (includeBookCovers) {
    hasAddedFirstPdfPage = true;
    const coverBg = coverPage?.backgroundColor || '#FFFFFF';
    if (coverBg.toUpperCase() !== '#FFFFFF') {
      const hex = coverBg.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 255;
      const g = parseInt(hex.substring(2, 4), 16) || 255;
      const b = parseInt(hex.substring(4, 6), 16) || 255;
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, widthPt, heightPt, 'F');
    }

    const frontElements = extractSingleCoverPageElements({
      elements: resolvedCoverElements,
      side: 'front',
      totalWidthIn: totalSpreadWidthIn,
      bleedMarginIn: effectiveBleedIn,
      trimWidthIn: trim.width,
      spineWidthIn,
    });
    await renderElementsOnPdfPage(doc, frontElements, widthPt, heightPt);
  }

  // 2. RENDER INNER NOTEBOOK PAGES
  const totalPages = Math.min(Math.max(interiorPages.length > 0 ? interiorPages.length : config.pageCount, 1), 300);
  const topMarginIn =
    typeof config.topMargin === 'number' && !Number.isNaN(config.topMargin)
      ? config.topMargin
      : (config as any).margins?.top ?? 0.5;
  const bottomMarginIn =
    typeof config.bottomMargin === 'number' && !Number.isNaN(config.bottomMargin)
      ? config.bottomMargin
      : (config as any).margins?.bottom ?? 0.5;
  const insideMarginIn =
    typeof config.insideMargin === 'number' && !Number.isNaN(config.insideMargin)
      ? config.insideMargin
      : (config as any).margins?.left ?? 0.5;
  const outsideMarginIn =
    typeof config.outsideMargin === 'number' && !Number.isNaN(config.outsideMargin)
      ? config.outsideMargin
      : (config as any).margins?.right ?? 0.5;

  const marginT = topMarginIn * 72;
  const marginB = heightPt - bottomMarginIn * 72;
  const contentHeight = Math.max(40, marginB - marginT);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (hasAddedFirstPdfPage || pageNum > 1) {
      doc.addPage([widthPt, heightPt], orientation);
    }
    hasAddedFirstPdfPage = true;

    const pageData = interiorPages[pageNum - 1];

    // Page background color
    if (pageData?.backgroundColor && pageData.backgroundColor.toUpperCase() !== '#FFFFFF') {
      const hex = pageData.backgroundColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 255;
      const g = parseInt(hex.substring(2, 4), 16) || 255;
      const b = parseInt(hex.substring(4, 6), 16) || 255;
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, widthPt, heightPt, 'F');
    }

    // Determine alternate gutter margin for odd vs even pages if bound book
    const isEven = pageNum % 2 === 0;
    const pageMarginLeft = isEven ? outsideMarginIn * 72 : insideMarginIn * 72;
    const pageMarginRight = widthPt - (isEven ? insideMarginIn * 72 : outsideMarginIn * 72);
    const pContentWidth = Math.max(40, pageMarginRight - pageMarginLeft);

    // Optional page number
    if (config.showPageNumbers && pageData?.showPageNumber !== false) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      const pageStr = `${pageData?.pageNumber || pageNum}`;
      const xPos = isEven ? pageMarginLeft : pageMarginRight - 10;
      doc.text(pageStr, xPos, heightPt - 20);
    }

    // Optional Header
    if (config.headerText) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      doc.text(config.headerText.toUpperCase(), pageMarginLeft, marginT - 12);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(pageMarginLeft, marginT - 6, pageMarginRight, marginT - 6);
    }

    // Draw Interior Template Body using page-specific template and indexConfig if available
    const pageConfig: InteriorConfig = {
      ...config,
      interiorType: pageData?.templateType || config.interiorType || 'lined',
      indexConfig: pageData?.indexConfig,
    };
    renderPageContent(doc, pageConfig, pageNum, pageMarginLeft, marginT, pContentWidth, contentHeight);

    // Render any custom interior elements placed on this page (excluding paper cover images that were promoted to Front/Back cover)
    if (pageData?.elements && pageData.elements.length > 0) {
      const interiorOnlyElements = coverHasOwnImages
        ? pageData.elements
        : pageData.elements.filter(el => el.type !== 'image');
      await renderElementsOnPdfPage(doc, interiorOnlyElements, widthPt, heightPt);
    }

    if (onProgress && pageNum % 5 === 0) {
      onProgress(Math.round((pageNum / totalPages) * 100));
    }
  }

  // 3. RENDER BACK PAPER COVER (Final Page of PDF)
  if (includeBookCovers) {
    doc.addPage([widthPt, heightPt], orientation);
    const coverBg = coverPage?.backgroundColor || '#FFFFFF';
    if (coverBg.toUpperCase() !== '#FFFFFF') {
      const hex = coverBg.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 255;
      const g = parseInt(hex.substring(2, 4), 16) || 255;
      const b = parseInt(hex.substring(4, 6), 16) || 255;
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, widthPt, heightPt, 'F');
    }

    const backElements = extractSingleCoverPageElements({
      elements: resolvedCoverElements,
      side: 'back',
      totalWidthIn: totalSpreadWidthIn,
      bleedMarginIn: effectiveBleedIn,
      trimWidthIn: trim.width,
      spineWidthIn,
    });
    await renderElementsOnPdfPage(doc, backElements, widthPt, heightPt);
  }

  if (onProgress) onProgress(100);
  return doc.output('blob');
}


function renderPageContent(
  doc: jsPDF,
  config: InteriorConfig,
  pageNum: number,
  x: number,
  y: number,
  width: number,
  height: number
) {
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);

  switch (config.interiorType) {
    case 'ruled':
    case 'lined': {
      const lineStep = config.lineSpacing > 0 ? (config.lineSpacing / 25.4) * 72 : 20; // 20pt default (~7mm)
      let curY = y + 25;
      while (curY <= y + height) {
        doc.line(x, curY, x + width, curY);
        curY += lineStep;
      }
      break;
    }

    case 'ruled_field':
    case 'journal': {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text('DATE: ___________________', x + width - 140, y + 10);
      doc.text('SUBJECT: ___________________________', x, y + 10);
      doc.setDrawColor(180, 180, 180);
      let curY = y + 30;
      while (curY <= y + height) {
        doc.line(x, curY, x + width, curY);
        curY += 20;
      }
      break;
    }

    case 'music_sheet': {
      // 5-line musical staves
      const staffLines = 5;
      const lineGap = 6;
      const staffGap = 24;
      let curY = y + 15;
      while (curY + (staffLines * lineGap) <= y + height) {
        for (let l = 0; l < staffLines; l++) {
          doc.line(x, curY + (l * lineGap), x + width, curY + (l * lineGap));
        }
        curY += (staffLines * lineGap) + staffGap;
      }
      break;
    }

    case 'handwriting': {
      // 3-line primary handwriting paper with dashed center line
      const lineGap = 10;
      const groupGap = 16;
      let curY = y + 20;
      while (curY + (lineGap * 2) <= y + height) {
        // Top solid line
        doc.line(x, curY, x + width, curY);
        // Middle dashed line
        doc.setLineDashPattern([3, 3], 0);
        doc.line(x, curY + lineGap, x + width, curY + lineGap);
        doc.setLineDashPattern([], 0); // reset
        // Bottom solid line
        doc.line(x, curY + (lineGap * 2), x + width, curY + (lineGap * 2));
        curY += (lineGap * 2) + groupGap;
      }
      break;
    }

    case 'calligraphy': {
      // Slanted guide lines
      doc.setDrawColor(215, 215, 215);
      let curY = y + 20;
      while (curY <= y + height) {
        doc.line(x, curY, x + width, curY);
        curY += 15;
      }
      // Draw 55-degree slant guides
      doc.setLineDashPattern([2, 4], 0);
      for (let sx = x; sx <= x + width; sx += 30) {
        doc.line(sx, y, sx + (height * 0.4), y + height);
      }
      doc.setLineDashPattern([], 0);
      break;
    }

    case 'ruled_graph': {
      // Top half graph, bottom half ruled
      const halfH = height / 2;
      const gridStep = 14.17; // 5mm
      doc.setDrawColor(215, 215, 215);
      for (let curX = x; curX <= x + width; curX += gridStep) {
        doc.line(curX, y, curX, y + halfH);
      }
      for (let curY = y; curY <= y + halfH; curY += gridStep) {
        doc.line(x, curY, x + width, curY);
      }
      // Divider
      doc.setDrawColor(120, 120, 120);
      doc.line(x, y + halfH, x + width, y + halfH);
      // Bottom ruled lines
      doc.setDrawColor(180, 180, 180);
      let curY = y + halfH + 20;
      while (curY <= y + height) {
        doc.line(x, curY, x + width, curY);
        curY += 20;
      }
      break;
    }

    case 'blank_graph': {
      // Top half blank, bottom half graph
      const halfH = height / 2;
      const gridStep = 14.17;
      doc.setDrawColor(215, 215, 215);
      for (let curX = x; curX <= x + width; curX += gridStep) {
        doc.line(curX, y + halfH, curX, y + height);
      }
      for (let curY = y + halfH; curY <= y + height; curY += gridStep) {
        doc.line(x, curY, x + width, curY);
      }
      break;
    }

    case 'dot_graph':
    case 'dotgrid': {
      const dotStep = 14.17; // 5mm
      doc.setFillColor(150, 150, 150);
      for (let curX = x; curX <= x + width; curX += dotStep) {
        for (let curY = y; curY <= y + height; curY += dotStep) {
          doc.circle(curX, curY, 0.45, 'F');
        }
      }
      break;
    }

    case 'graph': {
      const gridStep = 14.17; // 5mm grid
      doc.setDrawColor(215, 215, 215);
      for (let curX = x; curX <= x + width; curX += gridStep) {
        doc.line(curX, y, curX, y + height);
      }
      for (let curY = y; curY <= y + height; curY += gridStep) {
        doc.line(x, curY, x + width, curY);
      }
      break;
    }

    case 'daily_planner': {
      // Header Date & Day of week
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text('DAILY FOCUS & SCHEDULE', x, y + 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('M  T  W  T  F  S  S   |   DATE: _______________', x + width - 200, y + 10);

      // Top Priorities (3 boxes)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('TOP PRIORITIES', x, y + 30);
      for (let i = 0; i < 3; i++) {
        const boxY = y + 36 + (i * 18);
        doc.rect(x, boxY, 10, 10);
        doc.line(x + 16, boxY + 8, x + width, boxY + 8);
      }

      // Left Column: Hourly Schedule (6am - 8pm)
      const colW = width * 0.48;
      const startSchedY = y + 105;
      doc.text('HOURLY SCHEDULE', x, startSchedY);
      const hours = ['6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM'];
      hours.forEach((h, idx) => {
        const rowY = startSchedY + 12 + (idx * 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text(h, x, rowY + 6);
        doc.line(x + 45, rowY + 8, x + colW, rowY + 8);
      });

      // Right Column: To-Do Checklist + Notes
      const rightX = x + colW + 14;
      const rightW = width - (colW + 14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 30, 30);
      doc.text('TO-DO CHECKLIST', rightX, startSchedY);
      for (let i = 0; i < 10; i++) {
        const todoY = startSchedY + 12 + (i * 16);
        doc.rect(rightX, todoY, 8, 8);
        doc.line(rightX + 14, todoY + 6, rightX + rightW, todoY + 6);
      }

      // Water Tracker + Notes block
      const notesY = startSchedY + 185;
      doc.text('NOTES & REFLECTIONS', rightX, notesY);
      doc.rect(rightX, notesY + 8, rightW, 110);

      // Water glasses
      doc.text('HYDRATION:', x, y + height - 12);
      for (let g = 0; g < 8; g++) {
        doc.circle(x + 65 + (g * 14), y + height - 14, 4);
      }
      break;
    }

    case 'password_log': {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(30, 30, 30);
      doc.text('INTERNET PASSWORDS & CREDENTIALS', x, y + 10);

      const entryH = 95;
      for (let e = 0; e < 4; e++) {
        const entryY = y + 26 + (e * (entryH + 8));
        if (entryY + entryH > y + height) break;
        doc.setDrawColor(180, 180, 180);
        doc.rect(x, entryY, width, entryH);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);

        doc.text('WEBSITE / APP:', x + 8, entryY + 18);
        doc.line(x + 80, entryY + 18, x + width - 8, entryY + 18);

        doc.text('USERNAME / ID:', x + 8, entryY + 38);
        doc.line(x + 80, entryY + 38, x + (width * 0.55), entryY + 38);

        doc.text('PIN / CODE:', x + (width * 0.58), entryY + 38);
        doc.line(x + (width * 0.72), entryY + 38, x + width - 8, entryY + 38);

        doc.text('PASSWORD:', x + 8, entryY + 58);
        doc.line(x + 80, entryY + 58, x + width - 8, entryY + 58);

        doc.text('NOTES / HINT:', x + 8, entryY + 78);
        doc.line(x + 80, entryY + 78, x + width - 8, entryY + 78);
      }
      break;
    }

    case 'habit_tracker': {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text('MONTHLY HABIT MATRIX', x, y + 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('MONTH: ____________________  YEAR: _______', x + width - 200, y + 10);

      // 31 day columns + habit name column
      const habitColW = 100;
      const dayColW = (width - habitColW) / 31;
      const startGridY = y + 30;

      // Table Header
      doc.rect(x, startGridY, width, 16);
      doc.text('HABIT / ROUTINE', x + 6, startGridY + 11);
      for (let d = 1; d <= 31; d++) {
        const dx = x + habitColW + ((d - 1) * dayColW);
        doc.line(dx, startGridY, dx, startGridY + 16);
        doc.setFontSize(6);
        doc.text(`${d}`, dx + 1, startGridY + 11);
      }

      // 16 Habit rows
      const rowH = 18;
      for (let r = 0; r < 16; r++) {
        const ry = startGridY + 16 + (r * rowH);
        if (ry + rowH > y + height) break;
        doc.rect(x, ry, width, rowH);
        for (let d = 1; d <= 31; d++) {
          const dx = x + habitColW + ((d - 1) * dayColW);
          doc.line(dx, ry, dx, ry + rowH);
        }
      }
      break;
    }

    case 'fitness_log': {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text('WORKOUT LOG & PROGRESSIVE OVERLOAD', x, y + 10);

      // Meta info bar
      doc.rect(x, y + 20, width, 24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('DATE: ___________   TIME: ________   BODY WEIGHT: ________   TARGET MUSCLE: ________________', x + 6, y + 35);

      // Exercise table
      const tableY = y + 54;
      const rowH = 18;
      doc.rect(x, tableY, width, 16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('EXERCISE', x + 6, tableY + 11);
      doc.text('SET 1', x + (width * 0.42), tableY + 11);
      doc.text('SET 2', x + (width * 0.54), tableY + 11);
      doc.text('SET 3', x + (width * 0.66), tableY + 11);
      doc.text('SET 4', x + (width * 0.78), tableY + 11);
      doc.text('SET 5', x + (width * 0.90), tableY + 11);

      for (let i = 0; i < 14; i++) {
        const ey = tableY + 16 + (i * rowH);
        doc.rect(x, ey, width, rowH);
        doc.line(x + (width * 0.40), ey, x + (width * 0.40), ey + rowH);
        doc.line(x + (width * 0.52), ey, x + (width * 0.52), ey + rowH);
        doc.line(x + (width * 0.64), ey, x + (width * 0.64), ey + rowH);
        doc.line(x + (width * 0.76), ey, x + (width * 0.76), ey + rowH);
        doc.line(x + (width * 0.88), ey, x + (width * 0.88), ey + rowH);
      }
      break;
    }

    case 'sudoku': {
      const puzzle = generateSudoku(config.difficulty || 'medium', pageNum * 77);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(30, 30, 30);
      doc.text(`SUDOKU PUZZLE #${pageNum}`, x + (width / 2) - 60, y + 20);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Difficulty: ${(config.difficulty || 'Medium').toUpperCase()}`, x + (width / 2) - 45, y + 35);

      const cellSize = Math.min(width, height - 80) / 9.5;
      const startGridX = x + (width - (cellSize * 9)) / 2;
      const startGridY = y + 55;

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cx = startGridX + (c * cellSize);
          const cy = startGridY + (r * cellSize);

          // Cell outline
          doc.setDrawColor(180, 180, 180);
          doc.setLineWidth(0.5);
          doc.rect(cx, cy, cellSize, cellSize);

          // Number
          const val = puzzle.grid[r][c];
          if (val !== 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(20, 20, 20);
            doc.text(`${val}`, cx + (cellSize / 2) - 4, cy + (cellSize / 2) + 5);
          }
        }
      }

      // Thick 3x3 box borders
      doc.setDrawColor(20, 20, 20);
      doc.setLineWidth(1.5);
      for (let b = 0; b <= 3; b++) {
        doc.line(startGridX, startGridY + (b * 3 * cellSize), startGridX + (9 * cellSize), startGridY + (b * 3 * cellSize));
        doc.line(startGridX + (b * 3 * cellSize), startGridY, startGridX + (b * 3 * cellSize), startGridY + (9 * cellSize));
      }
      break;
    }

    case 'word_search': {
      const defaultWords = ['JOURNAL', 'PLANNER', 'NOTEBOOK', 'KINDLE', 'AMAZON', 'AUTHOR', 'ROYALTY', 'PUBLISH', 'KEYWORDS', 'COVER', 'INTERIOR', 'BINDING'];
      const words = config.wordSearchKeywords ? config.wordSearchKeywords.split(',').map(s => s.trim()) : defaultWords;
      const ws = generateWordSearch(words, 12);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(30, 30, 30);
      doc.text(`WORD SEARCH PUZZLE #${pageNum}`, x + (width / 2) - 80, y + 20);

      const cellSize = Math.min(width * 0.85, height * 0.5) / 12;
      const startGridX = x + (width - (cellSize * 12)) / 2;
      const startGridY = y + 45;

      // Draw letters
      doc.setFont('courier', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      for (let r = 0; r < 12; r++) {
        for (let c = 0; c < 12; c++) {
          const cx = startGridX + (c * cellSize);
          const cy = startGridY + (r * cellSize);
          doc.text(ws.grid[r][c], cx + 4, cy + 12);
        }
      }

      // Box around grid
      doc.setDrawColor(50, 50, 50);
      doc.setLineWidth(1.0);
      doc.rect(startGridX - 4, startGridY - 4, (cellSize * 12) + 8, (cellSize * 12) + 8);

      // Word Bank below
      const bankY = startGridY + (cellSize * 12) + 25;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('FIND THESE WORDS:', startGridX, bankY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const cols = 3;
      ws.words.forEach((w, idx) => {
        const colIdx = idx % cols;
        const rowIdx = Math.floor(idx / cols);
        const wx = startGridX + (colIdx * ((cellSize * 12) / cols));
        const wy = bankY + 16 + (rowIdx * 14);
        doc.text(`[ ] ${w}`, wx, wy);
      });
      break;
    }

    case 'maze': {
      const maze = generateMaze(14, 14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(30, 30, 30);
      doc.text(`MAZE CHALLENGE #${pageNum}`, x + (width / 2) - 65, y + 20);

      const cellSize = Math.min(width * 0.85, height - 90) / 14;
      const startGridX = x + (width - (cellSize * 14)) / 2;
      const startGridY = y + 45;

      doc.setDrawColor(20, 20, 20);
      doc.setLineWidth(1.2);

      // Outer boundary with Start and End openings
      // Top wall (except start at 0,0)
      doc.line(startGridX + cellSize, startGridY, startGridX + (14 * cellSize), startGridY);
      // Bottom wall (except end at 13,13)
      doc.line(startGridX, startGridY + (14 * cellSize), startGridX + (13 * cellSize), startGridY + (14 * cellSize));
      // Left and Right walls
      doc.line(startGridX, startGridY, startGridX, startGridY + (14 * cellSize));
      doc.line(startGridX + (14 * cellSize), startGridY, startGridX + (14 * cellSize), startGridY + (14 * cellSize));

      // Start & Finish labels
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('START ->', startGridX - 35, startGridY + 8);
      doc.text('<- FINISH', startGridX + (14 * cellSize) + 5, startGridY + (14 * cellSize) - 4);

      // Internal Vertical Walls
      for (let my = 0; my < 14; my++) {
        for (let mx = 0; mx < 13; mx++) {
          if (maze.verticalWalls[my][mx]) {
            const wx = startGridX + ((mx + 1) * cellSize);
            const wy1 = startGridY + (my * cellSize);
            const wy2 = wy1 + cellSize;
            doc.line(wx, wy1, wx, wy2);
          }
        }
      }

      // Internal Horizontal Walls
      for (let my = 0; my < 13; my++) {
        for (let mx = 0; mx < 14; mx++) {
          if (maze.horizontalWalls[my][mx]) {
            const wy = startGridY + ((my + 1) * cellSize);
            const wx1 = startGridX + (mx * cellSize);
            const wx2 = wx1 + cellSize;
            doc.line(wx1, wy, wx2, wy);
          }
        }
      }
      break;
    }

    case 'index':
    case 'index_classic': {
      const idxCfg = config.indexConfig;
      const skipHeaderText = Boolean(idxCfg?.hasEditableHeaderElements);
      const showPgCol = idxCfg?.showPageNumbersColumn !== false && idxCfg?.showPageNumberCol !== false;
      const showDateCol = Boolean(idxCfg?.showDateColumn || idxCfg?.showDateField);
      const showCatCol = Boolean(idxCfg?.showCategoryColumn || idxCfg?.showCategoryField);
      const showNotes = Boolean(idxCfg?.showNotesField);
      const fontPt = idxCfg?.fontSizePt || 9;
      const rowsCount = Math.max(5, Math.min(34, idxCfg?.entriesPerPage || 20));
      const startNum = idxCfg?.startEntryNumber ?? 1;
      const maxRowCap =
        idxCfg?.lineSpacing === 'compact' ? 18.5 : idxCfg?.lineSpacing === 'relaxed' ? 28 : 23.5;

      if (!skipHeaderText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(Math.round(fontPt + 2.8));
        doc.setTextColor(15, 23, 42);
        doc.text(idxCfg?.title || 'TABLE OF CONTENTS', x + width / 2, y + 12, { align: 'center' });
        if (idxCfg?.subtitle) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(Math.max(6.5, fontPt - 1.3));
          doc.setTextColor(71, 85, 105);
          doc.text(idxCfg.subtitle, x + width / 2, y + 25, { align: 'center' });
        }
        doc.setDrawColor(30, 41, 59);
        doc.setLineWidth(1.0);
        doc.line(x, y + 31, x + width, y + 31);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(Math.max(6.5, fontPt - 1.2));
        doc.setTextColor(51, 65, 85);
        const colLabels = idxCfg?.columnLabels || ['#', 'SECTION / TOPIC TITLE', 'PAGE #'];
        doc.text(colLabels[0] || '#', x + 4, y + 43);
        doc.text(colLabels[1] || 'SECTION / TOPIC TITLE', x + 30, y + 43);
        if (showPgCol) {
          doc.text(colLabels[colLabels.length - 1] || 'PAGE #', x + width - 4, y + 43, { align: 'right' });
        }
      }

      const tableStartY = y + 54;
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.7);
      doc.line(x, y + 48, x + width, y + 48);

      const notesReserve = showNotes ? 44 : 0;
      const availH = Math.max(120, height - 58 - notesReserve);
      const rowStep = Math.min(maxRowCap, availH / rowsCount);
      const pageBoxW = showPgCol ? 42 : 0;

      for (let r = 0; r < rowsCount; r++) {
        const rowY = tableStartY + (r + 0.82) * rowStep;
        if (rowY > y + height - notesReserve - 2) break;
        const idxNum = startNum + r;

        doc.setFont('courier', 'bold');
        doc.setFontSize(Math.max(6.5, fontPt - 1));
        doc.setTextColor(100, 116, 139);
        doc.text(String(idxNum).padStart(2, '0'), x + 3, rowY - 2.5);

        const rightStop = showPgCol ? x + width - pageBoxW - 6 : x + width - 2;
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.55);
        doc.line(x + 28, rowY, rightStop, rowY);

        if (showDateCol) {
          doc.line(rightStop - 54, rowY - rowStep * 0.65, rightStop - 54, rowY);
        }
        if (showCatCol) {
          const catX = showDateCol ? rightStop - 118 : rightStop - 64;
          doc.line(catX, rowY - rowStep * 0.65, catX, rowY);
        }

        if (showPgCol) {
          doc.setDrawColor(148, 163, 184);
          doc.rect(x + width - pageBoxW, rowY - Math.min(12, rowStep * 0.68), pageBoxW, Math.min(14, rowStep * 0.74));
        }
      }

      if (showNotes) {
        const ny = y + height - 40;
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.7);
        doc.rect(x, ny, width, 36);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text('NOTES / KEY REFERENCES:', x + 6, ny + 11);
      }
      break;
    }

    case 'index_bullet': {
      const idxCfg = config.indexConfig;
      const skipHeaderText = Boolean(idxCfg?.hasEditableHeaderElements);
      const showPgCol = idxCfg?.showPageNumbersColumn !== false && idxCfg?.showPageNumberCol !== false;
      const showDateCol = idxCfg?.showDateColumn !== false && idxCfg?.showDateField !== false;
      const showNotes = Boolean(idxCfg?.showNotesField);
      const fontPt = idxCfg?.fontSizePt || 9;
      const rowsCount = Math.max(5, Math.min(32, idxCfg?.entriesPerPage || 18));
      const startNum = idxCfg?.startEntryNumber ?? 1;
      const maxRowCap =
        idxCfg?.lineSpacing === 'compact' ? 18.5 : idxCfg?.lineSpacing === 'relaxed' ? 28 : 23.5;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.6);
      doc.rect(x, y + 18, width, 15, 'FD');

      const tableY = y + 36;
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(100, 116, 139);
      doc.rect(x, tableY, width, 16, 'FD');

      const keyDividerX = x + Math.round(width * 0.14);
      const pageDividerX = showPgCol ? x + width - Math.round(width * 0.16) : x + width;
      const dateDividerX = showDateCol ? pageDividerX - Math.round(width * 0.18) : pageDividerX;

      if (!skipHeaderText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(Math.round(fontPt + 2.8));
        doc.setTextColor(15, 23, 42);
        doc.text(idxCfg?.title || 'BULLET JOURNAL INDEX', x, y + 12);
        doc.setFontSize(Math.max(6.5, fontPt - 1.5));
        doc.setTextColor(51, 65, 85);
        doc.text(
          idxCfg?.subtitle || 'KEY SYMBOLS:  • Task   x Done   > Migrated   * Priority   o Event',
          x + 6,
          y + 28
        );
        const colLabels = idxCfg?.columnLabels || ['KEY', 'COLLECTION / TOPIC', 'DATE', 'PAGES'];
        doc.setTextColor(15, 23, 42);
        doc.text(colLabels[0] || 'KEY', x + 5, tableY + 11);
        doc.text(colLabels[1] || 'COLLECTION / TOPIC', keyDividerX + 6, tableY + 11);
        if (showDateCol) doc.text(colLabels[2] || 'DATE', dateDividerX + 5, tableY + 11);
        if (showPgCol) doc.text(colLabels[3] || 'PAGES', pageDividerX + 5, tableY + 11);
      }

      const notesReserve = showNotes ? 42 : 0;
      const availH = Math.max(120, height - 58 - notesReserve);
      const rowH = Math.min(maxRowCap, availH / rowsCount);
      let curY = y + 58;

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      for (let r = 0; r < rowsCount; r++) {
        if (curY + rowH > y + height - notesReserve) break;
        doc.rect(x, curY, width, rowH);
        doc.line(keyDividerX, curY, keyDividerX, curY + rowH);
        if (showDateCol) doc.line(dateDividerX, curY, dateDividerX, curY + rowH);
        if (showPgCol) doc.line(pageDividerX, curY, pageDividerX, curY + rowH);

        doc.setDrawColor(148, 163, 184);
        doc.circle(x + (keyDividerX - x) / 2, curY + rowH / 2, 2);
        doc.setDrawColor(203, 213, 225);
        curY += rowH;
      }

      if (showNotes) {
        const ny = y + height - 38;
        doc.setDrawColor(148, 163, 184);
        doc.rect(x, ny, width, 34);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text('INDEX NOTES / MIGRATION LOG:', x + 6, ny + 11);
      }
      break;
    }

    case 'index_numbered': {
      const idxCfg = config.indexConfig;
      const skipHeaderText = Boolean(idxCfg?.hasEditableHeaderElements);
      const showPgCol = idxCfg?.showPageNumbersColumn !== false && idxCfg?.showPageNumberCol !== false;
      const preset = idxCfg?.numberedRangePreset || '1-50';
      const baseStart =
        preset === 'custom'
          ? Math.max(1, idxCfg?.customRangeStart ?? idxCfg?.numberedRangeStart ?? 1)
          : 1;
      const startNum = idxCfg?.startEntryNumber ?? baseStart;
      const totalOnPage = Math.max(5, Math.min(100, idxCfg?.entriesPerPage || 50));
      const cols = Math.max(1, Math.min(3, idxCfg?.columnsCount || (totalOnPage > 25 ? 2 : 1)));
      const rowsPerCol = Math.ceil(totalOnPage / cols);
      const maxRowCap =
        idxCfg?.lineSpacing === 'compact' ? 18 : idxCfg?.lineSpacing === 'relaxed' ? 25 : 21;

      if (!skipHeaderText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(15, 23, 42);
        doc.text(idxCfg?.title || 'NUMBERED REFERENCE INDEX', x + width / 2, y + 12, { align: 'center' });
        doc.setDrawColor(30, 41, 59);
        doc.setLineWidth(1.0);
        doc.line(x, y + 31, x + width, y + 31);
      }

      const colGap = 12;
      const colW = (width - colGap * (cols - 1)) / cols;
      const startY = y + 54;
      const rowH = Math.min(maxRowCap, (height - 58) / Math.max(1, rowsPerCol));

      for (let col = 0; col < cols; col++) {
        const colX = x + col * (colW + colGap);
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.75);
        doc.line(colX, y + 48, colX + colW, y + 48);

        for (let r = 0; r < rowsPerCol; r++) {
          const itemIdx = col * rowsPerCol + r;
          if (itemIdx >= totalOnPage) break;
          const num = startNum + itemIdx;
          const ry = startY + (r + 0.82) * rowH;

          doc.setFont('courier', 'bold');
          doc.setFontSize(Math.max(5.5, Math.min(8, rowH * 0.55)));
          doc.setTextColor(51, 65, 85);
          doc.text(String(num).padStart(2, '0'), colX + 2, ry - 2);

          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.5);
          const lineRight = showPgCol ? colX + colW - 26 : colX + colW - 2;
          doc.line(colX + 20, ry, lineRight, ry);
          if (showPgCol) {
            doc.setDrawColor(148, 163, 184);
            doc.rect(colX + colW - 22, ry - Math.min(10, rowH * 0.68), 22, Math.min(12, rowH * 0.75));
          }
        }
      }
      break;
    }

    case 'index_alphabetical': {
      const idxCfg = config.indexConfig;
      const skipHeaderText = Boolean(idxCfg?.hasEditableHeaderElements);
      const showPgCol = idxCfg?.showPageNumbersColumn !== false && idxCfg?.showPageNumberCol !== false;
      const showNotes = Boolean(idxCfg?.showNotesField);
      const mode = idxCfg?.letterGroupMode;
      const grouping = idxCfg?.azLetterGrouping;
      const linesPerGroup = Math.max(1, Math.min(12, idxCfg?.linesPerSection ?? idxCfg?.azLinesPerGroup ?? 5));
      const seqIdx = idxCfg?.pageSequenceIndex || 0;
      const seqTotal = idxCfg?.pageSequenceTotal || idxCfg?.pageCount || 1;

      if (!skipHeaderText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(15, 23, 42);
        doc.text(idxCfg?.title || 'A - Z ALPHABETICAL DIRECTORY', x + width / 2, y + 12, { align: 'center' });
        doc.setDrawColor(30, 41, 59);
        doc.setLineWidth(1.0);
        doc.line(x, y + 31, x + width, y + 31);
      }

      const isSingleLetters = mode === 'single-letters' || grouping === '26-box';
      const isAmNz = mode === 'a-m-n-z' || grouping === '6-box';
      const isTwoPerBox = mode === '2-per-box' || grouping === '13-box';

      const allGroups = isSingleLetters
        ? seqTotal >= 2
          ? seqIdx === 0
            ? 'ABCDEFGHIJKLM'.split('')
            : 'NOPQRSTUVWXYZ'.split('')
          : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
        : isAmNz
        ? seqIdx === 1
          ? ['N • O', 'P • Q', 'R • S', 'T • U', 'V • W', 'X • Y • Z']
          : ['A • B', 'C • D', 'E • F', 'G • H', 'I • J', 'K • L • M']
        : isTwoPerBox
        ? ['A • B', 'C • D', 'E • F', 'G • H', 'I • J', 'K • L', 'M • N', 'O • P', 'Q • R', 'S • T', 'U • V', 'W • X', 'Y • Z']
        : ['A • B • C', 'D • E • F', 'G • H • I', 'J • K • L', 'M • N • O', 'P • Q • R', 'S • T • U', 'V • W • X', 'Y • Z • #'];

      const cols = isSingleLetters && seqTotal === 1 ? 4 : isAmNz ? 2 : 3;
      const rows = Math.ceil(allGroups.length / cols);
      const gap = 6;
      const startY = y + 36;
      const notesReserve = showNotes ? 38 : 0;
      const boxW = (width - gap * (cols - 1)) / cols;
      const boxH = (height - 40 - notesReserve - gap * (rows - 1)) / rows;
      const headerBarH = Math.min(15, Math.max(10, boxH * 0.22));

      allGroups.forEach((label, idx) => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        const bx = x + c * (boxW + gap);
        const by = startY + r * (boxH + gap);

        doc.setFillColor(241, 245, 249);
        doc.rect(bx, by, boxW, headerBarH, 'F');
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.7);
        doc.rect(bx, by, boxW, boxH);
        doc.line(bx, by + headerBarH, bx + boxW, by + headerBarH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(Math.min(7.5, headerBarH * 0.55));
        doc.setTextColor(15, 23, 42);
        doc.text(label, bx + 5, by + headerBarH - 3.5);
        if (showPgCol) {
          doc.setFontSize(6);
          doc.setTextColor(100, 116, 139);
          doc.text('PG', bx + boxW - 4, by + headerBarH - 3.5, { align: 'right' });
          doc.setDrawColor(226, 232, 240);
          doc.line(bx + boxW - 20, by + headerBarH, bx + boxW - 20, by + boxH);
        }

        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.45);
        const lineStep = (boxH - headerBarH - 4) / (linesPerGroup + 0.3);
        for (let l = 0; l < linesPerGroup; l++) {
          const ly = by + headerBarH + (l + 0.85) * lineStep;
          if (ly <= by + boxH - 2) {
            doc.line(bx + 4, ly, bx + boxW - 4, ly);
          }
        }
      });

      if (showNotes) {
        const ny = y + height - 34;
        doc.setDrawColor(148, 163, 184);
        doc.rect(x, ny, width, 30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(71, 85, 105);
        doc.text('DIRECTORY NOTES:', x + 6, ny + 10);
      }
      break;
    }

    case 'index_categorical': {
      const idxCfg = config.indexConfig;
      const skipHeaderText = Boolean(idxCfg?.hasEditableHeaderElements);
      const showPgCol = idxCfg?.showPageNumbersColumn !== false && idxCfg?.showPageNumberCol !== false;
      const showNotes = Boolean(idxCfg?.showNotesField);
      const catLabels = idxCfg?.columnLabels?.length
        ? idxCfg.columnLabels
        : ['CATEGORY I', 'CATEGORY II', 'CATEGORY III', 'CATEGORY IV'];
      const boxCount = Math.max(2, Math.min(6, idxCfg?.entriesPerPage || 4));
      const linesPerBox = Math.max(3, Math.min(12, idxCfg?.linesPerSection || 8));

      if (!skipHeaderText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(15, 23, 42);
        doc.text(idxCfg?.title || 'CATEGORY & SUBJECT INDEX', x + width / 2, y + 12, { align: 'center' });
        doc.setDrawColor(30, 41, 59);
        doc.setLineWidth(1.0);
        doc.line(x, y + 31, x + width, y + 31);
      }

      const cols = 2;
      const rows = Math.ceil(boxCount / cols);
      const gap = 10;
      const startY = y + 36;
      const notesReserve = showNotes ? 38 : 0;
      const boxW = (width - gap) / cols;
      const boxH = (height - 40 - notesReserve - gap * (rows - 1)) / rows;

      for (let idx = 0; idx < boxCount; idx++) {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        const bx = x + c * (boxW + gap);
        const by = startY + r * (boxH + gap);
        const catTitle = catLabels[idx] || `CATEGORY ${idx + 1}`;

        doc.setFillColor(241, 245, 249);
        doc.rect(bx, by, boxW, 18, 'F');
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.75);
        doc.rect(bx, by, boxW, boxH);
        doc.line(bx, by + 18, bx + boxW, by + 18);

        if (!skipHeaderText) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(15, 23, 42);
          doc.text(catTitle, bx + 6, by + 12.5);
        }
        if (showPgCol) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(71, 85, 105);
          doc.text('PG', bx + boxW - 6, by + 12.5, { align: 'right' });
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.5);
          doc.line(bx + boxW - 26, by + 18, bx + boxW - 26, by + boxH);
        }

        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        const lineStep = (boxH - 22) / linesPerBox;
        for (let l = 0; l < linesPerBox; l++) {
          const ly = by + 20 + (l + 0.85) * lineStep;
          if (ly <= by + boxH - 3) {
            doc.line(bx + 5, ly, bx + boxW - 5, ly);
          }
        }
      }

      if (showNotes) {
        const ny = y + height - 34;
        doc.setDrawColor(148, 163, 184);
        doc.rect(x, ny, width, 30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(71, 85, 105);
        doc.text('SUBJECT NOTES:', x + 6, ny + 10);
      }
      break;
    }

    case 'index_project': {
      const idxCfg = config.indexConfig;
      const skipHeaderText = Boolean(idxCfg?.hasEditableHeaderElements);
      const showPgCol = idxCfg?.showPageNumbersColumn !== false && idxCfg?.showPageNumberCol !== false;
      const showDate = idxCfg?.showDateColumn !== false && idxCfg?.showDateField !== false;
      const showStatus = idxCfg?.showStatusColumn !== false && idxCfg?.showStatusField !== false;
      const showCat = Boolean(idxCfg?.showCategoryColumn || idxCfg?.showCategoryField);
      const showNotes = Boolean(idxCfg?.showNotesField);
      const rowsCount = Math.max(5, Math.min(32, idxCfg?.entriesPerPage || 18));
      const maxRowCap =
        idxCfg?.lineSpacing === 'compact' ? 18.5 : idxCfg?.lineSpacing === 'relaxed' ? 28 : 23.5;

      const tableY = y + 36;
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.7);
      doc.rect(x, tableY, width, 16, 'FD');

      const dateDividerX = showDate ? x + Math.round(width * 0.17) : x;
      const pageDividerX = showPgCol ? x + width - Math.round(width * 0.14) : x + width;
      const statusDividerX = showStatus ? pageDividerX - Math.round(width * 0.14) : pageDividerX;
      const catDividerX = showCat ? statusDividerX - Math.round(width * 0.18) : statusDividerX;

      if (!skipHeaderText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(15, 23, 42);
        doc.text(idxCfg?.title || 'PROJECT & ARCHIVE LOG', x, y + 12);
        const colLabels = idxCfg?.columnLabels || ['DATE', 'PROJECT / DOCUMENT TITLE', 'DONE', 'PAGE #'];
        doc.setFontSize(7.2);
        if (showDate) doc.text(colLabels[0] || 'DATE', x + 5, tableY + 11);
        doc.text(colLabels[1] || 'PROJECT / DOCUMENT TITLE', dateDividerX + 6, tableY + 11);
        if (showCat) doc.text('CATEGORY', catDividerX + 5, tableY + 11);
        if (showStatus) doc.text(colLabels[2] || 'DONE', statusDividerX + 6, tableY + 11);
        if (showPgCol) doc.text(colLabels[3] || 'PAGE #', pageDividerX + 6, tableY + 11);
      }

      const notesReserve = showNotes ? 42 : 0;
      const availH = Math.max(120, height - 58 - notesReserve);
      const rowH = Math.min(maxRowCap, availH / rowsCount);
      let curY = y + 58;

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      for (let r = 0; r < rowsCount; r++) {
        if (curY + rowH > y + height - notesReserve) break;
        doc.rect(x, curY, width, rowH);
        if (showDate) doc.line(dateDividerX, curY, dateDividerX, curY + rowH);
        if (showCat) doc.line(catDividerX, curY, catDividerX, curY + rowH);
        if (showStatus) {
          doc.line(statusDividerX, curY, statusDividerX, curY + rowH);
          doc.setDrawColor(100, 116, 139);
          doc.rect(
            statusDividerX + (pageDividerX - statusDividerX) / 2 - 4,
            curY + (rowH - 8) / 2,
            8,
            8
          );
          doc.setDrawColor(203, 213, 225);
        }
        if (showPgCol) doc.line(pageDividerX, curY, pageDividerX, curY + rowH);
        curY += rowH;
      }

      if (showNotes) {
        const ny = y + height - 38;
        doc.setDrawColor(148, 163, 184);
        doc.rect(x, ny, width, 34);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text('ARCHIVE NOTES & DELIVERABLE SUMMARY:', x + 6, ny + 11);
      }
      break;
    }

    case 'index_monthly': {
      const idxCfg = config.indexConfig;
      const skipHeaderText = Boolean(idxCfg?.hasEditableHeaderElements);
      const showPgCol = idxCfg?.showPageNumbersColumn !== false && idxCfg?.showPageNumberCol !== false;
      const showNotes = Boolean(idxCfg?.showNotesField);
      const linesPerMonth = Math.max(2, Math.min(6, idxCfg?.linesPerSection || 3));
      const allMonths = [
        '01 • JAN', '02 • FEB', '03 • MAR',
        '04 • APR', '05 • MAY', '06 • JUN',
        '07 • JUL', '08 • AUG', '09 • SEP',
        '10 • OCT', '11 • NOV', '12 • DEC',
      ];
      const seqIdx = idxCfg?.pageSequenceIndex || 0;
      const seqTotal = idxCfg?.pageSequenceTotal || idxCfg?.pageCount || 1;
      const months =
        seqTotal >= 2
          ? seqIdx === 0
            ? allMonths.slice(0, 6)
            : allMonths.slice(6, 12)
          : allMonths;

      if (!skipHeaderText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(15, 23, 42);
        doc.text(idxCfg?.title || 'MONTHLY OVERVIEW INDEX', x + width / 2, y + 12, { align: 'center' });
        doc.setDrawColor(30, 41, 59);
        doc.setLineWidth(1.0);
        doc.line(x, y + 31, x + width, y + 31);
      }

      const cols = seqTotal >= 2 ? 2 : 3;
      const rows = Math.ceil(months.length / cols);
      const gap = 7;
      const startY = y + 36;
      const notesReserve = showNotes ? 38 : 0;
      const boxW = (width - gap * (cols - 1)) / cols;
      const boxH = (height - 40 - notesReserve - gap * (rows - 1)) / rows;

      months.forEach((mLabel, idx) => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        const bx = x + c * (boxW + gap);
        const by = startY + r * (boxH + gap);

        doc.setFillColor(30, 41, 59);
        doc.rect(bx, by, boxW, 15, 'F');
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.7);
        doc.rect(bx, by, boxW, boxH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(255, 255, 255);
        doc.text(mLabel, bx + 5, by + 10.5);
        if (showPgCol) {
          doc.setFontSize(5.8);
          doc.setTextColor(203, 213, 225);
          doc.text('PG', bx + boxW - 4, by + 10.5, { align: 'right' });
          doc.setDrawColor(226, 232, 240);
          doc.line(bx + boxW - 20, by + 15, bx + boxW - 20, by + boxH);
        }

        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.45);
        const lineStep = (boxH - 18) / (linesPerMonth + 0.3);
        for (let l = 0; l < linesPerMonth; l++) {
          const ly = by + 16 + (l + 0.85) * lineStep;
          if (ly <= by + boxH - 2) {
            doc.line(bx + 4, ly, bx + boxW - 4, ly);
          }
        }
      });

      if (showNotes) {
        const ny = y + height - 34;
        doc.setDrawColor(148, 163, 184);
        doc.rect(x, ny, width, 30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(71, 85, 105);
        doc.text('ANNUAL MILESTONES & NOTES:', x + 6, ny + 10);
      }
      break;
    }

    case 'index_glossary': {
      const idxCfg = config.indexConfig;
      const skipHeaderText = Boolean(idxCfg?.hasEditableHeaderElements);
      const showPgCol = idxCfg?.showPageNumbersColumn !== false && idxCfg?.showPageNumberCol !== false;
      const showCatCol = idxCfg?.showCategoryColumn !== false && idxCfg?.showCategoryField !== false;
      const showNotes = Boolean(idxCfg?.showNotesField);
      const rowsCount = Math.max(5, Math.min(28, idxCfg?.entriesPerPage || 16));
      const maxRowCap =
        idxCfg?.lineSpacing === 'compact' ? 21 : idxCfg?.lineSpacing === 'relaxed' ? 32 : 26;

      const tableY = y + 36;
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.7);
      doc.rect(x, tableY, width, 16, 'FD');

      const termDividerX = x + Math.round(width * 0.28);
      const pageDividerX = showPgCol ? x + width - Math.round(width * 0.13) : x + width;
      const catDividerX = showCatCol ? pageDividerX - Math.round(width * 0.17) : pageDividerX;

      if (!skipHeaderText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(15, 23, 42);
        doc.text(idxCfg?.title || 'GLOSSARY & VOCABULARY INDEX', x + width / 2, y + 12, { align: 'center' });
        doc.setFontSize(7.2);
        doc.text('TERM / CONCEPT', x + 5, tableY + 11);
        doc.text('DEFINITION / USAGE', termDividerX + 6, tableY + 11);
        if (showCatCol) doc.text('CATEGORY', catDividerX + 5, tableY + 11);
        if (showPgCol) doc.text('PG', pageDividerX + 6, tableY + 11);
      }

      const notesReserve = showNotes ? 42 : 0;
      const availH = Math.max(120, height - 58 - notesReserve);
      const rowH = Math.min(maxRowCap, availH / rowsCount);
      let curY = y + 58;

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      for (let r = 0; r < rowsCount; r++) {
        if (curY + rowH > y + height - notesReserve) break;
        doc.rect(x, curY, width, rowH);
        doc.line(termDividerX, curY, termDividerX, curY + rowH);
        if (rowH >= 22) {
          doc.setDrawColor(226, 232, 240);
          doc.line(termDividerX + 4, curY + rowH * 0.52, catDividerX - 4, curY + rowH * 0.52);
          doc.setDrawColor(203, 213, 225);
        }
        if (showCatCol) doc.line(catDividerX, curY, catDividerX, curY + rowH);
        if (showPgCol) doc.line(pageDividerX, curY, pageDividerX, curY + rowH);
        curY += rowH;
      }

      if (showNotes) {
        const ny = y + height - 38;
        doc.setDrawColor(148, 163, 184);
        doc.rect(x, ny, width, 34);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text('VOCABULARY & REFERENCE NOTES:', x + 6, ny + 11);
      }
      break;
    }

    case 'index_reading': {
      const idxCfg = config.indexConfig;
      const skipHeaderText = Boolean(idxCfg?.hasEditableHeaderElements);
      const showPgCol = idxCfg?.showPageNumbersColumn !== false && idxCfg?.showPageNumberCol !== false;
      const showStatus = idxCfg?.showStatusColumn !== false && idxCfg?.showStatusField !== false;
      const rowsCount = Math.max(5, Math.min(30, idxCfg?.entriesPerPage || 18));
      const startNum = idxCfg?.startEntryNumber ?? 1;
      const maxRowCap =
        idxCfg?.lineSpacing === 'compact' ? 18.5 : idxCfg?.lineSpacing === 'relaxed' ? 28 : 23.5;

      const tableY = y + 36;
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.7);
      doc.rect(x, tableY, width, 16, 'FD');

      const numDividerX = x + 24;
      const authorDividerX = x + Math.round(width * 0.44);
      const pageDividerX = showPgCol ? x + width - Math.round(width * 0.13) : x + width;
      const ratingDividerX = showStatus ? pageDividerX - Math.round(width * 0.19) : pageDividerX;

      if (!skipHeaderText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(15, 23, 42);
        doc.text(idxCfg?.title || 'READING & BOOK INDEX', x, y + 12);
        doc.setFontSize(7.2);
        doc.text('#', x + 5, tableY + 11);
        doc.text('BOOK TITLE', numDividerX + 5, tableY + 11);
        doc.text('AUTHOR', authorDividerX + 5, tableY + 11);
        if (showStatus) doc.text('RATING', ratingDividerX + 5, tableY + 11);
        if (showPgCol) doc.text('PAGE #', pageDividerX + 5, tableY + 11);
      }

      const availH = Math.max(120, height - 58);
      const rowH = Math.min(maxRowCap, availH / rowsCount);
      let curY = y + 58;

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      for (let r = 0; r < rowsCount; r++) {
        if (curY + rowH > y + height) break;
        doc.rect(x, curY, width, rowH);
        doc.line(numDividerX, curY, numDividerX, curY + rowH);
        doc.line(authorDividerX, curY, authorDividerX, curY + rowH);
        if (showStatus) {
          doc.line(ratingDividerX, curY, ratingDividerX, curY + rowH);
          const starZoneW = pageDividerX - ratingDividerX;
          const starStartX = ratingDividerX + Math.max(6, (starZoneW - 38) / 2);
          doc.setDrawColor(100, 116, 139);
          for (let s = 0; s < 5; s++) {
            doc.circle(starStartX + s * 8.5, curY + rowH / 2, 2.5);
          }
          doc.setDrawColor(203, 213, 225);
        }
        if (showPgCol) doc.line(pageDividerX, curY, pageDividerX, curY + rowH);

        doc.setFont('courier', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(String(startNum + r).padStart(2, '0'), x + 5, curY + rowH * 0.65);
        curY += rowH;
      }
      break;
    }

    case 'index_recipe': {
      const idxCfg = config.indexConfig;
      const skipHeaderText = Boolean(idxCfg?.hasEditableHeaderElements);
      const showPgCol = idxCfg?.showPageNumbersColumn !== false && idxCfg?.showPageNumberCol !== false;
      const showCat = idxCfg?.showCategoryColumn !== false && idxCfg?.showCategoryField !== false;
      const showTime = idxCfg?.showNotesField !== false;
      const showFav = idxCfg?.showStatusColumn !== false && idxCfg?.showStatusField !== false;
      const rowsCount = Math.max(5, Math.min(30, idxCfg?.entriesPerPage || 18));
      const maxRowCap =
        idxCfg?.lineSpacing === 'compact' ? 18.5 : idxCfg?.lineSpacing === 'relaxed' ? 28 : 23.5;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.6);
      doc.rect(x, y + 18, width, 15, 'FD');

      const tableY = y + 36;
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(100, 116, 139);
      doc.rect(x, tableY, width, 16, 'FD');

      const catDividerX = showCat ? x + Math.round(width * 0.44) : x + Math.round(width * 0.62);
      const pageDividerX = showPgCol ? x + width - Math.round(width * 0.13) : x + width;
      const favDividerX = showFav ? pageDividerX - Math.round(width * 0.11) : pageDividerX;
      const timeDividerX = showTime ? favDividerX - Math.round(width * 0.15) : favDividerX;

      if (!skipHeaderText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(15, 23, 42);
        doc.text(idxCfg?.title || 'CULINARY RECIPE INDEX', x, y + 12);
        doc.setFontSize(7.2);
        doc.text('RECIPE TITLE', x + 5, tableY + 11);
        if (showCat) doc.text('COURSE', catDividerX + 5, tableY + 11);
        if (showTime) doc.text('PREP TIME', timeDividerX + 4, tableY + 11);
        if (showFav) doc.text('FAV', favDividerX + 5, tableY + 11);
        if (showPgCol) doc.text('PAGE #', pageDividerX + 5, tableY + 11);
      }

      const availH = Math.max(120, height - 58);
      const rowH = Math.min(maxRowCap, availH / rowsCount);
      let curY = y + 58;

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      for (let r = 0; r < rowsCount; r++) {
        if (curY + rowH > y + height) break;
        doc.rect(x, curY, width, rowH);
        if (showCat) {
          doc.line(catDividerX, curY, catDividerX, curY + rowH);
          doc.setDrawColor(148, 163, 184);
          doc.rect(
            catDividerX + 5,
            curY + (rowH - 10) / 2,
            Math.max(20, timeDividerX - catDividerX - 10),
            10
          );
          doc.setDrawColor(203, 213, 225);
        }
        if (showTime) doc.line(timeDividerX, curY, timeDividerX, curY + rowH);
        if (showFav) {
          doc.line(favDividerX, curY, favDividerX, curY + rowH);
          doc.setDrawColor(100, 116, 139);
          doc.circle(favDividerX + (pageDividerX - favDividerX) / 2, curY + rowH / 2, 3);
          doc.setDrawColor(203, 213, 225);
        }
        if (showPgCol) doc.line(pageDividerX, curY, pageDividerX, curY + rowH);
        curY += rowH;
      }
      break;
    }

    case 'index_study': {
      const idxCfg = config.indexConfig;
      const skipHeaderText = Boolean(idxCfg?.hasEditableHeaderElements);
      const showPgCol = idxCfg?.showPageNumbersColumn !== false && idxCfg?.showPageNumberCol !== false;
      const showCat = idxCfg?.showCategoryColumn !== false && idxCfg?.showCategoryField !== false;
      const showStatus = idxCfg?.showStatusColumn !== false && idxCfg?.showStatusField !== false;
      const showNotes = Boolean(idxCfg?.showNotesField);
      const rowsCount = Math.max(5, Math.min(30, idxCfg?.entriesPerPage || 16));
      const maxRowCap =
        idxCfg?.lineSpacing === 'compact' ? 18.5 : idxCfg?.lineSpacing === 'relaxed' ? 28 : 23.5;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.6);
      doc.rect(x, y + 18, width, 15, 'FD');

      const tableY = y + 36;
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(100, 116, 139);
      doc.rect(x, tableY, width, 16, 'FD');

      const moduleDividerX = showCat ? x + Math.round(width * 0.42) : x + Math.round(width * 0.62);
      const pageDividerX = showPgCol ? x + width - Math.round(width * 0.13) : x + width;
      const reviewDividerX = showStatus ? pageDividerX - Math.round(width * 0.21) : pageDividerX;

      if (!skipHeaderText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(15, 23, 42);
        doc.text(idxCfg?.title || 'STUDY & RESEARCH INDEX', x, y + 12);
        doc.setFontSize(7.2);
        doc.text('MODULE / TOPIC', x + 5, tableY + 11);
        if (showCat) doc.text('SOURCE / CITATION', moduleDividerX + 5, tableY + 11);
        if (showStatus) doc.text('MASTERY', reviewDividerX + 5, tableY + 11);
        if (showPgCol) doc.text('PAGE #', pageDividerX + 5, tableY + 11);
      }

      const notesReserve = showNotes ? 42 : 0;
      const availH = Math.max(120, height - 58 - notesReserve);
      const rowH = Math.min(maxRowCap, availH / rowsCount);
      let curY = y + 58;

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      for (let r = 0; r < rowsCount; r++) {
        if (curY + rowH > y + height - notesReserve) break;
        doc.rect(x, curY, width, rowH);
        if (showCat) doc.line(moduleDividerX, curY, moduleDividerX, curY + rowH);
        if (showStatus) {
          doc.line(reviewDividerX, curY, reviewDividerX, curY + rowH);
          const boxStartX = reviewDividerX + Math.max(6, (pageDividerX - reviewDividerX - 38) / 2);
          doc.setDrawColor(100, 116, 139);
          for (let chk = 0; chk < 3; chk++) {
            doc.rect(boxStartX + chk * 13, curY + (rowH - 7.5) / 2, 7.5, 7.5);
          }
          doc.setDrawColor(203, 213, 225);
        }
        if (showPgCol) doc.line(pageDividerX, curY, pageDividerX, curY + rowH);
        curY += rowH;
      }

      if (showNotes) {
        const ny = y + height - 38;
        doc.setDrawColor(148, 163, 184);
        doc.rect(x, ny, width, 34);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text('STUDY NOTES & KEY CITATIONS:', x + 6, ny + 11);
      }
      break;
    }

    case 'index_collection': {
      const idxCfg = config.indexConfig;
      const skipHeaderText = Boolean(idxCfg?.hasEditableHeaderElements);
      const showPgCol = idxCfg?.showPageNumbersColumn !== false && idxCfg?.showPageNumberCol !== false;
      const showCat = idxCfg?.showCategoryColumn !== false && idxCfg?.showCategoryField !== false;
      const showStatus = idxCfg?.showStatusColumn !== false && idxCfg?.showStatusField !== false;
      const showNotes = Boolean(idxCfg?.showNotesField);
      const rowsCount = Math.max(5, Math.min(32, idxCfg?.entriesPerPage || 18));
      const startNum = idxCfg?.startEntryNumber ?? 1;
      const maxRowCap =
        idxCfg?.lineSpacing === 'compact' ? 18.5 : idxCfg?.lineSpacing === 'relaxed' ? 28 : 23.5;

      const tableY = y + 36;
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.7);
      doc.rect(x, tableY, width, 16, 'FD');

      const idDividerX = x + Math.round(width * 0.14);
      const pageDividerX = showPgCol ? x + width - Math.round(width * 0.13) : x + width;
      const condDividerX = showStatus ? pageDividerX - Math.round(width * 0.16) : pageDividerX;
      const locDividerX = showCat ? condDividerX - Math.round(width * 0.18) : condDividerX;

      if (!skipHeaderText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(15, 23, 42);
        doc.text(idxCfg?.title || 'COLLECTION & INVENTORY INDEX', x, y + 12);
        doc.setFontSize(7.2);
        doc.text('ID / SKU', x + 4, tableY + 11);
        doc.text('ITEM / SPECIMEN NAME', idDividerX + 5, tableY + 11);
        if (showCat) doc.text('LOCATION', locDividerX + 4, tableY + 11);
        if (showStatus) doc.text('COND / QTY', condDividerX + 4, tableY + 11);
        if (showPgCol) doc.text('PAGE #', pageDividerX + 5, tableY + 11);
      }

      const notesReserve = showNotes ? 42 : 0;
      const availH = Math.max(120, height - 58 - notesReserve);
      const rowH = Math.min(maxRowCap, availH / rowsCount);
      let curY = y + 58;

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      for (let r = 0; r < rowsCount; r++) {
        if (curY + rowH > y + height - notesReserve) break;
        doc.rect(x, curY, width, rowH);
        doc.line(idDividerX, curY, idDividerX, curY + rowH);
        if (showCat) doc.line(locDividerX, curY, locDividerX, curY + rowH);
        if (showStatus) doc.line(condDividerX, curY, condDividerX, curY + rowH);
        if (showPgCol) doc.line(pageDividerX, curY, pageDividerX, curY + rowH);

        doc.setFont('courier', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.text(`#${String(startNum + r).padStart(3, '0')}`, x + 4, curY + rowH * 0.65);
        curY += rowH;
      }

      if (showNotes) {
        const ny = y + height - 38;
        doc.setDrawColor(148, 163, 184);
        doc.rect(x, ny, width, 34);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text('INVENTORY & CURATOR NOTES:', x + 6, ny + 11);
      }
      break;
    }

    default: {
      // Default to neat lined format
      let curY = y + 20;
      while (curY <= y + height) {
        doc.line(x, curY, x + width, curY);
        curY += 22;
      }
    }
  }
}

/**
 * Generates an Amazon KDP compliant full wrap-around Cover Spread PDF
 */
export async function generateCoverSpreadPdf(params: {
  totalWidth: number;
  totalHeight: number;
  bleedMargin: number;
  spineWidth: number;
  trimWidth: number;
  trimHeight: number;
  title: string;
  subtitle?: string;
  backgroundColor?: string;
  elements?: any[];
}): Promise<Blob> {
  const widthPt = params.totalWidth * 72;
  const heightPt = params.totalHeight * 72;

  const doc = new jsPDF({
    orientation: widthPt > heightPt ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [widthPt, heightPt],
  });

  // Cover Background fill
  if (params.backgroundColor && params.backgroundColor.startsWith('#') && params.backgroundColor.length === 7) {
    const hex = params.backgroundColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 255;
    const g = parseInt(hex.substring(2, 4), 16) || 255;
    const b = parseInt(hex.substring(4, 6), 16) || 255;
    doc.setFillColor(r, g, b);
  } else {
    doc.setFillColor(255, 255, 255);
  }
  doc.rect(0, 0, widthPt, heightPt, 'F');

  // Render elements if any
  if (params.elements && params.elements.length > 0) {
    for (const el of params.elements) {
      const elX = (el.x / 100) * widthPt;
      const elY = (el.y / 100) * heightPt;
      const elW = (el.width / 100) * widthPt;
      const elH = (el.height / 100) * heightPt;

      if (el.type === 'text') {
        doc.setFont(el.fontFamily === 'Courier' ? 'courier' : 'helvetica', el.fontWeight === 'bold' ? 'bold' : 'normal');
        doc.setFontSize(el.fontSize || 16);
        doc.setTextColor(30, 30, 30);
        const textX = el.textAlign === 'center' ? elX + elW / 2 : elX;
        doc.text(el.text || '', textX, elY + elH * 0.7, {
          align: el.textAlign === 'center' ? 'center' : 'left',
        });
      } else if (el.type === 'shape') {
        if (el.shapeType === 'rect') {
          doc.setDrawColor(30, 30, 30);
          doc.setLineWidth(el.strokeWidth || 1);
          doc.rect(elX, elY, elW, elH);
        } else if (el.shapeType === 'line') {
          doc.setDrawColor(30, 30, 30);
          doc.setLineWidth(el.strokeWidth || 1.5);
          doc.line(elX, elY, elX + elW, elY);
        } else if (el.shapeType === 'star') {
          doc.setDrawColor(30, 30, 30);
          doc.setLineWidth(1.5);
          // 5-point star
          const cx = elX + elW / 2;
          const cy = elY + elH / 2;
          const rOuter = Math.min(elW, elH) / 2;
          const rInner = rOuter * 0.42;
          const pts: [number, number][] = [];
          for (let i = 0; i < 10; i++) {
            const angle = (i * Math.PI) / 5 - Math.PI / 2;
            const r = i % 2 === 0 ? rOuter : rInner;
            pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
          }
          for (let i = 0; i < pts.length; i++) {
            const next = pts[(i + 1) % pts.length];
            doc.line(pts[i][0], pts[i][1], next[0], next[1]);
          }
        }
      } else if (el.type === 'image' && el.imageUrl) {
        try {
          const embedded = await resolvePdfEmbeddableImage(el.imageUrl, elW, elH);
          if (embedded) {
            doc.addImage(embedded.dataUrl, embedded.format, elX, elY, elW, elH);
          }
        } catch {
          // ignore any unsupported image format in jsPDF
        }
      }
    }
  }

  return doc.output('blob');
}

