'use client'

import React from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { BarChart3, Users, Heart, ArrowUpRight } from 'lucide-react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
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
      <div className="hidden lg:flex flex-col justify-between p-12 lg:p-20 bg-gradient-to-br from-stone-50 to-stone-100 border-l border-stone-200 relative overflow-hidden">
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

        {/* Main visual - Interactive Mockup Card */}
        <div className="relative z-10 my-auto py-12 flex justify-center items-center">
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md bg-white rounded-2xl border border-stone-200/80 shadow-[0_8px_32px_rgba(0,0,0,0.04)] p-6"
          >
            {/* Header info */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider">Attendance Breakdown</h3>
                <h2 className="text-xl font-extrabold text-stone-900 tracking-tight mt-1">Easter Attendance</h2>
              </div>
              <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100 flex items-center gap-1 shadow-sm">
                +14.2% Growth <ArrowUpRight size={12} />
              </div>
            </div>

            {/* Stat Row */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-100">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Adults</p>
                <p className="text-lg font-black text-stone-900 mt-0.5">512</p>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-100">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Kids</p>
                <p className="text-lg font-black text-stone-900 mt-0.5">251</p>
              </div>
              <div className="p-3 bg-[#4F6EF7]/5 rounded-xl border border-[#4F6EF7]/10">
                <p className="text-[10px] font-bold text-[#4F6EF7] uppercase tracking-wider">Total</p>
                <p className="text-lg font-black text-[#4F6EF7] mt-0.5">763</p>
              </div>
            </div>

            {/* Graph area */}
            <div className="h-40 flex items-end gap-3 justify-around pb-2 border-b border-stone-100 relative pt-6">
              <div className="absolute top-1/4 left-0 w-full border-t border-dashed border-stone-100 h-px" />
              <div className="absolute top-2/4 left-0 w-full border-t border-dashed border-stone-100 h-px" />
              <div className="absolute top-3/4 left-0 w-full border-t border-dashed border-stone-100 h-px" />

              {/* Bar 1 */}
              <div className="w-1/4 flex flex-col items-center">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: '40%' }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                  className="w-full bg-stone-100 hover:bg-stone-200 transition-colors rounded-t-lg relative group"
                >
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-stone-600 bg-stone-100 border border-stone-200/60 px-1.5 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">420</span>
                </motion.div>
                <span className="text-[9px] font-bold text-stone-400 mt-2 uppercase tracking-wide">Wk 1</span>
              </div>

              {/* Bar 2 */}
              <div className="w-1/4 flex flex-col items-center">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: '46%' }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.35 }}
                  className="w-full bg-stone-100 hover:bg-stone-200 transition-colors rounded-t-lg relative group"
                >
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-stone-600 bg-stone-100 border border-stone-200/60 px-1.5 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">480</span>
                </motion.div>
                <span className="text-[9px] font-bold text-stone-400 mt-2 uppercase tracking-wide">Wk 2</span>
              </div>

              {/* Bar 3 */}
              <div className="w-1/4 flex flex-col items-center">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: '49%' }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
                  className="w-full bg-stone-100 hover:bg-stone-200 transition-colors rounded-t-lg relative group"
                >
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-stone-600 bg-stone-100 border border-stone-200/60 px-1.5 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">510</span>
                </motion.div>
                <span className="text-[9px] font-bold text-stone-400 mt-2 uppercase tracking-wide">Wk 3</span>
              </div>

              {/* Bar 4 (Easter Peak) */}
              <div className="w-1/4 flex flex-col items-center">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: '85%' }}
                  transition={{ duration: 1.2, type: 'spring', stiffness: 80, damping: 15, delay: 0.65 }}
                  className="w-full bg-[#4F6EF7] hover:bg-[#3D5BD4] transition-colors rounded-t-lg relative group shadow-[0_-4px_16px_rgba(79,110,247,0.2)]"
                >
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white bg-[#4F6EF7] px-1.5 py-0.5 rounded shadow shadow-[#4F6EF7]/20">763</span>
                </motion.div>
                <span className="text-[9px] font-black text-[#4F6EF7] mt-2 uppercase tracking-wide">Easter</span>
              </div>
            </div>
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
