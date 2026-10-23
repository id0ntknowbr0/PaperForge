import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { StudioBookProject, StudioPage, StudioElement } from '../types';
import {
  Download,
  Undo2,
  Redo2,
  Plus,
  Trash2,
  Square,
  Type,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  X,
  Search,
  Settings,
  Image as ImageIcon,
  Upload,
  AlertTriangle,
  Copy,
  FileText,
  SlidersHorizontal,
  LayoutGrid,
  Palette,
  Pencil,
  Play,
  Grid,
  Minus,
  FolderPlus,
  Lock,
  Unlock,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUp,
  ArrowDown,
  Layers,
  Magnet,
  GripVertical,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
  Eye,
  Hand,
  MousePointer,
  Move,
  Save,
} from 'lucide-react';
import {
  calculateCoverDimensions,
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
  IndexTemplateCategory,
  IndexTemplateStyle,
  IndexPageConfig,
  IndexEntryLink,
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
  CanvasInteractionMode,
  CanvasPanOffset,
  calculateCanvasPanDelta,
  calculatePinchZoomAndPan,
  shouldInitiateCanvasPan,
  formatSaveStatusLabel,
  upsertProjectInSavedList,
  isTextEntryInputTarget,
  resolveStudioKeyboardShortcut,
  PaperCoverPlacementTarget,
  PageBackgroundScope,
  MeasurementUnit,
} from '../utils/kdpMath';
import { generateInteriorPdf, generateCoverSpreadPdf } from '../utils/pdfGenerator';

const PAPER_BACKGROUND_SWATCHES = [
  { hex: '#FFFFFF', label: 'Pure White' },
  { hex: '#FAF8F5', label: 'KDP Cream' },
  { hex: '#FEFCE8', label: 'Warm Ivory' },
  { hex: '#F5F0E6', label: 'Parchment' },
  { hex: '#F8FAFC', label: 'Cool Slate' },
  { hex: '#F0FDF4', label: 'Soft Mint' },
  { hex: '#EFF6FF', label: 'Ice Blue' },
  { hex: '#FFF1F2', label: 'Blush Rose' },
  { hex: '#F5F3FF', label: 'Soft Lavender' },
  { hex: '#FFF7ED', label: 'Pale Peach' },
  { hex: '#EFE6D5', label: 'Kraft Tan' },
  { hex: '#1E293B', label: 'Dark Cover' },
];

interface MarginSettings {
  top: number; // stored in inches
  bottom: number;
  left: number;
  right: number;
}

const DEFAULT_COVER_ELEMENTS: StudioElement[] = [
  {
    id: 'elem-title',
    type: 'text',
    x: 56,
    y: 44,
    width: 38,
    height: 7,
    text: 'NOTEBOOK',
    fontSize: 28,
    fontFamily: 'Playfair Display, Georgia, serif',
    fontWeight: 'bold',
    fill: '#171923',
    textAlign: 'center',
    opacity: 1,
    locked: false,
  },
  {
    id: 'elem-divider',
    type: 'shape',
    shapeType: 'line',
    x: 70.5,
    y: 52.8,
    width: 9,
    height: 1.5,
    fill: 'none',
    stroke: '#171923',
    strokeWidth: 1.4,
    opacity: 1,
    locked: false,
  },
  {
    id: 'elem-subtitle',
    type: 'text',
    x: 56,
    y: 58,
    width: 38,
    height: 4,
    text: 'DAILY REFLECTIONS & NOTES',
    fontSize: 9,
    fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
    fontWeight: '600',
    fill: '#374151',
    textAlign: 'center',
    opacity: 1,
    locked: false,
  },
];

const TRIM_MAP: Record<string, { w: number; h: number; label: string }> = {
  '6x9': { w: 6.0, h: 9.0, label: '6" x 9" Book' },
  '5x8': { w: 5.0, h: 8.0, label: '5" x 8" Book' },
  '7x10': { w: 7.0, h: 10.0, label: '7" x 10" Book' },
  '8x10': { w: 8.0, h: 10.0, label: '8" x 10" Book' },
  '8.5x11': { w: 8.5, h: 11.0, label: '8.5" x 11" Book' },
  '8.25x8.25': { w: 8.25, h: 8.25, label: '8.25" x 8.25" Square' },
  custom: { w: 6.0, h: 9.0, label: 'Custom Size' },
};

function deepCloneProject(proj: StudioBookProject): StudioBookProject {
  return JSON.parse(JSON.stringify(proj));
}

function createDefaultProject(
  title = 'My First Book',
  trimSize: StudioBookProject['trimSize'] = '6x9',
  template = 'lined',
  id?: string,
  updatedAtOffsetMs = 0
): StudioBookProject {
  const preset = TRIM_MAP[trimSize] || TRIM_MAP['6x9'];
  return {
    id: id || `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    trimSize,
    customWidthIn: preset.w,
    customHeightIn: preset.h,
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    bleedInches: 0.125,
    pageCount: 24,
    bleed: true,
    paperType: 'white',
    binding: 'paperback',
    lastSaved: 'Saved 2 minutes ago',
    updatedAt: Date.now() - updatedAtOffsetMs,
    pages: [
      {
        id: 'page-cover',
        pageNumber: 1,
        isCover: true,
        name: 'Cover Spread',
        backgroundColor: '#FFFFFF',
        elements: DEFAULT_COVER_ELEMENTS.map(el => ({ ...el })),
      },
      ...Array.from({ length: 23 }, (_, i) => {
        const pageNum = i + 2;
        const isEven = pageNum % 2 === 0;
        return {
          id: `page-${pageNum}-${Math.random().toString(36).slice(2, 5)}`,
          pageNumber: pageNum,
          isEven,
          name: `Page ${pageNum}`,
          backgroundColor: '#FFFFFF',
          templateType: template,
          showPageNumber: true,
          elements: [],
        };
      }),
    ],
  };
}

const STORAGE_KEY = 'pageforge_saved_projects_v1';
const ACTIVE_PROJECT_ID_KEY = 'pageforge_active_project_id_v1';

export const StudioModule: React.FC = () => {
  // Top-level navigation view: 'editor' | 'dashboard'
  const [currentView, setCurrentView] = useState<'editor' | 'dashboard'>('editor');

  // Saved projects list with localStorage persistence and duplicate-ID sanitization
  const [savedProjects, setSavedProjects] = useState<StudioBookProject[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const seenIds = new Set<string>();
          return parsed.map((proj: StudioBookProject, index: number) => {
            let uniqueId = proj.id || `proj-seed-${index + 1}`;
            if (seenIds.has(uniqueId)) {
              uniqueId = `${uniqueId}-${index + 1}-${Math.random().toString(36).slice(2, 6)}`;
            }
            seenIds.add(uniqueId);
            const preset = TRIM_MAP[proj.trimSize] || TRIM_MAP['6x9'];
            const migratedPages = Array.isArray(proj.pages)
              ? proj.pages.map(pg => ({
                  ...pg,
                  elements: Array.isArray(pg.elements)
                    ? pg.elements.map(el => {
                        if (el.type !== 'image') return el;
                        const wasStoppedNearBottom =
                          el.y <= 6 && el.height >= 88 && el.height < 100 && el.width >= 45;
                        return {
                          ...el,
                          preserveAspectRatio: false,
                          ...(wasStoppedNearBottom
                            ? { y: 0, height: 100 }
                            : {}),
                        };
                      })
                    : [],
                }))
              : proj.pages;
            return {
              ...proj,
              id: uniqueId,
              pages: migratedPages,
              customWidthIn: proj.customWidthIn || preset.w,
              customHeightIn: proj.customHeightIn || preset.h,
              margins: proj.margins || { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
              bleedInches: typeof proj.bleedInches === 'number' ? proj.bleedInches : 0.125,
              updatedAt: proj.updatedAt || Date.now() - index * 60000,
            };
          });
        }
      }
    } catch {
      // ignore storage errors
    }
    return [
      createDefaultProject('My First Book', '6x9', 'lined', 'proj-seed-1', 120000),
      createDefaultProject('Daily Productivity Planner', '6x9', 'daily_planner', 'proj-seed-2', 360000),
      createDefaultProject('Dot Grid Bullet Journal', '8x10', 'dotgrid', 'proj-seed-3', 720000),
    ];
  });

  // Active Project State (restores last active project ID from localStorage when available)
  const [project, setProject] = useState<StudioBookProject>(() => {
    try {
      const savedActiveId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
      if (savedActiveId) {
        const matched = savedProjects.find(p => p.id === savedActiveId);
        if (matched) return deepCloneProject(matched);
      }
    } catch {
      // ignore storage errors
    }
    return deepCloneProject(savedProjects[0] || createDefaultProject());
  });

  // Undo / Redo History Stack
  const [history, setHistory] = useState<StudioBookProject[]>(() => [deepCloneProject(project)]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const historyRef = useRef<StudioBookProject[]>([deepCloneProject(project)]);
  const historyIndexRef = useRef<number>(0);
  const copiedElementRef = useRef<StudioElement | null>(null);

  // Page & Element Selection
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Drag-and-drop page reordering state
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);
  const [dragOverPageIndex, setDragOverPageIndex] = useState<number | null>(null);

  // Left Rail Active Tool: 'pages' | 'templates' | 'text' | 'elements' | 'images' | 'backgrounds' | 'settings'
  const [activeLeftTool, setActiveLeftTool] = useState<
    'pages' | 'templates' | 'text' | 'elements' | 'images' | 'backgrounds' | 'settings'
  >('pages');

  // Collapsible Side Panels State (Allows closing Left Pages/Drawer and Right Inspector to enlarge book canvas)
  const [leftPanelOpen, setLeftPanelOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  // Right Inspector Tab: 'design' | 'page'
  const [inspectorTab, setInspectorTab] = useState<'design' | 'page'>('design');

  // Units & Snapping state
  const [unit, setUnit] = useState<MeasurementUnit>('in');
  const [snapToGuides, setSnapToGuides] = useState<boolean>(true);
  const [batchPageCountToAdd, setBatchPageCountToAdd] = useState<number>(10);
  const [bulkPagesInput, setBulkPagesInput] = useState<number>(10);
  const [totalBookPagesInput, setTotalBookPagesInput] = useState<number>(24);
  const [backgroundApplyScope, setBackgroundApplyScope] = useState<PageBackgroundScope>('all_inner');
  const [selectedIndexStyle, setSelectedIndexStyle] = useState<IndexTemplateStyle>('index_classic');
  const [indexPagesCountToAdd, setIndexPagesCountToAdd] = useState<number>(1);
  const [selectedIndexCategory, setSelectedIndexCategory] = useState<'All' | IndexTemplateCategory>('All');
  const [indexSearchQuery, setIndexSearchQuery] = useState<string>('');
  const [indexConfigDraft, setIndexConfigDraft] = useState<IndexPageConfig>(() =>
    getDefaultIndexConfig('index_classic')
  );
  const [indexConfigExpanded, setIndexConfigExpanded] = useState<boolean>(true);
  const [indexPreviewModalOpen, setIndexPreviewModalOpen] = useState<boolean>(false);
  const [indexModalPreviewPageIdx, setIndexModalPreviewPageIdx] = useState<number>(0);
  const [indexBuilderStep, setIndexBuilderStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [indexShiftConfirmPending, setIndexShiftConfirmPending] = useState<{
    style: IndexTemplateStyle;
    count: number;
    config: IndexPageConfig;
    warningMessage: string;
    affectedPageNumbers: number[];
  } | null>(null);
  const lastIndexInsertTimeRef = useRef<number>(0);

  // Bottom Workspace Bar Controls
  const [spreadMode, setSpreadMode] = useState<'full' | 'single'>('full');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [gridEnabled, setGridEnabled] = useState<boolean>(false);
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [showBarcodeGuide, setShowBarcodeGuide] = useState<boolean>(false);

  // Modals, Confirmations & Popovers
  const [downloadDropdownOpen, setDownloadDropdownOpen] = useState<boolean>(false);
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [previewPageIndex, setPreviewPageIndex] = useState<number>(0);
  const [previewViewMode, setPreviewViewMode] = useState<'spread' | 'front_cover' | 'cover_and_interior'>('spread');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<number>(() => project.updatedAt || Date.now());
  const [lastSaveMode, setLastSaveMode] = useState<'auto' | 'manual'>('auto');
  const [justManuallySaved, setJustManuallySaved] = useState<boolean>(false);
  const [saveStatusText, setSaveStatusText] = useState<string>(() =>
    formatSaveStatusLabel(Date.now(), Date.now(), 'auto')
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const projectRef = useRef<StudioBookProject>(project);
  const lastSavedAtRef = useRef<number>(Date.now());
  const lastSaveModeRef = useRef<'auto' | 'manual'>('auto');
  const manualSaveTimerRef = useRef<number | null>(null);

  // Dashboard Project Management State (Search, Sort, Rename, Delete Confirmation)
  const [dashboardSearch, setDashboardSearch] = useState<string>('');
  const [dashboardSort, setDashboardSort] = useState<'recent' | 'name' | 'pages'>('recent');
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<string | null>(null);

  // Drawer Filters
  const [templateApplyScope, setTemplateApplyScope] = useState<'current' | 'all' | 'batch'>('current');
  const [templateSearchTerm, setTemplateSearchTerm] = useState<string>('');
  const [shapeSearchTerm, setShapeSearchTerm] = useState<string>('');

  // Interactive Drag & Resize state + Pointer-Anchored Floating Menu Position
  const [draggingElemId, setDraggingElemId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [resizingHandle, setResizingHandle] = useState<string | null>(null);
  const [resizeInitial, setResizeInitial] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [floatingMenuPos, setFloatingMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [workspaceSize, setWorkspaceSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [canvasToolMode, setCanvasToolMode] = useState<CanvasInteractionMode>('select');
  const [isSpacePanning, setIsSpacePanning] = useState<boolean>(false);
  const [panOffset, setPanOffset] = useState<CanvasPanOffset>({ x: 0, y: 0 });
  const [isPanningCanvas, setIsPanningCanvas] = useState<boolean>(false);
  const [activePointerType, setActivePointerType] = useState<'mouse' | 'pen' | 'touch'>('mouse');

  const canvasSvgRef = useRef<SVGSVGElement | null>(null);
  const workspaceContainerRef = useRef<HTMLDivElement | null>(null);
  const workspaceScrollViewportRef = useRef<HTMLDivElement | null>(null);
  const floatingMenuRef = useRef<HTMLDivElement | null>(null);
  const lastPointerClickRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const hasLiveTransformChangesRef = useRef<boolean>(false);
  const panOffsetRef = useRef<CanvasPanOffset>({ x: 0, y: 0 });
  const zoomLevelRef = useRef<number>(100);
  const suppressNextClickDeselectRef = useRef<boolean>(false);

  const activePanRef = useRef<{
    pointerId?: number;
    startClientX: number;
    startClientY: number;
    initialPan: CanvasPanOffset;
    hasMovedThreshold: boolean;
  } | null>(null);

  const activePinchRef = useRef<{
    startDistance: number;
    startCenterX: number;
    startCenterY: number;
    initialZoom: number;
    initialPan: CanvasPanOffset;
  } | null>(null);

  const activeResizeRef = useRef<{
    elemId: string;
    handle: string;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
    mouseX: number;
    mouseY: number;
    lockAspectRatio: boolean;
  } | null>(null);

  const activeDragRef = useRef<{
    elemId: string;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);

  const activePage = project.pages[activePageIndex] || project.pages[0];
  const isEditingCover = activePage.isCover === true;
  const isEffectivePanMode = canvasToolMode === 'pan' || isSpacePanning;

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  // Measure actual workspace viewport dimensions so 100% zoom fits any screen height/width (high or low)
  useEffect(() => {
    const el = workspaceScrollViewportRef.current;
    if (!el) return;
    let lastWinW = window.innerWidth;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setWorkspaceSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    };
    measure();
    const onWinResize = () => {
      if (lastWinW >= 768 && window.innerWidth < 768) {
        setLeftPanelOpen(false);
        setRightPanelOpen(false);
      }
      lastWinW = window.innerWidth;
      measure();
    };
    window.addEventListener('resize', onWinResize);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => measure());
      observer.observe(el);
      return () => {
        observer.disconnect();
        window.removeEventListener('resize', onWinResize);
      };
    } else {
      return () => window.removeEventListener('resize', onWinResize);
    }
  }, [currentView, leftPanelOpen, rightPanelOpen, activeLeftTool]);

  // Derived project-scoped dimensions, margins, and bleed
  const currentTrim = useMemo(() => {
    const preset = TRIM_MAP[project.trimSize] || TRIM_MAP['6x9'];
    return {
      w: project.customWidthIn || preset.w || 6.0,
      h: project.customHeightIn || preset.h || 9.0,
    };
  }, [project.customWidthIn, project.customHeightIn, project.trimSize]);

  const margins: MarginSettings = useMemo(() => {
    return project.margins || { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 };
  }, [project.margins]);

  const bleedInches = useMemo(() => {
    return typeof project.bleedInches === 'number' ? project.bleedInches : 0.125;
  }, [project.bleedInches]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2600);
  }, []);

  // Synchronously persist active project to savedProjects list and localStorage
  const persistProjectToStorage = useCallback(
    (targetProject: StudioBookProject, mode: 'auto' | 'manual' = 'auto') => {
      const now = Date.now();
      const statusLabel = formatSaveStatusLabel(now, now, mode);
      projectRef.current = targetProject;
      lastSavedAtRef.current = now;
      lastSaveModeRef.current = mode;
      setLastSavedAt(now);
      setLastSaveMode(mode);
      setSaveStatusText(statusLabel);

      setSavedProjects(prev => {
        const { updatedList } = upsertProjectInSavedList(prev, targetProject, now, mode);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
          localStorage.setItem(ACTIVE_PROJECT_ID_KEY, targetProject.id);
        } catch {
          // ignore quota errors
        }
        return updatedList;
      });
    },
    []
  );

  // Manual Save handler (triggered by Save button near Preview or Ctrl/Cmd+S)
  const handleManualSave = useCallback(() => {
    const now = Date.now();
    const stampedProject: StudioBookProject = {
      ...deepCloneProject(projectRef.current),
      lastSaved: 'Saved just now',
      updatedAt: now,
    };
    setProject(stampedProject);
    persistProjectToStorage(stampedProject, 'manual');
    setJustManuallySaved(true);
    if (manualSaveTimerRef.current) {
      window.clearTimeout(manualSaveTimerRef.current);
    }
    manualSaveTimerRef.current = window.setTimeout(() => {
      setJustManuallySaved(false);
    }, 1600);
    showToast(`Saved "${stampedProject.title}"`);
  }, [persistProjectToStorage, showToast]);

  const commitHistorySnapshot = useCallback((snapshot: StudioBookProject) => {
    const sliced = historyRef.current.slice(0, historyIndexRef.current + 1);
    const nextHistory = [...sliced.slice(-29), deepCloneProject(snapshot)];
    const nextIdx = nextHistory.length - 1;
    historyRef.current = nextHistory;
    historyIndexRef.current = nextIdx;
    setHistory(nextHistory);
    setHistoryIndex(nextIdx);
  }, []);

  const resetHistoryWithProject = useCallback((initialProj: StudioBookProject) => {
    const initialHistory = [deepCloneProject(initialProj)];
    historyRef.current = initialHistory;
    historyIndexRef.current = 0;
    setHistory(initialHistory);
    setHistoryIndex(0);
  }, []);

  // Commit project state with history & autosave
  const updateProjectWithHistory = useCallback(
    (updater: (prev: StudioBookProject) => StudioBookProject) => {
      const now = Date.now();
      const baseProj = deepCloneProject(projectRef.current);
      const updated = updater(baseProj);
      const next: StudioBookProject = {
        ...updated,
        lastSaved: 'Auto-saved just now',
        updatedAt: now,
      };
      projectRef.current = next;
      setProject(next);
      commitHistorySnapshot(next);
      lastSavedAtRef.current = now;
      lastSaveModeRef.current = 'auto';
      setLastSavedAt(now);
      setLastSaveMode('auto');
      setSaveStatusText('Auto-saved just now');
    },
    [commitHistorySnapshot]
  );

  // Auto-save whenever active project changes
  useEffect(() => {
    projectRef.current = project;
    const modeToUse = lastSaveModeRef.current === 'manual' && justManuallySaved ? 'manual' : 'auto';
    persistProjectToStorage(project, modeToUse);
  }, [project, persistProjectToStorage, justManuallySaved]);

  // Keep relative save status updated every 15s and flush to localStorage on tab hide / beforeunload
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSaveStatusText(
        formatSaveStatusLabel(lastSavedAtRef.current, Date.now(), lastSaveModeRef.current)
      );
    }, 15_000);

    const flushOnLeave = () => {
      try {
        const latestProj = projectRef.current;
        if (!latestProj) return;
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        const baseList = Array.isArray(parsed) ? parsed : [];
        const { updatedList } = upsertProjectInSavedList(
          baseList,
          latestProj,
          lastSavedAtRef.current || Date.now(),
          lastSaveModeRef.current
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
        localStorage.setItem(ACTIVE_PROJECT_ID_KEY, latestProj.id);
      } catch {
        // ignore storage errors
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushOnLeave();
      }
    };

    window.addEventListener('beforeunload', flushOnLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('beforeunload', flushOnLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Keep totalBookPagesInput synced with active project's page count
  useEffect(() => {
    setTotalBookPagesInput(project.pages.length);
  }, [project.pages.length]);

  // Undo & Redo handlers
  const handleUndo = useCallback(() => {
    const curIdx = historyIndexRef.current;
    const curHist = historyRef.current;
    if (curIdx > 0 && curHist[curIdx - 1]) {
      const nextIdx = curIdx - 1;
      const restored = deepCloneProject(curHist[nextIdx]);
      historyIndexRef.current = nextIdx;
      setHistoryIndex(nextIdx);
      projectRef.current = restored;
      setProject(restored);
      setActivePageIndex(prevIdx => Math.min(prevIdx, Math.max(0, restored.pages.length - 1)));
      setSaveStatusText('Undo applied');
      showToast('Undid last change');
    } else {
      showToast('Nothing to undo');
    }
  }, [showToast]);

  const handleRedo = useCallback(() => {
    const curIdx = historyIndexRef.current;
    const curHist = historyRef.current;
    if (curIdx < curHist.length - 1 && curHist[curIdx + 1]) {
      const nextIdx = curIdx + 1;
      const restored = deepCloneProject(curHist[nextIdx]);
      historyIndexRef.current = nextIdx;
      setHistoryIndex(nextIdx);
      projectRef.current = restored;
      setProject(restored);
      setActivePageIndex(prevIdx => Math.min(prevIdx, Math.max(0, restored.pages.length - 1)));
      setSaveStatusText('Redo applied');
      showToast('Redid change');
    } else {
      showToast('Nothing to redo');
    }
  }, [showToast]);

  // Selected element lookup
  const selectedElement = useMemo(() => {
    return activePage.elements.find(e => e.id === selectedElementId) || null;
  }, [activePage, selectedElementId]);

  const handleTrimPresetChange = (newTrim: StudioBookProject['trimSize']) => {
    const preset = TRIM_MAP[newTrim];
    updateProjectWithHistory(prev => ({
      ...prev,
      trimSize: newTrim,
      customWidthIn: preset ? preset.w : prev.customWidthIn || 6,
      customHeightIn: preset ? preset.h : prev.customHeightIn || 9,
    }));
    showToast(`Page size set to ${preset?.label || newTrim}`);
  };

  const handleCustomDimensionChange = (axis: 'w' | 'h', valueInInches: number) => {
    const clamped = Math.max(4, Math.min(14, Number(valueInInches.toFixed(3))));
    updateProjectWithHistory(prev => ({
      ...prev,
      trimSize: 'custom',
      customWidthIn: axis === 'w' ? clamped : prev.customWidthIn || currentTrim.w,
      customHeightIn: axis === 'h' ? clamped : prev.customHeightIn || currentTrim.h,
    }));
  };

  const handleMarginChange = (side: keyof MarginSettings, valueInInches: number) => {
    const clamped = Math.max(0, Math.min(3, Number(valueInInches.toFixed(3))));
    updateProjectWithHistory(prev => ({
      ...prev,
      margins: {
        ...(prev.margins || { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }),
        [side]: clamped,
      },
    }));
  };

  const handleBleedChange = (valueInInches: number) => {
    const clamped = Math.max(0, Math.min(0.5, Number(valueInInches.toFixed(3))));
    updateProjectWithHistory(prev => ({
      ...prev,
      bleedInches: clamped,
      bleed: clamped > 0,
    }));
  };

  const coverSpecs = useMemo(() => {
    const base = calculateCoverDimensions({
      trimWidth: currentTrim.w,
      trimHeight: currentTrim.h,
      pageCount: Math.max(24, project.pages.length),
      paperType: project.paperType,
      isHardcover: project.binding === 'hardcover',
    });
    const activeBleed = bleedInches >= 0 ? bleedInches : base.bleedMargin;
    const totalWidth = Number((activeBleed * 2 + currentTrim.w * 2 + base.spineWidth).toFixed(4));
    const totalHeight = Number((activeBleed * 2 + currentTrim.h).toFixed(4));
    return {
      ...base,
      bleedMargin: activeBleed,
      totalWidth,
      totalHeight,
    };
  }, [currentTrim, project.pages.length, project.paperType, project.binding, bleedInches]);

  // Dynamic base scale (pixels per inch) that fits the book spread/page to any high or low screen size at 100% zoom
  const baseScalePxPerIn = useMemo(() => {
    const isSpreadView = isEditingCover || spreadMode === 'full';
    return calculateCanvasBaseScale({
      leftPanelOpen,
      leftToolDrawerOpen: leftPanelOpen && activeLeftTool !== 'pages',
      rightPanelOpen,
      isSpread: isSpreadView,
      viewportWidthPx: workspaceSize.width,
      viewportHeightPx: workspaceSize.height,
      canvasWidthIn: isSpreadView ? coverSpecs.totalWidth : currentTrim.w,
      canvasHeightIn: isSpreadView ? coverSpecs.totalHeight : currentTrim.h,
    });
  }, [
    leftPanelOpen,
    activeLeftTool,
    rightPanelOpen,
    isEditingCover,
    spreadMode,
    workspaceSize.width,
    workspaceSize.height,
    coverSpecs.totalWidth,
    coverSpecs.totalHeight,
    currentTrim.w,
    currentTrim.h,
  ]);

  // Effective rendered scale combining viewport-fitted base scale and user zoom percentage
  const effectiveScalePxPerIn = useMemo(() => {
    return Number((baseScalePxPerIn * (zoomLevel / 100)).toFixed(2));
  }, [baseScalePxPerIn, zoomLevel]);

  // Alt + MouseWheel or Trackpad Pinch Zoom handler
  const handleWorkspaceWheel = useCallback((e: React.WheelEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoomLevel(prev => calculateNextZoomOnWheel(prev, e.deltaY, true, 25, 250, 10));
    }
  }, []);

  const handleResetCanvasView = useCallback(() => {
    setZoomLevel(100);
    zoomLevelRef.current = 100;
    setPanOffset({ x: 0, y: 0 });
    panOffsetRef.current = { x: 0, y: 0 };
  }, []);

  // Live 4-Way Alignment & Measurement Data for Selected Element
  const measurementData = useMemo(() => {
    if (!selectedElement) return null;
    const isTwoPageCanvas = isEditingCover || spreadMode === 'full';
    const canvasWidthInches = isEditingCover
      ? coverSpecs.totalWidth
      : isTwoPageCanvas
      ? currentTrim.w * 2
      : currentTrim.w;
    const canvasHeightInches = isEditingCover ? coverSpecs.totalHeight : currentTrim.h;

    const posXInches = Number(((selectedElement.x / 100) * canvasWidthInches).toFixed(3));
    const posYInches = Number(((selectedElement.y / 100) * canvasHeightInches).toFixed(3));
    const widthInches = Number(((selectedElement.width / 100) * canvasWidthInches).toFixed(3));
    const heightInches = Number(((selectedElement.height / 100) * canvasHeightInches).toFixed(3));

    const posXUnit = convertInchesToUnit(posXInches, unit);
    const posYUnit = convertInchesToUnit(posYInches, unit);
    const widthUnit = convertInchesToUnit(widthInches, unit);
    const heightUnit = convertInchesToUnit(heightInches, unit);

    const distTopInches = posYInches;
    const distBottomInches = Number((canvasHeightInches - (posYInches + heightInches)).toFixed(3));
    const distLeftInches = posXInches;
    const distRightInches = Number((canvasWidthInches - (posXInches + widthInches)).toFixed(3));

    const spineLeftX = coverSpecs.bleedMargin + currentTrim.w;
    const spineRightX = spineLeftX + coverSpecs.spineWidth;
    let distToSpine = 0;
    let locationZone = 'Page Canvas';

    if (isEditingCover) {
      if (posXInches + widthInches <= spineLeftX) {
        locationZone = 'Left / Back Cover';
        distToSpine = Number((spineLeftX - (posXInches + widthInches)).toFixed(3));
      } else if (posXInches >= spineRightX) {
        locationZone = 'Right / Front Cover';
        distToSpine = Number((posXInches - spineRightX).toFixed(3));
      } else {
        locationZone = 'Center Spine';
        distToSpine = 0;
      }
    }

    const barcodeX = coverSpecs.bleedMargin + currentTrim.w - 2.2;
    const barcodeY = coverSpecs.totalHeight - coverSpecs.bleedMargin - 1.4;
    const overlapsBarcode =
      isEditingCover &&
      showBarcodeGuide &&
      posXInches < barcodeX + 2.0 &&
      posXInches + widthInches > barcodeX &&
      posYInches < barcodeY + 1.2 &&
      posYInches + heightInches > barcodeY;

    const isOutsideSafeMargin =
      posXInches < margins.left ||
      posYInches < margins.top ||
      posXInches + widthInches > canvasWidthInches - margins.right ||
      posYInches + heightInches > canvasHeightInches - margins.bottom;

    let isCenteredH = false;
    if (isEditingCover) {
      const frontCenter = spineRightX + currentTrim.w / 2;
      const backCenter = coverSpecs.bleedMargin + currentTrim.w / 2;
      const elemCenter = posXInches + widthInches / 2;
      isCenteredH = Math.abs(elemCenter - frontCenter) < 0.08 || Math.abs(elemCenter - backCenter) < 0.08;
    } else {
      const pageCenter = canvasWidthInches / 2;
      const elemCenter = posXInches + widthInches / 2;
      isCenteredH = Math.abs(elemCenter - pageCenter) < 0.08;
    }

    return {
      posXInches,
      posYInches,
      widthInches,
      heightInches,
      posXUnit,
      posYUnit,
      widthUnit,
      heightUnit,
      distTopUnit: convertInchesToUnit(distTopInches, unit),
      distBottomUnit: convertInchesToUnit(distBottomInches, unit),
      distLeftUnit: convertInchesToUnit(distLeftInches, unit),
      distRightUnit: convertInchesToUnit(distRightInches, unit),
      distToSpineUnit: convertInchesToUnit(distToSpine, unit),
      locationZone,
      overlapsBarcode,
      isOutsideSafeMargin,
      isCenteredH,
    };
  }, [selectedElement, isEditingCover, spreadMode, coverSpecs, currentTrim, unit, showBarcodeGuide, margins]);

  // Pre-Flight Validation Report for PDF Export
  const kdpValidationReport = useMemo(() => {
    const interiorPages = project.pages.filter(p => !p.isCover);
    let outsideCount = 0;
    let barcodeOverlapCount = 0;

    project.pages.forEach(p => {
      const wIn = p.isCover ? coverSpecs.totalWidth : currentTrim.w;
      const hIn = p.isCover ? coverSpecs.totalHeight : currentTrim.h;
      const barcodeX = coverSpecs.bleedMargin + currentTrim.w - 2.2;
      const barcodeY = coverSpecs.totalHeight - coverSpecs.bleedMargin - 1.4;

      p.elements.forEach(el => {
        const xIn = (el.x / 100) * wIn;
        const yIn = (el.y / 100) * hIn;
        const elWIn = (el.width / 100) * wIn;
        const elHIn = (el.height / 100) * hIn;
        if (
          xIn < margins.left * 0.5 ||
          yIn < margins.top * 0.5 ||
          xIn + elWIn > wIn - margins.right * 0.5 ||
          yIn + elHIn > hIn - margins.bottom * 0.5
        ) {
          outsideCount++;
        }
        if (
          p.isCover &&
          showBarcodeGuide &&
          xIn < barcodeX + 2.0 &&
          xIn + elWIn > barcodeX &&
          yIn < barcodeY + 1.2 &&
          yIn + elHIn > barcodeY
        ) {
          barcodeOverlapCount++;
        }
      });
    });

    return validateProjectForKdpExport({
      trimWidthIn: currentTrim.w,
      trimHeightIn: currentTrim.h,
      interiorPageCount: interiorPages.length,
      bleedInches,
      margins,
      elementsOutsideMarginsCount: outsideCount,
      elementsOverlappingBarcodeCount: barcodeOverlapCount,
    });
  }, [project.pages, coverSpecs, currentTrim, bleedInches, margins, showBarcodeGuide]);

  // Add Page
  const handleAddPage = (afterIndex?: number, templateTypeOverride?: string) => {
    const newPageNum = project.pages.length + 1;
    const defaultTemplate =
      templateTypeOverride ||
      (!activePage.isCover && activePage.templateType ? activePage.templateType : 'lined');

    const defaultBg =
      (!activePage.isCover && activePage.backgroundColor) ||
      project.pages.find(p => !p.isCover)?.backgroundColor ||
      '#FFFFFF';

    const newPage: StudioPage = {
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pageNumber: newPageNum,
      isEven: newPageNum % 2 === 0,
      name: `Page ${newPageNum}`,
      backgroundColor: defaultBg,
      templateType: defaultTemplate,
      showPageNumber: true,
      elements: [],
    };

    updateProjectWithHistory(prev => {
      const updated = [...prev.pages];
      if (typeof afterIndex === 'number') {
        updated.splice(afterIndex + 1, 0, newPage);
      } else {
        updated.push(newPage);
      }
      const reindexed = updated.map((p, idx) => ({
        ...p,
        pageNumber: idx + 1,
        isEven: (idx + 1) % 2 === 0,
        name: p.isCover ? 'Cover Spread' : p.name.startsWith('Page ') ? `Page ${idx + 1}` : p.name,
      }));
      const synced = syncLinkedIndexPagesInBook(reindexed, margins, currentTrim.w, currentTrim.h);
      return { ...prev, pageCount: synced.length, pages: synced };
    });
    if (typeof afterIndex === 'number') {
      setActivePageIndex(afterIndex + 1);
    } else {
      setActivePageIndex(project.pages.length);
    }
    showToast(`Added Page ${newPageNum}`);
  };

  // Bulk Add N Interior Pages to the Book
  const handleBulkAddPages = (countToAddOverride?: number) => {
    const rawCount = typeof countToAddOverride === 'number' ? countToAddOverride : bulkPagesInput;
    const safeCount = Math.max(1, Math.min(500, Math.floor(Number(rawCount) || 1)));
    const targetTemplate = !activePage.isCover && activePage.templateType ? activePage.templateType : undefined;
    const targetBg = !activePage.isCover && activePage.backgroundColor ? activePage.backgroundColor : undefined;

    const newTotal = project.pages.length + safeCount;
    updateProjectWithHistory(prev => {
      const nextPages = bulkAddInteriorPages({
        pages: prev.pages,
        countToAdd: safeCount,
        templateType: targetTemplate,
        backgroundColor: targetBg,
      });
      return {
        ...prev,
        pageCount: nextPages.length,
        pages: nextPages,
      };
    });
    setTotalBookPagesInput(newTotal);
    showToast(`Bulk added ${safeCount} inner pages (Total: ${newTotal} pages)`);
  };

  // Set Total Number of Pages in the Book
  const handleSetTotalBookPages = (targetTotalOverride?: number) => {
    const rawTarget = typeof targetTotalOverride === 'number' ? targetTotalOverride : totalBookPagesInput;
    const clampedTarget = Math.max(2, Math.min(828, Math.floor(Number(rawTarget) || 24)));
    const targetTemplate = !activePage.isCover && activePage.templateType ? activePage.templateType : undefined;
    const targetBg = !activePage.isCover && activePage.backgroundColor ? activePage.backgroundColor : undefined;

    updateProjectWithHistory(prev => {
      const nextPages = setBookTotalPageCount({
        pages: prev.pages,
        targetTotalPages: clampedTarget,
        templateType: targetTemplate,
        backgroundColor: targetBg,
      });
      return {
        ...prev,
        pageCount: nextPages.length,
        pages: nextPages,
      };
    });
    setTotalBookPagesInput(clampedTarget);
    setActivePageIndex(prevIdx => Math.min(prevIdx, clampedTarget - 1));
    showToast(`Book total set to ${clampedTarget} pages (${clampedTarget - 1} inner pages + Cover)`);
  };

  // Change Background Color of One Inner Page, All Inner Pages, or All Pages
  const handleApplyPageBackground = (
    colorHex: string,
    scopeOverride?: PageBackgroundScope,
    swatchLabel?: string
  ) => {
    const effectiveScope = scopeOverride || backgroundApplyScope;
    // If scope is 'current' ("1 Inner Page") while user is on Cover (index 0), target the first inner page (index 1)
    const targetIndex =
      effectiveScope === 'current' && activePageIndex === 0 && project.pages.length > 1
        ? 1
        : activePageIndex;

    updateProjectWithHistory(prev => {
      const nextPages = applyPageBackgroundColor(prev.pages, targetIndex, colorHex, effectiveScope);
      return {
        ...prev,
        pages: nextPages,
      };
    });

    if ((effectiveScope === 'all_inner' || effectiveScope === 'current') && activePageIndex === 0 && project.pages.length > 1) {
      setActivePageIndex(1);
    }

    const colorName =
      swatchLabel ||
      PAPER_BACKGROUND_SWATCHES.find(s => s.hex.toLowerCase() === colorHex.toLowerCase())?.label ||
      colorHex;

    if (effectiveScope === 'all_inner') {
      showToast(`Applied ${colorName} background to all inner pages`);
    } else if (effectiveScope === 'all_pages') {
      showToast(`Applied ${colorName} background to all book pages`);
    } else {
      showToast(`Applied ${colorName} background to Page ${targetIndex + 1}`);
    }
  };

  // Duplicate Page
  const handleDuplicatePage = (indexToDup: number) => {
    const sourcePage = project.pages[indexToDup];
    if (!sourcePage) return;
    if (sourcePage.isCover) {
      showToast('Cover spread cannot be duplicated as an interior page');
      return;
    }

    const clonedElements: StudioElement[] = sourcePage.elements.map(el => ({
      ...el,
      id: `elem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    }));

    const duplicatedPage: StudioPage = {
      ...sourcePage,
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      isCover: false,
      elements: clonedElements,
    };

    updateProjectWithHistory(prev => {
      const updated = [...prev.pages];
      updated.splice(indexToDup + 1, 0, duplicatedPage);
      const reindexed = updated.map((p, idx) => ({
        ...p,
        pageNumber: idx + 1,
        isEven: (idx + 1) % 2 === 0,
        name: p.isCover ? 'Cover Spread' : p.name.startsWith('Page ') ? `Page ${idx + 1}` : p.name,
      }));
      const synced = syncLinkedIndexPagesInBook(reindexed, margins, currentTrim.w, currentTrim.h);
      return { ...prev, pageCount: synced.length, pages: synced };
    });
    setActivePageIndex(indexToDup + 1);
    showToast(`Duplicated Page ${indexToDup + 1}`);
  };

  // Reorder Page (via drag-and-drop or up/down buttons)
  const handleReorderPage = (fromIndex: number, toIndex: number) => {
    if (fromIndex <= 0 || toIndex <= 0 || fromIndex === toIndex || toIndex >= project.pages.length) return;
    updateProjectWithHistory(prev => {
      const reordered = reorderPagesList(prev.pages, fromIndex, toIndex);
      return { ...prev, pages: reordered };
    });
    setActivePageIndex(toIndex);
    showToast(`Moved page to position ${toIndex + 1}`);
  };

  // Delete Page
  const handleDeletePage = (indexToDelete: number) => {
    if (project.pages[indexToDelete]?.isCover) {
      showToast('Cover spread cannot be deleted');
      return;
    }
    if (project.pages.length <= 2) {
      showToast('Book must retain at least 1 interior page');
      return;
    }
    updateProjectWithHistory(prev => {
      const filtered = prev.pages.filter((_, idx) => idx !== indexToDelete);
      const reindexed = filtered.map((p, idx) => ({
        ...p,
        pageNumber: idx + 1,
        isEven: (idx + 1) % 2 === 0,
        name: p.isCover ? 'Cover Spread' : p.name.startsWith('Page ') ? `Page ${idx + 1}` : p.name,
      }));
      const synced = syncLinkedIndexPagesInBook(reindexed, margins, currentTrim.w, currentTrim.h);
      return { ...prev, pageCount: synced.length, pages: synced };
    });
    setActivePageIndex(prev => Math.max(0, Math.min(prev, project.pages.length - 2)));
    setSelectedElementId(null);
    showToast('Page deleted');
  };

  // Apply Interior Template (Single Page, All Interior Pages, or Generate Multiple Pages)
  const handleApplyTemplate = (templateKey: string) => {
    if (templateApplyScope === 'batch') {
      const count = Math.max(1, Math.min(120, batchPageCountToAdd));
      updateProjectWithHistory(prev => {
        const newPages: StudioPage[] = Array.from({ length: count }, (_, i) => ({
          id: `page-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          pageNumber: prev.pages.length + i + 1,
          isEven: (prev.pages.length + i + 1) % 2 === 0,
          name: `Page ${prev.pages.length + i + 1}`,
          backgroundColor: '#FFFFFF',
          templateType: templateKey,
          showPageNumber: true,
          elements: [],
        }));
        const combined = [...prev.pages, ...newPages].map((p, idx) => ({
          ...p,
          pageNumber: idx + 1,
          isEven: (idx + 1) % 2 === 0,
          name: p.isCover ? 'Cover Spread' : p.name.startsWith('Page ') ? `Page ${idx + 1}` : p.name,
        }));
        return { ...prev, pageCount: combined.length, pages: combined };
      });
      setActivePageIndex(project.pages.length);
      showToast(`Generated ${count} new ${templateKey.replace('_', ' ')} pages`);
      return;
    }

    updateProjectWithHistory(prev => {
      const targetIndex = activePageIndex === 0 ? 1 : activePageIndex;
      const updatedPages = prev.pages.map((p, idx) => {
        if (p.isCover) return p;
        // When applying a regular template to 'all' pages, preserve any dedicated Index pages right after the Front Cover
        if (
          templateApplyScope === 'all' &&
          !isIndexTemplateType(templateKey) &&
          isIndexTemplateType(p.templateType) &&
          idx !== targetIndex
        ) {
          return p;
        }
        if (templateApplyScope === 'all' || idx === targetIndex) {
          return { ...p, templateType: templateKey };
        }
        return p;
      });
      return { ...prev, pages: updatedPages };
    });
    if (isIndexTemplateType(templateKey)) {
      setSelectedIndexStyle(templateKey as IndexTemplateStyle);
    }
    if (activePageIndex === 0) {
      setActivePageIndex(1);
    }
    showToast(
      templateApplyScope === 'all'
        ? `Applied ${templateKey.replace('_', ' ')} to all interior pages`
        : `Applied ${templateKey.replace('_', ' ')} to page`
    );
  };

  // Update Active Page Elements
  const updateActivePageElements = useCallback(
    (elements: StudioElement[]) => {
      updateProjectWithHistory(prev => {
        const updatedPages = [...prev.pages];
        updatedPages[activePageIndex] = { ...updatedPages[activePageIndex], elements };
        return { ...prev, pages: updatedPages };
      });
    },
    [activePageIndex, updateProjectWithHistory]
  );

  // Sync indexConfigDraft when switching to an existing Index Page on canvas
  useEffect(() => {
    if (!activePage.isCover && isIndexTemplateType(activePage.templateType)) {
      const style = (activePage.templateType === 'index'
        ? 'index_classic'
        : activePage.templateType) as IndexTemplateStyle;
      setSelectedIndexStyle(style);
      const cfg = activePage.indexConfig
        ? { ...getDefaultIndexConfig(style), ...activePage.indexConfig, templateId: style }
        : getDefaultIndexConfig(style);
      setIndexConfigDraft(cfg);
      setIndexPagesCountToAdd(cfg.pageCount || 1);
    }
  }, [activePageIndex, activePage.id, activePage.isCover, activePage.templateType]);

  // Update Index Template Configuration Draft (and live-sync to activePage if activePage is an Index Page)
  const handleUpdateIndexConfigDraft = useCallback(
    (partial: Partial<IndexPageConfig>) => {
      setIndexConfigDraft(prev => {
        const normalizedPartial: Partial<IndexPageConfig> = { ...partial };
        if (typeof partial.showPageNumberCol === 'boolean') {
          normalizedPartial.showPageNumbersColumn = partial.showPageNumberCol;
        }
        if (typeof partial.showPageNumbersColumn === 'boolean') {
          normalizedPartial.showPageNumberCol = partial.showPageNumbersColumn;
        }
        if (typeof partial.showDateField === 'boolean') {
          normalizedPartial.showDateColumn = partial.showDateField;
        }
        if (typeof partial.showStatusField === 'boolean') {
          normalizedPartial.showStatusColumn = partial.showStatusField;
        }
        if (typeof partial.showCategoryField === 'boolean') {
          normalizedPartial.showCategoryColumn = partial.showCategoryField;
        }
        if (typeof partial.customRangeStart === 'number') {
          normalizedPartial.numberedRangeStart = partial.customRangeStart;
        }
        if (typeof partial.customRangeEnd === 'number') {
          normalizedPartial.numberedRangeEnd = partial.customRangeEnd;
        }
        if (partial.letterGroupMode) {
          normalizedPartial.azLetterGrouping = partial.letterGroupMode;
        }
        if (typeof partial.linesPerSection === 'number') {
          normalizedPartial.azLinesPerGroup = partial.linesPerSection;
        }
        const next: IndexPageConfig = {
          ...prev,
          ...normalizedPartial,
        };
        if (typeof partial.pageCount === 'number') {
          setIndexPagesCountToAdd(partial.pageCount);
        }
        // If user is currently viewing an Index Page, live-update its indexConfig and structured header/row elements across the index sequence
        if (!activePage.isCover && isIndexTemplateType(activePage.templateType)) {
          updateProjectWithHistory(proj => {
            const indexPageIndices = proj.pages
              .map((p, i) => (!p.isCover && isIndexTemplateType(p.templateType) ? i : -1))
              .filter(i => i >= 0);
            const seqTotal = Math.max(1, indexPageIndices.length || next.pageCount || 1);
            const updatedPages = proj.pages.map((p, idx) => {
              const posInSeq = indexPageIndices.indexOf(idx);
              if (posInSeq === -1) return p;
              const seqIdx = posInSeq;
              const sliceCfg = buildPageSliceIndexConfig(next, seqIdx, seqTotal, currentTrim.h, margins);
              const customUserElems = p.elements.filter(
                el =>
                  !el.id.startsWith('idx-el-') &&
                  !el.id.startsWith('idx-title-') &&
                  !el.id.startsWith('idx-sub-') &&
                  !el.id.startsWith('idx-div-') &&
                  !el.id.startsWith('idx-col-')
              );
              const rebuiltHeaders = buildEditableIndexPageElements({
                config: sliceCfg,
                pageSequenceIndex: seqIdx,
                pageSequenceTotal: seqTotal,
                margins,
                trimWidthIn: currentTrim.w,
                trimHeightIn: currentTrim.h,
                includeAllRowCells: false,
                pages: proj.pages,
                pageShiftOffset: 0,
              });
              return {
                ...p,
                templateType: next.templateId,
                indexConfig: sliceCfg,
                showPageNumber: next.showPageNumberCol !== false && next.showPageNumbersColumn !== false,
                elements: [...rebuiltHeaders, ...customUserElems],
              };
            });
            return { ...proj, pages: updatedPages };
          });
        }
        return next;
      });
    },
    [activePage.isCover, activePage.templateType, activePageIndex, margins, currentTrim.w, currentTrim.h, updateProjectWithHistory]
  );

  // Generate editable text cells for all index rows on the active Index Page
  const handleGenerateEditableIndexCells = useCallback(() => {
    if (activePage.isCover || !isIndexTemplateType(activePage.templateType)) {
      showToast('Select an Index Page first to generate editable row cells');
      return;
    }
    const rawCfg = activePage.indexConfig || indexConfigDraft || getDefaultIndexConfig(activePage.templateType);
    const seqIdx = rawCfg.pageSequenceIndex || 0;
    const seqTotal = Math.max(1, rawCfg.pageSequenceTotal || rawCfg.pageCount || 1);
    const sliceCfg = buildPageSliceIndexConfig(rawCfg, seqIdx, seqTotal);
    const fullElements = buildEditableIndexPageElements({
      config: sliceCfg,
      pageSequenceIndex: seqIdx,
      pageSequenceTotal: seqTotal,
      margins,
      trimWidthIn: currentTrim.w,
      trimHeightIn: currentTrim.h,
      includeAllRowCells: true,
    });
    const customUserElems = activePage.elements.filter(
      el => !el.id.startsWith('idx-') && !el.id.startsWith('idx-el-')
    );
    updateActivePageElements([...fullElements, ...customUserElems]);
    showToast('Generated editable text cells for index rows — click any row or page cell on canvas to type');
  }, [activePage, indexConfigDraft, margins, currentTrim.w, currentTrim.h, updateActivePageElements, showToast]);

  // Insert 1 or more Index Pages immediately after the Front Cover (at Page 2, index 1)
  const handleInsertIndexPagesAfterCover = (
    styleOverride?: IndexTemplateStyle,
    countOverride?: number,
    forceConfirmShift: boolean = false,
    configOverride?: IndexPageConfig
  ) => {
    // Guard against rapid double-clicks duplicating pages
    const now = Date.now();
    if (now - lastIndexInsertTimeRef.current < 450) {
      return;
    }

    const chosenStyle = styleOverride || selectedIndexStyle || 'index_classic';
    const baseCfg =
      configOverride ||
      (indexConfigDraft.templateId === chosenStyle
        ? indexConfigDraft
        : getDefaultIndexConfig(chosenStyle));
    const countToInsert = Math.max(
      1,
      Math.min(
        20,
        Math.floor(
          typeof countOverride === 'number'
            ? countOverride
            : baseCfg.pageCount || indexPagesCountToAdd || 1
        )
      )
    );
    const effectiveConfig: IndexPageConfig = {
      ...baseCfg,
      templateId: chosenStyle,
      pageCount: countToInsert,
    };

    if (styleOverride && styleOverride !== selectedIndexStyle) {
      setSelectedIndexStyle(styleOverride);
      setIndexConfigDraft(effectiveConfig);
    }

    // Check if inserting after Front Cover will shift existing interior pages that have custom content
    const shiftCheck = checkIndexInsertionShiftWarning(project.pages, countToInsert);
    if (shiftCheck.willShiftContent && !forceConfirmShift) {
      setIndexShiftConfirmPending({
        style: chosenStyle,
        count: countToInsert,
        config: effectiveConfig,
        warningMessage: shiftCheck.warningMessage,
        affectedPageNumbers: shiftCheck.affectedPageNumbers,
      });
      return;
    }

    lastIndexInsertTimeRef.current = now;
    setIndexShiftConfirmPending(null);

    const styleMeta =
      INDEX_PAGE_TEMPLATES.find(item => item.id === chosenStyle) || INDEX_PAGE_TEMPLATES[0];

    updateProjectWithHistory(prev => {
      const nextPages = insertIndexPagesAfterFrontCover({
        pages: prev.pages,
        indexStyle: chosenStyle,
        count: countToInsert,
        indexConfig: effectiveConfig,
        margins,
        trimWidthIn: currentTrim.w,
        trimHeightIn: currentTrim.h,
      });
      return {
        ...prev,
        pageCount: nextPages.length,
        pages: nextPages,
      };
    });

    // Navigate directly to Page 2 (index 1, right after the Front Cover) so the user sees their new Index Page
    setActivePageIndex(1);
    setSelectedElementId(null);
    setIndexPreviewModalOpen(false);
    showToast(
      `Added ${countToInsert} "${styleMeta.title}" page${countToInsert > 1 ? 's' : ''} after Front Cover`
    );
  };

  // Choose / Switch between different Index Page Templates (updates configuration draft and existing index pages if active)
  const handleSelectIndexStyle = (newStyle: IndexTemplateStyle, applyToExisting: boolean = true) => {
    setSelectedIndexStyle(newStyle);
    const styleMeta =
      INDEX_PAGE_TEMPLATES.find(item => item.id === newStyle) || INDEX_PAGE_TEMPLATES[0];
    const nextDefaultCfg = getDefaultIndexConfig(newStyle);
    setIndexConfigDraft(nextDefaultCfg);
    setIndexPagesCountToAdd(nextDefaultCfg.pageCount || 1);

    if (!applyToExisting) {
      return;
    }

    const hasExistingIndexPages = project.pages.some(
      p => !p.isCover && isIndexTemplateType(p.templateType)
    );
    const isCurrentPageIndex =
      !activePage.isCover && isIndexTemplateType(activePage.templateType);

    if (hasExistingIndexPages || isCurrentPageIndex) {
      let targetIdx = activePageIndex;
      updateProjectWithHistory(prev => {
        const res = updateIndexPagesStyle({
          pages: prev.pages,
          newStyle,
          activePageIndex,
          customConfig: nextDefaultCfg,
          margins,
          trimWidthIn: currentTrim.w,
          trimHeightIn: currentTrim.h,
        });
        targetIdx = res.targetPageIndex;
        return {
          ...prev,
          pageCount: res.pages.length,
          pages: res.pages,
        };
      });
      if (activePageIndex === 0 || !isCurrentPageIndex) {
        const firstIdx = project.pages.findIndex(
          p => !p.isCover && isIndexTemplateType(p.templateType)
        );
        if (firstIdx >= 1) setActivePageIndex(firstIdx);
        else if (targetIdx >= 1) setActivePageIndex(targetIdx);
      }
      showToast(`Switched Index template to "${styleMeta.title}"`);
    } else if (!activePage.isCover) {
      // If user is on an interior page and picks an Index template style, apply it to the active page
      updateProjectWithHistory(prev => {
        const rebuiltHeaders = buildEditableIndexPageElements({
          config: nextDefaultCfg,
          pageSequenceIndex: 0,
          pageSequenceTotal: 1,
          margins,
          trimWidthIn: currentTrim.w,
          trimHeightIn: currentTrim.h,
        });
        const updatedPages = prev.pages.map((p, idx) =>
          idx === activePageIndex
            ? {
                ...p,
                templateType: newStyle,
                indexConfig: nextDefaultCfg,
                elements: [
                  ...rebuiltHeaders,
                  ...p.elements.filter(el => !el.id.startsWith('idx-')),
                ],
              }
            : p
        );
        return { ...prev, pages: updatedPages };
      });
      showToast(`Applied "${styleMeta.title}" index layout to Page ${activePage.pageNumber}`);
    }
  };

  const updateSelectedElement = useCallback(
    (fields: Partial<StudioElement>) => {
      if (!selectedElementId) return;
      const targetEl = activePage.elements.find(el => el.id === selectedElementId);
      const updated = activePage.elements.map(el => (el.id === selectedElementId ? { ...el, ...fields } : el));

      // Keep activePage.indexConfig and indexConfigDraft in sync when user edits an index title or column label directly on canvas
      if (targetEl && !activePage.isCover && isIndexTemplateType(activePage.templateType)) {
        const currentCfg = activePage.indexConfig || getDefaultIndexConfig(activePage.templateType);
        let updatedCfg: IndexPageConfig | null = null;
        if (
          (targetEl.id.startsWith('idx-title-') || targetEl.id.endsWith('-title')) &&
          typeof fields.text === 'string'
        ) {
          updatedCfg = { ...currentCfg, title: fields.text };
        } else if (
          (targetEl.id.startsWith('idx-sub-') || targetEl.id.endsWith('-subtitle')) &&
          typeof fields.text === 'string'
        ) {
          updatedCfg = { ...currentCfg, subtitle: fields.text };
        } else if (
          (targetEl.id.startsWith('idx-col-') || targetEl.id.includes('-colhdr-')) &&
          typeof fields.text === 'string'
        ) {
          const parts = targetEl.id.split('-');
          const colIdx = Number(parts[parts.length - 1]);
          if (Number.isFinite(colIdx) && colIdx >= 0) {
            const nextLabels = [...(currentCfg.columnLabels || [])];
            nextLabels[colIdx] = fields.text;
            updatedCfg = { ...currentCfg, columnLabels: nextLabels };
          }
        }
        if (updatedCfg) {
          const finalCfg = updatedCfg;
          setIndexConfigDraft(finalCfg);
          updateProjectWithHistory(prev => {
            const updatedPages = [...prev.pages];
            updatedPages[activePageIndex] = {
              ...updatedPages[activePageIndex],
              elements: updated,
              indexConfig: finalCfg,
            };
            return { ...prev, pages: updatedPages };
          });
          return;
        }
      }

      updateActivePageElements(updated);
    },
    [selectedElementId, activePage, activePageIndex, updateActivePageElements, updateProjectWithHistory]
  );

  // Fast live update during mouse drag/resize (avoids expensive history deep-cloning on every pixel)
  const updateElementByIdLive = useCallback(
    (targetElemId: string, fields: Partial<StudioElement>) => {
      if (!targetElemId) return;
      hasLiveTransformChangesRef.current = true;
      setProject(prev => {
        const updatedPages = [...prev.pages];
        const currentPage = updatedPages[activePageIndex];
        if (!currentPage) return prev;
        updatedPages[activePageIndex] = {
          ...currentPage,
          elements: currentPage.elements.map(el => (el.id === targetElemId ? { ...el, ...fields } : el)),
        };
        const next: StudioBookProject = {
          ...prev,
          pages: updatedPages,
          lastSaved: 'Auto-saved just now',
          updatedAt: Date.now(),
        };
        projectRef.current = next;
        return next;
      });
    },
    [activePageIndex]
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selectedElementId) return;
    const target = activePage.elements.find(el => el.id === selectedElementId);
    if (target?.locked) {
      showToast('Element is locked — unlock it first to delete');
      return;
    }
    const updated = activePage.elements.filter(el => el.id !== selectedElementId);
    updateActivePageElements(updated);
    setSelectedElementId(null);
    showToast('Element removed');
  }, [selectedElementId, activePage.elements, updateActivePageElements, showToast]);

  const handleCopySelected = useCallback(() => {
    if (!selectedElement) return;
    copiedElementRef.current = JSON.parse(JSON.stringify(selectedElement));
    showToast('Element copied (Ctrl+V to paste)');
  }, [selectedElement, showToast]);

  const handleCutSelected = useCallback(() => {
    if (!selectedElement) return;
    if (selectedElement.locked) {
      showToast('Element is locked — unlock it first to cut');
      return;
    }
    copiedElementRef.current = JSON.parse(JSON.stringify(selectedElement));
    const updated = activePage.elements.filter(el => el.id !== selectedElement.id);
    updateActivePageElements(updated);
    setSelectedElementId(null);
    showToast('Element cut (Ctrl+V to paste)');
  }, [selectedElement, activePage.elements, updateActivePageElements, showToast]);

  const handlePasteElement = useCallback(() => {
    if (!copiedElementRef.current) {
      showToast('Clipboard is empty — select an element and press Ctrl+C first');
      return;
    }
    const source = copiedElementRef.current;
    const pasted: StudioElement = {
      ...JSON.parse(JSON.stringify(source)),
      id: `elem-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      x: Math.min(88, Number((source.x + 3).toFixed(2))),
      y: Math.min(88, Number((source.y + 3).toFixed(2))),
      locked: false,
    };
    copiedElementRef.current = pasted;
    updateActivePageElements([...activePage.elements, pasted]);
    setSelectedElementId(pasted.id);
    showToast('Element pasted');
  }, [activePage.elements, updateActivePageElements, showToast]);

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedElement) return;
    const copy: StudioElement = {
      ...selectedElement,
      id: `elem-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      x: Math.min(88, Number((selectedElement.x + 3).toFixed(2))),
      y: Math.min(88, Number((selectedElement.y + 3).toFixed(2))),
      locked: false,
    };
    updateActivePageElements([...activePage.elements, copy]);
    setSelectedElementId(copy.id);
    showToast('Element duplicated');
  }, [selectedElement, activePage.elements, updateActivePageElements, showToast]);

  // Layer ordering (Bring Forward, Send Backward, Bring to Front, Send to Back)
  const handleLayerOrder = useCallback(
    (action: 'forward' | 'backward' | 'front' | 'back') => {
      if (!selectedElementId) return;
      const reordered = reorderElementLayers(activePage.elements, selectedElementId, action);
      updateActivePageElements(reordered);
      showToast(`Layer moved ${action}`);
    },
    [selectedElementId, activePage.elements, updateActivePageElements, showToast]
  );

  // Element Alignment Helpers (Left, Center H, Right, Top, Middle V, Bottom)
  const handleAlignSelected = (
    alignment: 'left' | 'center-h' | 'right' | 'top' | 'middle-v' | 'bottom'
  ) => {
    if (!selectedElement || selectedElement.locked) return;

    if (isEditingCover) {
      const spineRightX = coverSpecs.bleedMargin + currentTrim.w + coverSpecs.spineWidth;
      const frontLeftPct = ((spineRightX + margins.left) / coverSpecs.totalWidth) * 100;
      const frontRightPct =
        (( coverSpecs.totalWidth - coverSpecs.bleedMargin - margins.right) / coverSpecs.totalWidth) * 100;
      const frontCenterPct = ((spineRightX + currentTrim.w / 2) / coverSpecs.totalWidth) * 100;
      const safeTopPct = ((coverSpecs.bleedMargin + margins.top) / coverSpecs.totalHeight) * 100;
      const safeBottomPct =
        ((coverSpecs.totalHeight - coverSpecs.bleedMargin - margins.bottom) / coverSpecs.totalHeight) * 100;

      if (alignment === 'left') updateSelectedElement({ x: Number(frontLeftPct.toFixed(2)) });
      if (alignment === 'center-h')
        updateSelectedElement({ x: Number((frontCenterPct - selectedElement.width / 2).toFixed(2)) });
      if (alignment === 'right')
        updateSelectedElement({ x: Number((frontRightPct - selectedElement.width).toFixed(2)) });
      if (alignment === 'top') updateSelectedElement({ y: Number(safeTopPct.toFixed(2)) });
      if (alignment === 'middle-v')
        updateSelectedElement({ y: Number((50 - selectedElement.height / 2).toFixed(2)) });
      if (alignment === 'bottom')
        updateSelectedElement({ y: Number((safeBottomPct - selectedElement.height).toFixed(2)) });
    } else {
      const leftPct = (margins.left / currentTrim.w) * 100;
      const rightPct = ((currentTrim.w - margins.right) / currentTrim.w) * 100;
      const topPct = (margins.top / currentTrim.h) * 100;
      const bottomPct = ((currentTrim.h - margins.bottom) / currentTrim.h) * 100;

      if (alignment === 'left') updateSelectedElement({ x: Number(leftPct.toFixed(2)) });
      if (alignment === 'center-h')
        updateSelectedElement({ x: Number((50 - selectedElement.width / 2).toFixed(2)) });
      if (alignment === 'right')
        updateSelectedElement({ x: Number((rightPct - selectedElement.width).toFixed(2)) });
      if (alignment === 'top') updateSelectedElement({ y: Number(topPct.toFixed(2)) });
      if (alignment === 'middle-v')
        updateSelectedElement({ y: Number((50 - selectedElement.height / 2).toFixed(2)) });
      if (alignment === 'bottom')
        updateSelectedElement({ y: Number((bottomPct - selectedElement.height).toFixed(2)) });
    }
    showToast(`Aligned ${alignment.replace('-', ' ')}`);
  };

  // Distribute Page Elements Evenly Vertically
  const handleDistributeVertically = () => {
    if (activePage.elements.length < 3) {
      showToast('Need at least 3 elements on page to distribute');
      return;
    }
    const sorted = [...activePage.elements].sort((a, b) => a.y - b.y);
    const minY = sorted[0].y;
    const maxY = sorted[sorted.length - 1].y;
    const step = (maxY - minY) / (sorted.length - 1);
    const updatedMap = new Map<string, number>();
    sorted.forEach((el, idx) => {
      updatedMap.set(el.id, Number((minY + idx * step).toFixed(2)));
    });
    const nextElements = activePage.elements.map(el =>
      el.locked ? el : { ...el, y: updatedMap.get(el.id) ?? el.y }
    );
    updateActivePageElements(nextElements);
    showToast('Distributed elements evenly vertically');
  };

  // Global Keyboard Shortcuts (Ctrl+S, Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, Spacebar Hold-to-Pan, V/H Tool Switch, Ctrl+C/X/V/D, Delete/Backspace, Escape, Arrow Nudge, [/], L, G, Zoom, PageUp/PageDown)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inputType = target && target.tagName === 'INPUT' ? (target as HTMLInputElement).type : null;
      const isTextInput = isTextEntryInputTarget({
        tagName: target?.tagName,
        inputType,
        isContentEditable: Boolean(target?.isContentEditable),
      });

      const action = resolveStudioKeyboardShortcut({
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        repeat: e.repeat,
        isTextInput,
        tagName: target?.tagName,
        hasSelectedElement: Boolean(selectedElement),
        isSelectedElementLocked: Boolean(selectedElement?.locked),
        hasCopiedElement: Boolean(copiedElementRef.current),
      });

      if (!action) return;

      // If a non-text element (such as a toolbar button or range slider) currently holds focus,
      // blur it so Spacebar or Arrow keys never trigger native button clicks or slider adjustments.
      if (!isTextInput && target && target !== document.body && typeof target.blur === 'function') {
        if (target.tagName === 'BUTTON' || (target.tagName === 'INPUT' && !isTextInput)) {
          target.blur();
        }
      }

      switch (action.type) {
        case 'save':
          e.preventDefault();
          handleManualSave();
          return;

        case 'blur_input':
          e.preventDefault();
          target?.blur();
          commitHistorySnapshot(projectRef.current);
          return;

        case 'escape':
          if (action.isTextInput && target) {
            target.blur();
          }
          setSelectedElementId(null);
          setDownloadDropdownOpen(false);
          setPreviewModalOpen(false);
          setIndexPreviewModalOpen(false);
          setIndexShiftConfirmPending(null);
          setRenamingProjectId(null);
          setConfirmDeleteProjectId(null);
          setIsSpacePanning(false);
          return;

        case 'space_pan_start':
          e.preventDefault();
          if (!e.repeat) {
            setIsSpacePanning(true);
          }
          return;

        case 'tool_select':
          e.preventDefault();
          setCanvasToolMode('select');
          showToast('Select / Move Tool (V) — Drag elements or left-click empty space to pan');
          return;

        case 'tool_pan':
          e.preventDefault();
          setCanvasToolMode('pan');
          showToast('Hand / Pan Tool (H) — Left-click & hold or touch/pen drag to move screen');
          return;

        case 'undo':
          e.preventDefault();
          handleUndo();
          return;

        case 'redo':
          e.preventDefault();
          handleRedo();
          return;

        case 'copy':
          e.preventDefault();
          handleCopySelected();
          return;

        case 'cut':
          e.preventDefault();
          handleCutSelected();
          return;

        case 'paste':
          e.preventDefault();
          handlePasteElement();
          return;

        case 'duplicate':
          e.preventDefault();
          handleDuplicateSelected();
          return;

        case 'delete':
          e.preventDefault();
          handleDeleteSelected();
          return;

        case 'nudge':
          if (selectedElement && !selectedElement.locked) {
            e.preventDefault();
            const nx = Math.max(-100, Math.min(150, Number((selectedElement.x + action.dx).toFixed(2))));
            const ny = Math.max(-100, Math.min(150, Number((selectedElement.y + action.dy).toFixed(2))));
            updateSelectedElement({ x: nx, y: ny });
          }
          return;

        case 'layer_order':
          e.preventDefault();
          handleLayerOrder(action.direction);
          return;

        case 'toggle_lock':
          if (selectedElement) {
            e.preventDefault();
            const nextLocked = !selectedElement.locked;
            updateSelectedElement({ locked: nextLocked });
            showToast(nextLocked ? 'Layer locked (L)' : 'Layer unlocked (L)');
          }
          return;

        case 'toggle_grid':
          e.preventDefault();
          setGridEnabled(prev => {
            const next = !prev;
            showToast(next ? 'Canvas alignment grid enabled (G)' : 'Grid hidden (G)');
            return next;
          });
          return;

        case 'zoom_in':
          e.preventDefault();
          setZoomLevel(prev => Math.min(250, prev + 10));
          return;

        case 'zoom_out':
          e.preventDefault();
          setZoomLevel(prev => Math.max(25, prev - 10));
          return;

        case 'zoom_reset':
          e.preventDefault();
          handleResetCanvasView();
          showToast('Reset zoom (100%) and centered canvas');
          return;

        case 'page_next':
          e.preventDefault();
          setActivePageIndex(prev => Math.min(projectRef.current.pages.length - 1, prev + 1));
          setSelectedElementId(null);
          return;

        case 'page_prev':
          e.preventDefault();
          setActivePageIndex(prev => Math.max(0, prev - 1));
          setSelectedElementId(null);
          return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        setIsSpacePanning(false);
      }
    };

    const handleWindowBlur = () => {
      setIsSpacePanning(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [
    selectedElement,
    handleManualSave,
    commitHistorySnapshot,
    handleUndo,
    handleRedo,
    handleCopySelected,
    handleCutSelected,
    handlePasteElement,
    handleDuplicateSelected,
    handleDeleteSelected,
    updateSelectedElement,
    handleLayerOrder,
    handleResetCanvasView,
    showToast,
  ]);

  // Add Shape
  const handleAddShape = (shapeType: StudioElement['shapeType']) => {
    const newElem: StudioElement = {
      id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: 'shape',
      shapeType,
      x: isEditingCover ? 68 : 38,
      y: 34,
      width: isEditingCover ? 12 : 22,
      height: isEditingCover ? 14 : 20,
      fill: 'none',
      stroke: '#171923',
      strokeWidth: 1.8,
      opacity: 1,
      locked: false,
    };
    updateActivePageElements([...activePage.elements, newElem]);
    setSelectedElementId(newElem.id);
    showToast(`Added ${shapeType} element`);
  };

  // Add Text
  const handleAddText = (textType: 'heading' | 'subheading' | 'body') => {
    const config = {
      heading: {
        text: 'NOTEBOOK TITLE',
        size: 24,
        height: 7,
        family: 'Playfair Display, Georgia, serif',
        weight: 'bold',
      },
      subheading: {
        text: 'DAILY REFLECTIONS & NOTES',
        size: 11,
        height: 4.5,
        family: 'Plus Jakarta Sans, sans-serif',
        weight: '600',
      },
      body: {
        text: 'Write your thoughts, notes, or prompts here...',
        size: 9.5,
        height: 6,
        family: 'Plus Jakarta Sans, sans-serif',
        weight: 'normal',
      },
    }[textType];

    const newElem: StudioElement = {
      id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: 'text',
      x: isEditingCover ? 56 : 25,
      y: 36,
      width: isEditingCover ? 38 : 50,
      height: config.height,
      text: config.text,
      fontSize: config.size,
      fontFamily: config.family,
      fontWeight: config.weight,
      fill: '#171923',
      textAlign: 'center',
      opacity: 1,
      locked: false,
    };
    updateActivePageElements([...activePage.elements, newElem]);
    setSelectedElementId(newElem.id);
    showToast('Added text layer');
  };

  // Helper to place the floating toolbar directly near the mouse cursor click anywhere on the canvas
  const placeFloatingMenuNearClickOrElement = useCallback(
    (el: StudioElement, pointerClientX?: number, pointerClientY?: number) => {
      const wsRect = workspaceContainerRef.current?.getBoundingClientRect();
      const svgRect = canvasSvgRef.current?.getBoundingClientRect();
      if (!wsRect) return;

      if (typeof pointerClientX === 'number' && typeof pointerClientY === 'number') {
        lastPointerClickRef.current = { clientX: pointerClientX, clientY: pointerClientY };
      }

      const activePointer =
        typeof pointerClientX === 'number' && typeof pointerClientY === 'number'
          ? { clientX: pointerClientX, clientY: pointerClientY }
          : lastPointerClickRef.current;

      const clickX = activePointer
        ? activePointer.clientX - wsRect.left
        : svgRect
        ? svgRect.left - wsRect.left + ((el.x + el.width / 2) / 100) * svgRect.width
        : wsRect.width / 2;

      const clickY = activePointer
        ? activePointer.clientY - wsRect.top
        : svgRect
        ? svgRect.top - wsRect.top + ((el.y + el.height / 2) / 100) * svgRect.height
        : wsRect.height / 2;

      const actualMenuW = floatingMenuRef.current?.offsetWidth || 304;
      const actualMenuH = floatingMenuRef.current?.offsetHeight || 68;

      setFloatingMenuPos(
        calculateFloatingMenuPosition({
          clickX,
          clickY,
          containerWidth: wsRect.width,
          containerHeight: Math.max(200, wsRect.height - 54),
          menuWidth: actualMenuW,
          menuHeight: actualMenuH,
        })
      );
    },
    []
  );

  // Re-clamp existing floating menu within workspace bounds if side panels or window size change
  useEffect(() => {
    if (!selectedElement) return;
    const timer = setTimeout(() => {
      const wsRect = workspaceContainerRef.current?.getBoundingClientRect();
      if (!wsRect) return;
      const actualMenuW = floatingMenuRef.current?.offsetWidth || 304;
      const actualMenuH = floatingMenuRef.current?.offsetHeight || 68;
      setFloatingMenuPos(prev => {
        if (!prev) return prev;
        const maxLeft = Math.max(12, wsRect.width - actualMenuW - 12);
        const maxTop = Math.max(12, wsRect.height - 54 - actualMenuH - 12);
        return {
          left: Math.round(Math.max(12, Math.min(maxLeft, prev.left))),
          top: Math.round(Math.max(12, Math.min(maxTop, prev.top))),
        };
      });
    }, 30);
    return () => clearTimeout(timer);
  }, [leftPanelOpen, rightPanelOpen, activeLeftTool, workspaceSize.width, workspaceSize.height, selectedElement]);

  // Upload Custom Image (Reads natural image aspect ratio, normalizes for storage, and places cleanly on Front or Back Cover)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input value immediately so selecting the same image file again for Back Cover always fires onChange
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      const rawDataUrl = ev.target?.result as string;
      if (!rawDataUrl) return;

      const insertUploadedImageElement = (finalDataUrl: string, naturalW: number, naturalH: number) => {
        const aspect = naturalW > 0 && naturalH > 0 ? naturalW / naturalH : 0.75;
        const isTwoPageSpread = isEditingCover || spreadMode === 'full';
        const baseW = isTwoPageSpread ? 24 : 42;
        const canvasAspect = isTwoPageSpread
          ? coverSpecs.totalWidth / coverSpecs.totalHeight
          : currentTrim.w / currentTrim.h;
        const computedH = Math.max(10, Math.min(85, Number(((baseW * canvasAspect) / aspect).toFixed(2))));

        const elemId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        let createdElem: StudioElement | null = null;

        updateProjectWithHistory(prev => {
          const updatedPages = [...prev.pages];
          const targetPage = updatedPages[activePageIndex] || updatedPages[0];
          const existingImages = targetPage.elements.filter(el => el.type === 'image');
          const hasRightImg = existingImages.some(el => el.x + el.width / 2 >= 50);
          const hasLeftImg = existingImages.some(el => el.x + el.width / 2 < 50);

          // If on a 2-page spread and a Front Cover (right side) image already exists without a Back Cover (left side) image,
          // place the second uploaded image on the Back Cover (left side) automatically
          let defaultX = isTwoPageSpread ? 63 : 29;
          if (isTwoPageSpread && hasRightImg && !hasLeftImg) {
            defaultX = 13;
          }

          const newElem: StudioElement = {
            id: elemId,
            type: 'image',
            imageUrl: finalDataUrl,
            imageAlt: file.name,
            x: defaultX,
            y: 22,
            width: baseW,
            height: computedH,
            opacity: 1,
            preserveAspectRatio: false,
            locked: false,
          };
          createdElem = newElem;
          updatedPages[activePageIndex] = {
            ...targetPage,
            elements: [...targetPage.elements, newElem],
          };
          return { ...prev, pages: updatedPages };
        });

        lastPointerClickRef.current = null;
        setSelectedElementId(elemId);
        setActiveLeftTool('pages');
        if (createdElem) {
          const elemToPosition = createdElem;
          setTimeout(() => placeFloatingMenuNearClickOrElement(elemToPosition), 40);
        }
        showToast('Paper cover image added — drag any corner or edge freely to resize');
      };

      const img = new window.Image();
      img.onload = () => {
        let normalizedUrl = rawDataUrl;
        // Downscale huge raster uploads (>1400px) so multiple cover images save reliably in localStorage without quota errors
        try {
          const maxDim = 1400;
          if (
            !file.type.includes('svg') &&
            (img.naturalWidth > maxDim || img.naturalHeight > maxDim || rawDataUrl.length > 1_200_000)
          ) {
            const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(100, Math.round((img.naturalWidth || 800) * scale));
            canvas.height = Math.max(100, Math.round((img.naturalHeight || 1000) * scale));
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              normalizedUrl = canvas.toDataURL('image/jpeg', 0.88);
            }
          }
        } catch {
          normalizedUrl = rawDataUrl;
        }
        insertUploadedImageElement(normalizedUrl, img.naturalWidth || 600, img.naturalHeight || 800);
      };
      img.onerror = () => {
        insertUploadedImageElement(rawDataUrl, 600, 800);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Add Curated Graphic Overlay
  const handleAddCuratedGraphic = (graphicSvg: string, title: string) => {
    const isTwoPageSpread = isEditingCover || spreadMode === 'full';
    const newElem: StudioElement = {
      id: `graphic-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: 'image',
      imageUrl: graphicSvg,
      imageAlt: title,
      x: isTwoPageSpread ? 65 : 32,
      y: 22,
      width: isTwoPageSpread ? 19 : 36,
      height: isTwoPageSpread ? 25 : 34,
      opacity: 1,
      preserveAspectRatio: false,
      locked: false,
    };
    lastPointerClickRef.current = null;
    updateActivePageElements([...activePage.elements, newElem]);
    setSelectedElementId(newElem.id);
    setActiveLeftTool('pages');
    setTimeout(() => placeFloatingMenuNearClickOrElement(newElem), 40);
    showToast(`Added ${title} overlay`);
  };

  // Fit an existing or newly added image to the Notebook Paper Cover (Front Cover, Back Cover, or Full Wrap Spread)
  const handleFitElementToPaperCover = (target: PaperCoverPlacementTarget, elementOverride?: StudioElement) => {
    const targetEl = elementOverride || selectedElement;
    if (!targetEl || targetEl.locked) return;

    const box = calculatePaperCoverPlacementBox({
      target,
      totalWidthIn: coverSpecs.totalWidth,
      totalHeightIn: coverSpecs.totalHeight,
      bleedMarginIn: coverSpecs.bleedMargin,
      trimWidthIn: currentTrim.w,
      spineWidthIn: coverSpecs.spineWidth,
    });

    const updatedEl: StudioElement = {
      ...targetEl,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };

    updateProjectWithHistory(prev => {
      const updatedPages = [...prev.pages];
      // Always ensure the image is placed/updated at the top of Page 1 (Cover Spread) so it is visible above any older layers
      const coverPage = updatedPages[0];
      if (coverPage) {
        const others = coverPage.elements.filter(e => e.id !== updatedEl.id);
        updatedPages[0] = { ...coverPage, elements: [...others, updatedEl] };
      }

      if (activePageIndex > 0 && updatedPages[activePageIndex]) {
        const currentPage = updatedPages[activePageIndex];
        const existsOnCurrent = currentPage.elements.some(e => e.id === updatedEl.id);
        if (existsOnCurrent) {
          updatedPages[activePageIndex] = {
            ...currentPage,
            elements: currentPage.elements.map(e => (e.id === updatedEl.id ? updatedEl : e)),
          };
        }
      }

      return { ...prev, pages: updatedPages };
    });

    if (activePageIndex !== 0) {
      setActivePageIndex(0);
    }
    setSelectedElementId(updatedEl.id);
    const labelMap: Record<PaperCoverPlacementTarget, string> = {
      front_cover: 'Fitted image to Front Paper Cover',
      back_cover: 'Fitted image to Back Paper Cover',
      full_wrap: 'Fitted image to Full Wrap Paper Cover',
      front_center: 'Centered image on Front Paper Cover',
    };
    showToast(labelMap[target]);
  };

  // Add a Full Paper Cover Design preset directly onto the Notebook Paper Cover (Page 1)
  const handleAddPaperCoverPreset = (
    coverSvg: string,
    title: string,
    target: PaperCoverPlacementTarget = 'front_cover'
  ) => {
    const box = calculatePaperCoverPlacementBox({
      target,
      totalWidthIn: coverSpecs.totalWidth,
      totalHeightIn: coverSpecs.totalHeight,
      bleedMarginIn: coverSpecs.bleedMargin,
      trimWidthIn: currentTrim.w,
      spineWidthIn: coverSpecs.spineWidth,
    });
    const newElem: StudioElement = {
      id: `papercover-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: 'image',
      imageUrl: coverSvg,
      imageAlt: title,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      opacity: 1,
      preserveAspectRatio: false,
      locked: false,
    };

    lastPointerClickRef.current = null;
    updateProjectWithHistory(prev => {
      const updatedPages = [...prev.pages];
      const coverPage = updatedPages[0];
      if (coverPage) {
        updatedPages[0] = {
          ...coverPage,
          elements: [...coverPage.elements, newElem],
        };
      }
      return { ...prev, pages: updatedPages };
    });
    setActivePageIndex(0);
    setSelectedElementId(newElem.id);
    setActiveLeftTool('pages');
    setTimeout(() => placeFloatingMenuNearClickOrElement(newElem), 40);
    showToast(`Applied "${title}" to Notebook Paper Cover`);
  };

  // Scale selected element by percentage factor (e.g., 1.10 or 0.90) around its center without any 100% cap
  const handleQuickScaleSelected = (scaleFactor: number) => {
    if (!selectedElement || selectedElement.locked) return;
    const newW = Math.max(1, Number((selectedElement.width * scaleFactor).toFixed(2)));
    const newH = Math.max(1, Number((selectedElement.height * scaleFactor).toFixed(2)));
    const dx = (newW - selectedElement.width) / 2;
    const dy = (newH - selectedElement.height) / 2;
    const newX = Number((selectedElement.x - dx).toFixed(2));
    const newY = Number((selectedElement.y - dy).toFixed(2));
    updateSelectedElement({ x: newX, y: newY, width: newW, height: newH });
  };

  // Set element size directly via the floating cursor menu slider (5% - 200% of page) without artificial height clamping
  const handleSetElementWidthPercent = (targetScalePct: number) => {
    if (!selectedElement || selectedElement.locked) return;
    const clampedScale = Math.max(2, Math.min(300, Number(targetScalePct.toFixed(1))));
    const ratio =
      selectedElement.height > 0 ? selectedElement.width / selectedElement.height : 1;
    const shouldLockRatio =
      selectedElement.type === 'image' ? selectedElement.preserveAspectRatio === true : false;

    let nextW = clampedScale;
    let nextH = selectedElement.height;
    if (shouldLockRatio) {
      if (ratio >= 1) {
        nextW = clampedScale;
        nextH = Math.max(1, Number((clampedScale / ratio).toFixed(2)));
      } else {
        nextH = clampedScale;
        nextW = Math.max(1, Number((clampedScale * ratio).toFixed(2)));
      }
    } else {
      const currentMax = Math.max(1, Math.max(selectedElement.width, selectedElement.height));
      const scaleFactor = clampedScale / currentMax;
      nextW = Math.max(1, Number((selectedElement.width * scaleFactor).toFixed(2)));
      nextH = Math.max(1, Number((selectedElement.height * scaleFactor).toFixed(2)));
    }

    const centerX = selectedElement.x + selectedElement.width / 2;
    const centerY = selectedElement.y + selectedElement.height / 2;
    const newX = Number((centerX - nextW / 2).toFixed(2));
    const newY = Number((centerY - nextH / 2).toFixed(2));
    updateSelectedElement({ x: newX, y: newY, width: nextW, height: nextH });
  };

  // Stretch selected image/element vertically from top (0%) all the way to the bottom (100%)
  const handleStretchElementToBottom = () => {
    if (!selectedElement || selectedElement.locked) return;
    const nextY = selectedElement.y > 0 && selectedElement.y < 15 ? 0 : selectedElement.y;
    const nextH = Math.max(100, Number((100 - Math.max(0, nextY)).toFixed(2)));
    updateSelectedElement({ y: nextY, height: nextH });
    showToast('Stretched image all the way to the bottom of the page');
  };

  // Map client pointer coordinates to 0..100% of the active page's coordinate space
  const clientPointToActivePagePct = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      if (!isEditingCover && spreadMode === 'full') {
        const spreadFracX = (clientX - rect.left) / Math.max(1, rect.width);
        const spreadFracY = (clientY - rect.top) / Math.max(1, rect.height);
        const pageInchesX = spreadFracX * coverSpecs.totalWidth - coverSpecs.bleedMargin;
        const pageInchesY = spreadFracY * coverSpecs.totalHeight - coverSpecs.bleedMargin;
        return {
          mouseX: (pageInchesX / Math.max(0.1, currentTrim.w)) * 100,
          mouseY: (pageInchesY / Math.max(0.1, currentTrim.h)) * 100,
        };
      }
      return {
        mouseX: ((clientX - rect.left) / Math.max(1, rect.width)) * 100,
        mouseY: ((clientY - rect.top) / Math.max(1, rect.height)) * 100,
      };
    },
    [isEditingCover, spreadMode, coverSpecs.totalWidth, coverSpecs.totalHeight, coverSpecs.bleedMargin, currentTrim.w, currentTrim.h]
  );

  // Unified Pointer / Mouse / Touch / Smart-Pen Dragging & Resizing + Left-Click Canvas Panning
  const startElementInteraction = (
    clientX: number,
    clientY: number,
    button: number,
    pointerType: string,
    elemId: string,
    stopEvent: () => void
  ) => {
    const normalizedType: 'mouse' | 'pen' | 'touch' =
      pointerType === 'pen' ? 'pen' : pointerType === 'touch' ? 'touch' : 'mouse';
    setActivePointerType(normalizedType);

    // If Hand/Pan tool or Spacebar is active, or middle mouse button is pressed, let event bubble up to pan the screen!
    if (
      shouldInitiateCanvasPan({
        interactionMode: canvasToolMode,
        isSpacePressed: isSpacePanning,
        button,
        isInteractiveElementTarget: true,
        pointerType: normalizedType,
      })
    ) {
      return;
    }

    stopEvent();
    // Avoid duplicate initialization if onPointerDown already started the drag before synthetic onMouseDown
    if (activeDragRef.current && activeDragRef.current.elemId === elemId) {
      return;
    }

    setSelectedElementId(elemId);

    const elem = activePage.elements.find(el => el.id === elemId);
    if (elem) {
      placeFloatingMenuNearClickOrElement(elem, clientX, clientY);
    }
    if (!elem || elem.locked) return;

    hasLiveTransformChangesRef.current = false;
    activeResizeRef.current = null;
    setResizingHandle(null);
    setResizeInitial(null);

    const rect = canvasSvgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { mouseX, mouseY } = clientPointToActivePagePct(clientX, clientY, rect);
    const offsetX = mouseX - elem.x;
    const offsetY = mouseY - elem.y;

    activeDragRef.current = {
      elemId,
      offsetX,
      offsetY,
      width: elem.width,
      height: elem.height,
    };
    setDraggingElemId(elemId);
    setDragOffset({ x: offsetX, y: offsetY });
  };

  const handleElementPointerDown = (e: React.PointerEvent, elemId: string) => {
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    startElementInteraction(
      e.clientX,
      e.clientY,
      e.button ?? 0,
      e.pointerType || 'mouse',
      elemId,
      () => {
        e.stopPropagation();
      }
    );
  };

  const handleMouseDown = (e: React.MouseEvent, elemId: string) => {
    startElementInteraction(e.clientX, e.clientY, e.button ?? 0, 'mouse', elemId, () => {
      e.stopPropagation();
    });
  };

  const startResizeHandleInteraction = (
    clientX: number,
    clientY: number,
    button: number,
    pointerType: string,
    handle: string,
    stopEvent: () => void
  ) => {
    const normalizedType: 'mouse' | 'pen' | 'touch' =
      pointerType === 'pen' ? 'pen' : pointerType === 'touch' ? 'touch' : 'mouse';
    setActivePointerType(normalizedType);

    if (
      shouldInitiateCanvasPan({
        interactionMode: canvasToolMode,
        isSpacePressed: isSpacePanning,
        button,
        isInteractiveElementTarget: true,
        pointerType: normalizedType,
      })
    ) {
      return;
    }

    stopEvent();
    if (!selectedElement || selectedElement.locked) return;
    if (activeResizeRef.current && activeResizeRef.current.handle === handle) return;

    // Immediately cancel any active drag so resize handle drags never move the image
    activeDragRef.current = null;
    setDraggingElemId(null);
    hasLiveTransformChangesRef.current = false;

    const rect = canvasSvgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { mouseX, mouseY } = clientPointToActivePagePct(clientX, clientY, rect);

    activeResizeRef.current = {
      elemId: selectedElement.id,
      handle,
      initialX: selectedElement.x,
      initialY: selectedElement.y,
      initialW: selectedElement.width,
      initialH: selectedElement.height,
      mouseX,
      mouseY,
      lockAspectRatio: selectedElement.type === 'image' && selectedElement.preserveAspectRatio === true,
    };

    setResizingHandle(handle);
    setResizeInitial({
      x: selectedElement.x,
      y: selectedElement.y,
      w: selectedElement.width,
      h: selectedElement.height,
      mouseX,
      mouseY,
    });
  };

  const handleResizePointerDown = (e: React.PointerEvent, handle: string) => {
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    startResizeHandleInteraction(
      e.clientX,
      e.clientY,
      e.button ?? 0,
      e.pointerType || 'mouse',
      handle,
      () => {
        e.stopPropagation();
        e.preventDefault();
      }
    );
  };

  const handleResizeStart = (e: React.MouseEvent, handle: string) => {
    startResizeHandleInteraction(e.clientX, e.clientY, e.button ?? 0, 'mouse', handle, () => {
      e.stopPropagation();
      e.preventDefault();
    });
  };

  // Start Left-Click / Touch / Smart-Pen Canvas Panning when pressing on workspace or canvas
  const startWorkspacePan = useCallback(
    (clientX: number, clientY: number, button: number, pointerType: string, pointerId?: number) => {
      const normalizedType: 'mouse' | 'pen' | 'touch' =
        pointerType === 'pen' ? 'pen' : pointerType === 'touch' ? 'touch' : 'mouse';
      setActivePointerType(normalizedType);

      if (activePinchRef.current) return;
      if (activeDragRef.current || activeResizeRef.current) return;
      if (activePanRef.current) return;

      const canPan = shouldInitiateCanvasPan({
        interactionMode: canvasToolMode,
        isSpacePressed: isSpacePanning,
        button,
        isInteractiveElementTarget: false,
        pointerType: normalizedType,
      });
      if (!canPan) return;

      activePanRef.current = {
        pointerId,
        startClientX: clientX,
        startClientY: clientY,
        initialPan: { ...panOffsetRef.current },
        hasMovedThreshold: false,
      };

      // In dedicated Hand/Pan mode or when holding Spacebar, immediately show grabbing state
      if (canvasToolMode === 'pan' || isSpacePanning || button === 1) {
        setIsPanningCanvas(true);
      }
    },
    [canvasToolMode, isSpacePanning]
  );

  const activeTouchPointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());

  const handleWorkspacePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (floatingMenuRef.current && floatingMenuRef.current.contains(e.target as Node)) return;

      if (e.pointerType === 'touch') {
        activeTouchPointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        if (activeTouchPointersRef.current.size === 2) {
          activePanRef.current = null;
          activeDragRef.current = null;
          activeResizeRef.current = null;
          setIsPanningCanvas(false);
          setDraggingElemId(null);
          setResizingHandle(null);

          const pts = Array.from(activeTouchPointersRef.current.values());
          const startDistance = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
          const startCenterX = (pts[0].clientX + pts[1].clientX) / 2;
          const startCenterY = (pts[0].clientY + pts[1].clientY) / 2;

          activePinchRef.current = {
            startDistance,
            startCenterX,
            startCenterY,
            initialZoom: zoomLevelRef.current,
            initialPan: { ...panOffsetRef.current },
          };
          return;
        }
        if (!e.isPrimary) return;
      }

      startWorkspacePan(e.clientX, e.clientY, e.button ?? 0, e.pointerType || 'mouse', e.pointerId);
    },
    [startWorkspacePan]
  );

  const handleWorkspaceMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (floatingMenuRef.current && floatingMenuRef.current.contains(e.target as Node)) return;
      startWorkspacePan(e.clientX, e.clientY, e.button ?? 0, 'mouse');
    },
    [startWorkspacePan]
  );

  // Two-Finger Touchscreen Pinch-to-Zoom & Two-Finger Pan (Mobile & Tablet Hardware)
  const handleWorkspaceTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    setActivePointerType('touch');
    if (e.touches.length === 2) {
      activePanRef.current = null;
      activeDragRef.current = null;
      activeResizeRef.current = null;
      setIsPanningCanvas(false);
      setDraggingElemId(null);
      setResizingHandle(null);

      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const startDistance = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const startCenterX = (t0.clientX + t1.clientX) / 2;
      const startCenterY = (t0.clientY + t1.clientY) / 2;

      activePinchRef.current = {
        startDistance,
        startCenterX,
        startCenterY,
        initialZoom: zoomLevelRef.current,
        initialPan: { ...panOffsetRef.current },
      };
    }
  }, []);

  const handleWorkspaceTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && activePinchRef.current) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const currentDistance = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const currentCenterX = (t0.clientX + t1.clientX) / 2;
      const currentCenterY = (t0.clientY + t1.clientY) / 2;

      const nextState = calculatePinchZoomAndPan({
        initialZoom: activePinchRef.current.initialZoom,
        initialPan: activePinchRef.current.initialPan,
        startDistance: activePinchRef.current.startDistance,
        currentDistance,
        startCenterX: activePinchRef.current.startCenterX,
        startCenterY: activePinchRef.current.startCenterY,
        currentCenterX,
        currentCenterY,
      });

      zoomLevelRef.current = nextState.zoomLevel;
      setZoomLevel(nextState.zoomLevel);
      panOffsetRef.current = nextState.panOffset;
      setPanOffset(nextState.panOffset);
    }
  }, []);

  const handleWorkspaceTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      activePinchRef.current = null;
    }
  }, []);

  const applyPointerMove = useCallback(
    (clientX: number, clientY: number, shiftKey: boolean) => {
      if (activePinchRef.current) return;

      const panSession = activePanRef.current;
      if (panSession) {
        const moveDist = Math.hypot(clientX - panSession.startClientX, clientY - panSession.startClientY);
        if (moveDist > 3 || panSession.hasMovedThreshold) {
          panSession.hasMovedThreshold = true;
          suppressNextClickDeselectRef.current = true;
          setIsPanningCanvas(true);
          const nextPan = calculateCanvasPanDelta({
            initialPan: panSession.initialPan,
            startClientX: panSession.startClientX,
            startClientY: panSession.startClientY,
            currentClientX: clientX,
            currentClientY: clientY,
          });
          panOffsetRef.current = nextPan;
          setPanOffset(nextPan);
        }
        return;
      }

      const resizeSession = activeResizeRef.current;
      const dragSession = activeDragRef.current;
      if (!resizeSession && !dragSession) return;

      const rect = canvasSvgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { mouseX, mouseY } = clientPointToActivePagePct(clientX, clientY, rect);

      if (resizeSession) {
        const deltaX = mouseX - resizeSession.mouseX;
        const deltaY = mouseY - resizeSession.mouseY;
        const shouldLockRatio = shiftKey || resizeSession.lockAspectRatio;

        const nextBox = calculateResizedElementBox({
          handle: resizeSession.handle,
          initialX: resizeSession.initialX,
          initialY: resizeSession.initialY,
          initialW: resizeSession.initialW,
          initialH: resizeSession.initialH,
          deltaX,
          deltaY,
          lockAspectRatio: shouldLockRatio,
          minW: 1,
          minH: 1,
        });

        updateElementByIdLive(resizeSession.elemId, nextBox);
        return;
      }

      if (dragSession) {
        let newX = Math.max(-150, Math.min(150, mouseX - dragSession.offsetX));
        let newY = Math.max(-150, Math.min(150, mouseY - dragSession.offsetY));

        if (snapToGuides) {
          if (isEditingCover) {
            const spineLeftX = coverSpecs.bleedMargin + currentTrim.w;
            const spineRightX = spineLeftX + coverSpecs.spineWidth;
            const frontCenterInches = spineRightX + currentTrim.w / 2;
            const frontCenterPct = (frontCenterInches / coverSpecs.totalWidth) * 100;
            const elemCenterXPct = newX + dragSession.width / 2;
            if (dragSession.width < 85 && Math.abs(elemCenterXPct - frontCenterPct) < 1.0) {
              newX = frontCenterPct - dragSession.width / 2;
            }
          } else {
            const pageCenterPct = 50;
            const elemCenterXPct = newX + dragSession.width / 2;
            if (dragSession.width < 85 && Math.abs(elemCenterXPct - pageCenterPct) < 1.0) {
              newX = pageCenterPct - dragSession.width / 2;
            }
          }
          const elemCenterYPct = newY + dragSession.height / 2;
          if (dragSession.height < 85 && Math.abs(elemCenterYPct - 50) < 1.0) {
            newY = 50 - dragSession.height / 2;
          }
        }

        updateElementByIdLive(dragSession.elemId, {
          x: Number(newX.toFixed(2)),
          y: Number(newY.toFixed(2)),
        });
      }
    },
    [snapToGuides, isEditingCover, coverSpecs, currentTrim, updateElementByIdLive, clientPointToActivePagePct]
  );

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!activePanRef.current && !activeDragRef.current && !activeResizeRef.current) return;
    applyPointerMove(e.clientX, e.clientY, e.shiftKey);
  };

  const handleMouseUp = useCallback(
    (clientX?: number, clientY?: number) => {
      if (activePanRef.current) {
        activePanRef.current = null;
        setIsPanningCanvas(false);
      }

      const wasDragging = Boolean(activeDragRef.current || draggingElemId);
      const wasResizing = Boolean(activeResizeRef.current || resizingHandle);
      if (!wasDragging && !wasResizing) return;

      activeDragRef.current = null;
      activeResizeRef.current = null;
      setDraggingElemId(null);
      setResizingHandle(null);
      setResizeInitial(null);

      if (hasLiveTransformChangesRef.current) {
        hasLiveTransformChangesRef.current = false;
        commitHistorySnapshot(projectRef.current);
        setSaveStatusText('Auto-saved just now');

        if (wasDragging && !wasResizing && selectedElement && typeof clientX === 'number' && typeof clientY === 'number') {
          placeFloatingMenuNearClickOrElement(selectedElement, clientX, clientY);
        }
      }
    },
    [draggingElemId, resizingHandle, commitHistorySnapshot, selectedElement, placeFloatingMenuNearClickOrElement]
  );

  // Global window Pointer & Mouse tracking so fast mouse, touch, or smart-pen dragging/panning never drops
  useEffect(() => {
    const onWinPointerMove = (ev: PointerEvent) => {
      if (ev.pointerType === 'touch' && activeTouchPointersRef.current.has(ev.pointerId)) {
        activeTouchPointersRef.current.set(ev.pointerId, { clientX: ev.clientX, clientY: ev.clientY });
        if (activeTouchPointersRef.current.size === 2 && activePinchRef.current) {
          const pts = Array.from(activeTouchPointersRef.current.values());
          const currentDistance = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
          const currentCenterX = (pts[0].clientX + pts[1].clientX) / 2;
          const currentCenterY = (pts[0].clientY + pts[1].clientY) / 2;

          const nextState = calculatePinchZoomAndPan({
            initialZoom: activePinchRef.current.initialZoom,
            initialPan: activePinchRef.current.initialPan,
            startDistance: activePinchRef.current.startDistance,
            currentDistance,
            startCenterX: activePinchRef.current.startCenterX,
            startCenterY: activePinchRef.current.startCenterY,
            currentCenterX,
            currentCenterY,
          });

          zoomLevelRef.current = nextState.zoomLevel;
          setZoomLevel(nextState.zoomLevel);
          panOffsetRef.current = nextState.panOffset;
          setPanOffset(nextState.panOffset);
          return;
        }
      }

      if (!activePanRef.current && !activeDragRef.current && !activeResizeRef.current) return;
      applyPointerMove(ev.clientX, ev.clientY, ev.shiftKey);
    };
    const onWinPointerUp = (ev: PointerEvent) => {
      if (ev.pointerType === 'touch') {
        activeTouchPointersRef.current.delete(ev.pointerId);
        if (activeTouchPointersRef.current.size < 2) {
          activePinchRef.current = null;
        }
      }
      if (!activePanRef.current && !activeDragRef.current && !activeResizeRef.current) return;
      handleMouseUp(ev.clientX, ev.clientY);
    };
    const onWinMouseMove = (ev: MouseEvent) => {
      if (!activePanRef.current && !activeDragRef.current && !activeResizeRef.current) return;
      applyPointerMove(ev.clientX, ev.clientY, ev.shiftKey);
    };
    const onWinMouseUp = (ev: MouseEvent) => {
      if (!activePanRef.current && !activeDragRef.current && !activeResizeRef.current) return;
      handleMouseUp(ev.clientX, ev.clientY);
    };
    window.addEventListener('pointermove', onWinPointerMove);
    window.addEventListener('pointerup', onWinPointerUp);
    window.addEventListener('pointercancel', onWinPointerUp);
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    return () => {
      window.removeEventListener('pointermove', onWinPointerMove);
      window.removeEventListener('pointerup', onWinPointerUp);
      window.removeEventListener('pointercancel', onWinPointerUp);
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
    };
  }, [applyPointerMove, handleMouseUp]);

  // Download PDF & SVG Choices
  const handleDownloadChoice = async (
    choice: 'project_cmyk' | 'project_rgb' | 'page_cmyk' | 'page_rgb' | 'cover_pdf' | 'cover_svg' | 'package'
  ) => {
    setDownloadDropdownOpen(false);
    setIsDownloading(true);
    try {
      const sampleInteriorPage = project.pages.find(p => !p.isCover) || project.pages[1] || project.pages[0];
      if (choice === 'project_cmyk' || choice === 'project_rgb') {
        const blob = await generateInteriorPdf({
          trimSize: project.trimSize,
          customWidthIn: currentTrim.w,
          customHeightIn: currentTrim.h,
          pageCount: Math.max(1, project.pages.filter(p => !p.isCover).length),
          bleed: bleedInches > 0,
          bleedInches,
          interiorType: sampleInteriorPage?.templateType || 'lined',
          lineSpacing: 7,
          insideMargin: margins.left,
          outsideMargin: margins.right,
          topMargin: margins.top,
          bottomMargin: margins.bottom,
          showPageNumbers: true,
          headerText: '',
          pages: project.pages,
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${project.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${
          choice === 'project_cmyk' ? 'CMYK_Print' : 'RGB_Digital'
        }.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast(
          choice === 'project_cmyk'
            ? 'Downloaded Print PDF (Front Cover + Inner Pages + Back Cover)'
            : 'Downloaded Digital RGB PDF (Front Cover + Inner Pages + Back Cover)'
        );
      } else if (choice === 'cover_pdf' || (choice === 'page_cmyk' && isEditingCover)) {
        const coverPage = project.pages.find(p => p.isCover) || project.pages[0];
        const blob = await generateCoverSpreadPdf({
          totalWidth: coverSpecs.totalWidth,
          totalHeight: coverSpecs.totalHeight,
          bleedMargin: coverSpecs.bleedMargin,
          spineWidth: coverSpecs.spineWidth,
          trimWidth: currentTrim.w,
          trimHeight: currentTrim.h,
          title: project.title,
          backgroundColor: coverPage.backgroundColor,
          elements: resolveCoverPreviewElements(project.pages),
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${project.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_Cover_Spread.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Downloaded KDP Cover Spread PDF');
      } else if (choice === 'page_cmyk' || choice === 'page_rgb') {
        const blob = await generateInteriorPdf({
          trimSize: project.trimSize,
          customWidthIn: currentTrim.w,
          customHeightIn: currentTrim.h,
          pageCount: 1,
          bleed: bleedInches > 0,
          bleedInches,
          interiorType: activePage?.templateType || 'lined',
          lineSpacing: 7,
          insideMargin: margins.left,
          outsideMargin: margins.right,
          topMargin: margins.top,
          bottomMargin: margins.bottom,
          showPageNumbers: true,
          headerText: '',
          pages: [activePage],
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `page_${activePage.pageNumber}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast(`Downloaded Page ${activePage.pageNumber} PDF`);
      } else if (choice === 'cover_svg') {
        const svgEl = document.getElementById('studio-canvas-svg');
        if (svgEl) {
          const svgData = new XMLSerializer().serializeToString(svgEl);
          const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = isEditingCover ? 'pageforge_cover_spread.svg' : `page_${activePage.pageNumber}.svg`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          showToast('Exported vector SVG file');
        }
      } else if (choice === 'package') {
        const coverPage = project.pages.find(p => p.isCover) || project.pages[0];
        const coverBlob = await generateCoverSpreadPdf({
          totalWidth: coverSpecs.totalWidth,
          totalHeight: coverSpecs.totalHeight,
          bleedMargin: coverSpecs.bleedMargin,
          spineWidth: coverSpecs.spineWidth,
          trimWidth: currentTrim.w,
          trimHeight: currentTrim.h,
          title: project.title,
          backgroundColor: coverPage.backgroundColor,
          elements: resolveCoverPreviewElements(project.pages),
        });
        const coverUrl = URL.createObjectURL(coverBlob);
        const coverLink = document.createElement('a');
        coverLink.href = coverUrl;
        coverLink.download = `${project.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_Cover_Spread.pdf`;
        document.body.appendChild(coverLink);
        coverLink.click();
        document.body.removeChild(coverLink);
        URL.revokeObjectURL(coverUrl);

        const interiorBlob = await generateInteriorPdf({
          trimSize: project.trimSize,
          customWidthIn: currentTrim.w,
          customHeightIn: currentTrim.h,
          pageCount: Math.max(1, project.pages.filter(p => !p.isCover).length),
          bleed: bleedInches > 0,
          bleedInches,
          interiorType: sampleInteriorPage?.templateType || 'lined',
          lineSpacing: 7,
          insideMargin: margins.left,
          outsideMargin: margins.right,
          topMargin: margins.top,
          bottomMargin: margins.bottom,
          showPageNumbers: true,
          headerText: '',
          pages: project.pages,
        });
        const intUrl = URL.createObjectURL(interiorBlob);
        const intLink = document.createElement('a');
        intLink.href = intUrl;
        intLink.download = `${project.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_Interior.pdf`;
        document.body.appendChild(intLink);
        intLink.click();
        document.body.removeChild(intLink);
        URL.revokeObjectURL(intUrl);
        showToast('Downloaded Complete KDP Bundle (Cover + Interior PDFs)');
      }
    } catch (err) {
      console.error(err);
      showToast('Error generating PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  // Interior Templates Catalog (Includes all 6 selectable Index Page Templates + Journal/Planner/Activity Templates)
  const interiorTemplates = [
    ...INDEX_PAGE_TEMPLATES.map(idxTmpl => ({
      id: idxTmpl.id,
      title: `Index: ${idxTmpl.title}`,
      category: idxTmpl.category,
      desc: idxTmpl.desc,
    })),
    { id: 'lined', title: 'Lined Journal', category: 'Journal & Notes', desc: 'College ruled horizontal notebook lines' },
    { id: 'dotgrid', title: 'Dot Grid (5mm)', category: 'Bullet & Planner', desc: '5mm dot matrix for bullet journaling' },
    { id: 'graph', title: 'Graph / Squared Grid', category: 'Engineering & Math', desc: 'Crisp quad-ruled coordinate grid' },
    { id: 'daily_planner', title: 'Daily Planner', category: 'Productivity', desc: 'Hourly schedule, top priorities & notes' },
    { id: 'weekly_overview', title: 'Weekly Overview', category: 'Productivity', desc: '7-day structured weekly planner' },
    { id: 'habit_matrix', title: 'Monthly Habit Matrix', category: 'Tracker', desc: 'Daily habit check-off tracker grid' },
    { id: 'fitness_log', title: 'Workout & Fitness Log', category: 'Health', desc: 'Sets, reps, weight & cardio tracker' },
    { id: 'password_vault', title: 'Password Logbook', category: 'Directory', desc: 'Alphabetical website & login organizer' },
    { id: 'budget_ledger', title: 'Monthly Budget Ledger', category: 'Finance', desc: 'Expense tracker & balance ledger' },
    { id: 'comic_panels', title: 'Comic Storyboard', category: 'Creative', desc: 'Multi-frame comic panel layout' },
    { id: 'blank', title: 'Blank Sketchbook', category: 'Art & Sketch', desc: 'Unlined page with trim & margin guides' },
    { id: 'recipe', title: 'Recipe Keepsake', category: 'Culinary', desc: 'Ingredients, directions & chef notes' },
    { id: 'meeting_notes', title: 'Meeting Notes', category: 'Business', desc: 'Agenda, attendees & action items' },
    { id: 'sudoku', title: 'Sudoku Puzzle', category: 'Activity', desc: '9x9 puzzle grid for activity books' },
    { id: 'wordsearch', title: 'Word Search Grid', category: 'Activity', desc: '12x12 puzzle matrix with word bank' },
    { id: 'maze', title: 'Labyrinth Maze', category: 'Activity', desc: 'Procedural maze puzzle page' },
    { id: 'mandala', title: 'Mandala Coloring', category: 'Coloring', desc: 'Intricate geometric coloring art' },
  ];

  const filteredTemplates = interiorTemplates.filter(
    t =>
      templateSearchTerm.trim() === '' ||
      t.title.toLowerCase().includes(templateSearchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(templateSearchTerm.toLowerCase())
  );

  const shapesList: { type: StudioElement['shapeType']; label: string }[] = [
    { type: 'rect', label: 'Rectangle' },
    { type: 'rect', label: 'Square' },
    { type: 'circle', label: 'Ellipse' },
    { type: 'circle', label: 'Circle' },
    { type: 'line', label: 'Line' },
    { type: 'star', label: 'Star' },
    { type: 'polygon', label: 'Hexagon' },
    { type: 'triangle', label: 'Triangle' },
    { type: 'heart', label: 'Heart' },
    { type: 'arrow', label: 'Arrow' },
  ];

  const filteredShapes = shapesList.filter(
    s => shapeSearchTerm.trim() === '' || s.label.toLowerCase().includes(shapeSearchTerm.toLowerCase())
  );

  // Dashboard Project Management Actions (Isolated per project)
  const handleCreateNewProject = (
    presetTitle = 'Untitled Notebook',
    trim: StudioBookProject['trimSize'] = '6x9',
    tmpl = 'lined'
  ) => {
    const newProj = createDefaultProject(presetTitle, trim, tmpl);
    setSavedProjects(prev => [deepCloneProject(newProj), ...prev]);
    const cloned = deepCloneProject(newProj);
    projectRef.current = cloned;
    setProject(cloned);
    resetHistoryWithProject(cloned);
    setActivePageIndex(0);
    setSelectedElementId(null);
    setCurrentView('editor');
    showToast(`Created "${presetTitle}"`);
  };

  const handleOpenProject = (proj: StudioBookProject) => {
    const cloned = deepCloneProject(proj);
    projectRef.current = cloned;
    setProject(cloned);
    resetHistoryWithProject(cloned);
    setActivePageIndex(0);
    setSelectedElementId(null);
    setCurrentView('editor');
    showToast(`Opened "${proj.title}"`);
  };

  const handleDuplicateProject = (proj: StudioBookProject) => {
    const cloned = deepCloneProject(proj);
    const dup: StudioBookProject = {
      ...cloned,
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${proj.title} (Copy)`,
      lastSaved: 'Saved just now',
      updatedAt: Date.now(),
    };
    setSavedProjects(prev => {
      const next = [dup, ...prev];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
    showToast(`Duplicated "${proj.title}"`);
  };

  const handleConfirmRenameProject = (projId: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      setRenamingProjectId(null);
      return;
    }
    setSavedProjects(prev => {
      const next = prev.map(p =>
        p.id === projId ? { ...p, title: trimmed, lastSaved: 'Saved just now', updatedAt: Date.now() } : p
      );
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    if (project.id === projId) {
      setProject(prev => ({ ...prev, title: trimmed, lastSaved: 'Saved just now', updatedAt: Date.now() }));
    }
    setRenamingProjectId(null);
    showToast(`Renamed project to "${trimmed}"`);
  };

  const handleDeleteProjectConfirmed = (projId: string) => {
    if (savedProjects.length <= 1) {
      showToast('At least one project must remain in workspace');
      setConfirmDeleteProjectId(null);
      return;
    }
    const nextList = savedProjects.filter(p => p.id !== projId);
    setSavedProjects(nextList);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
    } catch {
      // ignore
    }
    if (project.id === projId && nextList[0]) {
      const fallback = deepCloneProject(nextList[0]);
      projectRef.current = fallback;
      setProject(fallback);
      resetHistoryWithProject(fallback);
    }
    setConfirmDeleteProjectId(null);
    showToast('Project permanently deleted');
  };

  // Filtered and Sorted Dashboard Projects
  const displayedDashboardProjects = useMemo(() => {
    const filtered = savedProjects.filter(
      p =>
        dashboardSearch.trim() === '' ||
        p.title.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
        p.trimSize.toLowerCase().includes(dashboardSearch.toLowerCase())
    );
    return [...filtered].sort((a, b) => {
      if (dashboardSort === 'name') return a.title.localeCompare(b.title);
      if (dashboardSort === 'pages') return b.pages.length - a.pages.length;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [savedProjects, dashboardSearch, dashboardSort]);

  // Miniature visual layout preview inside each of the 12 Index Template Cards
  const renderIndexCardMiniSvg = (tmplId: IndexTemplateStyle) => {
    return (
      <svg viewBox="0 0 88 118" className="w-full h-full block bg-white rounded-[2px]">
        {/* Outer page border & header bar */}
        <rect x="3" y="3" width="82" height="112" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
        <rect x="9" y="8" width="44" height="3.5" rx="1" fill="#1E293B" />
        <line x1="9" y1="14.5" x2="79" y2="14.5" stroke="#64748B" strokeWidth="0.8" />

        {tmplId === 'index_classic' && (
          <g>
            {Array.from({ length: 10 }).map((_, i) => {
              const y = 22 + i * 8.6;
              return (
                <g key={i}>
                  <rect x="9" y={y - 2.5} width="4" height="2.2" fill="#64748B" />
                  <line x1="15" y1={y} x2="54" y2={y} stroke="#CBD5E1" strokeWidth="0.9" />
                  <line x1="55" y1={y - 1} x2="68" y2={y - 1} stroke="#94A3B8" strokeWidth="0.8" strokeDasharray="1,1.8" />
                  <rect x="70" y={y - 3.5} width="9" height="4.5" rx="0.8" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="0.6" />
                </g>
              );
            })}
          </g>
        )}

        {tmplId === 'index_bullet' && (
          <g>
            <rect x="9" y="17" width="70" height="6" rx="1" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="0.6" />
            <circle cx="13" cy="20" r="1" fill="#1E293B" />
            <circle cx="24" cy="20" r="1" fill="#1677FF" />
            <circle cx="35" cy="20" r="1" fill="#10B981" />
            <rect x="9" y="25" width="70" height="4.5" fill="#1E293B" />
            {Array.from({ length: 9 }).map((_, i) => {
              const y = 29.5 + i * 8.5;
              return (
                <g key={i}>
                  <rect x="9" y={y} width="70" height="8.5" fill={i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="17" y1={y} x2="17" y2={y + 8.5} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="65" y1={y} x2="65" y2={y + 8.5} stroke="#CBD5E1" strokeWidth="0.5" />
                </g>
              );
            })}
          </g>
        )}

        {tmplId === 'index_numbered' && (
          <g>
            {[0, 1].map(col => {
              const cx = col === 0 ? 9 : 46;
              return (
                <g key={col}>
                  <rect x={cx} y="17" width="33" height="3.5" fill="#E2E8F0" />
                  {Array.from({ length: 10 }).map((_, r) => {
                    const y = 24 + r * 8.4;
                    return (
                      <g key={r}>
                        <rect x={cx} y={y - 2} width="4" height="2" fill="#475569" />
                        <line x1={cx + 5.5} y1={y} x2={cx + 25} y2={y} stroke="#CBD5E1" strokeWidth="0.7" />
                        <rect x={cx + 26.5} y={y - 3} width="6.5" height="3.8" fill="none" stroke="#94A3B8" strokeWidth="0.5" />
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        )}

        {tmplId === 'index_alphabetical' && (
          <g>
            {Array.from({ length: 9 }).map((_, idx) => {
              const c = idx % 3;
              const r = Math.floor(idx / 3);
              const bx = 9 + c * 24;
              const by = 18 + r * 30;
              return (
                <g key={idx}>
                  <rect x={bx} y={by} width="22" height="27" rx="1" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="0.6" />
                  <rect x={bx} y={by} width="22" height="5" rx="0.8" fill="#E2E8F0" />
                  <line x1={bx + 2} y1={by + 10} x2={bx + 20} y2={by + 10} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1={bx + 2} y1={by + 15} x2={bx + 20} y2={by + 15} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1={bx + 2} y1={by + 20} x2={bx + 20} y2={by + 20} stroke="#CBD5E1" strokeWidth="0.5" />
                </g>
              );
            })}
          </g>
        )}

        {tmplId === 'index_categorical' && (
          <g>
            {Array.from({ length: 4 }).map((_, idx) => {
              const c = idx % 2;
              const r = Math.floor(idx / 2);
              const bx = 9 + c * 36;
              const by = 18 + r * 45;
              return (
                <g key={idx}>
                  <rect x={bx} y={by} width="34" height="41" rx="1.2" fill="#FFFFFF" stroke="#64748B" strokeWidth="0.65" />
                  <rect x={bx} y={by} width="34" height="6" fill="#E2E8F0" />
                  <line x1={bx + 27} y1={by + 6} x2={bx + 27} y2={by + 41} stroke="#CBD5E1" strokeWidth="0.5" />
                  {[12, 18, 24, 30, 36].map(ly => (
                    <line key={ly} x1={bx + 2.5} y1={by + ly} x2={bx + 31.5} y2={by + ly} stroke="#CBD5E1" strokeWidth="0.5" />
                  ))}
                </g>
              );
            })}
          </g>
        )}

        {tmplId === 'index_project' && (
          <g>
            <rect x="9" y="17" width="70" height="5" fill="#1E293B" />
            {Array.from({ length: 9 }).map((_, i) => {
              const y = 22 + i * 9.2;
              return (
                <g key={i}>
                  <rect x="9" y={y} width="70" height="9.2" fill="none" stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="22" y1={y} x2="22" y2={y + 9.2} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="57" y1={y} x2="57" y2={y + 9.2} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="68" y1={y} x2="68" y2={y + 9.2} stroke="#CBD5E1" strokeWidth="0.5" />
                  <rect x="60.5" y={y + 2.5} width="4" height="4" rx="0.6" fill="none" stroke="#64748B" strokeWidth="0.6" />
                </g>
              );
            })}
          </g>
        )}

        {tmplId === 'index_monthly' && (
          <g>
            {Array.from({ length: 12 }).map((_, idx) => {
              const c = idx % 3;
              const r = Math.floor(idx / 3);
              const bx = 9 + c * 24;
              const by = 17 + r * 22.5;
              return (
                <g key={idx}>
                  <rect x={bx} y={by} width="22" height="20" rx="1" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="0.55" />
                  <rect x={bx} y={by} width="22" height="4.5" fill="#1E293B" />
                  <line x1={bx + 2} y1={by + 9.5} x2={bx + 20} y2={by + 9.5} stroke="#CBD5E1" strokeWidth="0.45" />
                  <line x1={bx + 2} y1={by + 14.5} x2={bx + 20} y2={by + 14.5} stroke="#CBD5E1" strokeWidth="0.45" />
                </g>
              );
            })}
          </g>
        )}

        {tmplId === 'index_glossary' && (
          <g>
            <rect x="9" y="17" width="70" height="5" fill="#F1F5F9" stroke="#64748B" strokeWidth="0.6" />
            {Array.from({ length: 8 }).map((_, i) => {
              const y = 22 + i * 10.4;
              return (
                <g key={i}>
                  <rect x="9" y={y} width="70" height="10.4" fill="none" stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="30" y1={y} x2="30" y2={y + 10.4} stroke="#94A3B8" strokeWidth="0.6" />
                  <line x1="68" y1={y} x2="68" y2={y + 10.4} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="32" y1={y + 5.2} x2="66" y2={y + 5.2} stroke="#E2E8F0" strokeWidth="0.45" />
                </g>
              );
            })}
          </g>
        )}

        {tmplId === 'index_reading' && (
          <g>
            <rect x="9" y="17" width="70" height="5" fill="#1E293B" />
            {Array.from({ length: 9 }).map((_, i) => {
              const y = 22 + i * 9.2;
              return (
                <g key={i}>
                  <rect x="9" y={y} width="70" height="9.2" fill={i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="36" y1={y} x2="36" y2={y + 9.2} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="52" y1={y} x2="52" y2={y + 9.2} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="68" y1={y} x2="68" y2={y + 9.2} stroke="#CBD5E1" strokeWidth="0.5" />
                  {[0, 1, 2, 3, 4].map(st => (
                    <circle key={st} cx={54.5 + st * 2.6} cy={y + 4.6} r="0.85" fill="none" stroke="#64748B" strokeWidth="0.5" />
                  ))}
                </g>
              );
            })}
          </g>
        )}

        {tmplId === 'index_recipe' && (
          <g>
            <rect x="9" y="17" width="70" height="5.5" rx="1" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="0.5" />
            <rect x="9" y="24" width="70" height="4.5" fill="#1E293B" />
            {Array.from({ length: 8 }).map((_, i) => {
              const y = 28.5 + i * 9.5;
              return (
                <g key={i}>
                  <rect x="9" y={y} width="70" height="9.5" fill="none" stroke="#CBD5E1" strokeWidth="0.5" />
                  <rect x="39" y={y + 2.2} width="12" height="5" rx="1.5" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="0.45" />
                  <line x1="54" y1={y} x2="54" y2={y + 9.5} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="68" y1={y} x2="68" y2={y + 9.5} stroke="#CBD5E1" strokeWidth="0.5" />
                </g>
              );
            })}
          </g>
        )}

        {tmplId === 'index_study' && (
          <g>
            <rect x="9" y="17" width="70" height="6" rx="1" fill="#F1F5F9" stroke="#64748B" strokeWidth="0.5" />
            <rect x="9" y="25" width="70" height="4.5" fill="#1E293B" />
            {Array.from({ length: 8 }).map((_, i) => {
              const y = 29.5 + i * 9.4;
              return (
                <g key={i}>
                  <rect x="9" y={y} width="70" height="9.4" fill="none" stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="36" y1={y} x2="36" y2={y + 9.4} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="53" y1={y} x2="53" y2={y + 9.4} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="68" y1={y} x2="68" y2={y + 9.4} stroke="#CBD5E1" strokeWidth="0.5" />
                  {[0, 1, 2].map(b => (
                    <rect key={b} x={55 + b * 3.8} y={y + 3} width="2.8" height="2.8" fill="none" stroke="#64748B" strokeWidth="0.5" />
                  ))}
                </g>
              );
            })}
          </g>
        )}

        {tmplId === 'index_collection' && (
          <g>
            <rect x="9" y="17" width="70" height="5" fill="#1E293B" />
            {Array.from({ length: 9 }).map((_, i) => {
              const y = 22 + i * 9.2;
              return (
                <g key={i}>
                  <rect x="9" y={y} width="70" height="9.2" fill={i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="19" y1={y} x2="19" y2={y + 9.2} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="45" y1={y} x2="45" y2={y + 9.2} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="59" y1={y} x2="59" y2={y + 9.2} stroke="#CBD5E1" strokeWidth="0.5" />
                  <line x1="69" y1={y} x2="69" y2={y + 9.2} stroke="#CBD5E1" strokeWidth="0.5" />
                </g>
              );
            })}
          </g>
        )}
      </svg>
    );
  };

  // Helper to render interior template SVG paths inside a page box of width=432, height=648
  const renderInteriorTemplateSvg = (
    templateType: string | undefined,
    pageNumber: number,
    showNumber: boolean = true,
    indexConfigOverride?: IndexPageConfig,
    pageElementsOverride?: StudioElement[]
  ) => {
    const t = templateType || 'lined';
    const matchedPage = project.pages.find(p => p.pageNumber === pageNumber);
    const idxCfg: IndexPageConfig | undefined = isIndexTemplateType(t)
      ? indexConfigOverride ||
        matchedPage?.indexConfig ||
        getDefaultIndexConfig(t === 'index' ? 'index_classic' : t)
      : undefined;
    const resolvedElems = pageElementsOverride ?? matchedPage?.elements ?? [];
    const hasEditableHeaders = resolvedElems.some(
      el => el.id.startsWith('idx-title-') || el.id.endsWith('-title')
    );
    const leftM = Math.max(24, Math.min(72, Math.round(margins.left * 72)));
    const rightM = Math.max(24, Math.min(72, Math.round(margins.right * 72)));
    const topM = Math.max(24, Math.min(68, Math.round(margins.top * 72)));
    const bottomM = Math.max(24, Math.min(68, Math.round(margins.bottom * 72)));
    const contentW = 432 - leftM - rightM;
    const rightEdgeX = 432 - rightM;
    const rawBottomLimitY = 648 - bottomM - 28;
    const idxShowNotes = Boolean(idxCfg?.showNotesField && t !== 'index_recipe');
    const bottomLimitY = idxShowNotes ? rawBottomLimitY - 44 : rawBottomLimitY;
    const tableHeaderY = topM + 42;
    const tableRowsStartY = topM + 58;
    const availTableH = Math.max(160, bottomLimitY - tableRowsStartY);
    const idxFontPt = Math.max(6, Math.min(13, idxCfg?.fontSizePt || 8.5));
    const maxRowCap =
      idxCfg?.lineSpacing === 'compact'
        ? 18.5
        : idxCfg?.lineSpacing === 'relaxed'
        ? 28.5
        : 23.5;
    const idxShowPageCol = idxCfg?.showPageNumberCol !== false && idxCfg?.showPageNumbersColumn !== false;
    const idxColLabels = idxCfg?.columnLabels || [];
    return (
      <g pointerEvents="none">
        {(t === 'lined' || t === 'ruled') && (
          <g>
            <g stroke="#CBD5E1" strokeWidth="0.85">
              {Array.from({ length: 25 }).map((_, i) => (
                <line key={i} x1="38" y1={72 + i * 21} x2="394" y2={72 + i * 21} />
              ))}
            </g>
          </g>
        )}

        {t === 'daily_planner' && (
          <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
            <text x="38" y="54" fill="#1E293B" fontSize="9" fontWeight="bold">
              DAILY SCHEDULE &amp; PRIORITIES
            </text>
            <text x="290" y="54" fill="#94A3B8" fontSize="7.5">
              M T W T F S S | DATE: _______
            </text>
            <text x="38" y="76" fill="#475569" fontSize="7.5" fontWeight="bold">
              TOP PRIORITIES
            </text>
            {Array.from({ length: 3 }).map((_, i) => (
              <g key={i} transform={`translate(38, ${84 + i * 15})`}>
                <rect x="0" y="0" width="8" height="8" fill="none" stroke="#94A3B8" strokeWidth="0.8" />
                <line x1="14" y1="6" x2="356" y2="6" stroke="#E2E8F0" strokeWidth="0.8" />
              </g>
            ))}
            <text x="38" y="142" fill="#475569" fontSize="7.5" fontWeight="bold">
              TIMEBLOCK SCHEDULE
            </text>
            <text x="222" y="142" fill="#475569" fontSize="7.5" fontWeight="bold">
              ACTION ITEMS
            </text>
            {['6 AM', '8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'].map((hr, idx) => (
              <g key={hr} transform={`translate(38, ${152 + idx * 24})`}>
                <text x="0" y="7" fill="#64748B" fontSize="7">
                  {hr}
                </text>
                <line x1="34" y1="5" x2="168" y2="5" stroke="#E2E8F0" strokeWidth="0.8" />
                <rect x="184" y="0" width="7" height="7" fill="none" stroke="#94A3B8" strokeWidth="0.8" />
                <line x1="198" y1="5" x2="356" y2="5" stroke="#E2E8F0" strokeWidth="0.8" />
              </g>
            ))}
            <rect x="38" y="362" width="356" height="224" fill="none" stroke="#CBD5E1" strokeWidth="0.8" rx="2" />
            <text x="48" y="378" fill="#64748B" fontSize="7.5" fontWeight="bold">
              DAILY REFLECTIONS &amp; NOTES
            </text>
          </g>
        )}

        {t === 'dotgrid' && (
          <g fill="#94A3B8">
            {Array.from({ length: 25 }).map((_, c) =>
              Array.from({ length: 38 }).map((_, r) => (
                <circle key={`${c}-${r}`} cx={42 + c * 14.4} cy={52 + r * 14.4} r="0.7" />
              ))
            )}
          </g>
        )}

        {t === 'graph' && (
          <g stroke="#E2E8F0" strokeWidth="0.65">
            {Array.from({ length: 25 }).map((_, c) => (
              <line key={`c-${c}`} x1={36 + c * 15} y1="48" x2={36 + c * 15} y2="588" />
            ))}
            {Array.from({ length: 37 }).map((_, r) => (
              <line key={`r-${r}`} x1="36" y1={48 + r * 15} x2="396" y2={48 + r * 15} />
            ))}
          </g>
        )}

        {t === 'weekly_overview' && (
          <g fontFamily="Plus Jakarta Sans, sans-serif">
            <text x="38" y="54" fill="#1E293B" fontSize="9.5" fontWeight="bold">
              WEEKLY PLANNER — WEEK OF: ______________
            </text>
            {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day, idx) => (
              <g key={day} transform={`translate(38, ${68 + idx * 72})`}>
                <rect x="0" y="0" width="356" height="64" fill="none" stroke="#CBD5E1" strokeWidth="0.8" rx="2" />
                <text x="8" y="13" fill="#334155" fontSize="7.5" fontWeight="bold">
                  {day}
                </text>
                <line x1="0" y1="18" x2="356" y2="18" stroke="#E2E8F0" strokeWidth="0.7" />
                <line x1="8" y1="34" x2="348" y2="34" stroke="#F1F5F9" strokeWidth="0.7" />
                <line x1="8" y1="50" x2="348" y2="50" stroke="#F1F5F9" strokeWidth="0.7" />
              </g>
            ))}
          </g>
        )}

        {t === 'habit_matrix' && (
          <g fontFamily="Plus Jakarta Sans, sans-serif">
            <text x="38" y="54" fill="#1E293B" fontSize="9.5" fontWeight="bold">
              MONTHLY HABIT TRACKER
            </text>
            <rect x="38" y="68" width="356" height="504" fill="none" stroke="#CBD5E1" strokeWidth="0.8" />
            {Array.from({ length: 20 }).map((_, r) => (
              <line
                key={r}
                x1="38"
                y1={92 + r * 24}
                x2="394"
                y2={92 + r * 24}
                stroke="#E2E8F0"
                strokeWidth="0.7"
              />
            ))}
            {Array.from({ length: 15 }).map((_, c) => (
              <line
                key={c}
                x1={140 + c * 17}
                y1="68"
                x2={140 + c * 17}
                y2="572"
                stroke="#E2E8F0"
                strokeWidth="0.6"
              />
            ))}
          </g>
        )}

        {t === 'fitness_log' && (
          <g fontFamily="Plus Jakarta Sans, sans-serif">
            <text x="38" y="54" fill="#1E293B" fontSize="9.5" fontWeight="bold">
              WORKOUT &amp; TRAINING LOG
            </text>
            <rect x="38" y="66" width="356" height="32" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="0.8" />
            <text x="46" y="85" fill="#475569" fontSize="7.5">
              DATE: _________ | FOCUS: ______________ | WEIGHT: ______
            </text>
            <rect x="38" y="108" width="356" height="460" fill="none" stroke="#CBD5E1" strokeWidth="0.8" />
            {Array.from({ length: 18 }).map((_, r) => (
              <line
                key={r}
                x1="38"
                y1={132 + r * 24}
                x2="394"
                y2={132 + r * 24}
                stroke="#E2E8F0"
                strokeWidth="0.7"
              />
            ))}
          </g>
        )}

        {t === 'password_vault' && (
          <g fontFamily="Plus Jakarta Sans, sans-serif">
            <text x="38" y="54" fill="#1E293B" fontSize="9.5" fontWeight="bold">
              INTERNET PASSWORD LOGBOOK
            </text>
            {Array.from({ length: 5 }).map((_, i) => (
              <g key={i} transform={`translate(38, ${72 + i * 100})`}>
                <rect x="0" y="0" width="356" height="88" fill="none" stroke="#CBD5E1" strokeWidth="0.8" rx="2" />
                <text x="10" y="20" fill="#475569" fontSize="7.5" fontWeight="bold">
                  WEBSITE: _______________________________________
                </text>
                <text x="10" y="42" fill="#475569" fontSize="7.5" fontWeight="bold">
                  USERNAME: ______________________________________
                </text>
                <text x="10" y="64" fill="#475569" fontSize="7.5" fontWeight="bold">
                  PASSWORD: ______________________________________
                </text>
              </g>
            ))}
          </g>
        )}

        {t === 'budget_ledger' && (
          <g fontFamily="Plus Jakarta Sans, sans-serif">
            <text x="38" y="54" fill="#1E293B" fontSize="9.5" fontWeight="bold">
              MONTHLY BUDGET &amp; EXPENSE LEDGER
            </text>
            <rect x="38" y="68" width="356" height="504" fill="none" stroke="#CBD5E1" strokeWidth="0.8" />
            <line x1="100" y1="68" x2="100" y2="572" stroke="#CBD5E1" strokeWidth="0.7" />
            <line x1="270" y1="68" x2="270" y2="572" stroke="#CBD5E1" strokeWidth="0.7" />
            <line x1="332" y1="68" x2="332" y2="572" stroke="#CBD5E1" strokeWidth="0.7" />
            {Array.from({ length: 21 }).map((_, r) => (
              <line
                key={r}
                x1="38"
                y1={92 + r * 22}
                x2="394"
                y2={92 + r * 22}
                stroke="#E2E8F0"
                strokeWidth="0.7"
              />
            ))}
          </g>
        )}

        {t === 'comic_panels' && (
          <g stroke="#1E293B" strokeWidth="1.6" fill="none">
            <rect x="38" y="48" width="172" height="165" />
            <rect x="222" y="48" width="172" height="165" />
            <rect x="38" y="225" width="356" height="170" />
            <rect x="38" y="407" width="112" height="175" />
            <rect x="160" y="407" width="234" height="175" />
          </g>
        )}

        {(t === 'recipe' || t === 'meeting_notes') && (
          <g fontFamily="Plus Jakarta Sans, sans-serif">
            <text x="38" y="54" fill="#1E293B" fontSize="9.5" fontWeight="bold">
              {t === 'recipe' ? 'RECIPE CARD & INGREDIENTS' : 'MEETING MINUTES & ACTION ITEMS'}
            </text>
            <rect x="38" y="68" width="356" height="130" fill="none" stroke="#CBD5E1" strokeWidth="0.8" />
            <rect x="38" y="212" width="356" height="360" fill="none" stroke="#CBD5E1" strokeWidth="0.8" />
            {Array.from({ length: 14 }).map((_, r) => (
              <line
                key={r}
                x1="48"
                y1={240 + r * 22}
                x2="384"
                y2={240 + r * 22}
                stroke="#E2E8F0"
                strokeWidth="0.7"
              />
            ))}
          </g>
        )}

        {t === 'sudoku' && (
          <g fontFamily="Plus Jakarta Sans, sans-serif">
            <text x="216" y="60" fill="#1E293B" fontSize="11" fontWeight="bold" textAnchor="middle">
              SUDOKU PUZZLE #{pageNumber}
            </text>
            <g transform="translate(54, 96)">
              <rect x="0" y="0" width="324" height="324" fill="none" stroke="#0F172A" strokeWidth="2.2" />
              {Array.from({ length: 9 }).map((_, i) => (
                <React.Fragment key={i}>
                  <line
                    x1={i * 36}
                    y1="0"
                    x2={i * 36}
                    y2="324"
                    stroke="#0F172A"
                    strokeWidth={i % 3 === 0 ? '2' : '0.6'}
                  />
                  <line
                    x1="0"
                    y1={i * 36}
                    x2="324"
                    y2={i * 36}
                    stroke="#0F172A"
                    strokeWidth={i % 3 === 0 ? '2' : '0.6'}
                  />
                </React.Fragment>
              ))}
            </g>
          </g>
        )}

        {t === 'wordsearch' && (
          <g fontFamily="monospace">
            <text
              x="216"
              y="56"
              fill="#1E293B"
              fontSize="10"
              fontFamily="sans-serif"
              fontWeight="bold"
              textAnchor="middle"
            >
              WORD SEARCH
            </text>
            <rect x="46" y="72" width="340" height="340" fill="none" stroke="#334155" strokeWidth="1.2" />
            {Array.from({ length: 12 }).map((_, r) =>
              Array.from({ length: 12 }).map((_, c) => {
                const ch = String.fromCharCode(65 + ((r * 7 + c * 13 + pageNumber) % 26));
                return (
                  <text
                    key={`${r}-${c}`}
                    x={64 + c * 27.5}
                    y={96 + r * 27.5}
                    fontSize="11"
                    fill="#1E293B"
                    textAnchor="middle"
                  >
                    {ch}
                  </text>
                );
              })
            )}
          </g>
        )}

        {t === 'maze' && (
          <g stroke="#0F172A" strokeWidth="1.5" fill="none">
            <text
              x="216"
              y="56"
              fill="#1E293B"
              stroke="none"
              fontSize="10"
              fontFamily="sans-serif"
              fontWeight="bold"
              textAnchor="middle"
            >
              LABYRINTH MAZE
            </text>
            <rect x="56" y="82" width="320" height="440" strokeWidth="2" />
            {Array.from({ length: 10 }).map((_, i) => (
              <React.Fragment key={i}>
                <line x1="56" y1={122 + i * 40} x2={i % 2 === 0 ? 310 : 240} y2={122 + i * 40} />
                <line x1={i % 2 === 0 ? 120 : 180} y1={142 + i * 40} x2="376" y2={142 + i * 40} />
              </React.Fragment>
            ))}
          </g>
        )}

        {t === 'mandala' && (
          <g transform="translate(216, 324)" fill="none" stroke="#1E293B" strokeWidth="1">
            {[30, 60, 90, 120, 150, 175].map(r => (
              <circle key={r} cx="0" cy="0" r={r} />
            ))}
            {Array.from({ length: 16 }).map((_, i) => (
              <g key={i} transform={`rotate(${(i * 360) / 16})`}>
                <ellipse cx="0" cy="-90" rx="18" ry="60" />
                <circle cx="0" cy="-162" r="8" />
              </g>
            ))}
          </g>
        )}

        {/* 1. CLASSIC TABLE OF CONTENTS INDEX */}
        {(t === 'index' || t === 'index_classic') && idxCfg && (() => {
          const rowsCount = Math.max(5, Math.min(36, idxCfg.entriesPerPage || 22));
          const rowStep = Math.min(maxRowCap, availTableH / rowsCount);
          const pageBoxW = idxShowPageCol ? 44 : 0;
          const startNum = Math.max(1, idxCfg.startEntryNumber || 1);
          return (
            <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
              {!hasEditableHeaders && (
                <>
                  <text
                    x="216"
                    y={topM + 14}
                    fill="#0F172A"
                    fontSize={idxFontPt + 3.2}
                    fontWeight="800"
                    letterSpacing="2px"
                    textAnchor="middle"
                  >
                    {idxCfg.title || 'INDEX / TABLE OF CONTENTS'}
                  </text>
                  <line x1={leftM} y1={topM + 26} x2={rightEdgeX} y2={topM + 26} stroke="#1E293B" strokeWidth="1.2" />
                  <text x={leftM + 4} y={tableHeaderY} fill="#475569" fontSize={idxFontPt - 1} fontWeight="700">
                    {idxColLabels[0] || '#'}
                  </text>
                  <text x={leftM + 32} y={tableHeaderY} fill="#475569" fontSize={idxFontPt - 1} fontWeight="700">
                    {idxColLabels[1] || 'SECTION / TOPIC TITLE'}
                  </text>
                  {idxShowPageCol && (
                    <text x={rightEdgeX - 4} y={tableHeaderY} fill="#475569" fontSize={idxFontPt - 1} fontWeight="700" textAnchor="end">
                      {idxColLabels[2] || 'PAGE #'}
                    </text>
                  )}
                </>
              )}
              <line x1={leftM} y1={tableHeaderY + 6} x2={rightEdgeX} y2={tableHeaderY + 6} stroke="#94A3B8" strokeWidth="0.8" />
              {Array.from({ length: rowsCount }).map((_, i) => {
                const ry = tableRowsStartY + (i + 0.8) * rowStep;
                const lineEndX = idxShowPageCol ? rightEdgeX - pageBoxW - 8 : rightEdgeX;
                const rowNum = startNum + i;
                return (
                  <g key={i}>
                    <text x={leftM + 4} y={ry - 3} fill="#64748B" fontSize={idxFontPt - 1} fontFamily="monospace" fontWeight="600">
                      {String(rowNum).padStart(2, '0')}
                    </text>
                    <line x1={leftM + 30} y1={ry} x2={lineEndX} y2={ry} stroke="#CBD5E1" strokeWidth="0.8" />
                    <line
                      x1={Math.max(leftM + 120, lineEndX - 100)}
                      y1={ry - 3}
                      x2={lineEndX - 4}
                      y2={ry - 3}
                      stroke="#94A3B8"
                      strokeWidth="0.8"
                      strokeDasharray="1.5,3.5"
                    />
                    {idxShowPageCol && (
                      <rect
                        x={rightEdgeX - pageBoxW}
                        y={ry - Math.min(13, rowStep * 0.65)}
                        width={pageBoxW}
                        height={Math.min(15, rowStep * 0.72)}
                        rx="2"
                        fill="#F8FAFC"
                        stroke="#94A3B8"
                        strokeWidth="0.75"
                      />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* 2. BULLET JOURNAL INDEX */}
        {t === 'index_bullet' && idxCfg && (() => {
          const rowsCount = Math.max(5, Math.min(34, idxCfg.entriesPerPage || 21));
          const rowStep = Math.min(maxRowCap, availTableH / rowsCount);
          const showDate = idxCfg.showDateField !== false;
          const keyDividerX = leftM + Math.round(contentW * 0.14);
          const pageDividerX = idxShowPageCol ? rightEdgeX - Math.round(contentW * 0.16) : rightEdgeX;
          const dateDividerX = showDate ? pageDividerX - Math.round(contentW * 0.18) : pageDividerX;
          return (
            <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
              <rect x={leftM} y={topM + 19} width={contentW} height="15" rx="2.5" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="0.75" />
              <rect x={leftM} y={tableHeaderY - 10} width={contentW} height="16" fill="#F1F5F9" stroke="#64748B" strokeWidth="0.8" rx="1.5" />
              {!hasEditableHeaders && (
                <>
                  <text x={leftM} y={topM + 13} fill="#0F172A" fontSize={idxFontPt + 3} fontWeight="800" letterSpacing="1.6px">
                    {idxCfg.title || 'BULLET JOURNAL INDEX'}
                  </text>
                  <text x={leftM + 8} y={topM + 29} fill="#334155" fontSize={idxFontPt - 1.5} fontWeight="700">
                    {idxCfg.subtitle || 'KEY SYMBOLS:  • Task   × Done   > Migrated   ★ Priority   ○ Event'}
                  </text>
                  <text x={leftM + 6} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                    {idxColLabels[0] || 'KEY'}
                  </text>
                  <text x={keyDividerX + 6} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                    {idxColLabels[1] || 'COLLECTION / TOPIC'}
                  </text>
                  {showDate && (
                    <text x={dateDividerX + 6} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[2] || 'DATE'}
                    </text>
                  )}
                  {idxShowPageCol && (
                    <text x={pageDividerX + 6} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[3] || 'PAGES'}
                    </text>
                  )}
                </>
              )}
              {Array.from({ length: rowsCount }).map((_, i) => {
                const ry = tableRowsStartY + i * rowStep;
                return (
                  <g key={i}>
                    <rect
                      x={leftM}
                      y={ry}
                      width={contentW}
                      height={rowStep}
                      fill={i % 2 === 0 ? 'none' : '#F8FAFC'}
                      stroke="#CBD5E1"
                      strokeWidth="0.65"
                    />
                    <line x1={keyDividerX} y1={ry} x2={keyDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    {showDate && (
                      <line x1={dateDividerX} y1={ry} x2={dateDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                    {idxShowPageCol && (
                      <line x1={pageDividerX} y1={ry} x2={pageDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                    <circle cx={leftM + (keyDividerX - leftM) / 2} cy={ry + rowStep / 2} r="2" fill="none" stroke="#94A3B8" strokeWidth="0.7" />
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* 3. NUMBERED REFERENCE INDEX (Supports 1-25, 1-50, 1-100, and Custom Ranges + 1/2/3 Columns) */}
        {t === 'index_numbered' && idxCfg && (() => {
          const preset = idxCfg.numberedRangePreset || '1-50';
          const rangeStart =
            typeof idxCfg.startEntryNumber === 'number'
              ? idxCfg.startEntryNumber
              : preset === 'custom'
              ? Math.max(1, idxCfg.customRangeStart || 1)
              : 1;
          const rangeEnd =
            typeof idxCfg.endEntryNumber === 'number'
              ? idxCfg.endEntryNumber
              : preset === '1-25'
              ? 25
              : preset === '1-50'
              ? 50
              : preset === '1-100'
              ? 100
              : Math.max(rangeStart + 1, idxCfg.customRangeEnd || 50);
          const totalItems = Math.max(1, Math.min(100, rangeEnd - rangeStart + 1));
          const colsCount =
            typeof idxCfg.columnsCount === 'number' && idxCfg.columnsCount >= 1 && idxCfg.columnsCount <= 3
              ? idxCfg.columnsCount
              : totalItems > 25
              ? 2
              : 1;
          const rowsPerCol = Math.ceil(totalItems / colsCount);
          const rowStep = Math.min(maxRowCap, availTableH / Math.max(1, rowsPerCol));
          const colGap = colsCount === 3 ? 8 : 12;
          const singleColW = (contentW - (colsCount - 1) * colGap) / colsCount;

          return (
            <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
              {!hasEditableHeaders && (
                <>
                  <text
                    x="216"
                    y={topM + 14}
                    fill="#0F172A"
                    fontSize={idxFontPt + 3}
                    fontWeight="800"
                    letterSpacing="1.6px"
                    textAnchor="middle"
                  >
                    {idxCfg.title || `NUMBERED REFERENCE INDEX (${String(rangeStart).padStart(2, '0')} – ${String(rangeEnd).padStart(2, '0')})`}
                  </text>
                  <line x1={leftM} y1={topM + 26} x2={rightEdgeX} y2={topM + 26} stroke="#1E293B" strokeWidth="1.1" />
                </>
              )}
              {Array.from({ length: colsCount }).map((_, col) => {
                const colX = leftM + col * (singleColW + colGap);
                return (
                  <g key={col}>
                    {!hasEditableHeaders && (
                      <>
                        <text x={colX + 2} y={tableHeaderY} fill="#475569" fontSize={idxFontPt - 1.5} fontWeight="700">
                          {idxColLabels[0] || 'NO.'}   {idxColLabels[1] || 'ENTRY / SUBJECT'}
                        </text>
                        {idxShowPageCol && (
                          <text x={colX + singleColW - 2} y={tableHeaderY} fill="#475569" fontSize={idxFontPt - 1.5} fontWeight="700" textAnchor="end">
                            {idxColLabels[2] || 'PG'}
                          </text>
                        )}
                      </>
                    )}
                    <line x1={colX} y1={tableHeaderY + 5} x2={colX + singleColW} y2={tableHeaderY + 5} stroke="#94A3B8" strokeWidth="0.8" />
                    {Array.from({ length: rowsPerCol }).map((__, r) => {
                      const itemOffset = col * rowsPerCol + r;
                      const num = rangeStart + itemOffset;
                      if (num > rangeEnd) return null;
                      const ry = tableRowsStartY + (r + 0.82) * rowStep;
                      const lineEnd = idxShowPageCol ? colX + singleColW - 26 : colX + singleColW - 2;
                      return (
                        <g key={num}>
                          <text
                            x={colX + 2}
                            y={ry - 2}
                            fill="#334155"
                            fontSize={Math.max(5.5, Math.min(idxFontPt - 1, rowStep * 0.55))}
                            fontFamily="monospace"
                            fontWeight="700"
                          >
                            {String(num).padStart(2, '0')}
                          </text>
                          <line x1={colX + 20} y1={ry} x2={lineEnd} y2={ry} stroke="#CBD5E1" strokeWidth="0.7" />
                          {idxShowPageCol && (
                            <rect
                              x={colX + singleColW - 22}
                              y={ry - Math.min(10, rowStep * 0.68)}
                              width="22"
                              height={Math.min(12, rowStep * 0.75)}
                              rx="1.5"
                              fill="none"
                              stroke="#94A3B8"
                              strokeWidth="0.65"
                            />
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* 4. A-Z ALPHABETICAL DIRECTORY INDEX */}
        {t === 'index_alphabetical' && idxCfg && (() => {
          const groupMode = idxCfg.letterGroupMode || '3-per-box';
          const seqIdx = idxCfg.pageSequenceIndex || 0;
          const seqTotal = idxCfg.pageSequenceTotal || idxCfg.pageCount || 1;
          const allGroups =
            groupMode === 'single-letters'
              ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
              : groupMode === '2-per-box'
              ? ['A • B', 'C • D', 'E • F', 'G • H', 'I • J', 'K • L', 'M • N', 'O • P', 'Q • R', 'S • T', 'U • V', 'W • X', 'Y • Z']
              : groupMode === 'a-m-n-z'
              ? ['A • B', 'C • D', 'E • F', 'G • H', 'I • J', 'K • L • M', 'N • O', 'P • Q', 'R • S', 'T • U', 'V • W', 'X • Y • Z']
              : ['A • B • C', 'D • E • F', 'G • H • I', 'J • K • L', 'M • N • O', 'P • Q • R', 'S • T • U', 'V • W • X', 'Y • Z • #'];
          const groups =
            groupMode === 'a-m-n-z' && seqTotal >= 2
              ? seqIdx % 2 === 0
                ? allGroups.slice(0, 6)
                : allGroups.slice(6)
              : groupMode === 'single-letters' && seqTotal >= 2
              ? seqIdx % 2 === 0
                ? allGroups.slice(0, 13)
                : allGroups.slice(13)
              : allGroups;
          const cols = groupMode === 'single-letters' ? 4 : 3;
          const rows = Math.ceil(groups.length / cols);
          const gapX = 6;
          const gapY = 6;
          const gridTopY = topM + 34;
          const gridAvailH = Math.max(180, bottomLimitY - gridTopY);
          const bw = (contentW - (cols - 1) * gapX) / cols;
          const bh = (gridAvailH - (rows - 1) * gapY) / rows;
          const headerBarH = Math.min(16, Math.max(10, bh * 0.22));
          const writingLines = Math.max(1, Math.min(10, idxCfg.linesPerSection || (groupMode === 'single-letters' ? 2 : 5)));

          return (
            <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
              {!hasEditableHeaders && (
                <>
                  <text
                    x="216"
                    y={topM + 14}
                    fill="#0F172A"
                    fontSize={idxFontPt + 3}
                    fontWeight="800"
                    letterSpacing="1.6px"
                    textAnchor="middle"
                  >
                    {idxCfg.title || 'A – Z ALPHABETICAL DIRECTORY'}
                  </text>
                  <line x1={leftM} y1={topM + 26} x2={rightEdgeX} y2={topM + 26} stroke="#1E293B" strokeWidth="1" />
                </>
              )}
              {groups.map((grp, idx) => {
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                const bx = leftM + col * (bw + gapX);
                const by = gridTopY + row * (bh + gapY);
                const lineZoneH = Math.max(12, bh - headerBarH - 4);
                const lineStep = lineZoneH / (writingLines + 0.3);
                return (
                  <g key={grp}>
                    <rect x={bx} y={by} width={bw} height={bh} rx="2.5" fill="none" stroke="#94A3B8" strokeWidth="0.8" />
                    <rect x={bx} y={by} width={bw} height={headerBarH} rx="2" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="0.65" />
                    <text x={bx + 5} y={by + headerBarH - 4} fill="#0F172A" fontSize={Math.min(7.5, headerBarH * 0.6)} fontWeight="800">
                      {grp}
                    </text>
                    {idxShowPageCol && (
                      <>
                        <text x={bx + bw - 4} y={by + headerBarH - 4} fill="#64748B" fontSize="6" fontWeight="700" textAnchor="end">
                          PG
                        </text>
                        <line x1={bx + bw - 20} y1={by + headerBarH} x2={bx + bw - 20} y2={by + bh} stroke="#E2E8F0" strokeWidth="0.6" />
                      </>
                    )}
                    {Array.from({ length: writingLines }).map((_, lIdx) => {
                      const ly = by + headerBarH + (lIdx + 0.85) * lineStep;
                      return (
                        <line
                          key={lIdx}
                          x1={bx + 4}
                          y1={ly}
                          x2={bx + bw - 4}
                          y2={ly}
                          stroke="#CBD5E1"
                          strokeWidth="0.6"
                        />
                      );
                    })}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* 5. CATEGORY & SUBJECT INDEX */}
        {t === 'index_categorical' && idxCfg && (() => {
          const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
          const boxesOnPage = Math.max(2, Math.min(6, idxCfg.entriesPerPage || 4));
          const startCatIdx = Math.max(0, (idxCfg.startEntryNumber || 1) - 1);
          const cards = Array.from({ length: boxesOnPage }).map(
            (_, idx) => `CATEGORY ${romans[(startCatIdx + idx) % romans.length]}`
          );
          const cols = 2;
          const rows = Math.ceil(cards.length / cols);
          const linesPerBox = Math.max(3, Math.min(12, idxCfg.linesPerSection || 8));
          const gapX = 10;
          const gapY = 10;
          const gridTopY = topM + 36;
          const gridAvailH = Math.max(180, bottomLimitY - gridTopY);
          const bw = (contentW - gapX) / cols;
          const bh = (gridAvailH - (rows - 1) * gapY) / rows;
          return (
            <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
              {!hasEditableHeaders && (
                <>
                  <text
                    x="216"
                    y={topM + 14}
                    fill="#0F172A"
                    fontSize={idxFontPt + 3}
                    fontWeight="800"
                    letterSpacing="1.6px"
                    textAnchor="middle"
                  >
                    {idxCfg.title || 'CATEGORY & SUBJECT INDEX'}
                  </text>
                  <line x1={leftM} y1={topM + 26} x2={rightEdgeX} y2={topM + 26} stroke="#1E293B" strokeWidth="1" />
                </>
              )}
              {cards.map((cat, idx) => {
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                const bx = leftM + col * (bw + gapX);
                const by = gridTopY + row * (bh + gapY);
                const lineStep = (bh - 28) / linesPerBox;
                return (
                  <g key={cat}>
                    <rect x={bx} y={by} width={bw} height={bh} rx="3" fill="none" stroke="#64748B" strokeWidth="0.85" />
                    <rect x={bx} y={by} width={bw} height="20" rx="2" fill="#F1F5F9" stroke="#64748B" strokeWidth="0.75" />
                    {!hasEditableHeaders && (
                      <text x={bx + 7} y={by + 13.5} fill="#0F172A" fontSize={idxFontPt - 1} fontWeight="800">
                        {cat}: ____________
                      </text>
                    )}
                    {idxShowPageCol && (
                      <>
                        <text x={bx + bw - 6} y={by + 13.5} fill="#475569" fontSize="6.8" fontWeight="700" textAnchor="end">
                          PG
                        </text>
                        <line x1={bx + bw - 26} y1={by + 20} x2={bx + bw - 26} y2={by + bh} stroke="#CBD5E1" strokeWidth="0.65" />
                      </>
                    )}
                    {Array.from({ length: linesPerBox }).map((_, r) => {
                      const ly = by + 24 + (r + 0.85) * lineStep;
                      return (
                        <line
                          key={r}
                          x1={bx + 5}
                          y1={ly}
                          x2={bx + bw - 5}
                          y2={ly}
                          stroke="#CBD5E1"
                          strokeWidth="0.65"
                        />
                      );
                    })}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* 6. PROJECT & ARCHIVE LOG INDEX */}
        {t === 'index_project' && idxCfg && (() => {
          const rowsCount = Math.max(5, Math.min(34, idxCfg.entriesPerPage || 20));
          const rowStep = Math.min(maxRowCap, availTableH / rowsCount);
          const showDate = idxCfg.showDateField !== false;
          const showStatus = idxCfg.showStatusField !== false;
          const dateDividerX = showDate ? leftM + Math.round(contentW * 0.17) : leftM;
          const pageDividerX = idxShowPageCol ? rightEdgeX - Math.round(contentW * 0.14) : rightEdgeX;
          const statusDividerX = showStatus ? pageDividerX - Math.round(contentW * 0.14) : pageDividerX;

          return (
            <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
              <rect x={leftM} y={tableHeaderY - 10} width={contentW} height="16" fill="#F1F5F9" stroke="#64748B" strokeWidth="0.8" rx="1.5" />
              {!hasEditableHeaders && (
                <>
                  <text x={leftM} y={topM + 14} fill="#0F172A" fontSize={idxFontPt + 2.8} fontWeight="800" letterSpacing="1.5px">
                    {idxCfg.title || 'PROJECT & ARCHIVE LOG INDEX'}
                  </text>
                  <text x={rightEdgeX} y={topM + 26} fill="#475569" fontSize={idxFontPt - 1.2} fontWeight="600" textAnchor="end">
                    {idxCfg.subtitle || 'VOLUME / ARCHIVE #: _________'}
                  </text>
                  {showDate && (
                    <text x={leftM + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[0] || 'DATE'}
                    </text>
                  )}
                  <text x={dateDividerX + 6} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                    {idxColLabels[1] || 'PROJECT / DELIVERABLE'}
                  </text>
                  {showStatus && (
                    <text x={statusDividerX + 6} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[2] || 'STATUS'}
                    </text>
                  )}
                  {idxShowPageCol && (
                    <text x={pageDividerX + 6} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[3] || 'PAGE #'}
                    </text>
                  )}
                </>
              )}
              {Array.from({ length: rowsCount }).map((_, i) => {
                const ry = tableRowsStartY + i * rowStep;
                return (
                  <g key={i}>
                    <rect x={leftM} y={ry} width={contentW} height={rowStep} fill="none" stroke="#CBD5E1" strokeWidth="0.65" />
                    {showDate && (
                      <line x1={dateDividerX} y1={ry} x2={dateDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                    {showStatus && (
                      <>
                        <line x1={statusDividerX} y1={ry} x2={statusDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                        <rect
                          x={statusDividerX + (pageDividerX - statusDividerX) / 2 - 4}
                          y={ry + (rowStep - 8) / 2}
                          width="8"
                          height="8"
                          rx="1.2"
                          fill="none"
                          stroke="#64748B"
                          strokeWidth="0.75"
                        />
                      </>
                    )}
                    {idxShowPageCol && (
                      <line x1={pageDividerX} y1={ry} x2={pageDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* 7. MONTHLY INDEX (12-Month Calendar & Milestone Directory) */}
        {t === 'index_monthly' && idxCfg && (() => {
          const months = [
            'JANUARY', 'FEBRUARY', 'MARCH',
            'APRIL', 'MAY', 'JUNE',
            'JULY', 'AUGUST', 'SEPTEMBER',
            'OCTOBER', 'NOVEMBER', 'DECEMBER',
          ];
          const cols = 3;
          const rows = 4;
          const gapX = 7;
          const gapY = 7;
          const gridTopY = topM + 36;
          const gridAvailH = Math.max(180, bottomLimitY - gridTopY);
          const bw = (contentW - (cols - 1) * gapX) / cols;
          const bh = (gridAvailH - (rows - 1) * gapY) / rows;
          const linesPerMonth = Math.max(2, Math.min(6, idxCfg.linesPerSection || 3));

          return (
            <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
              {!hasEditableHeaders && (
                <>
                  <text
                    x="216"
                    y={topM + 14}
                    fill="#0F172A"
                    fontSize={idxFontPt + 3}
                    fontWeight="800"
                    letterSpacing="1.6px"
                    textAnchor="middle"
                  >
                    {idxCfg.title || 'MONTHLY PLANNER & OVERVIEW INDEX'}
                  </text>
                  <text x={rightEdgeX} y={topM + 25} fill="#475569" fontSize={idxFontPt - 1.5} fontWeight="600" textAnchor="end">
                    {idxCfg.subtitle || 'YEAR: _________'}
                  </text>
                  <line x1={leftM} y1={topM + 28} x2={rightEdgeX} y2={topM + 28} stroke="#1E293B" strokeWidth="1" />
                </>
              )}
              {months.map((mName, idx) => {
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                const bx = leftM + col * (bw + gapX);
                const by = gridTopY + row * (bh + gapY);
                const lineStep = (bh - 20) / (linesPerMonth + 0.3);
                return (
                  <g key={mName}>
                    <rect x={bx} y={by} width={bw} height={bh} rx="2.5" fill="none" stroke="#94A3B8" strokeWidth="0.8" />
                    <rect x={bx} y={by} width={bw} height="16" rx="2" fill="#1E293B" />
                    <text x={bx + 5} y={by + 11} fill="#FFFFFF" fontSize="6.5" fontWeight="800" letterSpacing="0.5px">
                      {String(idx + 1).padStart(2, '0')} • {mName.slice(0, 3)}
                    </text>
                    {idxShowPageCol && (
                      <>
                        <text x={bx + bw - 4} y={by + 11} fill="#CBD5E1" fontSize="5.8" fontWeight="700" textAnchor="end">
                          PG
                        </text>
                        <line x1={bx + bw - 20} y1={by + 16} x2={bx + bw - 20} y2={by + bh} stroke="#E2E8F0" strokeWidth="0.6" />
                      </>
                    )}
                    {Array.from({ length: linesPerMonth }).map((_, lIdx) => {
                      const ly = by + 18 + (lIdx + 0.85) * lineStep;
                      return (
                        <line
                          key={lIdx}
                          x1={bx + 4}
                          y1={ly}
                          x2={bx + bw - 4}
                          y2={ly}
                          stroke="#CBD5E1"
                          strokeWidth="0.6"
                        />
                      );
                    })}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* 8. GLOSSARY & VOCABULARY INDEX */}
        {t === 'index_glossary' && idxCfg && (() => {
          const rowsCount = Math.max(5, Math.min(28, idxCfg.entriesPerPage || 16));
          const rowStep = Math.min(Math.max(maxRowCap, 30), availTableH / rowsCount);
          const showCat = idxCfg.showCategoryField !== false;
          const termDividerX = leftM + Math.round(contentW * 0.28);
          const pageDividerX = idxShowPageCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
          const catDividerX = showCat ? pageDividerX - Math.round(contentW * 0.17) : pageDividerX;

          return (
            <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
              <rect x={leftM} y={tableHeaderY - 10} width={contentW} height="16" fill="#F1F5F9" stroke="#64748B" strokeWidth="0.8" rx="1.5" />
              {!hasEditableHeaders && (
                <>
                  <text
                    x="216"
                    y={topM + 14}
                    fill="#0F172A"
                    fontSize={idxFontPt + 3}
                    fontWeight="800"
                    letterSpacing="1.6px"
                    textAnchor="middle"
                  >
                    {idxCfg.title || 'GLOSSARY & VOCABULARY INDEX'}
                  </text>
                  <text x={leftM + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                    {idxColLabels[0] || 'TERM / KEYWORD'}
                  </text>
                  <text x={termDividerX + 6} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                    {idxColLabels[1] || 'DEFINITION / MEANING'}
                  </text>
                  {showCat && (
                    <text x={catDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[2] || 'TAG'}
                    </text>
                  )}
                  {idxShowPageCol && (
                    <text x={pageDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[3] || 'PG #'}
                    </text>
                  )}
                </>
              )}
              {Array.from({ length: rowsCount }).map((_, i) => {
                const ry = tableRowsStartY + i * rowStep;
                return (
                  <g key={i}>
                    <rect
                      x={leftM}
                      y={ry}
                      width={contentW}
                      height={rowStep}
                      fill={i % 2 === 0 ? 'none' : '#F8FAFC'}
                      stroke="#CBD5E1"
                      strokeWidth="0.65"
                    />
                    <line x1={termDividerX} y1={ry} x2={termDividerX} y2={ry + rowStep} stroke="#94A3B8" strokeWidth="0.8" />
                    {rowStep >= 24 && (
                      <line
                        x1={termDividerX + 4}
                        y1={ry + rowStep * 0.52}
                        x2={catDividerX - 4}
                        y2={ry + rowStep * 0.52}
                        stroke="#E2E8F0"
                        strokeWidth="0.6"
                      />
                    )}
                    {showCat && (
                      <line x1={catDividerX} y1={ry} x2={catDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                    {idxShowPageCol && (
                      <line x1={pageDividerX} y1={ry} x2={pageDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* 9. READING & BOOK INDEX */}
        {t === 'index_reading' && idxCfg && (() => {
          const rowsCount = Math.max(5, Math.min(32, idxCfg.entriesPerPage || 18));
          const rowStep = Math.min(maxRowCap, availTableH / rowsCount);
          const showStatus = idxCfg.showStatusField !== false;
          const numDividerX = leftM + 24;
          const authorDividerX = leftM + Math.round(contentW * 0.44);
          const pageDividerX = idxShowPageCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
          const ratingDividerX = showStatus ? pageDividerX - Math.round(contentW * 0.19) : pageDividerX;
          const startNum = Math.max(1, idxCfg.startEntryNumber || 1);

          return (
            <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
              <rect x={leftM} y={tableHeaderY - 10} width={contentW} height="16" fill="#F1F5F9" stroke="#64748B" strokeWidth="0.8" rx="1.5" />
              {!hasEditableHeaders && (
                <>
                  <text x={leftM} y={topM + 14} fill="#0F172A" fontSize={idxFontPt + 2.8} fontWeight="800" letterSpacing="1.5px">
                    {idxCfg.title || 'READING & BOOK LOG INDEX'}
                  </text>
                  <text x={rightEdgeX} y={topM + 26} fill="#475569" fontSize={idxFontPt - 1.3} fontWeight="600" textAnchor="end">
                    {idxCfg.subtitle || 'READING GOAL: ____ BOOKS   COMPLETED: ____'}
                  </text>
                  <text x={leftM + 4} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                    #
                  </text>
                  <text x={numDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                    {idxColLabels[0] || 'BOOK / CHAPTER TITLE'}
                  </text>
                  <text x={authorDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                    {idxColLabels[1] || 'AUTHOR'}
                  </text>
                  {showStatus && (
                    <text x={ratingDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[2] || 'RATING'}
                    </text>
                  )}
                  {idxShowPageCol && (
                    <text x={pageDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[3] || 'PG #'}
                    </text>
                  )}
                </>
              )}
              {Array.from({ length: rowsCount }).map((_, i) => {
                const ry = tableRowsStartY + i * rowStep;
                const starZoneW = pageDividerX - ratingDividerX;
                const starStartX = ratingDividerX + Math.max(5, (starZoneW - 44) / 2);
                const rowNum = startNum + i;
                return (
                  <g key={i}>
                    <rect
                      x={leftM}
                      y={ry}
                      width={contentW}
                      height={rowStep}
                      fill={i % 2 === 0 ? 'none' : '#F8FAFC'}
                      stroke="#CBD5E1"
                      strokeWidth="0.65"
                    />
                    <line x1={numDividerX} y1={ry} x2={numDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    <text x={leftM + 4} y={ry + rowStep * 0.66} fill="#64748B" fontSize={idxFontPt - 1.8} fontFamily="monospace" fontWeight="600">
                      {String(rowNum).padStart(2, '0')}
                    </text>
                    <line x1={authorDividerX} y1={ry} x2={authorDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    {showStatus && (
                      <>
                        <line x1={ratingDividerX} y1={ry} x2={ratingDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                        {[0, 1, 2, 3, 4].map(st => (
                          <circle
                            key={st}
                            cx={starStartX + st * 9.5}
                            cy={ry + rowStep / 2}
                            r="3"
                            fill="none"
                            stroke="#64748B"
                            strokeWidth="0.7"
                          />
                        ))}
                      </>
                    )}
                    {idxShowPageCol && (
                      <line x1={pageDividerX} y1={ry} x2={pageDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* 10. RECIPE INDEX */}
        {t === 'index_recipe' && idxCfg && (() => {
          const rowsCount = Math.max(5, Math.min(32, idxCfg.entriesPerPage || 19));
          const rowStep = Math.min(maxRowCap, availTableH / rowsCount);
          const showCat = idxCfg.showCategoryField !== false;
          const showTime = idxCfg.showNotesField !== false;
          const catDividerX = showCat ? leftM + Math.round(contentW * 0.45) : leftM + Math.round(contentW * 0.65);
          const pageDividerX = idxShowPageCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
          const timeDividerX = showTime ? pageDividerX - Math.round(contentW * 0.19) : pageDividerX;

          return (
            <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
              <rect x={leftM} y={topM + 19} width={contentW} height="15" rx="2.5" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="0.75" />
              <rect x={leftM} y={tableHeaderY - 10} width={contentW} height="16" fill="#F1F5F9" stroke="#64748B" strokeWidth="0.8" rx="1.5" />
              {!hasEditableHeaders && (
                <>
                  <text x={leftM} y={topM + 13} fill="#0F172A" fontSize={idxFontPt + 2.8} fontWeight="800" letterSpacing="1.5px">
                    {idxCfg.title || 'CULINARY & RECIPE INDEX'}
                  </text>
                  <text x={leftM + 8} y={topM + 29} fill="#334155" fontSize={idxFontPt - 1.5} fontWeight="700">
                    {idxCfg.subtitle || 'COURSES:  [ ] Breakfast   [ ] Mains   [ ] Sides   [ ] Baking   [ ] Drinks'}
                  </text>
                  <text x={leftM + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                    {idxColLabels[0] || 'RECIPE NAME'}
                  </text>
                  {showCat && (
                    <text x={catDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[1] || 'COURSE'}
                    </text>
                  )}
                  {showTime && (
                    <text x={timeDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[2] || 'PREP / ★'}
                    </text>
                  )}
                  {idxShowPageCol && (
                    <text x={pageDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[3] || 'PG #'}
                    </text>
                  )}
                </>
              )}
              {Array.from({ length: rowsCount }).map((_, i) => {
                const ry = tableRowsStartY + i * rowStep;
                return (
                  <g key={i}>
                    <rect x={leftM} y={ry} width={contentW} height={rowStep} fill="none" stroke="#CBD5E1" strokeWidth="0.65" />
                    {showCat && (
                      <>
                        <line x1={catDividerX} y1={ry} x2={catDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                        <rect
                          x={catDividerX + 6}
                          y={ry + (rowStep - 11) / 2}
                          width={Math.max(24, timeDividerX - catDividerX - 12)}
                          height="11"
                          rx="3"
                          fill="#F8FAFC"
                          stroke="#94A3B8"
                          strokeWidth="0.6"
                        />
                      </>
                    )}
                    {showTime && (
                      <line x1={timeDividerX} y1={ry} x2={timeDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                    {idxShowPageCol && (
                      <line x1={pageDividerX} y1={ry} x2={pageDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* 11. STUDY & RESEARCH INDEX */}
        {t === 'index_study' && idxCfg && (() => {
          const rowsCount = Math.max(5, Math.min(32, idxCfg.entriesPerPage || 18));
          const rowStep = Math.min(maxRowCap, availTableH / rowsCount);
          const showCat = idxCfg.showCategoryField !== false;
          const showStatus = idxCfg.showStatusField !== false;
          const moduleDividerX = showCat ? leftM + Math.round(contentW * 0.42) : leftM + Math.round(contentW * 0.62);
          const pageDividerX = idxShowPageCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
          const reviewDividerX = showStatus ? pageDividerX - Math.round(contentW * 0.21) : pageDividerX;

          return (
            <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
              <rect x={leftM} y={topM + 19} width={contentW} height="15" rx="2.5" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="0.75" />
              <rect x={leftM} y={tableHeaderY - 10} width={contentW} height="16" fill="#F1F5F9" stroke="#64748B" strokeWidth="0.8" rx="1.5" />
              {!hasEditableHeaders && (
                <>
                  <text x={leftM} y={topM + 13} fill="#0F172A" fontSize={idxFontPt + 2.8} fontWeight="800" letterSpacing="1.5px">
                    {idxCfg.title || 'STUDY & RESEARCH TOPIC INDEX'}
                  </text>
                  <text x={leftM + 8} y={topM + 29} fill="#334155" fontSize={idxFontPt - 1.5} fontWeight="700">
                    {idxCfg.subtitle || 'COURSE / SUBJECT: ______________________    SEMESTER: _________'}
                  </text>
                  <text x={leftM + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                    {idxColLabels[0] || 'LECTURE / RESEARCH TOPIC'}
                  </text>
                  {showCat && (
                    <text x={moduleDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[1] || 'SOURCE / UNIT'}
                    </text>
                  )}
                  {showStatus && (
                    <text x={reviewDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[2] || 'MASTERY'}
                    </text>
                  )}
                  {idxShowPageCol && (
                    <text x={pageDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[3] || 'PG #'}
                    </text>
                  )}
                </>
              )}
              {Array.from({ length: rowsCount }).map((_, i) => {
                const ry = tableRowsStartY + i * rowStep;
                const boxStartX = reviewDividerX + Math.max(6, (pageDividerX - reviewDividerX - 42) / 2);
                return (
                  <g key={i}>
                    <rect
                      x={leftM}
                      y={ry}
                      width={contentW}
                      height={rowStep}
                      fill={i % 2 === 0 ? 'none' : '#F8FAFC'}
                      stroke="#CBD5E1"
                      strokeWidth="0.65"
                    />
                    {showCat && (
                      <line x1={moduleDividerX} y1={ry} x2={moduleDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                    {showStatus && (
                      <>
                        <line x1={reviewDividerX} y1={ry} x2={reviewDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                        {[0, 1, 2].map(chk => (
                          <rect
                            key={chk}
                            x={boxStartX + chk * 14}
                            y={ry + (rowStep - 8) / 2}
                            width="8"
                            height="8"
                            rx="1"
                            fill="none"
                            stroke="#64748B"
                            strokeWidth="0.7"
                          />
                        ))}
                      </>
                    )}
                    {idxShowPageCol && (
                      <line x1={pageDividerX} y1={ry} x2={pageDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* 12. COLLECTION & INVENTORY INDEX */}
        {t === 'index_collection' && idxCfg && (() => {
          const rowsCount = Math.max(5, Math.min(34, idxCfg.entriesPerPage || 20));
          const rowStep = Math.min(maxRowCap, availTableH / rowsCount);
          const showCat = idxCfg.showCategoryField !== false;
          const showStatus = idxCfg.showStatusField !== false;
          const idDividerX = leftM + Math.round(contentW * 0.14);
          const pageDividerX = idxShowPageCol ? rightEdgeX - Math.round(contentW * 0.13) : rightEdgeX;
          const condDividerX = showStatus ? pageDividerX - Math.round(contentW * 0.16) : pageDividerX;
          const locDividerX = showCat ? condDividerX - Math.round(contentW * 0.18) : condDividerX;
          const startNum = Math.max(1, idxCfg.startEntryNumber || 1);

          return (
            <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
              <rect x={leftM} y={tableHeaderY - 10} width={contentW} height="16" fill="#F1F5F9" stroke="#64748B" strokeWidth="0.8" rx="1.5" />
              {!hasEditableHeaders && (
                <>
                  <text x={leftM} y={topM + 14} fill="#0F172A" fontSize={idxFontPt + 2.8} fontWeight="800" letterSpacing="1.5px">
                    {idxCfg.title || 'COLLECTION & INVENTORY INDEX'}
                  </text>
                  <text x={rightEdgeX} y={topM + 26} fill="#475569" fontSize={idxFontPt - 1.3} fontWeight="600" textAnchor="end">
                    {idxCfg.subtitle || 'COLLECTION / LOCATION: __________________'}
                  </text>
                  <text x={leftM + 4} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                    {idxColLabels[0] || 'ID #'}
                  </text>
                  <text x={idDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                    {idxColLabels[1] || 'ITEM / SPECIMEN'}
                  </text>
                  {showCat && (
                    <text x={locDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[2] || 'BOX / LOC'}
                    </text>
                  )}
                  {showStatus && (
                    <text x={condDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[3] || 'QTY'}
                    </text>
                  )}
                  {idxShowPageCol && (
                    <text x={pageDividerX + 5} y={tableHeaderY + 1} fill="#0F172A" fontSize={idxFontPt - 1.4} fontWeight="700">
                      {idxColLabels[4] || 'PG #'}
                    </text>
                  )}
                </>
              )}
              {Array.from({ length: rowsCount }).map((_, i) => {
                const ry = tableRowsStartY + i * rowStep;
                const rowNum = startNum + i;
                return (
                  <g key={i}>
                    <rect
                      x={leftM}
                      y={ry}
                      width={contentW}
                      height={rowStep}
                      fill={i % 2 === 0 ? 'none' : '#F8FAFC'}
                      stroke="#CBD5E1"
                      strokeWidth="0.65"
                    />
                    <line x1={idDividerX} y1={ry} x2={idDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    <text x={leftM + 5} y={ry + rowStep * 0.65} fill="#64748B" fontSize={idxFontPt - 1.8} fontFamily="monospace">
                      #{String(rowNum).padStart(3, '0')}
                    </text>
                    {showCat && (
                      <line x1={locDividerX} y1={ry} x2={locDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                    {showStatus && (
                      <line x1={condDividerX} y1={ry} x2={condDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                    {idxShowPageCol && (
                      <line x1={pageDividerX} y1={ry} x2={pageDividerX} y2={ry + rowStep} stroke="#CBD5E1" strokeWidth="0.65" />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* Optional Bottom Notes Box for Index Pages when showNotesField is enabled */}
        {isIndexTemplateType(t) && idxShowNotes && (
          <g fontFamily="Plus Jakarta Sans, Inter, sans-serif">
            <rect
              x={leftM}
              y={bottomLimitY + 6}
              width={contentW}
              height="36"
              rx="2"
              fill="#F8FAFC"
              stroke="#94A3B8"
              strokeWidth="0.75"
            />
            {!hasEditableHeaders && (
              <text x={leftM + 6} y={bottomLimitY + 16} fill="#475569" fontSize="6.5" fontWeight="700">
                NOTES / REFERENCE KEY:
              </text>
            )}
            <line
              x1={leftM + 6}
              y1={bottomLimitY + 26}
              x2={rightEdgeX - 6}
              y2={bottomLimitY + 26}
              stroke="#CBD5E1"
              strokeWidth="0.6"
            />
            <line
              x1={leftM + 6}
              y1={bottomLimitY + 36}
              x2={rightEdgeX - 6}
              y2={bottomLimitY + 36}
              stroke="#CBD5E1"
              strokeWidth="0.6"
            />
          </g>
        )}

        {/* Footer Page Number */}
        {showNumber && (
          <text
            x="216"
            y="618"
            fontSize="8.5"
            fontFamily="Plus Jakarta Sans, sans-serif"
            textAnchor="middle"
            fill="#64748B"
          >
            {pageNumber}
          </text>
        )}
      </g>
    );
  };

  // Helper to render live miniature thumbnail previews that reflect real page content (including paper cover images)
  const renderPageThumbnailContent = (page: StudioPage) => {
    if (page.isCover) {
      const titleEl = page.elements.find(e => e.type === 'text');
      const subtitleEl = page.elements.filter(e => e.type === 'text')[1];
      const coverImages = page.elements.filter(e => e.type === 'image' && e.imageUrl);
      const isFullCoverImg = coverImages.some(img => img.height >= 60 || img.width >= 40);
      return (
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-1 relative overflow-hidden">
          {coverImages.map(img => (
            <img
              key={img.id}
              src={img.imageUrl}
              alt={img.imageAlt || 'Paper cover'}
              style={{
                opacity: img.opacity ?? 1,
              }}
              className={
                isFullCoverImg
                  ? 'absolute inset-0 w-full h-full object-cover pointer-events-none'
                  : 'w-8 h-8 object-contain mb-0.5 pointer-events-none z-10'
              }
            />
          ))}
          <div className="relative z-10 flex flex-col items-center justify-center bg-white/75 backdrop-blur-[1px] px-1 py-0.5 rounded-xs max-w-full">
            <div className="text-[7px] font-serif font-bold text-[#171923] tracking-wider truncate max-w-full">
              {titleEl?.text || 'NOTEBOOK'}
            </div>
            <div className="w-4 h-[0.5px] bg-slate-500 my-0.5" />
            <div className="text-[4.5px] text-slate-600 uppercase tracking-tight truncate max-w-full">
              {subtitleEl?.text || 'DAILY REFLECTIONS'}
            </div>
          </div>
        </div>
      );
    }

    const t = page.templateType || 'lined';
    const pageImages = page.elements.filter(e => e.type === 'image' && e.imageUrl);
    return (
      <div className="w-full h-full flex flex-col justify-between py-1 relative overflow-hidden">
        {isIndexTemplateType(t) ? (
          <div className="w-full h-full flex items-center justify-center">
            {renderIndexCardMiniSvg(
              (t === 'index' ? 'index_classic' : t) as IndexTemplateStyle
            )}
          </div>
        ) : t === 'dotgrid' ? (
          <div className="w-full h-full grid grid-cols-6 gap-1 p-1 place-items-center">
            {Array.from({ length: 36 }).map((_, idx) => (
              <div key={idx} className="w-[1.5px] h-[1.5px] rounded-full bg-slate-400" />
            ))}
          </div>
        ) : t === 'graph' ? (
          <div className="w-full h-full grid grid-cols-5 grid-rows-7 border border-slate-200">
            {Array.from({ length: 35 }).map((_, idx) => (
              <div key={idx} className="border-[0.25px] border-slate-200" />
            ))}
          </div>
        ) : t === 'daily_planner' || t === 'weekly_overview' ? (
          <div className="w-full h-full flex flex-col gap-1 p-0.5">
            <div className="h-1.5 w-2/3 bg-slate-300 rounded-xs" />
            <div className="flex-1 grid grid-cols-2 gap-1">
              <div className="border border-slate-300 rounded-xs" />
              <div className="border border-slate-300 rounded-xs" />
            </div>
            <div className="h-4 border border-slate-300 rounded-xs" />
          </div>
        ) : t === 'blank' ? (
          <div className="w-full h-full border border-dashed border-slate-200 flex items-center justify-center">
            <span className="text-[6px] text-slate-400">Blank</span>
          </div>
        ) : (
          Array.from({ length: 12 }).map((_, lineIdx) => (
            <div key={lineIdx} className="w-full h-[0.5px] bg-slate-300" />
          ))
        )}

        {/* Render actual miniature image overlay on interior page thumbnail if present */}
        {pageImages.map(img => (
          <img
            key={img.id}
            src={img.imageUrl}
            alt={img.imageAlt || 'Page image'}
            style={{
              left: `${img.x}%`,
              top: `${img.y}%`,
              width: `${img.width}%`,
              height: `${img.height}%`,
              opacity: img.opacity ?? 1,
            }}
            className="absolute object-contain pointer-events-none"
          />
        ))}

        {/* Custom element indicator badge on thumbnail */}
        {page.elements.length > 0 && (
          <div className="absolute bottom-0.5 right-0.5 px-1 py-0.2 bg-[#1677FF] text-white text-[6px] font-bold rounded-xs shadow-xs z-10">
            {page.elements.length}
          </div>
        )}
      </div>
    );
  };

  // Horizontal & Vertical Ruler ticks generator
  const horizontalRulerTicks = useMemo(() => {
    const isTwoPage = isEditingCover || spreadMode === 'full';
    const totalInches = isEditingCover
      ? Math.ceil(coverSpecs.totalWidth)
      : isTwoPage
      ? Math.ceil(currentTrim.w * 2)
      : Math.ceil(currentTrim.w);
    const ticks: { posPct: number; label?: string; isMajor: boolean; isHalf: boolean }[] = [];
    const subDivisions = 8; // 1/8th inch ticks matching reference
    const totalSteps = totalInches * subDivisions;
    for (let i = 0; i <= totalSteps; i++) {
      const inchVal = i / subDivisions;
      const posPct = (inchVal / totalInches) * 100;
      const isMajor = i % subDivisions === 0;
      const isHalf = i % (subDivisions / 2) === 0 && !isMajor;
      const displayLabel = isMajor
        ? unit === 'in'
          ? String(inchVal)
          : unit === 'cm'
          ? String(Math.round(inchVal * 2.54))
          : String(Math.round(inchVal * 25.4))
        : undefined;
      ticks.push({ posPct, label: displayLabel, isMajor, isHalf });
    }
    return { ticks, totalInches };
  }, [isEditingCover, spreadMode, coverSpecs.totalWidth, currentTrim.w, unit]);

  const verticalRulerTicks = useMemo(() => {
    const totalInches = Math.ceil(currentTrim.h);
    const ticks: { posPct: number; label?: string; isMajor: boolean; isHalf: boolean }[] = [];
    const subDivisions = 8;
    const totalSteps = totalInches * subDivisions;
    for (let i = 0; i <= totalSteps; i++) {
      const inchVal = i / subDivisions;
      const posPct = (inchVal / totalInches) * 100;
      const isMajor = i % subDivisions === 0;
      const isHalf = i % (subDivisions / 2) === 0 && !isMajor;
      const displayLabel = isMajor
        ? unit === 'in'
          ? String(inchVal)
          : unit === 'cm'
          ? String(Math.round(inchVal * 2.54))
          : String(Math.round(inchVal * 25.4))
        : undefined;
      ticks.push({ posPct, label: displayLabel, isMajor, isHalf });
    }
    return { ticks, totalInches };
  }, [currentTrim.h, unit]);

  // Helper to render HTML <img> overlays inside the Book Preview Modal cards so every image format renders reliably
  const renderPreviewHtmlImageOverlays = (elements: StudioElement[]) => {
    const imgElements = elements.filter(el => el.type === 'image' && el.imageUrl);
    if (imgElements.length === 0) return null;
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
        {imgElements.map(img => (
          <img
            key={`html-preview-${img.id}`}
            data-testid="preview-html-image"
            src={img.imageUrl}
            alt={img.imageAlt || 'Paper cover image'}
            style={{
              left: `${img.x}%`,
              top: `${img.y}%`,
              width: `${img.width}%`,
              height: `${img.height}%`,
              opacity: img.opacity ?? 1,
            }}
            className="absolute object-fill pointer-events-none select-none"
          />
        ))}
      </div>
    );
  };

  // Helper to render read-only SVG elements (images, shapes, typography) inside the Book Preview Modal
  const renderReadOnlyCanvasElements = (
    elements: StudioElement[],
    canvasW: number,
    canvasH: number,
    isCoverCanvas: boolean
  ) => {
    return elements.map(el => {
      const cx = (el.x / 100) * canvasW;
      const cy = (el.y / 100) * canvasH;
      const cw = (el.width / 100) * canvasW;
      const ch = (el.height / 100) * canvasH;

      return (
        <g key={el.id} style={{ opacity: el.opacity ?? 1 }} pointerEvents="none">
          {el.type === 'image' && el.imageUrl && (
            <image
              data-testid="preview-rendered-image"
              href={el.imageUrl}
              xlinkHref={el.imageUrl}
              x={cx}
              y={cy}
              width={cw}
              height={ch}
              preserveAspectRatio="none"
            />
          )}

          {el.type === 'shape' && el.shapeType === 'rect' && (
            <rect
              x={cx}
              y={cy}
              width={cw}
              height={ch}
              rx={el.borderRadius || 0}
              fill={el.fill || 'none'}
              stroke={el.stroke || '#171923'}
              strokeWidth={el.strokeWidth || 1.6}
            />
          )}

          {el.type === 'shape' && el.shapeType === 'circle' && (
            <ellipse
              cx={cx + cw / 2}
              cy={cy + ch / 2}
              rx={cw / 2}
              ry={ch / 2}
              fill={el.fill || 'none'}
              stroke={el.stroke || '#171923'}
              strokeWidth={el.strokeWidth || 1.6}
            />
          )}

          {el.type === 'shape' && el.shapeType === 'line' && (
            <line
              x1={cx}
              y1={cy + ch / 2}
              x2={cx + cw}
              y2={cy + ch / 2}
              stroke={el.stroke || '#171923'}
              strokeWidth={el.strokeWidth || 1.4}
            />
          )}

          {el.type === 'shape' &&
            el.shapeType &&
            !['rect', 'circle', 'line'].includes(el.shapeType) && (
              <polygon
                points={
                  el.shapeType === 'triangle'
                    ? `${cx + cw / 2},${cy} ${cx + cw},${cy + ch} ${cx},${cy + ch}`
                    : `${cx + cw * 0.5},${cy} ${cx + cw * 0.63},${cy + ch * 0.35} ${cx + cw},${cy + ch * 0.38} ${cx + cw * 0.71},${cy + ch * 0.62} ${cx + cw * 0.81},${cy + ch} ${cx + cw * 0.5},${cy + ch * 0.78} ${cx + cw * 0.19},${cy + ch} ${cx + cw * 0.29},${cy + ch * 0.62} ${cx},${cy + ch * 0.38} ${cx + cw * 0.37},${cy + ch * 0.35}`
                }
                fill={el.fill || 'none'}
                stroke={el.stroke || '#171923'}
                strokeWidth={el.strokeWidth || 1.6}
              />
            )}

          {el.type === 'text' && (
            <text
              x={el.textAlign === 'center' ? cx + cw / 2 : el.textAlign === 'right' ? cx + cw : cx}
              y={cy + ch * 0.72}
              textAnchor={el.textAlign === 'center' ? 'middle' : el.textAlign === 'right' ? 'end' : 'start'}
              fill={el.fill || '#171923'}
              fontSize={
                el.id.startsWith('idx-')
                  ? (el.fontSize || 8.5) * (canvasH / 648)
                  : (el.fontSize || 16) * (isCoverCanvas ? 1.55 : 1.25)
              }
              fontWeight={el.fontWeight || 'bold'}
              fontStyle={el.fontStyle || 'normal'}
              fontFamily={el.fontFamily || 'Playfair Display, Georgia, serif'}
              letterSpacing={
                typeof el.letterSpacing === 'number'
                  ? `${el.letterSpacing * (el.id.startsWith('idx-') ? canvasH / 648 : 1)}px`
                  : el.id.startsWith('idx-')
                  ? '0px'
                  : (el.fontSize || 16) < 12
                  ? '2.2px'
                  : '3.5px'
              }
            >
              {el.text}
            </text>
          )}
        </g>
      );
    });
  };

  // Helper to render interactive elements on either Cover or Interior SVG canvas
  const renderInteractiveCanvasElements = (canvasW: number, canvasH: number) => {
    return activePage.elements.map(el => {
      const isSelected = el.id === selectedElementId;
      const cx = (el.x / 100) * canvasW;
      const cy = (el.y / 100) * canvasH;
      const cw = (el.width / 100) * canvasW;
      const ch = (el.height / 100) * canvasH;

      return (
        <g
          key={el.id}
          data-canvas-element="true"
          data-element-id={el.id}
          onPointerDown={e => handleElementPointerDown(e, el.id)}
          onMouseDown={e => handleMouseDown(e, el.id)}
          style={{
            cursor: isEffectivePanMode
              ? isPanningCanvas
                ? 'grabbing'
                : 'grab'
              : el.locked
              ? 'not-allowed'
              : 'move',
            opacity: el.opacity ?? 1,
            touchAction: 'none',
          }}
        >
          <rect x={cx} y={cy} width={cw} height={ch} fill="transparent" pointerEvents="auto" />

          {el.type === 'image' && el.imageUrl && (
            <image
              href={el.imageUrl}
              x={cx}
              y={cy}
              width={cw}
              height={ch}
              preserveAspectRatio="none"
            />
          )}

          {el.type === 'shape' && el.shapeType === 'rect' && (
            <rect
              x={cx}
              y={cy}
              width={cw}
              height={ch}
              rx={el.borderRadius || 0}
              fill={el.fill || 'none'}
              stroke={el.stroke || '#171923'}
              strokeWidth={el.strokeWidth || 1.6}
            />
          )}

          {el.type === 'shape' && el.shapeType === 'circle' && (
            <ellipse
              cx={cx + cw / 2}
              cy={cy + ch / 2}
              rx={cw / 2}
              ry={ch / 2}
              fill={el.fill || 'none'}
              stroke={el.stroke || '#171923'}
              strokeWidth={el.strokeWidth || 1.6}
            />
          )}

          {el.type === 'shape' && el.shapeType === 'line' && (
            <line
              x1={cx}
              y1={cy + ch / 2}
              x2={cx + cw}
              y2={cy + ch / 2}
              stroke={el.stroke || '#171923'}
              strokeWidth={el.strokeWidth || 1.4}
            />
          )}

          {el.type === 'shape' &&
            el.shapeType &&
            !['rect', 'circle', 'line'].includes(el.shapeType) && (
              <polygon
                points={
                  el.shapeType === 'triangle'
                    ? `${cx + cw / 2},${cy} ${cx + cw},${cy + ch} ${cx},${cy + ch}`
                    : `${cx + cw * 0.5},${cy} ${cx + cw * 0.63},${cy + ch * 0.35} ${cx + cw},${cy + ch * 0.38} ${cx + cw * 0.71},${cy + ch * 0.62} ${cx + cw * 0.81},${cy + ch} ${cx + cw * 0.5},${cy + ch * 0.78} ${cx + cw * 0.19},${cy + ch} ${cx + cw * 0.29},${cy + ch * 0.62} ${cx},${cy + ch * 0.38} ${cx + cw * 0.37},${cy + ch * 0.35}`
                }
                fill={el.fill || 'none'}
                stroke={el.stroke || '#171923'}
                strokeWidth={el.strokeWidth || 1.6}
              />
            )}

          {el.type === 'text' && (
            <text
              x={el.textAlign === 'center' ? cx + cw / 2 : el.textAlign === 'right' ? cx + cw : cx}
              y={cy + ch * 0.72}
              textAnchor={el.textAlign === 'center' ? 'middle' : el.textAlign === 'right' ? 'end' : 'start'}
              fill={el.fill || '#171923'}
              fontSize={
                el.id.startsWith('idx-')
                  ? (el.fontSize || 8.5) * (canvasH / 648)
                  : (el.fontSize || 16) * (isEditingCover ? 1.55 : 1.25)
              }
              fontWeight={el.fontWeight || 'bold'}
              fontStyle={el.fontStyle || 'normal'}
              fontFamily={el.fontFamily || 'Playfair Display, Georgia, serif'}
              letterSpacing={
                typeof el.letterSpacing === 'number'
                  ? `${el.letterSpacing * (el.id.startsWith('idx-') ? canvasH / 648 : 1)}px`
                  : el.id.startsWith('idx-')
                  ? '0px'
                  : (el.fontSize || 16) < 12
                  ? '2.2px'
                  : '3.5px'
              }
            >
              {el.text}
            </text>
          )}

          {/* Selection Bounding Box + Ergonomic 8-Point Resize Handles (Touchscreen & Smart Pen friendly) */}
          {isSelected &&
            (() => {
              const renderedWidthPx =
                (isEditingCover || spreadMode === 'full' ? coverSpecs.totalWidth : currentTrim.w) *
                effectiveScalePxPerIn;
              const svgPerScreenPx = renderedWidthPx > 0 ? canvasW / renderedWidthPx : 1.5;

              const leftX = cx;
              const rightX = cx + cw;
              const topY = cy;
              const bottomY = cy + ch;
              const midX = (leftX + rightX) / 2;
              const midY = (topY + bottomY) / 2;

              const exactHandles: {
                id: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
                hx: number;
                hy: number;
                isCorner: boolean;
              }[] = [
                { id: 'nw', hx: leftX, hy: topY, isCorner: true },
                { id: 'n', hx: midX, hy: topY, isCorner: false },
                { id: 'ne', hx: rightX, hy: topY, isCorner: true },
                { id: 'e', hx: rightX, hy: midY, isCorner: false },
                { id: 'se', hx: rightX, hy: bottomY, isCorner: true },
                { id: 's', hx: midX, hy: bottomY, isCorner: false },
                { id: 'sw', hx: leftX, hy: bottomY, isCorner: true },
                { id: 'w', hx: leftX, hy: midY, isCorner: false },
              ];

              const baseHitScreenPx =
                activePointerType === 'touch' || activePointerType === 'pen' ? 42 : 30;
              const hitSize = Math.max(24, Math.round(baseHitScreenPx * svgPerScreenPx));
              const cornerRadius = Math.max(5, Math.round(6.5 * svgPerScreenPx));
              const pillLong = Math.max(13, Math.round(16 * svgPerScreenPx));
              const pillShort = Math.max(6, Math.round(8 * svgPerScreenPx));
              const strokeW = Math.max(1.5, Number((2 * svgPerScreenPx).toFixed(2)));

              return (
                <g>
                  <rect
                    x={cx}
                    y={cy}
                    width={cw}
                    height={ch}
                    fill="none"
                    stroke={el.locked ? '#F59E0B' : '#1677FF'}
                    strokeWidth={strokeW}
                    pointerEvents="none"
                  />
                  {!el.locked &&
                    exactHandles.map(h => {
                      const isActiveHandle = resizingHandle === h.id;
                      return (
                        <g
                          key={h.id}
                          data-resize-handle={h.id}
                          style={{
                            cursor: isEffectivePanMode
                              ? isPanningCanvas
                                ? 'grabbing'
                                : 'grab'
                              : `${h.id}-resize`,
                            touchAction: 'none',
                          }}
                          onPointerDown={e => handleResizePointerDown(e, h.id)}
                          onMouseDown={e => handleResizeStart(e, h.id)}
                        >
                          {/* Screen-adaptive invisible hit area so grabbing with mouse, finger, or smart pen is effortless */}
                          <rect
                            x={h.hx - hitSize / 2}
                            y={h.hy - hitSize / 2}
                            width={hitSize}
                            height={hitSize}
                            fill="transparent"
                            pointerEvents="all"
                          />
                          {h.isCorner ? (
                            <circle
                              cx={h.hx}
                              cy={h.hy}
                              r={isActiveHandle ? cornerRadius * 1.25 : cornerRadius}
                              fill={isActiveHandle ? '#1677FF' : '#FFFFFF'}
                              stroke="#1677FF"
                              strokeWidth={strokeW}
                            />
                          ) : h.id === 'n' || h.id === 's' ? (
                            <rect
                              x={h.hx - pillLong / 2}
                              y={h.hy - pillShort / 2}
                              width={pillLong}
                              height={pillShort}
                              rx={pillShort / 2}
                              fill={isActiveHandle ? '#1677FF' : '#FFFFFF'}
                              stroke="#1677FF"
                              strokeWidth={strokeW}
                            />
                          ) : (
                            <rect
                              x={h.hx - pillShort / 2}
                              y={h.hy - pillLong / 2}
                              width={pillShort}
                              height={pillLong}
                              rx={pillShort / 2}
                              fill={isActiveHandle ? '#1677FF' : '#FFFFFF'}
                              stroke="#1677FF"
                              strokeWidth={strokeW}
                            />
                          )}
                        </g>
                      );
                    })}
                </g>
              );
            })()}
        </g>
      );
    });
  };

  // Filtered 12 Index Templates by Category & Search Query
  const filteredIndexTemplates = useMemo(() => {
    return INDEX_PAGE_TEMPLATES.filter(tmpl => {
      const matchesCat =
        selectedIndexCategory === 'All' || tmpl.category === selectedIndexCategory;
      const q = indexSearchQuery.trim().toLowerCase();
      const matchesSearch =
        q === '' ||
        tmpl.title.toLowerCase().includes(q) ||
        tmpl.shortLabel.toLowerCase().includes(q) ||
        tmpl.category.toLowerCase().includes(q) ||
        tmpl.description.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [selectedIndexCategory, indexSearchQuery]);

  // Render template-specific configuration controls (only shows relevant fields for the selected template)
  const renderIndexConfigurationControls = (compact: boolean = false) => {
    const activeIndexMeta =
      INDEX_PAGE_TEMPLATES.find(t => t.id === selectedIndexStyle) || INDEX_PAGE_TEMPLATES[0];
    const effectiveTotalEntries =
      indexConfigDraft.indexMode === 'linked' &&
      indexConfigDraft.entries &&
      indexConfigDraft.entries.length > 0
        ? Math.max(
            indexConfigDraft.entries.length,
            indexConfigDraft.totalEntriesRequested || indexConfigDraft.entriesPerPage || 22
          )
        : indexConfigDraft.totalEntriesRequested || indexConfigDraft.entriesPerPage || 22;
    const paginationInfo = calculateIndexPagination({
      templateId: selectedIndexStyle,
      totalEntriesRequested: effectiveTotalEntries,
      pageCount: indexConfigDraft.pageCount || 1,
      fontSizePt: indexConfigDraft.fontSizePt || 8.5,
      lineSpacing: indexConfigDraft.lineSpacing || 'normal',
      trimHeightIn: currentTrim.h,
      topMarginIn: margins.top,
      bottomMarginIn: margins.bottom,
      numberedRangePreset: indexConfigDraft.numberedRangePreset,
      customRangeStart: indexConfigDraft.customRangeStart,
      customRangeEnd: indexConfigDraft.customRangeEnd,
      letterGroupMode: indexConfigDraft.letterGroupMode,
      linesPerSection: indexConfigDraft.linesPerSection,
      showNotesField: indexConfigDraft.showNotesField,
    });
    const shiftWarn = checkIndexInsertionShiftWarning(project.pages, indexConfigDraft.pageCount || 1);
    const isCurrentPageIndex =
      !activePage.isCover && isIndexTemplateType(activePage.templateType);
    const existingIndexPagesCount = project.pages.filter(
      p => !p.isCover && isIndexTemplateType(p.templateType)
    ).length;
    const effectivePageShiftOffset =
      isCurrentPageIndex || existingIndexPagesCount > 0 ? 0 : indexConfigDraft.pageCount || 1;
    const resolvedLinkedEntries = resolveIndexEntriesPageNumbers(
      indexConfigDraft.entries || [],
      project.pages,
      effectivePageShiftOffset
    );
    const brokenLinkedEntries = resolvedLinkedEntries.filter(e => e.isBrokenLink);
    const builderValidation = validateIndexBuilderConfiguration({
      config: indexConfigDraft,
      pages: project.pages,
      margins,
      trimWidthIn: currentTrim.w,
      trimHeightIn: currentTrim.h,
    });
    const linkableInteriorPages = project.pages.filter(
      p => !p.isCover && !isIndexTemplateType(p.templateType)
    );

    return (
      <div
        data-testid="index-template-config-panel"
        className={`bg-[#131720] border border-[#303744] rounded-md ${
          compact ? 'p-2.5 space-y-2.5' : 'p-3.5 space-y-3'
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[#303744]/70 pb-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-[#F3F4F6] truncate">
              Configure: {activeIndexMeta.title}
            </div>
            <div className="text-[10px] text-[#60A5FA]">{activeIndexMeta.category}</div>
          </div>
          <button
            type="button"
            onClick={() => handleUpdateIndexConfigDraft(getDefaultIndexConfig(selectedIndexStyle))}
            title="Reset configuration to template defaults"
            className="px-2 py-0.5 bg-[#202631] hover:bg-[#252B36] border border-[#303744] rounded text-[10px] text-[#A1A9B8] hover:text-[#F3F4F6] cursor-pointer transition shrink-0"
          >
            Reset Defaults
          </button>
        </div>

        {/* Automatic Page Generation & Validation Summary Bar */}
        <div
          data-testid="index-builder-auto-calc-summary"
          className="p-2 rounded bg-[#171B23] border border-[#303744] flex flex-wrap items-center justify-between gap-2 text-[10px]"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[#A1A9B8]">
              Entries: <strong className="text-[#F3F4F6] tabular-nums">{effectiveTotalEntries}</strong>
            </span>
            <span className="text-[#303744]">•</span>
            <span className="text-[#A1A9B8]">
              Usable/Page:{' '}
              <strong className="text-[#F3F4F6] tabular-nums">{paginationInfo.maxEntriesPerPage}</strong>
            </span>
            <span className="text-[#303744]">•</span>
            <span className="text-[#A1A9B8]">
              Auto Pages:{' '}
              <strong className="text-[#60A5FA] tabular-nums">
                {paginationInfo.recommendedPages} Page{paginationInfo.recommendedPages > 1 ? 's' : ''}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {brokenLinkedEntries.length > 0 ? (
              <span
                data-testid="index-summary-broken-badge"
                className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 font-semibold"
              >
                ! {brokenLinkedEntries.length} Unresolved Link{brokenLinkedEntries.length > 1 ? 's' : ''}
              </span>
            ) : builderValidation.isValid ? (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                Layout Validated
              </span>
            ) : null}
          </div>
        </div>

        {/* 1. Template Title & Subtitle */}
        <div className="space-y-1.5">
          <div>
            <label className="text-[10px] font-medium text-[#A1A9B8] block mb-1">
              Index Page Title
            </label>
            <input
              type="text"
              data-testid="index-config-title-input"
              value={indexConfigDraft.title}
              onChange={e => handleUpdateIndexConfigDraft({ title: e.target.value })}
              placeholder="Enter index heading..."
              className="w-full h-7 bg-[#171B23] border border-[#303744] focus:border-[#1677FF] rounded px-2 text-xs text-[#F3F4F6] focus:outline-none"
            />
          </div>

          {typeof indexConfigDraft.subtitle === 'string' && (
            <div>
              <label className="text-[10px] font-medium text-[#A1A9B8] block mb-1">
                Header Legend / Subtitle Note
              </label>
              <input
                type="text"
                data-testid="index-config-subtitle-input"
                value={indexConfigDraft.subtitle}
                onChange={e => handleUpdateIndexConfigDraft({ subtitle: e.target.value })}
                placeholder="Optional legend or header prompt..."
                className="w-full h-7 bg-[#171B23] border border-[#303744] focus:border-[#1677FF] rounded px-2 text-[11px] text-[#F3F4F6] focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* 2. Template-Specific Layout Controls */}
        {activeIndexMeta.supportsNumberedRange && (
          <div className="space-y-1.5 pt-1 border-t border-[#303744]/50">
            <label className="text-[10px] font-medium text-[#A1A9B8] block">
              Numbered Reference Range
            </label>
            <div className="grid grid-cols-4 gap-1">
              {(['1-25', '1-50', '1-100', 'custom'] as const).map(preset => {
                const isSelectedPreset = (indexConfigDraft.numberedRangePreset || '1-50') === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    data-testid={`index-range-${preset}`}
                    onClick={() => {
                      const nextEntries =
                        preset === '1-25'
                          ? 25
                          : preset === '1-50'
                          ? 50
                          : preset === '1-100'
                          ? 100
                          : Math.max(
                              5,
                              (indexConfigDraft.customRangeEnd || 50) -
                                (indexConfigDraft.customRangeStart || 1) +
                                1
                            );
                      const nextPages = preset === '1-100' ? 2 : 1;
                      handleUpdateIndexConfigDraft({
                        numberedRangePreset: preset,
                        columnsCount: preset === '1-25' ? 1 : 2,
                        entriesPerPage: Math.min(50, nextEntries),
                        totalEntriesRequested: nextEntries,
                        pageCount: nextPages,
                        title:
                          preset === '1-25'
                            ? 'NUMBERED REFERENCE INDEX (01 – 25)'
                            : preset === '1-50'
                            ? 'NUMBERED REFERENCE INDEX (01 – 50)'
                            : preset === '1-100'
                            ? 'NUMBERED REFERENCE INDEX (01 – 100)'
                            : indexConfigDraft.title,
                      });
                    }}
                    className={`py-1 rounded text-[10px] font-semibold cursor-pointer border transition uppercase ${
                      isSelectedPreset
                        ? 'bg-[#1677FF] border-[#1677FF] text-white'
                        : 'bg-[#171B23] border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
                    }`}
                  >
                    {preset === 'custom' ? 'Custom' : preset.replace('-', '–')}
                  </button>
                );
              })}
            </div>
            {indexConfigDraft.numberedRangePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-[10px] text-[#A1A9B8] block mb-0.5">Start #</span>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    data-testid="index-custom-range-start"
                    value={indexConfigDraft.customRangeStart ?? 1}
                    onChange={e => {
                      const s = Math.max(1, Number(e.target.value) || 1);
                      const end = Math.max(s + 1, indexConfigDraft.customRangeEnd ?? 50);
                      const total = end - s + 1;
                      handleUpdateIndexConfigDraft({
                        customRangeStart: s,
                        customRangeEnd: end,
                        totalEntriesRequested: total,
                        entriesPerPage: Math.min(50, total),
                        pageCount: Math.max(1, Math.ceil(total / 50)),
                      });
                    }}
                    className="w-full h-7 bg-[#171B23] border border-[#303744] rounded px-2 text-xs text-[#F3F4F6] tabular-nums"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#A1A9B8] block mb-0.5">End #</span>
                  <input
                    type="number"
                    min={2}
                    max={999}
                    data-testid="index-custom-range-end"
                    value={indexConfigDraft.customRangeEnd ?? 50}
                    onChange={e => {
                      const s = indexConfigDraft.customRangeStart ?? 1;
                      const end = Math.max(s + 1, Number(e.target.value) || 50);
                      const total = end - s + 1;
                      handleUpdateIndexConfigDraft({
                        customRangeEnd: end,
                        totalEntriesRequested: total,
                        entriesPerPage: Math.min(50, total),
                        pageCount: Math.max(1, Math.ceil(total / 50)),
                      });
                    }}
                    className="w-full h-7 bg-[#171B23] border border-[#303744] rounded px-2 text-xs text-[#F3F4F6] tabular-nums"
                  />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[10px] text-[#A1A9B8]">Columns per Page</span>
              <div className="flex gap-1">
                {([1, 2, 3] as const).map(colOpt => (
                  <button
                    key={colOpt}
                    type="button"
                    data-testid={`index-numbered-cols-${colOpt}`}
                    onClick={() => handleUpdateIndexConfigDraft({ columnsCount: colOpt })}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer border transition ${
                      (indexConfigDraft.columnsCount || 2) === colOpt
                        ? 'bg-[#1677FF] border-[#1677FF] text-white'
                        : 'bg-[#171B23] border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
                    }`}
                  >
                    {colOpt} Col{colOpt > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeIndexMeta.supportsLetterGroups && (
          <div className="space-y-1.5 pt-1 border-t border-[#303744]/50">
            <label className="text-[10px] font-medium text-[#A1A9B8] block">
              A–Z Letter Grouping &amp; Writing Lines
            </label>
            <select
              data-testid="index-letter-group-select"
              value={indexConfigDraft.letterGroupMode || '3-per-box'}
              onChange={e => {
                const mode = e.target.value as IndexPageConfig['letterGroupMode'];
                handleUpdateIndexConfigDraft({
                  letterGroupMode: mode,
                  pageCount: mode === 'a-m-n-z' ? 2 : indexConfigDraft.pageCount,
                  linesPerSection: mode === 'single-letters' ? 2 : 5,
                });
              }}
              className="w-full h-7 bg-[#171B23] border border-[#303744] focus:border-[#1677FF] rounded px-2 text-[11px] text-[#F3F4F6]"
            >
              <option value="3-per-box">3 Letters per Box (9 Groups: A•B•C ... Y•Z•#)</option>
              <option value="2-per-box">2 Letters per Box (13 Groups: A•B ... Y•Z)</option>
              <option value="a-m-n-z">A–M / N–Z Split (Recommended 2-Page Directory)</option>
              <option value="single-letters">Individual A–Z Boxes (26 Letter Cells)</option>
            </select>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[10px] text-[#A1A9B8]">Writing Lines per Letter Box</span>
              <input
                type="number"
                min={1}
                max={10}
                data-testid="index-az-lines-input"
                value={indexConfigDraft.linesPerSection ?? 5}
                onChange={e =>
                  handleUpdateIndexConfigDraft({
                    linesPerSection: Math.max(1, Math.min(10, Number(e.target.value) || 5)),
                  })
                }
                className="w-16 h-7 bg-[#171B23] border border-[#303744] rounded px-2 text-xs text-[#F3F4F6] tabular-nums"
              />
            </div>
          </div>
        )}

        {(selectedIndexStyle === 'index_categorical' || selectedIndexStyle === 'index_monthly') && (
          <div className="space-y-1.5 pt-1 border-t border-[#303744]/50">
            {selectedIndexStyle === 'index_categorical' && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#A1A9B8]">Category Cards per Page (2–6)</span>
                <input
                  type="number"
                  min={2}
                  max={6}
                  data-testid="index-categorical-cards-input"
                  value={indexConfigDraft.entriesPerPage || 4}
                  onChange={e => {
                    const val = Math.max(2, Math.min(6, Number(e.target.value) || 4));
                    handleUpdateIndexConfigDraft({
                      entriesPerPage: val,
                      totalEntriesRequested: val * (indexConfigDraft.pageCount || 1),
                    });
                  }}
                  className="w-16 h-7 bg-[#171B23] border border-[#303744] rounded px-2 text-xs text-[#F3F4F6] tabular-nums"
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-[#A1A9B8]">
                {selectedIndexStyle === 'index_monthly'
                  ? 'Lines per Month Box (2–6)'
                  : 'Lines per Category Card (4–12)'}
              </span>
              <input
                type="number"
                min={2}
                max={12}
                value={indexConfigDraft.linesPerSection ?? (selectedIndexStyle === 'index_monthly' ? 3 : 8)}
                onChange={e =>
                  handleUpdateIndexConfigDraft({
                    linesPerSection: Math.max(2, Math.min(12, Number(e.target.value) || 4)),
                  })
                }
                className="w-16 h-7 bg-[#171B23] border border-[#303744] rounded px-2 text-xs text-[#F3F4F6] tabular-nums"
              />
            </div>
          </div>
        )}

        {/* 3. Rows / Entries & Multi-Page Pagination */}
        {!activeIndexMeta.supportsLetterGroups &&
          selectedIndexStyle !== 'index_categorical' &&
          selectedIndexStyle !== 'index_monthly' && (
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#303744]/50">
              <div>
                <label className="text-[10px] text-[#A1A9B8] block mb-0.5">
                  Rows per Page (Max {paginationInfo.maxEntriesPerPage})
                </label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  data-testid="index-config-rows-input"
                  value={indexConfigDraft.entriesPerPage}
                  onChange={e => {
                    const val = Math.max(5, Math.min(50, Number(e.target.value) || 18));
                    const clampedRows = Math.min(val, paginationInfo.maxEntriesPerPage);
                    const totalReq = Math.max(
                      clampedRows,
                      indexConfigDraft.totalEntriesRequested || clampedRows
                    );
                    const recPages = Math.max(1, Math.ceil(totalReq / Math.max(1, clampedRows)));
                    handleUpdateIndexConfigDraft({
                      entriesPerPage: clampedRows,
                      totalEntriesRequested: totalReq,
                      pageCount: recPages,
                    });
                  }}
                  className="w-full h-7 bg-[#171B23] border border-[#303744] focus:border-[#1677FF] rounded px-2 text-xs text-[#F3F4F6] tabular-nums"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#A1A9B8] block mb-0.5">Total Entries Goal</label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  data-testid="index-config-total-entries-input"
                  value={indexConfigDraft.totalEntriesRequested || indexConfigDraft.entriesPerPage}
                  onChange={e => {
                    const totalReq = Math.max(5, Math.min(300, Number(e.target.value) || 22));
                    const recPages = Math.max(
                      1,
                      Math.ceil(totalReq / Math.max(1, paginationInfo.maxEntriesPerPage))
                    );
                    handleUpdateIndexConfigDraft({
                      totalEntriesRequested: totalReq,
                      entriesPerPage: Math.min(totalReq, paginationInfo.maxEntriesPerPage),
                      pageCount: recPages,
                    });
                  }}
                  className="w-full h-7 bg-[#171B23] border border-[#303744] focus:border-[#1677FF] rounded px-2 text-xs text-[#F3F4F6] tabular-nums"
                />
              </div>
            </div>
          )}

        {paginationInfo.overflowWarning && (
          <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2 text-[10px] text-amber-200">
            <span>{paginationInfo.overflowWarning}</span>
            {indexConfigDraft.pageCount < paginationInfo.recommendedPages && (
              <button
                type="button"
                onClick={() =>
                  handleUpdateIndexConfigDraft({ pageCount: paginationInfo.recommendedPages })
                }
                className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-[#111318] font-semibold rounded cursor-pointer shrink-0"
              >
                Use {paginationInfo.recommendedPages}p
              </button>
            )}
          </div>
        )}

        {/* 4. Pages Count, Font Size & Line Spacing */}
        <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-[#303744]/50">
          <div>
            <label className="text-[10px] text-[#A1A9B8] block mb-0.5">Index Pages</label>
            <input
              type="number"
              min={1}
              max={12}
              data-testid="index-config-pages-input"
              value={indexConfigDraft.pageCount}
              onChange={e =>
                handleUpdateIndexConfigDraft({
                  pageCount: Math.max(1, Math.min(12, Number(e.target.value) || 1)),
                })
              }
              className="w-full h-7 bg-[#171B23] border border-[#303744] rounded px-2 text-xs text-[#F3F4F6] tabular-nums"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#A1A9B8] block mb-0.5">Font Size</label>
            <select
              data-testid="index-config-fontsize-select"
              value={indexConfigDraft.fontSizePt}
              onChange={e =>
                handleUpdateIndexConfigDraft({ fontSizePt: Number(e.target.value) || 8.5 })
              }
              className="w-full h-7 bg-[#171B23] border border-[#303744] rounded px-1.5 text-[11px] text-[#F3F4F6]"
            >
              <option value={7.5}>7.5 pt</option>
              <option value={8.5}>8.5 pt</option>
              <option value={9.5}>9.5 pt</option>
              <option value={10.5}>10.5 pt</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#A1A9B8] block mb-0.5">Row Spacing</label>
            <select
              data-testid="index-config-spacing-select"
              value={indexConfigDraft.lineSpacing}
              onChange={e =>
                handleUpdateIndexConfigDraft({
                  lineSpacing: e.target.value as IndexPageConfig['lineSpacing'],
                })
              }
              className="w-full h-7 bg-[#171B23] border border-[#303744] rounded px-1.5 text-[11px] text-[#F3F4F6]"
            >
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="relaxed">Relaxed</option>
            </select>
          </div>
        </div>

        {/* 5. Column Labels */}
        {indexConfigDraft.columnLabels && indexConfigDraft.columnLabels.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-[#303744]/50">
            <label className="text-[10px] font-medium text-[#A1A9B8] block">
              Column Headings ({indexConfigDraft.columnLabels.length} Columns)
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {indexConfigDraft.columnLabels.map((lbl, cIdx) => (
                <input
                  key={cIdx}
                  type="text"
                  data-testid={`index-col-label-${cIdx}`}
                  value={lbl}
                  onChange={e => {
                    const nextCols = [...indexConfigDraft.columnLabels];
                    nextCols[cIdx] = e.target.value;
                    handleUpdateIndexConfigDraft({ columnLabels: nextCols });
                  }}
                  className="h-6.5 bg-[#171B23] border border-[#303744] focus:border-[#1677FF] rounded px-2 text-[10px] text-[#F3F4F6] focus:outline-none"
                />
              ))}
            </div>
          </div>
        )}

        {/* 6. Page # Column Visibility & Template-Relevant Optional Fields */}
        <div className="space-y-1.5 pt-1 border-t border-[#303744]/50">
          <div className="text-[10px] font-medium text-[#A1A9B8]">Visible Columns &amp; Fields</div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1.5 text-[10px] text-[#F3F4F6] cursor-pointer bg-[#171B23] px-2 py-1 rounded border border-[#303744]">
              <input
                type="checkbox"
                data-testid="index-toggle-pagenum"
                checked={indexConfigDraft.showPageNumberCol !== false}
                onChange={e =>
                  handleUpdateIndexConfigDraft({ showPageNumberCol: e.target.checked })
                }
                className="accent-[#1677FF]"
              />
              <span>Page # Col</span>
            </label>

            {activeIndexMeta.supportsDateField && (
              <label className="flex items-center gap-1.5 text-[10px] text-[#F3F4F6] cursor-pointer bg-[#171B23] px-2 py-1 rounded border border-[#303744]">
                <input
                  type="checkbox"
                  data-testid="index-toggle-date"
                  checked={indexConfigDraft.showDateField !== false}
                  onChange={e =>
                    handleUpdateIndexConfigDraft({ showDateField: e.target.checked })
                  }
                  className="accent-[#1677FF]"
                />
                <span>Date Col</span>
              </label>
            )}

            {activeIndexMeta.supportsStatusField && (
              <label className="flex items-center gap-1.5 text-[10px] text-[#F3F4F6] cursor-pointer bg-[#171B23] px-2 py-1 rounded border border-[#303744]">
                <input
                  type="checkbox"
                  data-testid="index-toggle-status"
                  checked={indexConfigDraft.showStatusField !== false}
                  onChange={e =>
                    handleUpdateIndexConfigDraft({ showStatusField: e.target.checked })
                  }
                  className="accent-[#1677FF]"
                />
                <span>Status / Rating</span>
              </label>
            )}

            {activeIndexMeta.supportsCategoryField && (
              <label className="flex items-center gap-1.5 text-[10px] text-[#F3F4F6] cursor-pointer bg-[#171B23] px-2 py-1 rounded border border-[#303744]">
                <input
                  type="checkbox"
                  data-testid="index-toggle-category"
                  checked={indexConfigDraft.showCategoryField !== false}
                  onChange={e =>
                    handleUpdateIndexConfigDraft({ showCategoryField: e.target.checked })
                  }
                  className="accent-[#1677FF]"
                />
                <span>Category / Tag</span>
              </label>
            )}

            {activeIndexMeta.supportsNotesField && (
              <label className="flex items-center gap-1.5 text-[10px] text-[#F3F4F6] cursor-pointer bg-[#171B23] px-2 py-1 rounded border border-[#303744]">
                <input
                  type="checkbox"
                  data-testid="index-toggle-notes"
                  checked={indexConfigDraft.showNotesField !== false}
                  onChange={e =>
                    handleUpdateIndexConfigDraft({ showNotesField: e.target.checked })
                  }
                  className="accent-[#1677FF]"
                />
                <span>Prep / Notes</span>
              </label>
            )}
          </div>
        </div>

        {/* 7. Optional Index Linking (Blank Printable Index vs Linked Document Page References) */}
        <div className="space-y-2 pt-1.5 border-t border-[#303744]/60">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold text-[#F3F4F6]">
                Index Mode &amp; Optional Page Linking
              </div>
              <div className="text-[9px] text-[#A1A9B8]">
                {indexConfigDraft.indexMode === 'linked'
                  ? 'Linked entries reference book pages and auto-update when pages move'
                  : 'Blank printable index keeps fields blank for handwriting or printing'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              data-testid="index-mode-blank"
              onClick={() =>
                handleUpdateIndexConfigDraft({
                  indexMode: 'blank',
                  entries: [],
                })
              }
              className={`py-1.5 px-2 rounded text-[10px] font-semibold cursor-pointer border transition ${
                (indexConfigDraft.indexMode || 'blank') === 'blank'
                  ? 'bg-[#1677FF] border-[#1677FF] text-white'
                  : 'bg-[#171B23] border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
              }`}
            >
              Blank Printable Index
            </button>
            <button
              type="button"
              data-testid="index-mode-linked"
              onClick={() => {
                const currentEntries = indexConfigDraft.entries || [];
                const populated =
                  currentEntries.length > 0
                    ? currentEntries
                    : autoPopulateEntriesFromInteriorPages(
                        project.pages,
                        Math.min(
                          12,
                          indexConfigDraft.totalEntriesRequested ||
                            indexConfigDraft.entriesPerPage ||
                            10
                        )
                      );
                const reqEntries = Math.max(
                  populated.length,
                  indexConfigDraft.totalEntriesRequested || indexConfigDraft.entriesPerPage || 18
                );
                const recPages = Math.max(
                  1,
                  Math.ceil(reqEntries / Math.max(1, paginationInfo.maxEntriesPerPage))
                );
                handleUpdateIndexConfigDraft({
                  indexMode: 'linked',
                  entries: populated,
                  totalEntriesRequested: reqEntries,
                  pageCount: recPages,
                });
              }}
              className={`py-1.5 px-2 rounded text-[10px] font-semibold cursor-pointer border transition ${
                indexConfigDraft.indexMode === 'linked'
                  ? 'bg-[#1677FF] border-[#1677FF] text-white'
                  : 'bg-[#171B23] border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
              }`}
            >
              Linked Page References
            </button>
          </div>

          {indexConfigDraft.indexMode === 'linked' && (
            <div
              data-testid="index-linked-panel"
              className="space-y-2 bg-[#171B23] border border-[#303744] rounded p-2"
            >
              {/* Action bar for Linked Entries */}
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[10px] font-semibold text-[#60A5FA]">
                  Linked Entries ({(indexConfigDraft.entries || []).length})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-testid="index-auto-link-pages-btn"
                    onClick={() => {
                      const autoEntries = autoPopulateEntriesFromInteriorPages(
                        project.pages,
                        Math.max(1, linkableInteriorPages.length)
                      );
                      const reqEntries = Math.max(
                        autoEntries.length,
                        indexConfigDraft.entriesPerPage || 18
                      );
                      const recPages = Math.max(
                        1,
                        Math.ceil(reqEntries / Math.max(1, paginationInfo.maxEntriesPerPage))
                      );
                      handleUpdateIndexConfigDraft({
                        indexMode: 'linked',
                        entries: autoEntries,
                        totalEntriesRequested: reqEntries,
                        pageCount: recPages,
                      });
                    }}
                    className="px-2 py-0.5 bg-[#202631] hover:bg-[#252B36] border border-[#303744] rounded text-[9px] font-semibold text-[#60A5FA] hover:text-white cursor-pointer transition"
                  >
                    Auto-Link Interior Pages
                  </button>
                  <button
                    type="button"
                    data-testid="index-add-linked-entry-btn"
                    onClick={() => {
                      const cur = indexConfigDraft.entries || [];
                      const nextNum = cur.length + 1;
                      const defaultTargetPage =
                        linkableInteriorPages[(nextNum - 1) % Math.max(1, linkableInteriorPages.length)];
                      const nextEntries: IndexEntryLink[] = [
                        ...cur,
                        {
                          id: `idx-entry-${Date.now()}-${nextNum}`,
                          entryNumber: nextNum,
                          label: `Section ${nextNum}`,
                          linkedPageId: defaultTargetPage?.id,
                        },
                      ];
                      const nextTotalReq = Math.max(
                        nextEntries.length,
                        indexConfigDraft.totalEntriesRequested || indexConfigDraft.entriesPerPage || 18
                      );
                      const recPages = Math.max(
                        1,
                        Math.ceil(nextTotalReq / Math.max(1, paginationInfo.maxEntriesPerPage))
                      );
                      handleUpdateIndexConfigDraft({
                        indexMode: 'linked',
                        entries: nextEntries,
                        totalEntriesRequested: nextTotalReq,
                        pageCount: recPages,
                      });
                    }}
                    className="px-2 py-0.5 bg-[#1677FF] hover:bg-[#1668dc] rounded text-[9px] font-semibold text-white cursor-pointer transition"
                  >
                    + Add Entry
                  </button>
                </div>
              </div>

              {/* Unresolved Page Reference Warning Banner */}
              {brokenLinkedEntries.length > 0 && (
                <div
                  data-testid="index-broken-links-warning"
                  className="p-2 rounded bg-rose-500/15 border border-rose-500/40 text-[10px] text-rose-200 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="leading-snug">
                      <strong className="text-rose-300">Unresolved Page Reference Warning:</strong>{' '}
                      {brokenLinkedEntries.length} index entr
                      {brokenLinkedEntries.length === 1 ? 'y references' : 'ies reference'} a page
                      that was deleted or cannot be resolved. PageForge displays{' '}
                      <code className="text-rose-300 font-bold">! UNRESOLVED</code> instead of
                      inventing a page number.
                    </div>
                    <button
                      type="button"
                      data-testid="index-repair-broken-links-btn"
                      onClick={() => {
                        const repaired = (indexConfigDraft.entries || []).map((entry, idx) => {
                          const exists = project.pages.some(
                            p => !p.isCover && p.id === entry.linkedPageId
                          );
                          if (exists || !entry.linkedPageId) return entry;
                          const fallbackPage =
                            linkableInteriorPages[idx % Math.max(1, linkableInteriorPages.length)];
                          return {
                            ...entry,
                            linkedPageId: fallbackPage ? fallbackPage.id : undefined,
                          };
                        });
                        handleUpdateIndexConfigDraft({ entries: repaired });
                      }}
                      className="px-2 py-0.5 bg-rose-500 hover:bg-rose-400 text-white font-semibold rounded text-[9px] cursor-pointer shrink-0"
                    >
                      Repair Links
                    </button>
                  </div>
                </div>
              )}

              {/* Entry List with Topic Title & Target Document Page Selector */}
              <div
                data-testid="index-linked-entries-list"
                className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5"
              >
                {resolvedLinkedEntries.length === 0 ? (
                  <div className="text-[10px] text-[#A1A9B8] text-center py-2">
                    No linked entries yet. Click &ldquo;Auto-Link Interior Pages&rdquo; or &ldquo;+ Add Entry&rdquo;.
                  </div>
                ) : (
                  resolvedLinkedEntries.map((resEntry, eIdx) => (
                    <div
                      key={resEntry.id || eIdx}
                      data-testid={`index-linked-entry-row-${eIdx}`}
                      className={`flex items-center gap-1.5 p-1 rounded border ${
                        resEntry.isBrokenLink
                          ? 'bg-rose-950/30 border-rose-500/50'
                          : 'bg-[#111318] border-[#303744]'
                      }`}
                    >
                      <span className="text-[9px] font-mono text-[#A1A9B8] w-5 text-center shrink-0">
                        {String(eIdx + 1).padStart(2, '0')}
                      </span>
                      <input
                        type="text"
                        data-testid={`index-entry-label-input-${eIdx}`}
                        value={resEntry.label}
                        onChange={e => {
                          const nextEntries = [...(indexConfigDraft.entries || [])];
                          nextEntries[eIdx] = {
                            ...nextEntries[eIdx],
                            label: e.target.value,
                          };
                          handleUpdateIndexConfigDraft({ entries: nextEntries });
                        }}
                        placeholder="Entry topic..."
                        className="flex-1 min-w-0 h-6 bg-[#171B23] border border-[#303744] focus:border-[#1677FF] rounded px-1.5 text-[10px] text-[#F3F4F6] focus:outline-none"
                      />
                      <select
                        data-testid={`index-entry-page-select-${eIdx}`}
                        value={resEntry.linkedPageId || ''}
                        onChange={e => {
                          const val = e.target.value;
                          const nextEntries = [...(indexConfigDraft.entries || [])];
                          nextEntries[eIdx] = {
                            ...nextEntries[eIdx],
                            linkedPageId: val ? val : undefined,
                          };
                          handleUpdateIndexConfigDraft({ entries: nextEntries });
                        }}
                        className={`w-28 h-6 bg-[#171B23] border rounded px-1 text-[9px] focus:outline-none ${
                          resEntry.isBrokenLink
                            ? 'border-rose-500 text-rose-300'
                            : 'border-[#303744] text-[#F3F4F6]'
                        }`}
                      >
                        <option value="">-- Blank (Unlinked) --</option>
                        {resEntry.isBrokenLink && resEntry.linkedPageId && (
                          <option value={resEntry.linkedPageId}>
                            ! Missing Page ({resEntry.linkedPageId})
                          </option>
                        )}
                        {project.pages
                          .filter(p => !p.isCover)
                          .map(p => {
                            const rawPageNum = p.pageNumber;
                            const displayedNum = isIndexTemplateType(p.templateType)
                              ? rawPageNum
                              : rawPageNum + effectivePageShiftOffset;
                            return (
                              <option key={p.id} value={p.id}>
                                p. {displayedNum} — {p.name}
                              </option>
                            );
                          })}
                      </select>
                      <span
                        data-testid={`index-entry-resolved-page-${eIdx}`}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 ${
                          resEntry.isBrokenLink
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : resEntry.resolvedPageNumber !== null
                            ? 'bg-[#1677FF]/20 text-[#60A5FA]'
                            : 'bg-[#202631] text-[#A1A9B8]'
                        }`}
                      >
                        {resEntry.isBrokenLink
                          ? '! UNRESOLVED'
                          : resEntry.resolvedPageNumber !== null
                          ? `p.${resEntry.displayPageText}`
                          : 'Blank'}
                      </span>
                      <button
                        type="button"
                        data-testid={`index-entry-remove-btn-${eIdx}`}
                        onClick={() => {
                          const nextEntries = (indexConfigDraft.entries || [])
                            .filter((_, idx) => idx !== eIdx)
                            .map((item, idx) => ({ ...item, entryNumber: idx + 1 }));
                          handleUpdateIndexConfigDraft({ entries: nextEntries });
                        }}
                        title="Remove entry"
                        className="p-0.5 text-[#A1A9B8] hover:text-rose-400 cursor-pointer shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* 8. Editable Canvas Cells Action when on an Index Page */}
        {isCurrentPageIndex && (
          <div className="pt-1 border-t border-[#303744]/50">
            <button
              type="button"
              data-testid="populate-editable-index-cells-btn"
              onClick={handleGenerateEditableIndexCells}
              className="w-full py-1.5 px-2.5 bg-[#202631] hover:bg-[#252B36] border border-[#1677FF]/40 text-[#60A5FA] hover:text-white rounded text-[10px] font-semibold cursor-pointer transition flex items-center justify-center gap-1.5"
            >
              <Type className="w-3 h-3" />
              <span>Generate Editable Row &amp; Page # Cells on Canvas</span>
            </button>
          </div>
        )}

        {/* 9. Shift Warning Notice when inserting after Front Cover shifts existing interior pages */}
        {shiftWarn.willShiftInteriorPages && (
          <div
            data-testid="index-shift-warning-banner"
            className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-200 leading-snug"
          >
            Note: {shiftWarn.warningMessage}
          </div>
        )}

        {/* 10. Primary Action Buttons */}
        <div className="flex items-center gap-1.5 pt-1">
          <button
            type="button"
            data-testid="config-preview-index-btn"
            onClick={() => setIndexPreviewModalOpen(true)}
            className="px-2.5 py-1.5 bg-[#202631] hover:bg-[#252B36] border border-[#303744] text-[#F3F4F6] rounded text-[11px] font-semibold cursor-pointer transition flex items-center justify-center gap-1"
          >
            <Eye className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>Preview</span>
          </button>
          <button
            type="button"
            data-testid="config-insert-index-btn"
            onClick={() =>
              handleInsertIndexPagesAfterCover(
                selectedIndexStyle,
                indexConfigDraft.pageCount,
                false,
                indexConfigDraft
              )
            }
            className="flex-1 py-1.5 px-3 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded text-[11px] font-semibold cursor-pointer transition flex items-center justify-center gap-1 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>
              Insert {indexConfigDraft.pageCount} Index Page
              {indexConfigDraft.pageCount > 1 ? 's' : ''} After Cover
            </span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#111318] text-[#F3F4F6] font-sans select-none overflow-hidden text-xs">
      {/* =====================================================================
          A. TOP TOOLBAR (60px tall, #191D25, matching PageForge reference image)
         ===================================================================== */}
      <header className="h-[60px] bg-[#191D25] border-b border-[#303744] px-4 flex items-center justify-between shrink-0 z-30">
        {/* Left Zone: PageForge Logo + Dashboard / Templates / Projects Navigation */}
        <div className="flex items-center gap-7">
          <button
            onClick={() => {
              setDownloadDropdownOpen(false);
              setCurrentView('editor');
            }}
            title="Return to PageForge Editor"
            className="flex items-center gap-2.5 text-[#F3F4F6] hover:opacity-95 cursor-pointer whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-6 h-6 text-[#1677FF] stroke-[2.2]" />
            <span className="font-bold text-[17px] tracking-tight text-[#F3F4F6]">PageForge</span>
          </button>

          <nav className="hidden md:flex items-center gap-6 text-[13px] font-medium text-[#A1A9B8]">
            <button
              onClick={() => {
                setDownloadDropdownOpen(false);
                setCurrentView(currentView === 'dashboard' ? 'editor' : 'dashboard');
              }}
              title="Open Project Dashboard"
              className={`hover:text-[#F3F4F6] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                currentView === 'dashboard' ? 'text-[#F3F4F6] font-semibold' : ''
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => {
                setDownloadDropdownOpen(false);
                setCurrentView('editor');
                setActiveLeftTool(activeLeftTool === 'templates' ? 'pages' : 'templates');
              }}
              title="Browse KDP Interior Templates"
              className={`hover:text-[#F3F4F6] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                currentView === 'editor' && activeLeftTool === 'templates' ? 'text-[#F3F4F6] font-semibold' : ''
              }`}
            >
              Templates
            </button>
            <button
              onClick={() => {
                setDownloadDropdownOpen(false);
                setCurrentView('dashboard');
              }}
              title="Manage Saved Book Projects"
              className="hover:text-[#F3F4F6] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Projects
            </button>
          </nav>
        </div>

        {/* Center Zone: Editable Project Name Box with Blue Pencil Icon */}
        <div className="hidden sm:flex items-center justify-center">
          <div className="w-[290px] h-9 bg-[#131720] border border-[#303744] focus-within:border-[#1677FF] rounded-md px-3.5 flex items-center justify-between transition-colors">
            <input
              ref={titleInputRef}
              type="text"
              aria-label="Project Name"
              value={project.title}
              onChange={e => {
                const val = e.target.value;
                setProject(prev => ({
                  ...prev,
                  title: val,
                  lastSaved: 'Saved just now',
                  updatedAt: Date.now(),
                }));
                setSaveStatusText('Saved just now');
              }}
              className="bg-transparent text-[#F3F4F6] font-medium text-[13px] w-full focus:outline-none truncate"
              placeholder="Enter project name..."
            />
            <button
              onClick={() => titleInputRef.current?.focus()}
              aria-label="Edit Project Name"
              title="Rename project"
              className="text-[#1677FF] hover:text-[#4096ff] ml-2 cursor-pointer shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Zone: Undo/Redo, Autosave Status, Manual Save Button, Preview Button, Blue Download PDF Button */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              className="p-1.5 sm:p-2 text-[#A1A9B8] hover:text-[#F3F4F6] hover:bg-[#252B36] disabled:opacity-40 rounded-md transition cursor-pointer"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              aria-label="Redo"
              title="Redo (Ctrl+Y)"
              className="p-1.5 sm:p-2 text-[#A1A9B8] hover:text-[#F3F4F6] hover:bg-[#252B36] disabled:opacity-40 rounded-md transition cursor-pointer"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Autosave status with green check circle */}
          <div
            data-testid="autosave-status-indicator"
            title="All changes are automatically saved to local storage"
            className="hidden lg:flex items-center gap-2 text-[12px] text-[#A1A9B8] px-1.5 whitespace-nowrap shrink-0"
          >
            <span className="w-4 h-4 rounded-full bg-[#22C55E] text-[#111318] flex items-center justify-center">
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            </span>
            <span>{saveStatusText}</span>
          </div>

          {/* Manual Save Button (positioned immediately to the left of Preview button) */}
          <button
            type="button"
            data-testid="manual-save-btn"
            onClick={handleManualSave}
            title="Save project now (Ctrl+S)"
            className={`h-8 sm:h-9 px-2.5 sm:px-3.5 border rounded-md text-xs sm:text-[13px] font-medium flex items-center gap-1.5 sm:gap-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
              justManuallySaved
                ? 'bg-[#22C55E]/15 border-[#22C55E]/60 text-[#4ADE80]'
                : 'bg-[#202631] hover:bg-[#28303E] border-[#303744] text-[#F3F4F6]'
            }`}
          >
            {justManuallySaved ? (
              <Check className="w-3.5 h-3.5 text-[#4ADE80] stroke-[2.5]" />
            ) : (
              <Save className="w-3.5 h-3.5 text-[#60A5FA]" />
            )}
            <span className="hidden sm:inline">{justManuallySaved ? 'Saved' : 'Save'}</span>
          </button>

          {/* Preview Button */}
          <button
            data-testid="top-preview-btn"
            onClick={() => {
              const targetIdx = resolvePreviewInitialPageIndex(project.pages, activePageIndex);
              setPreviewPageIndex(targetIdx);
              setPreviewModalOpen(true);
            }}
            title="Preview book paper cover and interior pages"
            className="h-8 sm:h-9 px-2.5 sm:px-3.5 bg-[#202631] hover:bg-[#28303E] border border-[#303744] text-[#F3F4F6] rounded-md text-xs sm:text-[13px] font-medium flex items-center gap-1.5 sm:gap-2 transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Preview</span>
          </button>

          {/* Prominent Blue Download PDF Button + Dropdown with Pre-Flight Validation */}
          <div className="relative">
            <button
              onClick={() => setDownloadDropdownOpen(prev => !prev)}
              disabled={isDownloading}
              title="Validate specifications and export PDF"
              className="h-8 sm:h-9 px-2.5 sm:px-4 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded-md text-xs sm:text-[13px] font-semibold flex items-center gap-1.5 sm:gap-2 shadow-xs transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{isDownloading ? 'Exporting...' : 'Download PDF'}</span>
              <span className="sm:hidden">{isDownloading ? '...' : 'PDF'}</span>
            </button>

            {downloadDropdownOpen && (
              <div className="absolute right-0 top-11 w-92 bg-[#191D25] text-[#F3F4F6] rounded-lg shadow-2xl border border-[#303744] py-2 z-50">
                <div className="px-3.5 pb-2 border-b border-[#303744]/70">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#F3F4F6]">Export Print-Ready PDF &amp; KDP Files</span>
                    {kdpValidationReport.isValidForPrint ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded">
                        <ShieldCheck className="w-3 h-3" /> Specs Validated
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                        <AlertTriangle className="w-3 h-3" /> {kdpValidationReport.warnings.length} Advisory
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#A1A9B8] mt-1 tabular-nums">
                    Trim: {currentTrim.w}&quot; × {currentTrim.h}&quot; •{' '}
                    {project.pages.filter(p => !p.isCover).length} Interior Pages • Bleed: {bleedInches}&quot;
                  </div>

                  {/* Pre-Flight Validation Warnings */}
                  {kdpValidationReport.warnings.length > 0 && (
                    <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 space-y-1">
                      {kdpValidationReport.warnings.map((w, idx) => (
                        <div key={idx} className="text-[10px] text-amber-300 flex items-start gap-1.5 leading-snug">
                          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="py-1">
                  <button
                    onClick={() => handleDownloadChoice('project_cmyk')}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#252B36] text-xs text-[#F3F4F6] transition flex items-center justify-between cursor-pointer"
                  >
                    <span>Download Current Project CMYK (Printed Books)</span>
                    <span className="text-[11px] text-[#22C55E] font-semibold">Print PDF</span>
                  </button>

                  <button
                    onClick={() => handleDownloadChoice('project_rgb')}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#252B36] text-xs text-[#F3F4F6] transition flex items-center justify-between cursor-pointer"
                  >
                    <span>Download Current Project RGB (EBooks)</span>
                    <span className="text-[11px] text-[#A1A9B8]">Digital</span>
                  </button>

                  <div className="h-px bg-[#303744] my-1" />

                  <button
                    onClick={() => handleDownloadChoice('cover_pdf')}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#252B36] text-xs text-[#F3F4F6] transition flex items-center justify-between cursor-pointer"
                  >
                    <span>Download Full Cover Spread PDF</span>
                    <span className="text-[11px] text-[#1677FF] font-semibold">{bleedInches}&quot; Bleed</span>
                  </button>

                  <button
                    onClick={() => handleDownloadChoice('package')}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#1677FF]/15 text-[#60A5FA] font-semibold text-xs transition flex items-center justify-between cursor-pointer"
                  >
                    <span>Download Complete KDP Package (Cover + Interior)</span>
                    <span className="text-[11px] text-[#F3F4F6]">Bundle</span>
                  </button>

                  <div className="h-px bg-[#303744] my-1" />

                  <button
                    onClick={() => handleDownloadChoice('page_cmyk')}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-[#252B36] text-xs text-[#A1A9B8] hover:text-[#F3F4F6] transition cursor-pointer"
                  >
                    Download Current Page CMYK (Printed Books)
                  </button>

                  <button
                    onClick={() => handleDownloadChoice('cover_svg')}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-[#252B36] text-xs text-[#A1A9B8] hover:text-[#F3F4F6] transition cursor-pointer"
                  >
                    Export Active Canvas as Vector SVG
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* =====================================================================
          DASHBOARD & PROJECT MANAGEMENT VIEW (When 'Dashboard' or 'Projects' clicked)
         ===================================================================== */}
      {currentView === 'dashboard' ? (
        <main className="flex-1 overflow-y-auto bg-[#111318] p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Top Header Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#303744] pb-6">
              <div>
                <h1 className="text-2xl font-bold text-[#F3F4F6] tracking-tight">Your Book Projects</h1>
                <p className="text-sm text-[#A1A9B8] mt-1">
                  Create, manage, sort, and export print-ready Amazon KDP notebooks, journals, and planners.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentView('editor')}
                  className="px-4 py-2 bg-[#252B36] hover:bg-[#303744] border border-[#303744] text-[#F3F4F6] rounded-md text-xs font-medium cursor-pointer transition"
                >
                  Return to Active Editor
                </button>
                <button
                  onClick={() => handleCreateNewProject('New KDP Notebook', '6x9', 'lined')}
                  className="px-4 py-2 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded-md text-xs font-semibold flex items-center gap-2 cursor-pointer transition shadow-xs"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>Create New Book</span>
                </button>
              </div>
            </div>

            {/* Search & Sort Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative w-72">
                  <Search className="w-4 h-4 text-[#A1A9B8] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={dashboardSearch}
                    onChange={e => setDashboardSearch(e.target.value)}
                    placeholder="Search saved books..."
                    className="w-full bg-[#171B23] border border-[#303744] focus:border-[#1677FF] rounded-md pl-9 pr-3 py-2 text-xs text-[#F3F4F6] placeholder-[#A1A9B8] focus:outline-none"
                  />
                </div>

                {/* Dashboard Sort Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#A1A9B8]">Sort by:</span>
                  <select
                    aria-label="Sort Projects"
                    value={dashboardSort}
                    onChange={e => setDashboardSort(e.target.value as 'recent' | 'name' | 'pages')}
                    className="h-8.5 bg-[#171B23] border border-[#303744] focus:border-[#1677FF] rounded-md px-3 text-xs text-[#F3F4F6] cursor-pointer focus:outline-none"
                  >
                    <option value="recent">Last Edited</option>
                    <option value="name">Project Name (A–Z)</option>
                    <option value="pages">Page Count</option>
                  </select>
                </div>
              </div>

              <div className="text-xs text-[#A1A9B8] tabular-nums">
                {displayedDashboardProjects.length} of {savedProjects.length} saved projects in workspace
              </div>
            </div>

            {/* Recent Projects Grid */}
            <section>
              <h2 className="text-sm font-semibold text-[#F3F4F6] mb-4">Recent Projects</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {displayedDashboardProjects.map(proj => {
                  const isCurrent = proj.id === project.id;
                  const coverPage = proj.pages.find(p => p.isCover) || proj.pages[0];
                  const coverTitle =
                    coverPage?.elements.find(e => e.type === 'text')?.text || proj.title.toUpperCase();
                  const firstInterior = proj.pages.find(p => !p.isCover);
                  const isRenaming = renamingProjectId === proj.id;
                  const isConfirmingDelete = confirmDeleteProjectId === proj.id;

                  return (
                    <div
                      key={proj.id}
                      className={`bg-[#171B23] border rounded-lg p-4 flex flex-col justify-between transition ${
                        isCurrent ? 'border-[#1677FF]' : 'border-[#303744] hover:border-[#4B5563]'
                      }`}
                    >
                      <div>
                        {/* Dynamic Miniature Spread Preview reflecting actual project content */}
                        <div
                          onClick={() => handleOpenProject(proj)}
                          className="h-36 bg-[#111318] border border-[#303744] rounded-md p-3 flex items-center justify-center cursor-pointer mb-3.5 relative"
                        >
                          <div className="w-44 h-28 bg-white rounded-xs shadow-md flex overflow-hidden border border-slate-300">
                            <div
                              style={{ backgroundColor: firstInterior?.backgroundColor || '#FFFFFF' }}
                              className="w-1/2 border-r border-slate-200 p-2 flex flex-col justify-center gap-1"
                            >
                              {firstInterior?.templateType === 'dotgrid' ? (
                                <div className="grid grid-cols-4 gap-1 p-1">
                                  {Array.from({ length: 12 }).map((_, i) => (
                                    <div key={i} className="w-0.5 h-0.5 rounded-full bg-slate-400" />
                                  ))}
                                </div>
                              ) : (
                                <>
                                  <div className="h-1 w-3/4 bg-slate-200" />
                                  <div className="h-1 w-1/2 bg-red-200" />
                                  <div className="h-1 w-2/3 bg-blue-200" />
                                </>
                              )}
                            </div>
                            <div
                              style={{ backgroundColor: coverPage?.backgroundColor || '#FFFFFF' }}
                              className="w-1/2 p-2 flex flex-col items-center justify-center text-center relative overflow-hidden"
                            >
                              {coverPage?.elements
                                .filter(e => e.type === 'image' && e.imageUrl)
                                .map(img => (
                                  <img
                                    key={img.id}
                                    src={img.imageUrl}
                                    alt={img.imageAlt || 'Cover'}
                                    className="w-7 h-7 object-contain mb-0.5 pointer-events-none"
                                  />
                                ))}
                              <div className="text-[7px] font-serif font-bold text-slate-900 tracking-wider truncate max-w-full relative z-10">
                                {coverTitle}
                              </div>
                              <div className="w-4 h-px bg-slate-400 my-1 relative z-10" />
                              <div className="text-[5px] text-slate-500 uppercase relative z-10">
                                {proj.customWidthIn || 6}×{proj.customHeightIn || 9}&quot; • {proj.pages.length}p
                              </div>
                            </div>
                          </div>

                          {isCurrent && (
                            <span className="absolute top-2 right-2 px-2 py-0.5 bg-[#1677FF] text-white text-[10px] font-semibold rounded">
                              Active
                            </span>
                          )}
                        </div>

                        {/* Project Title or Inline Rename Input */}
                        {isRenaming ? (
                          <div className="flex items-center gap-1.5 mb-1">
                            <input
                              type="text"
                              value={renameDraft}
                              onChange={e => setRenameDraft(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleConfirmRenameProject(proj.id);
                                if (e.key === 'Escape') setRenamingProjectId(null);
                              }}
                              autoFocus
                              className="flex-1 h-7 bg-[#111318] border border-[#1677FF] rounded px-2 text-xs text-[#F3F4F6] focus:outline-none"
                            />
                            <button
                              onClick={() => handleConfirmRenameProject(proj.id)}
                              className="px-2 h-7 bg-[#1677FF] text-white rounded text-[11px] font-semibold cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-[#F3F4F6] truncate">{proj.title}</h3>
                              <div className="text-xs text-[#A1A9B8] mt-0.5 tabular-nums">
                                {proj.customWidthIn || 6}×{proj.customHeightIn || 9}&quot; Trim · {proj.pages.length}{' '}
                                Pages · {proj.lastSaved}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Delete Confirmation Prompt OR Standard Card Actions */}
                      {isConfirmingDelete ? (
                        <div className="mt-4 pt-3 border-t border-[#303744] flex items-center justify-between gap-2 bg-rose-950/20 -mx-2 px-2 py-1.5 rounded">
                          <span className="text-[11px] text-rose-300 font-medium">Permanently delete?</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleDeleteProjectConfirmed(proj.id)}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-semibold cursor-pointer"
                            >
                              Confirm Delete
                            </button>
                            <button
                              onClick={() => setConfirmDeleteProjectId(null)}
                              className="px-2 py-1 bg-[#252B36] text-[#A1A9B8] hover:text-white rounded text-[11px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-[#303744]">
                          <button
                            onClick={() => handleOpenProject(proj)}
                            className="px-3 py-1.5 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded text-xs font-semibold cursor-pointer transition"
                          >
                            Open in Editor
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setRenamingProjectId(proj.id);
                                setRenameDraft(proj.title);
                              }}
                              title="Rename Project"
                              aria-label="Rename Project"
                              className="p-1.5 text-[#A1A9B8] hover:text-[#F3F4F6] hover:bg-[#252B36] rounded cursor-pointer transition"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDuplicateProject(proj)}
                              title="Duplicate Project"
                              aria-label="Duplicate Project"
                              className="p-1.5 text-[#A1A9B8] hover:text-[#F3F4F6] hover:bg-[#252B36] rounded cursor-pointer transition"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteProjectId(proj.id)}
                              title="Delete Project"
                              aria-label="Delete Project"
                              className="p-1.5 text-[#A1A9B8] hover:text-rose-400 hover:bg-[#252B36] rounded cursor-pointer transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Quick-Start Template Starters */}
            <section>
              <h2 className="text-sm font-semibold text-[#F3F4F6] mb-4">Start from a KDP Book Template</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    title: '6×9 Lined Journal',
                    trim: '6x9' as const,
                    tmpl: 'lined',
                    desc: 'Standard college-ruled notebook with cover spread',
                  },
                  {
                    title: 'Daily Timeblock Planner',
                    trim: '6x9' as const,
                    tmpl: 'daily_planner',
                    desc: 'Hourly schedule, priorities, and reflection box',
                  },
                  {
                    title: '8×10 Bullet Dot Grid',
                    trim: '8x10' as const,
                    tmpl: 'dotgrid',
                    desc: '5mm dot grid matrix for bullet journaling',
                  },
                  {
                    title: '8.5×11 Activity & Puzzle Book',
                    trim: '8.5x11' as const,
                    tmpl: 'sudoku',
                    desc: 'Large format activity book with puzzle grids',
                  },
                ].map(item => (
                  <div
                    key={item.title}
                    className="bg-[#171B23] border border-[#303744] hover:border-[#1677FF] rounded-lg p-4 flex flex-col justify-between transition"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[#F3F4F6]">{item.title}</div>
                      <p className="text-xs text-[#A1A9B8] mt-1">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => handleCreateNewProject(item.title, item.trim, item.tmpl)}
                      className="mt-4 w-full py-1.5 bg-[#252B36] hover:bg-[#1677FF] text-[#F3F4F6] hover:text-white rounded text-xs font-semibold cursor-pointer transition"
                    >
                      Use Template
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      ) : (
        /* =====================================================================
            MAIN EDITOR WORKSPACE (Left Rail + Pages Panel + Central Canvas + Right Inspector)
           ===================================================================== */
        <div className="flex-1 flex overflow-hidden">
          {/* B1. FAR-LEFT VERTICAL TOOL RAIL (72px wide, #171B23, matching PageForge reference) */}
          <aside className="w-[72px] bg-[#171B23] border-r border-[#303744] flex flex-col items-center justify-between py-3 shrink-0 z-20">
            <div className="flex flex-col items-center gap-1.5 w-full">
              {[
                { id: 'pages' as const, label: 'Pages', icon: FileText, tip: 'Manage Book Pages' },
                { id: 'templates' as const, label: 'Templates', icon: SlidersHorizontal, tip: 'Interior Page Templates' },
                { id: 'text' as const, label: 'Text', icon: Type, tip: 'Add Typography & Text' },
                { id: 'elements' as const, label: 'Elements', icon: LayoutGrid, tip: 'Add Shapes & Dividers' },
                { id: 'images' as const, label: 'Images', icon: ImageIcon, tip: 'Upload or Add Image Overlays' },
                { id: 'backgrounds' as const, label: 'Backgrounds', icon: Palette, tip: 'Page Background Colors' },
                { id: 'settings' as const, label: 'Settings', icon: Settings, tip: 'KDP Book Specifications' },
              ].map(tool => {
                const IconComp = tool.icon;
                const isActive = leftPanelOpen && activeLeftTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    title={tool.tip}
                    onClick={() => {
                      if (!leftPanelOpen) {
                        setLeftPanelOpen(true);
                        setActiveLeftTool(tool.id);
                      } else if (tool.id === activeLeftTool && tool.id === 'pages') {
                        setLeftPanelOpen(false);
                      } else {
                        setActiveLeftTool(tool.id === activeLeftTool ? 'pages' : tool.id);
                      }
                    }}
                    className={`w-[58px] py-2 rounded-lg flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                      isActive
                        ? 'bg-[#1677FF]/15 text-[#1677FF] border border-[#1677FF]/40 font-semibold'
                        : 'text-[#A1A9B8] hover:text-[#F3F4F6] hover:bg-[#252B36]/60 border border-transparent'
                    }`}
                  >
                    <IconComp className="w-4 h-4" />
                    <span className="text-[10px] leading-tight tracking-tight">{tool.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Bottom Collapse/Expand Left Panel Button */}
            <button
              onClick={() => setLeftPanelOpen(prev => !prev)}
              aria-label={leftPanelOpen ? 'Collapse Left Panel' : 'Expand Left Panel'}
              title={leftPanelOpen ? 'Collapse Left Panel to enlarge canvas' : 'Expand Left Panel'}
              className="w-[54px] py-2 rounded-lg flex flex-col items-center justify-center gap-1 text-[#A1A9B8] hover:text-[#F3F4F6] hover:bg-[#252B36] border border-[#303744]/60 cursor-pointer transition"
            >
              {leftPanelOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4 text-[#1677FF]" />}
              <span className="text-[9px] leading-tight">{leftPanelOpen ? 'Hide' : 'Open'}</span>
            </button>
          </aside>

          {/* Hidden File Input for Custom Image Overlay */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />

          {/* B2. PAGES THUMBNAIL PANEL (Collapsible to the side so main book page can enlarge) */}
          {leftPanelOpen && (
            <aside
              className={`w-[188px] bg-[#171B23] border-r border-[#303744] flex-col shrink-0 select-none z-10 transition-all ${
                activeLeftTool !== 'pages' ? 'hidden md:flex' : 'flex'
              }`}
            >
              {/* Heading: Pages (24) + Blue Add Page Button + Collapse Toggle */}
              <div className="h-11 px-3 border-b border-[#303744]/60 flex items-center justify-between gap-1 shrink-0">
                <span className="text-[13px] font-semibold text-[#F3F4F6] tabular-nums">
                  Pages ({project.pages.length})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleAddPage()}
                    aria-label="Add Page"
                    title="Add 1 new page"
                    className="w-6.5 h-6.5 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded-md flex items-center justify-center cursor-pointer transition shadow-xs"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  </button>
                  <button
                    onClick={() => setLeftPanelOpen(false)}
                    aria-label="Close Pages Panel"
                    title="Close Left Panel to enlarge book canvas"
                    className="w-6.5 h-6.5 text-[#A1A9B8] hover:text-[#F3F4F6] hover:bg-[#252B36] rounded-md flex items-center justify-center cursor-pointer transition"
                  >
                    <PanelLeftClose className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Bulk Add Pages & Total Book Pages Quick Bar */}
              <div className="p-2.5 border-b border-[#303744]/80 bg-[#131720]/90 space-y-2 shrink-0">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-[#A1A9B8] font-medium">
                    <span>Bulk Add Pages</span>
                    <div className="flex items-center gap-1">
                      {[10, 25, 50].map(preset => (
                        <button
                          key={preset}
                          onClick={() => handleBulkAddPages(preset)}
                          title={`Bulk add ${preset} inner pages`}
                          className="px-1.5 py-0.5 bg-[#202631] hover:bg-[#1677FF] text-[#F3F4F6] hover:text-white rounded text-[9px] font-semibold cursor-pointer transition tabular-nums"
                        >
                          +{preset}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      aria-label="Bulk Add Page Count"
                      value={bulkPagesInput}
                      onChange={e => setBulkPagesInput(Math.max(1, Number(e.target.value) || 1))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleBulkAddPages();
                      }}
                      className="w-14 h-7 bg-[#171B23] border border-[#303744] focus:border-[#1677FF] rounded px-1.5 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                    />
                    <button
                      onClick={() => handleBulkAddPages()}
                      title="Bulk add inner pages to book"
                      className="flex-1 h-7 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <Plus className="w-3 h-3 stroke-[2.5]" />
                      <span>Bulk Add</span>
                    </button>
                  </div>
                </div>

                <div className="pt-1.5 border-t border-[#303744]/50 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-[#A1A9B8] font-medium">
                    <span>Total Book Pages</span>
                    <span className="text-[#60A5FA] tabular-nums">{project.pages.length - 1} inner</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={2}
                      max={828}
                      aria-label="Total Book Pages"
                      value={totalBookPagesInput}
                      onChange={e => setTotalBookPagesInput(Number(e.target.value))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSetTotalBookPages();
                      }}
                      className="w-14 h-7 bg-[#171B23] border border-[#303744] focus:border-[#1677FF] rounded px-1.5 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                    />
                    <button
                      onClick={() => handleSetTotalBookPages()}
                      title="Set total number of pages in book"
                      className="flex-1 h-7 bg-[#252B36] hover:bg-[#1677FF] text-[#F3F4F6] hover:text-white border border-[#303744] rounded text-[11px] font-semibold cursor-pointer transition"
                    >
                      Set Total
                    </button>
                  </div>
                </div>

                {/* Add Index Pages After Front Cover Quick Bar */}
                <div className="pt-1.5 border-t border-[#303744]/50 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-[#A1A9B8] font-medium">
                    <span className="text-[#F3F4F6] font-semibold">Index After Cover</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 4].map(cnt => (
                        <button
                          key={cnt}
                          onClick={() => handleInsertIndexPagesAfterCover(selectedIndexStyle, cnt)}
                          title={`Insert ${cnt} Index Page${cnt > 1 ? 's' : ''} right after Front Cover`}
                          className="px-1.5 py-0.5 bg-[#202631] hover:bg-[#1677FF] text-[#60A5FA] hover:text-white rounded text-[9px] font-semibold cursor-pointer transition tabular-nums"
                        >
                          +{cnt}p
                        </button>
                      ))}
                    </div>
                  </div>
                  <select
                    aria-label="Choose Index Page Template"
                    value={
                      !activePage.isCover && isIndexTemplateType(activePage.templateType)
                        ? (activePage.templateType as IndexTemplateStyle)
                        : selectedIndexStyle
                    }
                    onChange={e => handleSelectIndexStyle(e.target.value as IndexTemplateStyle)}
                    className="w-full h-7 bg-[#171B23] border border-[#303744] focus:border-[#1677FF] rounded px-1.5 text-[11px] text-[#F3F4F6] cursor-pointer focus:outline-none"
                  >
                    {INDEX_PAGE_TEMPLATES.map(idxTmpl => (
                      <option key={idxTmpl.id} value={idxTmpl.id}>
                        {idxTmpl.title}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={() => setIndexPreviewModalOpen(true)}
                      data-testid="open-index-picker-modal-btn"
                      title="Preview & configure all 12 Index Page templates"
                      className="h-7 bg-[#202631] hover:bg-[#252B36] border border-[#303744] text-[#F3F4F6] rounded text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <Eye className="w-3 h-3 text-[#60A5FA]" />
                      <span>Configure (12)</span>
                    </button>
                    <button
                      onClick={() =>
                        handleInsertIndexPagesAfterCover(
                          selectedIndexStyle,
                          indexConfigDraft.pageCount || 1
                        )
                      }
                      data-testid="add-index-after-cover-btn"
                      title="Insert configured Index Page immediately after the Front Cover"
                      className="h-7 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <Plus className="w-3 h-3 stroke-[2.5]" />
                      <span>Add Index</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Vertically Stacked Page Thumbnails */}
              <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3.5">
                {project.pages.map((p, idx) => {
                  const isSelected = idx === activePageIndex;
                  const isDragTarget = dragOverPageIndex === idx && draggedPageIndex !== idx && !p.isCover;
                  return (
                    <div
                      key={p.id}
                      draggable={!p.isCover}
                      onDragStart={() => {
                        if (!p.isCover) setDraggedPageIndex(idx);
                      }}
                      onDragOver={e => {
                        if (!p.isCover && draggedPageIndex !== null) {
                          e.preventDefault();
                          setDragOverPageIndex(idx);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverPageIndex === idx) setDragOverPageIndex(null);
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        if (draggedPageIndex !== null && !p.isCover) {
                          handleReorderPage(draggedPageIndex, idx);
                        }
                        setDraggedPageIndex(null);
                        setDragOverPageIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggedPageIndex(null);
                        setDragOverPageIndex(null);
                      }}
                      className={`group flex flex-col items-center relative ${
                        isDragTarget ? 'ring-2 ring-[#22C55E] rounded-lg' : ''
                      }`}
                    >
                      <div
                        onClick={() => {
                          setActivePageIndex(idx);
                          setSelectedElementId(null);
                        }}
                        className={`w-full p-2.5 rounded-lg transition cursor-pointer border-2 relative ${
                          isSelected
                            ? 'bg-[#202634] border-[#1677FF] shadow-md'
                            : 'bg-[#202531] border-transparent hover:border-[#303744]'
                        }`}
                      >
                        {/* Hover Quick Actions for Interior Pages (Reorder, Duplicate, Delete) */}
                        {!p.isCover && (
                          <div
                            onClick={e => e.stopPropagation()}
                            className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-1 right-1 z-20 flex items-center gap-0.5 bg-[#111318]/90 border border-[#303744] rounded px-1 py-0.5 shadow"
                          >
                            <button
                              onClick={() => handleReorderPage(idx, Math.max(1, idx - 1))}
                              disabled={idx <= 1}
                              title="Move Page Up"
                              aria-label={`Move Page ${idx + 1} Up`}
                              className="p-0.5 text-[#A1A9B8] hover:text-white disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleReorderPage(idx, Math.min(project.pages.length - 1, idx + 1))}
                              disabled={idx >= project.pages.length - 1}
                              title="Move Page Down"
                              aria-label={`Move Page ${idx + 1} Down`}
                              className="p-0.5 text-[#A1A9B8] hover:text-white disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDuplicatePage(idx)}
                              title="Duplicate Page"
                              aria-label={`Duplicate Page ${idx + 1}`}
                              className="p-0.5 text-[#A1A9B8] hover:text-[#1677FF] cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeletePage(idx)}
                              title="Delete Page"
                              aria-label={`Delete Page ${idx + 1}`}
                              className="p-0.5 text-[#A1A9B8] hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {/* Miniature White Book Page */}
                        <div
                          style={{ backgroundColor: p.backgroundColor || '#FFFFFF' }}
                          className="w-full aspect-[3/4] bg-white rounded-[2px] shadow-xs border border-slate-300 flex flex-col items-center justify-center p-2 relative overflow-hidden"
                        >
                          {renderPageThumbnailContent(p)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 mt-1.5">
                        {!p.isCover && (
                          <GripVertical className="w-2.5 h-2.5 text-[#A1A9B8]/40 opacity-0 group-hover:opacity-100" />
                        )}
                        <span
                          className={`text-[11px] tabular-nums ${
                            isSelected ? 'text-[#F3F4F6] font-semibold' : 'text-[#A1A9B8]'
                          }`}
                        >
                          {p.isCover
                            ? '1 (Cover)'
                            : isIndexTemplateType(p.templateType)
                            ? `${idx + 1} (Index)`
                            : idx + 1}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          )}

          {/* B3. CONTEXTUAL TOOL DRAWER (Opens when leftPanelOpen is true and Templates, Text, Elements, Images, Backgrounds, or Settings is clicked) */}
          {leftPanelOpen && activeLeftTool !== 'pages' && (
            <aside
              className={`${
                activeLeftTool === 'templates'
                  ? 'w-[calc(100vw-72px)] sm:w-[340px] max-w-[340px]'
                  : 'w-[calc(100vw-72px)] sm:w-76 max-w-76'
              } bg-[#191D25] border-r border-[#303744] flex flex-col shrink-0 z-20 shadow-2xl overflow-hidden`}
            >
              <div className="h-12 px-4 border-b border-[#303744] flex items-center justify-between shrink-0">
                <span className="font-semibold text-[#F3F4F6] text-[13px] capitalize">
                  {activeLeftTool === 'templates'
                    ? 'Index & Interior Templates'
                    : activeLeftTool === 'elements'
                    ? 'Shapes & Elements'
                    : activeLeftTool === 'images'
                    ? 'Image Overlays'
                    : activeLeftTool}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setLeftPanelOpen(false)}
                    aria-label="Collapse Left Side Panels"
                    title="Close all left panels to enlarge book canvas"
                    className="text-[#A1A9B8] hover:text-[#F3F4F6] hover:bg-[#252B36] p-1 rounded cursor-pointer transition"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveLeftTool('pages')}
                    aria-label="Close Tool Drawer"
                    title="Close drawer to enlarge book canvas"
                    className="text-[#A1A9B8] hover:text-[#F3F4F6] hover:bg-[#252B36] p-1 rounded cursor-pointer transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 1. INTERIOR & INDEX TEMPLATES DRAWER */}
              {activeLeftTool === 'templates' && (
                <div className="flex-1 overflow-y-auto divide-y divide-[#303744]">
                  {/* SECTION A: EXPANDED 12-TEMPLATE INDEX PAGE LIBRARY & CONFIGURATOR */}
                  <div className="p-3 bg-[#141821] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-bold text-[#60A5FA] uppercase tracking-wider block">
                          Index Page Library (12 Templates)
                        </span>
                        <span className="text-[10px] text-[#A1A9B8]">
                          Inserts right after the Front Cover (Page 2)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIndexPreviewModalOpen(true)}
                        className="px-2 py-1 bg-[#202631] hover:bg-[#1677FF] text-[#60A5FA] hover:text-white border border-[#303744] rounded text-[10px] font-semibold cursor-pointer transition shrink-0"
                      >
                        Full Preview
                      </button>
                    </div>

                    {/* Search Index Templates */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#A1A9B8] absolute left-2.5 top-2" />
                      <input
                        type="text"
                        data-testid="index-template-search-input"
                        value={indexSearchQuery}
                        onChange={e => setIndexSearchQuery(e.target.value)}
                        placeholder="Search 12 index templates (e.g. Recipe, Study, A-Z)..."
                        className="w-full bg-[#111318] border border-[#303744] focus:border-[#1677FF] rounded px-2.5 py-1.5 pl-8 text-xs text-[#F3F4F6] placeholder-[#A1A9B8] focus:outline-none"
                      />
                    </div>

                    {/* Category Filter Pills */}
                    <div className="flex flex-wrap gap-1">
                      {(['All', ...INDEX_TEMPLATE_CATEGORIES] as const).map(cat => {
                        const isCatActive = selectedIndexCategory === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            data-testid={`index-category-tab-${cat}`}
                            onClick={() => setSelectedIndexCategory(cat)}
                            className={`px-2 py-1 rounded text-[10px] font-semibold cursor-pointer transition border ${
                              isCatActive
                                ? 'bg-[#1677FF] border-[#1677FF] text-white'
                                : 'bg-[#171B23] border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>

                    {/* 12 Index Template Cards with Visual Previews, Full Titles, Concise Descriptions, Preview & Add Actions */}
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
                      {filteredIndexTemplates.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[#A1A9B8] bg-[#171B23] rounded border border-[#303744]">
                          No index templates match &ldquo;{indexSearchQuery}&rdquo;.
                        </div>
                      ) : (
                        filteredIndexTemplates.map(idxTmpl => {
                          const isSelectedCard = selectedIndexStyle === idxTmpl.id;
                          const isActiveOnCurrentPage =
                            !activePage.isCover && activePage.templateType === idxTmpl.id;
                          return (
                            <div
                              key={idxTmpl.id}
                              data-testid={`index-template-card-${idxTmpl.id}`}
                              onClick={() => handleSelectIndexStyle(idxTmpl.id, false)}
                              className={`p-2.5 rounded-lg border transition cursor-pointer flex gap-2.5 items-start ${
                                isSelectedCard
                                  ? 'bg-[#1677FF]/14 border-[#1677FF] shadow-sm'
                                  : 'bg-[#171B23] border-[#303744] hover:border-[#4B5563]'
                              }`}
                            >
                              {/* Miniature Visual Layout Preview */}
                              <div className="w-14 h-[74px] shrink-0 rounded overflow-hidden border border-[#303744] bg-white shadow-xs">
                                {renderIndexCardMiniSvg(idxTmpl.id)}
                              </div>

                              {/* Complete Name, Category, Full Description & Actions */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-1">
                                  <div className="text-xs font-semibold text-[#F3F4F6] leading-snug">
                                    {idxTmpl.title}
                                  </div>
                                  {(isSelectedCard || isActiveOnCurrentPage) && (
                                    <span className="px-1.5 py-0.5 bg-[#1677FF] text-white text-[9px] font-bold rounded shrink-0">
                                      {isActiveOnCurrentPage ? 'On Page' : 'Selected'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-[#60A5FA] font-medium mt-0.5">
                                  {idxTmpl.category}
                                </div>
                                <p className="text-[10px] text-[#A1A9B8] leading-relaxed mt-1">
                                  {idxTmpl.description}
                                </p>

                                <div
                                  className="flex items-center gap-1.5 mt-2"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    data-testid={`preview-index-card-${idxTmpl.id}`}
                                    onClick={() => {
                                      handleSelectIndexStyle(idxTmpl.id, false);
                                      setIndexPreviewModalOpen(true);
                                    }}
                                    className="px-2 py-1 bg-[#202631] hover:bg-[#252B36] border border-[#303744] text-[#F3F4F6] rounded text-[10px] font-semibold cursor-pointer transition flex items-center gap-1"
                                  >
                                    <Eye className="w-3 h-3 text-[#60A5FA]" />
                                    <span>Preview</span>
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`add-index-card-${idxTmpl.id}`}
                                    onClick={() => {
                                      const cfg =
                                        selectedIndexStyle === idxTmpl.id
                                          ? indexConfigDraft
                                          : getDefaultIndexConfig(idxTmpl.id);
                                      handleInsertIndexPagesAfterCover(
                                        idxTmpl.id,
                                        cfg.pageCount || 1,
                                        false,
                                        cfg
                                      );
                                    }}
                                    className="px-2.5 py-1 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded text-[10px] font-semibold cursor-pointer transition flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3 stroke-[2.5]" />
                                    <span>Add Template</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Collapsible Template Configuration Panel */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setIndexConfigExpanded(prev => !prev)}
                        className="w-full py-1.5 px-2.5 bg-[#202631] hover:bg-[#252B36] border border-[#303744] rounded text-[11px] font-semibold text-[#F3F4F6] flex items-center justify-between cursor-pointer transition mb-2"
                      >
                        <span>Template Configuration Options</span>
                        {indexConfigExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-[#60A5FA]" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-[#A1A9B8]" />
                        )}
                      </button>
                      {indexConfigExpanded && renderIndexConfigurationControls(true)}
                    </div>
                  </div>

                  {/* SECTION B: GENERAL INTERIOR PAGE TEMPLATES */}
                  <div className="p-3.5 bg-[#171B23] space-y-2.5">
                    <div className="text-[11px] font-semibold text-[#F3F4F6] uppercase tracking-wider">
                      General Interior Page Templates
                    </div>
                    <div className="text-[11px] font-medium text-[#A1A9B8]">Apply Template Mode:</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => setTemplateApplyScope('current')}
                        className={`py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer transition ${
                          templateApplyScope === 'current'
                            ? 'bg-[#1677FF] text-white'
                            : 'bg-[#252B36] text-[#A1A9B8] hover:text-[#F3F4F6]'
                        }`}
                      >
                        1 Page
                      </button>
                      <button
                        onClick={() => setTemplateApplyScope('all')}
                        className={`py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer transition ${
                          templateApplyScope === 'all'
                            ? 'bg-[#1677FF] text-white'
                            : 'bg-[#252B36] text-[#A1A9B8] hover:text-[#F3F4F6]'
                        }`}
                      >
                        All Pages
                      </button>
                      <button
                        onClick={() => setTemplateApplyScope('batch')}
                        className={`py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer transition ${
                          templateApplyScope === 'batch'
                            ? 'bg-[#1677FF] text-white'
                            : 'bg-[#252B36] text-[#A1A9B8] hover:text-[#F3F4F6]'
                        }`}
                      >
                        +Add Batch
                      </button>
                    </div>

                    {templateApplyScope === 'batch' && (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-[#A1A9B8]">Pages to generate:</span>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={batchPageCountToAdd}
                          onChange={e => setBatchPageCountToAdd(Number(e.target.value))}
                          className="w-20 h-7 bg-[#111318] border border-[#303744] rounded px-2 text-xs text-[#F3F4F6] tabular-nums"
                        />
                      </div>
                    )}

                    <div className="relative pt-1">
                      <Search className="w-3.5 h-3.5 text-[#A1A9B8] absolute left-2.5 top-3" />
                      <input
                        type="text"
                        value={templateSearchTerm}
                        onChange={e => setTemplateSearchTerm(e.target.value)}
                        placeholder="Filter general interior templates..."
                        className="w-full bg-[#111318] border border-[#303744] focus:border-[#1677FF] rounded px-2.5 py-1.5 pl-8 text-xs text-[#F3F4F6] placeholder-[#A1A9B8] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-2 pt-1">
                      {filteredTemplates.map(tmpl => {
                        const isActiveOnPage = !activePage.isCover && activePage.templateType === tmpl.id;
                        return (
                          <div
                            key={tmpl.id}
                            className={`p-2.5 rounded-md border flex items-center justify-between transition ${
                              isActiveOnPage
                                ? 'bg-[#252B36] border-[#1677FF]'
                                : 'bg-[#171B23] border-[#303744] hover:border-[#4B5563]'
                            }`}
                          >
                            <div className="pr-2">
                              <div className="font-medium text-[#F3F4F6] text-xs">{tmpl.title}</div>
                              <div className="text-[11px] text-[#A1A9B8]">{tmpl.category}</div>
                            </div>
                            <button
                              onClick={() => handleApplyTemplate(tmpl.id)}
                              className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition shrink-0 ${
                                isActiveOnPage && templateApplyScope !== 'batch'
                                  ? 'bg-[#22C55E] text-[#111318]'
                                  : 'bg-[#252B36] hover:bg-[#1677FF] text-[#F3F4F6] hover:text-white'
                              }`}
                            >
                              {templateApplyScope === 'batch'
                                ? `+${batchPageCountToAdd}p`
                                : isActiveOnPage
                                ? 'Active'
                                : 'Apply'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. TEXT TOOL DRAWER */}
              {activeLeftTool === 'text' && (
                <div className="p-4 space-y-3">
                  <button
                    onClick={() => handleAddText('heading')}
                    className="w-full p-3 bg-[#171B23] hover:bg-[#252B36] rounded-md border border-[#303744] hover:border-[#1677FF] text-left cursor-pointer transition"
                  >
                    <div className="font-serif font-bold text-base text-[#F3F4F6]">Add Cover Heading</div>
                    <div className="text-[11px] text-[#A1A9B8] mt-0.5">Classic serif display title</div>
                  </button>
                  <button
                    onClick={() => handleAddText('subheading')}
                    className="w-full p-3 bg-[#171B23] hover:bg-[#252B36] rounded-md border border-[#303744] hover:border-[#1677FF] text-left cursor-pointer transition"
                  >
                    <div className="font-semibold text-xs tracking-wider uppercase text-[#F3F4F6]">
                      Add Subtitle
                    </div>
                    <div className="text-[11px] text-[#A1A9B8] mt-0.5">Spaced uppercase subtitle</div>
                  </button>
                  <button
                    onClick={() => handleAddText('body')}
                    className="w-full p-3 bg-[#171B23] hover:bg-[#252B36] rounded-md border border-[#303744] hover:border-[#1677FF] text-left cursor-pointer transition"
                  >
                    <div className="text-xs text-[#F3F4F6]">Add Body Text</div>
                    <div className="text-[11px] text-[#A1A9B8] mt-0.5">Paragraph or page prompt</div>
                  </button>
                </div>
              )}

              {/* 3. ELEMENTS / SHAPES DRAWER */}
              {activeLeftTool === 'elements' && (
                <div className="p-3.5 flex-1 flex flex-col overflow-hidden">
                  <div className="relative mb-3">
                    <Search className="w-3.5 h-3.5 text-[#A1A9B8] absolute left-2.5 top-2" />
                    <input
                      type="text"
                      value={shapeSearchTerm}
                      onChange={e => setShapeSearchTerm(e.target.value)}
                      placeholder="Search shapes..."
                      className="w-full bg-[#111318] border border-[#303744] focus:border-[#1677FF] rounded px-2.5 py-1.5 pl-8 text-xs text-[#F3F4F6] placeholder-[#A1A9B8] focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 overflow-y-auto">
                    {filteredShapes.map((sh, i) => (
                      <button
                        key={i}
                        onClick={() => handleAddShape(sh.type)}
                        className="p-3 bg-[#171B23] hover:bg-[#252B36] border border-[#303744] hover:border-[#1677FF] rounded-md flex flex-col items-center gap-2 cursor-pointer transition"
                      >
                        <div className="w-8 h-8 flex items-center justify-center text-[#F3F4F6]">
                          {sh.type === 'circle' ? (
                            <div className="w-6 h-6 rounded-full border-2 border-current" />
                          ) : sh.type === 'line' ? (
                            <div className="w-7 h-0.5 bg-current" />
                          ) : (
                            <div className="w-6 h-6 border-2 border-current" />
                          )}
                        </div>
                        <span className="text-[11px] text-[#A1A9B8]">{sh.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. IMAGES OVERLAY DRAWER */}
              {activeLeftTool === 'images' && (
                <div className="p-4 space-y-4 overflow-y-auto">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 px-3 bg-[#1677FF] hover:bg-[#1668dc] text-white font-semibold rounded-md flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload Custom Image</span>
                  </button>
                  <p className="text-[11px] text-[#A1A9B8] leading-relaxed">
                    Insert paper cover artwork, emblems, or custom PNG/JPG/SVG graphics. Click Preview anytime to inspect your finished notebook cover and pages.
                  </p>

                  {/* Quick Fit Selected Image as Notebook Paper Cover */}
                  {selectedElement && selectedElement.type === 'image' && (
                    <div className="p-2.5 rounded-md bg-[#131720] border border-[#1677FF]/50 space-y-2">
                      <div className="text-[11px] font-semibold text-[#60A5FA]">
                        Fit Selected Image as Paper Cover:
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => handleFitElementToPaperCover('front_cover')}
                          className="py-1.5 px-2 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded text-[11px] font-semibold cursor-pointer transition"
                        >
                          Fit Front Cover
                        </button>
                        <button
                          onClick={() => handleFitElementToPaperCover('full_wrap')}
                          className="py-1.5 px-2 bg-[#252B36] hover:bg-[#1677FF] text-[#F3F4F6] hover:text-white rounded text-[11px] font-semibold cursor-pointer transition"
                        >
                          Fit Full Spread
                        </button>
                        <button
                          onClick={() => handleFitElementToPaperCover('back_cover')}
                          className="py-1.5 px-2 bg-[#202631] hover:bg-[#252B36] border border-[#303744] text-[#F3F4F6] rounded text-[10px] font-medium cursor-pointer transition"
                        >
                          Fit Back Cover
                        </button>
                        <button
                          onClick={() => handleFitElementToPaperCover('front_center')}
                          className="py-1.5 px-2 bg-[#202631] hover:bg-[#252B36] border border-[#303744] text-[#F3F4F6] rounded text-[10px] font-medium cursor-pointer transition"
                        >
                          Center Crest
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Full Notebook Paper Cover Templates */}
                  <div className="border-t border-[#303744] pt-3 space-y-2.5">
                    <div className="text-[11px] font-semibold text-[#F3F4F6]">
                      Notebook Paper Cover Designs
                    </div>
                    {[
                      {
                        title: 'Classic Composition Paper Cover',
                        desc: 'Full front notebook cover with frame',
                        target: 'front_cover' as const,
                        svg: `data:image/svg+xml;utf8,${encodeURIComponent(
                          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><rect width="600" height="900" fill="#1E293B"/><rect x="0" y="0" width="46" height="900" fill="#0F172A"/><rect x="40" y="36" width="524" height="828" rx="8" fill="none" stroke="#94A3B8" stroke-width="2" stroke-dasharray="8,6"/><rect x="100" y="290" width="400" height="290" rx="18" fill="#FFFFFF" stroke="#0F172A" stroke-width="6"/><rect x="114" y="304" width="372" height="262" rx="10" fill="none" stroke="#1E293B" stroke-width="2"/></svg>`
                        )}`,
                      },
                      {
                        title: 'Botanical Sage Paper Cover',
                        desc: 'Soft sage & gold arch paper cover',
                        target: 'front_cover' as const,
                        svg: `data:image/svg+xml;utf8,${encodeURIComponent(
                          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><rect width="600" height="900" fill="#E6EFE9"/><path d="M 90 820 L 90 320 A 210 210 0 0 1 510 320 L 510 820 Z" fill="#FFFFFF" stroke="#84A98C" stroke-width="4"/><circle cx="300" cy="240" r="46" fill="#F4F1EA" stroke="#52796F" stroke-width="3"/><path d="M265,240 Q300,195 335,240 Q300,285 265,240 Z" fill="none" stroke="#52796F" stroke-width="3"/></svg>`
                        )}`,
                      },
                      {
                        title: 'Vintage Kraft & Frame Cover',
                        desc: 'Warm kraft paper notebook cover',
                        target: 'front_cover' as const,
                        svg: `data:image/svg+xml;utf8,${encodeURIComponent(
                          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><rect width="600" height="900" fill="#EFE6D5"/><rect x="48" y="48" width="504" height="804" fill="none" stroke="#78350F" stroke-width="4"/><rect x="64" y="64" width="472" height="772" fill="none" stroke="#92400E" stroke-width="1.5"/><rect x="110" y="320" width="380" height="250" rx="8" fill="#FAF8F5" stroke="#78350F" stroke-width="3"/></svg>`
                        )}`,
                      },
                    ].map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleAddPaperCoverPreset(item.svg, item.title, item.target)}
                        className="w-full p-2.5 bg-[#171B23] hover:bg-[#252B36] border border-[#303744] hover:border-[#1677FF] rounded-md flex items-center gap-3 text-left cursor-pointer transition"
                      >
                        <img
                          src={item.svg}
                          alt={item.title}
                          className="w-9 h-12 rounded bg-white object-cover border border-slate-300 shrink-0"
                        />
                        <div>
                          <div className="text-xs font-medium text-[#F3F4F6]">{item.title}</div>
                          <div className="text-[11px] text-[#A1A9B8]">{item.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-[#303744] pt-3 space-y-2.5">
                    <div className="text-[11px] font-semibold text-[#F3F4F6]">Curated Cover Overlays</div>
                    {[
                      {
                        title: 'Botanical Wreath Emblem',
                        desc: 'Centered cover crest',
                        svg: `data:image/svg+xml;utf8,${encodeURIComponent(
                          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="78" fill="none" stroke="#171923" stroke-width="3" stroke-dasharray="5,4"/><circle cx="100" cy="100" r="64" fill="none" stroke="#171923" stroke-width="1.5"/><path d="M70,100 Q100,65 130,100 Q100,135 70,100 Z" fill="none" stroke="#1677FF" stroke-width="2.5"/></svg>`
                        )}`,
                      },
                      {
                        title: 'Composition Book Label',
                        desc: 'Front cover title frame',
                        svg: `data:image/svg+xml;utf8,${encodeURIComponent(
                          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 150"><rect x="8" y="8" width="224" height="134" rx="10" fill="#ffffff" stroke="#171923" stroke-width="4"/><rect x="16" y="16" width="208" height="118" rx="6" fill="none" stroke="#171923" stroke-width="1.5"/><line x1="36" y1="68" x2="204" y2="68" stroke="#94a3b8" stroke-width="1.5"/><line x1="36" y1="96" x2="204" y2="96" stroke="#94a3b8" stroke-width="1.5"/></svg>`
                        )}`,
                      },
                      {
                        title: 'Minimalist Sunburst Crest',
                        desc: 'Line art cover ornament',
                        svg: `data:image/svg+xml;utf8,${encodeURIComponent(
                          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="36" fill="none" stroke="#171923" stroke-width="3"/><line x1="100" y1="20" x2="100" y2="50" stroke="#171923" stroke-width="2.5"/><line x1="100" y1="150" x2="100" y2="180" stroke="#171923" stroke-width="2.5"/><line x1="20" y1="100" x2="50" y2="100" stroke="#171923" stroke-width="2.5"/><line x1="150" y1="100" x2="180" y2="100" stroke="#171923" stroke-width="2.5"/></svg>`
                        )}`,
                      },
                    ].map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleAddCuratedGraphic(item.svg, item.title)}
                        className="w-full p-2.5 bg-[#171B23] hover:bg-[#252B36] border border-[#303744] hover:border-[#1677FF] rounded-md flex items-center gap-3 text-left cursor-pointer transition"
                      >
                        <img
                          src={item.svg}
                          alt={item.title}
                          className="w-9 h-9 rounded bg-white p-1 border border-slate-300 shrink-0"
                        />
                        <div>
                          <div className="text-xs font-medium text-[#F3F4F6]">{item.title}</div>
                          <div className="text-[11px] text-[#A1A9B8]">{item.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. BACKGROUNDS DRAWER (Supports changing 1 Inner Page, All Inner Pages, or All Pages) */}
              {activeLeftTool === 'backgrounds' && (
                <div className="p-4 space-y-4 overflow-y-auto">
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-[#A1A9B8]">Apply Background Color To:</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => setBackgroundApplyScope('current')}
                        className={`py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer transition ${
                          backgroundApplyScope === 'current'
                            ? 'bg-[#1677FF] text-white'
                            : 'bg-[#252B36] text-[#A1A9B8] hover:text-[#F3F4F6]'
                        }`}
                      >
                        1 Inner Page
                      </button>
                      <button
                        onClick={() => setBackgroundApplyScope('all_inner')}
                        className={`py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer transition ${
                          backgroundApplyScope === 'all_inner'
                            ? 'bg-[#1677FF] text-white'
                            : 'bg-[#252B36] text-[#A1A9B8] hover:text-[#F3F4F6]'
                        }`}
                      >
                        All Inner Pages
                      </button>
                      <button
                        onClick={() => setBackgroundApplyScope('all_pages')}
                        className={`py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer transition ${
                          backgroundApplyScope === 'all_pages'
                            ? 'bg-[#1677FF] text-white'
                            : 'bg-[#252B36] text-[#A1A9B8] hover:text-[#F3F4F6]'
                        }`}
                      >
                        All Pages
                      </button>
                    </div>
                  </div>

                  {/* Custom Color Picker + Hex Input */}
                  <div className="space-y-2 pt-1 border-t border-[#303744]">
                    <label className="text-xs font-medium text-[#F3F4F6] block">Custom Inner Page Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label="Custom Inner Page Color"
                        value={
                          (!activePage.isCover
                            ? activePage.backgroundColor
                            : project.pages.find(p => !p.isCover)?.backgroundColor) || '#FFFFFF'
                        }
                        onChange={e => handleApplyPageBackground(e.target.value)}
                        className="w-9 h-9 rounded border border-[#303744] bg-transparent cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        aria-label="Inner Page Hex Color"
                        value={
                          (!activePage.isCover
                            ? activePage.backgroundColor
                            : project.pages.find(p => !p.isCover)?.backgroundColor) || '#FFFFFF'
                        }
                        onChange={e => {
                          const val = e.target.value;
                          if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                            handleApplyPageBackground(val);
                          }
                        }}
                        className="flex-1 h-9 bg-[#171B23] border border-[#303744] rounded-md px-2.5 text-xs text-[#F3F4F6] font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        onClick={() => {
                          const currentHex =
                            (!activePage.isCover
                              ? activePage.backgroundColor
                              : project.pages.find(p => !p.isCover)?.backgroundColor) || '#FFFFFF';
                          handleApplyPageBackground(currentHex, 'current');
                        }}
                        className="py-1.5 px-2 bg-[#252B36] hover:bg-[#303744] text-[#F3F4F6] rounded text-[11px] font-semibold cursor-pointer transition"
                      >
                        Apply to 1 Page
                      </button>
                      <button
                        onClick={() => {
                          const currentHex =
                            (!activePage.isCover
                              ? activePage.backgroundColor
                              : project.pages.find(p => !p.isCover)?.backgroundColor) || '#FFFFFF';
                          handleApplyPageBackground(currentHex, 'all_inner');
                        }}
                        className="py-1.5 px-2 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded text-[11px] font-semibold cursor-pointer transition"
                      >
                        Apply to All Inner
                      </button>
                    </div>
                  </div>

                  {/* Curated Paper & Tint Swatches */}
                  <div className="space-y-2 pt-1 border-t border-[#303744]">
                    <div className="text-xs font-medium text-[#A1A9B8]">Paper &amp; Tint Swatches</div>
                    <div className="grid grid-cols-3 gap-2">
                      {PAPER_BACKGROUND_SWATCHES.map(sw => {
                        const referenceColor = !activePage.isCover
                          ? activePage.backgroundColor
                          : project.pages.find(p => !p.isCover)?.backgroundColor || '#FFFFFF';
                        const isSelectedSwatch = referenceColor.toUpperCase() === sw.hex.toUpperCase();
                        return (
                          <button
                            key={sw.hex}
                            onClick={() => handleApplyPageBackground(sw.hex, undefined, sw.label)}
                            title={`${sw.label} (${sw.hex})`}
                            className={`p-1.5 rounded-md border flex flex-col items-center gap-1 cursor-pointer transition ${
                              isSelectedSwatch
                                ? 'border-[#1677FF] bg-[#1677FF]/15'
                                : 'border-[#303744] bg-[#171B23] hover:border-[#4B5563]'
                            }`}
                          >
                            <span
                              style={{ backgroundColor: sw.hex }}
                              className="w-full h-7 rounded-xs border border-slate-300/80 block"
                            />
                            <span className="text-[10px] text-[#F3F4F6] truncate max-w-full">{sw.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 6. SETTINGS DRAWER */}
              {activeLeftTool === 'settings' && (
                <div className="p-4 space-y-4 overflow-y-auto">
                  <div>
                    <label className="text-xs text-[#A1A9B8] block mb-1.5">Paper Stock</label>
                    <select
                      value={project.paperType}
                      onChange={e =>
                        updateProjectWithHistory(prev => ({ ...prev, paperType: e.target.value as any }))
                      }
                      className="w-full h-9 bg-[#171B23] border border-[#303744] rounded-md px-3 text-xs text-[#F3F4F6]"
                    >
                      <option value="white">White Paper (0.002252&quot; / page)</option>
                      <option value="cream">Cream Paper (0.0025&quot; / page)</option>
                      <option value="color">Standard Color (0.002252&quot; / page)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[#A1A9B8] block mb-1.5">Binding Type</label>
                    <select
                      value={project.binding}
                      onChange={e =>
                        updateProjectWithHistory(prev => ({ ...prev, binding: e.target.value as any }))
                      }
                      className="w-full h-9 bg-[#171B23] border border-[#303744] rounded-md px-3 text-xs text-[#F3F4F6]"
                    >
                      <option value="paperback">Amazon KDP Paperback</option>
                      <option value="hardcover">Amazon KDP Case Laminate Hardcover</option>
                    </select>
                  </div>
                  <div className="pt-2 border-t border-[#303744] space-y-2">
                    <label className="text-xs text-[#A1A9B8] block">Total Book Pages (Bulk Set)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={2}
                        max={828}
                        value={totalBookPagesInput}
                        onChange={e => setTotalBookPagesInput(Number(e.target.value))}
                        className="flex-1 h-9 bg-[#171B23] border border-[#303744] rounded-md px-3 text-xs text-[#F3F4F6] tabular-nums"
                      />
                      <button
                        onClick={() => handleSetTotalBookPages()}
                        className="px-3 h-9 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded-md text-xs font-semibold cursor-pointer transition"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-[#303744] space-y-2">
                    <label className="flex items-center justify-between text-xs text-[#F3F4F6] cursor-pointer">
                      <span>Show ISBN Barcode Zone</span>
                      <input
                        type="checkbox"
                        checked={showBarcodeGuide}
                        onChange={e => setShowBarcodeGuide(e.target.checked)}
                        className="accent-[#1677FF]"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs text-[#F3F4F6] cursor-pointer">
                      <span>Magnetic Guide Snapping</span>
                      <input
                        type="checkbox"
                        checked={snapToGuides}
                        onChange={e => setSnapToGuides(e.target.checked)}
                        className="accent-[#1677FF]"
                      />
                    </label>
                  </div>
                </div>
              )}
            </aside>
          )}

          {/* =====================================================================
              C. CENTRAL EDITING WORKSPACE (#111318 background, Rulers, Spread, Bottom Bar)
             ===================================================================== */}
          <div
            ref={workspaceContainerRef}
            className="flex-1 flex flex-col bg-[#111318] overflow-hidden relative"
          >
            {/* Left Docked Re-Open Tab when Left Panel is closed */}
            {!leftPanelOpen && (
              <button
                onClick={() => setLeftPanelOpen(true)}
                aria-label="Open Left Pages Panel"
                title="Open Left Pages Panel"
                className="absolute left-2 top-3 z-30 h-8 px-2.5 bg-[#191D25]/95 hover:bg-[#252B36] border border-[#303744] rounded-md text-xs text-[#F3F4F6] flex items-center gap-1.5 shadow-lg cursor-pointer transition"
              >
                <PanelLeftOpen className="w-3.5 h-3.5 text-[#1677FF]" />
                <span>Pages ({project.pages.length})</span>
              </button>
            )}

            {/* Right Docked Re-Open Tab when Right Properties Inspector is closed */}
            {!rightPanelOpen && (
              <button
                onClick={() => setRightPanelOpen(true)}
                aria-label="Open Right Properties Inspector"
                title="Open Right Properties Inspector"
                className="absolute right-2 top-3 z-30 h-8 px-2.5 bg-[#191D25]/95 hover:bg-[#252B36] border border-[#303744] rounded-md text-xs text-[#F3F4F6] flex items-center gap-1.5 shadow-lg cursor-pointer transition"
              >
                <span>Inspector</span>
                <PanelRightOpen className="w-3.5 h-3.5 text-[#1677FF]" />
              </button>
            )}

            {/* Pointer-Anchored Floating Quick Menu when an image or element is clicked (Appears anywhere near the mouse cursor) */}
            {selectedElement && measurementData && (
              <div
                ref={floatingMenuRef}
                data-testid="floating-element-menu"
                style={
                  floatingMenuPos
                    ? {
                        left: `${floatingMenuPos.left}px`,
                        top: `${floatingMenuPos.top}px`,
                      }
                    : { left: '50%', top: '48%', transform: 'translate(-50%, -50%)' }
                }
                className={`absolute z-30 bg-[#191D25]/95 backdrop-blur-xs border border-[#1677FF]/70 rounded-lg px-2.5 py-1.5 shadow-2xl flex flex-col gap-1.5 whitespace-nowrap transition-opacity ${
                  draggingElemId || resizingHandle ? 'opacity-75 pointer-events-none' : 'opacity-100'
                }`}
              >
                {/* Row 1: Element Type + Live Size Scale Slider (5% - 100%) + Quick -10% / +10% */}
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[11px] font-semibold text-[#1677FF] capitalize px-0.5">
                    {selectedElement.type}
                  </span>

                  <div className="h-3.5 w-px bg-[#303744]" />

                  <button
                    onClick={() => handleQuickScaleSelected(0.9)}
                    disabled={selectedElement.locked}
                    title="Scale Down 10%"
                    aria-label="Scale Selected Element Down"
                    className="px-1.5 py-0.5 bg-[#252B36] hover:bg-[#303744] text-[#F3F4F6] disabled:opacity-40 rounded text-[10px] font-mono cursor-pointer transition"
                  >
                    -10%
                  </button>
                  <div className="flex items-center gap-1.5 px-0.5" title="Drag to resize element directly from cursor menu">
                    <input
                      type="range"
                      aria-label="Element Size Scale"
                      min={5}
                      max={200}
                      step={1}
                      disabled={selectedElement.locked}
                      value={Math.min(200, Math.round(Math.max(selectedElement.width, selectedElement.height)))}
                      onChange={e => handleSetElementWidthPercent(Number(e.target.value))}
                      className="w-24 h-1.5 accent-[#1677FF] cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-[#F3F4F6] tabular-nums w-9 text-right">
                      {Math.round(Math.max(selectedElement.width, selectedElement.height))}%
                    </span>
                  </div>
                  <button
                    onClick={() => handleQuickScaleSelected(1.1)}
                    disabled={selectedElement.locked}
                    title="Scale Up 10%"
                    aria-label="Scale Selected Element Up"
                    className="px-1.5 py-0.5 bg-[#252B36] hover:bg-[#303744] text-[#F3F4F6] disabled:opacity-40 rounded text-[10px] font-mono cursor-pointer transition"
                  >
                    +10%
                  </button>
                </div>

                {/* Row 2: Quick Align, Layer Order, Lock, Duplicate & Delete */}
                <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#303744]/80">
                  <button
                    onClick={() => handleAlignSelected('left')}
                    disabled={selectedElement.locked}
                    title="Align Left to Safe Margin"
                    aria-label="Align Left"
                    className="p-1 text-[#A1A9B8] hover:text-white hover:bg-[#252B36] disabled:opacity-40 rounded cursor-pointer"
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleAlignSelected('center-h')}
                    disabled={selectedElement.locked}
                    title="Center Horizontally on Page"
                    aria-label="Center Horizontally"
                    className="px-1.5 py-0.5 bg-[#252B36] hover:bg-[#1677FF] text-[#F3F4F6] hover:text-white disabled:opacity-40 rounded text-[10px] font-medium cursor-pointer transition whitespace-nowrap"
                  >
                    Center H
                  </button>
                  <button
                    onClick={() => handleAlignSelected('middle-v')}
                    disabled={selectedElement.locked}
                    title="Center Vertically on Page"
                    aria-label="Center Vertically"
                    className="px-1.5 py-0.5 bg-[#252B36] hover:bg-[#1677FF] text-[#F3F4F6] hover:text-white disabled:opacity-40 rounded text-[10px] font-medium cursor-pointer transition whitespace-nowrap"
                  >
                    Center V
                  </button>
                  <button
                    onClick={() => handleAlignSelected('right')}
                    disabled={selectedElement.locked}
                    title="Align Right to Safe Margin"
                    aria-label="Align Right"
                    className="p-1 text-[#A1A9B8] hover:text-white hover:bg-[#252B36] disabled:opacity-40 rounded cursor-pointer"
                  >
                    <AlignRight className="w-3.5 h-3.5" />
                  </button>

                  {selectedElement.type === 'image' && (
                    <>
                      <div className="h-3.5 w-px bg-[#303744]" />
                      <button
                        onClick={handleStretchElementToBottom}
                        disabled={selectedElement.locked}
                        title="Stretch image vertically all the way to the bottom edge (100% height)"
                        className="px-1.5 py-0.5 bg-emerald-500/20 hover:bg-emerald-600 border border-emerald-500/50 text-emerald-300 hover:text-white disabled:opacity-40 rounded text-[10px] font-semibold cursor-pointer transition whitespace-nowrap"
                      >
                        Fit Bottom
                      </button>
                      <button
                        onClick={() => handleFitElementToPaperCover('front_cover')}
                        disabled={selectedElement.locked}
                        title="Fit image to Front Paper Cover"
                        className="px-1.5 py-0.5 bg-[#1677FF]/20 hover:bg-[#1677FF] border border-[#1677FF]/50 text-[#60A5FA] hover:text-white disabled:opacity-40 rounded text-[10px] font-semibold cursor-pointer transition whitespace-nowrap"
                      >
                        Fit Front Cover
                      </button>
                    </>
                  )}

                  <div className="h-3.5 w-px bg-[#303744]" />

                  <button
                    onClick={() => handleLayerOrder('forward')}
                    title="Bring Forward"
                    aria-label="Bring Forward"
                    className="p-1 text-[#A1A9B8] hover:text-white hover:bg-[#252B36] rounded cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleLayerOrder('backward')}
                    title="Send Backward"
                    aria-label="Send Backward"
                    className="p-1 text-[#A1A9B8] hover:text-white hover:bg-[#252B36] rounded cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      const nextLocked = !selectedElement.locked;
                      updateSelectedElement({ locked: nextLocked });
                      showToast(nextLocked ? 'Layer locked' : 'Layer unlocked');
                    }}
                    title={selectedElement.locked ? 'Unlock Element' : 'Lock Element'}
                    aria-label={selectedElement.locked ? 'Unlock Element' : 'Lock Element'}
                    className={`p-1 rounded cursor-pointer transition ${
                      selectedElement.locked
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'text-[#A1A9B8] hover:text-[#F3F4F6] hover:bg-[#252B36]'
                    }`}
                  >
                    {selectedElement.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={handleDuplicateSelected}
                    title="Duplicate Element (Ctrl+D)"
                    aria-label="Duplicate Element"
                    className="p-1 text-[#A1A9B8] hover:text-[#F3F4F6] hover:bg-[#252B36] rounded cursor-pointer transition"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={handleDeleteSelected}
                    disabled={selectedElement.locked}
                    title="Delete Element (Del)"
                    aria-label="Delete Element"
                    className="p-1 bg-rose-500/15 hover:bg-rose-500 disabled:opacity-40 text-rose-300 hover:text-white rounded cursor-pointer transition flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Main Scrollable, Left-Click Pannable, Touchscreen & Smart-Pen Canvas Viewport */}
            <div
              ref={workspaceScrollViewportRef}
              data-testid="workspace-canvas-viewport"
              onWheel={handleWorkspaceWheel}
              onPointerDown={handleWorkspacePointerDown}
              onMouseDown={handleWorkspaceMouseDown}
              onTouchStart={handleWorkspaceTouchStart}
              onTouchMove={handleWorkspaceTouchMove}
              onTouchEnd={handleWorkspaceTouchEnd}
              onTouchCancel={handleWorkspaceTouchEnd}
              onClick={e => {
                if (suppressNextClickDeselectRef.current) {
                  suppressNextClickDeselectRef.current = false;
                  return;
                }
                if (e.target === e.currentTarget || (e.target as HTMLElement)?.id === 'studio-canvas-svg') {
                  setSelectedElementId(null);
                }
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={e => handleMouseUp(e.clientX, e.clientY)}
              style={{ touchAction: 'none' }}
              className={`flex-1 overflow-hidden flex p-3 relative select-none ${
                isPanningCanvas
                  ? 'cursor-grabbing'
                  : isEffectivePanMode
                  ? 'cursor-grab'
                  : 'cursor-default'
              }`}
            >
              <div
                data-testid="canvas-pan-stage"
                style={{
                  transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0)`,
                  touchAction: 'none',
                }}
                className={`m-auto flex flex-col items-start ${
                  isPanningCanvas ? '' : 'transition-transform duration-100 ease-out'
                }`}
              >
                {/* TOP HORIZONTAL RULER (0 .. 13 inches, dynamically scales when side panels open/close or zoom changes) */}
                <div className="flex items-end ml-7 mb-2 select-none">
                  <div
                    style={{
                      width:
                        isEditingCover || spreadMode === 'full'
                          ? `${coverSpecs.totalWidth * effectiveScalePxPerIn}px`
                          : `${currentTrim.w * effectiveScalePxPerIn}px`,
                    }}
                    className="h-6 relative border-b border-[#4B5563] transition-all duration-150"
                  >
                    {horizontalRulerTicks.ticks.map((t, idx) => (
                      <div
                        key={idx}
                        style={{ left: `${t.posPct}%` }}
                        className="absolute bottom-0 flex flex-col items-center -translate-x-1/2"
                      >
                        {t.label !== undefined && (
                          <span className="text-[10px] text-[#A1A9B8] font-mono tabular-nums mb-1 leading-none">
                            {t.label}
                          </span>
                        )}
                        <div
                          className={`w-px bg-[#6B7280] ${
                            t.isMajor ? 'h-2.5 bg-[#9CA3AF]' : t.isHalf ? 'h-1.5' : 'h-1 opacity-70'
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* ROW WITH LEFT VERTICAL RULER + BOOK SPREAD DOCUMENT */}
                <div className="flex items-start">
                  {/* LEFT VERTICAL RULER (0 .. 9 inches, dynamically scales when side panels open/close or zoom changes) */}
                  <div
                    style={{
                      height:
                        isEditingCover || spreadMode === 'full'
                          ? `${coverSpecs.totalHeight * effectiveScalePxPerIn}px`
                          : `${currentTrim.h * effectiveScalePxPerIn}px`,
                    }}
                    className="w-6 mr-2 relative border-r border-[#4B5563] select-none shrink-0 transition-all duration-150"
                  >
                    {verticalRulerTicks.ticks.map((t, idx) => (
                      <div
                        key={idx}
                        style={{ top: `${t.posPct}%` }}
                        className="absolute right-0 flex items-center -translate-y-1/2"
                      >
                        {t.label !== undefined && (
                          <span className="text-[10px] text-[#A1A9B8] font-mono tabular-nums mr-1.5 -rotate-90 leading-none">
                            {t.label}
                          </span>
                        )}
                        <div
                          className={`h-px bg-[#6B7280] ${
                            t.isMajor ? 'w-2.5 bg-[#9CA3AF]' : t.isHalf ? 'w-1.5' : 'w-1 opacity-70'
                          }`}
                        />
                      </div>
                    ))}
                  </div>

                  {/* WHITE DOCUMENT SPREAD / PAGE */}
                  {isEditingCover || spreadMode === 'full' ? (
                    <div
                      style={{ backgroundColor: activePage.backgroundColor || '#FFFFFF' }}
                      className="relative shadow-[0_20px_50px_rgba(0,0,0,0.65)] bg-white rounded-[2px] overflow-visible transition-all duration-150 ease-out"
                    >
                      <svg
                        id="studio-canvas-svg"
                        ref={canvasSvgRef}
                        overflow="visible"
                        viewBox={`0 0 ${coverSpecs.totalWidth * 100} ${coverSpecs.totalHeight * 100}`}
                        className="transition-[width,height] duration-150 ease-out"
                        style={{
                          width: `${coverSpecs.totalWidth * effectiveScalePxPerIn}px`,
                          height: `${coverSpecs.totalHeight * effectiveScalePxPerIn}px`,
                          display: 'block',
                          overflow: 'visible',
                        }}
                      >
                        <defs>
                          <linearGradient id="spineShadowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#000000" stopOpacity="0.06" />
                            <stop offset="50%" stopColor="#000000" stopOpacity="0.14" />
                            <stop offset="100%" stopColor="#000000" stopOpacity="0.06" />
                          </linearGradient>
                          <pattern id="editorGridPattern" width="25" height="25" patternUnits="userSpaceOnUse">
                            <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#E2E8F0" strokeWidth="0.7" />
                          </pattern>
                        </defs>

                        {/* Explicit Page Background Fills (Supports distinct Left & Right inner page colors in 2-page spread view) */}
                        {isEditingCover ? (
                          <rect
                            x="0"
                            y="0"
                            width={coverSpecs.totalWidth * 100}
                            height={coverSpecs.totalHeight * 100}
                            fill={activePage.backgroundColor || '#FFFFFF'}
                            pointerEvents="none"
                          />
                        ) : (
                          <g pointerEvents="none">
                            <rect
                              x="0"
                              y="0"
                              width={(coverSpecs.totalWidth / 2) * 100}
                              height={coverSpecs.totalHeight * 100}
                              fill={activePage.backgroundColor || '#FFFFFF'}
                            />
                            <rect
                              x={(coverSpecs.totalWidth / 2) * 100}
                              y="0"
                              width={(coverSpecs.totalWidth / 2) * 100}
                              height={coverSpecs.totalHeight * 100}
                              fill={
                                project.pages[activePageIndex + 1]?.backgroundColor ||
                                activePage.backgroundColor ||
                                '#FFFFFF'
                              }
                            />
                          </g>
                        )}

                        {/* Optional Grid Overlay */}
                        {gridEnabled && (
                          <rect
                            x="0"
                            y="0"
                            width={coverSpecs.totalWidth * 100}
                            height={coverSpecs.totalHeight * 100}
                            fill="url(#editorGridPattern)"
                            pointerEvents="none"
                          />
                        )}

                        {/* Center Spine Crease & Realistic Fold Line */}
                        <rect
                          x={(coverSpecs.totalWidth / 2) * 100 - 10}
                          y="0"
                          width="20"
                          height={coverSpecs.totalHeight * 100}
                          fill="url(#spineShadowGrad)"
                          pointerEvents="none"
                        />
                        <line
                          x1={(coverSpecs.totalWidth / 2) * 100}
                          y1="0"
                          x2={(coverSpecs.totalWidth / 2) * 100}
                          y2={coverSpecs.totalHeight * 100}
                          stroke="#CBD5E1"
                          strokeWidth="1.2"
                          pointerEvents="none"
                        />

                        {/* If viewing an Interior Page in Full Spread mode, render left & right interior templates */}
                        {!isEditingCover && (
                          <g pointerEvents="none">
                            <svg
                              x={coverSpecs.bleedMargin * 100}
                              y={coverSpecs.bleedMargin * 100}
                              width={currentTrim.w * 100}
                              height={currentTrim.h * 100}
                              viewBox="0 0 432 648"
                            >
                              {renderInteriorTemplateSvg(
                                activePage.templateType,
                                activePage.pageNumber,
                                activePage.showPageNumber !== false
                              )}
                            </svg>
                            <svg
                              x={(coverSpecs.bleedMargin + currentTrim.w + coverSpecs.spineWidth) * 100}
                              y={coverSpecs.bleedMargin * 100}
                              width={currentTrim.w * 100}
                              height={currentTrim.h * 100}
                              viewBox="0 0 432 648"
                            >
                              {renderInteriorTemplateSvg(
                                project.pages[activePageIndex + 1]?.templateType || activePage.templateType,
                                activePage.pageNumber + 1,
                                (project.pages[activePageIndex + 1]?.showPageNumber ?? activePage.showPageNumber) !==
                                  false
                              )}
                            </svg>
                          </g>
                        )}

                        {/* Left-Page Guide Explanations on Cover Spread (Exact match to PageForge reference image) */}
                        {isEditingCover && showGuides && (
                          <g
                            fontFamily="Plus Jakarta Sans, Inter, sans-serif"
                            pointerEvents="none"
                            transform={`translate(${
                              (coverSpecs.bleedMargin + margins.left + 0.35) * 100
                            }, ${(coverSpecs.bleedMargin + margins.top + 0.45) * 100})`}
                          >
                            <text x="0" y="0" fill="#4B5563" fontSize="11.5">
                              This is where your book will be cut to produce the final trim size.
                            </text>

                            <text x="0" y="52" fill="#EF4444" fontSize="12" fontWeight="700">
                              Red Dashed Line = Bleed Area
                            </text>
                            <text x="0" y="72" fill="#4B5563" fontSize="11">
                              Extend background to this line.
                            </text>

                            <text x="0" y="124" fill="#2563EB" fontSize="12" fontWeight="700">
                              Blue Dashed Line = Trim Line
                            </text>
                            <text x="0" y="144" fill="#4B5563" fontSize="11">
                              Final book size after cutting.
                            </text>

                            <text x="0" y="196" fill="#1F2937" fontSize="12" fontWeight="700">
                              Gray Area = Safe Area
                            </text>
                            <text x="0" y="216" fill="#4B5563" fontSize="11">
                              Keep important content inside this area.
                            </text>
                          </g>
                        )}

                        {/* Optional KDP Back Cover Barcode Zone */}
                        {isEditingCover && showBarcodeGuide && (
                          <g
                            transform={`translate(${
                              (coverSpecs.bleedMargin + currentTrim.w - 2.2) * 100
                            }, ${(coverSpecs.totalHeight - coverSpecs.bleedMargin - 1.4) * 100})`}
                            pointerEvents="none"
                          >
                            <rect
                              x="0"
                              y="0"
                              width="200"
                              height="120"
                              fill="#FEF08A"
                              fillOpacity="0.85"
                              stroke="#EAB308"
                              strokeWidth="1.5"
                              strokeDasharray="4,3"
                            />
                            <text
                              x="100"
                              y="56"
                              textAnchor="middle"
                              fill="#1E293B"
                              fontSize="12"
                              fontWeight="bold"
                              fontFamily="sans-serif"
                            >
                              ISBN BARCODE ZONE
                            </text>
                            <text
                              x="100"
                              y="74"
                              textAnchor="middle"
                              fill="#475569"
                              fontSize="10"
                              fontFamily="monospace"
                            >
                              2.000&quot; × 1.200&quot;
                            </text>
                          </g>
                        )}

                        {/* BLEED, TRIM & SAFE MARGIN GUIDES (Matching PageForge reference image) */}
                        {showGuides && (
                          <g pointerEvents="none">
                            {/* Outer Red Dashed Bleed Border */}
                            <rect
                              x="6"
                              y="6"
                              width={coverSpecs.totalWidth * 100 - 12}
                              height={coverSpecs.totalHeight * 100 - 12}
                              fill="none"
                              stroke="#EF4444"
                              strokeWidth="1.8"
                              strokeDasharray="6,5"
                            />

                            {/* Left Page Blue Dashed Safe/Trim Guide */}
                            <rect
                              x={(coverSpecs.bleedMargin + margins.left * 0.45) * 100}
                              y={(coverSpecs.bleedMargin + margins.top * 0.45) * 100}
                              width={(currentTrim.w - (margins.left + margins.right) * 0.45) * 100}
                              height={(currentTrim.h - (margins.top + margins.bottom) * 0.45) * 100}
                              fill="none"
                              stroke="#3B82F6"
                              strokeWidth="1.5"
                              strokeDasharray="5,5"
                            />

                            {/* Right Page Blue Dashed Safe/Trim Guide */}
                            <rect
                              x={
                                (coverSpecs.bleedMargin +
                                  currentTrim.w +
                                  coverSpecs.spineWidth +
                                  margins.left * 0.45) *
                                100
                              }
                              y={(coverSpecs.bleedMargin + margins.top * 0.45) * 100}
                              width={(currentTrim.w - (margins.left + margins.right) * 0.45) * 100}
                              height={(currentTrim.h - (margins.top + margins.bottom) * 0.45) * 100}
                              fill="none"
                              stroke="#3B82F6"
                              strokeWidth="1.5"
                              strokeDasharray="5,5"
                            />
                          </g>
                        )}

                        {/* Interactive Document Elements */}
                        {isEditingCover ? (
                          renderInteractiveCanvasElements(
                            coverSpecs.totalWidth * 100,
                            coverSpecs.totalHeight * 100
                          )
                        ) : (
                          <>
                            <g
                              transform={`translate(${coverSpecs.bleedMargin * 100}, ${
                                coverSpecs.bleedMargin * 100
                              })`}
                            >
                              {renderInteractiveCanvasElements(
                                currentTrim.w * 100,
                                currentTrim.h * 100
                              )}
                            </g>
                            {project.pages[activePageIndex + 1] && (
                              <svg
                                x={(coverSpecs.bleedMargin + currentTrim.w + coverSpecs.spineWidth) * 100}
                                y={coverSpecs.bleedMargin * 100}
                                width={currentTrim.w * 100}
                                height={currentTrim.h * 100}
                                viewBox="0 0 432 648"
                                pointerEvents="none"
                              >
                                {renderReadOnlyCanvasElements(
                                  project.pages[activePageIndex + 1].elements,
                                  432,
                                  648,
                                  false
                                )}
                              </svg>
                            )}
                          </>
                        )}

                        {/* 4-Directional Live Alignment Measurement Guides when an Element/Image is Selected */}
                        {selectedElement &&
                          measurementData &&
                          (() => {
                            const elX = (selectedElement.x / 100) * (coverSpecs.totalWidth * 100);
                            const elY = (selectedElement.y / 100) * (coverSpecs.totalHeight * 100);
                            const elW = (selectedElement.width / 100) * (coverSpecs.totalWidth * 100);
                            const elH = (selectedElement.height / 100) * (coverSpecs.totalHeight * 100);
                            const centerX = elX + elW / 2;
                            const centerY = elY + elH / 2;
                            const spineRightSvgX =
                              (coverSpecs.bleedMargin + currentTrim.w + coverSpecs.spineWidth) * 100;
                            const leftRefX = elX >= spineRightSvgX ? spineRightSvgX : 0;

                            return (
                              <g pointerEvents="none">
                                <line
                                  x1={centerX}
                                  y1="0"
                                  x2={centerX}
                                  y2={coverSpecs.totalHeight * 100}
                                  stroke="#1677FF"
                                  strokeWidth="1.1"
                                  strokeDasharray="4,4"
                                />
                                <line
                                  x1="0"
                                  y1={centerY}
                                  x2={coverSpecs.totalWidth * 100}
                                  y2={centerY}
                                  stroke="#1677FF"
                                  strokeWidth="1.1"
                                  strokeDasharray="4,4"
                                />

                                {/* Top Distance Pill */}
                                <g transform={`translate(${centerX - 38}, ${Math.max(12, elY / 2 - 10)})`}>
                                  <rect x="0" y="0" width="76" height="18" rx="3" fill="#111318" stroke="#1677FF" strokeWidth="1" />
                                  <text x="38" y="12" textAnchor="middle" fill="#60A5FA" fontSize="9.5" fontFamily="monospace" fontWeight="bold">
                                    Top: {measurementData.distTopUnit}
                                    {unit}
                                  </text>
                                </g>

                                {/* Bottom Distance Pill */}
                                <g
                                  transform={`translate(${centerX - 42}, ${Math.min(
                                    coverSpecs.totalHeight * 100 - 26,
                                    elY + elH + (coverSpecs.totalHeight * 100 - (elY + elH)) / 2 - 9
                                  )})`}
                                >
                                  <rect x="0" y="0" width="84" height="18" rx="3" fill="#111318" stroke="#1677FF" strokeWidth="1" />
                                  <text x="42" y="12" textAnchor="middle" fill="#60A5FA" fontSize="9.5" fontFamily="monospace" fontWeight="bold">
                                    Bottom: {measurementData.distBottomUnit}
                                    {unit}
                                  </text>
                                </g>

                                {/* Spine/Left Distance Pill */}
                                <g transform={`translate(${Math.max(8, (leftRefX + elX) / 2 - 42)}, ${centerY - 22})`}>
                                  <rect x="0" y="0" width="84" height="18" rx="3" fill="#111318" stroke="#1677FF" strokeWidth="1" />
                                  <text x="42" y="12" textAnchor="middle" fill="#60A5FA" fontSize="9.5" fontFamily="monospace" fontWeight="bold">
                                    {elX >= spineRightSvgX
                                      ? `Spine: ${measurementData.distToSpineUnit}${unit}`
                                      : `Left: ${measurementData.distLeftUnit}${unit}`}
                                  </text>
                                </g>

                                {/* Dimension W x H Readout Badge */}
                                <g transform={`translate(${centerX - 64}, ${elY + elH + 10})`}>
                                  <rect x="0" y="0" width="128" height="20" rx="4" fill="#111318" stroke="#22C55E" strokeWidth="1.2" />
                                  <text x="64" y="13.5" textAnchor="middle" fill="#4ADE80" fontSize="10" fontFamily="monospace" fontWeight="bold">
                                    {measurementData.widthUnit}
                                    {unit} × {measurementData.heightUnit}
                                    {unit}
                                  </text>
                                </g>
                              </g>
                            );
                          })()}
                      </svg>
                    </div>
                  ) : (
                    /* SINGLE PAGE VIEW MODE (When user switches dropdown from 'Full Spread' to 'Single Page') */
                    <div
                      style={{ backgroundColor: activePage.backgroundColor || '#FFFFFF' }}
                      className="relative shadow-[0_20px_50px_rgba(0,0,0,0.65)] bg-white rounded-[2px] overflow-visible transition-all duration-150 ease-out"
                    >
                      <svg
                        id="studio-canvas-svg"
                        ref={canvasSvgRef}
                        overflow="visible"
                        viewBox="0 0 432 648"
                        className="transition-[width,height] duration-150 ease-out"
                        style={{
                          width: `${currentTrim.w * effectiveScalePxPerIn}px`,
                          height: `${currentTrim.h * effectiveScalePxPerIn}px`,
                          display: 'block',
                          overflow: 'visible',
                        }}
                      >
                        {showGuides && (
                          <>
                            <rect
                              x="4"
                              y="4"
                              width="424"
                              height="640"
                              fill="none"
                              stroke="#EF4444"
                              strokeWidth="1.2"
                              strokeDasharray="5,4"
                              pointerEvents="none"
                            />
                            <rect
                              x={margins.left * 56}
                              y={margins.top * 56}
                              width={432 - (margins.left + margins.right) * 56}
                              height={648 - (margins.top + margins.bottom) * 56}
                              fill="none"
                              stroke="#3B82F6"
                              strokeWidth="1.1"
                              strokeDasharray="4,3"
                              pointerEvents="none"
                            />
                          </>
                        )}
                        {renderInteriorTemplateSvg(
                          activePage.templateType,
                          activePage.pageNumber,
                          activePage.showPageNumber !== false
                        )}
                        {renderInteractiveCanvasElements(432, 648)}
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* =====================================================================
                BOTTOM WORKSPACE CONTROL BAR (Matching PageForge reference + Side Panel Toggles + Zoom Slider & Alt+Scroll)
               ===================================================================== */}
            <div className="h-[52px] bg-[#171B23] border-t border-[#303744] px-2.5 flex items-center justify-between gap-1.5 shrink-0 z-20 overflow-x-auto">
              {/* Left Controls: Side Panel Toggles, Select/Hand Pan Tool Toggle, Full Spread selector, - 100% +, Zoom Slider, Fit */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Toggle Left Panel Button */}
                <button
                  onClick={() => setLeftPanelOpen(prev => !prev)}
                  aria-label={leftPanelOpen ? 'Hide Left Panel' : 'Show Left Panel'}
                  title={leftPanelOpen ? 'Close Left Panel to enlarge canvas' : 'Open Left Panel'}
                  className={`h-8 px-2 rounded-md border text-xs flex items-center gap-1 cursor-pointer transition shrink-0 ${
                    !leftPanelOpen
                      ? 'bg-[#1677FF]/20 border-[#1677FF] text-[#F3F4F6]'
                      : 'bg-[#202631] hover:bg-[#252B36] border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
                  }`}
                >
                  {leftPanelOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
                </button>

                {/* Select / Move (V) vs Hand / Pan (H / Space) Tool Mode Toggle (Mouse, Touch & Smart Pen) */}
                <div
                  role="group"
                  aria-label="Canvas Interaction Tool Mode"
                  className="h-8 bg-[#131720] border border-[#303744] rounded-md p-0.5 flex items-center gap-0.5 shrink-0"
                >
                  <button
                    type="button"
                    data-testid="tool-mode-select"
                    onClick={() => setCanvasToolMode('select')}
                    title="Select & Move Tool (V) — Edit elements with mouse, touch, or smart pen; left-click & hold empty space to pan"
                    className={`h-6.5 px-2 rounded-xs text-[11px] font-medium flex items-center gap-1 cursor-pointer transition ${
                      !isEffectivePanMode
                        ? 'bg-[#1677FF] text-white'
                        : 'text-[#A1A9B8] hover:text-[#F3F4F6]'
                    }`}
                  >
                    <MousePointer className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline">Select</span>
                  </button>
                  <button
                    type="button"
                    data-testid="tool-mode-pan"
                    onClick={() => setCanvasToolMode('pan')}
                    title="Hand / Pan Tool (H or hold Spacebar) — Left-click & hold, touch-drag, or smart-pen drag anywhere to move screen"
                    className={`h-6.5 px-2 rounded-xs text-[11px] font-medium flex items-center gap-1 cursor-pointer transition ${
                      isEffectivePanMode
                        ? 'bg-[#1677FF] text-white'
                        : 'text-[#A1A9B8] hover:text-[#F3F4F6]'
                    }`}
                  >
                    <Hand className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline">Pan</span>
                  </button>
                </div>

                {/* Full Spread / Single Page Dropdown Button */}
                <button
                  onClick={() => setSpreadMode(prev => (prev === 'full' ? 'single' : 'full'))}
                  title="Toggle between Full 2-Page Spread and Single Page view"
                  className="h-8 px-2 bg-[#202631] hover:bg-[#252B36] border border-[#303744] rounded-md text-xs text-[#F3F4F6] flex items-center gap-1 cursor-pointer transition whitespace-nowrap shrink-0"
                >
                  <Square className="w-3.5 h-3.5 text-[#A1A9B8] shrink-0" />
                  <span className={workspaceSize.width > 0 && workspaceSize.width < 520 ? 'hidden' : 'inline'}>
                    {spreadMode === 'full' ? 'Full Spread' : 'Single Page'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#A1A9B8] shrink-0" />
                </button>

                {/* Zoom Out (-) */}
                <button
                  onClick={() => setZoomLevel(prev => Math.max(25, prev - 10))}
                  aria-label="Zoom Out"
                  title="Zoom Out (or Alt + Scroll Down / 2-Finger Pinch)"
                  className="w-7.5 h-8 bg-[#202631] hover:bg-[#252B36] border border-[#303744] rounded-md flex items-center justify-center text-[#F3F4F6] cursor-pointer transition shrink-0"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                {/* Zoom Percentage Readout */}
                <span
                  data-testid="canvas-zoom-readout"
                  className="w-10 text-center text-xs font-medium text-[#F3F4F6] tabular-nums shrink-0"
                >
                  {zoomLevel}%
                </span>

                {/* Zoom In (+) */}
                <button
                  onClick={() => setZoomLevel(prev => Math.min(250, prev + 10))}
                  aria-label="Zoom In"
                  title="Zoom In (or Alt + Scroll Up / 2-Finger Pinch)"
                  className="w-7.5 h-8 bg-[#202631] hover:bg-[#252B36] border border-[#303744] rounded-md flex items-center justify-center text-[#F3F4F6] cursor-pointer transition shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                {/* Zoom Slider (Preserved as requested by user; hides only when workspace is narrower than 650px) */}
                {(!workspaceSize.width || workspaceSize.width >= 650) && (
                  <input
                    type="range"
                    aria-label="Zoom Slider"
                    min={25}
                    max={250}
                    value={zoomLevel}
                    onChange={e => setZoomLevel(Number(e.target.value))}
                    title="Drag slider, hold Alt + Mousewheel, or 2-finger pinch to zoom"
                    className="w-14 accent-[#1677FF] cursor-pointer hidden md:block shrink-0"
                  />
                )}

                {/* Fit & Center View Button */}
                <button
                  type="button"
                  data-testid="fit-reset-view-btn"
                  onClick={handleResetCanvasView}
                  title="Reset zoom (100%) and re-center panned canvas"
                  className="h-8 px-2 bg-[#202631] hover:bg-[#252B36] border border-[#303744] rounded-md text-xs font-medium text-[#F3F4F6] cursor-pointer transition whitespace-nowrap shrink-0"
                >
                  Fit
                </button>

                {/* Center Panned Canvas Badge (Visible when canvas has been panned off-center) */}
                {(panOffset.x !== 0 || panOffset.y !== 0) && (
                  <button
                    type="button"
                    data-testid="reset-canvas-pan-btn"
                    onClick={() => {
                      setPanOffset({ x: 0, y: 0 });
                      panOffsetRef.current = { x: 0, y: 0 };
                    }}
                    title={`Re-center panned canvas (${Math.round(panOffset.x)}, ${Math.round(panOffset.y)})`}
                    className="h-8 px-2 bg-[#1677FF]/15 hover:bg-[#1677FF]/30 border border-[#1677FF]/60 rounded-md text-[11px] font-medium text-[#60A5FA] flex items-center gap-1 cursor-pointer transition whitespace-nowrap shrink-0"
                  >
                    <Move className="w-3 h-3 shrink-0" />
                    <span>Center</span>
                  </button>
                )}

                {/* Focus / Enlarge Canvas Button (Closes or opens both side panels at once) */}
                <button
                  onClick={() => {
                    const shouldCollapseBoth = leftPanelOpen || rightPanelOpen;
                    setLeftPanelOpen(!shouldCollapseBoth);
                    setRightPanelOpen(!shouldCollapseBoth);
                    showToast(
                      shouldCollapseBoth
                        ? 'Side panels closed — canvas enlarged for alignment & resizing'
                        : 'Side panels restored'
                    );
                  }}
                  title={
                    leftPanelOpen || rightPanelOpen
                      ? 'Close both side panels to enlarge book page'
                      : 'Restore side panels'
                  }
                  className={`h-8 px-2 rounded-md border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap shrink-0 ${
                    !leftPanelOpen && !rightPanelOpen
                      ? 'bg-[#1677FF] border-[#1677FF] text-white'
                      : !leftPanelOpen || !rightPanelOpen
                      ? 'bg-[#1677FF]/15 border-[#1677FF]/60 text-[#60A5FA]'
                      : 'bg-[#202631] hover:bg-[#252B36] border-[#303744] text-[#F3F4F6]'
                  }`}
                >
                  {!leftPanelOpen && !rightPanelOpen ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden lg:inline">Enlarged (+22%)</span>
                    </>
                  ) : !leftPanelOpen || !rightPanelOpen ? (
                    <>
                      <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden lg:inline">Enlarged (+11%)</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden 2xl:inline">Enlarge Canvas</span>
                    </>
                  )}
                </button>
              </div>

              {/* Right Controls: Snap Toggle, Grid Button, Show Guides Toggle Switch, Right Panel Toggle */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    setSnapToGuides(prev => !prev);
                    showToast(!snapToGuides ? 'Magnetic guide snapping enabled' : 'Snapping disabled');
                  }}
                  title="Toggle Magnetic Center & Margin Snapping"
                  className={`h-8 px-2 rounded-md border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap shrink-0 ${
                    snapToGuides
                      ? 'bg-[#1677FF]/20 border-[#1677FF] text-[#F3F4F6]'
                      : 'bg-[#202631] hover:bg-[#252B36] border-[#303744] text-[#A1A9B8]'
                  }`}
                >
                  <Magnet className="w-3.5 h-3.5 shrink-0" />
                  {(!workspaceSize.width || workspaceSize.width >= 680) && (
                    <span className="hidden xl:inline">Snap</span>
                  )}
                </button>

                <button
                  onClick={() => setGridEnabled(prev => !prev)}
                  title="Toggle Canvas Alignment Grid"
                  className={`h-8 px-2 rounded-md border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap shrink-0 ${
                    gridEnabled
                      ? 'bg-[#1677FF]/20 border-[#1677FF] text-[#F3F4F6]'
                      : 'bg-[#202631] hover:bg-[#252B36] border-[#303744] text-[#F3F4F6]'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5 shrink-0" />
                  {(!workspaceSize.width || workspaceSize.width >= 680) && (
                    <span className="hidden xl:inline">Grid</span>
                  )}
                </button>

                <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0">
                  {(!workspaceSize.width || workspaceSize.width >= 650) && (
                    <span className="text-xs text-[#F3F4F6] hidden sm:inline">Guides</span>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showGuides}
                    aria-label="Show Guides"
                    onClick={() => setShowGuides(prev => !prev)}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                      showGuides ? 'bg-[#1677FF]' : 'bg-[#303744]'
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform ${
                        showGuides ? 'left-[19px]' : 'left-[3px]'
                      }`}
                    />
                  </button>
                </label>

                <button
                  onClick={() => setRightPanelOpen(prev => !prev)}
                  aria-label={rightPanelOpen ? 'Hide Right Inspector' : 'Show Right Inspector'}
                  title={rightPanelOpen ? 'Close Right Inspector to enlarge canvas' : 'Open Right Inspector'}
                  className={`h-8 px-2 rounded-md border text-xs flex items-center gap-1 cursor-pointer transition shrink-0 ${
                    !rightPanelOpen
                      ? 'bg-[#1677FF]/20 border-[#1677FF] text-[#F3F4F6]'
                      : 'bg-[#202631] hover:bg-[#252B36] border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
                  }`}
                >
                  {rightPanelOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* =====================================================================
              D. RIGHT PROPERTIES INSPECTOR (280px wide, #171B23, Collapsible to the side)
             ===================================================================== */}
          {rightPanelOpen && (
            <aside className="w-[280px] bg-[#171B23] border-l border-[#303744] flex flex-col shrink-0 z-20 transition-all">
              {/* Top Segmented Tabs: Design | Page + Collapse Right Panel Button */}
              <div className="p-3 border-b border-[#303744] flex items-center gap-2">
                <div className="flex-1 grid grid-cols-2 bg-[#131720] rounded-md p-0.5 border border-[#303744]">
                  <button
                    onClick={() => setInspectorTab('design')}
                    className={`py-1.5 text-xs font-semibold rounded-xs transition cursor-pointer relative ${
                      inspectorTab === 'design'
                        ? 'bg-[#202632] text-[#F3F4F6] border-b-2 border-[#1677FF]'
                        : 'text-[#A1A9B8] hover:text-[#F3F4F6]'
                    }`}
                  >
                    Design
                  </button>
                  <button
                    onClick={() => setInspectorTab('page')}
                    className={`py-1.5 text-xs font-semibold rounded-xs transition cursor-pointer relative ${
                      inspectorTab === 'page'
                        ? 'bg-[#202632] text-[#F3F4F6] border-b-2 border-[#1677FF]'
                        : 'text-[#A1A9B8] hover:text-[#F3F4F6]'
                    }`}
                  >
                    Page
                  </button>
                </div>
                <button
                  onClick={() => setRightPanelOpen(false)}
                  aria-label="Close Right Inspector"
                  title="Close Right Panel to enlarge book canvas"
                  className="w-7 h-7 text-[#A1A9B8] hover:text-[#F3F4F6] hover:bg-[#252B36] rounded-md flex items-center justify-center cursor-pointer transition shrink-0"
                >
                  <PanelRightClose className="w-4 h-4" />
                </button>
              </div>

            {inspectorTab === 'design' ? (
              /* DESIGN TAB (Context-Sensitive Selected Object Inspector + Document Page Size/Margins/Bleed/Units) */
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* CONTEXT-SENSITIVE SELECTED ELEMENT INSPECTOR (Typography / Image / Shape / Alignment / Layer Order) */}
                {selectedElement && (
                  <div className="p-3 rounded-lg bg-[#1E2430] border border-[#1677FF]/50 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#1677FF] uppercase tracking-wider">
                        {selectedElement.type === 'text'
                          ? 'Text Properties'
                          : selectedElement.type === 'image'
                          ? 'Image Properties'
                          : 'Shape Properties'}
                      </span>
                      <button
                        onClick={() => setSelectedElementId(null)}
                        title="Deselect Element (Esc)"
                        className="text-[11px] text-[#A1A9B8] hover:text-white cursor-pointer"
                      >
                        Done
                      </button>
                    </div>

                    {/* 1. SELECTED TEXT INSPECTOR */}
                    {selectedElement.type === 'text' && (
                      <div className="space-y-2.5">
                        <div>
                          <label className="text-[11px] text-[#A1A9B8] block mb-1">Text Content</label>
                          <input
                            type="text"
                            aria-label="Selected Text Content"
                            disabled={selectedElement.locked}
                            value={selectedElement.text || ''}
                            onChange={e => updateSelectedElement({ text: e.target.value })}
                            className="w-full h-8 bg-[#131720] border border-[#303744] focus:border-[#1677FF] rounded px-2.5 text-xs text-[#F3F4F6] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-[#A1A9B8] block mb-1">Font Family</label>
                          <select
                            aria-label="Font Family"
                            disabled={selectedElement.locked}
                            value={selectedElement.fontFamily || 'Playfair Display, Georgia, serif'}
                            onChange={e => updateSelectedElement({ fontFamily: e.target.value })}
                            className="w-full h-8 bg-[#131720] border border-[#303744] rounded px-2 text-xs text-[#F3F4F6]"
                          >
                            <option value="Playfair Display, Georgia, serif">Playfair Display (Serif)</option>
                            <option value="Plus Jakarta Sans, Inter, sans-serif">Plus Jakarta Sans</option>
                            <option value="Inter, sans-serif">Inter Modern</option>
                            <option value="Georgia, serif">Classic Georgia</option>
                            <option value="Courier New, monospace">Typewriter Mono</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-[#A1A9B8] block mb-1">Font Size</label>
                            <input
                              type="number"
                              min={6}
                              max={72}
                              aria-label="Font Size"
                              disabled={selectedElement.locked}
                              value={selectedElement.fontSize || 16}
                              onChange={e => updateSelectedElement({ fontSize: Number(e.target.value) })}
                              className="w-full h-8 bg-[#131720] border border-[#303744] rounded px-2 text-xs text-[#F3F4F6] tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-[#A1A9B8] block mb-1">Text Color</label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                disabled={selectedElement.locked}
                                value={selectedElement.fill || '#171923'}
                                onChange={e => updateSelectedElement({ fill: e.target.value })}
                                className="w-8 h-8 rounded border border-[#303744] bg-transparent cursor-pointer"
                              />
                              <span className="text-[11px] font-mono text-[#A1A9B8]">
                                {selectedElement.fill || '#171923'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Weight & Alignment Row */}
                        <div className="flex items-center justify-between gap-1 pt-1">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() =>
                                updateSelectedElement({
                                  fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold',
                                })
                              }
                              title="Toggle Bold"
                              className={`px-2 py-1 rounded text-xs font-bold cursor-pointer ${
                                selectedElement.fontWeight === 'bold'
                                  ? 'bg-[#1677FF] text-white'
                                  : 'bg-[#131720] text-[#A1A9B8]'
                              }`}
                            >
                              B
                            </button>
                            <button
                              onClick={() =>
                                updateSelectedElement({
                                  fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic',
                                })
                              }
                              title="Toggle Italic"
                              className={`px-2 py-1 rounded text-xs italic cursor-pointer ${
                                selectedElement.fontStyle === 'italic'
                                  ? 'bg-[#1677FF] text-white'
                                  : 'bg-[#131720] text-[#A1A9B8]'
                              }`}
                            >
                              I
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            {(['left', 'center', 'right'] as const).map(align => (
                              <button
                                key={align}
                                onClick={() => updateSelectedElement({ textAlign: align })}
                                title={`Align text ${align}`}
                                className={`p-1.5 rounded cursor-pointer ${
                                  selectedElement.textAlign === align
                                    ? 'bg-[#1677FF] text-white'
                                    : 'bg-[#131720] text-[#A1A9B8]'
                                }`}
                              >
                                {align === 'left' ? (
                                  <AlignLeft className="w-3.5 h-3.5" />
                                ) : align === 'center' ? (
                                  <AlignCenter className="w-3.5 h-3.5" />
                                ) : (
                                  <AlignRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. SELECTED IMAGE INSPECTOR */}
                    {selectedElement.type === 'image' && (
                      <div className="space-y-2.5">
                        {/* Unclamped Width & Height % Controls */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-[#A1A9B8] block mb-1">Width (%)</label>
                            <input
                              type="number"
                              step="1"
                              min={1}
                              max={500}
                              aria-label="Selected Image Width Percent"
                              disabled={selectedElement.locked}
                              value={Number(selectedElement.width.toFixed(1))}
                              onChange={e =>
                                updateSelectedElement({
                                  width: Math.max(1, Number(e.target.value) || 1),
                                })
                              }
                              className="w-full h-8 bg-[#131720] border border-[#303744] focus:border-[#1677FF] rounded px-2 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-[#A1A9B8] block mb-1">Height (%)</label>
                            <input
                              type="number"
                              step="1"
                              min={1}
                              max={500}
                              aria-label="Selected Image Height Percent"
                              disabled={selectedElement.locked}
                              value={Number(selectedElement.height.toFixed(1))}
                              onChange={e =>
                                updateSelectedElement({
                                  height: Math.max(1, Number(e.target.value) || 1),
                                })
                              }
                              className="w-full h-8 bg-[#131720] border border-[#303744] focus:border-[#1677FF] rounded px-2 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] text-[#A1A9B8] block mb-1">
                            Opacity ({Math.round((selectedElement.opacity ?? 1) * 100)}%)
                          </label>
                          <input
                            type="range"
                            min={0.1}
                            max={1}
                            step={0.05}
                            value={selectedElement.opacity ?? 1}
                            onChange={e => updateSelectedElement({ opacity: Number(e.target.value) })}
                            className="w-full accent-[#1677FF] cursor-pointer"
                          />
                        </div>
                        <label className="flex items-center justify-between text-xs text-[#F3F4F6] cursor-pointer">
                          <span>Lock Aspect Ratio</span>
                          <input
                            type="checkbox"
                            checked={selectedElement.preserveAspectRatio === true}
                            onChange={e => updateSelectedElement({ preserveAspectRatio: e.target.checked })}
                            className="accent-[#1677FF]"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                          <button
                            onClick={() => handleFitElementToPaperCover('front_cover')}
                            disabled={selectedElement.locked}
                            className="py-1.5 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded text-[11px] font-semibold cursor-pointer transition"
                          >
                            Fit Front Cover
                          </button>
                          <button
                            onClick={() => handleFitElementToPaperCover('full_wrap')}
                            disabled={selectedElement.locked}
                            className="py-1.5 bg-[#202631] hover:bg-[#252B36] border border-[#303744] text-[#F3F4F6] rounded text-[11px] font-semibold cursor-pointer transition"
                          >
                            Fit Full Spread
                          </button>
                        </div>
                        <button
                          onClick={handleStretchElementToBottom}
                          disabled={selectedElement.locked}
                          className="w-full py-1.5 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-300 hover:text-white rounded text-xs font-semibold cursor-pointer transition"
                        >
                          Stretch to Bottom (100% Height)
                        </button>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-1.5 bg-[#252B36] hover:bg-[#1677FF] text-[#F3F4F6] hover:text-white rounded text-xs font-medium cursor-pointer transition"
                        >
                          Replace Image Artwork
                        </button>
                      </div>
                    )}

                    {/* 3. SELECTED SHAPE INSPECTOR */}
                    {selectedElement.type === 'shape' && (
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-[#A1A9B8] block mb-1">Stroke Color</label>
                            <input
                              type="color"
                              value={selectedElement.stroke || '#171923'}
                              onChange={e => updateSelectedElement({ stroke: e.target.value })}
                              className="w-full h-8 rounded border border-[#303744] bg-transparent cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-[#A1A9B8] block mb-1">Stroke Width</label>
                            <input
                              type="number"
                              step="0.5"
                              min={0.5}
                              max={12}
                              value={selectedElement.strokeWidth || 1.5}
                              onChange={e => updateSelectedElement({ strokeWidth: Number(e.target.value) })}
                              className="w-full h-8 bg-[#131720] border border-[#303744] rounded px-2 text-xs text-[#F3F4F6]"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Alignment, Distribution & Layer Ordering Bar */}
                    <div className="pt-2 border-t border-[#303744] space-y-2">
                      <div className="text-[11px] text-[#A1A9B8]">Align &amp; Layer Order</div>
                      <div className="grid grid-cols-4 gap-1">
                        <button
                          onClick={() => handleAlignSelected('center-h')}
                          title="Center Horizontally"
                          className="py-1 bg-[#131720] hover:bg-[#252B36] text-[#F3F4F6] rounded text-[10px] cursor-pointer"
                        >
                          Center H
                        </button>
                        <button
                          onClick={() => handleAlignSelected('middle-v')}
                          title="Center Vertically"
                          className="py-1 bg-[#131720] hover:bg-[#252B36] text-[#F3F4F6] rounded text-[10px] cursor-pointer"
                        >
                          Center V
                        </button>
                        <button
                          onClick={() => handleLayerOrder('front')}
                          title="Bring to Front"
                          className="py-1 bg-[#131720] hover:bg-[#252B36] text-[#F3F4F6] rounded text-[10px] cursor-pointer"
                        >
                          To Front
                        </button>
                        <button
                          onClick={() => handleLayerOrder('back')}
                          title="Send to Back"
                          className="py-1 bg-[#131720] hover:bg-[#252B36] text-[#F3F4F6] rounded text-[10px] cursor-pointer"
                        >
                          To Back
                        </button>
                      </div>
                      {activePage.elements.length >= 3 && (
                        <button
                          onClick={handleDistributeVertically}
                          className="w-full py-1 bg-[#131720] hover:bg-[#252B36] text-[#A1A9B8] hover:text-white rounded text-[10px] cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Layers className="w-3 h-3" />
                          <span>Distribute Page Elements Vertically</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Page Size Section */}
                <div className="space-y-2.5">
                  <div className="text-[13px] font-semibold text-[#F3F4F6]">Page Size</div>
                  <div className="relative">
                    <select
                      aria-label="Page Size"
                      value={project.trimSize}
                      onChange={e => handleTrimPresetChange(e.target.value as StudioBookProject['trimSize'])}
                      className="w-full h-9 bg-[#202631] border border-[#303744] focus:border-[#1677FF] rounded-md px-3 text-xs text-[#F3F4F6] appearance-none cursor-pointer focus:outline-none"
                    >
                      <option value="6x9">6&quot; x 9&quot; Book</option>
                      <option value="5x8">5&quot; x 8&quot; Book</option>
                      <option value="7x10">7&quot; x 10&quot; Book</option>
                      <option value="8x10">8&quot; x 10&quot; Book</option>
                      <option value="8.5x11">8.5&quot; x 11&quot; Book</option>
                      <option value="8.25x8.25">8.25&quot; x 8.25&quot; Square</option>
                      <option value="custom">Custom Dimensions</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-[#A1A9B8] absolute right-3 top-2.5 pointer-events-none" />
                  </div>

                  <div className="text-xs text-[#A1A9B8] tabular-nums">
                    ({(currentTrim.w * 25.4).toFixed(1)}mm x {(currentTrim.h * 25.4).toFixed(1)}mm)
                  </div>

                  {/* Width & Height Inputs */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-xs text-[#A1A9B8] block mb-1.5">Width ({unit})</label>
                      <input
                        type="number"
                        step="0.25"
                        aria-label="Page Width"
                        value={convertInchesToUnit(currentTrim.w, unit)}
                        onChange={e =>
                          handleCustomDimensionChange('w', convertUnitToInches(Number(e.target.value), unit))
                        }
                        className="w-full h-9 bg-[#202631] border border-[#303744] focus:border-[#1677FF] rounded-md px-3 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#A1A9B8] block mb-1.5">Height ({unit})</label>
                      <input
                        type="number"
                        step="0.25"
                        aria-label="Page Height"
                        value={convertInchesToUnit(currentTrim.h, unit)}
                        onChange={e =>
                          handleCustomDimensionChange('h', convertUnitToInches(Number(e.target.value), unit))
                        }
                        className="w-full h-9 bg-[#202631] border border-[#303744] focus:border-[#1677FF] rounded-md px-3 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="h-px bg-[#303744]/60" />

                {/* Margin Guides Section (Top, Bottom, Left, Right) */}
                <div className="space-y-3">
                  <div className="text-[13px] font-semibold text-[#F3F4F6]">Margin Guides</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[#A1A9B8] block mb-1.5">Top</label>
                      <input
                        type="number"
                        step="0.125"
                        aria-label="Top Margin"
                        value={convertInchesToUnit(margins.top, unit)}
                        onChange={e =>
                          handleMarginChange('top', convertUnitToInches(Number(e.target.value), unit))
                        }
                        className="w-full h-9 bg-[#202631] border border-[#303744] focus:border-[#1677FF] rounded-md px-3 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#A1A9B8] block mb-1.5">Bottom</label>
                      <input
                        type="number"
                        step="0.125"
                        aria-label="Bottom Margin"
                        value={convertInchesToUnit(margins.bottom, unit)}
                        onChange={e =>
                          handleMarginChange('bottom', convertUnitToInches(Number(e.target.value), unit))
                        }
                        className="w-full h-9 bg-[#202631] border border-[#303744] focus:border-[#1677FF] rounded-md px-3 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#A1A9B8] block mb-1.5">Left</label>
                      <input
                        type="number"
                        step="0.125"
                        aria-label="Left Margin"
                        value={convertInchesToUnit(margins.left, unit)}
                        onChange={e =>
                          handleMarginChange('left', convertUnitToInches(Number(e.target.value), unit))
                        }
                        className="w-full h-9 bg-[#202631] border border-[#303744] focus:border-[#1677FF] rounded-md px-3 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#A1A9B8] block mb-1.5">Right</label>
                      <input
                        type="number"
                        step="0.125"
                        aria-label="Right Margin"
                        value={convertInchesToUnit(margins.right, unit)}
                        onChange={e =>
                          handleMarginChange('right', convertUnitToInches(Number(e.target.value), unit))
                        }
                        className="w-full h-9 bg-[#202631] border border-[#303744] focus:border-[#1677FF] rounded-md px-3 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="h-px bg-[#303744]/60" />

                {/* Bleed Input */}
                <div className="space-y-2">
                  <label className="text-[13px] font-semibold text-[#F3F4F6] block">Bleed</label>
                  <input
                    type="number"
                    step="0.025"
                    aria-label="Bleed"
                    value={convertInchesToUnit(bleedInches, unit)}
                    onChange={e => handleBleedChange(convertUnitToInches(Number(e.target.value), unit))}
                    className="w-full h-9 bg-[#202631] border border-[#303744] focus:border-[#1677FF] rounded-md px-3 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                  />
                </div>

                <div className="h-px bg-[#303744]/60" />

                {/* Units Selector */}
                <div className="space-y-2">
                  <label className="text-[13px] font-semibold text-[#F3F4F6] block">Units</label>
                  <div className="relative">
                    <select
                      aria-label="Units"
                      value={unit}
                      onChange={e => setUnit(e.target.value as MeasurementUnit)}
                      className="w-full h-9 bg-[#202631] border border-[#303744] focus:border-[#1677FF] rounded-md px-3 text-xs text-[#F3F4F6] appearance-none cursor-pointer focus:outline-none"
                    >
                      <option value="in">Inches (in)</option>
                      <option value="mm">Millimeters (mm)</option>
                      <option value="cm">Centimeters (cm)</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-[#A1A9B8] absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>
                <div className="h-px bg-[#303744]/60" />

                {/* Inner Pages Background Color (1 Inner Page vs All Inner Pages) */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-[#F3F4F6]">Inner Pages Background</span>
                    <span className="text-[10px] text-[#60A5FA] font-medium">
                      {backgroundApplyScope === 'all_inner'
                        ? 'All Inner Pages'
                        : backgroundApplyScope === 'all_pages'
                        ? 'All Pages'
                        : '1 Inner Page'}
                    </span>
                  </div>

                  {/* Scope Toggle: 1 Inner Page vs All Inner Pages */}
                  <div className="grid grid-cols-2 gap-1.5 bg-[#131720] p-1 rounded-md border border-[#303744]">
                    <button
                      onClick={() => setBackgroundApplyScope('current')}
                      className={`py-1 rounded text-[11px] font-semibold cursor-pointer transition ${
                        backgroundApplyScope === 'current'
                          ? 'bg-[#1677FF] text-white'
                          : 'text-[#A1A9B8] hover:text-[#F3F4F6]'
                      }`}
                    >
                      1 Inner Page
                    </button>
                    <button
                      onClick={() => setBackgroundApplyScope('all_inner')}
                      className={`py-1 rounded text-[11px] font-semibold cursor-pointer transition ${
                        backgroundApplyScope === 'all_inner'
                          ? 'bg-[#1677FF] text-white'
                          : 'text-[#A1A9B8] hover:text-[#F3F4F6]'
                      }`}
                    >
                      All Inner Pages
                    </button>
                  </div>

                  {/* Color Picker & Quick Apply Buttons */}
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Inner Pages Background Color"
                      value={
                        (!activePage.isCover
                          ? activePage.backgroundColor
                          : project.pages.find(p => !p.isCover)?.backgroundColor) || '#FFFFFF'
                      }
                      onChange={e => handleApplyPageBackground(e.target.value)}
                      className="w-9 h-9 rounded border border-[#303744] bg-transparent cursor-pointer shrink-0"
                    />
                    <div className="grid grid-cols-2 gap-1.5 flex-1">
                      <button
                        onClick={() => {
                          const hex =
                            (!activePage.isCover
                              ? activePage.backgroundColor
                              : project.pages.find(p => !p.isCover)?.backgroundColor) || '#FFFFFF';
                          handleApplyPageBackground(hex, 'current');
                        }}
                        className="h-9 px-2 bg-[#202631] hover:bg-[#252B36] border border-[#303744] text-[#F3F4F6] rounded-md text-[11px] font-semibold cursor-pointer transition"
                      >
                        1 Page Only
                      </button>
                      <button
                        onClick={() => {
                          const hex =
                            (!activePage.isCover
                              ? activePage.backgroundColor
                              : project.pages.find(p => !p.isCover)?.backgroundColor) || '#FFFFFF';
                          handleApplyPageBackground(hex, 'all_inner');
                        }}
                        className="h-9 px-2 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded-md text-[11px] font-semibold cursor-pointer transition"
                      >
                        All Inner Pages
                      </button>
                    </div>
                  </div>

                  {/* Quick Swatches Grid */}
                  <div className="grid grid-cols-6 gap-1.5 pt-0.5">
                    {PAPER_BACKGROUND_SWATCHES.map(sw => {
                      const currentInnerHex =
                        (!activePage.isCover
                          ? activePage.backgroundColor
                          : project.pages.find(p => !p.isCover)?.backgroundColor) || '#FFFFFF';
                      const isActiveSw = currentInnerHex.toUpperCase() === sw.hex.toUpperCase();
                      return (
                        <button
                          key={sw.hex}
                          onClick={() => handleApplyPageBackground(sw.hex, undefined, sw.label)}
                          title={`${sw.label} (${
                            backgroundApplyScope === 'all_inner' ? 'Apply to All Inner Pages' : 'Apply to 1 Page'
                          })`}
                          aria-label={`Set Inner Page Background ${sw.label}`}
                          style={{ backgroundColor: sw.hex }}
                          className={`h-6.5 rounded border cursor-pointer transition ${
                            isActiveSw ? 'border-[#1677FF] ring-2 ring-[#1677FF]/40 scale-105' : 'border-[#303744]'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="h-px bg-[#303744]/60" />

                {/* Bulk Add & Total Book Pages Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-[#F3F4F6]">Book Page Count</span>
                    <span className="text-xs text-[#60A5FA] font-semibold tabular-nums">
                      {project.pages.length} Total ({project.pages.length - 1} Inner)
                    </span>
                  </div>

                  {/* Bulk Add +N Pages */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#A1A9B8] block">Bulk Add Inner Pages</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={500}
                        aria-label="Inspector Bulk Add Pages Count"
                        value={bulkPagesInput}
                        onChange={e => setBulkPagesInput(Math.max(1, Number(e.target.value) || 1))}
                        className="w-20 h-8.5 bg-[#202631] border border-[#303744] focus:border-[#1677FF] rounded-md px-2.5 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                      />
                      <button
                        onClick={() => handleBulkAddPages()}
                        className="flex-1 h-8.5 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Add {bulkPagesInput} Pages</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[10, 25, 50, 100].map(count => (
                        <button
                          key={count}
                          onClick={() => handleBulkAddPages(count)}
                          className="py-1 bg-[#202631] hover:bg-[#252B36] border border-[#303744] text-[#F3F4F6] rounded text-[11px] font-medium cursor-pointer transition tabular-nums"
                        >
                          +{count}p
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Set Total Book Pages */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs text-[#A1A9B8] block">Set Total Pages in Book</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={2}
                        max={828}
                        aria-label="Inspector Total Book Pages"
                        value={totalBookPagesInput}
                        onChange={e => setTotalBookPagesInput(Number(e.target.value))}
                        className="w-20 h-8.5 bg-[#202631] border border-[#303744] focus:border-[#1677FF] rounded-md px-2.5 text-xs text-[#F3F4F6] tabular-nums focus:outline-none"
                      />
                      <button
                        onClick={() => handleSetTotalBookPages()}
                        className="flex-1 h-8.5 bg-[#252B36] hover:bg-[#1677FF] text-[#F3F4F6] hover:text-white border border-[#303744] rounded-md text-xs font-semibold cursor-pointer transition"
                      >
                        Set Total ({totalBookPagesInput}p)
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[50, 100, 120, 200].map(tot => (
                        <button
                          key={tot}
                          onClick={() => handleSetTotalBookPages(tot)}
                          className={`py-1 rounded text-[11px] font-medium cursor-pointer transition tabular-nums border ${
                            project.pages.length === tot
                              ? 'bg-[#1677FF]/20 border-[#1677FF] text-[#60A5FA]'
                              : 'bg-[#202631] hover:bg-[#252B36] border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
                          }`}
                        >
                          {tot}p
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* PAGE TAB (Page-specific settings, inner page background color for one or all pages, & bulk page count) */
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                <div>
                  <div className="text-[13px] font-semibold text-[#F3F4F6]">Active Page</div>
                  <div className="text-xs text-[#A1A9B8] mt-1">
                    {activePage.isCover
                      ? 'Page 1 — Full Cover Spread'
                      : `Page ${activePage.pageNumber} — Interior (${activePage.isEven ? 'Even' : 'Odd'})`}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-[#A1A9B8] block">Interior Template Layout</label>
                  <select
                    value={activePage.templateType || 'lined'}
                    onChange={e => handleApplyTemplate(e.target.value)}
                    className="w-full h-9 bg-[#202631] border border-[#303744] focus:border-[#1677FF] rounded-md px-3 text-xs text-[#F3F4F6] focus:outline-none"
                  >
                    {interiorTemplates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Index Page Templates & Add Index After Front Cover Section */}
                <div className="space-y-2.5 pt-2 border-t border-[#303744]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#F3F4F6]">
                      Index Pages (After Front Cover)
                    </label>
                    <span className="text-[10px] text-[#60A5FA] font-medium">
                      {project.pages.filter(p => !p.isCover && isIndexTemplateType(p.templateType)).length} in book
                    </span>
                  </div>

                  {/* Category Filter Pills in Inspector */}
                  <div className="flex flex-wrap gap-1">
                    {(['All', ...INDEX_TEMPLATE_CATEGORIES] as const).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedIndexCategory(cat)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold cursor-pointer border transition ${
                          selectedIndexCategory === cat
                            ? 'bg-[#1677FF] border-[#1677FF] text-white'
                            : 'bg-[#171B23] border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 max-h-[240px] overflow-y-auto pr-0.5">
                    {filteredIndexTemplates.map(idxTmpl => {
                      const isCurrentIdx =
                        (!activePage.isCover && activePage.templateType === idxTmpl.id) ||
                        selectedIndexStyle === idxTmpl.id;
                      return (
                        <div
                          key={idxTmpl.id}
                          onClick={() => handleSelectIndexStyle(idxTmpl.id)}
                          className={`p-2 rounded border text-left cursor-pointer transition flex items-start gap-2 ${
                            isCurrentIdx
                              ? 'bg-[#1677FF]/20 border-[#1677FF] text-[#F3F4F6]'
                              : 'bg-[#202631] hover:bg-[#252B36] border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
                          }`}
                        >
                          <div className="w-9 h-12 shrink-0 rounded overflow-hidden border border-[#303744] bg-white">
                            {renderIndexCardMiniSvg(idxTmpl.id)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold text-[#F3F4F6] leading-tight">
                              {idxTmpl.title}
                            </div>
                            <div className="text-[9px] text-[#60A5FA]">{idxTmpl.category}</div>
                            <div className="text-[9.5px] text-[#A1A9B8] leading-snug mt-0.5">
                              {idxTmpl.description}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {renderIndexConfigurationControls(true)}
                </div>

                {/* Inner Pages Background Color (Apply to 1 Page or All Inner Pages) */}
                <div className="space-y-2.5 pt-2 border-t border-[#303744]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#F3F4F6]">Inner Page Background Color</label>
                    <span className="text-[10px] text-[#60A5FA]">
                      {backgroundApplyScope === 'all_inner' ? 'All Inner Pages' : '1 Inner Page'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 bg-[#131720] p-1 rounded-md border border-[#303744]">
                    <button
                      onClick={() => setBackgroundApplyScope('current')}
                      className={`py-1.5 rounded text-[11px] font-semibold cursor-pointer transition ${
                        backgroundApplyScope === 'current'
                          ? 'bg-[#1677FF] text-white'
                          : 'text-[#A1A9B8] hover:text-[#F3F4F6]'
                      }`}
                    >
                      1 Inner Page
                    </button>
                    <button
                      onClick={() => setBackgroundApplyScope('all_inner')}
                      className={`py-1.5 rounded text-[11px] font-semibold cursor-pointer transition ${
                        backgroundApplyScope === 'all_inner'
                          ? 'bg-[#1677FF] text-white'
                          : 'text-[#A1A9B8] hover:text-[#F3F4F6]'
                      }`}
                    >
                      All Inner Pages
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Page Background Color"
                      value={activePage.backgroundColor || '#FFFFFF'}
                      onChange={e => handleApplyPageBackground(e.target.value)}
                      className="w-9 h-9 rounded border border-[#303744] bg-transparent cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={activePage.backgroundColor || '#FFFFFF'}
                      readOnly
                      className="flex-1 h-9 bg-[#202631] border border-[#303744] rounded-md px-3 text-xs text-[#F3F4F6] font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-6 gap-1.5">
                    {PAPER_BACKGROUND_SWATCHES.map(sw => (
                      <button
                        key={sw.hex}
                        onClick={() => handleApplyPageBackground(sw.hex, undefined, sw.label)}
                        title={`${sw.label} (${sw.hex})`}
                        style={{ backgroundColor: sw.hex }}
                        className={`h-6.5 rounded border cursor-pointer transition ${
                          (activePage.backgroundColor || '#FFFFFF').toUpperCase() === sw.hex.toUpperCase()
                            ? 'border-[#1677FF] ring-2 ring-[#1677FF]/40'
                            : 'border-[#303744]'
                        }`}
                      />
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => handleApplyPageBackground(activePage.backgroundColor || '#FFFFFF', 'current')}
                      className="py-1.5 bg-[#252B36] hover:bg-[#303744] text-[#F3F4F6] rounded text-[11px] font-semibold cursor-pointer transition"
                    >
                      Apply to 1 Page
                    </button>
                    <button
                      onClick={() => handleApplyPageBackground(activePage.backgroundColor || '#FFFFFF', 'all_inner')}
                      className="py-1.5 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded text-[11px] font-semibold cursor-pointer transition"
                    >
                      Apply to All Inner
                    </button>
                  </div>
                </div>

                {!activePage.isCover && (
                  <label className="flex items-center justify-between text-xs text-[#F3F4F6] cursor-pointer pt-1">
                    <span>Show Footer Page Number</span>
                    <input
                      type="checkbox"
                      checked={activePage.showPageNumber !== false}
                      onChange={e => {
                        const checked = e.target.checked;
                        updateProjectWithHistory(prev => {
                          const updated = [...prev.pages];
                          updated[activePageIndex] = { ...updated[activePageIndex], showPageNumber: checked };
                          return { ...prev, pages: updated };
                        });
                      }}
                      className="accent-[#1677FF]"
                    />
                  </label>
                )}

                {/* Bulk Add & Total Pages in Page Tab */}
                <div className="pt-3 border-t border-[#303744] space-y-2.5">
                  <div className="text-xs font-semibold text-[#F3F4F6]">Bulk Add &amp; Total Pages</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={bulkPagesInput}
                      onChange={e => setBulkPagesInput(Math.max(1, Number(e.target.value) || 1))}
                      className="w-18 h-8.5 bg-[#202631] border border-[#303744] rounded-md px-2.5 text-xs text-[#F3F4F6] tabular-nums"
                    />
                    <button
                      onClick={() => handleBulkAddPages()}
                      className="flex-1 h-8.5 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded-md text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Bulk Add {bulkPagesInput} Pages</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={2}
                      max={828}
                      value={totalBookPagesInput}
                      onChange={e => setTotalBookPagesInput(Number(e.target.value))}
                      className="w-18 h-8.5 bg-[#202631] border border-[#303744] rounded-md px-2.5 text-xs text-[#F3F4F6] tabular-nums"
                    />
                    <button
                      onClick={() => handleSetTotalBookPages()}
                      className="flex-1 h-8.5 bg-[#252B36] hover:bg-[#1677FF] text-[#F3F4F6] hover:text-white border border-[#303744] rounded-md text-xs font-semibold cursor-pointer transition"
                    >
                      Set Total ({totalBookPagesInput} Pages)
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#303744] space-y-2">
                  <button
                    onClick={() => handleAddPage(activePageIndex)}
                    className="w-full py-2 bg-[#252B36] hover:bg-[#1677FF] text-[#F3F4F6] hover:text-white rounded-md text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Insert 1 Page After Current</span>
                  </button>

                  {!activePage.isCover && (
                    <>
                      <button
                        onClick={() => handleDuplicatePage(activePageIndex)}
                        className="w-full py-2 bg-[#252B36] hover:bg-[#303744] text-[#F3F4F6] rounded-md text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-1.5"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Duplicate Current Page</span>
                      </button>

                      <button
                        onClick={() => handleDeletePage(activePageIndex)}
                        className="w-full py-2 bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white rounded-md text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Current Page</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </aside>
          )}
        </div>
      )}

      {/* =====================================================================
          INTERACTIVE BOOK PREVIEW MODAL (Opened via "Preview" button in Top Bar)
          Renders full vector SVG of the Notebook Paper Cover (including all inserted cover images,
          shapes, and typography) as well as all Interior Notebook Pages and their custom elements.
         ===================================================================== */}
      {previewModalOpen &&
        (() => {
          const currentPreviewPage = project.pages[previewPageIndex] || project.pages[0];
          const coverPage = project.pages[0];
          const resolvedCoverElements = resolveCoverPreviewElements(project.pages);
          const frontCoverSingleElements = extractSingleCoverPageElements({
            elements: resolvedCoverElements,
            side: 'front',
            totalWidthIn: coverSpecs.totalWidth,
            bleedMarginIn: coverSpecs.bleedMargin,
            trimWidthIn: currentTrim.w,
            spineWidthIn: coverSpecs.spineWidth,
          });
          const backCoverSingleElements = extractSingleCoverPageElements({
            elements: resolvedCoverElements,
            side: 'back',
            totalWidthIn: coverSpecs.totalWidth,
            bleedMarginIn: coverSpecs.bleedMargin,
            trimWidthIn: currentTrim.w,
            spineWidthIn: coverSpecs.spineWidth,
          });
          const firstInteriorPage = project.pages[1] || project.pages[0];
          const spineLeftSvgX = (coverSpecs.bleedMargin + currentTrim.w) * 100;
          const spineWidthSvg = Math.max(8, coverSpecs.spineWidth * 100);
          const spineRightSvgX = (coverSpecs.bleedMargin + currentTrim.w + coverSpecs.spineWidth) * 100;

          return (
            <div
              data-testid="book-preview-modal"
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
            >
              <div className="bg-[#191D25] border border-[#303744] rounded-xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
                {/* Modal Header with View Mode Switcher & Direct PDF Download */}
                <div className="h-14 px-5 border-b border-[#303744] flex items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <BookOpen className="w-4 h-4 text-[#1677FF] shrink-0" />
                    <span className="font-semibold text-sm text-[#F3F4F6] truncate">
                      Book Preview — {project.title}
                    </span>
                    <span className="text-xs text-[#A1A9B8] tabular-nums shrink-0">
                      (Page {previewPageIndex + 1} of {project.pages.length})
                    </span>
                  </div>

                  {/* Preview Mode Tabs: Full Spread | Front & Back Covers | Cover + Interior */}
                  <div className="flex items-center gap-2">
                    <div className="hidden sm:flex items-center bg-[#131720] p-1 rounded-md border border-[#303744] gap-1">
                      <button
                        onClick={() => setPreviewViewMode('spread')}
                        className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition whitespace-nowrap ${
                          previewViewMode === 'spread'
                            ? 'bg-[#1677FF] text-white'
                            : 'text-[#A1A9B8] hover:text-[#F3F4F6]'
                        }`}
                      >
                        Full Spread
                      </button>
                      <button
                        onClick={() => setPreviewViewMode('front_cover')}
                        className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition whitespace-nowrap ${
                          previewViewMode === 'front_cover'
                            ? 'bg-[#1677FF] text-white'
                            : 'text-[#A1A9B8] hover:text-[#F3F4F6]'
                        }`}
                      >
                        Front &amp; Back Covers
                      </button>
                      <button
                        onClick={() => setPreviewViewMode('cover_and_interior')}
                        className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition whitespace-nowrap ${
                          previewViewMode === 'cover_and_interior'
                            ? 'bg-[#1677FF] text-white'
                            : 'text-[#A1A9B8] hover:text-[#F3F4F6]'
                        }`}
                      >
                        Cover + Interior
                      </button>
                    </div>

                    <button
                      onClick={() => handleDownloadChoice('project_cmyk')}
                      disabled={isDownloading}
                      className="h-8 px-3 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>

                    <button
                      onClick={() => setPreviewModalOpen(false)}
                      aria-label="Close Preview"
                      className="text-[#A1A9B8] hover:text-[#F3F4F6] p-1.5 rounded-md hover:bg-[#252B36] cursor-pointer transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Main Preview Stage */}
                <div className="flex-1 p-6 bg-[#111318] flex items-center justify-center overflow-auto min-h-[460px]">
                  {previewViewMode === 'front_cover' ? (
                    /* STANDALONE FRONT COVER & BACK COVER SIDE-BY-SIDE PREVIEW */
                    <div className="flex flex-col md:flex-row items-center justify-center gap-8">
                      {/* Front Paper Cover */}
                      <div className="flex flex-col items-center gap-2.5">
                        <div
                          style={{ backgroundColor: coverPage?.backgroundColor || '#FFFFFF' }}
                          className="w-[285px] h-[420px] bg-white rounded-r-md rounded-l-xs shadow-[0_25px_60px_rgba(0,0,0,0.75)] border border-slate-300 overflow-hidden relative"
                        >
                          <svg
                            data-testid="preview-front-cover-svg"
                            viewBox="0 0 432 648"
                            className="w-full h-full block relative z-0"
                            preserveAspectRatio="none"
                          >
                            <rect
                              x="0"
                              y="0"
                              width="432"
                              height="648"
                              fill={coverPage?.backgroundColor || '#FFFFFF'}
                            />
                            {renderReadOnlyCanvasElements(frontCoverSingleElements, 432, 648, true)}
                          </svg>
                          {renderPreviewHtmlImageOverlays(frontCoverSingleElements)}
                        </div>
                        <span className="text-xs font-semibold text-[#F3F4F6]">
                          Front Paper Cover ({currentTrim.w}×{currentTrim.h}&quot;)
                        </span>
                      </div>

                      {/* Back Paper Cover */}
                      <div className="flex flex-col items-center gap-2.5">
                        <div
                          style={{ backgroundColor: coverPage?.backgroundColor || '#FFFFFF' }}
                          className="w-[285px] h-[420px] bg-white rounded-l-md rounded-r-xs shadow-[0_25px_60px_rgba(0,0,0,0.75)] border border-slate-300 overflow-hidden relative"
                        >
                          <svg
                            data-testid="preview-back-cover-svg"
                            viewBox="0 0 432 648"
                            className="w-full h-full block relative z-0"
                            preserveAspectRatio="none"
                          >
                            <rect
                              x="0"
                              y="0"
                              width="432"
                              height="648"
                              fill={coverPage?.backgroundColor || '#FFFFFF'}
                            />
                            {renderReadOnlyCanvasElements(backCoverSingleElements, 432, 648, true)}
                          </svg>
                          {renderPreviewHtmlImageOverlays(backCoverSingleElements)}
                        </div>
                        <span className="text-xs font-semibold text-[#A1A9B8]">
                          Back Paper Cover ({currentTrim.w}×{currentTrim.h}&quot;)
                        </span>
                      </div>
                    </div>
                  ) : previewViewMode === 'cover_and_interior' ? (
                    /* SIDE-BY-SIDE FRONT PAPER COVER + INTERIOR NOTEBOOK PAGE + BACK PAPER COVER */
                    <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                      {/* Front Paper Cover */}
                      <div className="flex flex-col items-center gap-2">
                        <div
                          style={{ backgroundColor: coverPage?.backgroundColor || '#FFFFFF' }}
                          className="w-[240px] h-[360px] bg-white rounded-r-md rounded-l-xs shadow-2xl border border-slate-300 overflow-hidden relative"
                        >
                          <svg
                            data-testid="preview-sidebyside-cover-svg"
                            viewBox="0 0 432 648"
                            className="w-full h-full block relative z-0"
                            preserveAspectRatio="none"
                          >
                            <rect
                              x="0"
                              y="0"
                              width="432"
                              height="648"
                              fill={coverPage?.backgroundColor || '#FFFFFF'}
                            />
                            {renderReadOnlyCanvasElements(frontCoverSingleElements, 432, 648, true)}
                          </svg>
                          {renderPreviewHtmlImageOverlays(frontCoverSingleElements)}
                        </div>
                        <span className="text-xs font-semibold text-[#F3F4F6]">1. Front Paper Cover</span>
                      </div>

                      {/* Interior Notebook Page */}
                      <div className="flex flex-col items-center gap-2">
                        <div
                          style={{
                            backgroundColor:
                              (!currentPreviewPage.isCover
                                ? currentPreviewPage.backgroundColor
                                : firstInteriorPage?.backgroundColor) || '#FFFFFF',
                          }}
                          className="w-[240px] h-[360px] bg-white rounded-xs shadow-2xl border border-slate-300 overflow-hidden relative"
                        >
                          <svg
                            data-testid="preview-sidebyside-interior-svg"
                            viewBox="0 0 432 648"
                            className="w-full h-full block relative z-0"
                          >
                            <rect
                              x="0"
                              y="0"
                              width="432"
                              height="648"
                              fill={
                                (!currentPreviewPage.isCover
                                  ? currentPreviewPage.backgroundColor
                                  : firstInteriorPage?.backgroundColor) || '#FFFFFF'
                              }
                            />
                            {renderInteriorTemplateSvg(
                              !currentPreviewPage.isCover
                                ? currentPreviewPage.templateType
                                : firstInteriorPage?.templateType,
                              !currentPreviewPage.isCover ? currentPreviewPage.pageNumber : 2,
                              (!currentPreviewPage.isCover
                                ? currentPreviewPage.showPageNumber
                                : firstInteriorPage?.showPageNumber) !== false
                            )}
                            {renderReadOnlyCanvasElements(
                              !currentPreviewPage.isCover
                                ? currentPreviewPage.elements
                                : firstInteriorPage?.elements || [],
                              432,
                              648,
                              false
                            )}
                          </svg>
                        </div>
                        <span className="text-xs font-medium text-[#A1A9B8]">
                          2. Inner Pages ({project.pages.filter(p => !p.isCover).length}p)
                        </span>
                      </div>

                      {/* Back Paper Cover */}
                      <div className="flex flex-col items-center gap-2">
                        <div
                          style={{ backgroundColor: coverPage?.backgroundColor || '#FFFFFF' }}
                          className="w-[240px] h-[360px] bg-white rounded-l-md rounded-r-xs shadow-2xl border border-slate-300 overflow-hidden relative"
                        >
                          <svg
                            data-testid="preview-sidebyside-back-svg"
                            viewBox="0 0 432 648"
                            className="w-full h-full block relative z-0"
                            preserveAspectRatio="none"
                          >
                            <rect
                              x="0"
                              y="0"
                              width="432"
                              height="648"
                              fill={coverPage?.backgroundColor || '#FFFFFF'}
                            />
                            {renderReadOnlyCanvasElements(backCoverSingleElements, 432, 648, true)}
                          </svg>
                          {renderPreviewHtmlImageOverlays(backCoverSingleElements)}
                        </div>
                        <span className="text-xs font-semibold text-[#F3F4F6]">3. Back Paper Cover</span>
                      </div>
                    </div>
                  ) : currentPreviewPage?.isCover ? (
                    /* FULL WRAP-AROUND PAPER COVER SPREAD (Back Cover + Spine + Front Cover + All Images & Elements) */
                    <div className="flex flex-col items-center gap-3 w-full">
                      <div
                        style={{ backgroundColor: coverPage?.backgroundColor || '#FFFFFF' }}
                        className="w-full max-w-[660px] aspect-[1.33/1] bg-white rounded-xs shadow-[0_25px_60px_rgba(0,0,0,0.75)] border border-slate-300 overflow-hidden relative"
                      >
                        <svg
                          data-testid="preview-cover-svg"
                          viewBox={`0 0 ${coverSpecs.totalWidth * 100} ${coverSpecs.totalHeight * 100}`}
                          className="w-full h-full block relative z-0"
                        >
                          <defs>
                            <linearGradient id="previewSpineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#000000" stopOpacity="0.07" />
                              <stop offset="50%" stopColor="#000000" stopOpacity="0.16" />
                              <stop offset="100%" stopColor="#000000" stopOpacity="0.07" />
                            </linearGradient>
                          </defs>

                          {/* Paper Cover Background Fill */}
                          <rect
                            x="0"
                            y="0"
                            width={coverSpecs.totalWidth * 100}
                            height={coverSpecs.totalHeight * 100}
                            fill={coverPage?.backgroundColor || '#FFFFFF'}
                          />

                          {/* Render All Paper Cover Elements (Images, Shapes, Typography) */}
                          {renderReadOnlyCanvasElements(
                            resolvedCoverElements,
                            coverSpecs.totalWidth * 100,
                            coverSpecs.totalHeight * 100,
                            true
                          )}

                          {/* Center Spine Fold Shadow & Crease Lines */}
                          <rect
                            x={spineLeftSvgX - 6}
                            y="0"
                            width={spineWidthSvg + 12}
                            height={coverSpecs.totalHeight * 100}
                            fill="url(#previewSpineGrad)"
                          />
                          <line
                            x1={spineLeftSvgX}
                            y1="0"
                            x2={spineLeftSvgX}
                            y2={coverSpecs.totalHeight * 100}
                            stroke="#CBD5E1"
                            strokeWidth="1.2"
                          />
                          <line
                            x1={spineRightSvgX}
                            y1="0"
                            x2={spineRightSvgX}
                            y2={coverSpecs.totalHeight * 100}
                            stroke="#CBD5E1"
                            strokeWidth="1.2"
                          />

                          {/* Optional ISBN Barcode Zone on Back Cover (only when enabled) */}
                          {showBarcodeGuide && (
                            <g
                              transform={`translate(${
                                (coverSpecs.bleedMargin + currentTrim.w - 2.2) * 100
                              }, ${(coverSpecs.totalHeight - coverSpecs.bleedMargin - 1.4) * 100})`}
                            >
                              <rect
                                x="0"
                                y="0"
                                width="200"
                                height="120"
                                fill="#FEF9C3"
                                fillOpacity="0.9"
                                stroke="#CA8A04"
                                strokeWidth="1.2"
                              />
                              <text
                                x="100"
                                y="58"
                                textAnchor="middle"
                                fill="#1E293B"
                                fontSize="11"
                                fontWeight="bold"
                                fontFamily="sans-serif"
                              >
                                ISBN BARCODE
                              </text>
                            </g>
                          )}
                        </svg>
                        {renderPreviewHtmlImageOverlays(resolvedCoverElements)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#A1A9B8]">
                        <span className="text-[#F3F4F6] font-medium">Back Paper Cover (Left)</span>
                        <span>•</span>
                        <span>Spine ({coverSpecs.spineWidth}&quot;)</span>
                        <span>•</span>
                        <span className="text-[#F3F4F6] font-medium">Front Paper Cover (Right)</span>
                      </div>
                    </div>
                  ) : (
                    /* INTERIOR NOTEBOOK TEMPLATE SPREAD / PAGE PREVIEW (Includes all images & elements on page) */
                    <div className="flex flex-col items-center gap-3 w-full">
                      {spreadMode === 'full' ? (
                        <div
                          style={{ backgroundColor: currentPreviewPage?.backgroundColor || '#FFFFFF' }}
                          className="w-full max-w-[660px] aspect-[1.33/1] bg-white rounded-xs shadow-[0_25px_60px_rgba(0,0,0,0.75)] border border-slate-300 overflow-hidden relative"
                        >
                          <svg
                            data-testid="preview-interior-svg"
                            viewBox={`0 0 ${coverSpecs.totalWidth * 100} ${coverSpecs.totalHeight * 100}`}
                            className="w-full h-full block relative z-0"
                          >
                            <rect
                              x="0"
                              y="0"
                              width={(coverSpecs.totalWidth / 2) * 100}
                              height={coverSpecs.totalHeight * 100}
                              fill={currentPreviewPage?.backgroundColor || '#FFFFFF'}
                            />
                            <rect
                              x={(coverSpecs.totalWidth / 2) * 100}
                              y="0"
                              width={(coverSpecs.totalWidth / 2) * 100}
                              height={coverSpecs.totalHeight * 100}
                              fill={
                                project.pages[previewPageIndex + 1]?.backgroundColor ||
                                currentPreviewPage?.backgroundColor ||
                                '#FFFFFF'
                              }
                            />
                            <svg
                              x={coverSpecs.bleedMargin * 100}
                              y={coverSpecs.bleedMargin * 100}
                              width={currentTrim.w * 100}
                              height={currentTrim.h * 100}
                              viewBox="0 0 432 648"
                            >
                              {renderInteriorTemplateSvg(
                                currentPreviewPage?.templateType,
                                currentPreviewPage?.pageNumber || previewPageIndex + 1,
                                currentPreviewPage?.showPageNumber !== false
                              )}
                              {renderReadOnlyCanvasElements(
                                currentPreviewPage?.elements || [],
                                432,
                                648,
                                false
                              )}
                            </svg>
                            <svg
                              x={(coverSpecs.bleedMargin + currentTrim.w + coverSpecs.spineWidth) * 100}
                              y={coverSpecs.bleedMargin * 100}
                              width={currentTrim.w * 100}
                              height={currentTrim.h * 100}
                              viewBox="0 0 432 648"
                            >
                              {renderInteriorTemplateSvg(
                                project.pages[previewPageIndex + 1]?.templateType || currentPreviewPage?.templateType,
                                (currentPreviewPage?.pageNumber || previewPageIndex + 1) + 1,
                                currentPreviewPage?.showPageNumber !== false
                              )}
                              {renderReadOnlyCanvasElements(
                                project.pages[previewPageIndex + 1]?.elements || [],
                                432,
                                648,
                                false
                              )}
                            </svg>
                            <line
                              x1={(coverSpecs.totalWidth / 2) * 100}
                              y1="0"
                              x2={(coverSpecs.totalWidth / 2) * 100}
                              y2={coverSpecs.totalHeight * 100}
                              stroke="#CBD5E1"
                              strokeWidth="1.4"
                            />
                          </svg>
                          {renderPreviewHtmlImageOverlays(currentPreviewPage?.elements || [])}
                        </div>
                      ) : (
                        <div
                          style={{ backgroundColor: currentPreviewPage?.backgroundColor || '#FFFFFF' }}
                          className="w-[310px] h-[450px] bg-white rounded-xs shadow-2xl border border-slate-300 overflow-hidden relative"
                        >
                          <svg
                            data-testid="preview-interior-svg"
                            viewBox="0 0 432 648"
                            className="w-full h-full block relative z-0"
                          >
                            <rect
                              x="0"
                              y="0"
                              width="432"
                              height="648"
                              fill={currentPreviewPage?.backgroundColor || '#FFFFFF'}
                            />
                            {renderInteriorTemplateSvg(
                              currentPreviewPage?.templateType,
                              currentPreviewPage?.pageNumber || previewPageIndex + 1,
                              currentPreviewPage?.showPageNumber !== false
                            )}
                            {renderReadOnlyCanvasElements(currentPreviewPage?.elements || [], 432, 648, false)}
                          </svg>
                          {renderPreviewHtmlImageOverlays(currentPreviewPage?.elements || [])}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Modal Footer with Quick Cover Jump & Page Navigation */}
                <div className="h-14 px-5 bg-[#171B23] border-t border-[#303744] flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setPreviewPageIndex(0);
                        setPreviewViewMode('spread');
                      }}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition ${
                        previewPageIndex === 0 && previewViewMode === 'spread'
                          ? 'bg-[#1677FF] text-white'
                          : 'bg-[#202631] hover:bg-[#252B36] border border-[#303744] text-[#F3F4F6]'
                      }`}
                    >
                      Paper Cover (Front &amp; Back)
                    </button>
                    {project.pages.length > 1 && (
                      <button
                        onClick={() => {
                          setPreviewPageIndex(1);
                          setPreviewViewMode('spread');
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition ${
                          previewPageIndex >= 1 && previewViewMode === 'spread'
                            ? 'bg-[#1677FF] text-white'
                            : 'bg-[#202631] hover:bg-[#252B36] border border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
                        }`}
                      >
                        Inner Pages (Page 2–{project.pages.length})
                      </button>
                    )}
                  </div>

                  <div className="text-xs text-[#A1A9B8] tabular-nums hidden md:block">
                    {currentPreviewPage?.name} • {currentTrim.w}×{currentTrim.h}&quot; Trim
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewPageIndex(prev => Math.max(0, prev - 1))}
                      disabled={previewPageIndex <= 0}
                      className="px-3.5 py-1.5 bg-[#252B36] hover:bg-[#303744] disabled:opacity-40 text-[#F3F4F6] rounded-md text-xs font-medium cursor-pointer transition"
                    >
                      Previous Page
                    </button>
                    <button
                      onClick={() => setPreviewPageIndex(prev => Math.min(project.pages.length - 1, prev + 1))}
                      disabled={previewPageIndex >= project.pages.length - 1}
                      className="px-3.5 py-1.5 bg-[#1677FF] hover:bg-[#1668dc] disabled:opacity-40 text-white rounded-md text-xs font-medium cursor-pointer transition"
                    >
                      Next Page
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* INDEX BUILDER & LIVE PREVIEW MODAL (Guided 5-Step Workflow) */}
      {indexPreviewModalOpen && (
        <div
          data-testid="index-preview-modal"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[#191D25] border border-[#303744] rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3 bg-[#171B23] border-b border-[#303744] flex flex-col gap-2.5 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-[#1677FF]" />
                  <div>
                    <h2 className="text-sm font-bold text-[#F3F4F6]">
                      Configurable Index Builder &amp; Live Preview
                    </h2>
                    <p className="text-[11px] text-[#A1A9B8]">
                      1. Choose Template • 2. Configure Layout • 3. Entries &amp; Page Linking • 4. Preview • 5. Confirm Insertion After Front Cover
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIndexPreviewModalOpen(false)}
                  aria-label="Close Index Preview Modal"
                  className="p-1.5 text-[#A1A9B8] hover:text-white hover:bg-[#252B36] rounded-md cursor-pointer transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 5-Step Guided Index Builder Stepper */}
              <div
                data-testid="index-builder-stepper"
                className="grid grid-cols-5 gap-1.5"
              >
                {(
                  [
                    { step: 1, label: '1. Choose Template' },
                    { step: 2, label: '2. Configure Layout' },
                    { step: 3, label: '3. Entries & Linking' },
                    { step: 4, label: '4. Preview Result' },
                    { step: 5, label: '5. Confirm Insert' },
                  ] as const
                ).map(s => {
                  const isActiveStep = indexBuilderStep === s.step;
                  const isCompletedStep = indexBuilderStep > s.step;
                  return (
                    <button
                      key={s.step}
                      type="button"
                      data-testid={`index-builder-step-${s.step}`}
                      onClick={() => setIndexBuilderStep(s.step)}
                      className={`py-1.5 px-2 rounded text-[10px] font-semibold cursor-pointer border transition flex items-center justify-center gap-1 truncate ${
                        isActiveStep
                          ? 'bg-[#1677FF] border-[#1677FF] text-white shadow-xs'
                          : isCompletedStep
                          ? 'bg-[#1677FF]/15 border-[#1677FF]/50 text-[#60A5FA]'
                          : 'bg-[#111318] border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
                      }`}
                    >
                      {isCompletedStep && <Check className="w-3 h-3 shrink-0" />}
                      <span className="truncate">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Modal Body: Left Live SVG Page Preview + Right 12-Template Picker & Configurator */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#303744]">
              {/* Left Column: High-Resolution Live Page Preview */}
              <div className="lg:col-span-5 bg-[#111318] p-6 flex flex-col items-center justify-center">
                {(() => {
                  const totalPreviewPages = Math.max(1, indexConfigDraft.pageCount || 1);
                  const safePreviewIdx = Math.min(indexModalPreviewPageIdx, totalPreviewPages - 1);
                  const existingIndexCount = project.pages.filter(
                    p => !p.isCover && isIndexTemplateType(p.templateType)
                  ).length;
                  const modalShiftOffset = existingIndexCount > 0 ? 0 : totalPreviewPages;
                  const previewSliceCfg = buildPageSliceIndexConfig(
                    indexConfigDraft,
                    safePreviewIdx,
                    totalPreviewPages,
                    currentTrim.h,
                    margins
                  );
                  const previewStructuredElements = buildEditableIndexPageElements({
                    config: previewSliceCfg,
                    pageSequenceIndex: safePreviewIdx,
                    pageSequenceTotal: totalPreviewPages,
                    margins,
                    trimWidthIn: currentTrim.w,
                    trimHeightIn: currentTrim.h,
                    includeAllRowCells: false,
                    pages: project.pages,
                    pageShiftOffset: modalShiftOffset,
                  });

                  return (
                    <>
                      <div className="text-[11px] font-semibold text-[#A1A9B8] mb-2 flex items-center gap-2 flex-wrap justify-center">
                        <span>
                          Live Layout Preview ({currentTrim.w}×{currentTrim.h}&quot; Trim • Margins{' '}
                          {margins.top}&quot;)
                        </span>
                        <span className="px-2 py-0.5 bg-[#1677FF]/20 text-[#60A5FA] rounded text-[10px] font-bold">
                          {totalPreviewPages} Page{totalPreviewPages > 1 ? 's' : ''}
                        </span>
                        <span className="px-2 py-0.5 bg-[#202631] border border-[#303744] text-[#F3F4F6] rounded text-[10px] font-semibold">
                          {indexConfigDraft.indexMode === 'linked' ? 'Linked Mode' : 'Blank Printable'}
                        </span>
                      </div>

                      {totalPreviewPages > 1 && (
                        <div className="flex items-center gap-1 mb-2.5 flex-wrap justify-center">
                          {Array.from({ length: totalPreviewPages }).map((_, pIdx) => (
                            <button
                              key={pIdx}
                              type="button"
                              data-testid={`index-modal-page-tab-${pIdx + 1}`}
                              onClick={() => setIndexModalPreviewPageIdx(pIdx)}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer border transition ${
                                safePreviewIdx === pIdx
                                  ? 'bg-[#1677FF] border-[#1677FF] text-white'
                                  : 'bg-[#171B23] border-[#303744] text-[#A1A9B8] hover:text-white'
                              }`}
                            >
                              Page {pIdx + 1} of {totalPreviewPages}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="w-[290px] sm:w-[330px] aspect-[2/3] bg-white rounded-[3px] shadow-[0_20px_50px_rgba(0,0,0,0.7)] border border-slate-300 overflow-hidden">
                        <svg
                          data-testid="index-modal-live-svg"
                          viewBox="0 0 432 648"
                          className="w-full h-full block"
                        >
                          <rect x="0" y="0" width="432" height="648" fill="#FFFFFF" />
                          {renderInteriorTemplateSvg(
                            selectedIndexStyle,
                            2 + safePreviewIdx,
                            previewSliceCfg.showPageNumberCol !== false,
                            previewSliceCfg,
                            previewStructuredElements
                          )}
                          {renderReadOnlyCanvasElements(previewStructuredElements, 432, 648, false)}
                        </svg>
                      </div>
                      <div className="mt-3 text-[11px] text-[#A1A9B8] text-center max-w-xs">
                        Inserted index pages include editable headings, column labels, divider lines, and print-ready vector tables.
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Right Column: Search, Category Filters, 12 Template Cards & Config Controls */}
              <div className="lg:col-span-7 p-5 space-y-4 overflow-y-auto max-h-[68vh]">
                {/* Active Step Guidance Banner */}
                <div
                  data-testid="index-builder-step-banner"
                  className="p-2.5 rounded-lg bg-[#171B23] border border-[#1677FF]/40 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-[#60A5FA] mr-1.5">
                      Step {indexBuilderStep} of 5:
                    </span>
                    <span className="text-[#F3F4F6]">
                      {indexBuilderStep === 1 &&
                        'Choose an index template from the 12-template library below.'}
                      {indexBuilderStep === 2 &&
                        'Configure title, column headings, row count per page, font size, and spacing.'}
                      {indexBuilderStep === 3 &&
                        'Choose total entries or pages required, and select Blank Printable or Linked Page References.'}
                      {indexBuilderStep === 4 &&
                        'Inspect the multi-page live layout preview on the left to verify pagination and margins.'}
                      {indexBuilderStep === 5 &&
                        'Review the generated index summary and confirm insertion immediately after the Front Cover.'}
                    </span>
                  </div>
                </div>

                {/* Step 5 Confirmation Summary Card */}
                {indexBuilderStep === 5 && (
                  <div
                    data-testid="index-builder-step-5-summary"
                    className="p-3.5 rounded-lg bg-[#131720] border border-[#1677FF] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#F3F4F6]">
                        Ready to Insert After Front Cover (Page 2)
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#1677FF]/20 text-[#60A5FA] text-[10px] font-bold">
                        {indexConfigDraft.pageCount || 1} Page
                        {(indexConfigDraft.pageCount || 1) > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                      <div className="p-2 rounded bg-[#171B23] border border-[#303744]">
                        <div className="text-[#A1A9B8]">Template</div>
                        <div className="font-semibold text-[#F3F4F6] truncate">
                          {INDEX_PAGE_TEMPLATES.find(t => t.id === selectedIndexStyle)?.title}
                        </div>
                      </div>
                      <div className="p-2 rounded bg-[#171B23] border border-[#303744]">
                        <div className="text-[#A1A9B8]">Heading</div>
                        <div className="font-semibold text-[#F3F4F6] truncate">
                          {indexConfigDraft.title}
                        </div>
                      </div>
                      <div className="p-2 rounded bg-[#171B23] border border-[#303744]">
                        <div className="text-[#A1A9B8]">Rows / Page</div>
                        <div className="font-semibold text-[#F3F4F6] tabular-nums">
                          {indexConfigDraft.entriesPerPage} rows × {indexConfigDraft.pageCount}p
                        </div>
                      </div>
                      <div className="p-2 rounded bg-[#171B23] border border-[#303744]">
                        <div className="text-[#A1A9B8]">Mode</div>
                        <div className="font-semibold text-[#60A5FA]">
                          {indexConfigDraft.indexMode === 'linked'
                            ? `Linked (${(indexConfigDraft.entries || []).length} entries)`
                            : 'Blank Printable'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-[#A1A9B8] absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      data-testid="index-modal-search-input"
                      value={indexSearchQuery}
                      onChange={e => setIndexSearchQuery(e.target.value)}
                      placeholder="Search 12 index templates..."
                      className="w-full h-8 bg-[#111318] border border-[#303744] focus:border-[#1677FF] rounded px-2.5 pl-8 text-xs text-[#F3F4F6] placeholder-[#A1A9B8] focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(['All', ...INDEX_TEMPLATE_CATEGORIES] as const).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedIndexCategory(cat)}
                        className={`px-2.5 py-1 rounded text-[10px] font-semibold cursor-pointer border transition ${
                          selectedIndexCategory === cat
                            ? 'bg-[#1677FF] border-[#1677FF] text-white'
                            : 'bg-[#171B23] border-[#303744] text-[#A1A9B8] hover:text-[#F3F4F6]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid of Template Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[240px] overflow-y-auto pr-1">
                  {filteredIndexTemplates.map(idxTmpl => {
                    const isSelected = selectedIndexStyle === idxTmpl.id;
                    return (
                      <div
                        key={idxTmpl.id}
                        data-testid={`modal-index-card-${idxTmpl.id}`}
                        onClick={() => {
                          setIndexModalPreviewPageIdx(0);
                          handleSelectIndexStyle(idxTmpl.id, false);
                        }}
                        className={`p-2.5 rounded-lg border transition cursor-pointer flex flex-col justify-between gap-2 ${
                          isSelected
                            ? 'bg-[#1677FF]/15 border-[#1677FF]'
                            : 'bg-[#171B23] border-[#303744] hover:border-[#4B5563]'
                        }`}
                      >
                        <div className="flex gap-2.5 items-start">
                          <div className="w-12 h-16 shrink-0 rounded overflow-hidden border border-[#303744] bg-white">
                            {renderIndexCardMiniSvg(idxTmpl.id)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-[#F3F4F6] leading-snug">
                              {idxTmpl.title}
                            </div>
                            <div className="text-[10px] text-[#60A5FA]">{idxTmpl.category}</div>
                            <p className="text-[10px] text-[#A1A9B8] leading-snug mt-0.5">
                              {idxTmpl.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[#303744]/50">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setIndexModalPreviewPageIdx(0);
                              handleSelectIndexStyle(idxTmpl.id, false);
                            }}
                            className="px-2 py-0.5 bg-[#202631] hover:bg-[#252B36] border border-[#303744] text-[#F3F4F6] rounded text-[10px] font-medium cursor-pointer transition"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              const cfgToAdd =
                                selectedIndexStyle === idxTmpl.id
                                  ? indexConfigDraft
                                  : getDefaultIndexConfig(idxTmpl.id);
                              handleInsertIndexPagesAfterCover(
                                idxTmpl.id,
                                cfgToAdd.pageCount,
                                false,
                                cfgToAdd
                              );
                            }}
                            className="px-2.5 py-0.5 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded text-[10px] font-semibold cursor-pointer transition"
                          >
                            Add Template
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Configuration Panel */}
                {renderIndexConfigurationControls(false)}
              </div>
            </div>

            {/* Modal Guided Workflow Footer */}
            <div className="h-13 px-5 bg-[#171B23] border-t border-[#303744] flex items-center justify-between gap-2 shrink-0">
              <div className="text-[11px] text-[#A1A9B8]">
                Step {indexBuilderStep} of 5 • Inserts as one undoable operation after Front Cover
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="index-builder-prev-step-btn"
                  disabled={indexBuilderStep <= 1}
                  onClick={() =>
                    setIndexBuilderStep(prev => Math.max(1, prev - 1) as 1 | 2 | 3 | 4 | 5)
                  }
                  className="px-3 py-1.5 bg-[#252B36] hover:bg-[#303744] disabled:opacity-40 text-[#F3F4F6] rounded-md text-xs font-medium cursor-pointer transition"
                >
                  Previous Step
                </button>
                {indexBuilderStep < 5 && (
                  <button
                    type="button"
                    data-testid="index-builder-next-step-btn"
                    onClick={() =>
                      setIndexBuilderStep(prev => Math.min(5, prev + 1) as 1 | 2 | 3 | 4 | 5)
                    }
                    className="px-3.5 py-1.5 bg-[#202631] hover:bg-[#252B36] border border-[#1677FF] text-[#60A5FA] hover:text-white rounded-md text-xs font-semibold cursor-pointer transition"
                  >
                    Next Step ({indexBuilderStep + 1}/5)
                  </button>
                )}
                <button
                  type="button"
                  data-testid="index-builder-confirm-insert-btn"
                  onClick={() =>
                    handleInsertIndexPagesAfterCover(
                      selectedIndexStyle,
                      indexConfigDraft.pageCount,
                      false,
                      indexConfigDraft
                    )
                  }
                  className="px-4 py-1.5 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded-md text-xs font-semibold cursor-pointer transition flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>
                    Confirm &amp; Insert {indexConfigDraft.pageCount} Page
                    {indexConfigDraft.pageCount > 1 ? 's' : ''} After Cover
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SHIFT WARNING CONFIRMATION MODAL (When inserting index pages after cover shifts custom interior content) */}
      {indexShiftConfirmPending && (
        <div
          data-testid="index-shift-warning-modal"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[#191D25] border border-amber-500/50 rounded-xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold shrink-0">
                !
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#F3F4F6]">
                  Confirm Interior Page Shift
                </h3>
                <p className="text-xs text-[#A1A9B8] mt-1 leading-relaxed">
                  {indexShiftConfirmPending.warningMessage}
                </p>
                <p className="text-[11px] text-[#60A5FA] mt-1.5">
                  All existing interior pages and their elements will be preserved, and you can undo this insertion at any time with Ctrl+Z.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#303744]">
              <button
                type="button"
                data-testid="cancel-index-shift-btn"
                onClick={() => setIndexShiftConfirmPending(null)}
                className="px-3.5 py-1.5 bg-[#252B36] hover:bg-[#303744] text-[#A1A9B8] hover:text-white rounded-md text-xs font-semibold cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-index-shift-btn"
                onClick={() =>
                  handleInsertIndexPagesAfterCover(
                    indexShiftConfirmPending.style,
                    indexShiftConfirmPending.count,
                    true,
                    indexShiftConfirmPending.config
                  )
                }
                className="px-4 py-1.5 bg-[#1677FF] hover:bg-[#1668dc] text-white rounded-md text-xs font-semibold cursor-pointer transition"
              >
                Confirm &amp; Insert Index Page{indexShiftConfirmPending.count > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Pill */}
      {toastMessage && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 bg-[#191D25] text-[#F3F4F6] px-4 py-2 rounded-md shadow-2xl border border-[#1677FF] flex items-center gap-2 text-xs font-medium pointer-events-none">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
export default StudioModule;
