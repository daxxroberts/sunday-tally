'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

export default function PricingPage() {
  const features = [
    "Full access to AI Dashboards",
    "AI Analytics Chat",
    "Unlimited historical data imports",
    "Unlimited members and roles",
    "Smart Metric Roll-ups",
    "Secure Stripe billing"
  ]

  return (
    <div className="py-24 bg-black min-h-screen relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight"
          >
            Simple, transparent pricing.
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-zinc-400 max-w-2xl mx-auto"
          >
            No hidden fees. No complicated tiers. Just one flat rate for your entire church.
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="max-w-lg mx-auto bg-zinc-900/40 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-blue-500/10"
        >
          <div className="p-10 text-center border-b border-white/5">
            <h2 className="text-2xl font-bold text-white mb-2">Church Plan</h2>
            <p className="text-zinc-400 mb-6">Everything you need to run your ministry.</p>
            <div className="flex items-baseline justify-center gap-1 mb-8">
              <span className="text-5xl font-extrabold text-white">$22</span>
              <span className="text-xl text-zinc-500">/mo</span>
            </div>
            <Link 
              href="/auth/login" 
              className="block w-full rounded-2xl bg-white py-4 text-lg font-bold text-black shadow-lg hover:bg-zinc-200 transition-all hover:scale-[1.02]"
            >
              Start 45-Day Free Trial
            </Link>
            <p className="text-sm text-zinc-500 mt-4">No credit card required for trial.</p>
          </div>
          
          <div className="p-10 bg-black/40">
            <h3 className="font-semibold text-white mb-6">What's included:</h3>
            <ul className="space-y-4">
              {features.map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-zinc-300">
                  <CheckCircle2 className="text-blue-500 w-5 h-5 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
