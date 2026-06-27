'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, BarChart3, Bot, Database, CheckCircle2 } from 'lucide-react'
import { ParticleNetwork } from '@/components/ParticleNetwork'
import { CometCosmos } from '@/components/CometCosmos'
import { WidgetCard, type ReplayWidget } from '@/components/widgets/ui'
import snapshotData from './dashboard_snapshot.json'

function useCountUp(target: number, trigger: boolean, duration: number = 1000) {
  const [count, setCount] = useState(0)
  
  useEffect(() => {
    if (!trigger) {
      setCount(0)
      return
    }
    
    let startTime: number | null = null
    let animationFrame: number
    
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = timestamp - startTime
      const percentage = Math.min(progress / duration, 1)
      const easeOut = percentage === 1 ? 1 : 1 - Math.pow(2, -10 * percentage)
      
      setCount(Math.floor(target * easeOut))
      
      if (percentage < 1) {
        animationFrame = requestAnimationFrame(animate)
      } else {
        setCount(target)
      }
    }
    
    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [target, trigger, duration])
  
  return count
}


function HoverWord({ children, baseClass = "text-stone-900" }: { children: React.ReactNode, baseClass?: string }) {
  return (
    <span className="group relative inline-block cursor-default">
      <span className={`${baseClass} transition-colors duration-500 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-[#4F6EF7] group-hover:to-[#06B6D4]`}>
        {children}
      </span>
    </span>
  )
}

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 })
  const heroRef = useRef<HTMLDivElement>(null)
  const [isDashboardHovered, setIsDashboardHovered] = useState(false)

  const attendanceCount = useCountUp(763, isDashboardHovered, 1500)
  const volunteersCount = useCountUp(114, isDashboardHovered, 1500)
  const guestsCount = useCountUp(42, isDashboardHovered, 1500)
  const decisionsCount = useCountUp(4, isDashboardHovered, 1500)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect()
        setMousePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

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
      <header className="absolute top-0 inset-x-0 z-50">
        <nav className="container mx-auto px-4 md:px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center font-extrabold text-xl shadow-md">
              S
            </div>
            <span className="text-2xl font-bold tracking-tight text-stone-900">SundayTally</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors">
              Features
            </Link>
            <Link href="/auth/login" className="text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors">
              Log in
            </Link>
            <Link href="/auth/login" className="px-5 py-2.5 rounded-full bg-stone-900 text-white text-sm font-bold hover:bg-[#4F6EF7] transition-all hover:-translate-y-0.5 shadow-sm">
              Start free trial
            </Link>
          </div>
        </nav>
      </header>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-[#FAFAFA]">
        <div className="absolute inset-0 z-0">
          <ParticleNetwork />
        </div>

        <div className="container mx-auto px-4 md:px-8 relative z-10">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-12 lg:gap-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex-1 text-left"
            >
              <span className="inline-block py-1.5 px-4 rounded-full bg-stone-100 border border-stone-200 text-stone-600 text-sm font-semibold mb-6">
                Simple Analytics for Growing Churches
              </span>
              <div ref={heroRef} className="relative block text-left w-full group">
                <h1 className="text-6xl md:text-8xl lg:text-[110px] font-extrabold tracking-tighter text-stone-900 mb-4 pb-4 leading-[1.05] relative z-10">
                  Stop guessing.
                  <br className="hidden lg:block" />
                  <span className="text-stone-300 font-['Playfair_Display'] italic font-black tracking-tighter text-[0.95em] block md:inline-block">Reveal thy numbers.</span>
                </h1>
                <span aria-hidden="true" className="absolute inset-0 text-6xl md:text-8xl lg:text-[110px] font-extrabold tracking-tighter leading-[1.05] mb-4 pb-4 pointer-events-none select-none text-transparent bg-clip-text bg-gradient-to-r from-[#4F6EF7] via-[#06B6D4] to-[#10B981] z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      WebkitMaskImage: `radial-gradient(circle 500px at ${mousePos.x}px ${mousePos.y}px, black 20%, transparent 80%)`,
                      maskImage: `radial-gradient(circle 500px at ${mousePos.x}px ${mousePos.y}px, black 20%, transparent 80%)`
                    }}>
                  Stop guessing.
                  <br className="hidden lg:block" />
                  <span className="font-['Playfair_Display'] italic font-black tracking-tighter text-[0.95em] block md:inline-block">Reveal thy numbers.</span>
                </span>
              </div>
              <p className="text-lg md:text-xl lg:text-2xl text-stone-500 mb-0 max-w-xl leading-relaxed font-medium">
                Built specifically for your ministry. Instantly track attendance for adults, youth, kids, and volunteers, monitor giving, and build a custom dashboard that fits your church's needs.
              </p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col gap-5 w-full lg:w-auto shrink-0 lg:ml-auto"
            >
              <Link 
                href="/auth/login" 
                className="w-full sm:w-auto rounded-full bg-stone-900 px-10 py-5 text-xl font-bold text-white shadow-lg hover:bg-[#4F6EF7] hover:shadow-[#4F6EF7]/40 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] flex items-center justify-center gap-3 group"
              >
                Start your 45-day free trial
                <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link 
                href="#features" 
                className="w-full sm:w-auto rounded-full bg-white border-2 border-stone-200 px-10 py-5 text-lg font-bold text-stone-900 shadow-sm hover:bg-stone-50 hover:border-stone-300 transition-all flex items-center justify-center"
              >
                See how it works
              </Link>
              <div className="text-center mt-1">
                <span className="text-stone-500 font-medium">Already have an account? </span>
                <Link href="/auth/login" className="text-stone-900 font-bold hover:text-[#4F6EF7] transition-colors">
                  Log in
                </Link>
              </div>
            </motion.div>
          </div>
        </div>

        {/* 3D Dashboard Mockup / Parallax Element */}
        <div ref={containerRef} className="mt-20 relative max-w-5xl mx-auto px-4 [perspective:2000px] z-10">
          <motion.div 
            style={{ rotateX, scale, opacity }}
            initial={{ rotateX: 25, scale: 0.8, opacity: 0 }}
            className="relative rounded-2xl border border-stone-200 bg-white/40 p-2 backdrop-blur-xl shadow-2xl shadow-stone-200/50 overflow-hidden transform-gpu"
          >
            {/* Fake browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-200 bg-stone-100">
              <div className="w-3 h-3 rounded-full bg-stone-300" />
              <div className="w-3 h-3 rounded-full bg-stone-300" />
              <div className="w-3 h-3 rounded-full bg-stone-300" />
            </div>
            {/* The "Dashboard" mock */}
            <div 
              onMouseEnter={() => setIsDashboardHovered(true)}
              onMouseLeave={() => setIsDashboardHovered(false)}
              className="bg-[#FCFCFC] p-6 md:p-10 aspect-video relative overflow-hidden flex flex-col gap-6 rounded-b-xl border border-t-0 border-stone-200 shadow-inner group grayscale hover:grayscale-0 transition-all duration-700"
            >
               <div className="flex justify-between items-center mb-2">
                 <div>
                   <h2 className="text-xl font-bold text-stone-900 tracking-tight">Main Campus Dashboard</h2>
                   <p className="text-sm text-stone-500 font-medium">April 5, 2026 (Easter Sunday)</p>
                 </div>
                 <div className="h-8 px-4 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 font-semibold text-sm rounded-full flex items-center shadow-sm">
                   +14.2% Growth
                 </div>
               </div>
               
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-sm flex flex-col justify-center">
                   <p className="text-sm text-stone-500 font-medium mb-1">Total Attendance</p>
                   <div className="flex items-end gap-2">
                     <p className="text-3xl md:text-4xl font-extrabold text-[#4F6EF7] transition-colors group-hover:text-[#4F6EF7]">{attendanceCount}</p>
                     <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center mb-1 border border-emerald-100">↑ 14%</span>
                   </div>
                 </div>
                 <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-sm flex flex-col justify-center">
                   <p className="text-sm text-stone-500 font-medium mb-1">Total Volunteers</p>
                   <div className="flex items-end gap-2">
                     <p className="text-3xl md:text-4xl font-extrabold text-[#06B6D4] transition-colors group-hover:text-[#06B6D4]">{volunteersCount}</p>
                     <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center mb-1 border border-emerald-100">↑ 5%</span>
                   </div>
                 </div>
                 <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-sm flex flex-col justify-center">
                   <p className="text-sm text-stone-500 font-medium mb-1">First Time Guests</p>
                   <div className="flex items-end gap-2">
                     <p className="text-3xl md:text-4xl font-extrabold text-[#F59E0B] transition-colors group-hover:text-[#F59E0B]">{guestsCount}</p>
                     <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded flex items-center mb-1 border border-rose-100">↓ 2%</span>
                   </div>
                 </div>
                 <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-sm flex flex-col justify-center">
                   <p className="text-sm text-stone-500 font-medium mb-1">Decisions / Hands</p>
                   <div className="flex items-end gap-2">
                     <p className="text-3xl md:text-4xl font-extrabold text-[#10B981] transition-colors group-hover:text-[#10B981]">{decisionsCount}</p>
                     <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center mb-1 border border-emerald-100">↑ 1</span>
                   </div>
                 </div>
               </div>

               <div className="flex-1 bg-white rounded-xl border border-stone-200 shadow-sm p-6 relative overflow-hidden flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                    <p className="font-semibold text-stone-900">Attendance Breakdown</p>
                  </div>
                  {/* Fake Tremor-style Area/Bar Chart rendering */}
                  <div className="flex-1 flex items-end gap-4 justify-around pb-6 pt-12 relative w-full border-b border-stone-200">
                     <div className="absolute top-0 left-0 w-full border-t border-dashed border-stone-200 h-px"></div>
                     <div className="absolute top-1/2 left-0 w-full border-t border-dashed border-stone-200 h-px"></div>
                     <motion.div initial={{ height: "0%" }} animate={{ height: isDashboardHovered ? "30%" : "0%" }} transition={{ duration: 1, type: "spring", delay: 0.1 }} className="w-1/4 bg-blue-100/50 hover:bg-blue-100 transition-colors rounded-t-sm relative border-t-2 border-blue-400">
                       <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-bold text-stone-600 bg-white px-2 py-1 shadow-sm rounded-md border border-stone-100 opacity-0 group-hover:opacity-100 transition-opacity">220</span>
                       <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-stone-400 w-max">Mar 15</span>
                     </motion.div>
                     <motion.div initial={{ height: "0%" }} animate={{ height: isDashboardHovered ? "45%" : "0%" }} transition={{ duration: 1, type: "spring", delay: 0.2 }} className="w-1/4 bg-blue-100/50 hover:bg-blue-100 transition-colors rounded-t-sm relative border-t-2 border-blue-400">
                       <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-bold text-stone-600 bg-white px-2 py-1 shadow-sm rounded-md border border-stone-100 opacity-0 group-hover:opacity-100 transition-opacity">284</span>
                       <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-stone-400 w-max">Mar 22</span>
                     </motion.div>
                     <motion.div initial={{ height: "0%" }} animate={{ height: isDashboardHovered ? "40%" : "0%" }} transition={{ duration: 1, type: "spring", delay: 0.3 }} className="w-1/4 bg-blue-100/50 hover:bg-blue-100 transition-colors rounded-t-sm relative border-t-2 border-blue-400">
                       <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-bold text-stone-600 bg-white px-2 py-1 shadow-sm rounded-md border border-stone-100 opacity-0 group-hover:opacity-100 transition-opacity">255</span>
                       <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-stone-400 w-max">Mar 29</span>
                     </motion.div>
                     <motion.div initial={{ height: "0%" }} animate={{ height: isDashboardHovered ? "100%" : "0%" }} transition={{ duration: 1.5, type: "spring", delay: 0.4 }} className="w-1/4 bg-blue-500/20 hover:bg-blue-500/30 transition-colors rounded-t-sm relative border-t-2 border-[#4F6EF7] shadow-[0_-5px_15px_rgba(79,110,247,0.1)]">
                       <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-sm font-bold text-white bg-[#4F6EF7] px-2 py-1 shadow-md rounded-md">763</span>
                       <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-stone-900 w-max">Apr 5</span>
                     </motion.div>
                  </div>
               </div>
               
               {/* Floating AI Widget Overlay */}
               <motion.div 
                 className="absolute bottom-8 right-8 w-80 bg-white/95 border border-stone-200 rounded-2xl p-5 shadow-2xl backdrop-blur-xl"
                 initial={{ x: 50, opacity: 0 }}
                 animate={{ 
                   x: isDashboardHovered ? 0 : 50, 
                   opacity: isDashboardHovered ? 1 : 0,
                 }}
                 transition={{ duration: 1.2, type: "tween", ease: "easeOut", delay: 2.8 }}
               >
                 <div className="flex items-center gap-3 mb-4">
                   <div className="bg-stone-900 p-2 rounded-lg"><Bot size={18} className="text-white" /></div>
                   <span className="text-sm font-bold text-stone-900 tracking-tight">AI Insights</span>
                 </div>
                 <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                   <p className="text-sm text-stone-700 leading-relaxed font-medium">Easter Sunday saw a massive spike! You hit <span className="font-bold text-stone-900">763 total attendance</span> across all campuses. That's up <span className="text-green-600 font-bold">14.2%</span> from your previous high in August!</p>
                 </div>
               </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Social Proof (Fictional Abstract Badges for secular/general privacy) */}
      <div className="border-y border-stone-200 bg-white py-10 z-10 relative">
        <div className="container mx-auto px-4 text-center">
          <p className="text-xs font-bold tracking-widest text-stone-500 uppercase">Trusted by growing ministries</p>
        </div>
      </div>

      {/* Tally AI: Importer, Ask & Build Modes */}
      <section id="features" className="py-24 md:py-32 bg-stone-950 bg-[radial-gradient(circle_at_center,rgba(79,110,247,0.18)_0%,transparent_65%)] relative border-b border-stone-900 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <CometCosmos />
        </div>
        <div className="container mx-auto px-4 md:px-8 relative z-10 max-w-6xl">
          <div className="text-center mb-16 md:mb-24">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-tighter leading-none mb-6">
              Introducing Tally AI
            </h2>
            <p className="text-lg md:text-xl lg:text-2xl text-[#8FA5FF] font-bold max-w-2xl mx-auto leading-normal mb-8">
              A live conversation with your data. Not a weekly report.
            </p>
            <p className="text-base md:text-lg text-stone-300 font-medium max-w-3xl mx-auto leading-relaxed">
              Tally AI is your dedicated church data assistant, active across three powerful modes. <strong className="text-white font-semibold">Instantly query your data by asking, visualize trends, and save findings as permanent dashboard widgets.</strong>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Import Mode */}
            <div className="bg-[#0D1021]/80 backdrop-blur-md p-8 rounded-3xl border border-white/[0.08] hover:border-[#4F6EF7]/60 hover:bg-[#12162E]/90 transition-all flex flex-col h-full shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
              <div className="w-12 h-12 bg-[#171C3D] border border-white/[0.1] rounded-xl flex items-center justify-center mb-6 shadow-md">
                <svg className="w-6 h-6 text-[#8FA5FF]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" />
                </svg>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-white mb-3 tracking-tight">1. Import Mode</h3>
              <p className="text-stone-400 text-sm font-medium leading-relaxed">
                Tally AI reads your spreadsheet files, uploads them, maps your structure, and sets up your metrics automatically.
              </p>
            </div>

            {/* Ask Mode */}
            <div className="bg-[#0D1021]/80 backdrop-blur-md p-8 rounded-3xl border border-white/[0.08] hover:border-[#4F6EF7]/60 hover:bg-[#12162E]/90 transition-all flex flex-col h-full shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
              <div className="w-12 h-12 bg-[#171C3D] border border-white/[0.1] rounded-xl flex items-center justify-center mb-6 shadow-md">
                <svg className="w-6 h-6 text-[#8FA5FF]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
                </svg>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-white mb-3 tracking-tight">2. Ask Mode</h3>
              <p className="text-stone-400 text-sm font-medium leading-relaxed mb-4">
                Talk to your data like a teammate.
              </p>
              <div className="border-t border-white/[0.08] pt-4 mt-auto">
                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-2">Example:</p>
                <p className="text-xs font-semibold text-[#8FA5FF] italic">"What's our volunteer-to-kids ratio over the last 8 weeks?"</p>
              </div>
            </div>

            {/* Build Mode */}
            <div className="bg-[#0D1021]/80 backdrop-blur-md p-8 rounded-3xl border border-white/[0.08] hover:border-[#4F6EF7]/60 hover:bg-[#12162E]/90 transition-all flex flex-col h-full shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
              <div className="w-12 h-12 bg-[#171C3D] border border-white/[0.1] rounded-xl flex items-center justify-center mb-6 shadow-md">
                <svg className="w-6 h-6 text-[#8FA5FF]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-white mb-3 tracking-tight">3. Build Mode</h3>
              <p className="text-stone-400 text-sm font-medium leading-relaxed">
                Build any insight or chart from your conversations and save them into your dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Onboarding & AI Importer */}
      <section className="py-24 bg-stone-50 border-b border-stone-200 relative overflow-hidden">
        <div className="container mx-auto px-4 md:px-8 max-w-6xl relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center">
            <div className="lg:col-span-5 space-y-6">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-stone-900 tracking-tighter leading-none">
                Up and running in 10 minutes.
              </h2>
              <p className="text-base md:text-lg text-stone-500 font-medium leading-relaxed">
                Our 10-minute setup promise is focused on initial configuration, not manual ongoing entries. Tally AI Import Mode and the auto-built data entry layout do the heavy lifting to get you configured immediately.
              </p>
              <div className="p-5 bg-white border border-stone-200 rounded-2xl">
                <h4 className="text-base font-bold text-stone-900 mb-1">Your data comes with you</h4>
                <p className="text-sm text-stone-600 font-medium">
                  We don't expect you to re-enter years of logs. Feed your spreadsheet exports to Tally AI Import Mode; it builds your metrics tree around how your church already operates.
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 bg-white border border-stone-200 rounded-[2rem] p-8 shadow-xl relative overflow-hidden flex flex-col gap-6">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
                <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Tally AI Import Mode</span>
              </div>
              <div className="border-2 border-dashed border-stone-250 bg-stone-50 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3">
                <svg className="w-12 h-12 text-[#4F6EF7] animate-pulse" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <span className="text-sm font-bold text-stone-900">historical_church_data.csv</span>
                <span className="text-xs text-[#4F6EF7] font-semibold">Tally AI is mapping structures and establishing layouts...</span>
              </div>
              <div className="flex justify-between items-center bg-stone-50 px-4 py-3 rounded-lg border border-stone-150">
                <span className="text-xs font-bold text-stone-700">Adults, Kids, volunteers, and Giving mapped successfully.</span>
                <span className="text-xs font-mono font-bold text-emerald-600">✓ Done</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Painless Data Entry & Standard Reports - Interactive Demo Playground */}
      <section className="py-24 md:py-32 bg-stone-950 bg-[radial-gradient(circle_at_center,rgba(79,110,247,0.18)_0%,transparent_65%)] relative border-b border-stone-900 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <CometCosmos />
        </div>
        <div className="container mx-auto px-4 md:px-8 max-w-6xl relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-tighter leading-none mb-4">
              Live Interactive Demo
            </h2>
            <h3 className="text-lg md:text-xl lg:text-2xl text-[#8FA5FF] font-extrabold tracking-tight mb-6">
              Painless weekly logs. Instantly calculated.
            </h3>
            <p className="text-base md:text-lg text-stone-300 font-medium max-w-3xl mx-auto leading-relaxed mb-6">
              Experience Sunday Tally in real time: click the <strong className="text-white font-semibold">Weekly Data Entry</strong> tab below to modify the numbers (they autosave on blur), then toggle between the <strong className="text-white font-semibold">Standard Dashboard</strong> and <strong className="text-white font-semibold">Tally AI Dashboard</strong> to see your updates calculate instantly.
            </p>
            <div className="flex justify-center">
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-[#8FA5FF] text-xs font-bold transition-all shadow-sm hover:scale-105 active:scale-[0.98] cursor-pointer"
              >
                <span>Start 45-day free trial</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            </div>
          </div>

          <div className="w-full">
            <DemoDashboard />
          </div>

          {/* Smaller Section Footer CTA */}
          <div className="mt-12 flex flex-col items-center justify-center gap-2 text-center">
            <Link
              href="/auth/login"
              className="px-6 py-3 rounded-xl bg-[#4F6EF7] hover:bg-blue-600 text-white font-bold text-sm transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer"
            >
              Start 45-day free trial
            </Link>
            <span className="text-[11px] text-stone-400 font-bold uppercase tracking-wider">No credit card required</span>
          </div>
        </div>
      </section>

      {/* Track any metric your ministry defines */}
      <section className="py-24 md:py-32 bg-stone-50 border-b border-stone-200 relative overflow-hidden">
        <div className="container mx-auto px-4 md:px-8 max-w-6xl relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-stone-900 tracking-tighter leading-none mb-6">
              Track any metric your ministry defines.
            </h2>
            <p className="text-base md:text-lg text-stone-500 font-medium max-w-3xl mx-auto leading-relaxed">
              Go beyond simple attendance. Capture the exact values that define your church's weekly momentum. If your ministry tracks it, Sunday Tally can hold it.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Standard Metrics */}
            <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm flex flex-col">
              <h3 className="text-lg md:text-xl font-bold text-stone-900 mb-6 pb-2 border-b border-stone-100">Standard Metrics</h3>
              <ul className="space-y-3.5 text-sm text-stone-600 font-medium">
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-[#4F6EF7] shrink-0" size={18} /> <span>Attendance & online viewers</span></li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-[#4F6EF7] shrink-0" size={18} /> <span>Weekly giving</span></li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-[#4F6EF7] shrink-0" size={18} /> <span>Age group demographics</span></li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-[#4F6EF7] shrink-0" size={18} /> <span>Small groups & active leaders</span></li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-[#4F6EF7] shrink-0" size={18} /> <span>Volunteer counts & Serving ratios</span></li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-[#4F6EF7] shrink-0" size={18} /> <span>Giving ratios</span></li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-[#4F6EF7] shrink-0" size={18} /> <span>Demographic ratios</span></li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-[#4F6EF7] shrink-0" size={18} /> <span>Service ratios</span></li>
              </ul>
            </div>

            {/* Spiritual Milestones */}
            <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm flex flex-col">
              <h3 className="text-lg md:text-xl font-bold text-stone-900 mb-6 pb-2 border-b border-stone-100">Spiritual Milestones</h3>
              <p className="text-xs text-stone-400 font-bold uppercase tracking-wider mb-4">Tracked as distinct categories:</p>
              <ul className="space-y-3.5 text-sm text-stone-600 font-medium">
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Salvations</span></li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Baptisms</span></li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Decisions</span></li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Next Steps</span></li>
                <li className="flex items-center gap-2.5"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Prayer Request Counts</span></li>
              </ul>
            </div>

            {/* Custom Inspiration */}
            <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm flex flex-col">
              <h3 className="text-lg md:text-xl font-bold text-stone-900 mb-6 pb-2 border-b border-stone-100">Custom Inspiration</h3>
              <p className="text-xs text-stone-400 font-bold uppercase tracking-wider mb-4">Less obvious metrics tracked by teams:</p>
              <ul className="space-y-3.5 text-sm text-stone-600 font-medium">
                <li className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-stone-450 shrink-0" /> <span>Food pantry visitors served</span></li>
                <li className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-stone-450 shrink-0" /> <span>Benevolence funding requests</span></li>
                <li className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-stone-450 shrink-0" /> <span>Parking lot vehicle counts</span></li>
                <li className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-stone-450 shrink-0" /> <span>Counseling appointment hours</span></li>
                <li className="flex items-center gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-stone-450 shrink-0" /> <span>Mission trip applications</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Redesigned Pricing Section */}
      <section className="py-24 md:py-32 bg-white relative border-b border-stone-200" id="pricing">
        <div className="container mx-auto px-4 md:px-8 max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-stone-900 mb-6 tracking-tighter">Simple pricing.</h2>
            <p className="text-base md:text-lg text-stone-500 max-w-2xl mx-auto font-medium">Get started with a 45-day free trial. No credit card required.</p>
          </div>

          {/* Base Tier Card */}
          <div className="bg-stone-50 border border-stone-200 rounded-[2rem] p-8 md:p-12 mb-20 shadow-sm flex flex-col lg:flex-row gap-12 items-center">
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-2xl md:text-3xl font-extrabold text-stone-900 mb-2">Base Platform</h3>
              <p className="text-base md:text-lg text-stone-500 mb-6 leading-relaxed">
                Everything you need to log counts, track your core metrics, and see standard reports week over week.
              </p>
              <ul className="text-stone-600 font-medium flex flex-col gap-3">
                <li className="flex items-center gap-2 justify-center md:justify-start"><CheckCircle2 className="text-[#4F6EF7]" size={20} /> Up and running in 10 minutes</li>
                <li className="flex items-center gap-2 justify-center md:justify-start"><CheckCircle2 className="text-[#4F6EF7]" size={20} /> Unlimited manual metric tracking</li>
                <li className="flex items-center gap-2 justify-center md:justify-start"><CheckCircle2 className="text-[#4F6EF7]" size={20} /> Standard reporting & core dashboards</li>
                <li className="flex items-center gap-2 justify-center md:justify-start"><CheckCircle2 className="text-[#4F6EF7]" size={20} /> Tally AI Import Mode for historical data</li>
              </ul>
            </div>
            
            <div className="w-full md:w-80 bg-[#4F6EF7] text-white p-8 rounded-[1.5rem] shadow-xl text-center shrink-0 relative overflow-hidden flex flex-col items-center justify-center transition-all hover:shadow-2xl hover:scale-[1.02]">
              <div className="inline-block bg-white/15 text-white text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-full mb-4">
                45-Day Free Trial
              </div>
              <p className="text-sm font-bold tracking-widest text-blue-200 uppercase mb-2">Per Location Base</p>
              <div className="flex justify-center items-end gap-1 mb-2">
                <span className="text-5xl font-extrabold text-white">$22</span>
                <span className="text-blue-100 font-medium pb-1">/mo</span>
              </div>
              <p className="text-xs text-blue-100/90 mb-6">Add additional campuses for $22/mo each.</p>
              <Link href="/auth/login" className="w-full bg-white hover:bg-stone-50 text-[#4F6EF7] font-bold py-4 rounded-xl transition-all shadow-md hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]">
                Start free trial
              </Link>
              <p className="text-xs text-blue-200/80 mt-4 font-medium">No credit card required.</p>
            </div>
          </div>

          {/* AI Add-ons Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center p-3 bg-blue-50 text-[#4F6EF7] rounded-2xl mb-6">
              <Bot size={32} />
            </div>
            <h3 className="text-2xl md:text-3xl font-extrabold text-stone-900 mb-4 tracking-tight">Tally AI Add-on</h3>
            <p className="text-base md:text-lg text-stone-500 max-w-3xl mx-auto leading-relaxed font-medium">
              Unlock Ask & Build modes, custom widgets, and auto-refreshing dashboards. Fully unlocked during your trial.
            </p>
          </div>

          {/* AI Add-ons Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            {/* Starter */}
            <div className="bg-white border border-stone-200 rounded-3xl p-8 shadow-sm flex flex-col">
              <p className="text-[#4F6EF7] font-bold tracking-widest uppercase text-sm mb-2">Starter</p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold text-stone-900">+$15</span>
                <span className="text-stone-500 font-medium">/mo</span>
              </div>
              <p className="text-xs text-stone-400 font-bold mb-6 pb-6 border-b border-stone-100">per church</p>
              <p className="text-stone-600 mb-8 leading-relaxed font-medium">
                <strong>Best for a single church getting started.</strong> Turn your numbers into 15 saved dashboard widgets you can read in five seconds. Just ask.
              </p>
              <ul className="flex flex-col gap-4 text-sm text-stone-600 mt-auto">
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span><strong>15</strong> Saved dashboard widgets</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Tally AI Ask & Build modes</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Auto-refreshing dashboards</span></li>
              </ul>
            </div>

            {/* Plus */}
            <div className="bg-white border-2 border-[#4F6EF7] rounded-3xl p-8 shadow-xl relative flex flex-col md:scale-105 z-10">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#4F6EF7] text-white text-xs font-bold uppercase tracking-widest py-1.5 px-4 rounded-full">
                Recommended
              </div>
              <p className="text-[#4F6EF7] font-bold tracking-widest uppercase text-sm mb-2">Plus</p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold text-stone-900">+$29</span>
                <span className="text-stone-500 font-medium">/mo</span>
              </div>
              <p className="text-xs text-stone-400 font-bold mb-6 pb-6 border-b border-stone-100">per church</p>
              <p className="text-stone-600 mb-8 leading-relaxed font-medium">
                <strong>Best for growing, multi-ministry teams.</strong> Room to grow, offering 40 saved dashboard widgets across every ministry, with the same plain-English AI.
              </p>
              <ul className="flex flex-col gap-4 text-sm text-stone-600 mt-auto">
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span><strong>40</strong> Saved dashboard widgets</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Tally AI Ask & Build modes</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Auto-refreshing dashboards</span></li>
              </ul>
            </div>

            {/* Pro */}
            <div className="bg-stone-900 border border-stone-850 rounded-3xl p-8 shadow-sm flex flex-col text-white">
              <p className="text-blue-300 font-bold tracking-widest uppercase text-sm mb-2">Pro</p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold text-white">+$49</span>
                <span className="text-stone-400 font-medium">/mo</span>
              </div>
              <p className="text-xs text-stone-550 font-bold mb-6 pb-6 border-b border-stone-800">per church</p>
              <p className="text-stone-300 mb-8 leading-relaxed font-medium">
                <strong>Best for multi-campus churches and data-driven executive teams.</strong> Unlimited widgets and our most capable AI. Built for churches that live in their data.
              </p>
              <ul className="flex flex-col gap-4 text-sm text-stone-300 mt-auto">
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-400 shrink-0" size={18} /> <span><strong>Unlimited</strong> saved widgets</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-400 shrink-0" size={18} /> <span>Tally AI Ask & Build modes</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-400 shrink-0" size={18} /> <span>Most capable AI models</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-400 shrink-0" size={18} /> <span>Multi-campus rollup support</span></li>
              </ul>
            </div>
          </div>

          {/* Compact Pricing Calculator */}
          <div className="mt-16 text-center">
            <PricingCalculator />
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 bg-stone-50 border-t border-stone-200 relative overflow-hidden" id="faq">
        <div className="container mx-auto px-4 md:px-8 max-w-4xl relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-stone-900 tracking-tighter leading-none mb-6">Frequently Asked Questions</h2>
            <p className="text-base md:text-lg text-stone-500 font-medium">Everything you need to know about Sunday Tally</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-[2rem] p-6 md:p-10 shadow-sm">
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: [
                  { '@type': 'Question', name: 'What is Tally AI Import Mode?', acceptedAnswer: { '@type': 'Answer', text: 'Tally AI Import Mode allows you to drop in historical CSV or Excel spreadsheet data from Planning Center, Church Metrics, or other ChMS tools. Tally AI automatically analyzes and structures the data, so you carry your history with you in minutes.' } },
                  { '@type': 'Question', name: 'Can we track custom metrics specific to our church?', acceptedAnswer: { '@type': 'Answer', text: 'Yes! You can define and track any custom metrics your ministry uses, such as parking counts, benevolence requests, missions applications, or food pantry items. Setup is easy, and Tally AI integrates it all.' } },
                  { '@type': 'Question', name: 'How does the 45-day free trial work?', acceptedAnswer: { '@type': 'Answer', text: 'You get full access to the Sunday Tally platform and the Tally AI add-on features for 45 days. No credit card is required to sign up. After 45 days, you can choose to subscribe to our Base plan and add-ons.' } },
                  { '@type': 'Question', name: 'Does Sunday Tally support multiple locations?', acceptedAnswer: { '@type': 'Answer', text: 'Yes! The Pro plan is designed specifically for multi-campus rollups, allowing leadership teams to see aggregated data across all locations or filter down to specific campuses.' } },
                ],
              }) }}
            />
            <FAQItem question="What is Tally AI Import Mode?" answer="Tally AI Import Mode allows you to drop in historical CSV or Excel spreadsheet data from Planning Center, Church Metrics, or other ChMS tools. Tally AI automatically analyzes and structures the data, so you carry your history with you in minutes." />
            <FAQItem question="Can we track custom metrics specific to our church?" answer="Yes! You can define and track any custom metrics your ministry uses, such as parking counts, benevolence requests, missions applications, or food pantry items. Setup is easy, and Tally AI integrates it all." />
            <FAQItem question="How does the 45-day free trial work?" answer="You get full access to the Sunday Tally platform and the Tally AI add-on features for 45 days. No credit card is required to sign up. After 45 days, you can choose to subscribe to our Base plan and add-ons." />
            <FAQItem question="Does Sunday Tally support multiple locations?" answer="Yes! The Pro plan is designed specifically for multi-campus rollups, allowing leadership teams to see aggregated data across all locations or filter down to specific campuses." />
          </div>
        </div>
      </section>

      {/* Product Roadmap Section */}
      <section className="py-24 bg-white border-t border-stone-200 relative overflow-hidden">
        <div className="container mx-auto px-4 md:px-8 max-w-4xl text-center relative z-10">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-stone-900 mb-6 tracking-tighter leading-none">Continuous Improvement</h2>
          <p className="text-base md:text-lg text-stone-500 font-medium mb-8 max-w-xl mx-auto">Our dashboard and AI layers are built to evolve with the needs of modern, data-driven ministries.</p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-stone-50 border border-stone-200 rounded-full text-xs font-semibold text-stone-600">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
            <span>Next Release: Dynamic dashboard export and printable Sunday summaries.</span>
          </div>
        </div>
      </section>

      {/* Final Dark CTA */}
      <section className="py-24 md:py-32 relative overflow-hidden bg-stone-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-blue-950/30 via-stone-950 to-stone-950 z-0"></div>
        <div className="container mx-auto px-4 text-center relative z-10 max-w-3xl">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 tracking-tighter leading-none">See your ministry clearly.</h2>
          <p className="text-lg md:text-xl lg:text-2xl text-[#8fa5ff] mb-12 font-medium">Throw out the spreadsheets. Get clarity instantly.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/auth/login" 
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#4F6EF7] px-10 py-5 text-lg font-bold text-white hover:bg-[#3d59d1] shadow-[0_0_40px_rgba(79,110,247,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Start free trial <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </section>
      <TallyChatbot />
    </div>
  )
}

const ArrowUpIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
    <path d="m5 12 7-7 7 7M12 19V5" />
  </svg>
)

const ArrowDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
    <path d="M12 5v14M5 12l7 7 7-7" />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const currencyFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

function fmtVal(n: number | null, prefix?: string, suffix?: string): string {
  if (n === null || n === undefined) return '—'
  const body = prefix === '$'
    ? currencyFormatter.format(n)
    : n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
  return `${prefix ?? ''}${body}${suffix ?? ''}`
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return <span className="font-num text-[10px] font-medium text-stone-300">—</span>
  const up = delta >= 0
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-num text-[10px] font-semibold"
      style={up ? { background: 'rgba(34,197,94,.12)', color: '#15803D' } : { background: 'rgba(245,158,11,.14)', color: '#B45309' }}
      title={up ? 'Up vs comparison window' : 'Down vs comparison window'}
    >
      {up ? <ArrowUpIcon /> : <ArrowDownIcon />}
      {up ? '+' : ''}{delta}%
    </span>
  )
}

function ColumnHeaders() {
  const cols = ['Curr Wk', 'Last 4-Wk', 'Curr YTD', 'Prior YTD']
  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-2 border-b border-stone-100 bg-stone-50/50 px-4 pt-2 pb-1.5">
      <div />
      {cols.map((col) => (
        <div key={col} className="flex justify-end">
          <span className="text-right text-[10px] font-bold uppercase tracking-wider text-stone-400">
            {col}
          </span>
        </div>
      ))}
    </div>
  )
}

interface FourColRowProps {
  label: string
  sub?: string
  w: number | null
  m4: number | null
  ytd: number | null
  priorYtd: number | null
  prefix?: string
  suffix?: string
  accentColor?: string
  indent?: boolean
}

function FourColRow({ label, sub, w, m4, ytd, priorYtd, prefix, suffix, accentColor, indent }: FourColRowProps) {
  const delta_w_m4 = (w !== null && m4 !== null && m4 > 0) ? Math.round(((w - m4) / m4) * 100) : null
  const delta_ytd_prior = (ytd !== null && priorYtd !== null && priorYtd > 0) ? Math.round(((ytd - priorYtd) / priorYtd) * 100) : null

  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-2 items-start border-b border-stone-50 px-3 py-2 transition-colors duration-200 last:border-b-0 hover:bg-stone-50/60">
      <div className={`flex items-center gap-1.5 self-center text-[12px] font-medium leading-tight text-stone-600 ${indent ? 'pl-5 text-stone-400' : 'pl-1'}`}>
        {accentColor && <span className="h-3.5 w-1 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} aria-hidden />}
        <span>
          {label}
          {sub && <span className="ml-1 text-[10px] text-stone-400">{sub}</span>}
        </span>
      </div>
      <div className="px-1 text-right">
        <p className={`font-num text-[14px] leading-tight ${indent ? 'font-medium text-stone-600' : 'font-semibold text-stone-900'}`}>{fmtVal(w, prefix, suffix)}</p>
        {!indent && <div className="mt-0.5"><DeltaBadge delta={delta_w_m4} /></div>}
      </div>
      <div className="px-1 text-right">
        <p className={`font-num text-[14px] leading-tight ${indent ? 'font-normal text-stone-400' : 'font-semibold text-stone-700'}`}>{fmtVal(m4, prefix, suffix)}</p>
      </div>
      <div className="px-1 text-right">
        <p className={`font-num text-[14px] leading-tight ${indent ? 'font-medium text-stone-500' : 'font-semibold text-stone-900'}`}>{fmtVal(ytd, prefix, suffix)}</p>
        {!indent && <div className="mt-0.5"><DeltaBadge delta={delta_ytd_prior} /></div>}
      </div>
      <div className="px-1 text-right">
        <p className={`font-num text-[14px] leading-tight ${indent ? 'font-normal text-stone-400' : 'font-semibold text-stone-700'}`}>{fmtVal(priorYtd, prefix, suffix)}</p>
      </div>
    </div>
  )
}

function CardHeader({
  label,
  role,
  accentStyle,
  suffix,
  trailing,
}: {
  label: string
  role?: string
  accentStyle?: React.CSSProperties
  suffix?: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="h-5 w-1.5 shrink-0 rounded-full" style={accentStyle} aria-hidden />
        <h3 className="truncate text-[14px] font-bold tracking-tight text-stone-900">{label}</h3>
        {role && <span className="shrink-0 text-[12px] font-medium text-stone-400">· {role}</span>}
        {suffix}
      </div>
      {trailing}
    </div>
  )
}

function KpiCard({
  label,
  value,
  prefix,
  delta,
  prior,
  accentColor,
}: {
  label: string
  value: number
  prefix?: string
  delta: number | null
  prior: number
  accentColor?: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      {accentColor && <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accentColor }} aria-hidden />}
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="font-num text-3xl font-bold leading-none tracking-tight text-stone-900">{fmtVal(value, prefix)}</p>
        <DeltaBadge delta={delta} />
      </div>
      <p className="mt-2 font-num text-[11px] text-stone-400">vs {fmtVal(prior, prefix)} last week</p>
    </div>
  )
}

function KeyMetricCard({
  label,
  value,
  prefix,
  suffix,
  m4,
  ytd,
  priorYtd,
  target,
}: {
  label: string
  value: number | null
  prefix?: string
  suffix?: string
  m4: number | null
  ytd: number | null
  priorYtd: number | null
  target?: number
}) {
  const delta = (value !== null && m4 !== null && m4 > 0) ? Math.round(((value - m4) / m4) * 100) : null
  const met = target !== undefined && value !== null && value >= target
  const pctOfTarget = target !== undefined && value !== null && target > 0 ? Math.round((value / target) * 100) : null

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{label}</p>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="font-num text-2xl font-bold leading-none tracking-tight text-stone-900">{fmtVal(value, prefix, suffix)}</p>
        <DeltaBadge delta={delta} />
      </div>
      <div className="mt-2 flex items-center justify-between font-num text-[11px] text-stone-400">
        <span>4-wk <span className="font-semibold text-stone-900">{fmtVal(m4, prefix, suffix)}</span></span>
        <span>YTD <span className="font-semibold text-stone-900">{fmtVal(ytd, prefix, suffix)}</span></span>
        <span>Prior <span className="font-semibold text-stone-900">{fmtVal(priorYtd, prefix, suffix)}</span></span>
      </div>

      {target !== undefined && (
        <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2 font-num text-[11px]">
          <span className="text-stone-400">Target <span className="font-semibold text-stone-750">{fmtVal(target, prefix, suffix)}</span></span>
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={met ? { background: 'rgba(34,197,94,.12)', color: '#15803D' } : { background: 'rgba(245,158,11,.14)', color: '#B45309' }}
            title={met ? 'At or above target' : 'Below target'}
          >
            {met ? (
              <span className="flex items-center gap-0.5">
                <CheckIcon /> met
              </span>
            ) : (
              <span>{pctOfTarget}% of target</span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

function DashHeader() {
  return (
    <header className="border-b border-stone-200 bg-white rounded-t-[2rem]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl font-num text-sm font-bold text-white shadow-sm" style={{ background: '#4F6EF7' }}>ST</span>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#3D5BD4]">MAIN CAMPUS DASHBOARD</div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold leading-tight tracking-tight text-stone-900">SundayTally Demo Church</h2>
              <span title="Campus is selected on the Locations page" className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[12px] font-semibold text-stone-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[#4F6EF7]"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                Main Campus
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 font-num text-[11px] font-medium text-stone-500">
            All Campuses
          </span>
          <span className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 font-num text-[11px] font-medium text-stone-500">
            Sunday, May 24, 2026
          </span>
        </div>
      </div>
    </header>
  )
}

function DemoField({
  id,
  label,
  value,
  prefix,
  needs,
  indent,
  onCommit,
}: {
  id: string
  label: string
  value: number | null
  prefix?: string
  needs?: boolean
  indent?: boolean
  onCommit: (val: number | null) => void
}) {
  const [val, setVal] = useState<string>(value === null || value === undefined ? '' : String(value))
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    setVal(value === null || value === undefined ? '' : String(value))
  }, [value])

  const empty = val.trim() === ''
  const showNeeds = empty && needs && saved !== 'saving'

  const commit = () => {
    const parsed = empty ? null : parseFloat(val)
    if (parsed !== null && !Number.isFinite(parsed)) return
    const prior = value === null || value === undefined ? null : value
    if (parsed === prior) {
      setSaved('idle')
      return
    }
    setSaved('saving')
    setTimeout(() => {
      onCommit(parsed)
      setSaved('saved')
    }, 400)
  }

  return (
    <div className={`group flex items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-stone-50 ${indent ? 'pl-8' : ''}`}>
      <label htmlFor={id} className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-stone-700">{label}</span>
      </label>
      <div className="flex items-center gap-2.5">
        <span className="flex w-[88px] items-center justify-end gap-1 text-[11px]" aria-live="polite">
          {showNeeds ? (
            <span className="font-medium text-[#B45309]">Needs entry</span>
          ) : saved === 'saving' ? (
            <span className="text-slate-400">Saving…</span>
          ) : saved === 'saved' ? (
            <div className="flex items-center gap-1 text-[#15803D]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-[#22C55E]">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span className="font-medium">Saved</span>
            </div>
          ) : null}
        </span>
        <div className="relative">
          {prefix && (
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-num text-sm text-stone-400">
              {prefix}
            </span>
          )}
          <input
            id={id}
            type="number"
            inputMode="numeric"
            placeholder="—"
            value={val}
            onChange={(e) => {
              setVal(e.target.value)
              setSaved('idle')
            }}
            onBlur={commit}
            className={`font-num h-10 w-28 rounded-lg border bg-white text-right text-[15px] text-slate-900 shadow-sm outline-none transition placeholder:text-stone-300 focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/25 focus-visible:border-[#4F6EF7] ${
              showNeeds
                ? 'border-[#F59E0B]/60 ring-1 ring-[#F59E0B]/20'
                : 'border-stone-200'
            } ${prefix ? 'pl-7 pr-3' : 'px-3'}`}
          />
        </div>
      </div>
    </div>
  )
}

function DemoVolunteersGroup({
  label,
  total,
  isOpenDefault = true,
  children,
}: {
  label: string
  total: number
  isOpenDefault?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(isOpenDefault)
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors duration-200 hover:bg-white"
      >
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-stone-700">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 text-stone-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
          {label}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-num text-base font-semibold text-stone-900">{total}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-stone-400">calculated</span>
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 border-t border-slate-100 pt-1">
          {children}
        </div>
      )}
    </div>
  )
}

function DemoMinistryCard({
  name,
  role,
  accentClass,
  status,
  children,
}: {
  name: string
  role: string
  accentClass: string
  status: 'complete' | 'empty'
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={`h-7 w-1.5 rounded-full ${accentClass}`} aria-hidden />
          <h3 className="text-[17px] font-bold tracking-tight text-stone-900">{name}</h3>
          <span className="text-[13px] font-medium text-stone-400">· {role}</span>
        </div>
        <div className="flex items-center gap-2.5">
          {status === 'complete' ? (
            <span
              className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#22C55E] align-middle leading-none"
              title="Complete"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5 text-white">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
          ) : (
            <span
              className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 border-stone-300 align-middle leading-none"
              title="Not started"
            />
          )}
        </div>
      </div>
      <div className="space-y-1 px-3 py-2">
        {children}
      </div>
    </section>
  )
}

function AiDashHeader() {
  return (
    <header className="border-b border-stone-200 bg-white rounded-t-[2rem]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl font-bold text-white shadow-sm bg-gradient-to-tr from-[#4F6EF7] to-[#8B5CF6]">✦</span>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#4F6EF7]">Tally AI custom dashboard</div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold leading-tight tracking-tight text-stone-900">Demo Church Custom Canvas</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#4F6EF7]/20 bg-[#4F6EF7]/5 px-2.5 py-0.5 text-[11px] font-semibold text-[#4F6EF7]">
                AI-Generated
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 font-num text-[11px] font-medium text-stone-500">
            Rolling Window (Year to Date)
          </span>
          <span className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 font-num text-[11px] font-medium text-stone-500">
            Updated just now
          </span>
        </div>
      </div>
    </header>
  )
}

function DemoDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'entry' | 'ai-dashboard'>('entry')
  
  // Saved database values
  const [savedAdults, setSavedAdults] = useState(315)
  const [savedKids, setSavedKids] = useState(88)
  const [savedAdultVolsCafe, setSavedAdultVolsCafe] = useState(15)
  const [savedAdultVolsBand, setSavedAdultVolsBand] = useState(8)
  const [savedAdultVolsOps, setSavedAdultVolsOps] = useState(12)
  const [savedAdultVolsParking, setSavedAdultVolsParking] = useState(25)
  const [savedKidsVols, setSavedKidsVols] = useState(22)
  const [savedGiving, setSavedGiving] = useState(15800)
  const [savedDecisions, setSavedDecisions] = useState(4)
  const [savedBaptisms, setSavedBaptisms] = useState(12)
  const [savedNextSteps, setSavedNextSteps] = useState(15)
  const [savedPrayers, setSavedPrayers] = useState(22)

  // Edit fields (un-saved state)
  const [adults, setAdults] = useState(315)
  const [kids, setKids] = useState(88)
  const [adultVolsCafe, setAdultVolsCafe] = useState(15)
  const [adultVolsBand, setAdultVolsBand] = useState(8)
  const [adultVolsOps, setAdultVolsOps] = useState(12)
  const [adultVolsParking, setAdultVolsParking] = useState(25)
  const [kidsVols, setKidsVols] = useState(22)
  const [giving, setGiving] = useState(15800)
  const [decisions, setDecisions] = useState(4)
  const [baptisms, setBaptisms] = useState(12)
  const [nextSteps, setNextSteps] = useState(15)
  const [prayers, setPrayers] = useState(22)

  // Calculations
  const savedAdultVols = savedAdultVolsCafe + savedAdultVolsBand + savedAdultVolsOps + savedAdultVolsParking
  const adultVols = adultVolsCafe + adultVolsBand + adultVolsOps + adultVolsParking
  const savedVolunteers = savedAdultVols + savedKidsVols

  const totalAttendance = savedAdults + savedKids
  const priorAttendance = 375
  const attendanceGrowthNum = priorAttendance > 0 ? Math.round(((totalAttendance - priorAttendance) / priorAttendance) * 100) : null

  const priorGiving = 14900.5
  const givingGrowthNum = priorGiving > 0 ? Math.round(((savedGiving - priorGiving) / priorGiving) * 100) : null

  const priorVolunteers = 69
  const volsGrowthNum = priorVolunteers > 0 ? Math.round(((savedVolunteers - priorVolunteers) / priorVolunteers) * 100) : null

  // ─── Tally AI Dashboard Dynamic Replay Widgets ──────────────────────────────
  const dynamicWidgets = useMemo(() => {
    // Clone snapshotData.widgets
    const widgets = JSON.parse(JSON.stringify(snapshotData.widgets)) as ReplayWidget[]

    // Helper to find a widget by its ID
    const getWidget = (id: string) => widgets.find(w => w.id === id)

    // 1. Weekly attendance — this year vs last (bfd0a48a-4bbc-4062-9ff3-f4a97295e065)
    const wAttendanceVal = getWidget('bfd0a48a-4bbc-4062-9ff3-f4a97295e065')
    if (wAttendanceVal && wAttendanceVal.rows?.[0]) {
      const newAvg = ((438.65 * 21) + totalAttendance) / 22
      const priorAvg = (wAttendanceVal.rows[0].prior as number) || 433.24
      const newDelta = priorAvg > 0 ? ((newAvg - priorAvg) / priorAvg) * 100 : 0
      wAttendanceVal.rows[0].value = newAvg
      wAttendanceVal.rows[0].delta = newDelta
    }

    // 2. Volunteers by ministry (9da1ee46-bb4d-48e2-b670-00d53b4ee2a7) - Pivot Table
    const wVolsPivot = getWidget('9da1ee46-bb4d-48e2-b670-00d53b4ee2a7')
    if (wVolsPivot && wVolsPivot.rows) {
      const juneRow = wVolsPivot.rows.find(r => r.bucket === '2026-06')
      if (juneRow) {
        juneRow.EXPERIENCE = savedAdultVols * 4
        juneRow.LIFEKIDS = savedKidsVols * 4
      } else {
        wVolsPivot.rows.push({
          bucket: '2026-06',
          EXPERIENCE: savedAdultVols * 4,
          LIFEKIDS: savedKidsVols * 4
        })
      }
    }

    // 3. Giving by month (c86ceab6-6a52-453d-bac3-09fd2bef3f03) - Bar Chart
    const wGivingBar = getWidget('c86ceab6-6a52-453d-bac3-09fd2bef3f03')
    if (wGivingBar && wGivingBar.rows) {
      const juneRow = wGivingBar.rows.find(r => r.bucket === '2026-06')
      if (juneRow) {
        juneRow.value = savedGiving * 4
      } else {
        wGivingBar.rows.push({
          bucket: '2026-06',
          value: savedGiving * 4
        })
      }
    }

    // 4. Attendance this year vs last (bd96f3b6-311d-4a6d-aeca-8fa643d88ea5) - Area Chart (monthly sum)
    const wAttendanceArea = getWidget('bd96f3b6-311d-4a6d-aeca-8fa643d88ea5')
    if (wAttendanceArea && wAttendanceArea.rows) {
      const juneRow = wAttendanceArea.rows.find(r => r.bucket === '2026-06')
      if (juneRow) {
        juneRow.value = totalAttendance * 4
      } else {
        wAttendanceArea.rows.push({
          bucket: '2026-06',
          value: totalAttendance * 4,
          prior: 1730
        })
      }
    }

    // 5. Volunteers to attendance (287103c5-dda8-472b-8a3d-2edc9bd68fec) - Metric Card
    const wVolRatio = getWidget('287103c5-dda8-472b-8a3d-2edc9bd68fec')
    if (wVolRatio && wVolRatio.rows?.[0]) {
      const ratio = totalAttendance > 0 ? (savedVolunteers / totalAttendance) * 100 : 0
      wVolRatio.rows[0].value = ratio
    }

    // 6. Avg weekly attendance (9fa6aa33-be34-4c1c-8dca-373494a36194) - Metric Card
    const wAvgAttendance = getWidget('9fa6aa33-be34-4c1c-8dca-373494a36194')
    if (wAvgAttendance && wAvgAttendance.rows?.[0]) {
      const newAvg = ((438.65 * 21) + totalAttendance) / 22
      wAvgAttendance.rows[0].value = newAvg
    }

    // 7. Attendance trend — weekly avg by month (e8092aa7-1aac-423b-b57f-7eb9dea636c3) - Area Chart
    const wAttendanceTrend = getWidget('e8092aa7-1aac-423b-b57f-7eb9dea636c3')
    if (wAttendanceTrend && wAttendanceTrend.rows) {
      const juneRow = wAttendanceTrend.rows.find(r => r.bucket === '2026-06')
      if (juneRow) {
        juneRow.value = totalAttendance
      } else {
        wAttendanceTrend.rows.push({
          bucket: '2026-06',
          value: totalAttendance,
          prior: 433
        })
      }
    }

    // 8. Weekly Giving — Last 6 Months (106d8ad7-da51-46fc-a74e-5961e9895043) - Area Chart (weekly)
    const wWeeklyGiving = getWidget('106d8ad7-da51-46fc-a74e-5961e9895043')
    if (wWeeklyGiving && wWeeklyGiving.rows) {
      const targetDate = '2026-05-31'
      const targetRow = wWeeklyGiving.rows.find(r => r.bucket === targetDate)
      if (targetRow) {
        targetRow.value = savedGiving
      } else {
        wWeeklyGiving.rows.push({
          bucket: targetDate,
          value: savedGiving
        })
      }
    }

    return widgets
  }, [
    totalAttendance,
    savedVolunteers,
    savedAdultVols,
    savedKidsVols,
    savedGiving
  ])

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-[2rem] p-6 md:p-8 shadow-inner relative overflow-hidden flex flex-col gap-6 w-full">
      {/* Tab Context Info Banner */}
      <div className={`border rounded-2xl px-5 py-2.5 text-xs md:text-sm shadow-sm flex items-center justify-center gap-2.5 transition-all duration-500 ${
        activeTab === 'entry' ? 'bg-blue-50/40 border-blue-150 text-[#3D5BD4]' :
        activeTab === 'dashboard' ? 'bg-emerald-50/40 border-emerald-150 text-emerald-800' :
        'bg-purple-50/40 border-purple-150 text-purple-800'
      }`}>
        {activeTab === 'entry' && (
          <>
            <span className="h-2 w-2 rounded-full bg-[#4F6EF7] animate-pulse" />
            <p className="font-semibold text-center leading-relaxed">
              Autosaves instantly on focus loss — click outside to save
            </p>
          </>
        )}
        {activeTab === 'dashboard' && (
          <>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="font-semibold text-center leading-relaxed">
              Included in all plans — $22/month
            </p>
          </>
        )}
        {activeTab === 'ai-dashboard' && (
          <>
            <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
            <p className="font-semibold text-center leading-relaxed">
              Tally AI add-on — starts at +$15/month
            </p>
          </>
        )}
      </div>

      {/* Tab selectors */}
      <div className="flex flex-wrap justify-center border-b border-stone-200 pb-6 gap-3 md:gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('entry')}
          className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer ${activeTab === 'entry' ? 'bg-stone-900 text-white shadow-md' : 'bg-white text-stone-600 border border-stone-200 hover:text-stone-900'}`}
        >
          Weekly Data Entry
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer ${activeTab === 'dashboard' ? 'bg-stone-900 text-white shadow-md' : 'bg-white text-stone-600 border border-stone-200 hover:text-stone-900'}`}
        >
          Standard Dashboard
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ai-dashboard')}
          className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'ai-dashboard' ? 'bg-stone-900 text-white shadow-md' : 'bg-white text-stone-600 border border-stone-200 hover:text-stone-900'}`}
        >
          <span>✦ Tally AI Dashboard</span>
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Dashboard Header */}
          <DashHeader />

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Total Attendance"
              value={totalAttendance}
              delta={attendanceGrowthNum}
              prior={priorAttendance}
              accentColor="#4F6EF7"
            />
            <KpiCard
              label="Total Giving"
              value={savedGiving}
              prefix="$"
              delta={givingGrowthNum}
              prior={priorGiving}
              accentColor="#22C55E"
            />
            <KpiCard
              label="Volunteers Serving"
              value={savedVolunteers}
              delta={volsGrowthNum}
              prior={priorVolunteers}
              accentColor="#8B5CF6"
            />
          </div>

          {/* Key Metrics Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1 pb-1">
              <span className="h-4 w-1.5 shrink-0 rounded-full bg-[#06B6D4]" aria-hidden />
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-700">Key Metrics</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KeyMetricCard
                label="Avg Weekly Attendance"
                value={totalAttendance}
                m4={(395 + 415 + 375 + totalAttendance) / 4}
                ytd={(380 * 20 + totalAttendance) / 21}
                priorYtd={352}
                target={450}
              />
              <KeyMetricCard
                label="Volunteers / Attendance"
                value={totalAttendance > 0 ? (savedVolunteers / totalAttendance) * 100 : 0}
                suffix="%"
                m4={((73/395 + 78/415 + 69/375 + (totalAttendance > 0 ? savedVolunteers / totalAttendance : 0)) / 4) * 100}
                ytd={((66/380 * 20 + (totalAttendance > 0 ? savedVolunteers / totalAttendance : 0)) / 21) * 100}
                priorYtd={17.3}
                target={30}
              />
              <KeyMetricCard
                label="Per-Capita Giving"
                value={totalAttendance > 0 ? savedGiving / totalAttendance : 0}
                prefix="$"
                m4={(16200/395 + 15900/415 + 14900/375 + (totalAttendance > 0 ? savedGiving / totalAttendance : 0)) / 4}
                ytd={(15200/380 * 20 + (totalAttendance > 0 ? savedGiving / totalAttendance : 0)) / 21}
                priorYtd={40.1}
                target={45}
              />
            </div>
          </div>

          {/* Totals SummaryCard */}
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <CardHeader
              label="Totals"
              accentStyle={{ backgroundColor: '#4F6EF7' }}
              trailing={
                <button
                  type="button"
                  title="Customize which metrics show"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
                </button>
              }
            />
            <ColumnHeaders />
            <div>
              <FourColRow
                label="Grand Total"
                w={totalAttendance}
                m4={(395 + 415 + 375 + totalAttendance) / 4}
                ytd={(380 * 20 + totalAttendance) / 21}
                priorYtd={352}
              />
              <FourColRow
                label="Experience Total"
                sub="attendance"
                w={savedAdults}
                m4={(310 + 325 + 295 + savedAdults) / 4}
                ytd={(305 * 20 + savedAdults) / 21}
                priorYtd={280}
                accentColor="#4F6EF7"
              />
              <FourColRow
                label="LifeKids Total"
                sub="attendance"
                w={savedKids}
                m4={(85 + 90 + 80 + savedKids) / 4}
                ytd={(75 * 20 + savedKids) / 21}
                priorYtd={72}
                accentColor="#8B5CF6"
              />
              <FourColRow
                label="Volunteers"
                w={savedVolunteers}
                m4={(73 + 78 + 69 + savedVolunteers) / 4}
                ytd={(66 * 20 + savedVolunteers) / 21}
                priorYtd={64.3}
              />
              <FourColRow
                label="First-Time Decisions"
                w={savedDecisions}
                m4={(2 + 5 + 1 + savedDecisions) / 4}
                ytd={(3 * 20 + savedDecisions) / 21}
                priorYtd={2.8}
              />
              <FourColRow
                label="Giving"
                prefix="$"
                w={savedGiving}
                m4={(16200 + 15900 + 14900 + savedGiving) / 4}
                ytd={(15200 * 20 + savedGiving) / 21}
                priorYtd={14100}
              />
            </div>
          </div>

          {/* Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Experience TagBlock */}
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <CardHeader label="Experience" role="Adults" accentStyle={{ backgroundColor: '#4F6EF7' }} />
              <ColumnHeaders />
              <div>
                <FourColRow
                  label="Attendance"
                  w={savedAdults}
                  m4={(310 + 325 + 295 + savedAdults) / 4}
                  ytd={(305 * 20 + savedAdults) / 21}
                  priorYtd={280}
                />
                <FourColRow
                  label="Volunteers"
                  w={savedAdultVols}
                  m4={(55 + 58 + 52 + savedAdultVols) / 4}
                  ytd={(50 * 20 + savedAdultVols) / 21}
                  priorYtd={48.5}
                />
                <FourColRow
                  label="Cafe"
                  w={savedAdultVolsCafe}
                  m4={(13.75 + 14.5 + 13 + savedAdultVolsCafe) / 4}
                  ytd={(12.5 * 20 + savedAdultVolsCafe) / 21}
                  priorYtd={12.1}
                  indent={true}
                />
                <FourColRow
                  label="Band"
                  w={savedAdultVolsBand}
                  m4={(7.33 + 7.73 + 6.93 + savedAdultVolsBand) / 4}
                  ytd={(6.67 * 20 + savedAdultVolsBand) / 21}
                  priorYtd={6.5}
                  indent={true}
                />
                <FourColRow
                  label="Operations"
                  w={savedAdultVolsOps}
                  m4={(11 + 11.6 + 10.4 + savedAdultVolsOps) / 4}
                  ytd={(10 * 20 + savedAdultVolsOps) / 21}
                  priorYtd={9.7}
                  indent={true}
                />
                <FourColRow
                  label="Parking"
                  w={savedAdultVolsParking}
                  m4={(22.92 + 24.17 + 21.67 + savedAdultVolsParking) / 4}
                  ytd={(20.83 * 20 + savedAdultVolsParking) / 21}
                  priorYtd={20.2}
                  indent={true}
                />
              </div>
            </div>

            {/* LifeKids TagBlock */}
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <CardHeader label="LifeKids" role="Kids" accentStyle={{ backgroundColor: '#8B5CF6' }} />
              <ColumnHeaders />
              <div>
                <FourColRow
                  label="Attendance"
                  w={savedKids}
                  m4={(85 + 90 + 80 + savedKids) / 4}
                  ytd={(75 * 20 + savedKids) / 21}
                  priorYtd={72}
                />
                <FourColRow
                  label="Volunteers"
                  w={savedKidsVols}
                  m4={(18 + 20 + 17 + savedKidsVols) / 4}
                  ytd={(16 * 20 + savedKidsVols) / 21}
                  priorYtd={15.8}
                />
                <FourColRow
                  label="Salvations"
                  w={savedDecisions}
                  m4={(2 + 5 + 1 + savedDecisions) / 4}
                  ytd={(3 * 20 + savedDecisions) / 21}
                  priorYtd={2.8}
                />
                <FourColRow
                  label="Baptisms"
                  w={savedBaptisms}
                  m4={(10 + 11 + 12 + savedBaptisms) / 4}
                  ytd={(11 * 20 + savedBaptisms) / 21}
                  priorYtd={10.5}
                />
                <FourColRow
                  label="Next Steps"
                  w={savedNextSteps}
                  m4={(13 + 14 + 15 + savedNextSteps) / 4}
                  ytd={(14 * 20 + savedNextSteps) / 21}
                  priorYtd={13.2}
                />
                <FourColRow
                  label="Prayer Request Counts"
                  w={savedPrayers}
                  m4={(20 + 21 + 22 + savedPrayers) / 4}
                  ytd={(21 * 20 + savedPrayers) / 21}
                  priorYtd={19.8}
                />
              </div>
            </div>
          </div>

          <p className="px-1 text-[12px] leading-relaxed text-stone-400">
            Every value is derived from your entries — never edited here. Totals roll up across the week’s sittings.
          </p>
        </div>
      )}

      {activeTab === 'entry' && (
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              {/* Experience Card */}
              <DemoMinistryCard
                name="Experience"
                role="Adults"
                accentClass="bg-[#4F6EF7]"
                status={adults ? 'complete' : 'empty'}
              >
                <DemoField
                  id="f-adults"
                  label="Adult Attendance"
                  value={adults}
                  needs={true}
                  onCommit={(val) => {
                    setAdults(val ?? 0)
                    setSavedAdults(val ?? 0)
                  }}
                />
                <DemoVolunteersGroup
                  label="Volunteers"
                  total={adultVols}
                >
                  <DemoField
                    id="f-adult-vols-cafe"
                    label="Cafe"
                    value={adultVolsCafe}
                    indent={true}
                    onCommit={(val) => {
                      setAdultVolsCafe(val ?? 0)
                      setSavedAdultVolsCafe(val ?? 0)
                    }}
                  />
                  <DemoField
                    id="f-adult-vols-band"
                    label="Band"
                    value={adultVolsBand}
                    indent={true}
                    onCommit={(val) => {
                      setAdultVolsBand(val ?? 0)
                      setSavedAdultVolsBand(val ?? 0)
                    }}
                  />
                  <DemoField
                    id="f-adult-vols-ops"
                    label="Operations"
                    value={adultVolsOps}
                    indent={true}
                    onCommit={(val) => {
                      setAdultVolsOps(val ?? 0)
                      setSavedAdultVolsOps(val ?? 0)
                    }}
                  />
                  <DemoField
                    id="f-adult-vols-parking"
                    label="Parking"
                    value={adultVolsParking}
                    indent={true}
                    onCommit={(val) => {
                      setAdultVolsParking(val ?? 0)
                      setSavedAdultVolsParking(val ?? 0)
                    }}
                  />
                </DemoVolunteersGroup>
              </DemoMinistryCard>

              {/* Giving Card */}
              <DemoMinistryCard
                name="Giving"
                role="Other"
                accentClass="bg-[#4F6EF7]"
                status={giving ? 'complete' : 'empty'}
              >
                <DemoField
                  id="f-giving"
                  label="Weekly Giving"
                  prefix="$"
                  value={giving}
                  needs={true}
                  onCommit={(val) => {
                    setGiving(val ?? 0)
                    setSavedGiving(val ?? 0)
                  }}
                />
              </DemoMinistryCard>
            </div>

            <div className="space-y-6">
              {/* LifeKids Card */}
              <DemoMinistryCard
                name="LifeKids"
                role="Kids"
                accentClass="bg-[#8B5CF6]"
                status={kids ? 'complete' : 'empty'}
              >
                <DemoField
                  id="f-kids"
                  label="Kids Attendance"
                  value={kids}
                  needs={true}
                  onCommit={(val) => {
                    setKids(val ?? 0)
                    setSavedKids(val ?? 0)
                  }}
                />
                <DemoField
                  id="f-kids-vols"
                  label="Volunteers Serving"
                  value={kidsVols}
                  onCommit={(val) => {
                    setKidsVols(val ?? 0)
                    setSavedKidsVols(val ?? 0)
                  }}
                />
                <DemoField
                  id="f-decisions"
                  label="Salvations"
                  value={decisions}
                  onCommit={(val) => {
                    setDecisions(val ?? 0)
                    setSavedDecisions(val ?? 0)
                  }}
                />
                <DemoField
                  id="f-baptisms"
                  label="Baptisms"
                  value={baptisms}
                  onCommit={(val) => {
                    setBaptisms(val ?? 0)
                    setSavedBaptisms(val ?? 0)
                  }}
                />
                <DemoField
                  id="f-nextsteps"
                  label="Next Steps"
                  value={nextSteps}
                  onCommit={(val) => {
                    setNextSteps(val ?? 0)
                    setSavedNextSteps(val ?? 0)
                  }}
                />
                <DemoField
                  id="f-prayers"
                  label="Prayer Requests"
                  value={prayers}
                  onCommit={(val) => {
                    setPrayers(val ?? 0)
                    setSavedPrayers(val ?? 0)
                  }}
                />
              </DemoMinistryCard>
            </div>
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-stone-400">Each ministry shows only its own metrics — they never share fields. Changes autosave instantly on focus loss.</p>
        </div>
      )}

      {activeTab === 'ai-dashboard' && (
        <div className="space-y-6">
          <AiDashHeader />

          {/* Tally AI Custom Built Explanation Banner */}
          <div className="bg-gradient-to-r from-purple-500/5 via-indigo-500/5 to-[#4F6EF7]/5 border border-purple-100 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold text-xs shadow-sm">✦</span>
                <h4 className="text-sm font-bold text-stone-900">Custom Built by Tally AI</h4>
              </div>
              <p className="text-xs md:text-sm text-stone-600 font-medium leading-relaxed max-w-3xl">
                Every church’s dashboard is 100% custom-tailored to their specific needs. This canvas is just one example of what Tally AI generated for Demo Church. With Tally AI, you can speak and design your own widgets, metrics, and layouts in real time.
              </p>
            </div>
            <div className="w-full md:w-auto shrink-0">
              <div className="bg-white border border-stone-200 rounded-xl px-4 py-2.5 shadow-sm text-xs font-semibold text-stone-500 flex items-center gap-2 max-w-md">
                <span className="text-purple-600">✦</span>
                <span className="italic">"Add a chart comparing volunteer count to attendance..."</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-6 md:grid-rows-[repeat(19,70px)]">
            {dynamicWidgets.map((w) => {
              const layout = w.layout as { x: number; y: number; w: number; h: number }
              const isMetric = w.kind === 'metric_card'
              return (
                <div
                  key={w.id}
                  className={`w-full ${isMetric ? 'h-[140px]' : 'h-[320px]'} md:h-full widget-grid-item-${w.id}`}
                >
                  <style>{`
                    @media (min-width: 768px) {
                      .widget-grid-item-${w.id} {
                        grid-column: ${layout.x + 1} / span ${layout.w};
                        grid-row: ${layout.y + 1} / span ${layout.h};
                      }
                    }
                  `}</style>
                  <WidgetCard w={w} />
                </div>
              )
            })}
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-stone-400">
            Every church's dashboard layout is custom to their needs. Speak and design your own widgets with Tally AI.
          </p>
        </div>
      )}
    </div>
  )
}

function PricingCalculator() {
  const [campuses, setCampuses] = useState(1)
  const [aiTier, setAiTier] = useState<'none' | 'starter' | 'plus' | 'pro'>('plus')

  const baseCost = campuses * 22
  const aiCost = aiTier === 'none' ? 0 : aiTier === 'starter' ? 15 : aiTier === 'plus' ? 29 : 49
  const totalCost = baseCost + aiCost

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-3xl p-6 md:p-8 max-w-xl mx-auto shadow-sm text-stone-800">
      <div className="flex items-center gap-3 mb-6">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-[#4F6EF7] to-[#8B5CF6] text-white font-bold text-sm shadow-sm">✦</span>
        <div className="text-left">
          <h4 className="text-sm font-bold text-stone-900">Custom Plan Calculator</h4>
          <p className="text-[11px] text-stone-500 font-medium leading-none mt-0.5">Estimate your church's custom plan cost</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Campuses Input */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-stone-200">
          <div className="text-left">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-700">Campuses / Locations</label>
            <p className="text-[11px] text-stone-400 font-medium leading-tight mt-0.5">Sunday Tally is $22/mo per location.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCampuses(c => Math.max(1, c - 1))}
              className="w-8 h-8 rounded-lg border border-stone-250 bg-white hover:bg-stone-100 flex items-center justify-center font-bold text-stone-600 select-none cursor-pointer transition-colors shadow-sm outline-none"
            >
              -
            </button>
            <span className="font-num text-base font-bold text-stone-900 w-6 text-center">{campuses}</span>
            <button
              type="button"
              onClick={() => setCampuses(c => Math.min(20, c + 1))}
              className="w-8 h-8 rounded-lg border border-stone-250 bg-white hover:bg-stone-100 flex items-center justify-center font-bold text-stone-600 select-none cursor-pointer transition-colors shadow-sm outline-none"
            >
              +
            </button>
          </div>
        </div>

        {/* Tally AI Add-on Selection */}
        <div className="space-y-2 pb-4 border-b border-stone-200">
          <div className="text-left">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-700">Tally AI Add-on</label>
            <p className="text-[11px] text-stone-400 font-medium leading-tight mt-0.5">Select features to unlock conversational dashboard design.</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(['none', 'starter', 'plus', 'pro'] as const).map((tier) => {
              const label = tier === 'none' ? 'No AI' : tier.charAt(0).toUpperCase() + tier.slice(1)
              const price = tier === 'none' ? '+$0' : tier === 'starter' ? '+$15' : tier === 'plus' ? '+$29' : '+$49'
              const active = aiTier === tier
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setAiTier(tier)}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer outline-none ${
                    active
                      ? 'border-[#4F6EF7] bg-white ring-1 ring-[#4F6EF7]/20 shadow-sm'
                      : 'border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-300'
                  }`}
                >
                  <div className={`text-xs font-bold ${active ? 'text-[#4F6EF7]' : 'text-stone-750'}`}>{label}</div>
                  <div className="text-[10px] text-stone-400 font-medium font-num mt-0.5">{price}/mo</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Cost Summary Output */}
        <div className="bg-white border border-stone-200/60 rounded-xl p-4 flex items-center justify-between gap-4 shadow-inner">
          <div className="space-y-0.5 text-left">
            <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Estimated Total</div>
            <div className="text-[11px] text-stone-500 font-medium leading-tight">
              Base: <span className="font-num font-semibold text-stone-700">${baseCost}</span>
              {aiCost > 0 && (
                <>
                  {' '}• AI: <span className="font-num font-semibold text-stone-700">${aiCost}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-baseline gap-0.5 shrink-0">
            <span className="text-3xl font-extrabold text-stone-900 font-num">${totalCost}</span>
            <span className="text-stone-500 text-xs font-semibold">/mo</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="border-b border-stone-150 py-5 last:border-0">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center text-left font-bold text-stone-900 text-lg hover:text-[#4F6EF7] transition-colors focus:outline-none group"
      >
        <span>{question}</span>
        <svg 
          className={`w-5 h-5 text-stone-400 group-hover:text-[#4F6EF7] transform transition-transform duration-300 ${isOpen ? 'rotate-180 text-[#4F6EF7]' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div 
        className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[300px] mt-3 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <p className="text-stone-600 leading-relaxed text-base font-medium">{answer}</p>
      </div>
    </div>
  )
}

function TallyChatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [showTooltip, setShowTooltip] = useState(true)
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: "Ask me anything about Sunday Tally — what it tracks, what it costs, how setup works. I'll give you a straight answer." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading, isOpen])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = { role: 'user' as const, content: input.trim() }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/marketing/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage] })
      })
      const data = await res.json()
      if (data.text) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.text }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I ran into an issue connecting to the chat. Please try again!" }])
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, a network error occurred. Please check your connection and try again." }])
    } finally {
      setLoading(false)
    }
  }

  const handleToggleChat = () => {
    setIsOpen(!isOpen)
    setShowTooltip(false)
  }

  return (
    <>
      {/* Tooltip pointing to the floating button */}
      <AnimatePresence>
        {showTooltip && !isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-50 bg-stone-900 text-white border border-stone-800 rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3 max-w-[280px]"
          >
            <span className="text-xs font-semibold leading-snug">
              The fastest way to learn about Sunday Tally
            </span>
            <button
              type="button"
              onClick={() => setShowTooltip(false)}
              className="text-stone-400 hover:text-white transition-colors cursor-pointer border-0 bg-transparent outline-none flex-shrink-0"
              title="Dismiss"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            {/* Triangle pointer pointing down to the button */}
            <div className="absolute bottom-[-6px] right-5 w-3 h-3 bg-stone-900 border-r border-b border-stone-800 rotate-45"></div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Chat Trigger Button */}
      <button
        type="button"
        onClick={handleToggleChat}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-[#4F6EF7] to-[#06B6D4] text-white shadow-2xl hover:scale-105 active:scale-95 transition-transform duration-200 cursor-pointer border-0 outline-none"
        title="Ask Tally AI"
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Chat Window Panel */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.25, type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-24 right-6 z-50 w-96 h-[500px] max-h-[calc(100vh-120px)] bg-white/95 border border-stone-200 rounded-[2rem] shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-stone-900 to-stone-950 px-6 py-4 text-white flex justify-between items-center border-b border-stone-800">
            <div className="flex items-center gap-3">
              <div className="bg-[#4F6EF7] p-2 rounded-lg text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-bold tracking-tight">Tally AI Agent</p>
                <p className="text-[10px] text-stone-400 font-medium tracking-wide">PRODUCT ASSISTANT</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-stone-400 hover:text-white transition-colors cursor-pointer border-0 bg-transparent outline-none"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-stone-50/50 flex flex-col">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex flex-col max-w-[85%] leading-relaxed ${
                  m.role === 'user' ? 'self-end ml-auto' : 'self-start text-left'
                }`}
              >
                <div
                  className={`text-sm px-4 py-3 rounded-2xl ${
                    m.role === 'user'
                      ? 'bg-stone-900 text-white rounded-tr-sm'
                      : 'bg-white text-stone-900 border border-stone-200 shadow-sm rounded-tl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="self-start max-w-[85%] flex items-center gap-1.5 bg-white border border-stone-200 shadow-sm px-4 py-3 rounded-2xl rounded-tl-sm text-sm">
                <span className="w-1.5 h-1.5 bg-stone-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-stone-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-stone-500 rounded-full animate-bounce"></span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Footer Form */}
          <form onSubmit={handleSend} className="border-t border-stone-200 p-4 bg-white flex gap-2 items-center">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
              placeholder="Ask about pricing, features, trial..."
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-900 outline-none focus:bg-white focus:border-[#4F6EF7] focus:ring-1 focus:ring-[#4F6EF7]/20 transition-all font-medium"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-2.5 bg-stone-900 text-white rounded-xl hover:bg-[#4F6EF7] disabled:bg-stone-100 disabled:text-stone-400 active:scale-95 transition-all shadow-md cursor-pointer flex items-center justify-center border-0 outline-none"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </form>
        </motion.div>
      )}
    </>
  )
}

