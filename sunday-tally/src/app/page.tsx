'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, BarChart3, Bot, Database } from 'lucide-react'
import { ParticleNetwork } from '@/components/ParticleNetwork'

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  })

  // 3D Scroll transforms
  const rotateX = useTransform(scrollYProgress, [0, 0.5], [25, 0])
  const scale = useTransform(scrollYProgress, [0, 0.5], [0.8, 1])
  const opacity = useTransform(scrollYProgress, [0, 0.3], [0, 1])

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-[#FAFAFA]">
        <div className="absolute inset-0 z-0">
          <ParticleNetwork />
        </div>

        <div className="container mx-auto px-4 md:px-8 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-block py-1 px-3 rounded-full bg-stone-100 border border-stone-200 text-stone-600 text-sm font-medium mb-6">
                Spreadsheets are dead.
              </span>
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-stone-900 mb-8 leading-tight">
                Stop guessing. <br className="hidden md:block" />
                Know your numbers.
              </h1>
              <p className="text-xl text-stone-500 mb-10 max-w-2xl mx-auto leading-relaxed">
                Most church software traps your data in rigid reports. We built an AI that actually understands your ministry. It imports your old spreadsheets. It builds custom dashboards on command. It answers hard questions instantly.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link 
                  href="/auth/login" 
                  className="w-full sm:w-auto rounded-full bg-stone-900 px-8 py-4 text-base font-semibold text-white shadow-lg hover:bg-stone-800 transition-all hover:scale-105 flex items-center justify-center gap-2"
                >
                  Start your 45-day free trial
                  <ArrowRight size={18} />
                </Link>
                <Link 
                  href="/features" 
                  className="w-full sm:w-auto rounded-full bg-white border border-stone-200 px-8 py-4 text-base font-semibold text-stone-900 shadow-sm hover:bg-stone-50 transition-all flex items-center justify-center"
                >
                  See how it works
                </Link>
              </div>
            </motion.div>
          </div>
        </div>

        {/* 3D Dashboard Mockup / Parallax Element */}
        <div ref={containerRef} className="mt-20 relative max-w-5xl mx-auto px-4 [perspective:2000px] z-10">
          <motion.div 
            style={{ rotateX, scale, opacity }}
            className="relative rounded-2xl border border-stone-200 bg-white/40 p-2 backdrop-blur-xl shadow-2xl shadow-stone-200/50 overflow-hidden transform-gpu"
          >
            {/* Fake browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-200 bg-stone-100">
              <div className="w-3 h-3 rounded-full bg-stone-300" />
              <div className="w-3 h-3 rounded-full bg-stone-300" />
              <div className="w-3 h-3 rounded-full bg-stone-300" />
            </div>
            {/* The "Dashboard" mock */}
            <div className="bg-white p-6 md:p-10 aspect-video relative overflow-hidden flex flex-col gap-6 rounded-b-xl border border-t-0 border-stone-200">
               <div className="flex justify-between items-center">
                 <div className="h-8 w-48 bg-stone-100 rounded-md animate-pulse" />
                 <div className="h-8 w-32 bg-stone-100 rounded-full" />
               </div>
               <div className="grid grid-cols-3 gap-6">
                 <div className="h-32 bg-stone-50 rounded-xl border border-stone-100" />
                 <div className="h-32 bg-stone-50 rounded-xl border border-stone-100" />
                 <div className="h-32 bg-stone-50 rounded-xl border border-stone-100" />
               </div>
               <div className="flex-1 bg-stone-50 rounded-xl border border-stone-100 flex items-center justify-center">
                  <BarChart3 className="text-stone-300 w-16 h-16 opacity-50" />
               </div>
               
               {/* Floating AI Widget Overlay */}
               <motion.div 
                 className="absolute bottom-8 right-8 w-72 bg-white/90 border border-stone-200 rounded-2xl p-4 shadow-xl backdrop-blur-xl"
                 animate={{ y: [0, -10, 0] }}
                 transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
               >
                 <div className="flex items-center gap-3 mb-3">
                   <div className="bg-stone-900 p-2 rounded-lg"><Bot size={16} className="text-white" /></div>
                   <span className="text-sm font-semibold text-stone-900">AI Assistant</span>
                 </div>
                 <div className="bg-stone-100 rounded-lg p-3 mb-2">
                   <p className="text-xs text-stone-600">How does Q3 giving compare to last year?</p>
                 </div>
                 <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                   <p className="text-xs text-stone-600">Giving is up 14.2% compared to Q3 last year, largely driven by a spike in online generosity in August.</p>
                 </div>
               </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Bento Grid */}
      <section className="py-32 bg-[#FAFAFA] relative border-t border-stone-200">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-bold text-stone-900 mb-6 tracking-tighter">Math is boring. Let the AI do it.</h2>
            <p className="text-xl text-stone-500 max-w-2xl mx-auto">We handle the complex calculations. You lead the church.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-6xl mx-auto">
            
            {/* Bento Item 1 - Large Span */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
              className="md:col-span-8 bg-white border border-stone-200 shadow-sm hover:shadow-md rounded-[2rem] p-8 md:p-12 transition-all flex flex-col md:flex-row items-center gap-12 group overflow-hidden relative"
            >
              <div className="flex-1 relative z-10">
                <div className="w-12 h-12 bg-stone-100 text-stone-900 rounded-xl flex items-center justify-center mb-8 border border-stone-200">
                  <Database size={24} />
                </div>
                <h3 className="text-3xl font-bold text-stone-900 mb-4 tracking-tight">Instant Imports</h3>
                <p className="text-stone-500 text-lg leading-relaxed">
                  Give us your massive Google Sheet. Our AI reads the columns, maps the fields, and imports years of history in seconds. It never complains.
                </p>
              </div>
              <div className="w-full md:w-1/2 aspect-square relative rounded-2xl overflow-hidden border border-stone-100 bg-stone-50 group-hover:scale-105 transition-transform duration-700">
                 <ParticleNetwork />
              </div>
            </motion.div>

            {/* Bento Item 2 - Tall Span */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
              className="md:col-span-4 md:row-span-2 bg-white border border-stone-200 shadow-sm hover:shadow-md rounded-[2rem] p-8 md:p-12 transition-all flex flex-col group overflow-hidden relative"
            >
              <div className="w-full aspect-square relative rounded-2xl overflow-hidden border border-stone-100 bg-stone-50 mb-10 group-hover:scale-105 transition-transform duration-700">
                 <ParticleNetwork />
              </div>
              <div className="relative z-10 mt-auto">
                <div className="w-12 h-12 bg-stone-100 text-stone-900 rounded-xl flex items-center justify-center mb-6 border border-stone-200">
                  <Bot size={24} />
                </div>
                <h3 className="text-2xl font-bold text-stone-900 mb-3 tracking-tight">AI Assistant</h3>
                <p className="text-stone-500 leading-relaxed">
                  Ask complex questions about your data. The AI analyzes years of history and returns human-readable answers instantly.
                </p>
              </div>
            </motion.div>

            {/* Bento Item 3 - Wide bottom */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}
              className="md:col-span-8 bg-white border border-stone-200 shadow-sm hover:shadow-md rounded-[2rem] p-8 md:p-12 transition-all flex flex-col md:flex-row-reverse items-center gap-12 group overflow-hidden relative"
            >
              <div className="flex-1 relative z-10">
                <div className="w-12 h-12 bg-stone-100 text-stone-900 rounded-xl flex items-center justify-center mb-8 border border-stone-200">
                  <BarChart3 size={24} />
                </div>
                <h3 className="text-3xl font-bold text-stone-900 mb-4 tracking-tight">Custom Dashboards</h3>
                <p className="text-stone-500 text-lg leading-relaxed">
                  Tell the AI what you want to see. It builds the exact chart you need right in front of you. No pre-packaged templates required.
                </p>
              </div>
              <div className="w-full md:w-1/2 aspect-video md:aspect-square relative rounded-2xl overflow-hidden border border-stone-100 bg-stone-50 group-hover:scale-105 transition-transform duration-700">
                 <ParticleNetwork />
              </div>
            </motion.div>

          </div>
        </div>
      </section>
      
      {/* Final CTA */}
      <section className="py-24 relative overflow-hidden bg-white border-t border-stone-200">
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold text-stone-900 mb-6 tracking-tight">See your church clearly.</h2>
          <p className="text-xl text-stone-500 mb-10">Throw out the spreadsheets. Get answers.</p>
          <Link 
            href="/auth/login" 
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-8 py-4 text-lg font-bold text-white hover:bg-stone-800 shadow-lg transition-all hover:scale-105"
          >
            Start your free trial today <ArrowRight size={20} />
          </Link>
        </div>
      </section>
    </div>
  )
}
