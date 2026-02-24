export const SUNE_LOGO_SVG = `
<div class="flex items-center justify-start py-1 opacity-80">
  <style>
    .s-spikes-pulse { transform-origin: 50px 50px; animation: s-rapid 0.35s infinite; }
    @keyframes s-rapid {
      0%, 100% { transform: scale(1); animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
      50% { transform: scale(0.6); animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
    }
  </style>
  <svg viewBox="0 0 100 100" class="w-10 h-10 text-black">
    <defs>
      <polygon id="s-spike-gen" points="47,50 50,2 53,50"/>
      <g id="s-spikes-gen">
        <use href="#s-spike-gen"/><use href="#s-spike-gen" transform="rotate(22.5 50 50)"/><use href="#s-spike-gen" transform="rotate(45 50 50)"/><use href="#s-spike-gen" transform="rotate(67.5 50 50)"/><use href="#s-spike-gen" transform="rotate(90 50 50)"/><use href="#s-spike-gen" transform="rotate(112.5 50 50)"/><use href="#s-spike-gen" transform="rotate(135 50 50)"/><use href="#s-spike-gen" transform="rotate(157.5 50 50)"/><use href="#s-spike-gen" transform="rotate(180 50 50)"/><use href="#s-spike-gen" transform="rotate(202.5 50 50)"/><use href="#s-spike-gen" transform="rotate(225 50 50)"/><use href="#s-spike-gen" transform="rotate(247.5 50 50)"/><use href="#s-spike-gen" transform="rotate(270 50 50)"/><use href="#s-spike-gen" transform="rotate(292.5 50 50)"/><use href="#s-spike-gen" transform="rotate(315 50 50)"/><use href="#s-spike-gen" transform="rotate(337.5 50 50)"/>
      </g>
    </defs>
    <circle cx="50" cy="50" r="14" fill="currentColor"/>
    <use href="#s-spikes-gen" class="s-spikes-pulse" fill="currentColor"/>
  </svg>
</div>
`;
