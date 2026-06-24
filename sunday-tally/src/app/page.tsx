'use client'

import { useRef, useState, useEffect } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, BarChart3, Bot, Database, CheckCircle2 } from 'lucide-react'
import { ParticleNetwork } from '@/components/ParticleNetwork'

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
                Up and running in 10 minutes. See the impact you're having on your community.
              </span>
              <div ref={heroRef} className="relative block text-left w-full group">
                <h1 className="text-6xl md:text-8xl lg:text-[110px] font-extrabold tracking-tighter text-stone-900 mb-4 pb-4 leading-[1.05] relative z-10">
                  Stop guessing.
                  <br className="hidden lg:block" />
                  <span className="text-stone-300 font-['Playfair_Display'] italic font-black tracking-tighter text-[0.95em] block md:inline-block">Reveal thy numbers.</span>
                </h1>
                <h1 className="absolute inset-0 text-6xl md:text-8xl lg:text-[110px] font-extrabold tracking-tighter leading-[1.05] mb-4 pb-4 pointer-events-none select-none text-transparent bg-clip-text bg-gradient-to-r from-[#4F6EF7] via-[#06B6D4] to-[#10B981] z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      WebkitMaskImage: `radial-gradient(circle 500px at ${mousePos.x}px ${mousePos.y}px, black 20%, transparent 80%)`,
                      maskImage: `radial-gradient(circle 500px at ${mousePos.x}px ${mousePos.y}px, black 20%, transparent 80%)`
                    }}>
                  Stop guessing.
                  <br className="hidden lg:block" />
                  <span className="font-['Playfair_Display'] italic font-black tracking-tighter text-[0.95em] block md:inline-block">Reveal thy numbers.</span>
                </h1>
              </div>
              <p className="text-2xl text-stone-500 mb-0 max-w-xl leading-relaxed font-medium">
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

      {/* Social Proof */}
      <div className="border-y border-stone-200 bg-white py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm font-bold tracking-widest text-stone-400 uppercase">Trusted by fast-growing ministries nationwide</p>
        </div>
      </div>

      {/* Bento Grid */}
      <section id="features" className="py-32 bg-stone-50 relative border-t border-stone-200 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <ParticleNetwork />
        </div>

        <div className="container mx-auto px-4 md:px-8 relative z-10">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-bold text-stone-900 mb-6 tracking-tighter">Measure your church's health.</h2>
            <p className="text-xl text-stone-500 max-w-2xl mx-auto">Just answers.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-6xl mx-auto">
            
            {/* Bento Item 1 - Large Span */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
              className="md:col-span-8 bg-white border border-stone-200 shadow-sm hover:shadow-md rounded-[2rem] p-8 md:p-12 transition-all flex flex-col md:flex-row items-center gap-12 group overflow-hidden relative"
            >
              <div className="flex-1 relative z-10 pr-4">
                <h3 className="text-3xl font-bold text-stone-900 mb-4 tracking-tight">Instant Imports</h3>
                <p className="text-stone-500 text-lg leading-relaxed">
                  Upload your spreadsheet. Our AI maps the data and imports your history in seconds, getting you set up in under 10 minutes.
                </p>
              </div>
              <div className="flex-1 w-full bg-stone-50 rounded-xl border border-stone-200 p-4 shadow-inner relative h-48 flex items-center justify-center group-hover:bg-blue-50/50 transition-colors">
                <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-30" />
                <div className="flex flex-col gap-2 w-full max-w-[240px] z-10">
                  <div className="bg-white border border-stone-200 shadow-sm rounded flex items-center justify-between p-2 transform group-hover:-translate-y-1 transition-transform">
                    <span className="text-[10px] font-mono text-stone-400">Date</span>
                    <span className="text-[10px] font-mono text-stone-400">Adults</span>
                    <span className="text-[10px] font-mono text-stone-400">Kids</span>
                  </div>
                  <div className="bg-white border border-[#4F6EF7] shadow-sm rounded flex items-center justify-between p-2 transform group-hover:-translate-y-1 transition-transform delay-75">
                    <span className="text-[10px] font-mono text-stone-900">04/05/26</span>
                    <span className="text-[10px] font-mono text-stone-900">412</span>
                    <span className="text-[10px] font-mono text-stone-900">114</span>
                  </div>
                  <div className="bg-white border border-stone-200 shadow-sm rounded flex items-center justify-between p-2 transform group-hover:-translate-y-1 transition-transform delay-150 opacity-50">
                    <span className="text-[10px] font-mono text-stone-400">03/29/26</span>
                    <span className="text-[10px] font-mono text-stone-400">388</span>
                    <span className="text-[10px] font-mono text-stone-400">92</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Bento Item 2 - Tall Span */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
              className="md:col-span-4 md:row-span-2 bg-white border border-stone-200 shadow-sm hover:shadow-md rounded-[2rem] p-8 md:p-12 transition-all flex flex-col group overflow-hidden relative"
            >
              <div className="flex-1 w-full bg-stone-50 rounded-xl border border-stone-200 p-6 shadow-inner relative flex flex-col gap-4 mb-8">
                <div className="self-end bg-stone-900 text-white text-xs font-medium px-4 py-2 rounded-2xl rounded-tr-sm shadow-sm max-w-[85%] group-hover:-translate-y-1 transition-transform">
                  How many kids checked in last Sunday?
                </div>
                <div className="self-start bg-white border border-stone-200 text-stone-900 text-xs font-medium px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm max-w-[90%] group-hover:-translate-y-1 transition-transform delay-75">
                  <div className="flex items-center gap-2 mb-2">
                    <Bot size={14} className="text-[#4F6EF7]" />
                    <span className="text-[#4F6EF7] font-bold">SundayTally AI</span>
                  </div>
                  You had <span className="font-bold text-stone-900 bg-blue-50 px-1 rounded">114 kids</span> check in last Sunday. That's a 15% increase from the previous week!
                </div>
              </div>
              <div className="relative z-10 mt-auto">
                <h3 className="text-2xl font-bold text-stone-900 mb-3 tracking-tight">AI Assistant</h3>
                <p className="text-stone-500 leading-relaxed">
                  Ask questions and get instant, accurate answers about your data.
                </p>
              </div>
            </motion.div>

            {/* Bento Item 3 - Wide bottom */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}
              className="md:col-span-8 bg-white border border-stone-200 shadow-sm hover:shadow-md rounded-[2rem] p-8 md:p-12 transition-all flex flex-col md:flex-row-reverse items-center gap-12 group overflow-hidden relative"
            >
              <div className="flex-1 relative z-10 pl-4">
                <h3 className="text-3xl font-bold text-stone-900 mb-4 tracking-tight">Custom Dashboards</h3>
                <p className="text-stone-500 text-lg leading-relaxed">
                  Stop relying on rigid reports. Tell the AI what you want to see, and watch it build the exact chart you need right in front of you.
                </p>
              </div>
              <div className="flex-1 w-full bg-stone-50 rounded-xl border border-stone-200 p-6 shadow-inner relative h-48 flex items-center justify-center group-hover:bg-blue-50/50 transition-colors">
                <div className="relative w-32 h-32 rounded-full border-[12px] border-stone-100 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform" style={{ borderTopColor: '#4F6EF7', borderRightColor: '#4F6EF7', borderBottomColor: '#06B6D4' }}>
                  <div className="text-center">
                    <div className="text-2xl font-black text-stone-900">72%</div>
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Giving</div>
                  </div>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </section>
      
      {/* Pricing Section */}
      <section className="py-32 bg-white relative border-t border-stone-200" id="pricing">
        <div className="container mx-auto px-4 md:px-8 max-w-6xl">
          
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-bold text-stone-900 mb-6 tracking-tighter">Simple pricing.</h2>
            <p className="text-xl text-stone-500 max-w-2xl mx-auto">Start with what you need. Add AI when you're ready.</p>
          </div>

          {/* Base Tier Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-stone-50 border border-stone-200 rounded-[2rem] p-8 md:p-12 mb-24 shadow-sm flex flex-col md:flex-row gap-12 items-center"
          >
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-3xl font-bold text-stone-900 mb-2">Base Platform</h3>
              <p className="text-stone-500 text-lg mb-6 leading-relaxed">Everything you need to count what matters (attendance, volunteers, giving, salvations, and baptisms) and see it week over week, month over month, and year over year.</p>
              <ul className="text-stone-600 font-medium flex flex-col gap-3 mb-8 md:mb-0">
                <li className="flex items-center gap-2 justify-center md:justify-start"><CheckCircle2 className="text-[#4F6EF7]" size={20} /> Up and running in 10 minutes</li>
                <li className="flex items-center gap-2 justify-center md:justify-start"><CheckCircle2 className="text-[#4F6EF7]" size={20} /> Unlimited manual tracking</li>
                <li className="flex items-center gap-2 justify-center md:justify-start"><CheckCircle2 className="text-[#4F6EF7]" size={20} /> Core metric dashboards</li>
                <li className="flex items-center gap-2 justify-center md:justify-start"><CheckCircle2 className="text-[#4F6EF7]" size={20} /> Standard reporting</li>
              </ul>
            </div>
            <div className="md:w-80 bg-[#4F6EF7] text-white p-8 rounded-[1.5rem] shadow-xl text-center shrink-0 relative overflow-hidden flex flex-col items-center justify-center transition-all hover:shadow-2xl hover:scale-[1.02]">
              <div className="inline-block bg-white/15 text-white text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-full mb-4">
                45-Day Free Trial
              </div>
              <p className="text-sm font-bold tracking-widest text-blue-200 uppercase mb-2">One price per location</p>
              <div className="flex justify-center items-end gap-1 mb-2">
                <span className="text-5xl font-extrabold text-white">$22</span>
                <span className="text-blue-100 font-medium pb-1">/mo</span>
              </div>
              <p className="text-sm text-blue-100/90 mb-6">Add a campus anytime for $22/mo.</p>
              <button className="w-full bg-white hover:bg-stone-50 text-[#4F6EF7] font-bold py-4 rounded-xl transition-all shadow-md hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]">
                Start free for 45 days
              </button>
              <p className="text-xs text-blue-200/80 mt-4 font-medium">No credit card required.</p>
            </div>
          </motion.div>

          {/* AI Add-ons Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center p-3 bg-blue-50 text-[#4F6EF7] rounded-2xl mb-6">
              <Bot size={32} />
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-stone-900 mb-6 tracking-tight">Add AI Insights & Dashboards</h2>
            <p className="text-lg text-stone-500 max-w-3xl mx-auto leading-relaxed">
              Ask a question in plain English (like <span className="italic">"How's our average attendance this year compared to last?"</span>) and get a chart or number you can save to your dashboard forever. It refreshes itself every week. No spreadsheets, no formulas.
            </p>
          </div>

          {/* AI Add-ons Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            {/* Starter */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="bg-white border border-stone-200 rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              <p className="text-[#4F6EF7] font-bold tracking-widest uppercase text-sm mb-2">Starter</p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold text-stone-900">+$15</span>
                <span className="text-stone-500 font-medium">/mo</span>
              </div>
              <p className="text-sm text-stone-400 font-medium mb-6 pb-6 border-b border-stone-100">per location</p>
              
              <p className="text-stone-600 mb-8 leading-relaxed">Turn your numbers into 15 saved dashboard widgets you can read in five seconds. Just ask.</p>
              
              <ul className="flex flex-col gap-4 text-sm text-stone-600 mt-auto">
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span><strong>15</strong> Saved dashboard widgets</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Ask AI in plain English</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Auto-refreshing dashboards</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Compare to last year & set goals</span></li>
                <li className="flex items-start gap-3 opacity-40"><span className="w-[18px] flex justify-center text-stone-300">-</span> <span>Most capable AI models</span></li>
              </ul>
              <div className="mt-8 pt-6 border-t border-stone-100">
                <p className="text-xs text-stone-500 font-medium uppercase tracking-wider text-center">Best for a single church getting started</p>
              </div>
            </motion.div>

            {/* Plus */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-white border-2 border-[#4F6EF7] rounded-3xl p-8 shadow-xl relative flex flex-col scale-105 z-10"
            >
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#4F6EF7] text-white text-xs font-bold uppercase tracking-widest py-1.5 px-4 rounded-full">
                Most Popular
              </div>
              <p className="text-[#4F6EF7] font-bold tracking-widest uppercase text-sm mb-2">Plus</p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold text-stone-900">+$29</span>
                <span className="text-stone-500 font-medium">/mo</span>
              </div>
              <p className="text-sm text-stone-400 font-medium mb-6 pb-6 border-b border-stone-100">per church</p>
              
              <p className="text-stone-600 mb-8 leading-relaxed">Room to grow, offering 40 saved dashboard widgets across every ministry, with the same plain-English AI.</p>
              
              <ul className="flex flex-col gap-4 text-sm text-stone-600 mt-auto">
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span><strong>40</strong> Saved dashboard widgets</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Ask AI in plain English</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Auto-refreshing dashboards</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span>Compare to last year & set goals</span></li>
                <li className="flex items-start gap-3 opacity-40"><span className="w-[18px] flex justify-center text-stone-300">-</span> <span>Most capable AI models</span></li>
              </ul>
              <div className="mt-8 pt-6 border-t border-stone-100">
                <p className="text-xs text-stone-500 font-medium uppercase tracking-wider text-center">Best for a growing, multi-ministry church</p>
              </div>
            </motion.div>

            {/* Pro */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="bg-stone-900 border border-stone-800 rounded-3xl p-8 shadow-sm flex flex-col"
            >
              <p className="text-white font-bold tracking-widest uppercase text-sm mb-2">Pro</p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold text-white">+$49</span>
                <span className="text-stone-400 font-medium">/mo</span>
              </div>
              <p className="text-sm text-stone-500 font-medium mb-6 pb-6 border-b border-stone-800">per church</p>
              
              <p className="text-stone-300 mb-8 leading-relaxed">Unlimited widgets and our most capable AI. Built for churches that live in their data.</p>
              
              <ul className="flex flex-col gap-4 text-sm text-stone-300 mt-auto">
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span className="text-white"><strong>Unlimited</strong> dashboard widgets</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span className="text-white">Ask AI in plain English</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span className="text-white">Auto-refreshing dashboards</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span className="text-white">Compare to last year & set goals</span></li>
                <li className="flex items-start gap-3"><CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> <span className="text-white font-bold">Most capable AI models</span></li>
              </ul>
              <div className="mt-8 pt-6 border-t border-stone-800">
                <p className="text-xs text-stone-400 font-medium uppercase tracking-wider text-center">Best for multi-campus & data-driven teams</p>
              </div>
            </motion.div>
          </div>

          {/* AI Banner / Callout */}
          <div className="text-center mb-16">
            <p className="text-stone-500 font-medium bg-stone-100 inline-block px-6 py-2 rounded-full text-sm">
              Try the AI <span className="font-bold text-stone-900">free</span> during your 45-day trial: it's unlocked from day one.
            </p>
          </div>

          {/* Worked Examples FAQ */}
          <div className="max-w-3xl mx-auto bg-stone-50 border border-stone-200 rounded-3xl p-8 md:p-12">
            <h3 className="text-xl font-bold text-stone-900 mb-6 text-center">How to calculate your total cost</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-stone-200">
                <span className="text-stone-600 font-medium">One church, just tracking</span>
                <span className="font-bold text-stone-900">$22/mo</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-stone-200">
                <span className="text-stone-600 font-medium">One church + AI Starter <span className="text-stone-400 text-sm font-normal">($22 + $15)</span></span>
                <span className="font-bold text-stone-900">$37/mo</span>
              </div>
              <div className="flex justify-between items-center py-3">
                <div className="flex flex-col">
                  <span className="text-stone-600 font-medium">Three campuses + AI Pro</span>
                  <span className="text-stone-400 text-sm mt-1">($22 × 3) + $49. Unlimited widgets shared across all three.</span>
                </div>
                <span className="font-bold text-stone-900">$115/mo</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Final Dark CTA */}
      <section className="py-32 relative overflow-hidden bg-stone-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-blue-900/20 via-stone-950 to-stone-950 z-0"></div>
        <div className="container mx-auto px-4 text-center relative z-10 max-w-3xl">
          <h2 className="text-5xl md:text-6xl font-extrabold text-white mb-6 tracking-tighter">See your church clearly.</h2>
          <p className="text-2xl text-stone-400 mb-12 font-medium">Throw out the spreadsheets. Get answers instantly.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/auth/login" 
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#4F6EF7] px-10 py-5 text-xl font-bold text-white hover:bg-[#3d59d1] shadow-[0_0_40px_rgba(79,110,247,0.3)] transition-all hover:scale-[1.02]"
            >
              Start your free trial <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
