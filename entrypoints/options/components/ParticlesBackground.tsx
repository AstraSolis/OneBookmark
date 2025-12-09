import { useEffect, useRef, useState } from 'react'
import { getSettings, type BackgroundSettings } from '@/utils/storage'

export function ParticlesBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [background, setBackground] = useState<BackgroundSettings>({ type: 'particles' })

    // 监听设置变化
    useEffect(() => {
        async function loadBackground() {
            const settings = await getSettings()
            setBackground(settings.background || { type: 'particles' })
        }
        loadBackground()

        // 监听 storage 变化
        const handleStorageChange = () => loadBackground()
        browser.storage.onChanged.addListener(handleStorageChange)
        return () => browser.storage.onChanged.removeListener(handleStorageChange)
    }, [])

    // 粒子动画
    useEffect(() => {
        if (background.type !== 'particles') return

        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        let animationFrameId: number
        let particles: Particle[] = []

        const resize = () => {
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
            initParticles()
        }

        class Particle {
            x: number
            y: number
            size: number
            speedX: number
            speedY: number
            color: string

            constructor() {
                this.x = Math.random() * canvas!.width
                this.y = Math.random() * canvas!.height
                this.size = Math.random() * 2 + 0.5
                this.speedX = Math.random() * 1 - 0.5
                this.speedY = Math.random() * 1 - 0.5

                const colors = ['#38bdf8', '#60a5fa', '#f472b6', '#fbbf24']
                this.color = colors[Math.floor(Math.random() * colors.length)]
            }

            update() {
                this.x += this.speedX
                this.y += this.speedY

                if (this.x > canvas!.width) this.x = 0
                if (this.x < 0) this.x = canvas!.width
                if (this.y > canvas!.height) this.y = 0
                if (this.y < 0) this.y = canvas!.height
            }

            draw() {
                if (!ctx) return
                ctx.fillStyle = this.color
                ctx.globalAlpha = 0.6
                ctx.beginPath()
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
                ctx.fill()
            }
        }

        const initParticles = () => {
            particles = []
            const numberOfParticles = Math.floor((canvas.width * canvas.height) / 15000)
            for (let i = 0; i < numberOfParticles; i++) {
                particles.push(new Particle())
            }
        }

        const animate = () => {
            if (!ctx) return
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            particles.forEach(particle => {
                particle.update()
                particle.draw()
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
    }, [background.type])

    // 根据背景类型渲染
    if (background.type === 'none') {
        return null
    }

    if (background.type === 'remote' && background.remoteUrl) {
        return (
            <div
                className="fixed inset-0 pointer-events-none z-0 bg-cover bg-center bg-no-repeat opacity-30"
                style={{ backgroundImage: `url(${background.remoteUrl})` }}
            />
        )
    }

    if (background.type === 'local' && background.localData) {
        return (
            <div
                className="fixed inset-0 pointer-events-none z-0 bg-cover bg-center bg-no-repeat opacity-30"
                style={{ backgroundImage: `url(${background.localData})` }}
            />
        )
    }

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-0 opacity-50"
        />
    )
}
