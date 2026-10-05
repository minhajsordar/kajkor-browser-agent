/**
 * Starter banner templates. Each is a plain element TREE — the same shape
 * the AI agent emits — so `normalizeBanner` converts them into builderData
 * on insert. Positions are authored for 1200x628; the normalizer applies
 * the current canvas size, so tweak elements after applying.
 */

export interface BannerTemplate {
  id: string;
  name: string;
  /** small preview swatch shown in the gallery */
  swatch: string;
  tree: { styles: Record<string, string>; children: any[] };
}

const abs = (l: number, t: number, extra: Record<string, string> = {}) => ({
  position: 'absolute',
  left: `${l}px`,
  top: `${t}px`,
  ...extra,
});

export const BANNER_TEMPLATES: BannerTemplate[] = [
  {
    id: 'midnight-sale',
    name: 'Midnight Sale',
    swatch: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)',
    tree: {
      styles: { background: 'linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)' },
      children: [
        {
          tag: 'div',
          styles: abs(0, 0, { width: '1200px', height: '628px', background: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.12), transparent 45%)' }),
        },
        {
          tag: 'p',
          text: 'LIMITED TIME',
          styles: abs(80, 90, { 'font-size': '18px', 'letter-spacing': '6px', color: '#f59e0b', 'font-family': 'Arial, sans-serif' }),
        },
        {
          tag: 'h1',
          text: 'SUMMER SALE',
          styles: abs(76, 130, { 'font-size': '110px', 'font-weight': '800', color: '#ffffff', 'font-family': 'Arial, sans-serif', 'line-height': '1.05' }),
        },
        {
          tag: 'p',
          text: 'Up to 60% off everything — this weekend only.',
          styles: abs(80, 280, { 'font-size': '26px', color: 'rgba(255,255,255,0.8)', 'font-family': 'Arial, sans-serif' }),
        },
        {
          tag: 'button',
          text: 'SHOP NOW',
          styles: abs(80, 380, { 'font-size': '22px', 'font-weight': '700', color: '#1a1a1a', 'background-color': '#f59e0b', border: 'none', 'border-radius': '8px', padding: '18px 48px', 'font-family': 'Arial, sans-serif', cursor: 'pointer' }),
        },
      ],
    },
  },
  {
    id: 'product-spotlight',
    name: 'Product Spotlight',
    swatch: 'linear-gradient(90deg,#f6f7fb 50%,#dfe6f3 50%)',
    tree: {
      styles: { 'background-color': '#f6f7fb' },
      children: [
        {
          tag: 'img',
          attributes: { src: 'https://picsum.photos/seed/product/560/628', alt: 'Product' },
          styles: abs(0, 0, { width: '560px', height: '628px', 'object-fit': 'cover' }),
        },
        {
          tag: 'p',
          text: 'NEW ARRIVAL',
          styles: abs(620, 120, { 'font-size': '16px', 'letter-spacing': '5px', color: '#6366f1', 'font-family': 'Arial, sans-serif' }),
        },
        {
          tag: 'h1',
          text: 'The everyday carry, refined.',
          styles: abs(620, 160, { width: '520px', 'font-size': '52px', 'font-weight': '700', color: '#111827', 'font-family': 'Georgia, serif', 'line-height': '1.15' }),
        },
        {
          tag: 'p',
          text: 'Crafted from recycled materials. Built to last a decade.',
          styles: abs(620, 320, { width: '480px', 'font-size': '20px', color: '#6b7280', 'font-family': 'Arial, sans-serif', 'line-height': '1.5' }),
        },
        {
          tag: 'button',
          text: 'DISCOVER',
          styles: abs(620, 430, { 'font-size': '18px', 'font-weight': '600', color: '#ffffff', 'background-color': '#111827', border: 'none', 'border-radius': '6px', padding: '16px 40px', 'font-family': 'Arial, sans-serif', cursor: 'pointer' }),
        },
      ],
    },
  },
  {
    id: 'minimal-notice',
    name: 'Minimal Notice',
    swatch: '#fafaf7',
    tree: {
      styles: { 'background-color': '#fafaf7' },
      children: [
        {
          tag: 'div',
          styles: abs(560, 80, { width: '80px', height: '4px', 'background-color': '#111111' }),
        },
        {
          tag: 'h1',
          text: 'We are back in stock.',
          styles: abs(300, 180, { width: '600px', 'text-align': 'center', 'font-size': '64px', 'font-weight': '600', color: '#111111', 'font-family': 'Georgia, serif' }),
        },
        {
          tag: 'p',
          text: 'Thank you for waiting. Everything you love, restocked today.',
          styles: abs(350, 330, { width: '500px', 'text-align': 'center', 'font-size': '20px', color: '#666666', 'font-family': 'Arial, sans-serif' }),
        },
        {
          tag: 'button',
          text: 'BROWSE',
          styles: abs(520, 430, { 'font-size': '16px', 'letter-spacing': '3px', color: '#111111', 'background-color': 'transparent', border: '2px solid #111111', 'border-radius': '0px', padding: '14px 44px', 'font-family': 'Arial, sans-serif', cursor: 'pointer' }),
        },
      ],
    },
  },
  {
    id: 'neon-promo',
    name: 'Neon Promo',
    swatch: 'linear-gradient(120deg,#7c3aed,#db2777)',
    tree: {
      styles: { background: 'linear-gradient(120deg,#7c3aed 0%,#db2777 100%)' },
      children: [
        {
          tag: 'div',
          styles: abs(900, -60, { width: '400px', height: '400px', 'border-radius': '50%', background: 'rgba(255,255,255,0.15)' }),
        },
        {
          tag: 'div',
          styles: abs(80, 80, { 'background-color': 'rgba(255,255,255,0.2)', 'border-radius': '20px', padding: '8px 20px' }),
          children: [
            { tag: 'span', text: 'FLASH DEAL', styles: { 'font-size': '14px', 'letter-spacing': '4px', color: '#ffffff', 'font-family': 'Arial, sans-serif' } },
          ],
        },
        {
          tag: 'h1',
          text: '48 HOURS ONLY',
          styles: abs(80, 150, { 'font-size': '84px', 'font-weight': '800', color: '#ffffff', 'font-family': 'Arial, sans-serif' }),
        },
        {
          tag: 'p',
          text: 'Extra 25% off at checkout with code NEON25',
          styles: abs(82, 270, { 'font-size': '24px', color: 'rgba(255,255,255,0.9)', 'font-family': 'Arial, sans-serif' }),
        },
        {
          tag: 'button',
          text: 'CLAIM OFFER',
          styles: abs(80, 360, { 'font-size': '20px', 'font-weight': '700', color: '#7c3aed', 'background-color': '#ffffff', border: 'none', 'border-radius': '30px', padding: '16px 44px', 'font-family': 'Arial, sans-serif', cursor: 'pointer' }),
        },
      ],
    },
  },
  {
    id: 'event-photo',
    name: 'Event Photo',
    swatch: 'linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5)),#334155',
    tree: {
      styles: {},
      children: [
        {
          tag: 'img',
          attributes: { src: 'https://picsum.photos/seed/concert/1200/628', alt: 'Event' },
          styles: abs(0, 0, { width: '1200px', height: '628px', 'object-fit': 'cover' }),
        },
        {
          tag: 'div',
          styles: abs(0, 0, { width: '1200px', height: '628px', background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.75) 100%)' }),
        },
        {
          tag: 'p',
          text: 'SAT · JUNE 21 · 8PM',
          styles: abs(80, 400, { 'font-size': '18px', 'letter-spacing': '4px', color: '#fbbf24', 'font-family': 'Arial, sans-serif' }),
        },
        {
          tag: 'h1',
          text: 'LIVE UNDER THE STARS',
          styles: abs(76, 440, { 'font-size': '58px', 'font-weight': '800', color: '#ffffff', 'font-family': 'Arial, sans-serif' }),
        },
        {
          tag: 'button',
          text: 'GET TICKETS',
          styles: abs(80, 530, { 'font-size': '18px', 'font-weight': '700', color: '#000000', 'background-color': '#fbbf24', border: 'none', 'border-radius': '6px', padding: '14px 40px', 'font-family': 'Arial, sans-serif', cursor: 'pointer' }),
        },
      ],
    },
  },
  {
    id: 'app-download',
    name: 'App Promo',
    swatch: 'linear-gradient(135deg,#0ea5e9,#1e293b)',
    tree: {
      styles: { background: 'linear-gradient(135deg,#0ea5e9 0%,#1e293b 100%)' },
      children: [
        {
          tag: 'h1',
          text: 'Your plans, everywhere.',
          styles: abs(80, 140, { width: '560px', 'font-size': '58px', 'font-weight': '800', color: '#ffffff', 'font-family': 'Arial, sans-serif', 'line-height': '1.15' }),
        },
        {
          tag: 'p',
          text: 'Download the app and sync across every device.',
          styles: abs(82, 290, { width: '500px', 'font-size': '22px', color: 'rgba(255,255,255,0.85)', 'font-family': 'Arial, sans-serif' }),
        },
        {
          tag: 'button',
          text: ' App Store',
          styles: abs(80, 400, { 'font-size': '18px', 'font-weight': '600', color: '#ffffff', 'background-color': 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.5)', 'border-radius': '10px', padding: '14px 28px', 'font-family': 'Arial, sans-serif', cursor: 'pointer' }),
        },
        {
          tag: 'button',
          text: '▶ Google Play',
          styles: abs(280, 400, { 'font-size': '18px', 'font-weight': '600', color: '#ffffff', 'background-color': 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.5)', 'border-radius': '10px', padding: '14px 28px', 'font-family': 'Arial, sans-serif', cursor: 'pointer' }),
        },
        {
          tag: 'img',
          attributes: { src: 'https://picsum.photos/seed/phone/360/560', alt: 'App screenshot' },
          styles: abs(760, 60, { width: '300px', height: '500px', 'object-fit': 'cover', 'border-radius': '24px', 'box-shadow': '0 24px 60px rgba(0,0,0,0.4)' }),
        },
      ],
    },
  },
];
