'use client'

import { motion } from 'framer-motion'
import { useRef } from 'react'
import { ParticleNetwork } from '@/components/ParticleNetwork'

export default function FeaturesPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  
  const features = [
    {
      title: "Custom Dashboards",
      description: "Stop relying on rigid reports built by someone else. Tell the AI what you want to see. It builds the exact chart you need right in front of you."
    },
    {
      title: "Instant Answers",
      description: "Treat your database like a conversation. Ask 'How does Q3 giving compare to last year?' or 'Are our LifeKids numbers growing alongside adult attendance?' Get your answer immediately."
    },
    {
      title: "Painless Imports",
      description: "You don't have to manually re-enter years of history. Hand us your massive Google Sheet. The AI maps your columns and pulls everything in automatically."
    }
  ]

  return (
    <div className="bg-[#FAFAFA] min-h-screen text-stone-900">
      {/* Hero */}
      <div className="pt-40 pb-20 px-4 md:px-8 max-w-5xl mx-auto text-center relative z-10">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tighter text-stone-900"
        >
          Magic is fake. <br className="hidden md:block" />
          This is just good engineering.
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="text-xl text-stone-500 max-w-2xl mx-auto leading-relaxed"
        >
          We tore down the old way of counting people and built something that actually works.
        </motion.p>
      </div>

      {/* Sticky Scroll Section */}
      <div ref={containerRef} className="relative container mx-auto px-4 md:px-8 max-w-7xl pb-32">
        <div className="flex flex-col md:flex-row gap-12 items-start relative">
          
          {/* Left Text Side (Sticky) */}
          <div className="md:w-1/2 md:sticky md:top-40 md:h-[calc(100vh-10rem)] flex flex-col justify-center space-y-12 py-12 md:py-0">
            {features.map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0.3 }}
                whileInView={{ opacity: 1 }}
                viewport={{ margin: "-30% 0px -30% 0px", once: false }}
                transition={{ duration: 0.5 }}
              >
                <div className="w-12 h-1 bg-stone-900 mb-6" />
                <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">{feature.title}</h2>
                <p className="text-xl text-stone-500 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Right Image Side (Scrolling) */}
          <div className="md:w-1/2 space-y-[20vh]">
            {features.map((_, i) => (
              <div key={i} className="aspect-square relative rounded-[2rem] overflow-hidden border border-stone-200 bg-white shadow-lg">
                <ParticleNetwork />
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
