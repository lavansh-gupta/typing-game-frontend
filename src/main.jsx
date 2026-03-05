import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const initInteractiveFavicon = () => {
  if (typeof document === 'undefined') return;

  const favicon = document.getElementById('dynamic-favicon');
  if (!favicon) return;

  const canvas = document.createElement('canvas');
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const draw = (t) => {
    const time = t / 1000;
    const center = size / 2;
    const pulse = 2 + Math.sin(time * 4) * 2;
    const hue = Math.floor((time * 90) % 360);

    ctx.clearRect(0, 0, size, size);

    const bg = ctx.createRadialGradient(center, center, 8, center, center, 30);
    bg.addColorStop(0, `hsl(${hue}, 95%, 62%)`);
    bg.addColorStop(1, '#0b0f14');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(center, center, 29, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `hsla(${(hue + 140) % 360}, 95%, 65%, 0.95)`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(center, center, 19 + pulse, -Math.PI / 2, Math.PI * 1.4);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', center, center + 1);

    favicon.href = canvas.toDataURL('image/png');
    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
};

initInteractiveFavicon();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
