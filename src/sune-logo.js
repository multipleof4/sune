// Procedural 16-point Sune starburst SVG generator + animation
// Each spike is its own path for independent animation

const TAU = Math.PI * 2;
const SPIKES = 16;
const CX = 50, CY = 50; // viewBox center
const R_OUTER = 46;      // spike tip radius
const R_INNER = 18;      // valley radius between spikes
const SPIKE_ANGLE = TAU / SPIKES;

function spikePathD(i) {
  const aStart = SPIKE_ANGLE * i - SPIKE_ANGLE / 2;
  const aPeak = SPIKE_ANGLE * i;
  const aEnd = SPIKE_ANGLE * i + SPIKE_ANGLE / 2;
  // Vary spike lengths slightly for organic feel (matches your logo's asymmetry)
  const outerR = R_OUTER - (i % 3 === 0 ? 2 : 0);
  const x0 = CX + R_INNER * Math.cos(aStart);
  const y0 = CY + R_INNER * Math.sin(aStart);
  const x1 = CX + outerR * Math.cos(aPeak);
  const y1 = CY + outerR * Math.sin(aPeak);
  const x2 = CX + R_INNER * Math.cos(aEnd);
  const y2 = CY + R_INNER * Math.sin(aEnd);
  return `M${CX},${CY} L${x0.toFixed(2)},${y0.toFixed(2)} L${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} Z`;
}

/**
 * Create animated Sune logo SVG string
 * @param {object} opts
 * @param {number} opts.size - pixel size (default 32)
 * @param {string} opts.color - fill color (default 'currentColor')
 * @param {boolean} opts.animate - enable animation (default true)
 * @param {string} opts.className - optional CSS class
 * @returns {string} SVG HTML string
 */
export function suneLogo({ size = 32, color = 'currentColor', animate = true, className = '' } = {}) {
  const spikes = Array.from({ length: SPIKES }, (_, i) => {
    const delay = (i * (1.6 / SPIKES)).toFixed(3);
    const style = animate
      ? `animation:sune-spike 1.6s ease-in-out ${delay}s infinite;transform-origin:${CX}px ${CY}px`
      : '';
    return `<path d="${spikePathD(i)}" style="${style}"/>`;
  }).join('');

  const rotateStyle = animate
    ? 'animation:sune-rotate 8s linear infinite'
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"
    width="${size}" height="${size}"
    class="${className}" fill="${color}" aria-label="Sune">
    ${animate ? `<style>
      @keyframes sune-spike {
        0%, 100% { opacity:1; transform:scale(1); }
        50% { opacity:0.5; transform:scale(0.82); }
      }
      @keyframes sune-rotate {
        to { transform:rotate(360deg); }
      }
      @keyframes sune-breathe {
        0%, 100% { transform:scale(0.96); }
        50% { transform:scale(1.04); }
      }
    </style>` : ''}
    <g style="${rotateStyle};transform-origin:${CX}px ${CY}px">
      <g style="${animate ? `animation:sune-breathe 2.4s ease-in-out infinite;transform-origin:${CX}px ${CY}px` : ''}">
        ${spikes}
      </g>
    </g>
  </svg>`;
}

/**
 * Create a DOM element from the logo
 */
export function suneLogoEl(opts) {
  const div = document.createElement('div');
  div.innerHTML = suneLogo(opts);
  return div.firstElementChild;
}

/**
 * Static logo (no animation) for favicons, exports etc
 */
export function suneLogoStatic(opts = {}) {
  return suneLogo({ ...opts, animate: false });
}
