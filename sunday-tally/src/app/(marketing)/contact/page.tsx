'use client'

import { motion } from 'framer-motion'
import { Mail, MessageSquare, ArrowRight } from 'lucide-react'
import { ParticleNetwork } from '@/components/ParticleNetwork'

export default function ContactPage() {
  return (
    <div className="py-24 bg-[#FAFAFA] min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <ParticleNetwork />
      </div>

      <div className="container mx-auto px-4 max-w-4xl relative z-10">
        <div className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-bold text-stone-900 mb-6 tracking-tight"
          >
            We're here to help.
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-stone-500"
          >
            Have a question about Sunday Tally or need help with a custom rollout? Let's talk.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white border border-stone-200 p-8 rounded-3xl shadow-sm"
          >
            <div className="w-12 h-12 bg-stone-100 text-stone-900 rounded-xl flex items-center justify-center mb-6 border border-stone-200">
              <Mail size={24} />
            </div>
            <h3 className="text-2xl font-bold text-stone-900 mb-3">Email Support</h3>
            <p className="text-stone-500 mb-8">
              We aim to respond to all inquiries within 24 hours.
            </p>
            <a 
              href="mailto:support@sundaytally.com" 
              className="inline-flex items-center gap-2 text-stone-900 font-semibold hover:text-stone-600 transition-colors"
            >
              support@sundaytally.com <ArrowRight size={18} />
            </a>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white border border-stone-200 p-8 rounded-3xl shadow-sm"
          >
            <div className="w-12 h-12 bg-stone-100 text-stone-900 rounded-xl flex items-center justify-center mb-6 border border-stone-200">
              <MessageSquare size={24} />
            </div>
            <h3 className="text-2xl font-bold text-stone-900 mb-3">In-App Chat</h3>
            <p className="text-stone-500 mb-8">
              Current customers can use the in-app chat widget for faster support during business hours.
            </p>
            <div className="inline-flex items-center gap-2 text-stone-400 font-medium">
              Available Monday - Friday
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
