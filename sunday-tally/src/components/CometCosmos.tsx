'use client'

import { useEffect, useRef } from 'react'

export function CometCosmos() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let comets: Comet[] = []

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      initComets()
    }

    class Comet {
      x: number
      y: number
      vx: number
      vy: number
      radius: number
      opacity: number
      trail: { x: number; y: number }[]
      maxTrailLength: number

      constructor() {
        this.x = 0
        this.y = 0
        this.vx = 0
        this.vy = 0
        this.radius = 0
        this.opacity = 0
        this.trail = []
        this.maxTrailLength = 15
        this.reset(true)
      }

      reset(init = false) {
        if (!canvas) return
        this.radius = Math.random() * 1.5 + 0.8
        this.opacity = Math.random() * 0.4 + 0.3
        this.maxTrailLength = Math.floor(Math.random() * 12) + 8
        this.trail = []
        
        // Cosmic movement: flying diagonally from top-right to bottom-left
        this.vx = -(Math.random() * 2.2 + 1.2)
        this.vy = Math.random() * 1.2 + 0.6

        if (init) {
          this.x = Math.random() * canvas.width
          this.y = Math.random() * canvas.height
          // Pre-populate trail for smooth initial render
          for (let i = 0; i < this.maxTrailLength; i++) {
            this.trail.push({
              x: this.x + this.vx * (i - this.maxTrailLength),
              y: this.y + this.vy * (i - this.maxTrailLength)
            })
          }
        } else {
          // Spawn on the top or right edges
          if (Math.random() > 0.5) {
            this.x = canvas.width + 20
            this.y = Math.random() * canvas.height * 0.6
          } else {
            this.x = Math.random() * canvas.width * 0.6 + canvas.width * 0.4
            this.y = -20
          }
        }
      }

      update() {
        if (!canvas) return

        // Push current position to trail
        this.trail.push({ x: this.x, y: this.y })
        if (this.trail.length > this.maxTrailLength) {
          this.trail.shift()
        }

        this.x += this.vx
        this.y += this.vy

        // Reset if it goes off screen (bottom or left)
        if (this.x < -40 || this.y > canvas.height + 40) {
          this.reset()
        }
      }

      draw() {
        if (!ctx) return

        // Draw trail
        for (let i = 0; i < this.trail.length; i++) {
          const point = this.trail[i]
          const ratio = i / this.trail.length // Fades from 0 (tail) to 1 (head)
          ctx.beginPath()
          ctx.arc(point.x, point.y, this.radius * (0.3 + 0.7 * ratio), 0, Math.PI * 2)
          // Draw trail in white color with fading opacity
          ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity * ratio * 0.4})`
          ctx.fill()
        }

        // Draw head
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`
        ctx.fill()
      }
    }

    const initComets = () => {
      comets = []
      // Standard density of comets
      const numComets = Math.floor((canvas.width * canvas.height) / 12000)
      for (let i = 0; i < Math.min(numComets, 60); i++) {
        comets.push(new Comet())
      }
    }

    const animate = () => {
      if (!canvas || !ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      comets.forEach(c => {
        c.update()
        c.draw()
      })

      animationFrameId = requestAnimationFrame(animate)
    }

    window.addEventListener('resize', resize)
    resize()
    animate()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  )
}

