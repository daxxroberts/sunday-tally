/**
 * SundayTally History Grid Configuration Schema
 * 
 * This schema defines how the History grid is built dynamically from church configuration.
 * The grid has two axes:
 * - ROWS: hierarchical (Month → Week → MO/WK/SV entries) — defined by scope tags
 * - COLUMNS: composable parent-child blocks — defined by this config
 * 
 * Key Concepts:
 * - DataColumn: a leaf node (one editable field)
 * - ColumnGroup: a parent node (wraps children, can nest)
 * - Scope: MO (monthly) | WK (weekly) | SV (per-service)
 * - Cell State: determined by (row scope × column scope) intersection
 */

// ══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ══════════════════════════════════════════════════════════════════════════════

export type Scope = 'MO' | 'WK' | 'SV' | 'SD';
export type DataType = 'number' | 'currency' | 'text' | 'percent';

/**
 * A single data column (leaf node in the column tree)
 */
export interface DataColumn {
  type: 'data';
  id: string;                    // unique identifier (e.g. "adult_attendance", "vol_tech")
  label: string;                 // display label (e.g. "Attendance", "Tech")
  scope: Scope;                  // which row types can populate this column (MO/WK/SV/SD)
  editable: boolean;             // can users edit this cell directly?
  dataType: DataType;            // data type for validation/formatting
  computedFrom?: string[];       // (optional) if editable=false, IDs of sibling columns to sum
}

/**
 * A column group (parent node that wraps children)
 */
export interface ColumnGroup {
  type: 'group';
  id: string;                    // unique identifier (e.g. "adult_exp", "weekly_totals")
  label: string;                 // group header label (e.g. "Adult Experience", "Weekly Totals")
  scope: Scope;                  // inherited by all children (determines NA cells) (MO/WK/SV/SD)
  collapsible?: boolean;         // can this group's children collapse? (for vol roles)
  defaultCollapsed?: boolean;    // initial state if collapsible
  serviceFilter?: string[];      // (SV/SD only) service/event template IDs that populate this group
  children: (DataColumn | ColumnGroup)[];  // nested structure
}

/**
 * Root configuration for a church's History grid
 */
export interface GridConfig {
  churchId: string;
  version: string;               // config version for migrations
  
  // Column structure (left-to-right order)
  columns: (DataColumn | ColumnGroup)[];
  
  // Service templates (for SV row mapping)
  serviceTemplates: ServiceTemplate[];
  
  // Metric definitions (for MO/WK/SD rows)
  monthlyMetrics: MetricDefinition[];
  weeklyMetrics: MetricDefinition[];
  singleDayMetrics?: MetricDefinition[];
  serviceMetrics: MetricDefinition[];
}

/**
 * Service template definition
 */
export interface ServiceTemplate {
  id: string;                    // template ID (e.g. "sunday_9am", "wednesday_youth", "thursday_prayer")
  displayName: string;           // e.g. "9:00 AM Service", "Wednesday Youth", "Thursday Prayer Meeting"
  dayOfWeek: number;             // 0=Sunday, 3=Wednesday, 4=Thursday, etc.
  timeSlot?: string;             // e.g. "09:00", "18:30"
  experienceType?: string;       // (optional) "adult", "kids", "youth" — for experience-model churches
  scope?: 'SV' | 'SD';           // SV = service (goes in week view), SD = single-day event (separate entry). Default 'SV'.
  populatesColumnGroups: string[]; // which column group IDs this service/event populates
}

/**
 * Metric definition (for MO/WK/SD rows)
 */
export interface MetricDefinition {
  id: string;                    // metric ID (e.g. "lifegroups_active", "weekly_giving", "thursday_prayer")
  label: string;                 // row label (e.g. "LifeGroups Active", "Weekly Giving Total", "Thursday Prayer Attendance")
  scope: 'MO' | 'WK' | 'SD';     // monthly, weekly, or single-day
  columnId: string;              // which data column ID this metric populates
  dayOfWeek?: number;            // (SD only) which day this metric tracks (4=Thursday)
}

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

export interface ValidationError {
  severity: 'error' | 'warning';
  message: string;
  fix?: () => void;
}

/**
 * Validates a GridConfig and returns any errors/warnings
 */
export function validateConfig(config: GridConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // ────────────────────────────────────────────────────────────────────────────
  // RULE 1: Multiple WK metrics should share one column (unless sub-categorized)
  // ────────────────────────────────────────────────────────────────────────────
  
  if (config.weeklyMetrics.length > 1) {
    const wkColumnIds = new Set(config.weeklyMetrics.map(m => m.columnId));
    
    if (wkColumnIds.size > 1) {
      // Multiple columns used — check if they're sub-categorized
      const allColumnsAreSubCategorized = Array.from(wkColumnIds).every(colId => {
        const column = findColumnById(config.columns, colId);
        if (!column) return false;
        
        // Check if this column has a parent group with multiple siblings
        const parent = findParentGroup(config.columns, colId);
        return parent && parent.children.length > 1;
      });
      
      if (!allColumnsAreSubCategorized) {
        errors.push({
          severity: 'warning',
          message: `Weekly metrics should share one column unless sub-categorized. ` +
                   `Found ${config.weeklyMetrics.length} WK metrics using ${wkColumnIds.size} different columns. ` +
                   `Row labels already distinguish between metrics — separate columns are redundant.`,
          fix: () => consolidateWeeklyMetrics(config)
        });
      }
    }
  }
  
  // ────────────────────────────────────────────────────────────────────────────
  // RULE 2: Multiple MO metrics should share one column (unless sub-categorized)
  // ────────────────────────────────────────────────────────────────────────────
  
  if (config.monthlyMetrics.length > 1) {
    const moColumnIds = new Set(config.monthlyMetrics.map(m => m.columnId));
    
    if (moColumnIds.size > 1) {
      const allColumnsAreSubCategorized = Array.from(moColumnIds).every(colId => {
        const column = findColumnById(config.columns, colId);
        if (!column) return false;
        
        const parent = findParentGroup(config.columns, colId);
        return parent && parent.children.length > 1;
      });
      
      if (!allColumnsAreSubCategorized) {
        errors.push({
          severity: 'warning',
          message: `Monthly metrics should share one column unless sub-categorized. ` +
                   `Found ${config.monthlyMetrics.length} MO metrics using ${moColumnIds.size} different columns.`,
          fix: () => consolidateMonthlyMetrics(config)
        });
      }
    }
  }
  
  // ────────────────────────────────────────────────────────────────────────────
  // RULE 3: Multiple SD metrics should share one column (unless sub-categorized)
  // ────────────────────────────────────────────────────────────────────────────
  
  if (config.singleDayMetrics && config.singleDayMetrics.length > 1) {
    const sdColumnIds = new Set(config.singleDayMetrics.map(m => m.columnId));
    
    if (sdColumnIds.size > 1) {
      const allColumnsAreSubCategorized = Array.from(sdColumnIds).every(colId => {
        const column = findColumnById(config.columns, colId);
        if (!column) return false;
        
        const parent = findParentGroup(config.columns, colId);
        return parent && parent.children.length > 1;
      });
      
      if (!allColumnsAreSubCategorized) {
        errors.push({
          severity: 'warning',
          message: `Single-day metrics should share one column unless sub-categorized. ` +
                   `Found ${config.singleDayMetrics.length} SD metrics using ${sdColumnIds.size} different columns.`,
          fix: () => consolidateSingleDayMetrics(config)
        });
      }
    }
  }
  
  // ────────────────────────────────────────────────────────────────────────────
  // RULE 4: columnId references must exist in columns
  // ────────────────────────────────────────────────────────────────────────────
  
  const allColumnIds = getAllColumnIds(config.columns);
  
  for (const metric of config.weeklyMetrics) {
    if (!allColumnIds.has(metric.columnId)) {
      errors.push({
        severity: 'error',
        message: `Weekly metric "${metric.label}" references non-existent columnId: "${metric.columnId}"`
      });
    }
  }
  
  for (const metric of config.monthlyMetrics) {
    if (!allColumnIds.has(metric.columnId)) {
      errors.push({
        severity: 'error',
        message: `Monthly metric "${metric.label}" references non-existent columnId: "${metric.columnId}"`
      });
    }
  }
  
  if (config.singleDayMetrics) {
    for (const metric of config.singleDayMetrics) {
      if (!allColumnIds.has(metric.columnId)) {
        errors.push({
          severity: 'error',
          message: `Single-day metric "${metric.label}" references non-existent columnId: "${metric.columnId}"`
        });
      }
    }
  }
  
  // ────────────────────────────────────────────────────────────────────────────
  // RULE 5: Service template populatesColumnGroups must reference valid groups
  // ────────────────────────────────────────────────────────────────────────────
  
  const allGroupIds = getAllGroupIds(config.columns);
  
  for (const template of config.serviceTemplates) {
    for (const groupId of template.populatesColumnGroups) {
      if (!allGroupIds.has(groupId)) {
        errors.push({
          severity: 'error',
          message: `Service template "${template.displayName}" references non-existent column group: "${groupId}"`
        });
      }
    }
  }
  
  return errors;
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-FIX FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Consolidates all weekly metrics to use a single column
 */
function consolidateWeeklyMetrics(config: GridConfig): void {
  if (config.weeklyMetrics.length === 0) return;
  
  // Find or create a single "weekly_total" column
  let weeklyColumn = findColumnById(config.columns, 'weekly_total');
  
  if (!weeklyColumn) {
    // Create a new weekly total column
    const newColumn: DataColumn = {
      type: 'data',
      id: 'weekly_total',
      label: 'Weekly Totals',
      scope: 'WK',
      editable: true,
      dataType: 'number'
    };
    
    config.columns.push(newColumn);
    weeklyColumn = newColumn;
  }
  
  // Point all weekly metrics to this single column
  for (const metric of config.weeklyMetrics) {
    metric.columnId = 'weekly_total';
  }
  
  // Remove orphaned WK columns that are no longer referenced
  removeOrphanedColumns(config, 'WK');
}

/**
 * Consolidates all monthly metrics to use a single column
 */
function consolidateMonthlyMetrics(config: GridConfig): void {
  if (config.monthlyMetrics.length === 0) return;
  
  let monthlyColumn = findColumnById(config.columns, 'monthly_total');
  
  if (!monthlyColumn) {
    const newColumn: DataColumn = {
      type: 'data',
      id: 'monthly_total',
      label: 'Monthly Totals',
      scope: 'MO',
      editable: true,
      dataType: 'number'
    };
    
    config.columns.push(newColumn);
    monthlyColumn = newColumn;
  }
  
  for (const metric of config.monthlyMetrics) {
    metric.columnId = 'monthly_total';
  }
  
  removeOrphanedColumns(config, 'MO');
}

/**
 * Consolidates all single-day metrics to use a single column
 */
function consolidateSingleDayMetrics(config: GridConfig): void {
  if (!config.singleDayMetrics || config.singleDayMetrics.length === 0) return;
  
  let singleDayColumn = findColumnById(config.columns, 'single_day_total');
  
  if (!singleDayColumn) {
    const newColumn: DataColumn = {
      type: 'data',
      id: 'single_day_total',
      label: 'Single Day Totals',
      scope: 'SD',
      editable: true,
      dataType: 'number'
    };
    
    config.columns.push(newColumn);
    singleDayColumn = newColumn;
  }
  
  for (const metric of config.singleDayMetrics) {
    metric.columnId = 'single_day_total';
  }
  
  removeOrphanedColumns(config, 'SD');
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function findColumnById(
  columns: (DataColumn | ColumnGroup)[],
  id: string
): DataColumn | null {
  for (const col of columns) {
    if (col.type === 'data' && col.id === id) {
      return col;
    } else if (col.type === 'group') {
      const found = findColumnById(col.children, id);
      if (found) return found;
    }
  }
  return null;
}

function findParentGroup(
  columns: (DataColumn | ColumnGroup)[],
  childId: string,
  parent?: ColumnGroup
): ColumnGroup | null {
  for (const col of columns) {
    if (col.type === 'data' && col.id === childId) {
      return parent || null;
    } else if (col.type === 'group') {
      const found = findParentGroup(col.children, childId, col);
      if (found) return found;
    }
  }
  return null;
}

function getAllColumnIds(columns: (DataColumn | ColumnGroup)[]): Set<string> {
  const ids = new Set<string>();
  
  function traverse(nodes: (DataColumn | ColumnGroup)[]) {
    for (const node of nodes) {
      if (node.type === 'data') {
        ids.add(node.id);
      } else {
        traverse(node.children);
      }
    }
  }
  
  traverse(columns);
  return ids;
}

function getAllGroupIds(columns: (DataColumn | ColumnGroup)[]): Set<string> {
  const ids = new Set<string>();
  
  function traverse(nodes: (DataColumn | ColumnGroup)[]) {
    for (const node of nodes) {
      if (node.type === 'group') {
        ids.add(node.id);
        traverse(node.children);
      }
    }
  }
  
  traverse(columns);
  return ids;
}

function removeOrphanedColumns(config: GridConfig, scope: Scope): void {
  // Get all columnIds still referenced by metrics
  const referencedIds = new Set<string>();
  
  if (scope === 'WK') {
    config.weeklyMetrics.forEach(m => referencedIds.add(m.columnId));
  } else if (scope === 'MO') {
    config.monthlyMetrics.forEach(m => referencedIds.add(m.columnId));
  }
  
  // Remove columns with matching scope that aren't referenced
  function filterColumns(nodes: (DataColumn | ColumnGroup)[]): (DataColumn | ColumnGroup)[] {
    return nodes.filter(node => {
      if (node.type === 'data') {
        // Keep if scope doesn't match, or if it's still referenced
        return node.scope !== scope || referencedIds.has(node.id);
      } else {
        // Recursively filter group children
        node.children = filterColumns(node.children);
        // Keep group if it has children left
        return node.children.length > 0;
      }
    });
  }
  
  config.columns = filterColumns(config.columns);
}

// ══════════════════════════════════════════════════════════════════════════════
// EXAMPLE CONFIGS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * V3 Example: Metric-Grouped Columns
 * Church thinks in terms of "what did we count" (Attendance, Volunteers, Giving, Stats)
 */
export const configV3: GridConfig = {
  churchId: 'church_v3_example',
  version: '1.0',
  
  columns: [
    // Attendance Group (metric-type grouping)
    {
      type: 'group',
      id: 'attendance',
      label: 'Attendance',
      scope: 'SV',
      children: [
        { type: 'data', id: 'main_attend', label: 'Main', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'kids_attend', label: 'Kids', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'youth_attend', label: 'Youth', scope: 'SV', editable: true, dataType: 'number' }
      ]
    },
    
    // Volunteers Group (shared pool, collapsible roles)
    {
      type: 'group',
      id: 'volunteers',
      label: 'Volunteers',
      scope: 'SV',
      children: [
        { type: 'data', id: 'vol_total', label: 'Vol Total', scope: 'SV', editable: false, dataType: 'number', computedFrom: ['vol_tech', 'vol_hosp', 'vol_greet'] },
        {
          type: 'group',
          id: 'vol_roles',
          label: 'Roles',
          scope: 'SV',
          collapsible: true,
          defaultCollapsed: true,
          children: [
            { type: 'data', id: 'vol_tech', label: 'Tech', scope: 'SV', editable: true, dataType: 'number' },
            { type: 'data', id: 'vol_hosp', label: 'Hospitality', scope: 'SV', editable: true, dataType: 'number' },
            { type: 'data', id: 'vol_greet', label: 'Greeting', scope: 'SV', editable: true, dataType: 'number' }
          ]
        }
      ]
    },
    
    // Stats & Decisions (SV scope)
    {
      type: 'group',
      id: 'stats',
      label: 'Stats & Decisions',
      scope: 'SV',
      children: [
        { type: 'data', id: 'stat_guests', label: 'Guests', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'stat_baptisms', label: 'Baptisms', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'stat_decisions', label: 'Decisions', scope: 'SV', editable: true, dataType: 'number' }
      ]
    },
    
    // Giving & Facilities (WK scope)
    {
      type: 'group',
      id: 'weekly_metrics',
      label: 'Weekly Metrics',
      scope: 'WK',
      children: [
        { type: 'data', id: 'wk_giving', label: 'Giving ($)', scope: 'WK', editable: true, dataType: 'currency' },
        { type: 'data', id: 'wk_online', label: 'Online ($)', scope: 'WK', editable: true, dataType: 'currency' },
        { type: 'data', id: 'wk_rooms', label: 'Rooms Open', scope: 'WK', editable: true, dataType: 'number' },
        { type: 'data', id: 'wk_cars', label: 'Cars', scope: 'WK', editable: true, dataType: 'number' }
      ]
    }
  ],
  
  serviceTemplates: [
    {
      id: 'sunday_9am',
      displayName: '9:00 AM Service',
      dayOfWeek: 0,
      timeSlot: '09:00',
      populatesColumnGroups: ['attendance', 'volunteers', 'stats'] // SV row for this service populates these groups
    },
    {
      id: 'sunday_11am',
      displayName: '11:00 AM Service',
      dayOfWeek: 0,
      timeSlot: '11:00',
      populatesColumnGroups: ['attendance', 'volunteers', 'stats']
    }
  ],
  
  monthlyMetrics: [],
  weeklyMetrics: [
    { id: 'weekly_giving', label: 'Weekly Giving Total', scope: 'WK', columnId: 'wk_giving' },
    { id: 'weekly_online', label: 'Online Giving', scope: 'WK', columnId: 'wk_online' },
    { id: 'weekly_rooms', label: 'Rooms Open', scope: 'WK', columnId: 'wk_rooms' },
    { id: 'weekly_cars', label: 'Cars Parked', scope: 'WK', columnId: 'wk_cars' }
  ],
  serviceMetrics: []
};

/**
 * V4 Example: Experience-Grouped Columns
 * Church thinks in terms of "where did it happen" (Adult Experience, Kids Experience, Youth Experience)
 */
export const configV4: GridConfig = {
  churchId: 'church_v4_example',
  version: '1.0',
  
  columns: [
    // Main Adult Experience
    {
      type: 'group',
      id: 'adult_exp',
      label: 'Main Adult Experience',
      scope: 'SV',
      serviceFilter: ['sunday_9am', 'sunday_11am'], // only Sunday services populate this
      children: [
        { type: 'data', id: 'adult_attend', label: 'Attendance', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'adult_vol_total', label: 'Vol Total', scope: 'SV', editable: false, dataType: 'number', computedFrom: ['adult_vol_tech', 'adult_vol_hosp', 'adult_vol_greet'] },
        {
          type: 'group',
          id: 'adult_vol_roles',
          label: 'Vol Roles',
          scope: 'SV',
          collapsible: true,
          defaultCollapsed: true,
          children: [
            { type: 'data', id: 'adult_vol_tech', label: 'Tech', scope: 'SV', editable: true, dataType: 'number' },
            { type: 'data', id: 'adult_vol_hosp', label: 'Hospitality', scope: 'SV', editable: true, dataType: 'number' },
            { type: 'data', id: 'adult_vol_greet', label: 'Greeting', scope: 'SV', editable: true, dataType: 'number' }
          ]
        }
      ]
    },
    
    // Kids Experience
    {
      type: 'group',
      id: 'kids_exp',
      label: 'Kids Experience',
      scope: 'SV',
      serviceFilter: ['sunday_9am', 'sunday_11am'],
      children: [
        { type: 'data', id: 'kids_attend', label: 'Attendance', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'kids_vol_total', label: 'Vol Total', scope: 'SV', editable: false, dataType: 'number', computedFrom: ['kids_vol_teachers', 'kids_vol_helpers', 'kids_vol_checkin'] },
        {
          type: 'group',
          id: 'kids_vol_roles',
          label: 'Vol Roles',
          scope: 'SV',
          collapsible: true,
          defaultCollapsed: true,
          children: [
            { type: 'data', id: 'kids_vol_teachers', label: 'Teachers', scope: 'SV', editable: true, dataType: 'number' },
            { type: 'data', id: 'kids_vol_helpers', label: 'Helpers', scope: 'SV', editable: true, dataType: 'number' },
            { type: 'data', id: 'kids_vol_checkin', label: 'Check-In', scope: 'SV', editable: true, dataType: 'number' }
          ]
        }
      ]
    },
    
    // Youth Experience
    {
      type: 'group',
      id: 'youth_exp',
      label: 'Youth Experience',
      scope: 'SV',
      serviceFilter: ['wednesday_youth'], // only Wednesday service populates this
      children: [
        { type: 'data', id: 'youth_students', label: 'Students', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'youth_childcare', label: 'Childcare', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'youth_vol_total', label: 'Vol Total', scope: 'SV', editable: false, dataType: 'number', computedFrom: ['youth_vol_leaders', 'youth_vol_tech', 'youth_vol_helpers'] },
        {
          type: 'group',
          id: 'youth_vol_roles',
          label: 'Vol Roles',
          scope: 'SV',
          collapsible: true,
          defaultCollapsed: true,
          children: [
            { type: 'data', id: 'youth_vol_leaders', label: 'Leaders', scope: 'SV', editable: true, dataType: 'number' },
            { type: 'data', id: 'youth_vol_tech', label: 'Tech', scope: 'SV', editable: true, dataType: 'number' },
            { type: 'data', id: 'youth_vol_helpers', label: 'Helpers', scope: 'SV', editable: true, dataType: 'number' }
          ]
        }
      ]
    },
    
    // Service Stats (cross-experience)
    {
      type: 'group',
      id: 'service_stats',
      label: 'Service Stats',
      scope: 'SV',
      children: [
        { type: 'data', id: 'stat_guests', label: 'Guests', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'stat_baptisms', label: 'Baptisms', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'stat_decisions', label: 'Decisions', scope: 'SV', editable: true, dataType: 'number' }
      ]
    },
    
    // Weekly Stats
    {
      type: 'group',
      id: 'weekly_stats',
      label: 'Weekly Stats',
      scope: 'WK',
      children: [
        { type: 'data', id: 'wk_giving', label: 'Giving ($)', scope: 'WK', editable: true, dataType: 'currency' },
        { type: 'data', id: 'wk_online', label: 'Online ($)', scope: 'WK', editable: true, dataType: 'currency' },
        { type: 'data', id: 'wk_rooms', label: 'Rooms', scope: 'WK', editable: true, dataType: 'number' },
        { type: 'data', id: 'wk_cars', label: 'Cars', scope: 'WK', editable: true, dataType: 'number' }
      ]
    }
  ],
  
  serviceTemplates: [
    {
      id: 'sunday_9am',
      displayName: '9:00 AM Service',
      dayOfWeek: 0,
      timeSlot: '09:00',
      experienceType: 'adult_kids',
      populatesColumnGroups: ['adult_exp', 'kids_exp', 'service_stats']
    },
    {
      id: 'sunday_11am',
      displayName: '11:00 AM Service',
      dayOfWeek: 0,
      timeSlot: '11:00',
      experienceType: 'adult_kids',
      populatesColumnGroups: ['adult_exp', 'kids_exp', 'service_stats']
    },
    {
      id: 'wednesday_youth',
      displayName: 'Wednesday Youth',
      dayOfWeek: 3,
      timeSlot: '18:30',
      experienceType: 'youth',
      populatesColumnGroups: ['youth_exp', 'service_stats']
    }
  ],
  
  monthlyMetrics: [],
  weeklyMetrics: [
    { id: 'weekly_giving', label: 'Weekly Giving Total', scope: 'WK', columnId: 'wk_giving' },
    { id: 'weekly_online', label: 'Online Giving', scope: 'WK', columnId: 'wk_online' },
    { id: 'weekly_rooms', label: 'Rooms Open', scope: 'WK', columnId: 'wk_rooms' },
    { id: 'weekly_cars', label: 'Cars Parked', scope: 'WK', columnId: 'wk_cars' }
  ],
  serviceMetrics: []
};

/**
 * Third Pattern Example: Service-Time Grouped + Weekly Church-Wide Volunteers
 * From the user's scenario in m0030:
 * - Two services (9am, 11am)
 * - Attendance, Giving, Stats are SV-scoped per service
 * - Volunteers are WK-scoped church-wide total (NOT per-service)
 */
export const configServiceTimeGrouped: GridConfig = {
  churchId: 'church_service_time_example',
  version: '1.0',
  
  columns: [
    // 9:00 AM Service Group
    {
      type: 'group',
      id: 'svc_9am',
      label: '9:00 AM Service',
      scope: 'SV',
      serviceFilter: ['sunday_9am'],
      children: [
        { type: 'data', id: 'svc9_main', label: 'Main', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'svc9_kids', label: 'Kids', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'svc9_youth', label: 'Youth', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'svc9_giving', label: 'Giving ($)', scope: 'SV', editable: true, dataType: 'currency' },
        { type: 'data', id: 'svc9_hands', label: 'Hands Raised', scope: 'SV', editable: true, dataType: 'number' }
      ]
    },
    
    // 11:00 AM Service Group
    {
      type: 'group',
      id: 'svc_11am',
      label: '11:00 AM Service',
      scope: 'SV',
      serviceFilter: ['sunday_11am'],
      children: [
        { type: 'data', id: 'svc11_main', label: 'Main', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'svc11_kids', label: 'Kids', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'svc11_youth', label: 'Youth', scope: 'SV', editable: true, dataType: 'number' },
        { type: 'data', id: 'svc11_giving', label: 'Giving ($)', scope: 'SV', editable: true, dataType: 'currency' },
        { type: 'data', id: 'svc11_hands', label: 'Hands Raised', scope: 'SV', editable: true, dataType: 'number' }
      ]
    },
    
    // Weekly Totals (church-wide, WK scope)
    {
      type: 'group',
      id: 'weekly_totals',
      label: 'Weekly Totals',
      scope: 'WK',
      children: [
        { type: 'data', id: 'wk_volunteers', label: 'Volunteers', scope: 'WK', editable: true, dataType: 'number' }
      ]
    }
  ],
  
  serviceTemplates: [
    {
      id: 'sunday_9am',
      displayName: '9:00 AM Service',
      dayOfWeek: 0,
      timeSlot: '09:00',
      populatesColumnGroups: ['svc_9am']
    },
    {
      id: 'sunday_11am',
      displayName: '11:00 AM Service',
      dayOfWeek: 0,
      timeSlot: '11:00',
      populatesColumnGroups: ['svc_11am']
    }
  ],
  
  monthlyMetrics: [],
  weeklyMetrics: [
    { id: 'weekly_volunteers', label: 'Weekly Volunteers Total', scope: 'WK', columnId: 'wk_volunteers' }
  ],
  serviceMetrics: []
};
