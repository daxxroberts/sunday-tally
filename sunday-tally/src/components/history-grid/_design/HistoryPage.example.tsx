/**
 * Example usage of HistoryGrid component
 */

import React, { useState } from 'react';
import { HistoryGrid } from './HistoryGrid';
import type { GridConfig } from './grid-config-schema';
import { configV4 } from './grid-config-schema'; // Example config

export function HistoryPage() {
  const [config] = useState<GridConfig>(configV4);
  
  // Date range for grid (e.g., current month)
  const dateRange = {
    startDate: new Date('2026-04-01'),
    endDate: new Date('2026-04-30')
  };
  
  // Service occurrences (from database)
  const serviceOccurrences = [
    { id: '1', serviceTemplateId: 'sunday_9am', serviceDate: new Date('2026-04-06') },
    { id: '2', serviceTemplateId: 'sunday_11am', serviceDate: new Date('2026-04-06') },
    { id: '3', serviceTemplateId: 'sunday_9am', serviceDate: new Date('2026-04-13') },
    { id: '4', serviceTemplateId: 'sunday_11am', serviceDate: new Date('2026-04-13') },
    { id: '5', serviceTemplateId: 'wednesday_youth', serviceDate: new Date('2026-04-09') },
    { id: '6', serviceTemplateId: 'wednesday_youth', serviceDate: new Date('2026-04-16') }
  ];
  
  // Initial data (from database)
  const initialData = new Map([
    // Format: "rowId-columnId" -> value
    ['WK-2026-04-06-weekly_giving-wk_giving', '11900'],
    ['WK-2026-04-06-weekly_rooms-wk_rooms', '12'],
    ['SV-2026-04-06-sunday_9am-adult_attend', '224'],
    ['SV-2026-04-06-sunday_9am-kids_attend', '52'],
    ['SV-2026-04-06-sunday_11am-adult_attend', '196'],
    ['SV-2026-04-06-sunday_11am-kids_attend', '46']
  ]);
  
  // Save handler
  const handleSave = async (changes: Map<string, any>) => {
    console.log('Saving changes:', Array.from(changes.entries()));
    
    // Transform changes into API format
    const updates = Array.from(changes.entries()).map(([key, value]) => {
      const [rowId, columnId] = key.split('-');
      return { rowId, columnId, value };
    });
    
    // Send to backend
    const response = await fetch('/api/history/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save changes');
    }
    
    console.log('Changes saved successfully');
  };
  
  return (
    <div className="history-page">
      <header className="page-header">
        <h1>History</h1>
        <p>View and edit historical data</p>
      </header>
      
      <HistoryGrid
        config={config}
        dateRange={dateRange}
        serviceOccurrences={serviceOccurrences}
        initialData={initialData}
        onSave={handleSave}
      />
    </div>
  );
}

export default HistoryPage;
