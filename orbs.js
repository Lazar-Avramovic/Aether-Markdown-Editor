// Aether: Organic Background Orb Engine
class OrbEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    
    this.ctx = this.canvas.getContext('2d');
    this.orbs = [];
    this.resizeTimeout = null;
    
    this.init();
  }

  init() {
    this.resizeCanvas();
    this.createOrbs();
    
    // Listen for resize and update canvas sizes
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        this.resizeCanvas();
      }, 100);
    });

    // Start render loop
    this.animate();
  }

  resizeCanvas() {
    // Set internal resolution to exactly half of client size for rendering optimization
    this.width = Math.floor(window.innerWidth / 2);
    this.height = Math.floor(window.innerHeight / 2);
    
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    
    // Scale orbs dynamically if bounds shrink/grow
    if (this.orbs.length > 0) {
      this.orbs.forEach(orb => {
        orb.x = Math.min(orb.x, this.width);
        orb.y = Math.min(orb.y, this.height);
      });
    }
  }

  createOrbs() {
    // Harmonious ambient palettes (HSL for smooth color transitions/transparency)
    // Cyan, Indigo, Violet, Magenta, Orange-Amber
    const colors = [
      { h: 180, s: 80, l: 50, a: 0.15 }, // Cyan
      { h: 220, s: 75, l: 45, a: 0.18 }, // Indigo
      { h: 275, s: 70, l: 50, a: 0.16 }, // Violet
      { h: 320, s: 80, l: 55, a: 0.14 }, // Magenta
      { h: 35,  s: 85, l: 50, a: 0.10 }  // Amber
    ];

    this.orbs = colors.map((color, index) => {
      const baseRadius = Math.min(this.width, this.height) * (0.25 + Math.random() * 0.15);
      return {
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.4, // Micro-velocities (drift)
        vy: (Math.random() - 0.5) * 0.4,
        baseRadius: baseRadius,
        radius: baseRadius,
        color: color,
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.002 + Math.random() * 0.003
      };
    });
  }

  animate() {
    // Clear canvas cleanly
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.orbs.forEach(orb => {
      // Update position with micro-velocities
      orb.x += orb.vx;
      orb.y += orb.vy;

      // Update scale smoothly using sine phase drift
      orb.phase += orb.phaseSpeed;
      orb.radius = orb.baseRadius * (1.0 + Math.sin(orb.phase) * 0.15);

      // Boundary collisions (bounce gracefully with micro-forces)
      if (orb.x - orb.radius < -50) {
        orb.x = -50 + orb.radius;
        orb.vx = Math.abs(orb.vx);
      } else if (orb.x + orb.radius > this.width + 50) {
        orb.x = this.width + 50 - orb.radius;
        orb.vx = -Math.abs(orb.vx);
      }

      if (orb.y - orb.radius < -50) {
        orb.y = -50 + orb.radius;
        orb.vy = Math.abs(orb.vy);
      } else if (orb.y + orb.radius > this.height + 50) {
        orb.y = this.height + 50 - orb.radius;
        orb.vy = -Math.abs(orb.vy);
      }

      // Draw gradient orb
      const gradient = this.ctx.createRadialGradient(
        orb.x, orb.y, 0,
        orb.x, orb.y, orb.radius
      );
      
      const theme = document.documentElement.getAttribute('data-theme') || 'dark';
      const alphaMultiplier = theme === 'light' ? 2.5 : 1.0;
      
      const { h, s, l, a } = orb.color;
      const targetAlpha = Math.min(a * alphaMultiplier, 0.65);
      
      gradient.addColorStop(0, `hsla(${h}, ${s}%, ${l}%, ${targetAlpha})`);
      gradient.addColorStop(0.5, `hsla(${h}, ${s}%, ${l}%, ${targetAlpha * 0.5})`);
      gradient.addColorStop(1, `hsla(${h}, ${s}%, ${l}%, 0)`);

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
      this.ctx.fill();
    });

    requestAnimationFrame(() => this.animate());
  }
}

// Initialise on load
document.addEventListener('DOMContentLoaded', () => {
  window.orbEngine = new OrbEngine('ambient-canvas');
});
