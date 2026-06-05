'use client'

/**
 * HistoryGrid.tsx
 *
 * Production-ready React/TypeScript component for SundayTally History grid.
 * Dynamically builds grid structure from GridConfig and handles editable cells.
 *
 * Imported design package (claude.ai/design) — see chats/chat1.md for design intent.
 */

import { useState, useMemo } from 'react'
import type { GridConfig } from './grid-config-schema'
import { buildGrid } from './grid-builder'
import type { GridRow, GridCell, FlatColumn } from './grid-builder'
import { buildGroupColorMap, styleForGroup, type GroupColor } from './group-colors'
import './HistoryGrid.css'

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface HistoryGridProps {
  config: GridConfig;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  serviceInstances: Array<{
    id: string;
    serviceTemplateId: string;
    serviceDate: Date;
  }>;
  initialData?: Map<string, any>; // key: "rowId-columnId", value: cell value
  availableTags?: Array<{ id: string; name: string }>;
  onSave?: (changes: Map<string, any>) => Promise<void>;
  /**
   * Optional color map for top-level groups. When provided, group headers are
   * tinted to match the filter pills above the grid. Order-based assignment —
   * see buildGroupColorMap. When omitted, the grid auto-derives from config.
   */
  groupColorMap?: Map<string, GroupColor>;
}

interface CellChange {
  rowId: string;
  columnId: string;
  value: any;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export const HistoryGrid: React.FC<HistoryGridProps> = ({
  config,
  dateRange,
  serviceInstances,
  initialData = new Map(),
  availableTags = [],
  onSave,
  groupColorMap
}) => {
  const [changes, setChanges] = useState<Map<string, any>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [collapseState, setCollapseState] = useState<Record<string, boolean>>({});

  // If parent didn't pass a color map, derive one from the config's top-level
  // group order. This keeps standalone HistoryGrid usage (e.g. History page)
  // color-coded too — not just the PreviewGrid wrapper.
  const effectiveColorMap = useMemo<Map<string, GroupColor>>(() => {
    if (groupColorMap) return groupColorMap;
    const topLevelIds = (config.columns ?? [])
      .filter((c: any) => c.type === 'group')
      .map((c: any) => c.id as string);
    return buildGroupColorMap(topLevelIds);
  }, [config, groupColorMap]);

  // Build grid structure (memoized)
  const gridStructure = useMemo(() => {
    return buildGrid(config, dateRange, serviceInstances, collapseState);
  }, [config, dateRange, serviceInstances, collapseState]);

  // Compute which flat column indices start a new top-level group (skip index 0)
  const groupStartSet = useMemo(() => {
    const set = new Set<number>();
    let lastTopGroup = '';
    gridStructure.columns.forEach((col, idx) => {
      const topGroup = col.groupPath[0] ?? col.id;
      if (topGroup !== lastTopGroup) {
        if (idx > 0) set.add(idx);
        lastTopGroup = topGroup;
      }
    });
    return set;
  }, [gridStructure.columns]);

  // Track cell change
  const handleCellChange = (rowId: string, columnId: string, value: any) => {
    setChanges(prev => {
      const updated = new Map(prev);
      updated.set(`${rowId}-${columnId}`, value);
      return updated;
    });
  };

  // Get cell value (from changes or initial data)
  const getCellValue = (rowId: string, columnId: string): any => {
    const key = `${rowId}-${columnId}`;
    if (changes.has(key)) {
      return changes.get(key);
    }
    return initialData.get(key);
  };

  // Save changes
  const handleSave = async () => {
    if (!onSave || changes.size === 0) return;
    
    setIsSaving(true);
    try {
      await onSave(changes);
      setChanges(new Map()); // Clear changes after successful save
    } catch (error) {
      console.error('Failed to save changes:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Discard changes
  const handleDiscard = () => {
    if (changes.size === 0) return;
    
    if (window.confirm(`Discard ${changes.size} unsaved changes?`)) {
      setChanges(new Map());
    }
  };

  // Toggle column group collapse
  const toggleCollapse = (groupId: string) => {
    setCollapseState(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  return (
    <div className="history-grid-container">
      <div className="grid-wrapper">
        <table className="history-grid-table">
          <thead>
            <GridHeader
              headerRows={gridStructure.headerRows}
              onToggleCollapse={toggleCollapse}
              groupStartSet={groupStartSet}
              groupColorMap={effectiveColorMap}
            />
          </thead>
          <tbody>
            <GridBody
              rows={gridStructure.rows}
              columns={gridStructure.columns}
              getCellValue={getCellValue}
              onCellChange={handleCellChange}
              changes={changes}
              availableTags={availableTags}
              groupStartSet={groupStartSet}
            />
          </tbody>
        </table>
      </div>

      {changes.size > 0 && (
        <SaveBar
          changeCount={changes.size}
          onSave={handleSave}
          onDiscard={handleDiscard}
          isSaving={isSaving}
        />
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// GRID HEADER
// ══════════════════════════════════════════════════════════════════════════════

interface GridHeaderProps {
  headerRows: any[];
  onToggleCollapse: (groupId: string) => void;
  groupStartSet: Set<number>;
  groupColorMap: Map<string, GroupColor>;
}

const GridHeader: React.FC<GridHeaderProps> = ({ headerRows, onToggleCollapse, groupStartSet, groupColorMap }) => {
  return (
    <>
      {headerRows.map((row, rowIdx) => (
        <tr key={rowIdx} className={`hrow-${row.level === 0 ? 'group' : 'cols'}`}>
          {rowIdx === 0 && (
            <>
              <th className="col-scope" rowSpan={headerRows.length}>Scope</th>
              <th className="col-label" rowSpan={headerRows.length}>Entry</th>
            </>
          )}

          {row.cells.map((cell: any, cellIdx: number) => {
            // Level-0 group header: add separator on every cell after the first.
            // Leaf rows: use groupStartSet (leaf column index) for separator — tracked
            // by a running counter since group headers span multiple leaf columns.
            const isLevel0GroupSep = row.level === 0 && cellIdx > 0;
            // Color tint applies to group/sub-group cells, NOT leaf columns. The
            // tint comes from the root tag identified by groupId — order-based
            // palette assignment via groupColorMap keeps the same color in sync
            // with the filter pills above the grid.
            const colorStyle = cell.columnId ? {} : styleForGroup(cell.groupId, row.level, groupColorMap);
            return (
              <th
                key={cellIdx}
                colSpan={cell.colspan}
                rowSpan={cell.rowspan ?? 1}
                className={[
                  cell.columnId ? '' : 'group-header',
                  cell.isCollapsible ? 'collapsible' : '',
                  isLevel0GroupSep ? 'group-separator' : '',
                ].filter(Boolean).join(' ')}
                style={colorStyle}
                onClick={() => cell.isCollapsible && cell.groupId && onToggleCollapse(cell.groupId)}
              >
                {cell.label}
                {cell.isCollapsible && (
                  <span className="collapse-icon">
                    {cell.isCollapsed ? ' ▶' : ' ▼'}
                  </span>
                )}
              </th>
            );
          })}
        </tr>
      ))}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// GRID BODY
// ══════════════════════════════════════════════════════════════════════════════

interface GridBodyProps {
  rows: GridRow[];
  columns: FlatColumn[];
  getCellValue: (rowId: string, columnId: string) => any;
  onCellChange: (rowId: string, columnId: string, value: any) => void;
  changes: Map<string, any>;
  availableTags: Array<{ id: string; name: string }>;
  groupStartSet: Set<number>;
}

const GridBody: React.FC<GridBodyProps> = ({
  rows,
  columns,
  getCellValue,
  onCellChange,
  changes,
  availableTags,
  groupStartSet,
}) => {
  // Pre-compute WK averages per month section.
  // Key = month_header anchor ISO string → Map<columnId, average | null>
  // Depends on `changes` so it recomputes whenever the user edits a cell.
  const monthAverages = useMemo(() => {
    const result = new Map<string, Map<string, number | null>>();
    let monthKey: string | null = null;
    let wkRows: Array<{ row: GridRow; idx: number }> = [];
    let svRows: Array<{ row: GridRow; idx: number }> = [];
    let moRows: Array<{ row: GridRow; idx: number }> = [];

    function flush() {
      if (!monthKey) return;
      const colMap = new Map<string, number | null>();
      for (const col of columns) {
        const sourceRows =
          col.scope === 'WK' ? wkRows :
          col.scope === 'SV' ? svRows :
          col.scope === 'MO' ? moRows : [];

        const vals: number[] = [];
        for (const { row, idx } of sourceRows) {
          const rowId = `${row.type}-${row.anchor.toISOString()}-${row.metricId ?? row.serviceTemplateId ?? idx}`;
          const raw = getCellValue(rowId, col.id);
          // null/undefined = never entered → skip (don't count the week).
          // '' = cleared → skip. 0 (or "0") = intentional zero → count it.
          if (raw == null || raw === '') continue;
          const n = Number(String(raw).replace(/[$,\s]/g, ''));
          if (Number.isFinite(n)) vals.push(n);
        }
        colMap.set(col.id, vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
      }
      result.set(monthKey, colMap);
    }

    rows.forEach((row, idx) => {
      if (row.type === 'month_header') {
        flush();
        monthKey = row.anchor.toISOString();
        wkRows = []; svRows = []; moRows = [];
      } else if (row.type === 'WK') {
        wkRows.push({ row, idx });
      } else if (row.type === 'SV') {
        svRows.push({ row, idx });
      } else if (row.type === 'MO') {
        moRows.push({ row, idx });
      }
    });
    flush();
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, changes]);

  return (
    <>
      {rows.map((row, rowIdx) => {
        const rowId = `${row.type}-${row.anchor.toISOString()}-${row.metricId || row.serviceTemplateId || rowIdx}`;

        // ── Month header: subtle blue row showing WK/Avg for each column ──
        if (row.type === 'month_header') {
          const avgMap = monthAverages.get(row.anchor.toISOString());
          return (
            <tr key={rowId} className="row-month_header">
              <td className="col-scope" />
              <td className="col-label">
                <div className="row-label flex items-center gap-1">
                  <span>{row.label}</span>
                  <span className="wk-avg-badge">WK/Avg</span>
                </div>
              </td>
              {row.cells.map((_, cellIdx) => {
                const column = columns[cellIdx];
                // Defensive: row.cells can outnumber columns transiently when a
                // column group collapses (rebuild lags one render). Skip the
                // overflow cell rather than crash on undefined.id.
                if (!column) return null;
                // Collapsed-group placeholder in month-header row — blank cell
                // keeping the parent header span intact.
                if (column.isCollapsed) {
                  return (
                    <td
                      key={cellIdx}
                      className={[
                        'collapsed-placeholder',
                        groupStartSet.has(cellIdx) ? 'group-separator' : '',
                      ].filter(Boolean).join(' ')}
                    />
                  );
                }
                const avg = avgMap?.get(column.id) ?? null;
                const hasValue = avg !== null;
                return (
                  <td
                    key={cellIdx}
                    className={[
                      hasValue ? '' : 'month-avg-na',
                      groupStartSet.has(cellIdx) ? 'group-separator' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {hasValue ? formatNumeric(Math.round(avg!)) : '—'}
                  </td>
                );
              })}
            </tr>
          );
        }

        return (
          <tr key={rowId} className={`row-${row.type.toLowerCase()}`}>
            {/* Scope column */}
            <td className="col-scope">
              {row.scope && <span className={`scope-tag scope-${row.scope}`}>{row.scope}</span>}
            </td>

            {/* Label column */}
            <td className="col-label">
              <div 
                className="row-label flex items-center gap-2"
                style={{ paddingLeft: row.depth ? `${row.depth * 1.5}rem` : undefined }}
              >
                {row.depth && row.depth > 0 ? (
                  <span className="text-gray-300 select-none">↳</span>
                ) : null}
                <span>{row.label}</span>
              </div>
            </td>

            {/* Data columns */}
            {row.cells.map((cell, cellIdx) => {
              const column = columns[cellIdx];
              // Same defensive guard as the month_header branch above —
              // row.cells can briefly outnumber columns during collapse.
              if (!column) return null;
              const columnId = column.id;
              const cellKey = `${rowId}-${columnId}`;
              const isChanged = changes.has(cellKey);
              const isGroupStart = groupStartSet.has(cellIdx);

              // Collapsed-group placeholder: completely blank cell. Reserves the
              // column slot so the parent header span stays correct, but shows
              // nothing — never substitutes a value from one of the sub-columns.
              // The collapsed sub-group header above is the only indicator; click
              // its ▶ to re-expand.
              if (column.isCollapsed) {
                return (
                  <td
                    key={`${rowId}-${cellIdx}`}
                    className={[
                      'collapsed-placeholder',
                      isGroupStart ? 'group-separator' : '',
                    ].filter(Boolean).join(' ')}
                  />
                );
              }
              return (
                <GridCellComponent
                  key={`${rowId}-${cellIdx}`}
                  cell={cell}
                  column={column}
                  rowId={rowId}
                  columnId={columnId}
                  value={getCellValue(rowId, columnId)}
                  onChange={onCellChange}
                  isChanged={isChanged}
                  computedFrom={column.computedFrom}
                  getCellValue={getCellValue}
                  availableTags={availableTags}
                  isGroupStart={isGroupStart}
                />
              );
            })}
          </tr>
        );
      })}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// GRID CELL
// ══════════════════════════════════════════════════════════════════════════════

interface GridCellComponentProps {
  cell: GridCell;
  column: FlatColumn;
  rowId: string;
  columnId: string;
  value: any;
  onChange: (rowId: string, columnId: string, value: any) => void;
  isChanged: boolean;
  computedFrom?: string[];
  getCellValue: (rowId: string, columnId: string) => any;
  availableTags: Array<{ id: string; name: string }>;
  isGroupStart?: boolean;
}

/** Format a numeric cell value as #,### (strips existing commas/$ before formatting). */
function formatNumeric(value: any): string {
  if (value == null || value === '') return '';
  const n = parseFloat(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('en-US');
}

const GridCellComponent: React.FC<GridCellComponentProps> = ({
  cell,
  column,
  rowId,
  columnId,
  value,
  onChange,
  isChanged,
  computedFrom,
  getCellValue,
  availableTags,
  isGroupStart = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const className = [
    cell.state.toLowerCase().replace('_', '-'),
    isChanged ? 'changed' : '',
    isGroupStart ? 'group-separator' : '',
  ].filter(Boolean).join(' ');

  const isNumeric = column.dataType === 'number' || column.dataType === 'currency';

  if (cell.state === 'EDITABLE') {
    if (column.dataType === 'tags') {
      return (
        <td className={className}>
          <TagsCell
            value={Array.isArray(value) ? value : []}
            availableTags={availableTags}
            onChange={(newTags) => onChange(rowId, columnId, newTags)}
          />
        </td>
      );
    }

    // Numeric cells: show #,### when blurred, raw value when focused for editing.
    if (isNumeric) {
      return (
        <td className={className}>
          <input
            type="text"
            value={isFocused ? (value || '') : formatNumeric(value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => onChange(rowId, columnId, e.target.value)}
            placeholder="—"
          />
        </td>
      );
    }

    return (
      <td className={className}>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(rowId, columnId, e.target.value)}
          placeholder="—"
        />
      </td>
    );
  }

  if (cell.state === 'READ_ONLY') {
    // Computed total — sum sibling values live so edits update on the fly.
    if (computedFrom && computedFrom.length > 0) {
      let sum: number | null = null;
      for (const sibId of computedFrom) {
        const sibVal = getCellValue(rowId, sibId);
        const cleaned = String(sibVal ?? '').replace(/[$,\s]/g, '');
        const n = Number(cleaned);
        if (Number.isFinite(n)) {
          sum = (sum ?? 0) + n;
        }
      }
      return <td className={className}>{sum != null ? sum.toLocaleString('en-US') : '—'}</td>;
    }
    // Plain read-only — format numerics.
    const display = isNumeric ? formatNumeric(value) : value;
    return <td className={className}>{display || '—'}</td>;
  }

  // NA or HEADER
  return <td className={className}>—</td>;
};

// ══════════════════════════════════════════════════════════════════════════════
// TAGS CELL COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

interface TagsCellProps {
  value: string[];
  availableTags: Array<{ id: string; name: string }>;
  onChange: (newTags: string[]) => void;
}

const TagsCell: React.FC<TagsCellProps> = ({ value, availableTags, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleTag = (tagId: string) => {
    if (value.includes(tagId)) {
      onChange(value.filter(id => id !== tagId));
    } else {
      onChange([...value, tagId]);
    }
  };

  return (
    <div className="relative">
      <div 
        className="cursor-pointer min-h-[24px] flex flex-wrap gap-1 p-1 hover:bg-white/50 rounded transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {value.length === 0 ? (
          <span className="text-gray-400 text-xs px-1">Click to add...</span>
        ) : (
          value.map(tagId => {
            const t = availableTags.find(a => a.id === tagId);
            return t ? (
              <span key={tagId} className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                {t.name}
              </span>
            ) : null;
          })
        )}
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto py-1">
            {availableTags.length === 0 ? (
              <p className="text-xs text-gray-400 p-3 text-center">No tags available.</p>
            ) : (
              availableTags.map(tag => (
                <label key={tag.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={value.includes(tag.id)}
                    onChange={() => toggleTag(tag.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {tag.name}
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SAVE BAR
// ══════════════════════════════════════════════════════════════════════════════

interface SaveBarProps {
  changeCount: number;
  onSave: () => void;
  onDiscard: () => void;
  isSaving: boolean;
}

const SaveBar: React.FC<SaveBarProps> = ({ changeCount, onSave, onDiscard, isSaving }) => {
  return (
    <div className="save-bar visible">
      <span className="save-bar-text">Unsaved changes</span>
      <span className="save-bar-count">{changeCount}</span>
      <div className="save-bar-spacer" />
      <button className="btn-discard" onClick={onDiscard} disabled={isSaving}>
        Discard
      </button>
      <button className="btn-save" onClick={onSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
};

export default HistoryGrid;
