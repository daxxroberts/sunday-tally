'use client'
import React, { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { BarChart3, Users, Heart, ArrowUpRight, TrendingUp, Sparkles, CheckCircle2 } from 'lucide-react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    // Normalize coordinates to range [-0.5, 0.5]
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    setMousePos({ x, y })
  }

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 })
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-stone-50 font-sans">
      {/* Left Pane (Auth forms) */}
      <div className="flex flex-col justify-between p-6 md:p-12 lg:p-20 bg-white">
        {/* Top brand header for mobile */}
        <div className="flex items-center gap-3 lg:hidden mb-12">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center font-extrabold text-xl shadow-md">
              S
            </div>
            <span className="text-2xl font-bold tracking-tight text-stone-900">SundayTally</span>
          </Link>
        </div>

        {/* Center container for children */}
        <div className="w-full max-w-md mx-auto my-auto py-8">
          {children}
        </div>

        {/* Bottom footer links */}
        <div className="w-full max-w-md mx-auto mt-auto pt-8 border-t border-stone-100 flex flex-wrap justify-between gap-4 text-xs text-stone-400">
          <p>© {new Date().getFullYear()} SundayTally. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-stone-600 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-stone-600 transition-colors">Terms</Link>
          </div>
        </div>
      </div>

      {/* Right Pane (Aesthetic / Interactive Panel) - Hidden on mobile */}
      <div 
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="hidden lg:flex flex-col justify-between p-12 lg:p-20 bg-gradient-to-br from-stone-50 to-stone-100 border-l border-stone-200 relative overflow-hidden group select-none"
      >
        {/* Abstract background grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1.5px,transparent_1.5px)] [background-size:24px_24px] opacity-40 z-0" />

        {/* Top Brand header */}
        <div className="relative z-10 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center font-extrabold text-xl shadow-md">
              S
            </div>
            <span className="text-2xl font-bold tracking-tight text-stone-900">SundayTally</span>
          </Link>
        </div>

        {/* Main visual - Interactive Floating Cards Area */}
        <div className="relative z-10 my-auto py-12 flex justify-center items-center h-[520px] w-full max-w-lg mx-auto">
          
          {/* BACKGROUND CARD E: Baptisms (Far Top Center) */}
          <motion.div
            animate={{
              x: mousePos.x * 12,
              y: mousePos.y * -70,
            }}
            transition={{ type: 'spring', stiffness: 90, damping: 25 }}
            className="absolute top-8 left-1/3 w-32 bg-white/40 rounded-xl border border-stone-200/40 p-2.5 shadow-[0_4px_12px_rgba(0,0,0,0.01)] opacity-25 blur-[3px] scale-[0.68] pointer-events-none z-0"
          >
            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Baptisms</p>
            <p className="text-sm font-black text-stone-700 mt-0.5">7 logged</p>
          </motion.div>

          {/* BACKGROUND CARD D: Salvations (Bottom Left) */}
          <motion.div
            animate={{
              x: mousePos.x * -55,
              y: mousePos.y * 45,
            }}
            transition={{ type: 'spring', stiffness: 95, damping: 22 }}
            className="absolute bottom-6 left-2 w-36 bg-white/70 rounded-xl border border-stone-200/50 p-3 shadow-[0_6px_20px_rgba(0,0,0,0.02)] opacity-45 blur-[1.8px] scale-[0.76] pointer-events-none z-0"
          >
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-stone-400 uppercase tracking-wider">
              <Sparkles size={10} className="text-[#4F6EF7]" /> Salvations
            </div>
            <p className="text-base font-black text-stone-800 mt-1">12 Decisions</p>
          </motion.div>

          {/* BACKGROUND CARD F: New Families (Far Bottom Center) */}
          <motion.div
            animate={{
              x: mousePos.x * -15,
              y: mousePos.y * 75,
            }}
            transition={{ type: 'spring', stiffness: 85, damping: 26 }}
            className="absolute -bottom-8 left-1/4 w-36 bg-white/50 rounded-xl border border-stone-200/40 p-2.5 shadow-[0_4px_12px_rgba(0,0,0,0.01)] opacity-30 blur-[2.4px] scale-[0.72] pointer-events-none z-0"
          >
            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">New Families</p>
            <p className="text-sm font-black text-stone-700 mt-0.5">+14 this week</p>
          </motion.div>

          {/* BACKGROUND CARD C: Decisions/Stats (Top Right) */}
          <motion.div
            animate={{
              x: mousePos.x * 45,
              y: mousePos.y * -40,
            }}
            transition={{ type: 'spring', stiffness: 100, damping: 24 }}
            className="absolute top-4 -right-2 w-40 bg-white/80 rounded-xl border border-stone-200/60 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.02)] opacity-60 blur-[1.2px] scale-[0.82] pointer-events-none z-0"
          >
            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Decision Rate</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-base font-black text-stone-800">18</span>
              <span className="text-[10px] text-emerald-600 font-bold">+2.4% YTD</span>
            </div>
          </motion.div>

          {/* FLOATING CARD A: Giving Card (Top Left) */}
          <motion.div
            animate={{
              x: mousePos.x * -25,
              y: mousePos.y * -20,
            }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            className="absolute top-10 -left-12 w-48 bg-white rounded-xl border border-stone-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-4 opacity-90 blur-[0.4px] scale-[0.9] pointer-events-none z-10"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">General Giving</span>
              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">+8.2%</span>
            </div>
            <p className="text-xl font-black text-stone-900 tracking-tight">$14,240</p>
            {/* Sparkline */}
            <svg className="w-full h-8 mt-2 overflow-visible" viewBox="0 0 100 20">
              <path d="M 0 15 L 20 18 L 40 10 L 60 14 L 80 5 L 100 2" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </motion.div>

          {/* MAIN CENTER CARD: Easter Attendance */}
          <motion.div 
            animate={{
              x: mousePos.x * 12,
              y: mousePos.y * 12,
            }}
            transition={{ type: 'spring', stiffness: 110, damping: 18 }}
            className="w-full max-w-sm bg-white rounded-2xl border border-stone-200/90 shadow-[0_12px_48px_rgba(0,0,0,0.06)] p-6 relative z-10"
          >
            {/* Header info */}
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Attendance Breakdown</h3>
                <h2 className="text-xl font-extrabold text-stone-900 tracking-tight mt-0.5">Easter Attendance</h2>
              </div>
              <div className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-emerald-100 flex items-center gap-1 shadow-sm">
                +14.2% Growth <ArrowUpRight size={10} />
              </div>
            </div>

            {/* Stat Row */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100">
                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Adults</p>
                <p className="text-base font-black text-stone-900 mt-0.5">512</p>
              </div>
              <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100">
                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Kids</p>
                <p className="text-base font-black text-stone-900 mt-0.5">251</p>
              </div>
              <div className="p-2.5 bg-[#4F6EF7]/5 rounded-xl border border-[#4F6EF7]/10">
                <p className="text-[9px] font-bold text-[#4F6EF7] uppercase tracking-wider">Total</p>
                <p className="text-base font-black text-[#4F6EF7] mt-0.5">763</p>
              </div>
            </div>

            {/* Combined Bar + Trend Line graph */}
            <div className="h-36 pt-4 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 100 60">
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F6EF7" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#4F6EF7" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                
                {/* Horizontal Guide lines */}
                <line x1="0" y1="12" x2="100" y2="12" stroke="#f5f5f4" strokeWidth="0.75" strokeDasharray="3" />
                <line x1="0" y1="28" x2="100" y2="28" stroke="#f5f5f4" strokeWidth="0.75" strokeDasharray="3" />
                <line x1="0" y1="44" x2="100" y2="44" stroke="#f5f5f4" strokeWidth="0.75" strokeDasharray="3" />

                {/* Subdued historical bars */}
                {/* Wk 1: x=12.5, val=420 (height=20) */}
                <rect x="9" y="38" width="7" height="20" rx="1.5" fill="#f4f4f5" />
                {/* Wk 2: x=37.5, val=480 (height=24) */}
                <rect x="34" y="34" width="7" height="24" rx="1.5" fill="#f4f4f5" />
                {/* Wk 3: x=62.5, val=510 (height=26) */}
                <rect x="59" y="32" width="7" height="26" rx="1.5" fill="#f4f4f5" />
                {/* Easter Peak: x=87.5, val=763 (height=44) */}
                <rect x="84" y="14" width="7" height="44" rx="1.5" fill="#4F6EF7" fillOpacity="0.1" />

                {/* Filled curve area */}
                <path d="M 12.5 38 C 25 38, 25 34, 37.5 34 C 50 34, 50 32, 62.5 32 C 75 32, 75 14, 87.5 14 L 87.5 58 L 12.5 58 Z" fill="url(#chartGrad)" />

                {/* Shaded connection lines */}
                <path d="M 12.5 38 C 25 38, 25 34, 37.5 34 C 50 34, 50 32, 62.5 32 C 75 32, 75 14, 87.5 14" fill="none" stroke="#4F6EF7" strokeWidth="2.5" strokeLinecap="round" />

                {/* Dots with values */}
                <circle cx="12.5" cy="38" r="2.5" fill="white" stroke="#4F6EF7" strokeWidth="2" />
                <circle cx="37.5" cy="34" r="2.5" fill="white" stroke="#4F6EF7" strokeWidth="2" />
                <circle cx="62.5" cy="32" r="2.5" fill="white" stroke="#4F6EF7" strokeWidth="2" />
                
                {/* Floating tooltip callout for Easter Peak */}
                <circle cx="87.5" cy="14" r="4.5" fill="#4F6EF7" stroke="white" strokeWidth="2.5" />
              </svg>
            </div>
            
            {/* Axis labels */}
            <div className="flex justify-between text-[9px] font-bold text-stone-400 uppercase tracking-wider mt-2 px-1">
              <span>Wk 1 (420)</span>
              <span>Wk 2 (480)</span>
              <span>Wk 3 (510)</span>
              <span className="text-[#4F6EF7] font-black">Easter (763)</span>
            </div>
          </motion.div>

          {/* FLOATING CARD B: Volunteers Card (Bottom Right) */}
          <motion.div
            animate={{
              x: mousePos.x * 25,
              y: mousePos.y * 35,
            }}
            transition={{ type: 'spring', stiffness: 105, damping: 22 }}
            className="absolute bottom-4 -right-12 w-52 bg-white rounded-xl border border-stone-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-4 opacity-90 scale-[0.93] pointer-events-none z-10"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Volunteers</span>
              <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                <CheckCircle2 size={10} /> Fully Staffed
              </span>
            </div>
            <p className="text-xl font-black text-stone-900 tracking-tight">82 serving</p>
            <p className="text-[10px] text-stone-400 font-medium mt-1">LifeKids: 32 · Hospitality: 24 · Production: 16</p>
          </motion.div>

        </div>

        {/* Bottom panel elements: Testimonial & Church Logos */}
        <div className="relative z-10 mt-auto">
          {/* Testimonial Quote */}
          <div className="max-w-md mb-8">
            <p className="text-base font-semibold text-stone-700 leading-relaxed italic">
              &ldquo;Sunday Tally gave our staff absolute clarity on our attendance and volunteer trends. The interface is clean, fast, and remarkably easy for our team to use.&rdquo;
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="h-px w-4 bg-stone-400" />
              <p className="text-xs font-bold text-stone-900">Pastor Michael K. <span className="font-medium text-stone-500">· Executive Pastor, Grace Church</span></p>
            </div>
          </div>

          {/* Trusted Logos */}
          <div className="border-t border-stone-200/80 pt-6">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-4">Trusted by growing churches</p>
            <div className="flex gap-8 items-center opacity-40">
              {/* Monogram / Icon Logos (Greyscale, clean) */}
              <div className="flex items-center gap-1.5">
                <Users size={16} className="text-stone-900" />
                <span className="font-mono text-xs font-bold tracking-tight text-stone-900">GRACE</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Heart size={16} className="text-stone-900" />
                <span className="font-mono text-xs font-bold tracking-tight text-stone-900">HOPE CO</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BarChart3 size={16} className="text-stone-900" />
                <span className="font-mono text-xs font-bold tracking-tight text-stone-900">ELEVATE</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
