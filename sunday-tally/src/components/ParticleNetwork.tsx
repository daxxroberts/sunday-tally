'use client'

import { useEffect, useRef } from 'react'

export function ParticleNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let particles: Particle[] = []
    const mouse = { x: -1000, y: -1000 }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
    }
    
    // Add mouse tracking globally so we don't block pointer events on underlying elements
    window.addEventListener('mousemove', handleMouseMove)

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      initParticles()
    }

    class Particle {
      x: number
      y: number
      vx: number
      vy: number
      radius: number
      baseX: number
      baseY: number

      constructor() {
        if (!canvas) {
          this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.radius = 1; this.baseX = 0; this.baseY = 0;
          return;
        }
        this.x = Math.random() * canvas.width
        this.y = Math.random() * canvas.height
        this.baseX = this.x
        this.baseY = this.y
        this.vx = (Math.random() - 0.5) * 0.4
        this.vy = (Math.random() - 0.5) * 0.4
        this.radius = Math.random() * 1.5 + 0.5
      }

      update() {
        if (!canvas) return

        // Base movement
        this.x += this.vx
        this.y += this.vy

        // Bounce off walls
        if (this.x < 0 || this.x > canvas.width) this.vx = -this.vx
        if (this.y < 0 || this.y > canvas.height) this.vy = -this.vy

        // Mouse repulsion
        const dx = this.x - mouse.x
        const dy = this.y - mouse.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const maxDist = 350 // Increased blast radius

        if (distance < maxDist) {
          const forceDirectionX = dx / distance
          const forceDirectionY = dy / distance
          const force = (maxDist - distance) / maxDist
          // Phobia push
          const pushX = forceDirectionX * force * 3 // Slightly stronger push
          const pushY = forceDirectionY * force * 3
          this.x += pushX
          this.y += pushY
        }
      }

      draw() {
        if (!ctx) return
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)

        const dx = this.x - mouse.x
        const dy = this.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < 450) { // Increased reveal radius
          const intensity = 1 - (dist / 450)
          // Interpolate to #4F6EF7 (79, 110, 247)
          ctx.fillStyle = `rgba(${120 + (79 - 120) * intensity}, ${113 + (110 - 113) * intensity}, ${108 + (247 - 108) * intensity}, ${0.5 + intensity * 0.5})`
        } else {
          ctx.fillStyle = 'rgba(120, 113, 108, 0.5)'
        }
        ctx.fill()
      }
    }

    const initParticles = () => {
      particles = []
      // Triple the density
      const numParticles = Math.floor((canvas.width * canvas.height) / 2000)
      for (let i = 0; i < Math.min(numParticles, 500); i++) {
        particles.push(new Particle())
      }
    }

    const drawLines = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 100) {
            const midX = (particles[i].x + particles[j].x) / 2
            const midY = (particles[i].y + particles[j].y) / 2
            const mouseDx = midX - mouse.x
            const mouseDy = midY - mouse.y
            const mouseDist = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy)

            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)

            if (mouseDist < 250) {
              const intensity = 1 - (mouseDist / 250)
              ctx.strokeStyle = `rgba(${120 + (79 - 120) * intensity}, ${113 + (110 - 113) * intensity}, ${108 + (247 - 108) * intensity}, ${0.15 - distance / 666 + intensity * 0.4})`
            } else {
              ctx.strokeStyle = `rgba(120, 113, 108, ${0.15 - distance / 666})`
            }
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      particles.forEach(p => {
        p.update()
        p.draw()
      })
      
      drawLines()
      animationFrameId = requestAnimationFrame(animate)
    }

    window.addEventListener('resize', resize)
    resize()
    animate()

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
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
