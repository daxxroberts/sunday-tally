import React from 'react';

export default function ServicesPrototype() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 md:p-8 font-sans selection:bg-blue-100">
      
      {/* App Header */}
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">
          SundayTally
        </h1>
        <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
          <span className="text-sm font-semibold text-blue-700">ST</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-4">May 2026</h2>

        {/* The Accordion Container (Clean Light Mode) */}
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden mb-4 transition-all duration-200">
          
          {/* Week Header (Active/Open state) */}
          <div className="p-4 flex items-center justify-between bg-gray-50 border-b border-gray-200 cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-600"></div>
              <h3 className="text-base font-semibold text-gray-900">Week of May 3</h3>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
              Current
            </span>
          </div>

          {/* Week Content (The Occurrences) */}
          <div className="p-3 space-y-3">
            
            {/* Giving Block */}
            <div className="p-3 rounded-lg border border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 group-hover:scale-105 transition-transform">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Weekly Giving</h4>
                  <p className="text-xs text-blue-600 font-medium">In Progress • 1 of 2 entered</p>
                </div>
              </div>
              <button className="px-4 py-1.5 text-sm font-medium rounded-lg bg-white hover:bg-gray-50 text-gray-700 transition-colors border border-gray-200 shadow-sm">
                Enter
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-100 mx-2"></div>

            {/* 9:00 AM Service Instance */}
            <div className="p-2">
              <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase px-1 mb-3">9:00 AM Service</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Experience Tag */}
                <div className="p-3.5 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer group shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900">Experience</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
                  </div>
                  <p className="text-xs font-medium text-gray-500">Not Started</p>
                </div>

                {/* LifeKids Tag */}
                <div className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100/50 transition-all cursor-pointer group shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-emerald-900">LifeKids</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  </div>
                  <p className="text-xs font-medium text-emerald-700">Complete</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Closed Week Accordion (Collapsed) */}
        <div className="p-4 rounded-xl bg-white border border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors mb-3 shadow-sm">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-medium text-gray-600">Week of April 26</h3>
          </div>
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </div>

        <div className="p-4 rounded-xl bg-white border border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors shadow-sm">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-medium text-gray-600">Week of April 19</h3>
          </div>
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </div>

      </div>
    </div>
  );
}
