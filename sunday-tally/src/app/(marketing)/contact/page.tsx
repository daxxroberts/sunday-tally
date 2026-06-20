'use client'

import { motion } from 'framer-motion'
import { Mail, MessageSquare, ArrowRight } from 'lucide-react'

export default function ContactPage() {
  return (
    <div className="py-24 bg-black min-h-screen">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight"
          >
            We're here to help.
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-zinc-400"
          >
            Have a question about Sunday Tally or need help with a custom rollout? Let's talk.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-zinc-900/40 border border-white/5 p-8 rounded-3xl"
          >
            <div className="w-12 h-12 bg-blue-600/10 text-blue-400 rounded-xl flex items-center justify-center mb-6 border border-blue-500/20">
              <Mail size={24} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Email Support</h3>
            <p className="text-zinc-400 mb-8">
              We aim to respond to all inquiries within 24 hours.
            </p>
            <a 
              href="mailto:support@sundaytally.com" 
              className="inline-flex items-center gap-2 text-blue-400 font-semibold hover:text-blue-300 transition-colors"
            >
              support@sundaytally.com <ArrowRight size={18} />
            </a>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-zinc-900/40 border border-white/5 p-8 rounded-3xl"
          >
            <div className="w-12 h-12 bg-sky-500/10 text-sky-400 rounded-xl flex items-center justify-center mb-6 border border-sky-500/20">
              <MessageSquare size={24} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">In-App Chat</h3>
            <p className="text-zinc-400 mb-8">
              Current customers can use the in-app chat widget for faster support during business hours.
            </p>
            <div className="inline-flex items-center gap-2 text-zinc-500 font-medium">
              Available Monday - Friday
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
