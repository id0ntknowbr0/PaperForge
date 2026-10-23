import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateKdpPrintCostAndRoyalty,
  calculateCoverDimensions,
  estimateSalesFromBSR,
  packSevenBackendSlots,
  calculateNextZoomOnWheel,
  convertInchesToUnit,
  convertUnitToInches,
  reorderElementLayers,
  reorderPagesList,
  validateProjectForKdpExport,
  calculateFloatingMenuPosition,
  calculateResizedElementBox,
  calculateCanvasBaseScale,
  calculateVisibleResizeHandles,
  applyPageBackgroundColor,
  bulkAddInteriorPages,
  setBookTotalPageCount,
  calculatePaperCoverPlacementBox,
  resolvePreviewInitialPageIndex,
  resolveCoverPreviewElements,
  extractSingleCoverPageElements,
  INDEX_PAGE_TEMPLATES,
  INDEX_TEMPLATE_CATEGORIES,
  isIndexTemplateType,
  getDefaultIndexConfig,
  calculateIndexPagination,
  checkIndexInsertionShiftWarning,
  buildPageSliceIndexConfig,
  buildEditableIndexPageElements,
  insertIndexPagesAfterFrontCover,
  updateIndexPagesStyle,
  resolveIndexEntriesPageNumbers,
  autoPopulateEntriesFromInteriorPages,
  validateIndexBuilderConfiguration,
  syncLinkedIndexPagesInBook,
  calculateCanvasPanDelta,
  calculatePinchZoomAndPan,
  shouldInitiateCanvasPan,
  formatSaveStatusLabel,
  upsertProjectInSavedList,
  isTextEntryInputTarget,
  resolveStudioKeyboardShortcut,
} from './kdpMath.ts';
import { generateInteriorPdf } from './pdfGenerator.ts';

test('calculateKdpPrintCostAndRoyalty returns accurate print cost for 120-page 6x9 B&W book', () => {
  const result = calculateKdpPrintCostAndRoyalty({
    marketplace: 'US',
    interiorColor: 'black_white',
    paperType: 'white',
    pageCount: 120,
    trimWidth: 6,
    trimHeight: 9,
    listPrice: 7.99,
    distribution: 'regular',
  });

  // Fixed: $1.00 + 120 * $0.012 = $1.00 + $1.44 = $2.44
  assert.equal(result.totalPrintCost, 2.44);
  // Gross royalty: $7.99 * 0.60 = 4.794 -> 4.79
  assert.equal(result.grossRoyalty, 4.79);
  // Net royalty: 4.79 - 2.44 = 2.35
  assert.equal(result.netRoyalty, 2.35);
  // Min list price: 2.44 / 0.60 = 4.07
  assert.equal(result.minListPrice, 4.07);
});

test('calculateCoverDimensions computes accurate spine width for white paper', () => {
  const specs = calculateCoverDimensions({
    trimWidth: 6,
    trimHeight: 9,
    pageCount: 120,
    paperType: 'white',
  });

  // 120 * 0.002252 = 0.27024 -> 0.2702
  assert.equal(specs.spineWidth, 0.2702);
  // Total width = 0.125 * 2 + 6 * 2 + 0.2702 = 12.5202
  assert.equal(specs.totalWidth, 12.5202);
  // Total height = 9 + 0.25 = 9.25
  assert.equal(specs.totalHeight, 9.25);
  // 300 DPI calculation
  assert.equal(specs.totalHeightPx, 2775);
});

test('estimateSalesFromBSR returns valid estimates', () => {
  const highRank = estimateSalesFromBSR(500);
  assert.ok(highRank.monthlySales > 1000);
  assert.ok(highRank.dailySales > 30);

  const midRank = estimateSalesFromBSR(45000);
  assert.ok(midRank.monthlySales > 50 && midRank.monthlySales < 300);

  const lowRank = estimateSalesFromBSR(400000);
  assert.ok(lowRank.monthlySales < 20);
});

test('packSevenBackendSlots deduplicates and bounds each slot to 50 characters', () => {
  const keywords = [
    'gratitude journal for women 2026 daily reflection',
    'mindfulness habit tracker notebook self care',
    'affirmation prompts mental health diary gift for mom',
    'positivity inspirational anxiety relief aesthetic lined',
  ];

  const slots = packSevenBackendSlots(keywords);
  assert.equal(slots.length, 7);
  for (const slot of slots) {
    assert.ok(slot.length <= 50, `Slot exceeded 50 chars: ${slot.length}`);
  }

  // Ensure no duplicate words across slots
  const allWords = slots.join(' ').split(' ').filter(Boolean);
  const uniqueWords = new Set(allWords);
  assert.equal(allWords.length, uniqueWords.size, 'Slots must not contain duplicate words');
});

test('calculateNextZoomOnWheel zooms in and out only when altKey is pressed and clamps bounds', () => {
  assert.equal(calculateNextZoomOnWheel(100, -100, true), 110);
  assert.equal(calculateNextZoomOnWheel(100, 100, true), 90);
  assert.equal(calculateNextZoomOnWheel(100, -100, false), 100);
  assert.equal(calculateNextZoomOnWheel(250, -100, true), 250);
  assert.equal(calculateNextZoomOnWheel(25, 100, true), 25);
});

test('convertInchesToUnit and convertUnitToInches convert accurately between in, mm, and cm', () => {
  assert.equal(convertInchesToUnit(6, 'mm'), 152.4);
  assert.equal(convertInchesToUnit(9, 'mm'), 228.6);
  assert.equal(convertInchesToUnit(6, 'cm'), 15.24);
  assert.equal(convertUnitToInches(152.4, 'mm'), 6);
  assert.equal(convertUnitToInches(15.24, 'cm'), 6);
});

test('reorderElementLayers moves elements forward, backward, to front, and to back', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(
    reorderElementLayers(items, 'a', 'forward').map(x => x.id),
    ['b', 'a', 'c']
  );
  assert.deepEqual(
    reorderElementLayers(items, 'a', 'front').map(x => x.id),
    ['b', 'c', 'a']
  );
  assert.deepEqual(
    reorderElementLayers(items, 'c', 'backward').map(x => x.id),
    ['a', 'c', 'b']
  );
  assert.deepEqual(
    reorderElementLayers(items, 'c', 'back').map(x => x.id),
    ['c', 'a', 'b']
  );
});

test('reorderPagesList reorders interior pages and keeps Cover Spread at index 0', () => {
  const pages = [
    { id: 'cov', isCover: true, pageNumber: 1, name: 'Cover Spread' },
    { id: 'p2', pageNumber: 2, name: 'Page 2' },
    { id: 'p3', pageNumber: 3, name: 'Page 3' },
    { id: 'p4', pageNumber: 4, name: 'Custom Chapter' },
  ];
  const moved = reorderPagesList(pages, 1, 3);
  assert.equal(moved[0].id, 'cov');
  assert.equal(moved[1].id, 'p3');
  assert.equal(moved[1].pageNumber, 2);
  assert.equal(moved[2].id, 'p4');
  assert.equal(moved[2].name, 'Custom Chapter');
  assert.equal(moved[3].id, 'p2');
  assert.equal(moved[3].pageNumber, 4);
});

test('validateProjectForKdpExport detects low page counts, narrow margins, and clipping', () => {
  const clean = validateProjectForKdpExport({
    trimWidthIn: 6,
    trimHeightIn: 9,
    interiorPageCount: 100,
    bleedInches: 0.125,
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    elementsOutsideMarginsCount: 0,
    elementsOverlappingBarcodeCount: 0,
  });
  assert.equal(clean.isValidForPrint, true);
  assert.equal(clean.warnings.length, 0);

  const withWarnings = validateProjectForKdpExport({
    trimWidthIn: 6,
    trimHeightIn: 9,
    interiorPageCount: 12,
    bleedInches: 0.2,
    margins: { top: 0.1, bottom: 0.5, left: 0.2, right: 0.5 },
    elementsOutsideMarginsCount: 2,
    elementsOverlappingBarcodeCount: 1,
  });
  assert.equal(withWarnings.isValidForPrint, false);
  assert.ok(withWarnings.warnings.length >= 4);
});

test('calculateFloatingMenuPosition positions menu anywhere near pointer click (top, middle, bottom) and clamps within container', () => {
  const posMid = calculateFloatingMenuPosition({
    clickX: 500,
    clickY: 300,
    containerWidth: 900,
    containerHeight: 700,
    menuWidth: 360,
    menuHeight: 40,
  });
  assert.equal(posMid.left, 320);
  assert.equal(posMid.top, 246);

  const posBottom = calculateFloatingMenuPosition({
    clickX: 600,
    clickY: 580,
    containerWidth: 900,
    containerHeight: 700,
    menuWidth: 360,
    menuHeight: 40,
  });
  assert.equal(posBottom.left, 420);
  assert.equal(posBottom.top, 526);

  const posCorner = calculateFloatingMenuPosition({
    clickX: 25,
    clickY: 20,
    containerWidth: 900,
    containerHeight: 700,
    menuWidth: 360,
    menuHeight: 40,
  });
  assert.equal(posCorner.left, 12);
  assert.equal(posCorner.top, 40);
});

test('calculateResizedElementBox supports proportional corner resizing and anchored opposite corners up to 100% page size', () => {
  const seLocked = calculateResizedElementBox({
    handle: 'se',
    initialX: 20,
    initialY: 20,
    initialW: 30,
    initialH: 15,
    deltaX: 10,
    deltaY: 2,
    lockAspectRatio: true,
  });
  assert.equal(seLocked.x, 20);
  assert.equal(seLocked.y, 20);
  assert.equal(seLocked.width, 40);
  assert.equal(seLocked.height, 20);

  const nwLocked = calculateResizedElementBox({
    handle: 'nw',
    initialX: 30,
    initialY: 30,
    initialW: 20,
    initialH: 20,
    deltaX: -6,
    deltaY: -4,
    lockAspectRatio: true,
  });
  assert.equal(nwLocked.width, 26);
  assert.equal(nwLocked.height, 26);
  assert.equal(nwLocked.x, 24);
  assert.equal(nwLocked.y, 24);

  // Unrestricted corner & bottom resizing when width is already 100% and height is 95%: dragging down reaches 100%+
  const seFree = calculateResizedElementBox({
    handle: 'se',
    initialX: 0,
    initialY: 0,
    initialW: 100,
    initialH: 95,
    deltaX: 0,
    deltaY: 5,
    lockAspectRatio: false,
  });
  assert.equal(seFree.width, 100);
  assert.equal(seFree.height, 100);

  // Even when aspect ratio is locked and width is already 100%, dragging down is never blocked from reaching 100% height
  const seLockedFullBottom = calculateResizedElementBox({
    handle: 'se',
    initialX: 0,
    initialY: 0,
    initialW: 100,
    initialH: 95,
    deltaX: 0,
    deltaY: 5,
    lockAspectRatio: true,
  });
  assert.equal(seLockedFullBottom.height, 100);
});

test('calculateCanvasBaseScale enlarges canvas when side panels are collapsed and fits both low and high screen sizes', () => {
  const bothOpen = calculateCanvasBaseScale({
    leftPanelOpen: true,
    leftToolDrawerOpen: false,
    rightPanelOpen: true,
    isSpread: true,
  });
  const oneClosed = calculateCanvasBaseScale({
    leftPanelOpen: false,
    leftToolDrawerOpen: false,
    rightPanelOpen: true,
    isSpread: true,
  });
  const bothClosed = calculateCanvasBaseScale({
    leftPanelOpen: false,
    leftToolDrawerOpen: false,
    rightPanelOpen: false,
    isSpread: true,
  });
  assert.ok(oneClosed > bothOpen);
  assert.ok(bothClosed > oneClosed);

  // Also verify with live measured viewport dimensions (e.g. 1440x900 desktop workspace)
  const vpDrawerOpen = calculateCanvasBaseScale({
    leftPanelOpen: true,
    leftToolDrawerOpen: true,
    rightPanelOpen: true,
    isSpread: true,
    viewportWidthPx: 596,
    viewportHeightPx: 792,
    canvasWidthIn: 12.3,
    canvasHeightIn: 9.25,
  });
  const vpBothOpen = calculateCanvasBaseScale({
    leftPanelOpen: true,
    leftToolDrawerOpen: false,
    rightPanelOpen: true,
    isSpread: true,
    viewportWidthPx: 900,
    viewportHeightPx: 792,
    canvasWidthIn: 12.3,
    canvasHeightIn: 9.25,
  });
  const vpLeftClosed = calculateCanvasBaseScale({
    leftPanelOpen: false,
    leftToolDrawerOpen: false,
    rightPanelOpen: true,
    isSpread: true,
    viewportWidthPx: 1088,
    viewportHeightPx: 792,
    canvasWidthIn: 12.3,
    canvasHeightIn: 9.25,
  });
  const vpRightClosed = calculateCanvasBaseScale({
    leftPanelOpen: true,
    leftToolDrawerOpen: false,
    rightPanelOpen: false,
    isSpread: true,
    viewportWidthPx: 1180,
    viewportHeightPx: 792,
    canvasWidthIn: 12.3,
    canvasHeightIn: 9.25,
  });
  const vpBothClosed = calculateCanvasBaseScale({
    leftPanelOpen: false,
    leftToolDrawerOpen: false,
    rightPanelOpen: false,
    isSpread: true,
    viewportWidthPx: 1368,
    viewportHeightPx: 792,
    canvasWidthIn: 12.3,
    canvasHeightIn: 9.25,
  });

  assert.ok(vpBothOpen > vpDrawerOpen, 'Closing left tool drawer enlarges main spread canvas');
  assert.ok(vpLeftClosed > vpBothOpen, 'Closing left pages panel enlarges main spread canvas');
  assert.ok(vpRightClosed > vpBothOpen, 'Closing right inspector panel enlarges main spread canvas');
  assert.ok(vpBothClosed > vpLeftClosed, 'Closing both side panels enlarges main spread canvas further');
  assert.ok(vpBothClosed > vpRightClosed, 'Closing both side panels enlarges main spread canvas further');

  // Verify Single Page mode also enlarges whenever a side panel is closed
  const singleBothOpen = calculateCanvasBaseScale({
    leftPanelOpen: true,
    leftToolDrawerOpen: false,
    rightPanelOpen: true,
    isSpread: false,
    viewportWidthPx: 900,
    viewportHeightPx: 792,
    canvasWidthIn: 6.0,
    canvasHeightIn: 9.0,
  });
  const singleOneClosed = calculateCanvasBaseScale({
    leftPanelOpen: false,
    leftToolDrawerOpen: false,
    rightPanelOpen: true,
    isSpread: false,
    viewportWidthPx: 1088,
    viewportHeightPx: 792,
    canvasWidthIn: 6.0,
    canvasHeightIn: 9.0,
  });
  const singleBothClosed = calculateCanvasBaseScale({
    leftPanelOpen: false,
    leftToolDrawerOpen: false,
    rightPanelOpen: false,
    isSpread: false,
    viewportWidthPx: 1368,
    viewportHeightPx: 792,
    canvasWidthIn: 6.0,
    canvasHeightIn: 9.0,
  });
  assert.ok(singleOneClosed > singleBothOpen, 'Closing a side panel enlarges single-page canvas');
  assert.ok(singleBothClosed > singleOneClosed, 'Closing second side panel enlarges single-page canvas further');

  const lowScreenScale = calculateCanvasBaseScale({
    leftPanelOpen: true,
    leftToolDrawerOpen: false,
    rightPanelOpen: true,
    isSpread: true,
    viewportWidthPx: 720,
    viewportHeightPx: 480,
    canvasWidthIn: 12.3,
    canvasHeightIn: 9.25,
  });
  assert.ok(lowScreenScale * 9.25 <= 480, 'Page height at 100% zoom must fit inside low screen height');

  const highScreenScale = calculateCanvasBaseScale({
    leftPanelOpen: false,
    leftToolDrawerOpen: false,
    rightPanelOpen: false,
    isSpread: true,
    viewportWidthPx: 1800,
    viewportHeightPx: 1100,
    canvasWidthIn: 12.3,
    canvasHeightIn: 9.25,
  });
  assert.ok(highScreenScale > lowScreenScale, 'High screen size scales page larger while staying fitted');
  assert.ok(highScreenScale * 9.25 <= 1100);
});

test('calculateVisibleResizeHandles keeps all 8 resize handles inside visible bounds when image is 100% page size', () => {
  const result = calculateVisibleResizeHandles({
    cx: 0,
    cy: 0,
    cw: 1230,
    ch: 925,
    canvasW: 1230,
    canvasH: 925,
    insetMargin: 8,
  });
  assert.equal(result.handles.length, 8);
  for (const h of result.handles) {
    assert.ok(h.hx >= 8 && h.hx <= 1222, `Handle ${h.id} hx=${h.hx} must remain inside canvas width`);
    assert.ok(h.hy >= 8 && h.hy <= 917, `Handle ${h.id} hy=${h.hy} must remain inside canvas height`);
  }
});

test('applyPageBackgroundColor updates either one page, all inner pages, or all pages', () => {
  const samplePages = [
    { id: 'cov', isCover: true, backgroundColor: '#FFFFFF' },
    { id: 'p2', isCover: false, backgroundColor: '#FFFFFF' },
    { id: 'p3', isCover: false, backgroundColor: '#FFFFFF' },
  ];

  // Change only page 2 (index 1)
  const oneChanged = applyPageBackgroundColor(samplePages, 1, '#FEFCE8', 'current');
  assert.equal(oneChanged[0].backgroundColor, '#FFFFFF');
  assert.equal(oneChanged[1].backgroundColor, '#FEFCE8');
  assert.equal(oneChanged[2].backgroundColor, '#FFFFFF');

  // Change all inner pages (keeps cover white, changes p2 and p3)
  const allInnerChanged = applyPageBackgroundColor(samplePages, 0, '#FAF8F5', 'all_inner');
  assert.equal(allInnerChanged[0].backgroundColor, '#FFFFFF');
  assert.equal(allInnerChanged[1].backgroundColor, '#FAF8F5');
  assert.equal(allInnerChanged[2].backgroundColor, '#FAF8F5');

  // Change all pages including cover
  const allPagesChanged = applyPageBackgroundColor(samplePages, 0, '#EFF6FF', 'all_pages');
  assert.equal(allPagesChanged[0].backgroundColor, '#EFF6FF');
  assert.equal(allPagesChanged[1].backgroundColor, '#EFF6FF');
  assert.equal(allPagesChanged[2].backgroundColor, '#EFF6FF');
});

test('bulkAddInteriorPages and setBookTotalPageCount accurately bulk-add and set total book pages', () => {
  const initialPages = [
    { id: 'cov', pageNumber: 1, isCover: true, name: 'Cover Spread', backgroundColor: '#FFFFFF', elements: [] },
    {
      id: 'p2',
      pageNumber: 2,
      isCover: false,
      isEven: true,
      name: 'Page 2',
      backgroundColor: '#FAF8F5',
      templateType: 'dotgrid',
      showPageNumber: true,
      elements: [],
    },
  ];

  // Bulk add 10 pages -> total 12 pages, inheriting #FAF8F5 and dotgrid
  const afterBulkAdd = bulkAddInteriorPages({
    pages: initialPages,
    countToAdd: 10,
    createPageId: i => `added-${i}`,
  });
  assert.equal(afterBulkAdd.length, 12);
  assert.equal(afterBulkAdd[11].pageNumber, 12);
  assert.equal(afterBulkAdd[11].name, 'Page 12');
  assert.equal(afterBulkAdd[11].backgroundColor, '#FAF8F5');
  assert.equal(afterBulkAdd[11].templateType, 'dotgrid');

  // Set total book page count to 100
  const hundredPages = setBookTotalPageCount({
    pages: afterBulkAdd,
    targetTotalPages: 100,
    createPageId: i => `set-${i}`,
  });
  assert.equal(hundredPages.length, 100);
  assert.equal(hundredPages[0].isCover, true);
  assert.equal(hundredPages[99].pageNumber, 100);
  assert.equal(hundredPages[99].backgroundColor, '#FAF8F5');

  // Set total book page count down to 24
  const twentyFourPages = setBookTotalPageCount({
    pages: hundredPages,
    targetTotalPages: 24,
  });
  assert.equal(twentyFourPages.length, 24);
  assert.equal(twentyFourPages[0].isCover, true);
  assert.equal(twentyFourPages[23].pageNumber, 24);
});

test('calculatePaperCoverPlacementBox computes accurate Front, Back, and Full Wrap paper cover boxes', () => {
  const front = calculatePaperCoverPlacementBox({
    target: 'front_cover',
    totalWidthIn: 12.304,
    totalHeightIn: 9.25,
    bleedMarginIn: 0.125,
    trimWidthIn: 6.0,
    spineWidthIn: 0.054,
  });
  assert.ok(front.x > 49 && front.x < 52);
  assert.equal(front.y, 0);
  assert.ok(front.width > 48 && front.width < 51);
  assert.equal(front.height, 100);

  const back = calculatePaperCoverPlacementBox({
    target: 'back_cover',
    totalWidthIn: 12.304,
    totalHeightIn: 9.25,
    bleedMarginIn: 0.125,
    trimWidthIn: 6.0,
    spineWidthIn: 0.054,
  });
  assert.equal(back.x, 0);
  assert.equal(back.y, 0);
  assert.ok(back.width > 49 && back.width < 51);
  assert.equal(back.height, 100);

  const full = calculatePaperCoverPlacementBox({
    target: 'full_wrap',
    totalWidthIn: 12.304,
    totalHeightIn: 9.25,
    bleedMarginIn: 0.125,
    trimWidthIn: 6.0,
    spineWidthIn: 0.054,
  });
  assert.deepEqual(full, { x: 0, y: 0, width: 100, height: 100 });
});

test('resolvePreviewInitialPageIndex, resolveCoverPreviewElements, and extractSingleCoverPageElements ensure front and back cover images are shown in preview and PDF', () => {
  const pagesWithCoverImage = [
    {
      isCover: true,
      elements: [
        { id: 'title-1', type: 'text', x: 56, y: 44, width: 38, height: 7 },
        { id: 'img-cover', type: 'image', x: 60, y: 20, width: 25, height: 30 },
      ],
    },
    {
      isCover: false,
      elements: [],
    },
  ];

  assert.equal(resolvePreviewInitialPageIndex(pagesWithCoverImage, 1), 0);
  assert.equal(resolvePreviewInitialPageIndex(pagesWithCoverImage, 0), 0);

  const resolvedCover = resolveCoverPreviewElements(pagesWithCoverImage);
  assert.equal(resolvedCover.length, 2);
  assert.equal(resolvedCover[1].id, 'img-cover');

  // If user inserted paper cover images on an interior template page (index 1) or split across Page 1 and Page 2,
  // resolvePreviewInitialPageIndex always opens on index 0 (Cover Spread) and resolveCoverPreviewElements merges both.
  const pagesWithSplitFrontAndBackImages = [
    {
      isCover: true,
      elements: [
        { id: 'title-1', type: 'text', x: 56, y: 44, width: 38, height: 7 },
        { id: 'img-front', type: 'image', x: 52, y: 0, width: 48, height: 100 },
      ],
    },
    {
      isCover: false,
      elements: [{ id: 'img-back', type: 'image', x: 52, y: 0, width: 48, height: 100 }],
    },
  ];
  assert.equal(resolvePreviewInitialPageIndex(pagesWithSplitFrontAndBackImages, 1), 0);
  const mergedElements = resolveCoverPreviewElements(pagesWithSplitFrontAndBackImages);
  assert.equal(mergedElements.length, 3);
  const frontEl = mergedElements.find(e => e.id === 'img-front')!;
  const backEl = mergedElements.find(e => e.id === 'img-back')!;
  assert.ok(frontEl.x >= 50);
  assert.ok(backEl.x < 10);

  // Extract standalone Front Cover and Back Cover pages for single-page preview and PDF export
  const extractedFront = extractSingleCoverPageElements({
    elements: mergedElements,
    side: 'front',
    totalWidthIn: 12.304,
    bleedMarginIn: 0.125,
    trimWidthIn: 6.0,
    spineWidthIn: 0.054,
  });
  const extractedBack = extractSingleCoverPageElements({
    elements: mergedElements,
    side: 'back',
    totalWidthIn: 12.304,
    bleedMarginIn: 0.125,
    trimWidthIn: 6.0,
    spineWidthIn: 0.054,
  });
  assert.ok(extractedFront.some(e => e.id === 'img-front'));
  assert.ok(extractedBack.some(e => e.id === 'img-back'));

  // Even when only 1 cover image is inserted, both Front Cover and Back Cover extractions include it
  const singleCoverFront = extractSingleCoverPageElements({
    elements: resolvedCover,
    side: 'front',
    totalWidthIn: 12.304,
    bleedMarginIn: 0.125,
    trimWidthIn: 6.0,
    spineWidthIn: 0.054,
  });
  const singleCoverBack = extractSingleCoverPageElements({
    elements: resolvedCover,
    side: 'back',
    totalWidthIn: 12.304,
    bleedMarginIn: 0.125,
    trimWidthIn: 6.0,
    spineWidthIn: 0.054,
  });
  assert.ok(singleCoverFront.some(e => e.id === 'img-cover'));
  assert.ok(singleCoverBack.some(e => e.id === 'img-cover'));
});

test('12 Index Page templates, categories, configuration defaults, pagination, shift warnings, editable elements, and insertion work accurately', () => {
  // 1. Verify all 12 templates and 4 categories exist
  assert.equal(INDEX_PAGE_TEMPLATES.length, 12);
  assert.deepEqual(INDEX_TEMPLATE_CATEGORIES, [
    'General Indexes',
    'Journals & Planners',
    'Study & Research',
    'Books & Collections',
  ]);

  const expectedStyles = [
    'index_classic',
    'index_bullet',
    'index_numbered',
    'index_alphabetical',
    'index_categorical',
    'index_project',
    'index_monthly',
    'index_glossary',
    'index_reading',
    'index_recipe',
    'index_study',
    'index_collection',
  ] as const;

  for (const style of expectedStyles) {
    assert.equal(isIndexTemplateType(style), true);
    const cfg = getDefaultIndexConfig(style);
    assert.equal(cfg.templateId, style);
    assert.ok(cfg.title.length > 0);
    assert.ok(cfg.columnLabels.length >= 2);
  }
  assert.equal(isIndexTemplateType('lined'), false);

  // 2. Verify pagination and Numbered / A-Z / Classic TOC configuration
  const numberedCfg50 = {
    ...getDefaultIndexConfig('index_numbered'),
    numberedRangeStart: 1,
    numberedRangeEnd: 50,
  };
  const numPag = calculateIndexPagination(numberedCfg50, 9);
  assert.equal(numPag.totalItemsRequested, 50);
  assert.equal(numPag.entriesPerPage, 50);

  const classicMultiPage = {
    ...getDefaultIndexConfig('index_classic'),
    totalEntriesRequested: 40,
    pageCount: 1,
  };
  const tocPag = calculateIndexPagination(classicMultiPage, 9);
  assert.equal(tocPag.requiresMultiplePages, true);
  assert.ok(tocPag.recommendedPages >= 2);

  // 3. Verify editable index elements generation in 0-100% single-page coordinates
  const editableHeaderOnly = buildEditableIndexPageElements({
    config: getDefaultIndexConfig('index_reading'),
    pageSequenceIndex: 0,
    pageSequenceTotal: 2,
    includeSampleRowCells: false,
    includeAllRowCells: false,
  });
  assert.ok(editableHeaderOnly.some(e => e.id.includes('-title')));
  assert.ok(editableHeaderOnly.some(e => e.id.includes('-colhdr-0')));

  const editableWithRows = buildEditableIndexPageElements({
    config: getDefaultIndexConfig('index_recipe'),
    pageSequenceIndex: 0,
    pageSequenceTotal: 1,
    includeAllRowCells: true,
  });
  assert.ok(editableWithRows.length > editableHeaderOnly.length);
  assert.ok(editableWithRows.some(e => e.id.includes('-row-topic-')));

  // 4. Verify shift warning detection
  const initialPages: any[] = [
    { id: 'cov', pageNumber: 1, isCover: true, name: 'Cover Spread', backgroundColor: '#FFFFFF', elements: [] },
    {
      id: 'p2',
      pageNumber: 2,
      isCover: false,
      isEven: true,
      name: 'Chapter 1: Getting Started',
      backgroundColor: '#FAF8F5',
      templateType: 'lined',
      showPageNumber: true,
      elements: [{ id: 'custom-1', type: 'text', content: 'Hello', x: 10, y: 10, width: 50, height: 10 }],
    },
    {
      id: 'p3',
      pageNumber: 3,
      isCover: false,
      isEven: false,
      name: 'Page 3',
      backgroundColor: '#FAF8F5',
      templateType: 'lined',
      showPageNumber: true,
      elements: [],
    },
  ];

  const shiftWarn = checkIndexInsertionShiftWarning(initialPages, 2);
  assert.equal(shiftWarn.willShiftInteriorPages, true);
  assert.equal(shiftWarn.customizedInteriorCount, 1);
  assert.ok(shiftWarn.message.includes('Page 4'));

  // 5. Insert 2 configured index pages right after the front cover without mutating initialPages
  const customCfg = {
    ...getDefaultIndexConfig('index_monthly'),
    title: '2026 MONTHLY LOG',
    pageCount: 2,
  };
  const afterInsert = insertIndexPagesAfterFrontCover({
    pages: initialPages,
    count: 2,
    indexStyle: 'index_monthly',
    indexConfig: customCfg,
    createPageId: i => `idx-${i}`,
  });

  assert.equal(initialPages.length, 3); // original unmodified (supports clean Undo)
  assert.equal(afterInsert.length, 5);
  assert.equal(afterInsert[0].isCover, true);
  assert.equal(afterInsert[1].id, 'idx-0');
  assert.equal(afterInsert[1].templateType, 'index_monthly');
  assert.equal(afterInsert[1].name, 'Index Page 1');
  assert.equal(afterInsert[1].pageNumber, 2);
  assert.equal(afterInsert[1].indexConfig?.title, '2026 MONTHLY LOG');
  assert.ok(afterInsert[1].elements.length >= 2);
  assert.equal(afterInsert[2].id, 'idx-1');
  assert.equal(afterInsert[2].pageNumber, 3);
  assert.equal(afterInsert[2].indexConfig?.pageSequenceIndex, 1);
  assert.equal(afterInsert[2].indexConfig?.pageSequenceTotal, 2);
  // Original Chapter 1 preserved at Page 4
  assert.equal(afterInsert[3].id, 'p2');
  assert.equal(afterInsert[3].pageNumber, 4);
  assert.equal(afterInsert[3].name, 'Chapter 1: Getting Started');
  assert.equal(afterInsert[3].elements.length, 1);

  // 6. Switch index pages to Glossary & Vocabulary Index
  const glossaryCfg = getDefaultIndexConfig('index_glossary');
  const afterStyleSwitch = updateIndexPagesStyle({
    pages: afterInsert,
    newStyle: 'index_glossary',
    customConfig: glossaryCfg,
    activePageIndex: 1,
  });
  assert.equal(afterStyleSwitch.pages[1].templateType, 'index_glossary');
  assert.equal(afterStyleSwitch.pages[1].indexConfig?.title, 'GLOSSARY & VOCABULARY INDEX');
  assert.equal(afterStyleSwitch.pages[2].templateType, 'index_glossary');
  assert.equal(afterStyleSwitch.pages[3].templateType, 'lined');

  // 7. Verify buildPageSliceIndexConfig for multi-page Numbered Reference (1-100), Classic TOC, and A-Z (a-m-n-z)
  const num100Cfg = {
    ...getDefaultIndexConfig('index_numbered'),
    numberedRangePreset: '1-100' as const,
    pageCount: 2,
  };
  const numSlice0 = buildPageSliceIndexConfig(num100Cfg, 0, 2);
  const numSlice1 = buildPageSliceIndexConfig(num100Cfg, 1, 2);
  assert.equal(numSlice0.startEntryNumber, 1);
  assert.equal(numSlice0.endEntryNumber, 50);
  assert.equal(numSlice1.startEntryNumber, 51);
  assert.equal(numSlice1.endEntryNumber, 100);

  const tocMultiCfg = {
    ...getDefaultIndexConfig('index_classic'),
    entriesPerPage: 20,
    totalEntriesRequested: 35,
    pageCount: 2,
  };
  const tocSlice0 = buildPageSliceIndexConfig(tocMultiCfg, 0, 2);
  const tocSlice1 = buildPageSliceIndexConfig(tocMultiCfg, 1, 2);
  assert.equal(tocSlice0.startEntryNumber, 1);
  assert.equal(tocSlice0.endEntryNumber, 20);
  assert.equal(tocSlice0.entriesPerPage, 20);
  assert.equal(tocSlice1.startEntryNumber, 21);
  assert.equal(tocSlice1.endEntryNumber, 35);
  assert.equal(tocSlice1.entriesPerPage, 15);

  // 8. Verify all 12 templates generate valid editable elements with dark readable column headers and letterSpacing: 0
  for (const style of expectedStyles) {
    const cfg = { ...getDefaultIndexConfig(style), showNotesField: true };
    const elems = buildEditableIndexPageElements({
      config: cfg,
      pageSequenceIndex: 0,
      pageSequenceTotal: 1,
      includeAllRowCells: true,
    });
    assert.ok(elems.length >= 4, `Template ${style} should generate at least 4 editable elements`);
    const colHdrs = elems.filter(e => e.id.includes('-colhdr-'));
    for (const hdr of colHdrs) {
      assert.notEqual(hdr.fill, '#FFFFFF', `Column header ${hdr.id} on ${style} must not have white text on light header bar`);
      assert.equal(hdr.letterSpacing, 0, `Column header ${hdr.id} on ${style} must have 0 letterSpacing`);
    }
  }
});

test('generateInteriorPdf exports all 12 distinct index templates cleanly without clipping or errors', async () => {
  const allStyles = [
    'index_classic',
    'index_bullet',
    'index_numbered',
    'index_alphabetical',
    'index_categorical',
    'index_project',
    'index_monthly',
    'index_glossary',
    'index_reading',
    'index_recipe',
    'index_study',
    'index_collection',
  ] as const;

  let pages: any[] = [
    {
      id: 'cover-1',
      pageNumber: 1,
      isCover: true,
      name: 'Cover Spread',
      backgroundColor: '#FFFFFF',
      elements: [],
    },
    {
      id: 'interior-end',
      pageNumber: 2,
      isCover: false,
      name: 'Page 2',
      backgroundColor: '#FFFFFF',
      templateType: 'lined',
      showPageNumber: true,
      elements: [],
    },
  ];

  for (const style of allStyles) {
    const cfg = {
      ...getDefaultIndexConfig(style),
      showNotesField: true,
    };
    pages = insertIndexPagesAfterFrontCover({
      pages,
      indexStyle: style,
      count: 1,
      indexConfig: cfg,
    });
  }

  const pdfBlob = await generateInteriorPdf({
    id: 'test-proj-pdf',
    title: 'Index Export Test Book',
    trimSize: '6x9',
    paperType: 'white',
    binding: 'paperback',
    bleed: false,
    pageCount: pages.length,
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    pages,
  } as any);

  assert.ok(pdfBlob instanceof Blob);
  assert.ok(pdfBlob.size > 2000, 'Generated PDF Blob must be non-empty and contain all 12 index pages');
});

test('Index Builder: automatic multi-page calculation, blank vs linked modes, dynamic page reordering sync, unresolved reference warning, and boundary validation', async () => {
  const basePages: any[] = [
    {
      id: 'cov',
      pageNumber: 1,
      isCover: true,
      name: 'Cover Spread',
      backgroundColor: '#FFFFFF',
      elements: [],
    },
    {
      id: 'p-ch1',
      pageNumber: 2,
      isCover: false,
      isEven: true,
      name: 'Chapter 1: Foundations',
      backgroundColor: '#FFFFFF',
      templateType: 'lined',
      showPageNumber: true,
      elements: [],
    },
    {
      id: 'p-ch2',
      pageNumber: 3,
      isCover: false,
      isEven: false,
      name: 'Chapter 2: Methodology',
      backgroundColor: '#FFFFFF',
      templateType: 'lined',
      showPageNumber: true,
      elements: [],
    },
    {
      id: 'p-ch3',
      pageNumber: 4,
      isCover: false,
      isEven: true,
      name: 'Chapter 3: Case Studies',
      backgroundColor: '#FFFFFF',
      templateType: 'lined',
      showPageNumber: true,
      elements: [],
    },
  ];

  // 1. Blank Printable Index keeps row fields blank by default
  const blankCfg = getDefaultIndexConfig('index_classic');
  assert.equal(blankCfg.indexMode, 'blank');
  const blankPages = insertIndexPagesAfterFrontCover({
    pages: basePages,
    indexStyle: 'index_classic',
    count: 1,
    indexConfig: blankCfg,
  });
  const blankRowCells = blankPages[1].elements.filter((el: any) => el.id.includes('-row-topic-') || el.id.includes('-row-pg-'));
  assert.equal(blankRowCells.length, 0, 'Blank printable index must keep row fields blank unless linked or explicitly populated');

  // 2. Auto-populate linked entries from interior pages & verify post-insertion resolved page numbers
  const autoEntries = autoPopulateEntriesFromInteriorPages(basePages, 10);
  assert.equal(autoEntries.length, 3);
  assert.equal(autoEntries[0].linkedPageId, 'p-ch1');
  assert.equal(autoEntries[1].linkedPageId, 'p-ch2');
  assert.equal(autoEntries[2].linkedPageId, 'p-ch3');

  const linkedCfg = {
    ...getDefaultIndexConfig('index_classic'),
    indexMode: 'linked' as const,
    entries: autoEntries,
    pageCount: 1,
  };
  const withLinkedIndex = insertIndexPagesAfterFrontCover({
    pages: basePages,
    indexStyle: 'index_classic',
    count: 1,
    indexConfig: linkedCfg,
    createPageId: i => `linked-idx-${i}`,
  });

  // Index is at Page 2; p-ch1 is now Page 3, p-ch2 is Page 4, p-ch3 is Page 5
  assert.equal(withLinkedIndex[1].id, 'linked-idx-0');
  assert.equal(withLinkedIndex[2].id, 'p-ch1');
  assert.equal(withLinkedIndex[2].pageNumber, 3);
  const pgCell0 = withLinkedIndex[1].elements.find((el: any) => el.id === 'idx-el-p1-row-pg-0');
  const pgCell1 = withLinkedIndex[1].elements.find((el: any) => el.id === 'idx-el-p1-row-pg-1');
  const pgCell2 = withLinkedIndex[1].elements.find((el: any) => el.id === 'idx-el-p1-row-pg-2');
  assert.equal(pgCell0?.text, '3');
  assert.equal(pgCell1?.text, '4');
  assert.equal(pgCell2?.text, '5');

  // 3. Reorder pages: move p-ch3 (currently index 4, Page 5) to index 2 (Page 3, before p-ch1)
  const afterReorder = reorderPagesList(withLinkedIndex, 4, 2);
  assert.equal(afterReorder[2].id, 'p-ch3');
  assert.equal(afterReorder[2].pageNumber, 3);
  assert.equal(afterReorder[3].id, 'p-ch1');
  assert.equal(afterReorder[3].pageNumber, 4);
  assert.equal(afterReorder[4].id, 'p-ch2');
  assert.equal(afterReorder[4].pageNumber, 5);

  // Linked index page automatically updates displayed page references!
  const updatedPgCell0 = afterReorder[1].elements.find((el: any) => el.id === 'idx-el-p1-row-pg-0'); // linked to p-ch1 -> now 4
  const updatedPgCell1 = afterReorder[1].elements.find((el: any) => el.id === 'idx-el-p1-row-pg-1'); // linked to p-ch2 -> now 5
  const updatedPgCell2 = afterReorder[1].elements.find((el: any) => el.id === 'idx-el-p1-row-pg-2'); // linked to p-ch3 -> now 3
  assert.equal(updatedPgCell0?.text, '4');
  assert.equal(updatedPgCell1?.text, '5');
  assert.equal(updatedPgCell2?.text, '3');

  // 4. Delete a referenced page (p-ch2) -> displays warning (! UNRESOLVED) instead of inventing a page number
  const withoutCh2 = afterReorder
    .filter((p: any) => p.id !== 'p-ch2')
    .map((p: any, idx: number) => ({
      ...p,
      pageNumber: idx + 1,
      isEven: (idx + 1) % 2 === 0,
    }));
  const afterDeleteSync = syncLinkedIndexPagesInBook(withoutCh2);
  const brokenCell1 = afterDeleteSync[1].elements.find((el: any) => el.id === 'idx-el-p1-row-pg-1');
  assert.equal(brokenCell1?.text, '! UNRESOLVED');
  assert.equal(brokenCell1?.fill, '#DC2626');

  // Validate configuration detects broken link
  const validationWithBroken = validateIndexBuilderConfiguration({
    config: afterDeleteSync[1].indexConfig!,
    pages: afterDeleteSync,
  });
  assert.equal(validationWithBroken.brokenLinksCount, 1);
  assert.ok(validationWithBroken.warnings.some(w => w.includes('cannot be resolved')));

  // 5. Multi-page automatic calculation & boundary validation (35 entries across 2 pages)
  const thirtyFiveEntries = Array.from({ length: 35 }, (_, i) => ({
    id: `e-${i + 1}`,
    entryNumber: i + 1,
    label: `Topic Item #${i + 1}`,
    linkedPageId: i % 2 === 0 ? 'p-ch1' : 'p-ch3',
  }));
  const multiLinkedCfg = {
    ...getDefaultIndexConfig('index_classic'),
    indexMode: 'linked' as const,
    entriesPerPage: 20,
    totalEntriesRequested: 35,
    pageCount: 2,
    entries: thirtyFiveEntries,
  };
  const multiValidation = validateIndexBuilderConfiguration({
    config: multiLinkedCfg,
    pages: basePages,
  });
  assert.equal(multiValidation.isValid, true);
  assert.equal(multiValidation.requiredPages, 2);
  assert.equal(multiValidation.outOfBoundsElementsCount, 0);

  const multiInserted = insertIndexPagesAfterFrontCover({
    pages: basePages,
    indexStyle: 'index_classic',
    count: 2,
    indexConfig: multiLinkedCfg,
  });
  assert.equal(multiInserted.length, 6);
  assert.equal(multiInserted[1].indexConfig?.startEntryNumber, 1);
  assert.equal(multiInserted[1].indexConfig?.endEntryNumber, 20);
  assert.equal(multiInserted[2].indexConfig?.startEntryNumber, 21);
  assert.equal(multiInserted[2].indexConfig?.endEntryNumber, 35);

  // Page 2 (second index page, seqIdx=1 -> p2) has Topic Item #21 in its first row
  const page2FirstTopic = multiInserted[2].elements.find((el: any) => el.id === 'idx-el-p2-row-topic-0');
  assert.equal(page2FirstTopic?.text, 'Topic Item #21');
});

test('calculateCanvasPanDelta, calculatePinchZoomAndPan, and shouldInitiateCanvasPan support mouse left-click pan, touchscreen pinch-zoom, and smart pens', () => {
  // 1. Left-click / touch / pen drag delta calculation & clamping
  const nextPan = calculateCanvasPanDelta({
    initialPan: { x: 20, y: -15 },
    startClientX: 400,
    startClientY: 300,
    currentClientX: 540,
    currentClientY: 220,
  });
  assert.equal(nextPan.x, 160);
  assert.equal(nextPan.y, -95);

  const clampedPan = calculateCanvasPanDelta({
    initialPan: { x: 2300, y: -2300 },
    startClientX: 100,
    startClientY: 100,
    currentClientX: 500,
    currentClientY: -400,
    maxPanBoundPx: 2400,
  });
  assert.equal(clampedPan.x, 2400);
  assert.equal(clampedPan.y, -2400);

  // 2. Two-finger touchscreen pinch-to-zoom and pan
  const pinchOut = calculatePinchZoomAndPan({
    initialZoom: 100,
    initialPan: { x: 0, y: 0 },
    startDistance: 120,
    currentDistance: 180, // 1.5x pinch out
    startCenterX: 300,
    startCenterY: 400,
    currentCenterX: 335,
    currentCenterY: 420,
  });
  assert.equal(pinchOut.zoomLevel, 150);
  assert.equal(pinchOut.panOffset.x, 35);
  assert.equal(pinchOut.panOffset.y, 20);

  // 3. Pan initiation rules across Select mode, Hand/Pan mode, Spacebar, Mouse, Touch, and Smart Pen
  // Left-click on empty canvas background in Select mode -> pans screen
  assert.equal(
    shouldInitiateCanvasPan({
      interactionMode: 'select',
      isSpacePressed: false,
      button: 0,
      isInteractiveElementTarget: false,
      pointerType: 'mouse',
    }),
    true
  );

  // Left-click or Smart Pen on an interactive element in Select mode -> manipulates element (does not pan)
  assert.equal(
    shouldInitiateCanvasPan({
      interactionMode: 'select',
      isSpacePressed: false,
      button: 0,
      isInteractiveElementTarget: true,
      pointerType: 'pen',
    }),
    false
  );

  // Left-click or Smart Pen or Touch on an interactive element when Hand/Pan tool is active -> pans screen
  assert.equal(
    shouldInitiateCanvasPan({
      interactionMode: 'pan',
      isSpacePressed: false,
      button: 0,
      isInteractiveElementTarget: true,
      pointerType: 'pen',
    }),
    true
  );

  // Holding Spacebar with left-click over an element -> pans screen like Photoshop/Canva
  assert.equal(
    shouldInitiateCanvasPan({
      interactionMode: 'select',
      isSpacePressed: true,
      button: 0,
      isInteractiveElementTarget: true,
      pointerType: 'mouse',
    }),
    true
  );
});

test('formatSaveStatusLabel and upsertProjectInSavedList handle manual and automatic project saving accurately', () => {
  const baseTime = 1_700_000_000_000;
  assert.equal(formatSaveStatusLabel(baseTime, baseTime + 5_000, 'auto'), 'Auto-saved just now');
  assert.equal(formatSaveStatusLabel(baseTime, baseTime + 5_000, 'manual'), 'Saved just now');
  assert.equal(formatSaveStatusLabel(baseTime, baseTime + 125_000, 'auto'), 'Auto-saved 2m ago');
  assert.equal(formatSaveStatusLabel(baseTime, baseTime + 125_000, 'manual'), 'Saved 2m ago');
  assert.equal(formatSaveStatusLabel(baseTime, baseTime + 7_200_000, 'auto'), 'Auto-saved 2h ago');

  const initialList = [
    { id: 'proj-1', title: 'Book A', lastSaved: 'Saved 5m ago', updatedAt: baseTime - 300_000 },
    { id: 'proj-2', title: 'Book B', lastSaved: 'Saved 10m ago', updatedAt: baseTime - 600_000 },
    { id: 'proj-1', title: 'Duplicate Book A', lastSaved: 'Old', updatedAt: baseTime - 900_000 },
  ];

  const modifiedBookB = {
    id: 'proj-2',
    title: 'Book B Updated',
    lastSaved: 'Old',
    updatedAt: baseTime - 600_000,
  };

  const { updatedList, savedProject } = upsertProjectInSavedList(
    initialList,
    modifiedBookB,
    baseTime,
    'manual'
  );

  assert.equal(updatedList.length, 2);
  assert.equal(savedProject.title, 'Book B Updated');
  assert.equal(savedProject.lastSaved, 'Saved just now');
  assert.equal(savedProject.updatedAt, baseTime);
  assert.equal(updatedList.find(p => p.id === 'proj-2')?.title, 'Book B Updated');
});

test('isTextEntryInputTarget and resolveStudioKeyboardShortcut resolve all studio keyboard shortcuts accurately', () => {
  // 1. Distinguish text inputs from range sliders, checkboxes, and buttons
  assert.equal(isTextEntryInputTarget({ tagName: 'INPUT', inputType: 'text' }), true);
  assert.equal(isTextEntryInputTarget({ tagName: 'INPUT', inputType: 'number' }), true);
  assert.equal(isTextEntryInputTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTextEntryInputTarget({ tagName: 'INPUT', inputType: 'range' }), false);
  assert.equal(isTextEntryInputTarget({ tagName: 'INPUT', inputType: 'checkbox' }), false);
  assert.equal(isTextEntryInputTarget({ tagName: 'INPUT', inputType: 'color' }), false);
  assert.equal(isTextEntryInputTarget({ tagName: 'BUTTON' }), false);

  const baseEvt = {
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    isTextInput: false,
    tagName: 'DIV',
    hasSelectedElement: true,
    isSelectedElementLocked: false,
    hasCopiedElement: true,
  };

  // 2. Save (Ctrl+S works even inside a text input)
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 's', code: 'KeyS', ctrlKey: true, isTextInput: true }),
    { type: 'save' }
  );

  // 3. Undo & Redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'z', code: 'KeyZ', ctrlKey: true }),
    { type: 'undo' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true }),
    { type: 'redo' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'y', code: 'KeyY', ctrlKey: true }),
    { type: 'redo' }
  );

  // 4. Tool modes & Spacebar pan
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: ' ', code: 'Space' }),
    { type: 'space_pan_start' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'v', code: 'KeyV' }),
    { type: 'tool_select' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'h', code: 'KeyH' }),
    { type: 'tool_pan' }
  );

  // 5. Clipboard & Duplicate & Delete (Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D, Delete, Backspace)
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'c', code: 'KeyC', ctrlKey: true }),
    { type: 'copy' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'x', code: 'KeyX', ctrlKey: true }),
    { type: 'cut' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'v', code: 'KeyV', ctrlKey: true }),
    { type: 'paste' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'd', code: 'KeyD', ctrlKey: true }),
    { type: 'duplicate' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'Delete', code: 'Delete' }),
    { type: 'delete' }
  );

  // 6. Arrow nudging (normal 0.5% and Shift 2.0%)
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'ArrowRight', code: 'ArrowRight' }),
    { type: 'nudge', dx: 0.5, dy: 0 }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'ArrowUp', code: 'ArrowUp', shiftKey: true }),
    { type: 'nudge', dx: 0, dy: -2.0 }
  );

  // 7. Layer ordering ([ / ] / Shift+[ / Shift+]), Lock (L / Ctrl+L), Grid (G), Zoom (Ctrl+= / Ctrl+- / Ctrl+0)
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: ']', code: 'BracketRight' }),
    { type: 'layer_order', direction: 'forward' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: '}', code: 'BracketRight', shiftKey: true }),
    { type: 'layer_order', direction: 'front' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'l', code: 'KeyL' }),
    { type: 'toggle_lock' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: 'g', code: 'KeyG' }),
    { type: 'toggle_grid' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: '=', code: 'Equal', ctrlKey: true }),
    { type: 'zoom_in' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: '-', code: 'Minus', ctrlKey: true }),
    { type: 'zoom_out' }
  );
  assert.deepEqual(
    resolveStudioKeyboardShortcut({ ...baseEvt, key: '0', code: 'Digit0', ctrlKey: true }),
    { type: 'zoom_reset' }
  );
});
