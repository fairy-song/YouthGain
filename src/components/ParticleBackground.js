import React, { useEffect, useRef } from 'react';

const ParticleBackground = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        // Set canvas to full screen
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // Mouse position
        let mouse = { x: null, y: null, radius: 150 };

        const handleMouseMove = (event) => {
            mouse.x = event.x;
            mouse.y = event.y;
        };

        // Set mouse position far away when mouse leaves the window
        const handleMouseOut = () => {
            mouse.x = null;
            mouse.y = null;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseout', handleMouseOut);

        // Click effect to scatter particles
        const handleClick = (event) => {
            if (!mouse.x || !mouse.y) return;
            for (let i = 0; i < particles.length; i++) {
                let dx = particles[i].x - mouse.x;
                let dy = particles[i].y - mouse.y;
                let distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 300) {
                    particles[i].dx = (dx / distance) * (Math.random() * 15 + 5);
                    particles[i].dy = (dy / distance) * (Math.random() * 15 + 5);
                }
            }
        };
        window.addEventListener('click', handleClick);

        // Particle settings
        const particles = [];
        const numParticles = Math.min((window.innerWidth * window.innerHeight) / 8000, 200); // density increased slightly

        class Particle {
            constructor(x, y, dx, dy, size, color) {
                this.x = x;
                this.y = y;
                this.dx = dx;
                this.dy = dy;
                this.size = size;
                this.color = color;
                // for ease back to place if needed, but here they just bounce around
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
                ctx.fillStyle = this.color;
                ctx.fill();

                // Add a slight glow
                ctx.shadowBlur = 10;
                ctx.shadowColor = this.color;
            }

            update() {
                // Bounce off edges
                if (this.x > canvas.width || this.x < 0) this.dx = -this.dx;
                if (this.y > canvas.height || this.y < 0) this.dy = -this.dy;

                this.x += this.dx;
                this.y += this.dy;

                // Mouse interaction (attract when near, repel when very close)
                if (mouse.x && mouse.y) {
                    let dx = mouse.x - this.x;
                    let dy = mouse.y - this.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    const maxDistance = 250;

                    if (distance < maxDistance) {
                        const forceDirectionX = dx / distance;
                        const forceDirectionY = dy / distance;
                        let force = (maxDistance - distance) / maxDistance;

                        if (distance < 70) {
                            // Repel strongly if too close
                            this.x -= forceDirectionX * force * 5;
                            this.y -= forceDirectionY * force * 5;
                        } else {
                            // Attract gently otherwise
                            this.x += forceDirectionX * force * 2;
                            this.y += forceDirectionY * force * 2;
                        }
                    }
                }

                this.draw();
            }
        }

        const initParticles = () => {
            particles.length = 0;
            for (let i = 0; i < numParticles; i++) {
                let size = Math.random() * 2 + 1;
                let x = Math.random() * canvas.width;
                let y = Math.random() * canvas.height;
                let dx = (Math.random() - 0.5) * 1.5;
                let dy = (Math.random() - 0.5) * 1.5;
                // Tech colors: Blues, Cyans, Purples
                const colors = ['rgba(var(--yg-primary-rgb), 0.7)', 'rgba(54, 185, 204, 0.7)', 'rgba(111, 66, 193, 0.7)', 'rgba(255, 255, 255, 0.8)'];
                let color = colors[Math.floor(Math.random() * colors.length)];

                particles.push(new Particle(x, y, dx, dy, size, color));
            }
        };

        const connectParticles = () => {
            let opacityValue = 1;
            for (let a = 0; a < particles.length; a++) {
                for (let b = a; b < particles.length; b++) {
                    let dx = particles[a].x - particles[b].x;
                    let dy = particles[a].y - particles[b].y;
                    let distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 100) {
                        opacityValue = 1 - (distance / 100);
                        ctx.strokeStyle = `rgba(160, 190, 255, ${opacityValue * 0.3})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(particles[a].x, particles[a].y);
                        ctx.lineTo(particles[b].x, particles[b].y);
                        ctx.stroke();
                    }
                }

                // Connect to mouse as well
                if (mouse.x && mouse.y) {
                    let dxMouse = particles[a].x - mouse.x;
                    let dyMouse = particles[a].y - mouse.y;
                    let distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
                    if (distMouse < mouse.radius) {
                        opacityValue = 1 - (distMouse / mouse.radius);
                        ctx.strokeStyle = `rgba(111, 200, 255, ${opacityValue * 0.6})`; // Brighter connection to mouse
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(particles[a].x, particles[a].y);
                        ctx.lineTo(mouse.x, mouse.y);
                        ctx.stroke();
                    }
                }
            }
        };

        const animate = () => {
            // Create trailing effect by drawing semi-transparent black rect instead of clearing
            ctx.fillStyle = 'rgba(10, 15, 30, 0.8)'; // Dark premium background
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
            }
            connectParticles();

            animationFrameId = requestAnimationFrame(animate);
        };

        initParticles();
        animate();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseout', handleMouseOut);
            window.removeEventListener('click', handleClick);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
                pointerEvents: 'none', // so it doesn't block clicks
            }}
        />
    );
};

export default ParticleBackground;
