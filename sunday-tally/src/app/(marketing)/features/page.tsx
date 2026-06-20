'use client'

import { motion } from 'framer-motion'
import { ParticleNetwork } from '@/components/ParticleNetwork'

export default function FeaturesPage() {
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
    <div className="bg-[#FAFAFA] min-h-screen text-stone-900 relative">
      {/* Fixed Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <ParticleNetwork />
      </div>

      <div className="relative z-10">
        {/* Hero */}
        <div className="pt-40 pb-20 px-4 md:px-8 max-w-5xl mx-auto text-center">
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

        {/* Feature Blocks */}
        <div className="container mx-auto px-4 md:px-8 max-w-4xl pb-32 space-y-32">
          {features.map((feature, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ margin: "-20% 0px -20% 0px", once: true }}
              transition={{ duration: 0.7 }}
              className="bg-white/70 backdrop-blur-xl border border-stone-200 rounded-3xl p-10 md:p-16 shadow-xl shadow-stone-200/50 text-center"
            >
              <div className="w-12 h-1 bg-stone-900 mb-8 mx-auto" />
              <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-stone-900">{feature.title}</h2>
              <p className="text-xl text-stone-600 leading-relaxed max-w-2xl mx-auto">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
