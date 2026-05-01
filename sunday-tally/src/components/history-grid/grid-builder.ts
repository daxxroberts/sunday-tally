/**
 * SundayTally History Grid Builder
 * 
 * This module builds the grid structure from a GridConfig.
 * It flattens the column tree, resolves cell states, and constructs rows.
 */

import type { 
  GridConfig, 
  DataColumn, 
  ColumnGroup, 
  Scope,
  ServiceTemplate,
  MetricDefinition 
} from './grid-config-schema';

// ══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ══════════════════════════════════════════════════════════════════════════════

export type CellState = 'EDITABLE' | 'READ_ONLY' | 'NA' | 'HEADER';

export interface FlatColumn {
  id: string;
  label: string;
  scope: Scope;
  editable: boolean;
  dataType: string;
  computedFrom?: string[];
  groupPath: string[];          // breadcrumb of parent group IDs
  depth: number;                // nesting level (0 = root)
  isCollapsed?: boolean;        // runtime collapse state
}

export interface GridRow {
  type: 'month_header' | 'week_header' | 'svc_header' | 'MO' | 'WK' | 'SV';
  scope?: Scope;                // MO | WK | SV (not set for headers)
  anchor: Date;                 // schema date anchor
  label: string;                // row label
  metricId?: string;            // for MO/WK rows
  serviceTemplateId?: string;   // for SV rows
  cells: GridCell[];            // one per column
}

export interface GridCell {
  columnId: string;
  state: CellState;
  value?: any;                  // actual data value
}

export interface GridStructure {
  columns: FlatColumn[];
  rows: GridRow[];
  headerRows: HeaderRow[];      // multi-row column headers
}

export interface HeaderRow {
  level: number;                // 0 = top-level groups, 1 = sub-groups, etc.
  cells: HeaderCell[];
}

export interface HeaderCell {
  columnId?: string;            // for leaf columns
  groupId?: string;             // for group headers
  label: string;
  colspan: number;
  isCollapsible?: boolean;
  isCollapsed?: boolean;
}

// ══════════════════════════════════════════════════════════════════════════════
// COLUMN FLATTENING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Flattens the nested column tree into a flat array for table rendering
 */
export function flattenColumns(
  config: GridConfig,
  collapseState: Record<string, boolean> = {}
): FlatColumn[] {
  const flat: FlatColumn[] = [];

  function traverse(
    node: DataColumn | ColumnGroup,
    groupPath: string[],
    depth: number
  ) {
    if (node.type === 'data') {
      flat.push({
        id: node.id,
        label: node.label,
        scope: node.scope,
        editable: node.editable,
        dataType: node.dataType,
        computedFrom: node.computedFrom,
        groupPath,
        depth
      });
    } else {
      // It's a group — traverse children
      const isCollapsed = node.collapsible && (collapseState[node.id] ?? node.defaultCollapsed ?? false);
      
      if (isCollapsed) {
        // Don't traverse children if collapsed
        return;
      }

      for (const child of node.children) {
        traverse(child, [...groupPath, node.id], depth + 1);
      }
    }
  }

  for (const col of config.columns) {
    traverse(col, [], 0);
  }

  return flat;
}

/**
 * Builds multi-row column headers from the nested structure
 */
export function buildColumnHeaders(
  config: GridConfig,
  collapseState: Record<string, boolean> = {}
): HeaderRow[] {
  const maxDepth = getMaxDepth(config.columns);
  const headerRows: HeaderRow[] = [];

  for (let level = 0; level <= maxDepth; level++) {
    headerRows.push({ level, cells: [] });
  }

  function traverse(
    node: DataColumn | ColumnGroup,
    currentLevel: number,
    groupPath: string[]
  ) {
    if (node.type === 'data') {
      // Leaf column — span down to fill remaining levels
      const rowspan = maxDepth - currentLevel + 1;
      headerRows[currentLevel].cells.push({
        columnId: node.id,
        label: node.label,
        colspan: 1
      });
    } else {
      // Group — add group header at this level
      const isCollapsed = node.collapsible && (collapseState[node.id] ?? node.defaultCollapsed ?? false);
      const colspan = isCollapsed ? 0 : countLeafColumns(node, collapseState);

      headerRows[currentLevel].cells.push({
        groupId: node.id,
        label: node.label,
        colspan: colspan || 1,
        isCollapsible: node.collapsible,
        isCollapsed
      });

      if (!isCollapsed) {
        // Traverse children at next level
        for (const child of node.children) {
          traverse(child, currentLevel + 1, [...groupPath, node.id]);
        }
      }
    }
  }

  for (const col of config.columns) {
    traverse(col, 0, []);
  }

  return headerRows;
}

function getMaxDepth(nodes: (DataColumn | ColumnGroup)[]): number {
  let max = 0;
  
  function traverse(node: DataColumn | ColumnGroup, depth: number) {
    max = Math.max(max, depth);
    if (node.type === 'group') {
      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    }
  }

  for (const node of nodes) {
    traverse(node, 0);
  }

  return max;
}

function countLeafColumns(
  group: ColumnGroup,
  collapseState: Record<string, boolean>
): number {
  const isCollapsed = group.collapsible && (collapseState[group.id] ?? group.defaultCollapsed ?? false);
  if (isCollapsed) return 0;

  let count = 0;
  for (const child of group.children) {
    if (child.type === 'data') {
      count++;
    } else {
      count += countLeafColumns(child, collapseState);
    }
  }
  return count;
}

// ══════════════════════════════════════════════════════════════════════════════
// ROW CONSTRUCTION
// ══════════════════════════════════════════════════════════════════════════════

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Builds the row manifest for a date range
 */
export function buildRows(
  config: GridConfig,
  dateRange: DateRange,
  occurrences: ServiceOccurrence[] // actual service occurrences from DB
): GridRow[] {
  const rows: GridRow[] = [];
  const flatColumns = flattenColumns(config);

  // Group by month
  const months = getMonthsInRange(dateRange);

  for (const month of months) {
    // Month header
    rows.push({
      type: 'month_header',
      anchor: month.endDate,
      label: formatMonth(month.endDate),
      cells: flatColumns.map(col => ({ columnId: col.id, state: 'HEADER' }))
    });

    // Monthly entries (MO rows)
    for (const metric of config.monthlyMetrics) {
      rows.push({
        type: 'MO',
        scope: 'MO',
        anchor: month.endDate,
        label: metric.label,
        metricId: metric.id,
        cells: flatColumns.map(col => ({
          columnId: col.id,
          state: resolveCellState('MO', col, metric.columnId, null, config)
        }))
      });
    }

    // Weeks in this month
    const weeks = getWeeksInMonth(month);

    for (const week of weeks) {
      // Week header
      rows.push({
        type: 'week_header',
        anchor: week.startDate,
        label: formatWeek(week.startDate),
        cells: flatColumns.map(col => ({ columnId: col.id, state: 'HEADER' }))
      });

      // Weekly entries (WK rows)
      for (const metric of config.weeklyMetrics) {
        rows.push({
          type: 'WK',
          scope: 'WK',
          anchor: week.startDate,
          label: metric.label,
          metricId: metric.id,
          cells: flatColumns.map(col => ({
            columnId: col.id,
            state: resolveCellState('WK', col, metric.columnId, null, config)
          }))
        });
      }

      // Service occurrences in this week
      const weekOccurrences = occurrences.filter(occ =>
        isSameWeek(occ.serviceDate, week.startDate)
      );

      // Group by date
      const occurrencesByDate = groupByDate(weekOccurrences);

      for (const [dateStr, dateOccurrences] of Object.entries(occurrencesByDate)) {
        // Service date sub-header
        const serviceDate = new Date(dateStr);
        rows.push({
          type: 'svc_header',
          anchor: serviceDate,
          label: formatServiceDate(serviceDate),
          cells: flatColumns.map(col => ({ columnId: col.id, state: 'HEADER' }))
        });

        // SV rows for each service on this date
        for (const occ of dateOccurrences) {
          const template = config.serviceTemplates.find(t => t.id === occ.serviceTemplateId);
          if (!template) continue;

          rows.push({
            type: 'SV',
            scope: 'SV',
            anchor: serviceDate,
            label: template.displayName,
            serviceTemplateId: template.id,
            cells: flatColumns.map(col => ({
              columnId: col.id,
              state: resolveCellState('SV', col, null, template, config)
            }))
          });
        }
      }
    }
  }

  return rows;
}

// ══════════════════════════════════════════════════════════════════════════════
// CELL STATE RESOLUTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Determines cell state based on row scope × column scope intersection
 */
function resolveCellState(
  rowScope: Scope,
  column: FlatColumn,
  metricColumnId: string | null,         // for MO/WK rows, which column this metric populates
  serviceTemplate: ServiceTemplate | null, // for SV rows
  config: GridConfig
): CellState {
  // Rule 1: Scope mismatch = NA
  if (rowScope !== column.scope) {
    return 'NA';
  }

  // Rule 2: MO/WK rows only populate their specific metric column
  if (rowScope === 'MO' || rowScope === 'WK') {
    if (column.id === metricColumnId) {
      return column.editable ? 'EDITABLE' : 'READ_ONLY';
    }
    return 'NA';
  }

  // Rule 3: SV rows populate columns in groups their service template maps to
  if (rowScope === 'SV' && serviceTemplate) {
    // Find which group this column belongs to
    const columnGroupId = column.groupPath[0]; // top-level group ID
    
    // Does this service template populate this group?
    if (serviceTemplate.populatesColumnGroups.includes(columnGroupId)) {
      return column.editable ? 'EDITABLE' : 'READ_ONLY';
    }
    
    return 'NA';
  }

  return 'NA';
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

interface Month {
  startDate: Date;
  endDate: Date;
}

interface Week {
  startDate: Date;
  endDate: Date;
}

export interface ServiceOccurrence {
  id: string;
  serviceTemplateId: string;
  serviceDate: Date;
}

function getMonthsInRange(range: DateRange): Month[] {
  const months: Month[] = [];
  let current = new Date(range.startDate);
  current.setDate(1); // Start of month

  while (current <= range.endDate) {
    const monthStart = new Date(current);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0); // Last day of month

    months.push({
      startDate: monthStart,
      endDate: monthEnd
    });

    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

function getWeeksInMonth(month: Month): Week[] {
  const weeks: Week[] = [];
  let current = new Date(month.startDate);

  // Find first Sunday of month (or before if month doesn't start on Sunday)
  const dayOfWeek = current.getDay();
  if (dayOfWeek !== 0) {
    current.setDate(current.getDate() - dayOfWeek);
  }

  while (current <= month.endDate) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);

    weeks.push({
      startDate: weekStart,
      endDate: weekEnd
    });

    current.setDate(current.getDate() + 7);
  }

  return weeks;
}

function isSameWeek(date: Date, weekStart: Date): boolean {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return date >= weekStart && date <= weekEnd;
}

function groupByDate(occurrences: ServiceOccurrence[]): Record<string, ServiceOccurrence[]> {
  const groups: Record<string, ServiceOccurrence[]> = {};
  
  for (const occ of occurrences) {
    const dateStr = occ.serviceDate.toISOString().split('T')[0];
    if (!groups[dateStr]) {
      groups[dateStr] = [];
    }
    groups[dateStr].push(occ);
  }

  return groups;
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
}

function formatWeek(date: Date): string {
  const weekNum = getWeekNumber(date);
  return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · Wk ${weekNum}`;
}

function formatServiceDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN BUILDER FUNCTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Builds the complete grid structure from config + data
 */
export function buildGrid(
  config: GridConfig,
  dateRange: DateRange,
  occurrences: ServiceOccurrence[],
  collapseState: Record<string, boolean> = {}
): GridStructure {
  return {
    columns: flattenColumns(config, collapseState),
    rows: buildRows(config, dateRange, occurrences),
    headerRows: buildColumnHeaders(config, collapseState)
  };
}
