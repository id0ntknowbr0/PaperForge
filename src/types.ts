export type TabType = 'studio';

export interface StudioElement {
  id: string;
  type: 'shape' | 'text' | 'template' | 'image' | 'path';
  x: number; // percentage of canvas (0 to 100)
  y: number; // percentage of canvas (0 to 100)
  width: number; // percentage of canvas
  height: number; // percentage of canvas
  rotation?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  locked?: boolean;
  groupId?: string;
  borderRadius?: number;
  letterSpacing?: number;
  lineHeight?: number;
  // For shape
  shapeType?: 'rect' | 'circle' | 'line' | 'star' | 'heart' | 'arrow' | 'triangle' | 'polygon';
  // For text
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: 'left' | 'center' | 'right';
  // For image
  imageUrl?: string;
  imageAlt?: string;
  preserveAspectRatio?: boolean;
  // For template overlay
  templateType?: string;
  templateVariant?: string;
  templateParams?: Record<string, any>;
  pathData?: string;
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

export interface IndexTemplateConfig {
  templateId: string;
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

export interface StudioPage {
  id: string;
  pageNumber: number; // 1 for Cover spread, 2..N for interior pages
  isCover?: boolean;
  isEven?: boolean;
  name: string;
  elements: StudioElement[];
  backgroundColor: string;
  templateType?: string;
  templateVariant?: string;
  showPageNumber?: boolean;
  indexConfig?: IndexTemplateConfig;
}

export interface ProjectMarginSettings {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface StudioBookProject {
  id: string;
  title: string;
  trimSize: '6x9' | '8x10' | '8.5x11' | '5x8' | '7x10' | '8.25x8.25' | 'custom';
  customWidthIn?: number;
  customHeightIn?: number;
  margins?: ProjectMarginSettings;
  bleedInches?: number;
  pageCount: number;
  bleed: boolean;
  paperType: 'white' | 'cream' | 'color';
  binding: 'paperback' | 'hardcover';
  pages: StudioPage[];
  lastSaved: string;
  updatedAt?: number;
}

export interface InteriorConfig {
  trimSize: string;
  customWidthIn?: number;
  customHeightIn?: number;
  pageCount: number;
  bleed: boolean;
  bleedInches?: number;
  interiorType: string;
  lineSpacing: number;
  insideMargin: number;
  outsideMargin: number;
  topMargin: number;
  bottomMargin: number;
  showPageNumbers: boolean;
  headerText?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  wordSearchKeywords?: string;
  pages?: StudioPage[];
  indexConfig?: IndexTemplateConfig;
}

export interface InteriorTemplateItem {
  id: string;
  name: string;
  category: string;
  variantsCount: number;
  variants: string[];
  isPro?: boolean;
  isLiked?: boolean;
  description: string;
}

export interface ProductResearchItem {
  asin: string;
  title: string;
  author: string;
  price: number;
  bsr: number;
  estimatedMonthlySales: number;
  estimatedMonthlyRevenue: number;
  rating: number;
  reviewsCount: number;
  category: string;
  pageCount: number;
  publishDate: string;
  coverBadge?: string;
}

export interface KeywordItem {
  id: string;
  keyword: string;
  searchVolumeAmazon: number;
  searchVolumeGoogle: number;
  cpc: number;
  competition: 'Low' | 'Medium' | 'High';
  buyerIntent: number;
  trending: 'up' | 'stable' | 'down';
  category: string;
}

export interface KdpCategoryItem {
  id: string;
  path: string;
  primaryCategory: string;
  subCategory: string;
  bisacCode: string;
  competitionLevel: 'Low' | 'Medium' | 'High';
  salesForBestSellerBadge: number;
  averageBSR: number;
  description: string;
}

export interface ProjectItem {
  id: string;
  title: string;
  subtitle: string;
  penName: string;
  niche: string;
  trimSize: string;
  pageCount: number;
  interiorType: string;
  targetBSR: number;
  listPrice: number;
  status: string;
  keywords: string[];
  backendKeywords: string[];
  createdDate: string;
  notes: string;
}

export interface TrackedKeyword {
  id: string;
  keyword: string;
  targetBSR: number;
  currentBSR: number;
  status: string;
  addedDate: string;
  notes: string;
}


