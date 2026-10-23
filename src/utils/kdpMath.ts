/**
 * Pure calculation utilities for Amazon KDP Publishing
 */

export interface PrintingCostParams {
  marketplace: 'US' | 'UK' | 'DE' | 'FR' | 'IT' | 'ES' | 'JP' | 'CA' | 'AU';
  interiorColor: 'black_white' | 'standard_color' | 'premium_color';
  paperType: 'white' | 'cream';
  pageCount: number;
  trimWidth: number; // inches
  trimHeight: number; // inches
  listPrice: number;
  distribution: 'regular' | 'expanded'; // 60% vs 40%
}

export interface PrintingCostResult {
  fixedCost: number;
  perPageCost: number;
  totalPrintCost: number;
  royaltyRate: number; // 0.60 or 0.40
  grossRoyalty: number;
  netRoyalty: number;
  profitMarginPercent: number;
  minListPrice: number;
  currency: string;
  currencySymbol: string;
}

/**
 * Amazon KDP Printing Cost & Royalty Formula
 * Based on Amazon KDP Official Pricing Matrix:
 * Standard Black & White on Amazon.com:
 * For 24 - 108 pages: Flat cost ($2.30 - $2.40 depending on trim) or $1.00 fixed + $0.012/page for >108 pages
 * For standard low content (6x9 or 8.5x11, B&W):
 * Fixed: $1.00 ($1.15 for large trim) + $0.012 per page (regular) or $0.014 per page (large trim)
 */
export function calculateKdpPrintCostAndRoyalty(params: PrintingCostParams): PrintingCostResult {
  const isLargeTrim = params.trimWidth > 6.125 || params.trimHeight > 9.0;
  
  // Currency mapping
  const currencyMap: Record<string, { symbol: string; code: string; multiplier: number }> = {
    US: { symbol: '$', code: 'USD', multiplier: 1.0 },
    UK: { symbol: '£', code: 'GBP', multiplier: 0.8 },
    DE: { symbol: '€', code: 'EUR', multiplier: 0.92 },
    FR: { symbol: '€', code: 'EUR', multiplier: 0.92 },
    IT: { symbol: '€', code: 'EUR', multiplier: 0.92 },
    ES: { symbol: '€', code: 'EUR', multiplier: 0.92 },
    JP: { symbol: '¥', code: 'JPY', multiplier: 145 },
    CA: { symbol: 'CA$', code: 'CAD', multiplier: 1.35 },
    AU: { symbol: 'AU$', code: 'AUD', multiplier: 1.5 },
  };

  const curr = currencyMap[params.marketplace] || currencyMap.US;
  let fixedCost = 1.00;
  let perPageRate = 0.012;

  if (params.interiorColor === 'black_white') {
    if (params.pageCount <= 108) {
      fixedCost = isLargeTrim ? 2.45 : 2.30;
      perPageRate = 0;
    } else {
      fixedCost = isLargeTrim ? 1.15 : 1.00;
      perPageRate = isLargeTrim ? 0.014 : 0.012;
    }
  } else if (params.interiorColor === 'standard_color') {
    fixedCost = 1.15;
    perPageRate = isLargeTrim ? 0.040 : 0.035;
  } else {
    // Premium color
    fixedCost = 1.25;
    perPageRate = isLargeTrim ? 0.075 : 0.065;
  }

  // Adjust for currency rate
  const totalPrintCost = (params.pageCount <= 108 && params.interiorColor === 'black_white')
    ? fixedCost * curr.multiplier
    : (fixedCost + (params.pageCount * perPageRate)) * curr.multiplier;

  const royaltyRate = params.distribution === 'expanded' ? 0.40 : 0.60;
  const grossRoyalty = params.listPrice * royaltyRate;
  const netRoyalty = Math.max(0, grossRoyalty - totalPrintCost);
  const profitMarginPercent = params.listPrice > 0 ? (netRoyalty / params.listPrice) * 100 : 0;
  const minListPrice = Number((totalPrintCost / royaltyRate).toFixed(2));

  return {
    fixedCost: Number((fixedCost * curr.multiplier).toFixed(2)),
    perPageCost: Number((perPageRate * curr.multiplier).toFixed(4)),
    totalPrintCost: Number(totalPrintCost.toFixed(2)),
    royaltyRate,
    grossRoyalty: Number(grossRoyalty.toFixed(2)),
    netRoyalty: Number(netRoyalty.toFixed(2)),
    profitMarginPercent: Number(profitMarginPercent.toFixed(1)),
    minListPrice,
    currency: curr.code,
    currencySymbol: curr.symbol,
  };
}

/**
 * KDP Cover & Spine Dimensions Calculation
 * Spine Thickness per page:
 * White Paper: 0.002252 inches (0.0572 mm)
 * Cream Paper: 0.0025 inches (0.0635 mm)
 * Color Paper: 0.002347 inches (0.0596 mm)
 * Bleed: 0.125 inches (3.175 mm) on all outer edges
 * Safe Zone: 0.25 inches margin inside trim
 */
export interface CoverSpecsParams {
  trimWidth: number; // inches
  trimHeight: number; // inches
  pageCount: number;
  paperType: 'white' | 'cream' | 'color';
  isHardcover?: boolean;
}

export interface CoverSpecsResult {
  spineWidth: number; // inches
  spineWidthMm: number;
  totalWidth: number; // inches
  totalHeight: number; // inches
  totalWidthPx: number; // at 300 DPI
  totalHeightPx: number; // at 300 DPI
  bleedMargin: number; // 0.125
  safeZoneMargin: number; // 0.25
  spineFoldMargin: number; // 0.0625
  barcodeWidth: number; // 2.0 inches
  barcodeHeight: number; // 1.2 inches
}

export function calculateCoverDimensions(params: CoverSpecsParams): CoverSpecsResult {
  let thicknessPerPage = 0.002252;
  if (params.paperType === 'cream') {
    thicknessPerPage = 0.0025;
  } else if (params.paperType === 'color') {
    thicknessPerPage = 0.002347;
  }

  // Paperback spine thickness = pageCount * thicknessPerPage
  let spineWidth = params.pageCount * thicknessPerPage;

  if (params.isHardcover) {
    // Hardcover wraps around boards and has hinge crease
    spineWidth += 0.197; // board wrap & allowance
  }

  // Amazon standard bleed is 0.125" top, bottom, and outer edges
  const bleed = params.isHardcover ? 0.591 : 0.125;
  
  // Total width = bleed + back cover + spine + front cover + bleed
  const totalWidth = (bleed * 2) + (params.trimWidth * 2) + spineWidth;
  // Total height = bleed + height + bleed
  const totalHeight = (bleed * 2) + params.trimHeight;

  return {
    spineWidth: Number(spineWidth.toFixed(4)),
    spineWidthMm: Number((spineWidth * 25.4).toFixed(2)),
    totalWidth: Number(totalWidth.toFixed(4)),
    totalHeight: Number(totalHeight.toFixed(4)),
    totalWidthPx: Math.round(totalWidth * 300),
    totalHeightPx: Math.round(totalHeight * 300),
    bleedMargin: bleed,
    safeZoneMargin: 0.25,
    spineFoldMargin: 0.0625,
    barcodeWidth: 2.0,
    barcodeHeight: 1.2,
  };
}

/**
 * Estimate Monthly and Daily Sales from Amazon Best Sellers Rank (BSR)
 * Proven industry regression formula for Amazon US Books
 */
export function estimateSalesFromBSR(bsr: number): { monthlySales: number; dailySales: number; estRevenue: number } {
  if (bsr <= 0) return { monthlySales: 0, dailySales: 0, estRevenue: 0 };
  
  let monthlySales = 0;
  if (bsr === 1) {
    monthlySales = 65000;
  } else if (bsr <= 10) {
    monthlySales = Math.round(30000 - ((bsr - 1) * 2000));
  } else if (bsr <= 100) {
    monthlySales = Math.round(15000 - ((bsr - 10) * 110));
  } else if (bsr <= 1000) {
    monthlySales = Math.round(3500 - ((bsr - 100) * 2.8));
  } else if (bsr <= 10000) {
    monthlySales = Math.round(1000 - ((bsr - 1000) * 0.08));
  } else if (bsr <= 50000) {
    monthlySales = Math.round(300 - ((bsr - 10000) * 0.005));
  } else if (bsr <= 100000) {
    monthlySales = Math.round(100 - ((bsr - 50000) * 0.0012));
  } else if (bsr <= 300000) {
    monthlySales = Math.round(40 - ((bsr - 100000) * 0.00015));
  } else {
    monthlySales = Math.max(1, Math.round(10 - ((bsr - 300000) * 0.00001)));
  }

  const dailySales = Math.max(0, Math.round(monthlySales / 30));
  const estRevenue = Number((monthlySales * 7.99).toFixed(2)); // estimated based on $7.99 avg price

  return {
    monthlySales: Math.max(0, monthlySales),
    dailySales,
    estRevenue,
  };
}

/**
 * 7 KDP Backend Keywords Optimizer
 * Takes a list of raw keyword phrases, deduplicates individual words,
 * ignores stop words, and packs maximum unique high-value terms into 7 slots of <= 50 characters each.
 */
export function packSevenBackendSlots(keywords: string[]): string[] {
  const stopWords = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'for', 'with', 'and', 'or', 'to', 'of', 'by']);
  const usedWords = new Set<string>();
  const slots: string[] = ['', '', '', '', '', '', ''];
  let currentSlotIndex = 0;

  // Split all keywords into words while preserving sequence
  for (const phrase of keywords) {
    const words = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    for (const word of words) {
      if (!word || word.length < 2 || stopWords.has(word) || usedWords.has(word)) {
        continue;
      }

      // Check if current slot can fit this word (word + space)
      const currentContent = slots[currentSlotIndex];
      const neededLength = currentContent.length === 0 ? word.length : currentContent.length + 1 + word.length;

      if (neededLength <= 50) {
        slots[currentSlotIndex] = currentContent.length === 0 ? word : `${currentContent} ${word}`;
        usedWords.add(word);
      } else {
        // Move to next slot if available
        if (currentSlotIndex < 6) {
          currentSlotIndex++;
          slots[currentSlotIndex] = word;
          usedWords.add(word);
        } else {
          // All 7 slots full
          break;
        }
      }
    }
    if (currentSlotIndex >= 6 && slots[6].length >= 45) {
      break;
    }
  }

  return slots;
}

/**
 * Computes the next zoom level when using Alt + MouseWheel
 */
export function calculateNextZoomOnWheel(
  currentZoom: number,
  deltaY: number,
  altKey: boolean,
  minZoom: number = 25,
  maxZoom: number = 250,
  step: number = 10
): number {
  if (!altKey || deltaY === 0) return currentZoom;
  const direction = deltaY < 0 ? 1 : -1;
  const next = currentZoom + direction * step;
  return Math.max(minZoom, Math.min(maxZoom, next));
}

export type MeasurementUnit = 'in' | 'mm' | 'cm';

export function convertInchesToUnit(inches: number, unit: MeasurementUnit): number {
  if (unit === 'mm') return Number((inches * 25.4).toFixed(1));
  if (unit === 'cm') return Number((inches * 2.54).toFixed(2));
  return Number(inches.toFixed(3));
}

export function convertUnitToInches(value: number, unit: MeasurementUnit): number {
  if (!Number.isFinite(value)) return 0;
  if (unit === 'mm') return Number((value / 25.4).toFixed(4));
  if (unit === 'cm') return Number((value / 2.54).toFixed(4));
  return Number(value.toFixed(4));
}

/**
 * Reorders an element within an array (bring forward, send backward, bring to front, send to back)
 */
export function reorderElementLayers<T extends { id: string }>(
  elements: T[],
  elementId: string,
  action: 'forward' | 'backward' | 'front' | 'back'
): T[] {
  const idx = elements.findIndex(el => el.id === elementId);
  if (idx === -1) return elements;
  const copy = [...elements];
  const [item] = copy.splice(idx, 1);

  if (action === 'front') {
    copy.push(item);
  } else if (action === 'back') {
    copy.unshift(item);
  } else if (action === 'forward') {
    const targetIdx = Math.min(elements.length - 1, idx + 1);
    copy.splice(targetIdx, 0, item);
  } else if (action === 'backward') {
    const targetIdx = Math.max(0, idx - 1);
    copy.splice(targetIdx, 0, item);
  }
  return copy;
}

/**
 * Reorders pages while keeping the Cover Spread (index 0) locked at position 0
 * and re-indexing page numbers & names cleanly.
 */
export function reorderPagesList<
  T extends {
    id: string;
    isCover?: boolean;
    pageNumber: number;
    isEven?: boolean;
    name: string;
    templateType?: string;
    indexConfig?: any;
    elements?: any[];
  }
>(pages: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex <= 0 ||
    toIndex <= 0 ||
    fromIndex >= pages.length ||
    toIndex >= pages.length
  ) {
    return pages;
  }
  const copy = [...pages];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);

  const reindexed = copy.map((p, idx) => ({
    ...p,
    pageNumber: idx + 1,
    isEven: (idx + 1) % 2 === 0,
    name: p.isCover ? 'Cover Spread' : p.name.startsWith('Page ') ? `Page ${idx + 1}` : p.name,
  }));

  if (reindexed.some(p => p.indexConfig?.entries && p.indexConfig.entries.length > 0)) {
    return syncLinkedIndexPagesInBook(reindexed as any) as unknown as T[];
  }
  return reindexed;
}

export interface KdpPreFlightResult {
  isValidForPrint: boolean;
  warnings: string[];
  errors: string[];
  recommendedMinInsideMargin: number;
}

/**
 * Validates KDP page count, trim dimensions, margins, bleed, and element clipping prior to PDF export
 */
export function validateProjectForKdpExport(params: {
  trimWidthIn: number;
  trimHeightIn: number;
  interiorPageCount: number;
  bleedInches: number;
  margins: { top: number; bottom: number; left: number; right: number };
  elementsOutsideMarginsCount: number;
  elementsOverlappingBarcodeCount: number;
}): KdpPreFlightResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (params.interiorPageCount < 24) {
    warnings.push(
      `Interior has ${params.interiorPageCount} pages. Amazon KDP requires at least 24 interior pages for print binding.`
    );
  } else if (params.interiorPageCount > 828) {
    errors.push(`Interior has ${params.interiorPageCount} pages, exceeding the 828-page KDP paperback maximum.`);
  }

  const recommendedMinInsideMargin =
    params.interiorPageCount <= 150
      ? 0.375
      : params.interiorPageCount <= 300
      ? 0.5
      : params.interiorPageCount <= 500
      ? 0.625
      : 0.75;

  if (params.margins.left < recommendedMinInsideMargin || params.margins.right < 0.25) {
    warnings.push(
      `Margins (${params.margins.left}" L / ${params.margins.right}" R) are narrower than KDP's recommended ${recommendedMinInsideMargin}" gutter margin.`
    );
  }

  if (params.margins.top < 0.25 || params.margins.bottom < 0.25) {
    warnings.push(`Top/Bottom margins (${params.margins.top}" / ${params.margins.bottom}") are below the 0.25" safe area.`);
  }

  if (params.bleedInches > 0 && Math.abs(params.bleedInches - 0.125) > 0.005) {
    warnings.push(`Bleed is set to ${params.bleedInches}". Standard Amazon KDP print bleed is 0.125" (3.2mm).`);
  }

  if (params.trimWidthIn < 4 || params.trimWidthIn > 8.5 || params.trimHeightIn < 6 || params.trimHeightIn > 11.69) {
    warnings.push(
      `Custom dimensions (${params.trimWidthIn}" × ${params.trimHeightIn}") fall outside standard KDP paperback trim limits.`
    );
  }

  if (params.elementsOutsideMarginsCount > 0) {
    warnings.push(
      `${params.elementsOutsideMarginsCount} element(s) extend outside the safe margin guide and may be clipped during trimming.`
    );
  }

  if (params.elementsOverlappingBarcodeCount > 0) {
    warnings.push(
      `${params.elementsOverlappingBarcodeCount} cover element(s) overlap the lower-right Back Cover ISBN Barcode zone.`
    );
  }

  return {
    isValidForPrint: errors.length === 0 && warnings.length === 0,
    warnings,
    errors,
    recommendedMinInsideMargin,
  };
}

/**
 * Calculates a clamped (left, top) pixel position for the floating element action menu
 * so it opens right near where the mouse pointer clicked without overflowing the workspace.
 */
export function calculateFloatingMenuPosition(params: {
  clickX: number;
  clickY: number;
  containerWidth: number;
  containerHeight: number;
  menuWidth?: number;
  menuHeight?: number;
}): { left: number; top: number } {
  const menuW = params.menuWidth ?? 460;
  const menuH = params.menuHeight ?? 44;
  const pad = 12;

  const maxLeft = Math.max(pad, params.containerWidth - menuW - pad);
  const idealLeft = params.clickX - menuW / 2;
  const left = Math.round(Math.max(pad, Math.min(maxLeft, idealLeft)));

  // Place the floating menu directly near the mouse cursor (slightly above, or right below if near top edge)
  const offsetAbove = menuH + 14;
  const offsetBelow = 20;
  let idealTop = params.clickY - offsetAbove;
  if (idealTop < pad) {
    idealTop = params.clickY + offsetBelow;
  }
  const maxTop = Math.max(pad, params.containerHeight - menuH - pad);
  const top = Math.round(Math.max(pad, Math.min(maxTop, idealTop)));

  return { left, top };
}

/**
 * Computes smooth 8-handle element resizing without artificial page-edge clamping so images and elements
 * can be freely resized all the way to the bottom, edges, or beyond 100% bleed.
 */
export function calculateResizedElementBox(params: {
  handle: string;
  initialX: number;
  initialY: number;
  initialW: number;
  initialH: number;
  deltaX: number;
  deltaY: number;
  lockAspectRatio?: boolean;
  minW?: number;
  minH?: number;
}): { x: number; y: number; width: number; height: number } {
  const minW = params.minW ?? 1;
  const minH = params.minH ?? 1;
  const { handle, initialX, initialY, initialW, initialH, deltaX, deltaY, lockAspectRatio } = params;

  const safeInitW = Math.max(minW, initialW);
  const safeInitH = Math.max(minH, initialH);
  const ratio = safeInitW / safeInitH;

  let newX = initialX;
  let newY = initialY;
  let newW = safeInitW;
  let newH = safeInitH;

  const isCorner = handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw';

  if (isCorner && lockAspectRatio) {
    const signX = handle.includes('w') ? -1 : 1;
    const signY = handle.includes('n') ? -1 : 1;
    const rawDeltaW = deltaX * signX;
    const rawDeltaH = deltaY * signY;

    // Use the dominant drag axis so diagonal or single-axis corner movement scales smoothly without any upper boundary limit
    const scaleDeltaW =
      Math.abs(rawDeltaW) >= Math.abs(rawDeltaH * ratio) ? rawDeltaW : rawDeltaH * ratio;

    newW = Math.max(minW, safeInitW + scaleDeltaW);
    newH = Math.max(minH, newW / ratio);
    newW = Math.max(minW, newH * ratio);

    if (handle.includes('w')) {
      newX = initialX + (safeInitW - newW);
    }
    if (handle.includes('n')) {
      newY = initialY + (safeInitH - newH);
    }
  } else {
    if (handle.includes('e')) {
      newW = Math.max(minW, safeInitW + deltaX);
    }
    if (handle.includes('s')) {
      newH = Math.max(minH, safeInitH + deltaY);
    }
    if (handle.includes('w')) {
      const maxDeltaLeft = safeInitW - minW;
      const clampedDeltaX = Math.min(maxDeltaLeft, deltaX);
      newX = initialX + clampedDeltaX;
      newW = safeInitW - clampedDeltaX;
    }
    if (handle.includes('n')) {
      const maxDeltaTop = safeInitH - minH;
      const clampedDeltaY = Math.min(maxDeltaTop, deltaY);
      newY = initialY + clampedDeltaY;
      newH = safeInitH - clampedDeltaY;
    }
  }

  return {
    x: Number(newX.toFixed(2)),
    y: Number(newY.toFixed(2)),
    width: Number(newW.toFixed(2)),
    height: Number(newH.toFixed(2)),
  };
}

/**
 * Calculates the base pixels-per-inch scale for the book canvas based on which side panels are open
 * AND the actual browser viewport dimensions (if provided), ensuring that at 100% zoom the page
 * and its resize handles always fit on screen whether the user's screen size is high or low.
 */
export function calculateCanvasBaseScale(params: {
  leftPanelOpen: boolean;
  leftToolDrawerOpen: boolean;
  rightPanelOpen: boolean;
  isSpread: boolean;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
  canvasWidthIn?: number;
  canvasHeightIn?: number;
}): number {
  const {
    leftPanelOpen,
    leftToolDrawerOpen,
    rightPanelOpen,
    isSpread,
    viewportWidthPx,
    viewportHeightPx,
    canvasWidthIn,
    canvasHeightIn,
  } = params;

  const isDrawerOpen = leftPanelOpen && leftToolDrawerOpen;

  let fallbackScale = 58;
  if (isSpread) {
    if (!leftPanelOpen && !rightPanelOpen) fallbackScale = 76;
    else if (!leftPanelOpen || !rightPanelOpen) fallbackScale = isDrawerOpen ? 63 : 67;
    else if (isDrawerOpen) fallbackScale = 52;
    else fallbackScale = 58;
  } else {
    if (!leftPanelOpen && !rightPanelOpen) fallbackScale = 82;
    else if (!leftPanelOpen || !rightPanelOpen) fallbackScale = isDrawerOpen ? 69 : 73;
    else if (isDrawerOpen) fallbackScale = 58;
    else fallbackScale = 64;
  }

  if (
    typeof viewportWidthPx === 'number' &&
    typeof viewportHeightPx === 'number' &&
    viewportWidthPx > 200 &&
    viewportHeightPx > 200
  ) {
    const wIn = canvasWidthIn && canvasWidthIn > 0 ? canvasWidthIn : isSpread ? 12.3 : 6.0;
    const hIn = canvasHeightIn && canvasHeightIn > 0 ? canvasHeightIn : 9.25;

    // Reserve space for rulers (32px) + comfortable margin around the page so resize handles & floating menu stay visible
    const maxUsableW = Math.max(160, viewportWidthPx - 68);
    const maxUsableH = Math.max(160, viewportHeightPx - 68);

    // Progressive enlargement factors whenever side panels or drawers are closed so the main screen
    // always gets noticeably larger for viewing and resizing images/elements while staying fitted on screen
    let heightFactor = 1.0;
    let widthFactor = 1.0;

    if (leftPanelOpen && rightPanelOpen) {
      heightFactor = isDrawerOpen ? 0.76 : 0.82;
      widthFactor = isDrawerOpen ? 0.94 : 0.96;
    } else if (leftPanelOpen && !rightPanelOpen) {
      heightFactor = isDrawerOpen ? 0.86 : 0.91;
      widthFactor = isDrawerOpen ? 0.97 : 0.98;
    } else if (!leftPanelOpen && rightPanelOpen) {
      heightFactor = 0.91;
      widthFactor = 0.98;
    } else {
      heightFactor = 1.0;
      widthFactor = 1.0;
    }

    const usableW = maxUsableW * widthFactor;
    const usableH = maxUsableH * heightFactor;
    const fitted = Math.min(usableW / wIn, usableH / hIn);
    return Number(Math.max(22, Math.min(140, fitted)).toFixed(2));
  }

  return fallbackScale;
}

export interface ResizeHandlePoint {
  id: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
  hx: number;
  hy: number;
  isCorner: boolean;
}

/**
 * Computes the 8 resize handle positions in SVG coordinates, clamping them inside the
 * visible canvas/viewport bounds when an element is at 100% page size or extends near/beyond
 * the edge so the resize handles never get clipped or disappear off-screen.
 */
export function calculateVisibleResizeHandles(params: {
  cx: number;
  cy: number;
  cw: number;
  ch: number;
  canvasW: number;
  canvasH: number;
  insetMargin?: number;
  visibleMinX?: number;
  visibleMinY?: number;
  visibleMaxX?: number;
  visibleMaxY?: number;
}): {
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  handles: ResizeHandlePoint[];
} {
  const { cx, cy, cw, ch, canvasW, canvasH } = params;
  const pad = params.insetMargin ?? 6;

  const minX = Math.max(pad, params.visibleMinX ?? pad);
  const minY = Math.max(pad, params.visibleMinY ?? pad);
  const maxX = Math.min(canvasW - pad, params.visibleMaxX ?? canvasW - pad);
  const maxY = Math.min(canvasH - pad, params.visibleMaxY ?? canvasH - pad);

  const leftX = Math.max(minX, Math.min(maxX - 12, cx));
  const rightX = Math.min(maxX, Math.max(leftX + 12, cx + cw));
  const topY = Math.max(minY, Math.min(maxY - 12, cy));
  const bottomY = Math.min(maxY, Math.max(topY + 12, cy + ch));
  const midX = (leftX + rightX) / 2;
  const midY = (topY + bottomY) / 2;

  return {
    boxX: leftX,
    boxY: topY,
    boxW: rightX - leftX,
    boxH: bottomY - topY,
    handles: [
      { id: 'nw', hx: leftX, hy: topY, isCorner: true },
      { id: 'n', hx: midX, hy: topY, isCorner: false },
      { id: 'ne', hx: rightX, hy: topY, isCorner: true },
      { id: 'e', hx: rightX, hy: midY, isCorner: false },
      { id: 'se', hx: rightX, hy: bottomY, isCorner: true },
      { id: 's', hx: midX, hy: bottomY, isCorner: false },
      { id: 'sw', hx: leftX, hy: bottomY, isCorner: true },
      { id: 'w', hx: leftX, hy: midY, isCorner: false },
    ],
  };
}

export type PageBackgroundScope = 'current' | 'all_inner' | 'all_pages';

/**
 * Updates the background color of either the active page, all inner pages (!isCover), or all pages.
 */
export function applyPageBackgroundColor<
  T extends { id: string; isCover?: boolean; backgroundColor: string }
>(pages: T[], activePageIndex: number, colorHex: string, scope: PageBackgroundScope): T[] {
  const normalizedColor = colorHex.trim() || '#FFFFFF';
  return pages.map((page, idx) => {
    if (scope === 'all_pages') {
      return { ...page, backgroundColor: normalizedColor };
    }
    if (scope === 'all_inner') {
      return page.isCover ? page : { ...page, backgroundColor: normalizedColor };
    }
    // scope === 'current'
    return idx === activePageIndex ? { ...page, backgroundColor: normalizedColor } : page;
  });
}

export interface BulkPageItem {
  id: string;
  pageNumber: number;
  isCover?: boolean;
  isEven?: boolean;
  name: string;
  backgroundColor: string;
  templateType?: string;
  showPageNumber?: boolean;
  elements: any[];
}

export function bulkAddInteriorPages<T extends BulkPageItem & { indexConfig?: any }>(params: {
  pages: T[];
  countToAdd: number;
  templateType?: string;
  backgroundColor?: string;
  insertAfterIndex?: number;
  createPageId?: (index: number) => string;
}): T[] {
  const { pages, countToAdd, templateType, backgroundColor, insertAfterIndex, createPageId } = params;
  const safeCount = Math.max(0, Math.min(600, Math.floor(countToAdd)));
  if (safeCount === 0) return pages;

  // Find a reference non-index interior page to inherit template & background color if not explicitly passed
  const sampleInterior =
    [...pages].reverse().find(p => !p.isCover && !isIndexTemplateType(p.templateType)) ||
    [...pages].reverse().find(p => !p.isCover) ||
    pages.find(p => !p.isCover);
  const resolvedTemplate =
    templateType ||
    (sampleInterior?.templateType && !isIndexTemplateType(sampleInterior.templateType)
      ? sampleInterior.templateType
      : 'lined');
  const resolvedBg = backgroundColor || sampleInterior?.backgroundColor || '#FFFFFF';

  const newPages: T[] = Array.from({ length: safeCount }, (_, i) => {
    const pageNum = pages.length + i + 1;
    const id = createPageId
      ? createPageId(i)
      : `page-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      ...(sampleInterior ? { ...sampleInterior } : {}),
      id,
      pageNumber: pageNum,
      isCover: false,
      isEven: pageNum % 2 === 0,
      name: `Page ${pageNum}`,
      backgroundColor: resolvedBg,
      templateType: resolvedTemplate,
      showPageNumber: sampleInterior?.showPageNumber ?? true,
      indexConfig: undefined,
      elements: [],
    } as unknown as T;
  });

  const combined = [...pages];
  if (typeof insertAfterIndex === 'number' && insertAfterIndex >= 0 && insertAfterIndex < combined.length) {
    combined.splice(insertAfterIndex + 1, 0, ...newPages);
  } else {
    combined.push(...newPages);
  }

  const reindexed = combined.map((p, idx) => ({
    ...p,
    pageNumber: idx + 1,
    isEven: (idx + 1) % 2 === 0,
    name: p.isCover ? 'Cover Spread' : p.name.startsWith('Page ') ? `Page ${idx + 1}` : p.name,
  }));

  if (reindexed.some(p => p.indexConfig?.entries && p.indexConfig.entries.length > 0)) {
    return syncLinkedIndexPagesInBook(reindexed as any) as unknown as T[];
  }
  return reindexed;
}

/**
 * Sets the total number of pages in the book (either bulk-adding new interior pages or trimming trailing interior pages).
 * Always preserves index 0 (Cover Spread) and at least 1 interior page (minimum total = 2, max = 828).
 */
export function setBookTotalPageCount<T extends BulkPageItem & { indexConfig?: any }>(params: {
  pages: T[];
  targetTotalPages: number;
  templateType?: string;
  backgroundColor?: string;
  createPageId?: (index: number) => string;
}): T[] {
  const { pages, targetTotalPages, templateType, backgroundColor, createPageId } = params;
  const clampedTarget = Math.max(2, Math.min(828, Math.floor(targetTotalPages)));

  if (clampedTarget === pages.length) {
    return pages;
  }

  if (clampedTarget > pages.length) {
    return bulkAddInteriorPages({
      pages,
      countToAdd: clampedTarget - pages.length,
      templateType,
      backgroundColor,
      createPageId,
    });
  }

  // Trimming down to clampedTarget while keeping Cover Spread at index 0
  const trimmed = pages.slice(0, clampedTarget);
  const reindexed = trimmed.map((p, idx) => ({
    ...p,
    pageNumber: idx + 1,
    isEven: (idx + 1) % 2 === 0,
    name: p.isCover ? 'Cover Spread' : p.name.startsWith('Page ') ? `Page ${idx + 1}` : p.name,
  }));

  if (reindexed.some(p => p.indexConfig?.entries && p.indexConfig.entries.length > 0)) {
    return syncLinkedIndexPagesInBook(reindexed as any) as unknown as T[];
  }
  return reindexed;
}

export type PaperCoverPlacementTarget = 'front_cover' | 'back_cover' | 'full_wrap' | 'front_center';

/**
 * Calculates percentage coordinates (x, y, width, height) to fit an image onto the
 * Front Paper Cover, Back Paper Cover, Full Wrap-Around Cover Spread, or Centered Front Emblem.
 */
export function calculatePaperCoverPlacementBox(params: {
  target: PaperCoverPlacementTarget;
  totalWidthIn: number;
  totalHeightIn: number;
  bleedMarginIn: number;
  trimWidthIn: number;
  spineWidthIn: number;
}): { x: number; y: number; width: number; height: number } {
  const { target, totalWidthIn, bleedMarginIn, trimWidthIn, spineWidthIn } = params;
  const safeTotalW = totalWidthIn > 0 ? totalWidthIn : 12.3;

  if (target === 'full_wrap') {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  const backRightIn = bleedMarginIn + trimWidthIn;
  const spineRightIn = backRightIn + spineWidthIn;

  if (target === 'back_cover') {
    const backWidthPct = Number(((backRightIn / safeTotalW) * 100).toFixed(2));
    return { x: 0, y: 0, width: Math.max(10, Math.min(100, backWidthPct)), height: 100 };
  }

  if (target === 'front_cover') {
    const frontStartPct = Number(((spineRightIn / safeTotalW) * 100).toFixed(2));
    const frontWidthPct = Number((100 - frontStartPct).toFixed(2));
    return {
      x: Math.max(0, Math.min(90, frontStartPct)),
      y: 0,
      width: Math.max(10, Math.min(100, frontWidthPct)),
      height: 100,
    };
  }

  // 'front_center'
  const frontCenterIn = spineRightIn + trimWidthIn / 2;
  const frontCenterPct = (frontCenterIn / safeTotalW) * 100;
  const defaultW = 22;
  const defaultH = 28;
  return {
    x: Number(Math.max(0, Math.min(100 - defaultW, frontCenterPct - defaultW / 2)).toFixed(2)),
    y: 20,
    width: defaultW,
    height: defaultH,
  };
}

/**
 * Determines the best initial page index when opening the Book Preview modal.
 * Always starts on Page 1 (index 0, the Paper Cover Spread) whenever any cover or page images exist,
 * so the user immediately sees their Front and Back Paper Cover when clicking Preview.
 */
export function resolvePreviewInitialPageIndex(
  pages: { isCover?: boolean; elements: { type: string }[] }[],
  activePageIndex: number
): number {
  if (!pages || pages.length === 0) return 0;
  const anyPageHasImages = pages.some(p => p?.elements?.some(e => e.type === 'image'));
  if (anyPageHasImages) {
    return 0;
  }
  const safeActive = Math.max(0, Math.min(pages.length - 1, activePageIndex));
  return safeActive === 0 ? 0 : 0;
}

/**
 * Resolves the ordered list of elements to render on the Cover Spread in Preview mode and PDF export.
 * Collects all cover elements from Page 1 (index 0) plus any paper cover images placed on interior pages
 * (such as Page 2, the notebook template spread, or the final page), ensuring both Front and Back cover
 * images are always visible on top of default placeholder elements.
 */
export function resolveCoverPreviewElements<
  T extends { id: string; type: string; x: number; y: number; width: number; height: number }
>(pages: { isCover?: boolean; elements: T[] }[]): T[] {
  if (!pages || pages.length === 0) return [];
  const coverElements = [...(pages[0]?.elements || [])];
  const coverImageElements = coverElements.filter(e => e.type === 'image').map(e => ({ ...e }));
  const seenIds = new Set(coverElements.map(e => e.id));

  // Gather any images placed on interior pages (e.g. when user inserted paper cover images on the notebook template page)
  const interiorImagesWithPage: { el: T; pageIdx: number }[] = [];
  for (let i = 1; i < pages.length; i++) {
    const pElems = pages[i]?.elements || [];
    for (const el of pElems) {
      if (el.type === 'image' && !seenIds.has(el.id)) {
        seenIds.add(el.id);
        interiorImagesWithPage.push({ el: { ...el }, pageIdx: i });
      }
    }
  }

  const allImages: T[] = [
    ...coverImageElements,
    ...interiorImagesWithPage.map(item => ({ ...item.el })),
  ];

  if (allImages.length === 1) {
    const onlyImg = allImages[0];
    // If this single image came from an interior page where it was centered in single-page coordinates (x ~ 20..42%),
    // place it cleanly on the Front Cover (right side of the spread) so it does not straddle the spine fold
    const cameFromInterior = coverImageElements.length === 0 && interiorImagesWithPage.length === 1;
    if (cameFromInterior && onlyImg.x >= 18 && onlyImg.x <= 42 && onlyImg.width <= 60) {
      onlyImg.x = Number(Math.min(95 - onlyImg.width, 52 + (48 - onlyImg.width) / 2).toFixed(2));
    }
  } else if (allImages.length >= 2) {
    // Check if we already have at least one image on the Back Cover (left half, center < 50)
    // and at least one image on the Front Cover (right half, center >= 50) without full-wrap overlap
    const first = allImages[0];
    const second = allImages[1];
    const firstCenter = first.x + first.width / 2;
    const secondCenter = second.x + second.width / 2;
    const bothFullWrap = first.width >= 75 && second.width >= 75;
    const bothOnRight = firstCenter >= 45 && secondCenter >= 45;
    const bothOnLeft = firstCenter < 50 && secondCenter < 50;

    if (bothFullWrap || bothOnRight || bothOnLeft) {
      // Place first image on Front Cover (right half) and second image on Back Cover (left half)
      allImages[0] = {
        ...first,
        x: first.width >= 45 ? 50.5 : Math.max(51, first.x),
        width: first.width >= 45 ? 49.5 : Math.min(47, Math.max(35, first.width)),
      };
      allImages[1] = {
        ...second,
        x: second.width >= 45 ? 0 : 2,
        width: second.width >= 45 ? 49.5 : Math.min(47, Math.max(35, second.width)),
      };
    }
  }

  const nonImages = coverElements.filter(e => e.type !== 'image');
  return [...nonImages, ...allImages];
}

/**
 * Extracts and remaps elements from the 2-page Cover Spread (0..100% of totalWidth)
 * onto a standalone Single-Page Front Cover or Back Cover (0..100% of single trim width).
 */
export function extractSingleCoverPageElements<
  T extends { id: string; type: string; x: number; y: number; width: number; height: number }
>(params: {
  elements: T[];
  side: 'front' | 'back';
  totalWidthIn: number;
  bleedMarginIn: number;
  trimWidthIn: number;
  spineWidthIn: number;
}): T[] {
  const { elements, side, totalWidthIn, bleedMarginIn, trimWidthIn, spineWidthIn } = params;
  if (!elements || elements.length === 0) return [];

  const safeTotalW = totalWidthIn > 0 ? totalWidthIn : 12.3;
  const backWidthPct = ((bleedMarginIn + trimWidthIn) / safeTotalW) * 100;
  const frontStartPct = ((bleedMarginIn + trimWidthIn + spineWidthIn) / safeTotalW) * 100;
  const frontWidthPct = Math.max(10, 100 - frontStartPct);

  const result: T[] = [];

  for (const el of elements) {
    const centerX = el.x + el.width / 2;
    const isFullWrap = el.x <= 15 && el.x + el.width >= 85;

    if (isFullWrap) {
      result.push({
        ...el,
        x: 0,
        width: 100,
      });
      continue;
    }

    if (side === 'front') {
      if (centerX >= 45 || el.x + el.width > 55) {
        const mappedX = ((el.x - frontStartPct) / frontWidthPct) * 100;
        const mappedW = Math.max(5, (el.width / frontWidthPct) * 100);
        result.push({
          ...el,
          x: Number(mappedX.toFixed(2)),
          width: Number(mappedW.toFixed(2)),
        });
      }
    } else {
      // side === 'back'
      if (centerX < 50 || el.x < 45) {
        const mappedX = (el.x / Math.max(10, backWidthPct)) * 100;
        const mappedW = Math.max(5, (el.width / Math.max(10, backWidthPct)) * 100);
        result.push({
          ...el,
          x: Number(mappedX.toFixed(2)),
          width: Number(mappedW.toFixed(2)),
        });
      }
    }
  }

  // Fallback for Front Cover: if no image landed on the right half, use the first available image
  if (side === 'front' && !result.some(e => e.type === 'image')) {
    const firstImg = elements.find(e => e.type === 'image');
    if (firstImg) {
      result.push({
        ...firstImg,
        x: firstImg.width >= 35 ? 0 : Math.max(0, Math.min(80, firstImg.x)),
        y: firstImg.height >= 70 ? 0 : firstImg.y,
        width: firstImg.width >= 35 ? 100 : Math.min(100, firstImg.width * 1.8),
        height: firstImg.height >= 70 ? 100 : firstImg.height,
      });
    }
  }

  // Fallback for Back Cover: if no image landed on the left half, use the 2nd image if available, or the 1st image
  if (side === 'back' && !result.some(e => e.type === 'image')) {
    const allImgs = elements.filter(e => e.type === 'image');
    const backFallbackImg = allImgs.length >= 2 ? allImgs[1] : allImgs[0];
    if (backFallbackImg) {
      result.push({
        ...backFallbackImg,
        x: backFallbackImg.width >= 35 ? 0 : Math.max(0, Math.min(80, backFallbackImg.x)),
        y: backFallbackImg.height >= 70 ? 0 : backFallbackImg.y,
        width: backFallbackImg.width >= 35 ? 100 : Math.min(100, backFallbackImg.width * 1.8),
        height: backFallbackImg.height >= 70 ? 100 : backFallbackImg.height,
      });
    }
  }

  return result;
}

export type IndexTemplateStyle =
  | 'index_classic'
  | 'index_bullet'
  | 'index_numbered'
  | 'index_alphabetical'
  | 'index_categorical'
  | 'index_project'
  | 'index_monthly'
  | 'index_glossary'
  | 'index_reading'
  | 'index_recipe'
  | 'index_study'
  | 'index_collection';

export type IndexTemplateCategory =
  | 'General Indexes'
  | 'Journals & Planners'
  | 'Study & Research'
  | 'Books & Collections';

export const INDEX_TEMPLATE_CATEGORIES: IndexTemplateCategory[] = [
  'General Indexes',
  'Journals & Planners',
  'Study & Research',
  'Books & Collections',
];

export interface IndexTemplateMetadata {
  id: IndexTemplateStyle;
  title: string;
  shortLabel: string;
  category: IndexTemplateCategory;
  desc: string;
  description: string;
  supportsDateField?: boolean;
  supportsStatusField?: boolean;
  supportsCategoryField?: boolean;
  supportsNotesField?: boolean;
  supportsNumberedRange?: boolean;
  supportsAzGrouping?: boolean;
  supportsLetterGroups?: boolean;
}

export interface IndexEntryLink {
  id: string;
  entryNumber?: number;
  label: string;
  category?: string;
  date?: string;
  status?: string;
  linkedPageId?: string | null;
  manualPageText?: string;
}

export interface ResolvedIndexEntry extends IndexEntryLink {
  slotIndex: number;
  resolvedPageNumber: number | null;
  resolvedPageName: string | null;
  displayPageText: string;
  isLinked: boolean;
  isBrokenLink: boolean;
  warningMessage: string | null;
}

export interface IndexPageConfig {
  templateId: IndexTemplateStyle | string;
  title: string;
  subtitle?: string;
  entriesPerPage: number;
  totalEntriesRequested: number;
  columnsCount: number;
  columnLabels: string[];
  pageCount: number;
  fontSizePt: number;
  lineSpacing: 'compact' | 'normal' | 'relaxed';
  showPageNumbersColumn: boolean;
  showPageNumberCol?: boolean;
  showDateColumn?: boolean;
  showDateField?: boolean;
  showStatusColumn?: boolean;
  showStatusField?: boolean;
  showCategoryColumn?: boolean;
  showCategoryField?: boolean;
  showNotesField?: boolean;
  numberedRangePreset?: '1-25' | '1-50' | '1-100' | 'custom';
  numberedRangeStart?: number;
  numberedRangeEnd?: number;
  customRangeStart?: number;
  customRangeEnd?: number;
  azLetterGrouping?: '9-box' | '6-box' | '13-box' | '26-box';
  letterGroupMode?: '3-per-box' | '2-per-box' | 'a-m-n-z' | 'single-letters';
  azLinesPerGroup?: number;
  linesPerSection?: number;
  pageSequenceIndex?: number;
  pageSequenceTotal?: number;
  startEntryNumber?: number;
  endEntryNumber?: number;
  hasEditableHeaderElements?: boolean;
  indexMode?: 'blank' | 'linked';
  entries?: IndexEntryLink[];
}

export const INDEX_PAGE_TEMPLATES: IndexTemplateMetadata[] = [
  {
    id: 'index_classic',
    title: 'Classic Table of Contents',
    shortLabel: 'Classic TOC',
    category: 'General Indexes',
    desc: 'Traditional section and topic rows with dotted leader lines and right-aligned page numbers.',
    description: 'Traditional section and topic rows with dotted leader lines and right-aligned page numbers.',
    supportsDateField: true,
    supportsCategoryField: true,
    supportsNotesField: true,
  },
  {
    id: 'index_bullet',
    title: 'Bullet Journal Index',
    shortLabel: 'Bullet Index',
    category: 'Journals & Planners',
    desc: 'Bullet journal index with symbol key legend bar, collection topic, date, and page span columns.',
    description: 'Bullet journal index with symbol key legend bar, collection topic, date, and page span columns.',
    supportsDateField: true,
    supportsStatusField: true,
    supportsNotesField: true,
  },
  {
    id: 'index_numbered',
    title: 'Numbered Reference Index',
    shortLabel: 'Numbered Ref',
    category: 'General Indexes',
    desc: 'Pre-numbered multi-column directory (1–25, 1–50, 1–100, or custom range) for rapid lookup.',
    description: 'Pre-numbered multi-column directory (1–25, 1–50, 1–100, or custom range) for rapid lookup.',
    supportsNumberedRange: true,
    supportsCategoryField: true,
  },
  {
    id: 'index_alphabetical',
    title: 'A–Z Alphabetical Directory',
    shortLabel: 'A–Z Directory',
    category: 'General Indexes',
    desc: 'Alphabetical A–Z grouped directory boxes with configurable letter groups and writing lines.',
    description: 'Alphabetical A–Z grouped directory boxes with configurable letter groups and writing lines.',
    supportsAzGrouping: true,
    supportsLetterGroups: true,
    supportsNotesField: true,
  },
  {
    id: 'index_categorical',
    title: 'Category & Subject Index',
    shortLabel: 'Category Index',
    category: 'Study & Research',
    desc: 'Structured modular subject category boxes with dedicated topic lines and page reference columns.',
    description: 'Structured modular subject category boxes with dedicated topic lines and page reference columns.',
    supportsCategoryField: true,
    supportsNotesField: true,
  },
  {
    id: 'index_project',
    title: 'Project & Archive Log',
    shortLabel: 'Project Log',
    category: 'Journals & Planners',
    desc: 'Project register with date, document or project title, completion status checkbox, and page reference.',
    description: 'Project register with date, document or project title, completion status checkbox, and page reference.',
    supportsDateField: true,
    supportsStatusField: true,
    supportsCategoryField: true,
    supportsNotesField: true,
  },
  {
    id: 'index_monthly',
    title: 'Monthly Index',
    shortLabel: 'Monthly Index',
    category: 'Journals & Planners',
    desc: '12-month calendar directory (January–December) with monthly highlight rows and page references.',
    description: '12-month calendar directory (January–December) with monthly highlight rows and page references.',
    supportsDateField: true,
    supportsNotesField: true,
  },
  {
    id: 'index_glossary',
    title: 'Glossary & Vocabulary Index',
    shortLabel: 'Glossary Index',
    category: 'Study & Research',
    desc: 'Term and definition register with concept keyword, category tag, concise definition, and page #.',
    description: 'Term and definition register with concept keyword, category tag, concise definition, and page #.',
    supportsCategoryField: true,
    supportsNotesField: true,
  },
  {
    id: 'index_reading',
    title: 'Reading & Book Index',
    shortLabel: 'Reading Log',
    category: 'Books & Collections',
    desc: 'Reading tracker index with book title, author, genre/status, 5-star rating graphic, and page #.',
    description: 'Reading tracker index with book title, author, genre/status, 5-star rating graphic, and page #.',
    supportsStatusField: true,
    supportsCategoryField: true,
    supportsDateField: true,
  },
  {
    id: 'index_recipe',
    title: 'Recipe Index',
    shortLabel: 'Recipe Index',
    category: 'Books & Collections',
    desc: 'Culinary recipe directory featuring dish name, course category, prep time, favorite star, and page #.',
    description: 'Culinary recipe directory featuring dish name, course category, prep time, favorite star, and page #.',
    supportsCategoryField: true,
    supportsStatusField: true,
    supportsNotesField: true,
  },
  {
    id: 'index_study',
    title: 'Study & Research Index',
    shortLabel: 'Study Index',
    category: 'Study & Research',
    desc: 'Academic syllabus and research log with module topic, source/citation, review checkboxes, and page #.',
    description: 'Academic syllabus and research log with module topic, source/citation, review checkboxes, and page #.',
    supportsStatusField: true,
    supportsCategoryField: true,
    supportsNotesField: true,
  },
  {
    id: 'index_collection',
    title: 'Collection & Inventory Index',
    shortLabel: 'Inventory Index',
    category: 'Books & Collections',
    desc: 'Catalog register with item ID/SKU, specimen/item name, location/category, condition, and page #.',
    description: 'Catalog register with item ID/SKU, specimen/item name, location/category, condition, and page #.',
    supportsCategoryField: true,
    supportsStatusField: true,
    supportsNotesField: true,
  },
];

export function isIndexTemplateType(templateType?: string): boolean {
  if (!templateType) return false;
  return templateType === 'index' || templateType.startsWith('index_');
}

export function getDefaultIndexConfig(style?: IndexTemplateStyle | string): IndexPageConfig {
  const resolved: IndexTemplateStyle =
    style && style !== 'index' && isIndexTemplateType(style)
      ? (style as IndexTemplateStyle)
      : 'index_classic';

  const baseConfig = ((): IndexPageConfig => {
    switch (resolved) {
    case 'index_bullet':
      return {
        templateId: 'index_bullet',
        title: 'BULLET JOURNAL INDEX',
        subtitle: 'KEY SYMBOLS:  • Task   × Done   > Migrated   ★ Priority   ○ Event',
        entriesPerPage: 18,
        totalEntriesRequested: 18,
        columnsCount: 4,
        columnLabels: ['KEY', 'COLLECTION / TOPIC', 'DATE', 'PAGES'],
        pageCount: 1,
        fontSizePt: 9,
        lineSpacing: 'normal',
        showPageNumbersColumn: true,
        showPageNumberCol: true,
        showDateColumn: true,
        showDateField: true,
        showStatusColumn: true,
        showStatusField: true,
        showCategoryColumn: false,
        showCategoryField: false,
        showNotesField: false,
      };
    case 'index_numbered':
      return {
        templateId: 'index_numbered',
        title: 'NUMBERED REFERENCE INDEX',
        subtitle: 'Entries 01 – 50',
        entriesPerPage: 50,
        totalEntriesRequested: 50,
        columnsCount: 2,
        columnLabels: ['NO.', 'ENTRY / SUBJECT', 'PG'],
        pageCount: 1,
        fontSizePt: 8.5,
        lineSpacing: 'compact',
        showPageNumbersColumn: true,
        showPageNumberCol: true,
        numberedRangePreset: '1-50',
        numberedRangeStart: 1,
        numberedRangeEnd: 50,
        customRangeStart: 1,
        customRangeEnd: 50,
        showCategoryColumn: false,
        showCategoryField: false,
      };
    case 'index_alphabetical':
      return {
        templateId: 'index_alphabetical',
        title: 'A – Z ALPHABETICAL DIRECTORY',
        subtitle: 'Alphabetical Topic & Reference Guide',
        entriesPerPage: 9,
        totalEntriesRequested: 9,
        columnsCount: 3,
        columnLabels: ['A–Z GROUP', 'ENTRY / TOPIC', 'PG'],
        pageCount: 1,
        fontSizePt: 8.5,
        lineSpacing: 'normal',
        showPageNumbersColumn: true,
        showPageNumberCol: true,
        azLetterGrouping: '9-box',
        letterGroupMode: '3-per-box',
        azLinesPerGroup: 5,
        linesPerSection: 5,
        showNotesField: false,
      };
    case 'index_categorical':
      return {
        templateId: 'index_categorical',
        title: 'CATEGORY & SUBJECT INDEX',
        subtitle: 'Organized by Subject Area',
        entriesPerPage: 4,
        totalEntriesRequested: 4,
        columnsCount: 2,
        columnLabels: ['CATEGORY I', 'CATEGORY II', 'CATEGORY III', 'CATEGORY IV'],
        pageCount: 1,
        fontSizePt: 9,
        lineSpacing: 'normal',
        showPageNumbersColumn: true,
        showPageNumberCol: true,
        showCategoryColumn: true,
        showCategoryField: true,
        linesPerSection: 8,
        showNotesField: false,
      };
    case 'index_project':
      return {
        templateId: 'index_project',
        title: 'PROJECT & ARCHIVE LOG',
        subtitle: 'VOLUME / ARCHIVE #: ________',
        entriesPerPage: 18,
        totalEntriesRequested: 18,
        columnsCount: 4,
        columnLabels: ['DATE', 'PROJECT / DOCUMENT TITLE', 'DONE', 'PAGE #'],
        pageCount: 1,
        fontSizePt: 9,
        lineSpacing: 'normal',
        showPageNumbersColumn: true,
        showPageNumberCol: true,
        showDateColumn: true,
        showDateField: true,
        showStatusColumn: true,
        showStatusField: true,
        showCategoryColumn: false,
        showCategoryField: false,
        showNotesField: false,
      };
    case 'index_monthly':
      return {
        templateId: 'index_monthly',
        title: 'MONTHLY OVERVIEW INDEX',
        subtitle: 'JANUARY – DECEMBER ANNUAL DIRECTORY',
        entriesPerPage: 12,
        totalEntriesRequested: 12,
        columnsCount: 3,
        columnLabels: ['MONTH', 'KEY HIGHLIGHTS & EVENTS', 'PG'],
        pageCount: 1,
        fontSizePt: 8.5,
        lineSpacing: 'normal',
        showPageNumbersColumn: true,
        showPageNumberCol: true,
        showDateColumn: true,
        showDateField: true,
        linesPerSection: 3,
        showNotesField: false,
      };
    case 'index_glossary':
      return {
        templateId: 'index_glossary',
        title: 'GLOSSARY & VOCABULARY INDEX',
        subtitle: 'KEY TERMS, CONCEPTS & DEFINITIONS',
        entriesPerPage: 16,
        totalEntriesRequested: 16,
        columnsCount: 4,
        columnLabels: ['TERM / CONCEPT', 'CATEGORY', 'DEFINITION / USAGE', 'PG'],
        pageCount: 1,
        fontSizePt: 8.5,
        lineSpacing: 'normal',
        showPageNumbersColumn: true,
        showPageNumberCol: true,
        showCategoryColumn: true,
        showCategoryField: true,
        showNotesField: false,
      };
    case 'index_reading':
      return {
        templateId: 'index_reading',
        title: 'READING & BOOK INDEX',
        subtitle: 'PERSONAL LIBRARY & BOOK REVIEW LOG',
        entriesPerPage: 18,
        totalEntriesRequested: 18,
        columnsCount: 5,
        columnLabels: ['#', 'BOOK TITLE', 'AUTHOR', 'RATING ★', 'PAGE #'],
        pageCount: 1,
        fontSizePt: 8.5,
        lineSpacing: 'normal',
        showPageNumbersColumn: true,
        showPageNumberCol: true,
        showStatusColumn: true,
        showStatusField: true,
        showCategoryColumn: true,
        showCategoryField: true,
        showDateField: false,
        showDateColumn: false,
      };
    case 'index_recipe':
      return {
        templateId: 'index_recipe',
        title: 'CULINARY RECIPE INDEX',
        subtitle: 'KITCHEN KEEPSAKE & DISH DIRECTORY',
        entriesPerPage: 18,
        totalEntriesRequested: 18,
        columnsCount: 5,
        columnLabels: ['RECIPE TITLE', 'COURSE', 'PREP TIME', 'FAV ★', 'PAGE #'],
        pageCount: 1,
        fontSizePt: 9,
        lineSpacing: 'normal',
        showPageNumbersColumn: true,
        showPageNumberCol: true,
        showCategoryColumn: true,
        showCategoryField: true,
        showStatusColumn: true,
        showStatusField: true,
        showNotesField: true,
      };
    case 'index_study':
      return {
        templateId: 'index_study',
        title: 'STUDY & RESEARCH INDEX',
        subtitle: 'COURSE / SUBJECT: ___________________   TERM: __________',
        entriesPerPage: 16,
        totalEntriesRequested: 16,
        columnsCount: 4,
        columnLabels: ['MODULE / TOPIC', 'SOURCE / CITATION', 'MASTERY', 'PAGE #'],
        pageCount: 1,
        fontSizePt: 8.5,
        lineSpacing: 'normal',
        showPageNumbersColumn: true,
        showPageNumberCol: true,
        showStatusColumn: true,
        showStatusField: true,
        showCategoryColumn: true,
        showCategoryField: true,
        showNotesField: true,
      };
    case 'index_collection':
      return {
        templateId: 'index_collection',
        title: 'COLLECTION & INVENTORY INDEX',
        subtitle: 'COLLECTION: _______________________   CURATOR: __________',
        entriesPerPage: 18,
        totalEntriesRequested: 18,
        columnsCount: 5,
        columnLabels: ['ID / SKU', 'ITEM / SPECIMEN NAME', 'LOCATION / CAT', 'COND / QTY', 'PAGE #'],
        pageCount: 1,
        fontSizePt: 8.5,
        lineSpacing: 'normal',
        showPageNumbersColumn: true,
        showPageNumberCol: true,
        showCategoryColumn: true,
        showCategoryField: true,
        showStatusColumn: true,
        showStatusField: true,
        showNotesField: false,
      };
    case 'index_classic':
    default:
      return {
        templateId: 'index_classic',
        title: 'TABLE OF CONTENTS',
        subtitle: 'SECTION & TOPIC DIRECTORY',
        entriesPerPage: 20,
        totalEntriesRequested: 20,
        columnsCount: 3,
        columnLabels: ['#', 'SECTION / TOPIC TITLE', 'PAGE #'],
        pageCount: 1,
        fontSizePt: 9.5,
        lineSpacing: 'normal',
        showPageNumbersColumn: true,
        showPageNumberCol: true,
        showDateColumn: false,
        showDateField: false,
        showCategoryColumn: false,
        showCategoryField: false,
        showNotesField: false,
      };
    }
  })();

  return {
    indexMode: 'blank',
    entries: [],
    ...baseConfig,
  };
}

/**
 * Calculates how many entries fit on a single page without clipping and how many pages
 * are needed to accommodate the user's configured rows/range/letter-groups.
 */
export function calculateIndexPagination(
  config: Partial<IndexPageConfig> & {
    trimHeightIn?: number;
    topMarginIn?: number;
    bottomMarginIn?: number;
  },
  trimHeightInArg = 9.0,
  marginsArg: { top: number; bottom: number } = { top: 0.5, bottom: 0.5 }
): {
  maxEntriesPerSinglePage: number;
  maxEntriesPerPage: number;
  totalItemsRequested: number;
  recommendedPages: number;
  requiresMultiplePages: boolean;
  entriesPerPage: number;
  overflowWarning: string | null;
} {
  const trimHeightIn = config.trimHeightIn ?? trimHeightInArg ?? 9.0;
  const topM = config.topMarginIn ?? marginsArg.top ?? 0.5;
  const bottomM = config.bottomMarginIn ?? marginsArg.bottom ?? 0.5;
  const usableHeightIn = Math.max(4, trimHeightIn - topM - bottomM);
  const scaleFactor = usableHeightIn / 8.0; // normalized to 6x9 with 0.5" margins (8" usable height)
  const spacingMult =
    config.lineSpacing === 'compact' ? 1.18 : config.lineSpacing === 'relaxed' ? 0.82 : 1.0;
  const fontMult = 9.0 / Math.max(7, Math.min(14, config.fontSizePt || 9));
  const notesPenalty = config.showNotesField ? 0.86 : 1.0;

  const t = config.templateId || 'index_classic';
  if (t === 'index_numbered') {
    const preset = config.numberedRangePreset;
    const start =
      preset === '1-25' || preset === '1-50' || preset === '1-100'
        ? 1
        : Math.max(1, config.customRangeStart ?? config.numberedRangeStart ?? 1);
    const end =
      preset === '1-25'
        ? 25
        : preset === '1-50'
        ? 50
        : preset === '1-100'
        ? 100
        : Math.max(start, config.customRangeEnd ?? config.numberedRangeEnd ?? 50);
    const totalNums = Math.max(1, end - start + 1);
    const cols = Math.max(1, Math.min(3, config.columnsCount || (totalNums > 25 ? 2 : 1)));
    const maxRowsPerCol = Math.max(15, Math.min(35, Math.floor(25 * scaleFactor * spacingMult * fontMult * notesPenalty)));
    const maxPerSinglePage = maxRowsPerCol * cols;
    const recommendedPages = Math.max(1, Math.ceil(totalNums / maxPerSinglePage));
    const effectivePages = Math.max(1, config.pageCount || recommendedPages);
    const entriesPerPage = Math.min(maxPerSinglePage, Math.ceil(totalNums / effectivePages));
    return {
      maxEntriesPerSinglePage: maxPerSinglePage,
      maxEntriesPerPage: maxPerSinglePage,
      totalItemsRequested: totalNums,
      recommendedPages,
      requiresMultiplePages: totalNums > maxPerSinglePage,
      entriesPerPage,
      overflowWarning:
        totalNums > maxPerSinglePage && (config.pageCount || 1) < recommendedPages
          ? `${totalNums} numbered entries exceed 1 page (${maxPerSinglePage}/page max). Recommend ${recommendedPages} pages.`
          : null,
    };
  }

  if (t === 'index_alphabetical') {
    const mode = config.letterGroupMode;
    const grouping = config.azLetterGrouping;
    const isSingleLetters = mode === 'single-letters' || grouping === '26-box';
    const isAmNz = mode === 'a-m-n-z' || grouping === '6-box';
    const isTwoPerBox = mode === '2-per-box' || grouping === '13-box';

    const totalBoxes = isSingleLetters ? 26 : isAmNz ? 12 : isTwoPerBox ? 13 : 9;
    const maxBoxesPerPage = isAmNz ? 6 : isSingleLetters ? 26 : 13;
    const recommendedPages = isAmNz ? 2 : Math.max(1, Math.ceil(totalBoxes / maxBoxesPerPage));
    const effectivePages = Math.max(1, config.pageCount || recommendedPages);
    const entriesPerPage = Math.ceil(totalBoxes / effectivePages);
    return {
      maxEntriesPerSinglePage: maxBoxesPerPage,
      maxEntriesPerPage: maxBoxesPerPage,
      totalItemsRequested: totalBoxes,
      recommendedPages,
      requiresMultiplePages: recommendedPages > 1,
      entriesPerPage,
      overflowWarning:
        isAmNz && (config.pageCount || 1) < 2
          ? 'A–M / N–Z split layout is designed for 2 pages (A–M on Page 1, N–Z on Page 2).'
          : null,
    };
  }

  if (t === 'index_monthly') {
    const totalMonths = Math.max(6, Math.min(24, config.totalEntriesRequested || 12));
    const maxMonthsPerPage = 12;
    const recommendedPages = Math.max(1, Math.ceil(totalMonths / maxMonthsPerPage));
    const effectivePages = Math.max(1, config.pageCount || recommendedPages);
    const entriesPerPage = Math.min(maxMonthsPerPage, Math.ceil(totalMonths / effectivePages));
    return {
      maxEntriesPerSinglePage: maxMonthsPerPage,
      maxEntriesPerPage: maxMonthsPerPage,
      totalItemsRequested: totalMonths,
      recommendedPages,
      requiresMultiplePages: totalMonths > maxMonthsPerPage,
      entriesPerPage,
      overflowWarning: null,
    };
  }

  if (t === 'index_categorical') {
    const totalCats = Math.max(2, Math.min(12, config.totalEntriesRequested || config.entriesPerPage || 4));
    const maxCatsPerPage = 6;
    const recommendedPages = Math.max(1, Math.ceil(totalCats / maxCatsPerPage));
    const effectivePages = Math.max(1, config.pageCount || recommendedPages);
    const entriesPerPage = Math.min(maxCatsPerPage, Math.ceil(totalCats / effectivePages));
    return {
      maxEntriesPerSinglePage: maxCatsPerPage,
      maxEntriesPerPage: maxCatsPerPage,
      totalItemsRequested: totalCats,
      recommendedPages,
      requiresMultiplePages: totalCats > maxCatsPerPage,
      entriesPerPage,
      overflowWarning:
        totalCats > maxCatsPerPage && (config.pageCount || 1) < recommendedPages
          ? `${totalCats} category boxes exceed 1 page (max ${maxCatsPerPage}/page). Recommend ${recommendedPages} pages.`
          : null,
    };
  }

  // Row-based indexes (Classic TOC, Bullet, Project, Glossary, Reading, Recipe, Study, Collection)
  const baseMaxRows = t === 'index_glossary' || t === 'index_study' ? 20 : 24;
  const maxRowsPerPage = Math.max(
    10,
    Math.min(32, Math.floor(baseMaxRows * scaleFactor * spacingMult * fontMult * notesPenalty))
  );
  const totalRequested = Math.max(5, config.totalEntriesRequested || config.entriesPerPage || 20);
  const recommendedPages = Math.max(1, Math.ceil(totalRequested / maxRowsPerPage));
  const effectivePages = Math.max(1, config.pageCount || recommendedPages);
  const entriesPerPage = Math.min(maxRowsPerPage, Math.ceil(totalRequested / effectivePages));

  return {
    maxEntriesPerSinglePage: maxRowsPerPage,
    maxEntriesPerPage: maxRowsPerPage,
    totalItemsRequested: totalRequested,
    recommendedPages,
    requiresMultiplePages: totalRequested > maxRowsPerPage,
    entriesPerPage,
    overflowWarning:
      totalRequested > maxRowsPerPage && (config.pageCount || 1) < recommendedPages
        ? `${totalRequested} entries exceed 1 page (${maxRowsPerPage} rows/page max). Recommend ${recommendedPages} pages so rows aren't clipped.`
        : null,
  };
}

/**
 * Computes the per-page IndexPageConfig slice for page `pageSequenceIndex` (0-based) out of `pageSequenceTotal`.
 * Accepts either positional args `(baseConfig, pageSequenceIndex, pageSequenceTotal, trimHeightIn?, margins?)`
 * or a params object `{ baseConfig, pageSequenceIndex, pageSequenceTotal, trimHeightIn?, margins?, populateEditableElements? }`.
 */
export function buildPageSliceIndexConfig(
  paramsOrBaseConfig:
    | IndexPageConfig
    | {
        baseConfig: IndexPageConfig;
        pageSequenceIndex: number;
        pageSequenceTotal: number;
        trimHeightIn?: number;
        margins?: { top: number; bottom: number; left?: number; right?: number };
        populateEditableElements?: boolean;
      },
  pageSequenceIndexArg = 0,
  pageSequenceTotalArg = 1,
  trimHeightInArg = 9.0,
  marginsArg: { top: number; bottom: number; left?: number; right?: number } = { top: 0.5, bottom: 0.5 }
): IndexPageConfig {
  const isParamsObj =
    paramsOrBaseConfig &&
    typeof paramsOrBaseConfig === 'object' &&
    'baseConfig' in paramsOrBaseConfig;
  const baseConfig: IndexPageConfig = isParamsObj
    ? paramsOrBaseConfig.baseConfig
    : (paramsOrBaseConfig as IndexPageConfig);
  const pageSequenceIndex = isParamsObj
    ? paramsOrBaseConfig.pageSequenceIndex
    : pageSequenceIndexArg;
  const pageSequenceTotal = isParamsObj
    ? paramsOrBaseConfig.pageSequenceTotal
    : pageSequenceTotalArg;
  const trimHeightIn = isParamsObj
    ? paramsOrBaseConfig.trimHeightIn ?? 9.0
    : trimHeightInArg;
  const margins = isParamsObj
    ? paramsOrBaseConfig.margins ?? { top: 0.5, bottom: 0.5 }
    : marginsArg;
  const populateEditableElements = isParamsObj
    ? paramsOrBaseConfig.populateEditableElements ?? true
    : true;

  const safeCount = Math.max(1, pageSequenceTotal);
  const pagination = calculateIndexPagination(baseConfig, trimHeightIn, margins);

  const requestedPerPage =
    baseConfig.entriesPerPage &&
    baseConfig.entriesPerPage > 0 &&
    baseConfig.entriesPerPage * (safeCount - 1) < pagination.totalItemsRequested
      ? baseConfig.entriesPerPage
      : Math.ceil(pagination.totalItemsRequested / safeCount);

  const entriesPerSinglePage = Math.max(
    1,
    Math.min(pagination.maxEntriesPerSinglePage, requestedPerPage)
  );

  const preset = baseConfig.numberedRangePreset;
  const baseStart =
    baseConfig.templateId === 'index_numbered'
      ? preset === '1-25' || preset === '1-50' || preset === '1-100'
        ? 1
        : Math.max(1, baseConfig.customRangeStart ?? baseConfig.numberedRangeStart ?? 1)
      : 1;

  const startEntryNumber = baseStart + pageSequenceIndex * entriesPerSinglePage;
  const endEntryNumber = Math.min(
    baseStart + pagination.totalItemsRequested - 1,
    startEntryNumber + entriesPerSinglePage - 1
  );
  const countOnThisPage = Math.max(1, endEntryNumber - startEntryNumber + 1);
  const dynamicSubtitle =
    baseConfig.templateId === 'index_numbered' &&
    (!baseConfig.subtitle || baseConfig.subtitle.startsWith('Entries '))
      ? `Entries ${String(startEntryNumber).padStart(2, '0')} – ${String(endEntryNumber).padStart(2, '0')}`
      : baseConfig.subtitle;

  return {
    ...baseConfig,
    subtitle: dynamicSubtitle,
    pageCount: safeCount,
    entriesPerPage: countOnThisPage,
    pageSequenceIndex,
    pageSequenceTotal: safeCount,
    startEntryNumber,
    endEntryNumber,
    hasEditableHeaderElements: populateEditableElements,
  };
}

/**
 * Checks whether inserting N index pages after the front cover will shift existing interior pages,
 * and returns a descriptive warning message for the UI.
 */
export function checkIndexInsertionShiftWarning<T extends BulkPageItem>(
  pages: T[],
  countToInsert: number = 1
): {
  willShiftInteriorPages: boolean;
  willShiftContent: boolean;
  shiftedInteriorCount: number;
  customizedInteriorCount: number;
  affectedPageNumbers: number[];
  message: string;
  warningMessage: string;
} {
  const safeCount = Math.max(1, Math.floor(countToInsert || 1));
  const interiorPages = pages.filter(p => !p.isCover);
  const customizedPages = interiorPages.filter(
    p =>
      (Array.isArray(p.elements) && p.elements.length > 0) ||
      (!p.name.startsWith('Page ') && !p.name.startsWith('Index Page'))
  );
  const customizedInteriorCount = customizedPages.length;
  const willShift = interiorPages.length > 0;
  const firstShiftedTarget = 2 + safeCount;

  const message = willShift
    ? `Inserting ${safeCount} index page${safeCount > 1 ? 's' : ''} after the Front Cover will shift ${
        interiorPages.length
      } existing interior page${interiorPages.length > 1 ? 's' : ''} forward (Page 2 → Page ${firstShiftedTarget})${
        customizedInteriorCount > 0
          ? `, including ${customizedInteriorCount} page${customizedInteriorCount > 1 ? 's' : ''} with custom elements`
          : ''
      }. All existing content is preserved and you can Undo (Ctrl+Z) at any time.`
    : '';

  return {
    willShiftInteriorPages: willShift,
    willShiftContent: customizedInteriorCount > 0,
    shiftedInteriorCount: interiorPages.length,
    customizedInteriorCount,
    affectedPageNumbers: customizedPages.map(p => p.pageNumber),
    message,
    warningMessage: message,
  };
}

/**
 * Resolves optional page references (`linkedPageId`) for a list of IndexEntryLink items against
 * the current book pages.
 * - If `linkedPageId` matches a page in `pages`, resolves its current 1-based `pageNumber` (so moving a page
 *   automatically updates its displayed page number).
 * - If `linkedPageId` is set but cannot be found in `pages` (e.g. target page was deleted), marks `isBrokenLink: true`
 *   and sets `displayPageText: '! UNRESOLVED'` with a descriptive `warningMessage` instead of inventing a page number.
 * - If `linkedPageId` is not set, uses `manualPageText` or leaves `displayPageText: ''` (blank).
 */
export function resolveIndexEntriesPageNumbers(
  entries: IndexEntryLink[] | undefined,
  pages: { id: string; pageNumber?: number; name?: string; isCover?: boolean }[] = [],
  pageShiftOffset: number = 0
): ResolvedIndexEntry[] {
  if (!Array.isArray(entries) || entries.length === 0) return [];

  return entries.map((entry, idx) => {
    const linkedId = typeof entry.linkedPageId === 'string' && entry.linkedPageId.trim().length > 0
      ? entry.linkedPageId.trim()
      : null;

    if (linkedId) {
      const pageIdx = pages.findIndex(p => p.id === linkedId);
      if (pageIdx >= 0) {
        const targetPage = pages[pageIdx];
        const basePageNum = typeof targetPage.pageNumber === 'number' ? targetPage.pageNumber : pageIdx + 1;
        const resolvedNum = targetPage.isCover ? 1 : basePageNum + pageShiftOffset;
        return {
          ...entry,
          slotIndex: idx,
          linkedPageId: linkedId,
          resolvedPageNumber: resolvedNum,
          resolvedPageName: targetPage.name || `Page ${resolvedNum}`,
          displayPageText: String(resolvedNum),
          isLinked: true,
          isBrokenLink: false,
          warningMessage: null,
        };
      }

      // Referenced page cannot be resolved — display explicit warning instead of inventing a page number
      return {
        ...entry,
        slotIndex: idx,
        linkedPageId: linkedId,
        resolvedPageNumber: null,
        resolvedPageName: null,
        displayPageText: '! UNRESOLVED',
        isLinked: true,
        isBrokenLink: true,
        warningMessage: `Entry "${entry.label || `#${idx + 1}`}" references a page (${linkedId}) that was moved or deleted and cannot be resolved.`,
      };
    }

    const manualText = typeof entry.manualPageText === 'string' ? entry.manualPageText.trim() : '';
    return {
      ...entry,
      slotIndex: idx,
      linkedPageId: null,
      resolvedPageNumber: null,
      resolvedPageName: null,
      displayPageText: manualText,
      isLinked: false,
      isBrokenLink: false,
      warningMessage: null,
    };
  });
}

/**
 * Generates linked IndexEntryLink[] items from the existing non-cover, non-index interior pages in the book.
 */
export function autoPopulateEntriesFromInteriorPages<
  T extends { id: string; pageNumber: number; isCover?: boolean; name: string; templateType?: string; elements?: any[] }
>(pages: T[], maxEntries: number = 50): IndexEntryLink[] {
  const interiorTargets = pages.filter(p => !p.isCover && !isIndexTemplateType(p.templateType));
  return interiorTargets.slice(0, Math.max(1, maxEntries)).map((p, idx) => {
    const firstTextEl = Array.isArray(p.elements)
      ? p.elements.find((e: any) => e.type === 'text' && typeof e.text === 'string' && e.text.trim().length > 0)
      : null;
    const customLabel =
      firstTextEl?.text?.trim() ||
      (!p.name.startsWith('Page ') ? p.name : `Section ${idx + 1} — ${p.name}`);
    return {
      id: `idx-entry-${p.id}-${idx + 1}`,
      entryNumber: idx + 1,
      label: customLabel,
      linkedPageId: p.id,
    };
  });
}

/**
 * Shared validation service for the Configurable Index Builder.
 * Validates generated page dimensions, usable rows per page, required page count, boundary containment,
 * and linked page references across the document.
 */
export function validateIndexBuilderConfiguration(params: {
  config: IndexPageConfig;
  pages?: { id: string; pageNumber: number; name?: string; isCover?: boolean; templateType?: string }[];
  trimWidthIn?: number;
  trimHeightIn?: number;
  margins?: { top: number; bottom: number; left: number; right: number };
}): {
  isValid: boolean;
  usableRowsPerPage: number;
  requiredPages: number;
  configuredPages: number;
  totalEntries: number;
  exceedsSinglePage: boolean;
  hasBoundaryOverflow: boolean;
  outOfBoundsElementsCount: number;
  brokenLinksCount: number;
  brokenLinkWarnings: string[];
  boundaryWarnings: string[];
  warnings: string[];
  resolvedEntries: ResolvedIndexEntry[];
} {
  const {
    config,
    pages = [],
    trimWidthIn = 6.0,
    trimHeightIn = 9.0,
    margins = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  } = params;

  const pagination = calculateIndexPagination(config, trimHeightIn, margins);
  const linkedEntriesCount =
    config.indexMode === 'linked' && Array.isArray(config.entries) ? config.entries.length : 0;
  const totalEntries = Math.max(pagination.totalItemsRequested, linkedEntriesCount);
  const usableRowsPerPage = Math.max(1, pagination.maxEntriesPerSinglePage);
  const requiredPages = Math.max(
    pagination.recommendedPages,
    Math.ceil(totalEntries / usableRowsPerPage)
  );
  const configuredPages = Math.max(1, config.pageCount || requiredPages);

  const resolvedEntries = resolveIndexEntriesPageNumbers(config.entries, pages);
  const brokenLinkWarnings = resolvedEntries
    .filter(e => e.isBrokenLink && e.warningMessage)
    .map(e => e.warningMessage as string);

  const boundaryWarnings: string[] = [];
  if (trimWidthIn < 4 || trimHeightIn < 6) {
    boundaryWarnings.push(`Trim size ${trimWidthIn}"×${trimHeightIn}" is smaller than standard minimum 4"×6".`);
  }
  if (configuredPages < requiredPages) {
    boundaryWarnings.push(
      `Selected ${totalEntries} entries require ${requiredPages} pages (${usableRowsPerPage} usable rows/page) to prevent boundary clipping.`
    );
  }

  // Check generated elements on each page slice to verify none exceed 0..100% page bounds
  let hasBoundaryOverflow = false;
  for (let pIdx = 0; pIdx < configuredPages; pIdx++) {
    const sliceCfg = buildPageSliceIndexConfig({
      baseConfig: { ...config, pageCount: configuredPages, totalEntriesRequested: totalEntries },
      pageSequenceIndex: pIdx,
      pageSequenceTotal: configuredPages,
      trimHeightIn,
      margins,
    });
    const elems = buildEditableIndexPageElements({
      config: sliceCfg,
      pageSequenceIndex: pIdx,
      pageSequenceTotal: configuredPages,
      margins,
      trimWidthIn,
      trimHeightIn,
      allBookPages: pages,
    });
    for (const el of elems) {
      if (el.x < 0 || el.y < 0 || el.x + el.width > 100.5 || el.y + el.height > 100.5) {
        hasBoundaryOverflow = true;
        boundaryWarnings.push(`Element ${el.id} exceeds page boundary on Index Page ${pIdx + 1}.`);
      }
    }
  }

  return {
    isValid: brokenLinkWarnings.length === 0 && !hasBoundaryOverflow && configuredPages >= requiredPages,
    usableRowsPerPage,
    requiredPages,
    configuredPages,
    totalEntries,
    exceedsSinglePage: totalEntries > usableRowsPerPage,
    hasBoundaryOverflow,
    outOfBoundsElementsCount: hasBoundaryOverflow ? boundaryWarnings.length : 0,
    brokenLinksCount: brokenLinkWarnings.length,
    brokenLinkWarnings,
    boundaryWarnings,
    warnings: [...brokenLinkWarnings, ...boundaryWarnings],
    resolvedEntries,
  };
}

/**
 * Generates genuinely editable StudioElement[] (title, subtitle/metadata bar, header divider rule,
 * editable column headers, and optional editable/linked row cells) so users can click and edit the index
 * directly on the canvas after insertion.
 * Uses the 432x648 template coordinate space so elements align 1:1 with renderInteriorTemplateSvg.
 *
 * Importantly:
 * - Ordinary blank printable indexes (`indexMode === 'blank'` or no linked `entries`) leave blank fields blank by default.
 * - Linked indexes (`indexMode === 'linked'` or `config.entries` populated) resolve `linkedPageId` against `allBookPages`
 *   and populate the topic & resolved page number (or `! UNRESOLVED` warning if a target page was deleted).
 */
export function buildEditableIndexPageElements(params: {
  config: IndexPageConfig;
  pageSequenceIndex?: number;
  pageSequenceTotal?: number;
  margins?: { top: number; bottom: number; left: number; right: number };
  trimWidthIn?: number;
  trimHeightIn?: number;
  includeSampleRowCells?: boolean;
  includeAllRowCells?: boolean;
  allBookPages?: { id: string; pageNumber?: number; name?: string; isCover?: boolean }[];
  pages?: { id: string; pageNumber?: number; name?: string; isCover?: boolean }[];
  pageShiftOffset?: number;
}): any[] {
  const {
    config,
    pageSequenceIndex = 0,
    pageSequenceTotal = 1,
    margins = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    includeSampleRowCells = false,
    includeAllRowCells = false,
    allBookPages,
    pages,
    pageShiftOffset = 0,
  } = params;
  const effectiveBookPages = allBookPages || pages || [];

  const refW = 432;
  const refH = 648;
  const leftM = Math.max(24, Math.min(72, Math.round((margins?.left ?? 0.5) * 72)));
  const rightM = Math.max(24, Math.min(72, Math.round((margins?.right ?? 0.5) * 72)));
  const topM = Math.max(24, Math.min(68, Math.round((margins?.top ?? 0.5) * 72)));
  const bottomM = Math.max(24, Math.min(68, Math.round((margins?.bottom ?? 0.5) * 72)));

  const contentW = refW - leftM - rightM;
  const rightEdgeX = refW - rightM;
  const bottomLimitY = refH - bottomM - 28;
  const tableHeaderY = topM + 42;
  const tableRowsStartY = topM + 58;
  const notesReservePt = config.showNotesField ? 42 : 0;
  const availTableH = Math.max(140, bottomLimitY - tableRowsStartY - notesReservePt);

  const toXPct = (pt: number) => Number(((pt / refW) * 100).toFixed(2));
  const toYPct = (pt: number) => Number(((pt / refH) * 100).toFixed(2));

  const elements: any[] = [];
  const uidPrefix = `idx-el-p${pageSequenceIndex + 1}`;
  const t = config.templateId || 'index_classic';
  const fontPt = Math.max(6.5, Math.min(13, config.fontSizePt || 8.5));
  const showPgCol = config.showPageNumberCol !== false && config.showPageNumbersColumn !== false;
  const showDate = config.showDateField !== false && config.showDateColumn !== false;
  const showStatus = config.showStatusField !== false && config.showStatusColumn !== false;
  const showCat = config.showCategoryField !== false && config.showCategoryColumn !== false;

  const isCenteredTitle =
    t === 'index_classic' ||
    t === 'index_numbered' ||
    t === 'index_alphabetical' ||
    t === 'index_categorical' ||
    t === 'index_monthly' ||
    t === 'index_glossary';

  const displayTitle =
    pageSequenceTotal > 1
      ? `${config.title} (${pageSequenceIndex + 1}/${pageSequenceTotal})`
      : config.title;

  // 1. Editable Index Title Element (topM .. topM + 16pt)
  elements.push({
    id: `${uidPrefix}-title`,
    type: 'text',
    x: toXPct(leftM),
    y: toYPct(topM),
    width: toXPct(contentW),
    height: toYPct(16),
    text: displayTitle,
    fontSize: Number((fontPt + 2.8).toFixed(1)),
    fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
    fontWeight: 'bold',
    fill: '#0F172A',
    textAlign: isCenteredTitle ? 'center' : 'left',
    letterSpacing: 1.4,
    opacity: 1,
    locked: false,
  });

  // 2. Editable Subtitle / Legend / Course Info Element (topM + 18pt .. topM + 31pt)
  if (config.subtitle && config.subtitle.trim().length > 0) {
    const hasBoxedLegend =
      t === 'index_bullet' || t === 'index_recipe' || t === 'index_study';
    const isRightAlignedSub =
      t === 'index_project' ||
      t === 'index_monthly' ||
      t === 'index_reading' ||
      t === 'index_collection';

    elements.push({
      id: `${uidPrefix}-subtitle`,
      type: 'text',
      x: toXPct(hasBoxedLegend ? leftM + 6 : leftM),
      y: toYPct(topM + 18.5),
      width: toXPct(hasBoxedLegend ? contentW - 12 : contentW),
      height: toYPct(13),
      text: config.subtitle,
      fontSize: Math.max(6.5, Number((fontPt - 1.3).toFixed(1))),
      fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
      fontWeight: hasBoxedLegend ? 'bold' : 'normal',
      fill: '#334155',
      textAlign: isRightAlignedSub ? 'right' : isCenteredTitle ? 'center' : 'left',
      letterSpacing: 0,
      opacity: 1,
      locked: false,
    });
  }

  // 3. Editable Header Rule Shape for non-boxed header templates
  if (
    t === 'index_classic' ||
    t === 'index_numbered' ||
    t === 'index_alphabetical' ||
    t === 'index_categorical' ||
    t === 'index_monthly'
  ) {
    elements.push({
      id: `${uidPrefix}-header-rule`,
      type: 'shape',
      shapeType: 'line',
      x: toXPct(leftM),
      y: toYPct(topM + 30),
      width: toXPct(contentW),
      height: toYPct(2),
      fill: 'none',
      stroke: '#1E293B',
      strokeWidth: 1.1,
      opacity: 1,
      locked: false,
    });
  }

  // 4. Editable Column Header Labels aligned with each template's exact column dividers
  const colLabels = config.columnLabels || [];
  const addColHdr = (
    idx: number,
    text: string,
    xPt: number,
    wPt: number,
    align: 'left' | 'center' | 'right' = 'left',
    yPt: number = tableHeaderY - 8
  ) => {
    if (!text) return;
    elements.push({
      id: `${uidPrefix}-colhdr-${idx}`,
      type: 'text',
      x: toXPct(xPt),
      y: toYPct(yPt),
      width: toXPct(Math.max(16, wPt)),
      height: toYPct(13),
      text,
      fontSize: Math.max(6.2, Number((fontPt - 1.3).toFixed(1))),
      fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
      fontWeight: 'bold',
      fill: '#0F172A',
      textAlign: align,
      letterSpacing: 0,
      opacity: 1,
      locked: false,
    });
  };

  if (t === 'index_classic' || t === 'index') {
    const pageBoxW = showPgCol ? 44 : 0;
    const dateColW = config.showDateField ? 54 : 0;
    const catColW = config.showCategoryField ? 64 : 0;
    const rightStop = rightEdgeX - pageBoxW - (showPgCol ? 6 : 0);
    const dateStartX = rightStop - dateColW;
    const catStartX = dateStartX - catColW;

    addColHdr(0, colLabels[0] || '#', leftM + 2, 24, 'left');
    addColHdr(1, colLabels[1] || 'SECTION / TOPIC TITLE', leftM + 30, Math.max(80, catStartX - (leftM + 32)), 'left');
    if (config.showCategoryField) {
      addColHdr(2, 'CATEGORY', catStartX + 4, catColW - 6, 'left');
    }
    if (config.showDateField) {
      addColHdr(3, 'DATE', dateStartX + 4, dateColW - 6, 'left');
    }
    if (showPgCol) {
      addColHdr(colLabels.length - 1, colLabels[colLabels.length - 1] || 'PAGE #', rightEdgeX - pageBoxW, pageBoxW - 2, 'right');
    }
  } else if (t === 'index_bullet') {
    const keyDividerX = leftM + Math.round(contentW * 0.14);
    const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.16) : rightEdgeX;
    const dateDividerX = showDate ? pageDividerX - Math.round(contentW * 0.18) : pageDividerX;
    addColHdr(0, colLabels[0] || 'KEY', leftM + 5, keyDividerX - leftM - 8, 'left');
    addColHdr(1, colLabels[1] || 'COLLECTION / TOPIC', keyDividerX + 6, dateDividerX - keyDividerX - 10, 'left');
    if (showDate) {
      addColHdr(2, colLabels[2] || 'DATE', dateDividerX + 5, pageDividerX - dateDividerX - 8, 'left');
    }
    if (showPgCol) {
      addColHdr(3, colLabels[3] || colLabels[colLabels.length - 1] || 'PAGES', pageDividerX + 5, rightEdgeX - pageDividerX - 8, 'left');
    }
  } else if (t === 'index_numbered') {
    const totalOnPage = Math.max(1, config.entriesPerPage || 50);
    const cols = Math.max(1, Math.min(3, config.columnsCount || (totalOnPage > 25 ? 2 : 1)));
    const colGap = 12;
    const singleColW = (contentW - colGap * (cols - 1)) / cols;
    for (let col = 0; col < cols; col++) {
      const colX = leftM + col * (singleColW + colGap);
      addColHdr(
        col * 2,
        `${colLabels[0] || 'NO.'}   ${colLabels[1] || 'ENTRY / SUBJECT'}`,
        colX + 2,
        singleColW - (showPgCol ? 28 : 4),
        'left'
      );
      if (showPgCol) {
        addColHdr(col * 2 + 1, colLabels[2] || 'PG', colX + singleColW - 24, 22, 'right');
      }
    }
  } else if (t === 'index_categorical') {
    const catCount = Math.max(2, Math.min(6, config.entriesPerPage || 4));
    const cols = 2;
    const rows = Math.ceil(catCount / cols);
    const gapX = 10;
    const gapY = 10;
    const gridTopY = topM + 36;
    const gridAvailH = Math.max(200, bottomLimitY - gridTopY - notesReservePt);
    const bw = (contentW - gapX) / cols;
    const bh = (gridAvailH - gapY * (rows - 1)) / rows;
    for (let idx = 0; idx < catCount; idx++) {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const bx = leftM + c * (bw + gapX);
      const by = gridTopY + r * (bh + gapY);
      const catTitle = colLabels[idx] || `CATEGORY ${idx + 1}`;
      addColHdr(idx, catTitle, bx + 6, bw - (showPgCol ? 32 : 12), 'left', by + 4);
    }
  } else if (t === 'index_project') {
    const dateDividerX = showDate ? leftM + Math.round(contentW * 0.17) : leftM;
    const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.14) : rightEdgeX;
    const statusDividerX = showStatus ? pageDividerX - Math.round(contentW * 0.14) : pageDividerX;
    const catDividerX = config.showCategoryField ? statusDividerX - Math.round(contentW * 0.18) : statusDividerX;
    if (showDate) addColHdr(0, colLabels[0] || 'DATE', leftM + 5, dateDividerX - leftM - 8, 'left');
    addColHdr(1, colLabels[1] || 'PROJECT / DOCUMENT TITLE', dateDividerX + 6, catDividerX - dateDividerX - 10, 'left');
    if (config.showCategoryField) {
      addColHdr(4, 'CATEGORY', catDividerX + 5, statusDividerX - catDividerX - 8, 'left');
    }
    if (showStatus) addColHdr(2, colLabels[2] || 'DONE', statusDividerX + 4, pageDividerX - statusDividerX - 6, 'center');
    if (showPgCol) addColHdr(3, colLabels[3] || 'PAGE #', pageDividerX + 4, rightEdgeX - pageDividerX - 6, 'center');
  } else if (t === 'index_glossary') {
    const termDividerX = leftM + Math.round(contentW * 0.28);
    const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
    const catDividerX = showCat ? pageDividerX - Math.round(contentW * 0.17) : pageDividerX;
    addColHdr(0, colLabels[0] || 'TERM / CONCEPT', leftM + 5, termDividerX - leftM - 8, 'left');
    addColHdr(1, colLabels[2] || colLabels[1] || 'DEFINITION / USAGE', termDividerX + 6, catDividerX - termDividerX - 10, 'left');
    if (showCat) addColHdr(2, colLabels[1] || 'CATEGORY', catDividerX + 5, pageDividerX - catDividerX - 8, 'left');
    if (showPgCol) addColHdr(3, colLabels[3] || 'PG', pageDividerX + 4, rightEdgeX - pageDividerX - 6, 'center');
  } else if (t === 'index_reading') {
    const numDividerX = leftM + 24;
    const authorDividerX = leftM + Math.round(contentW * 0.44);
    const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
    const ratingDividerX = showStatus ? pageDividerX - Math.round(contentW * 0.19) : pageDividerX;
    addColHdr(0, colLabels[0] || '#', leftM + 4, 18, 'left');
    addColHdr(1, colLabels[1] || 'BOOK TITLE', numDividerX + 5, authorDividerX - numDividerX - 8, 'left');
    addColHdr(2, colLabels[2] || 'AUTHOR', authorDividerX + 5, ratingDividerX - authorDividerX - 8, 'left');
    if (showStatus) addColHdr(3, colLabels[3] || 'RATING ★', ratingDividerX + 4, pageDividerX - ratingDividerX - 6, 'center');
    if (showPgCol) addColHdr(4, colLabels[4] || 'PAGE #', pageDividerX + 4, rightEdgeX - pageDividerX - 6, 'center');
  } else if (t === 'index_recipe') {
    const catDividerX = showCat ? leftM + Math.round(contentW * 0.44) : leftM + Math.round(contentW * 0.62);
    const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
    const favDividerX = showStatus ? pageDividerX - Math.round(contentW * 0.11) : pageDividerX;
    const timeDividerX = config.showNotesField !== false ? favDividerX - Math.round(contentW * 0.15) : favDividerX;
    addColHdr(0, colLabels[0] || 'RECIPE TITLE', leftM + 5, catDividerX - leftM - 8, 'left');
    if (showCat) addColHdr(1, colLabels[1] || 'COURSE', catDividerX + 5, timeDividerX - catDividerX - 8, 'left');
    if (config.showNotesField !== false) {
      addColHdr(2, colLabels[2] || 'PREP TIME', timeDividerX + 4, favDividerX - timeDividerX - 6, 'center');
    }
    if (showStatus) addColHdr(3, colLabels[3] || 'FAV ★', favDividerX + 2, pageDividerX - favDividerX - 4, 'center');
    if (showPgCol) addColHdr(4, colLabels[4] || 'PAGE #', pageDividerX + 4, rightEdgeX - pageDividerX - 6, 'center');
  } else if (t === 'index_study') {
    const moduleDividerX = showCat ? leftM + Math.round(contentW * 0.42) : leftM + Math.round(contentW * 0.62);
    const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
    const reviewDividerX = showStatus ? pageDividerX - Math.round(contentW * 0.21) : pageDividerX;
    addColHdr(0, colLabels[0] || 'MODULE / TOPIC', leftM + 5, moduleDividerX - leftM - 8, 'left');
    if (showCat) addColHdr(1, colLabels[1] || 'SOURCE / CITATION', moduleDividerX + 5, reviewDividerX - moduleDividerX - 8, 'left');
    if (showStatus) addColHdr(2, colLabels[2] || 'MASTERY', reviewDividerX + 4, pageDividerX - reviewDividerX - 6, 'center');
    if (showPgCol) addColHdr(3, colLabels[3] || 'PAGE #', pageDividerX + 4, rightEdgeX - pageDividerX - 6, 'center');
  } else if (t === 'index_collection') {
    const idDividerX = leftM + Math.round(contentW * 0.14);
    const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
    const condDividerX = showStatus ? pageDividerX - Math.round(contentW * 0.16) : pageDividerX;
    const locDividerX = showCat ? condDividerX - Math.round(contentW * 0.18) : condDividerX;
    addColHdr(0, colLabels[0] || 'ID / SKU', leftM + 4, idDividerX - leftM - 6, 'left');
    addColHdr(1, colLabels[1] || 'ITEM / SPECIMEN NAME', idDividerX + 5, locDividerX - idDividerX - 8, 'left');
    if (showCat) addColHdr(2, colLabels[2] || 'LOCATION / CAT', locDividerX + 4, condDividerX - locDividerX - 6, 'left');
    if (showStatus) addColHdr(3, colLabels[3] || 'COND / QTY', condDividerX + 4, pageDividerX - condDividerX - 6, 'center');
    if (showPgCol) addColHdr(4, colLabels[4] || 'PAGE #', pageDividerX + 4, rightEdgeX - pageDividerX - 6, 'center');
  }

  // 5. Editable Entry Row / Box Cells & Optional Page Linking
  const maxRowCap =
    config.lineSpacing === 'compact' ? 18.5 : config.lineSpacing === 'relaxed' ? 28 : 23.5;

  const hasLinkedEntries =
    config.indexMode === 'linked' || (Array.isArray(config.entries) && config.entries.length > 0);
  const allResolvedEntries = hasLinkedEntries
    ? resolveIndexEntriesPageNumbers(config.entries, effectiveBookPages, pageShiftOffset)
    : [];

  const startNum = config.startEntryNumber ?? 1;

  if (
    (includeAllRowCells || hasLinkedEntries) &&
    (t === 'index_alphabetical' || t === 'index_categorical' || t === 'index_monthly')
  ) {
    const boxCount =
      t === 'index_categorical'
        ? Math.max(2, Math.min(6, config.entriesPerPage || 4))
        : t === 'index_monthly'
        ? 12
        : 9;
    const cols = t === 'index_categorical' ? 2 : 3;
    const rows = Math.ceil(boxCount / cols);
    const gapX = t === 'index_categorical' ? 10 : 7;
    const gapY = t === 'index_categorical' ? 10 : 7;
    const gridTopY = topM + 36;
    const gridAvailH = Math.max(200, bottomLimitY - gridTopY - notesReservePt);
    const bw = (contentW - (cols - 1) * gapX) / cols;
    const bh = (gridAvailH - (rows - 1) * gapY) / rows;
    const sliceOffset = pageSequenceIndex * boxCount;

    for (let b = 0; b < boxCount; b++) {
      const entryForBox = allResolvedEntries[sliceOffset + b];
      if (!includeAllRowCells && !entryForBox) continue;

      const c = b % cols;
      const r = Math.floor(b / cols);
      const bx = leftM + c * (bw + gapX);
      const by = gridTopY + r * (bh + gapY);
      elements.push({
        id: `${uidPrefix}-row-topic-${b}`,
        type: 'text',
        x: toXPct(bx + 5),
        y: toYPct(by + 20),
        width: toXPct(bw - (showPgCol ? 28 : 10)),
        height: toYPct(13),
        text: entryForBox ? entryForBox.label : '',
        fontSize: Math.max(7, fontPt - 0.5),
        fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
        fontWeight: 'normal',
        fill: '#1E293B',
        textAlign: 'left',
        letterSpacing: 0,
        opacity: 1,
        locked: false,
      });
      if (showPgCol && entryForBox && (entryForBox.displayPageText || entryForBox.isBrokenLink)) {
        elements.push({
          id: `${uidPrefix}-row-pg-${b}`,
          type: 'text',
          x: toXPct(bx + bw - 26),
          y: toYPct(by + 20),
          width: toXPct(22),
          height: toYPct(13),
          text: entryForBox.isBrokenLink ? '!?' : entryForBox.displayPageText,
          fontSize: Math.max(6.5, fontPt - 1),
          fontFamily: 'Courier New, monospace',
          fontWeight: 'bold',
          fill: entryForBox.isBrokenLink ? '#DC2626' : '#0F172A',
          textAlign: 'center',
          letterSpacing: 0,
          opacity: 1,
          locked: false,
        });
      }
    }
  } else if ((includeAllRowCells || hasLinkedEntries) && t === 'index_numbered') {
    const totalItems = Math.max(1, Math.min(100, config.entriesPerPage || 50));
    const cols = Math.max(1, Math.min(3, config.columnsCount || (totalItems > 25 ? 2 : 1)));
    const rowsPerCol = Math.ceil(totalItems / cols);
    const rowStep = Math.min(22, availTableH / Math.max(1, rowsPerCol));
    const colGap = 12;
    const singleColW = (contentW - colGap * (cols - 1)) / cols;
    const sliceOffset = Math.max(0, startNum - 1);

    for (let i = 0; i < totalItems; i++) {
      const entryForRow = allResolvedEntries[sliceOffset + i];
      if (!includeAllRowCells && !entryForRow) continue;

      const col = Math.floor(i / rowsPerCol);
      const r = i % rowsPerCol;
      const colX = leftM + col * (singleColW + colGap);
      const ry = tableRowsStartY + r * rowStep + 1;
      if (ry + rowStep > bottomLimitY - notesReservePt + 2) continue;

      elements.push({
        id: `${uidPrefix}-row-topic-${i}`,
        type: 'text',
        x: toXPct(colX + 22),
        y: toYPct(ry),
        width: toXPct(singleColW - (showPgCol ? 48 : 24)),
        height: toYPct(Math.max(10, rowStep - 2)),
        text: entryForRow ? entryForRow.label : '',
        fontSize: Math.max(6.5, fontPt - 0.5),
        fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
        fontWeight: 'normal',
        fill: '#1E293B',
        textAlign: 'left',
        letterSpacing: 0,
        opacity: 1,
        locked: false,
      });
      if (showPgCol && (includeAllRowCells || entryForRow)) {
        elements.push({
          id: `${uidPrefix}-row-pg-${i}`,
          type: 'text',
          x: toXPct(colX + singleColW - 24),
          y: toYPct(ry),
          width: toXPct(22),
          height: toYPct(Math.max(10, rowStep - 2)),
          text: entryForRow
            ? entryForRow.isBrokenLink
              ? '!?'
              : entryForRow.displayPageText
            : '',
          fontSize: Math.max(6.5, fontPt - 0.8),
          fontFamily: 'Courier New, monospace',
          fontWeight: 'bold',
          fill: entryForRow?.isBrokenLink ? '#DC2626' : '#0F172A',
          textAlign: 'center',
          letterSpacing: 0,
          opacity: 1,
          locked: false,
        });
      }
    }
  } else if (
    (includeSampleRowCells || includeAllRowCells || hasLinkedEntries) &&
    t !== 'index_alphabetical' &&
    t !== 'index_categorical' &&
    t !== 'index_monthly' &&
    t !== 'index_numbered'
  ) {
    const totalRowsOnPage = Math.max(5, Math.min(32, config.entriesPerPage || 18));
    const sliceOffset = Math.max(0, startNum - 1);
    const pageSliceEntries = allResolvedEntries.slice(sliceOffset, sliceOffset + totalRowsOnPage);
    const rowsToCreate = includeAllRowCells
      ? totalRowsOnPage
      : hasLinkedEntries
      ? Math.min(totalRowsOnPage, Math.max(pageSliceEntries.length, 0))
      : Math.min(2, totalRowsOnPage);
    const rowStepPt = Math.min(maxRowCap, availTableH / totalRowsOnPage);

    let topicX = leftM + 30;
    let topicW = contentW - (showPgCol ? 78 : 34);
    let pageX = rightEdgeX - 42;
    let pageW = 38;

    if (t === 'index_bullet') {
      const keyDividerX = leftM + Math.round(contentW * 0.14);
      const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.16) : rightEdgeX;
      const dateDividerX = showDate ? pageDividerX - Math.round(contentW * 0.18) : pageDividerX;
      topicX = keyDividerX + 6;
      topicW = dateDividerX - keyDividerX - 10;
      pageX = pageDividerX + 4;
      pageW = rightEdgeX - pageDividerX - 8;
    } else if (t === 'index_project') {
      const dateDividerX = showDate ? leftM + Math.round(contentW * 0.17) : leftM;
      const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.14) : rightEdgeX;
      const statusDividerX = showStatus ? pageDividerX - Math.round(contentW * 0.14) : pageDividerX;
      topicX = dateDividerX + 6;
      topicW = statusDividerX - dateDividerX - 10;
      pageX = pageDividerX + 4;
      pageW = rightEdgeX - pageDividerX - 8;
    } else if (t === 'index_glossary') {
      const termDividerX = leftM + Math.round(contentW * 0.28);
      const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
      topicX = leftM + 5;
      topicW = termDividerX - leftM - 8;
      pageX = pageDividerX + 4;
      pageW = rightEdgeX - pageDividerX - 8;
    } else if (t === 'index_reading') {
      const numDividerX = leftM + 24;
      const authorDividerX = leftM + Math.round(contentW * 0.44);
      const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
      topicX = numDividerX + 5;
      topicW = authorDividerX - numDividerX - 8;
      pageX = pageDividerX + 4;
      pageW = rightEdgeX - pageDividerX - 8;
    } else if (t === 'index_recipe') {
      const catDividerX = showCat ? leftM + Math.round(contentW * 0.44) : leftM + Math.round(contentW * 0.62);
      const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
      topicX = leftM + 5;
      topicW = catDividerX - leftM - 8;
      pageX = pageDividerX + 4;
      pageW = rightEdgeX - pageDividerX - 8;
    } else if (t === 'index_study') {
      const moduleDividerX = showCat ? leftM + Math.round(contentW * 0.42) : leftM + Math.round(contentW * 0.62);
      const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
      topicX = leftM + 5;
      topicW = moduleDividerX - leftM - 8;
      pageX = pageDividerX + 4;
      pageW = rightEdgeX - pageDividerX - 8;
    } else if (t === 'index_collection') {
      const idDividerX = leftM + Math.round(contentW * 0.14);
      const pageDividerX = showPgCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
      const condDividerX = showStatus ? pageDividerX - Math.round(contentW * 0.16) : pageDividerX;
      const locDividerX = showCat ? condDividerX - Math.round(contentW * 0.18) : condDividerX;
      topicX = idDividerX + 5;
      topicW = locDividerX - idDividerX - 8;
      pageX = pageDividerX + 4;
      pageW = rightEdgeX - pageDividerX - 8;
    }

    for (let r = 0; r < rowsToCreate; r++) {
      const rowYPt = tableRowsStartY + r * rowStepPt + 2;
      if (rowYPt + rowStepPt - 2 > bottomLimitY - notesReservePt + 4) break;

      const entryForRow = pageSliceEntries[r];
      const topicText = entryForRow
        ? entryForRow.label
        : includeSampleRowCells && r === 0
        ? `Section ${startNum}: Introduction`
        : '';
      const pageText = entryForRow
        ? entryForRow.displayPageText
        : '';

      elements.push({
        id: `${uidPrefix}-row-topic-${r}`,
        type: 'text',
        x: toXPct(topicX),
        y: toYPct(rowYPt),
        width: toXPct(Math.max(40, topicW)),
        height: toYPct(Math.max(11, rowStepPt - 4)),
        text: topicText,
        fontSize: Math.max(7, fontPt - 0.5),
        fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
        fontWeight: 'normal',
        fill: '#1E293B',
        textAlign: 'left',
        letterSpacing: 0,
        opacity: 1,
        locked: false,
      });
      if (showPgCol) {
        elements.push({
          id: `${uidPrefix}-row-pg-${r}`,
          type: 'text',
          x: toXPct(pageX),
          y: toYPct(rowYPt),
          width: toXPct(Math.max(20, pageW)),
          height: toYPct(Math.max(11, rowStepPt - 4)),
          text: pageText,
          fontSize: entryForRow?.isBrokenLink ? Math.max(6, fontPt - 1.8) : Math.max(7, fontPt - 0.5),
          fontFamily: 'Courier New, monospace',
          fontWeight: 'bold',
          fill: entryForRow?.isBrokenLink ? '#DC2626' : '#0F172A',
          textAlign: 'center',
          letterSpacing: 0,
          opacity: 1,
          locked: false,
        });
      }
    }
  }

  return elements;
}

/**
 * Synchronizes all linked Index Pages across a book's pages array whenever pages are inserted,
 * reordered, or deleted. Re-resolves `linkedPageId` references against the updated page positions
 * and updates the displayed page numbers (or `! UNRESOLVED` warnings if a referenced page was deleted).
 */
export function syncLinkedIndexPagesInBook<
  T extends BulkPageItem & { indexConfig?: IndexPageConfig }
>(
  pages: T[],
  margins: { top: number; bottom: number; left: number; right: number } = {
    top: 0.5,
    bottom: 0.5,
    left: 0.5,
    right: 0.5,
  },
  trimWidthIn: number = 6.0,
  trimHeightIn: number = 9.0
): T[] {
  const reindexed = pages.map((p, idx) => ({
    ...p,
    pageNumber: idx + 1,
    isEven: (idx + 1) % 2 === 0,
    name: p.isCover
      ? 'Cover Spread'
      : p.name.startsWith('Index Page')
      ? p.name
      : p.name.startsWith('Page ')
      ? `Page ${idx + 1}`
      : p.name,
  }));

  return reindexed.map(p => {
    if (p.isCover || !isIndexTemplateType(p.templateType) || !p.indexConfig) {
      return p;
    }
    const cfg = p.indexConfig;
    const hasLinks =
      cfg.indexMode === 'linked' || (Array.isArray(cfg.entries) && cfg.entries.length > 0);
    if (!hasLinks) {
      return p;
    }

    const seqIdx = cfg.pageSequenceIndex ?? 0;
    const seqTotal = cfg.pageSequenceTotal ?? cfg.pageCount ?? 1;
    const nonAutoElements = (p.elements || []).filter(
      (el: any) => typeof el?.id !== 'string' || !el.id.startsWith('idx-el-')
    );
    const updatedAutoElements = buildEditableIndexPageElements({
      config: cfg,
      pageSequenceIndex: seqIdx,
      pageSequenceTotal: seqTotal,
      margins,
      trimWidthIn,
      trimHeightIn,
      allBookPages: reindexed,
    });

    return {
      ...p,
      elements: [...updatedAutoElements, ...nonAutoElements],
    };
  });
}

/**
 * Inserts one or more Index Pages immediately after the Front Cover (Page 1, index 0)
 * using the chosen Index Template style and configuration, and re-indexes all subsequent page numbers cleanly.
 * Automatically calculates required pages when `count` is not forced, and synchronizes any linked page references
 * to their post-insertion page numbers.
 */
export function insertIndexPagesAfterFrontCover<
  T extends BulkPageItem & { indexConfig?: IndexPageConfig }
>(params: {
  pages: T[];
  indexStyle?: IndexTemplateStyle | string;
  count?: number;
  backgroundColor?: string;
  indexConfig?: Partial<IndexPageConfig>;
  margins?: { top: number; bottom: number; left: number; right: number };
  trimWidthIn?: number;
  trimHeightIn?: number;
  populateEditableElements?: boolean;
  createPageId?: (index: number) => string;
}): T[] {
  const {
    pages,
    indexStyle,
    count,
    backgroundColor,
    indexConfig: customConfig,
    margins,
    trimWidthIn = 6.0,
    trimHeightIn = 9.0,
    populateEditableElements = true,
    createPageId,
  } = params;

  const resolvedStyle: IndexTemplateStyle =
    indexStyle && indexStyle !== 'index' && isIndexTemplateType(indexStyle)
      ? (indexStyle as IndexTemplateStyle)
      : (customConfig?.templateId as IndexTemplateStyle) || 'index_classic';

  const baseConfig: IndexPageConfig = {
    ...getDefaultIndexConfig(resolvedStyle),
    ...(customConfig || {}),
    templateId: resolvedStyle,
  };

  // If linked entries exceed totalEntriesRequested, ensure pagination accounts for all linked entries
  if (Array.isArray(baseConfig.entries) && baseConfig.entries.length > baseConfig.totalEntriesRequested) {
    baseConfig.totalEntriesRequested = baseConfig.entries.length;
  }

  const pagination = calculateIndexPagination(baseConfig, trimHeightIn, margins);
  const requestedCount =
    typeof count === 'number'
      ? count
      : typeof customConfig?.pageCount === 'number'
      ? customConfig.pageCount
      : pagination.recommendedPages;
  const safeCount = Math.max(1, Math.min(20, Math.floor(requestedCount || 1)));

  const coverIdx = pages.findIndex(p => p.isCover);
  const insertAfterIdx = coverIdx >= 0 ? coverIdx : 0;

  const sampleInterior =
    pages.find(p => !p.isCover && !isIndexTemplateType(p.templateType)) ||
    pages.find(p => !p.isCover);
  const resolvedBg = backgroundColor || sampleInterior?.backgroundColor || '#FFFFFF';

  const existingIndexCount = pages.filter(
    p => !p.isCover && isIndexTemplateType(p.templateType)
  ).length;

  const newIndexPages: T[] = Array.from({ length: safeCount }, (_, i) => {
    const id = createPageId
      ? createPageId(i)
      : `index-page-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
    const idxNumber = existingIndexCount + i + 1;

    const pageIndexConfig = buildPageSliceIndexConfig({
      baseConfig,
      pageSequenceIndex: i,
      pageSequenceTotal: safeCount,
      trimHeightIn,
      margins,
      populateEditableElements,
    });

    const generatedElements = populateEditableElements
      ? buildEditableIndexPageElements({
          config: pageIndexConfig,
          pageSequenceIndex: i,
          pageSequenceTotal: safeCount,
          margins,
          trimWidthIn,
          trimHeightIn,
          allBookPages: pages,
          pageShiftOffset: safeCount,
        })
      : [];

    return {
      ...(sampleInterior ? { ...sampleInterior } : {}),
      id,
      pageNumber: insertAfterIdx + 2 + i,
      isCover: false,
      isEven: (insertAfterIdx + 2 + i) % 2 === 0,
      name: `Index Page ${idxNumber}`,
      backgroundColor: resolvedBg,
      templateType: resolvedStyle,
      showPageNumber: sampleInterior?.showPageNumber ?? true,
      indexConfig: pageIndexConfig,
      elements: generatedElements,
    } as unknown as T;
  });

  const combined = [...pages];
  combined.splice(insertAfterIdx + 1, 0, ...newIndexPages);

  const reindexed = combined.map((p, idx) => ({
    ...p,
    pageNumber: idx + 1,
    isEven: (idx + 1) % 2 === 0,
    name: p.isCover
      ? 'Cover Spread'
      : p.name.startsWith('Index Page')
      ? p.name
      : p.name.startsWith('Page ')
      ? `Page ${idx + 1}`
      : p.name,
  }));

  if (reindexed.some(p => p.indexConfig?.entries && p.indexConfig.entries.length > 0)) {
    return syncLinkedIndexPagesInBook(reindexed, margins, trimWidthIn, trimHeightIn);
  }
  return reindexed;
}

/**
 * Updates the Index template style and configuration on existing Index pages (or on a targeted interior page).
 * If no Index pages exist yet when called from the cover, inserts a new Index page right after the Front Cover.
 */
export function updateIndexPagesStyle<
  T extends BulkPageItem & { indexConfig?: IndexPageConfig }
>(params: {
  pages: T[];
  newStyle: IndexTemplateStyle | string;
  customConfig?: Partial<IndexPageConfig>;
  activePageIndex?: number;
  margins?: { top: number; bottom: number; left: number; right: number };
  trimWidthIn?: number;
  trimHeightIn?: number;
  populateEditableElements?: boolean;
  createPageId?: (index: number) => string;
}): { pages: T[]; targetPageIndex: number } {
  const {
    pages,
    newStyle,
    customConfig,
    activePageIndex = 0,
    margins,
    trimWidthIn = 6.0,
    trimHeightIn = 9.0,
    populateEditableElements = true,
    createPageId,
  } = params;
  const resolvedStyle: IndexTemplateStyle =
    newStyle && newStyle !== 'index' && isIndexTemplateType(newStyle)
      ? (newStyle as IndexTemplateStyle)
      : 'index_classic';

  const mergedConfig: IndexPageConfig = {
    ...getDefaultIndexConfig(resolvedStyle),
    ...(customConfig || {}),
    templateId: resolvedStyle,
  };

  const buildUpdatedPage = (p: T, seqIdx: number, seqTotal: number): T => {
    const pageCfg = buildPageSliceIndexConfig({
      baseConfig: mergedConfig,
      pageSequenceIndex: seqIdx,
      pageSequenceTotal: seqTotal,
      trimHeightIn,
      margins,
      populateEditableElements,
    });
    // Preserve any user-created non-index elements (e.g. uploaded logos/images) while refreshing index header elements
    const nonAutoElements = (p.elements || []).filter(
      (el: any) => typeof el?.id !== 'string' || !el.id.startsWith('idx-el-')
    );
    const autoElements = populateEditableElements
      ? buildEditableIndexPageElements({
          config: pageCfg,
          pageSequenceIndex: seqIdx,
          pageSequenceTotal: seqTotal,
          margins,
          trimWidthIn,
          trimHeightIn,
          allBookPages: pages,
        })
      : [];
    return {
      ...p,
      templateType: resolvedStyle,
      indexConfig: pageCfg,
      elements: [...autoElements, ...nonAutoElements],
    };
  };

  const activePage = pages[activePageIndex];
  if (activePage && !activePage.isCover && isIndexTemplateType(activePage.templateType)) {
    const totalIdxPages = pages.filter(p => !p.isCover && isIndexTemplateType(p.templateType)).length;
    let seenIdx = 0;
    const updated = pages.map((p, idx) => {
      if (!p.isCover && isIndexTemplateType(p.templateType)) {
        const res = buildUpdatedPage(p, seenIdx, totalIdxPages);
        seenIdx++;
        return res;
      }
      if (idx === activePageIndex) {
        return buildUpdatedPage(p, 0, 1);
      }
      return p;
    });
    return { pages: updated, targetPageIndex: activePageIndex };
  }

  const firstExistingIndexPageIdx = pages.findIndex(
    p => !p.isCover && isIndexTemplateType(p.templateType)
  );
  if (firstExistingIndexPageIdx >= 0) {
    const totalIdxPages = pages.filter(p => !p.isCover && isIndexTemplateType(p.templateType)).length;
    let seenIdx = 0;
    const updated = pages.map(p => {
      if (!p.isCover && isIndexTemplateType(p.templateType)) {
        const res = buildUpdatedPage(p, seenIdx, totalIdxPages);
        seenIdx++;
        return res;
      }
      return p;
    });
    return { pages: updated, targetPageIndex: firstExistingIndexPageIdx };
  }

  const inserted = insertIndexPagesAfterFrontCover({
    pages,
    indexStyle: resolvedStyle,
    indexConfig: mergedConfig,
    count: mergedConfig.pageCount || 1,
    margins,
    trimWidthIn,
    trimHeightIn,
    populateEditableElements,
    createPageId,
  });
  const coverIdx = inserted.findIndex(p => p.isCover);
  return { pages: inserted, targetPageIndex: coverIdx >= 0 ? coverIdx + 1 : 1 };
}

// ============================================================================
// CANVAS PANNING, TOUCHSCREEN PINCH-ZOOM & SMART PEN INTERACTION HELPERS
// ============================================================================

export type CanvasInteractionMode = 'select' | 'pan';

export interface CanvasPanOffset {
  x: number;
  y: number;
}

/**
 * Calculates updated canvas pan coordinates during mouse left-click drag,
 * touchscreen 1-finger drag, or smart-pen drag.
 */
export function calculateCanvasPanDelta(params: {
  initialPan: CanvasPanOffset;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
  maxPanBoundPx?: number;
}): CanvasPanOffset {
  const {
    initialPan,
    startClientX,
    startClientY,
    currentClientX,
    currentClientY,
    maxPanBoundPx = 2400,
  } = params;
  const dx = currentClientX - startClientX;
  const dy = currentClientY - startClientY;
  const rawX = initialPan.x + dx;
  const rawY = initialPan.y + dy;
  const clampedX = Math.max(-maxPanBoundPx, Math.min(maxPanBoundPx, rawX));
  const clampedY = Math.max(-maxPanBoundPx, Math.min(maxPanBoundPx, rawY));
  return {
    x: Number(clampedX.toFixed(1)),
    y: Number(clampedY.toFixed(1)),
  };
}

/**
 * Calculates simultaneous zoom level and two-finger pan offset during a
 * touchscreen pinch-to-zoom gesture on mobile/tablet devices.
 */
export function calculatePinchZoomAndPan(params: {
  initialZoom: number;
  initialPan: CanvasPanOffset;
  startDistance: number;
  currentDistance: number;
  startCenterX: number;
  startCenterY: number;
  currentCenterX: number;
  currentCenterY: number;
  minZoom?: number;
  maxZoom?: number;
  maxPanBoundPx?: number;
}): { zoomLevel: number; panOffset: CanvasPanOffset } {
  const {
    initialZoom,
    initialPan,
    startDistance,
    currentDistance,
    startCenterX,
    startCenterY,
    currentCenterX,
    currentCenterY,
    minZoom = 25,
    maxZoom = 250,
    maxPanBoundPx = 2400,
  } = params;

  const safeStartDist = Math.max(10, startDistance);
  const safeCurrentDist = Math.max(10, currentDistance);
  const scaleRatio = safeCurrentDist / safeStartDist;
  const rawZoom = initialZoom * scaleRatio;
  const zoomLevel = Math.round(Math.max(minZoom, Math.min(maxZoom, rawZoom)));

  const panOffset = calculateCanvasPanDelta({
    initialPan,
    startClientX: startCenterX,
    startClientY: startCenterY,
    currentClientX: currentCenterX,
    currentClientY: currentCenterY,
    maxPanBoundPx,
  });

  return { zoomLevel, panOffset };
}

/**
 * Determines whether a pointer down event (mouse, touch, or smart pen) should
 * initiate screen/canvas panning instead of element selection/dragging.
 *
 * - In 'pan' (Hand tool) mode or when holding Spacebar, left-click/touch/pen anywhere pans the screen.
 * - Middle mouse button (button === 1) always pans the screen.
 * - In 'select' mode, left-click/touch/pen on empty canvas/workspace background (not on an interactive element/handle)
 *   initiates canvas panning so users can left-click and hold to move the screen effortlessly.
 */
export function shouldInitiateCanvasPan(params: {
  interactionMode: CanvasInteractionMode;
  isSpacePressed: boolean;
  button: number;
  isInteractiveElementTarget: boolean;
  pointerType?: string;
}): boolean {
  const { interactionMode, isSpacePressed, button, isInteractiveElementTarget } = params;
  // Middle mouse button always pans
  if (button === 1) return true;
  // Only primary button (0) for mouse/touch/pen tip initiates left-click/touch/pen pan
  if (button !== 0) return false;
  if (interactionMode === 'pan' || isSpacePressed) {
    return true;
  }
  return !isInteractiveElementTarget;
}

/**
 * Formats the human-readable save status indicator text for both auto-save and manual save.
 */
export function formatSaveStatusLabel(
  lastSavedAtMs: number,
  nowMs: number = Date.now(),
  mode: 'auto' | 'manual' = 'auto'
): string {
  const prefix = mode === 'manual' ? 'Saved' : 'Auto-saved';
  const elapsedMs = Math.max(0, nowMs - lastSavedAtMs);
  if (elapsedMs < 60_000) {
    return `${prefix} just now`;
  }
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) {
    return `${prefix} ${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${prefix} ${hours}h ago`;
}

/**
 * Upserts and deduplicates the active project inside the saved projects list with an updated timestamp.
 */
export function upsertProjectInSavedList<
  T extends { id: string; lastSaved?: string; updatedAt?: number }
>(
  savedProjects: T[],
  activeProject: T,
  savedAtMs: number = Date.now(),
  mode: 'auto' | 'manual' = 'auto'
): { updatedList: T[]; savedProject: T } {
  const seen = new Set<string>();
  const deduplicated = savedProjects.filter(p => {
    if (!p || !p.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  const savedLabel = formatSaveStatusLabel(savedAtMs, savedAtMs, mode);
  const clonedActive: T = {
    ...JSON.parse(JSON.stringify(activeProject)),
    lastSaved: savedLabel,
    updatedAt: savedAtMs,
  };

  const exists = deduplicated.some(p => p.id === clonedActive.id);
  const updatedList = exists
    ? deduplicated.map(p => (p.id === clonedActive.id ? clonedActive : p))
    : [clonedActive, ...deduplicated];

  return { updatedList, savedProject: clonedActive };
}

/**
 * Determines whether a focused DOM element is an active text-editing field
 * where typing characters or pressing Backspace/Arrows should edit text rather than trigger canvas shortcuts.
 * Non-text inputs (like range sliders, checkboxes, radio buttons, color pickers, and buttons) return false.
 */
export function isTextEntryInputTarget(params: {
  tagName?: string | null;
  inputType?: string | null;
  isContentEditable?: boolean;
}): boolean {
  const tag = (params.tagName || '').toUpperCase();
  if (params.isContentEditable) return true;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (params.inputType || 'text').toLowerCase();
    return ['text', 'number', 'search', 'email', 'password', 'tel', 'url'].includes(type);
  }
  return false;
}

export type StudioShortcutAction =
  | { type: 'save' }
  | { type: 'escape'; isTextInput: boolean }
  | { type: 'blur_input' }
  | { type: 'space_pan_start' }
  | { type: 'tool_select' }
  | { type: 'tool_pan' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'duplicate' }
  | { type: 'copy' }
  | { type: 'cut' }
  | { type: 'paste' }
  | { type: 'delete' }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'layer_order'; direction: 'forward' | 'backward' | 'front' | 'back' }
  | { type: 'toggle_lock' }
  | { type: 'toggle_grid' }
  | { type: 'zoom_in' }
  | { type: 'zoom_out' }
  | { type: 'zoom_reset' }
  | { type: 'page_next' }
  | { type: 'page_prev' }
  | null;

/**
 * Resolves a keyboard event into a deterministic StudioShortcutAction.
 */
export function resolveStudioKeyboardShortcut(params: {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat?: boolean;
  isTextInput: boolean;
  tagName?: string | null;
  hasSelectedElement: boolean;
  isSelectedElementLocked?: boolean;
  hasCopiedElement?: boolean;
}): StudioShortcutAction {
  const {
    key,
    code,
    ctrlKey,
    metaKey,
    shiftKey,
    altKey,
    isTextInput,
    tagName,
    hasSelectedElement,
    isSelectedElementLocked = false,
    hasCopiedElement = false,
  } = params;

  const mod = ctrlKey || metaKey;
  const lowerKey = (key || '').toLowerCase();

  // 1. Ctrl/Cmd + S always triggers Manual Save regardless of focus
  if (mod && !altKey && lowerKey === 's') {
    return { type: 'save' };
  }

  // 2. Escape always works (blurs input and/or closes modals & deselects)
  if (key === 'Escape') {
    return { type: 'escape', isTextInput };
  }

  // 3. When typing inside a text input, Enter blurs single-line INPUTs; all other keys are left to native text editing
  if (isTextInput) {
    if (key === 'Enter' && (tagName || '').toUpperCase() === 'INPUT') {
      return { type: 'blur_input' };
    }
    return null;
  }

  // 4. Spacebar hold-to-pan (when no Ctrl/Cmd/Alt modifier is pressed)
  if (!mod && !altKey && (code === 'Space' || key === ' ')) {
    return { type: 'space_pan_start' };
  }

  // 5. Undo / Redo: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y
  if (mod && !altKey && lowerKey === 'z') {
    return shiftKey ? { type: 'redo' } : { type: 'undo' };
  }
  if (mod && !altKey && lowerKey === 'y') {
    return { type: 'redo' };
  }

  // 6. Clipboard & Duplicate: Ctrl/Cmd+C, Ctrl/Cmd+X, Ctrl/Cmd+V, Ctrl/Cmd+D
  if (mod && !altKey && lowerKey === 'c' && hasSelectedElement) {
    return { type: 'copy' };
  }
  if (mod && !altKey && lowerKey === 'x' && hasSelectedElement) {
    return { type: 'cut' };
  }
  if (mod && !altKey && lowerKey === 'v' && hasCopiedElement) {
    return { type: 'paste' };
  }
  if (mod && !altKey && lowerKey === 'd' && hasSelectedElement) {
    return { type: 'duplicate' };
  }

  // 7. Lock/Unlock element: Ctrl/Cmd+L or plain 'L' when an element is selected
  if (((mod && !altKey && lowerKey === 'l') || (!mod && !altKey && !shiftKey && lowerKey === 'l')) && hasSelectedElement) {
    return { type: 'toggle_lock' };
  }

  // 8. Zoom shortcuts: Ctrl/Cmd + (+/=), Ctrl/Cmd + (-), Ctrl/Cmd + 0
  if (mod && !altKey && (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd')) {
    return { type: 'zoom_in' };
  }
  if (mod && !altKey && (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract')) {
    return { type: 'zoom_out' };
  }
  if (mod && !altKey && (key === '0' || code === 'Digit0' || code === 'Numpad0')) {
    return { type: 'zoom_reset' };
  }

  // 9. Layer ordering: [ and ] (with or without Ctrl/Cmd, and Shift for front/back)
  if (!altKey && hasSelectedElement && !isSelectedElementLocked) {
    if (key === ']' || key === '}' || code === 'BracketRight') {
      return { type: 'layer_order', direction: shiftKey ? 'front' : 'forward' };
    }
    if (key === '[' || key === '{' || code === 'BracketLeft') {
      return { type: 'layer_order', direction: shiftKey ? 'back' : 'backward' };
    }
  }

  // 10. Single-key tool & view shortcuts (no Ctrl/Cmd/Alt)
  if (!mod && !altKey) {
    if (lowerKey === 'v') {
      return { type: 'tool_select' };
    }
    if (lowerKey === 'h') {
      return { type: 'tool_pan' };
    }
    if (lowerKey === 'g') {
      return { type: 'toggle_grid' };
    }
    if (key === 'PageDown') {
      return { type: 'page_next' };
    }
    if (key === 'PageUp') {
      return { type: 'page_prev' };
    }
  }

  // 11. Delete / Backspace selected element
  if (!mod && !altKey && (key === 'Delete' || key === 'Backspace') && hasSelectedElement) {
    return { type: 'delete' };
  }

  // 12. Arrow key nudging for selected unlocked element
  if (
    !mod &&
    !altKey &&
    hasSelectedElement &&
    !isSelectedElementLocked &&
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)
  ) {
    const step = shiftKey ? 2.0 : 0.5;
    if (key === 'ArrowLeft') return { type: 'nudge', dx: -step, dy: 0 };
    if (key === 'ArrowRight') return { type: 'nudge', dx: step, dy: 0 };
    if (key === 'ArrowUp') return { type: 'nudge', dx: 0, dy: -step };
    if (key === 'ArrowDown') return { type: 'nudge', dx: 0, dy: step };
  }

  return null;
}
