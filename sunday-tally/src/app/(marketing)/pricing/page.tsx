'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { ParticleNetwork } from '@/components/ParticleNetwork'

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
    <div className="py-24 bg-[#FAFAFA] min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <ParticleNetwork />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-bold text-stone-900 mb-6 tracking-tight"
          >
            Simple, transparent pricing.
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-stone-500 max-w-2xl mx-auto"
          >
            No hidden fees. No complicated tiers. Just one flat rate for your entire church.
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="max-w-lg mx-auto bg-white/80 backdrop-blur-xl border border-stone-200 rounded-3xl overflow-hidden shadow-2xl shadow-stone-200/50"
        >
          <div className="p-10 text-center border-b border-stone-100">
            <h2 className="text-2xl font-bold text-stone-900 mb-2">Church Plan</h2>
            <p className="text-stone-500 mb-6">Everything you need to run your ministry.</p>
            <div className="flex items-baseline justify-center gap-1 mb-8">
              <span className="text-5xl font-extrabold text-stone-900">$22</span>
              <span className="text-xl text-stone-400">/mo</span>
            </div>
            <Link 
              href="/auth/login" 
              className="block w-full rounded-2xl bg-stone-900 py-4 text-lg font-bold text-white shadow-lg hover:bg-stone-800 transition-all hover:scale-[1.02]"
            >
              Start 45-Day Free Trial
            </Link>
            <p className="text-sm text-stone-400 mt-4">No credit card required for trial.</p>
          </div>
          
          <div className="p-10 bg-stone-50/50">
            <h3 className="font-semibold text-stone-900 mb-6">What's included:</h3>
            <ul className="space-y-4">
              {features.map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-stone-600">
                  <CheckCircle2 className="text-stone-900 w-5 h-5 flex-shrink-0" />
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
