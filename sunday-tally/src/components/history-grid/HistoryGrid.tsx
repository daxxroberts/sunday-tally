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
  serviceOccurrences: Array<{
    id: string;
    serviceTemplateId: string;
    serviceDate: Date;
  }>;
  initialData?: Map<string, any>; // key: "rowId-columnId", value: cell value
  onSave?: (changes: Map<string, any>) => Promise<void>;
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
  serviceOccurrences,
  initialData = new Map(),
  onSave
}) => {
  const [changes, setChanges] = useState<Map<string, any>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [collapseState, setCollapseState] = useState<Record<string, boolean>>({});

  // Build grid structure (memoized)
  const gridStructure = useMemo(() => {
    return buildGrid(config, dateRange, serviceOccurrences, collapseState);
  }, [config, dateRange, serviceOccurrences, collapseState]);

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
            />
          </thead>
          <tbody>
            <GridBody
              rows={gridStructure.rows}
              columns={gridStructure.columns}
              getCellValue={getCellValue}
              onCellChange={handleCellChange}
              changes={changes}
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
}

const GridHeader: React.FC<GridHeaderProps> = ({ headerRows, onToggleCollapse }) => {
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
          
          {row.cells.map((cell: any, cellIdx: number) => (
            <th
              key={cellIdx}
              colSpan={cell.colspan}
              className={`
                ${cell.isLeaf ? '' : 'group-header'}
                ${cell.isCollapsible ? 'collapsible' : ''}
              `}
              onClick={() => cell.isCollapsible && cell.groupId && onToggleCollapse(cell.groupId)}
            >
              {cell.label}
              {cell.isCollapsible && (
                <span className="collapse-icon">
                  {cell.isCollapsed ? ' ▶' : ' ▼'}
                </span>
              )}
            </th>
          ))}
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
}

const GridBody: React.FC<GridBodyProps> = ({
  rows,
  columns,
  getCellValue,
  onCellChange,
  changes
}) => {
  return (
    <>
      {rows.map((row, rowIdx) => {
        const rowId = `${row.type}-${row.anchor.toISOString()}-${row.metricId || row.serviceTemplateId || rowIdx}`;
        
        return (
          <tr key={rowId} className={`row-${row.type.toLowerCase()}`}>
            {/* Scope column */}
            <td className="col-scope">
              {row.scope && <span className={`scope-tag scope-${row.scope}`}>{row.scope}</span>}
            </td>

            {/* Label column */}
            <td className="col-label">
              <div className="row-label">{row.label}</div>
            </td>

            {/* Data columns */}
            {row.cells.map((cell, cellIdx) => {
              const columnId = columns[cellIdx].id;
              const cellKey = `${rowId}-${columnId}`;
              const isChanged = changes.has(cellKey);
              
              return (
                <GridCellComponent
                  key={cellKey}
                  cell={cell}
                  rowId={rowId}
                  columnId={columnId}
                  value={getCellValue(rowId, columnId)}
                  onChange={onCellChange}
                  isChanged={isChanged}
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
  rowId: string;
  columnId: string;
  value: any;
  onChange: (rowId: string, columnId: string, value: any) => void;
  isChanged: boolean;
}

const GridCellComponent: React.FC<GridCellComponentProps> = ({
  cell,
  rowId,
  columnId,
  value,
  onChange,
  isChanged
}) => {
  const className = `
    ${cell.state.toLowerCase().replace('_', '-')}
    ${isChanged ? 'changed' : ''}
  `.trim();

  if (cell.state === 'EDITABLE') {
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
    return <td className={className}>{value || '—'}</td>;
  }

  // NA or HEADER
  return <td className={className}>—</td>;
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
