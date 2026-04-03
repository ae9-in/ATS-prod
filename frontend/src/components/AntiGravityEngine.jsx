import React, { useEffect, useRef, useState, useMemo } from 'react';

/**
 * TALENT OS | ANTI-GRAVITY PHYSICS ENGINE (V1.1)
 * ---------------------------------------------
 * A high-performance, industrial-grade interactive data physics canvas.
 * Features: Verlet Integration, N-Body Attraction, Mouse Interactivity.
 */

// --- 1. MATH HELPERS ---
const MathUtils = {
    clamp: (v, min, max) => Math.min(Math.max(v, min), max),
    distSq: (x1, y1, x2, y2) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return dx * dx + dy * dy;
    },
    lerp: (a, b, t) => a + (b - a) * t,
    random: (min, max) => Math.random() * (max - min) + min,
};

// --- 2. PHYSICS CORE ---

class Particle {
    constructor(id, x, y, mass, stage) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.px = x;
        this.py = y;
        this.mass = mass;
        this.stage = stage;
        this.radius = MathUtils.clamp(mass * 2, 4, 12);
        this.color = '#3B82F6';
        this.alpha = 1;
        this.isRepelling = stage === 'Selected' || stage === 'Joined' || stage === 'Rejected';
    }

    update(dt, friction, gravitySource, mouse) {
        // Verlet Integration
        const vx = (this.x - this.px) * friction;
        const vy = (this.y - this.py) * friction;

        this.px = this.x;
        this.py = this.y;

        // Apply Forces (Gravity/Anti-Gravity)
        if (gravitySource) {
            const dx = gravitySource.x - this.x;
            const dy = gravitySource.y - this.y;
            const dSq = dx * dx + dy * dy + 100;
            const dist = Math.sqrt(dSq);
            const force = (gravitySource.mass * this.mass) / dSq;

            const strength = this.isRepelling ? -force * 5 : force;

            this.x += (dx / dist) * strength * dt;
            this.y += (dy / dist) * strength * dt;
        }

        // Mouse Interaction (Magnetic Pull/Push)
        if (mouse.x !== null) {
            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const dSq = dx * dx + dy * dy;
            const effectiveRadius = 200;

            if (dSq < effectiveRadius * effectiveRadius) {
                const dist = Math.sqrt(dSq);
                const force = (effectiveRadius - dist) / effectiveRadius;
                // Gently pull particles towards mouse, then scatter them if too close
                const pull = force * 2;
                this.x += (dx / dist) * pull;
                this.y += (dy / dist) * pull;

                if (dist < 30) {
                    this.x -= (dx / dist) * 10;
                    this.y -= (dy / dist) * 10;
                }
            }
        }

        this.x += vx;
        this.y += vy;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.alpha;
        ctx.fill();

        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.closePath();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
}

class Attractor {
    constructor(name, x, y, color) {
        this.name = name;
        this.x = x;
        this.y = y;
        this.color = color;
        this.mass = 500;
        this.pulse = 0;
    }

    draw(ctx) {
        this.pulse += 0.05;
        const r = 20 + Math.sin(this.pulse) * 5;

        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r * 2.5);
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.4;
        ctx.fill();
        ctx.closePath();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px font-mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.name.toUpperCase(), this.x, this.y + r + 25);
        ctx.globalAlpha = 1;
    }
}

// --- 3. THE ENGINE COMPONENT ---

const AntiGravityEngine = ({ candidates = [] }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const engineRef = useRef({
        particles: [],
        attractors: [],
        lastTime: 0,
        frameId: null,
        mouse: { x: null, y: null }
    });

    const stages = useMemo(() => [
        { name: 'Added', color: '#94A3B8' },
        { name: 'Screening', color: '#60A5FA' },
        { name: 'Shortlisted', color: '#818CF8' },
        { name: 'Interview', color: '#A78BFA' },
        { name: 'Technical', color: '#C084FC' },
        { name: 'Offered', color: '#F472B6' },
        { name: 'Selected', color: '#10B981' },
        { name: 'Joined', color: '#34D399' },
        { name: 'Rejected', color: '#EF4444' }
    ], []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        const resize = () => {
            const rect = containerRef.current.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const radius = Math.min(rect.width, rect.height) * 0.38;

            engineRef.current.attractors = stages.map((s, i) => {
                const angle = (i / stages.length) * Math.PI * 2;
                return new Attractor(
                    s.name,
                    centerX + Math.cos(angle) * radius,
                    centerY + Math.sin(angle) * radius,
                    s.color
                );
            });
        };

        if (engineRef.current.particles.length === 0) {
            const initialCount = candidates.length || 200;
            const rect = containerRef.current.getBoundingClientRect();
            for (let i = 0; i < initialCount; i++) {
                const stageIdx = Math.floor(Math.random() * stages.length);
                const p = new Particle(
                    i,
                    Math.random() * rect.width,
                    Math.random() * rect.height,
                    Math.random() * 4 + 2,
                    stages[stageIdx].name
                );
                p.color = stages[stageIdx].color;
                engineRef.current.particles.push(p);
            }
        }

        const onMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            engineRef.current.mouse.x = e.clientX - rect.left;
            engineRef.current.mouse.y = e.clientY - rect.top;
        };

        const onMouseLeave = () => {
            engineRef.current.mouse.x = null;
            engineRef.current.mouse.y = null;
        };

        const loop = (time) => {
            const dt = (time - engineRef.current.lastTime) / 16.67 || 1;
            engineRef.current.lastTime = time;

            ctx.fillStyle = '#0A0C10';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Subtle Grid
            ctx.strokeStyle = '#FFFFFF10';
            ctx.lineWidth = 1;
            const gridSize = 50;
            for (let x = 0; x < canvas.width / dpr; x += gridSize) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height / dpr); ctx.stroke();
            }
            for (let y = 0; y < canvas.height / dpr; y += gridSize) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width / dpr, y); ctx.stroke();
            }

            engineRef.current.attractors.forEach(a => a.draw(ctx));

            engineRef.current.particles.forEach(p => {
                const targetAttractor = engineRef.current.attractors.find(a => a.name === p.stage);
                p.update(dt, 0.98, targetAttractor, engineRef.current.mouse);
                p.draw(ctx);

                if (targetAttractor && !p.isRepelling) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(targetAttractor.x, targetAttractor.y);
                    ctx.strokeStyle = p.color;
                    ctx.globalAlpha = 0.05;
                    ctx.stroke();
                    ctx.closePath();
                    ctx.globalAlpha = 1;
                }
            });

            engineRef.current.frameId = requestAnimationFrame(loop);
        };

        window.addEventListener('resize', resize);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseleave', onMouseLeave);
        resize();
        engineRef.current.frameId = requestAnimationFrame(loop);

        return () => {
            window.removeEventListener('resize', resize);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseleave', onMouseLeave);
            cancelAnimationFrame(engineRef.current.frameId);
        };
    }, [stages, candidates]);

    return (
        <div ref={containerRef} className="w-full h-full min-h-[600px] bg-[#0A0C10] relative overflow-hidden rounded-3xl border border-white/5">
            <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" />
        </div>
    );
};

export default AntiGravityEngine;
