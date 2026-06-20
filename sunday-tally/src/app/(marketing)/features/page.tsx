'use client'

import { motion } from 'framer-motion'
import { Bot, LineChart, BrainCircuit, Workflow, LayoutDashboard, CloudLightning } from 'lucide-react'

export default function FeaturesPage() {
  const features = [
    {
      title: "Custom Dashboards",
      description: "Stop relying on rigid reports built by someone else. Tell the AI what you want to see. It builds the exact chart you need right in front of you.",
      icon: <LayoutDashboard className="w-8 h-8 text-blue-500" />
    },
    {
      title: "Instant Answers",
      description: "Treat your database like a conversation. Ask 'How does Q3 giving compare to last year?' or 'Are our LifeKids numbers growing alongside adult attendance?' Get your answer immediately.",
      icon: <Bot className="w-8 h-8 text-blue-500" />
    },
    {
      title: "Painless Imports",
      description: "You don't have to manually re-enter years of history. Hand us your massive Google Sheet. The AI maps your columns and pulls everything in automatically.",
      icon: <CloudLightning className="w-8 h-8 text-blue-500" />
    },
    {
      title: "Accurate Averages",
      description: "A week off is a blank. A bad week is a zero. The system knows the difference. It handles the complex math so your averages stay accurate without any manual intervention.",
      icon: <LineChart className="w-8 h-8 text-blue-500" />
    },
    {
      title: "Unified Giving",
      description: "Merge your app giving, online giving, and plate giving into a single metric. The system totals them without double-counting.",
      icon: <Workflow className="w-8 h-8 text-blue-500" />
    },
    {
      title: "Sensible Architecture",
      description: "Top-level ministries get their own dashboard cards. Nested groups roll up automatically. The software mirrors how modern churches actually operate.",
      icon: <BrainCircuit className="w-8 h-8 text-blue-500" />
    }
  ]

  return (
    <div className="py-24 bg-black min-h-screen">
      <div className="container mx-auto px-4 md:px-8 max-w-6xl">
        <div className="text-center mb-20">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight"
          >
            Magic is fake. <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-sky-300">This is just good engineering.</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-zinc-400 max-w-2xl mx-auto"
          >
            We tore down the old way of counting people and built something that actually works.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="p-8 rounded-3xl bg-zinc-900/40 border border-white/5 hover:bg-zinc-900/80 hover:border-white/10 transition-all group"
            >
              <div className="w-16 h-16 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform border border-blue-500/20">
                {feature.icon}
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">{feature.title}</h3>
              <p className="text-zinc-400 leading-relaxed text-lg">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
