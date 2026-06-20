'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, BarChart3, Bot, Zap, Database, CheckCircle2 } from 'lucide-react'

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
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] opacity-40 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-sky-400 blur-[120px] rounded-full mix-blend-screen" />
        </div>

        <div className="container mx-auto px-4 md:px-8 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-block py-1 px-3 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-6">
                Spreadsheets are dead.
              </span>
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-8 leading-tight">
                Stop guessing. <br className="hidden md:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-sky-300">
                  Know your numbers.
                </span>
              </h1>
              <p className="text-xl text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                Most church software traps your data in rigid reports. We built an AI that actually understands your ministry. It imports your old spreadsheets. It builds custom dashboards on command. It answers hard questions instantly.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link 
                  href="/auth/login" 
                  className="w-full sm:w-auto rounded-full bg-white px-8 py-4 text-base font-semibold text-black shadow-lg hover:bg-zinc-200 transition-all hover:scale-105 flex items-center justify-center gap-2"
                >
                  Start your 45-day free trial
                  <ArrowRight size={18} />
                </Link>
                <Link 
                  href="/features" 
                  className="w-full sm:w-auto rounded-full bg-zinc-900 border border-white/10 px-8 py-4 text-base font-semibold text-white hover:bg-zinc-800 transition-all flex items-center justify-center"
                >
                  See how it works
                </Link>
              </div>
            </motion.div>
          </div>
        </div>

        {/* 3D Dashboard Mockup / Parallax Element */}
        <div ref={containerRef} className="mt-20 relative max-w-5xl mx-auto px-4 [perspective:2000px]">
          <motion.div 
            style={{ rotateX, scale, opacity }}
            className="relative rounded-2xl border border-white/10 bg-black/40 p-2 backdrop-blur-xl shadow-2xl shadow-blue-500/20 overflow-hidden transform-gpu"
          >
            {/* Fake browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-zinc-950/80">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            {/* The "Dashboard" mock */}
            <div className="bg-black p-6 md:p-10 aspect-video relative overflow-hidden flex flex-col gap-6 rounded-b-xl border border-t-0 border-white/5">
               <div className="flex justify-between items-center">
                 <div className="h-8 w-48 bg-zinc-800 rounded-md animate-pulse" />
                 <div className="h-8 w-32 bg-blue-600/20 rounded-full" />
               </div>
               <div className="grid grid-cols-3 gap-6">
                 <div className="h-32 bg-zinc-900/50 rounded-xl border border-white/5" />
                 <div className="h-32 bg-zinc-900/50 rounded-xl border border-white/5" />
                 <div className="h-32 bg-zinc-900/50 rounded-xl border border-white/5" />
               </div>
               <div className="flex-1 bg-zinc-900/30 rounded-xl border border-white/5 flex items-center justify-center">
                  <BarChart3 className="text-zinc-700 w-16 h-16 opacity-50" />
               </div>
               
               {/* Floating AI Widget Overlay */}
               <motion.div 
                 className="absolute bottom-8 right-8 w-72 bg-zinc-900/90 border border-blue-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-xl"
                 animate={{ y: [0, -10, 0] }}
                 transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
               >
                 <div className="flex items-center gap-3 mb-3">
                   <div className="bg-blue-600 p-2 rounded-lg"><Bot size={16} className="text-white" /></div>
                   <span className="text-sm font-semibold text-white">AI Assistant</span>
                 </div>
                 <div className="bg-zinc-800 rounded-lg p-3 mb-2">
                   <p className="text-xs text-zinc-300">How does Q3 giving compare to last year?</p>
                 </div>
                 <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                   <p className="text-xs text-blue-300">Giving is up 14.2% compared to Q3 last year, largely driven by a spike in online generosity in August.</p>
                 </div>
               </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Bento Grid */}
      <section className="py-32 bg-black relative border-t border-white/5">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tighter">Math is boring. Let the AI do it.</h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">We handle the complex calculations. You lead the church.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-6xl mx-auto">
            
            {/* Bento Item 1 - Large Span */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
              className="md:col-span-8 bg-zinc-900/20 border border-white/5 rounded-[2rem] p-8 md:p-12 hover:bg-zinc-900/40 hover:border-white/10 transition-all flex flex-col md:flex-row items-center gap-12 group overflow-hidden relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex-1 relative z-10">
                <div className="w-12 h-12 bg-white/5 text-white rounded-xl flex items-center justify-center mb-8 border border-white/10">
                  <Database size={24} />
                </div>
                <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">Instant Imports</h3>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  Give us your massive Google Sheet. Our AI reads the columns, maps the fields, and imports years of history in seconds. It never complains.
                </p>
              </div>
              <div className="w-full md:w-1/2 aspect-square relative rounded-2xl overflow-hidden border border-white/5 bg-black group-hover:scale-105 transition-transform duration-700">
                 <Image src="/data_core.png" fill alt="Database Core" className="object-cover opacity-80" />
              </div>
            </motion.div>

            {/* Bento Item 2 - Tall Span */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
              className="md:col-span-4 md:row-span-2 bg-zinc-900/20 border border-white/5 rounded-[2rem] p-8 md:p-12 hover:bg-zinc-900/40 hover:border-white/10 transition-all flex flex-col group overflow-hidden relative"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-full aspect-square relative rounded-2xl overflow-hidden border border-white/5 bg-black mb-10 group-hover:scale-105 transition-transform duration-700">
                 <Image src="/ai_brain.png" fill alt="AI Brain" className="object-cover opacity-80" />
              </div>
              <div className="relative z-10 mt-auto">
                <div className="w-12 h-12 bg-white/5 text-white rounded-xl flex items-center justify-center mb-6 border border-white/10">
                  <Bot size={24} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3 tracking-tight">AI Assistant</h3>
                <p className="text-zinc-400 leading-relaxed">
                  Ask complex questions about your data. The AI analyzes years of history and returns human-readable answers instantly.
                </p>
              </div>
            </motion.div>

            {/* Bento Item 3 - Wide bottom */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}
              className="md:col-span-8 bg-zinc-900/20 border border-white/5 rounded-[2rem] p-8 md:p-12 hover:bg-zinc-900/40 hover:border-white/10 transition-all flex flex-col md:flex-row-reverse items-center gap-12 group overflow-hidden relative"
            >
              <div className="absolute inset-0 bg-gradient-to-bl from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex-1 relative z-10">
                <div className="w-12 h-12 bg-white/5 text-white rounded-xl flex items-center justify-center mb-8 border border-white/10">
                  <BarChart3 size={24} />
                </div>
                <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">Custom Dashboards</h3>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  Tell the AI what you want to see. It builds the exact chart you need right in front of you. No pre-packaged templates required.
                </p>
              </div>
              <div className="w-full md:w-1/2 aspect-video md:aspect-square relative rounded-2xl overflow-hidden border border-white/5 bg-black group-hover:scale-105 transition-transform duration-700">
                 <Image src="/chart_abstract.png" fill alt="Abstract Chart" className="object-cover opacity-80" />
              </div>
            </motion.div>

          </div>
        </div>
      </section>
      
      {/* Final CTA */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-blue-900/10" />
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">See your church clearly.</h2>
          <p className="text-xl text-blue-200 mb-10">Throw out the spreadsheets. Get answers.</p>
          <Link 
            href="/auth/login" 
            className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-lg font-bold text-black hover:bg-zinc-200 transition-all hover:scale-105"
          >
            Start your free trial today <ArrowRight size={20} />
          </Link>
        </div>
      </section>
    </div>
  )
}
