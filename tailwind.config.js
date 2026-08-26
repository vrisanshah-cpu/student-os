/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        base: {
          bg: '#0F1115',
          panel: '#161923',
          card: '#1C2030',
          border: '#282D3F',
          text: '#E7E9F0',
          muted: '#8890A6'
        },
        accent: {
          DEFAULT: '#5B8CFF',
          soft: '#3D5BB5',
          warn: '#F2B84B',
          danger: '#E56B6B',
          good: '#4FD1A5'
        },
        // The "notebook page" - a warm paper tone the note editor sits on,
        // deliberately not stark white so it reads as paper under a desk
        // lamp rather than a browser tab.
        paper: {
          DEFAULT: '#F6F1E7',
          raised: '#FBF8F1',
          rule: '#E4D9C3',
          ink: '#2B2620',
          muted: '#8C8270'
        }
      },
      fontFamily: {
        display: ['"Sora"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        // What you actually write in - a warm text serif, distinct from the
        // geometric sans used for the app chrome around it.
        manuscript: ['"Lora"', 'ui-serif', 'Georgia', 'serif']
      },
      // A strict 7-step type scale for app chrome (Settings, Calendar, Sidebar,
      // buttons) - every size in the app is one of these, nothing arbitrary.
      // Body-weight sizes get generous line-height (1.5-1.6); the compact
      // xs/sm tiers used for chips/labels/meta text stay tighter so pills and
      // badges don't bloat. (The note-taking canvas itself - .tiptap-content
      // in index.css - keeps its own manuscript-style sizing; it's reading a
      // page, not app chrome.)
      fontSize: {
        xs: ['11px', { lineHeight: '1.45' }],
        sm: ['13px', { lineHeight: '1.5' }],
        base: ['15px', { lineHeight: '1.6' }],
        lg: ['17px', { lineHeight: '1.55' }],
        xl: ['22px', { lineHeight: '1.35' }],
        '2xl': ['28px', { lineHeight: '1.25' }],
        '3xl': ['34px', { lineHeight: '1.2' }]
      },
      // Corner radius by tier: sm for controls (buttons/inputs/chips), md for
      // list rows, lg for cards/panels/modals, xl2 for page-level surfaces
      // (the note page). Picked by component size, not per-component whim.
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl2: '1.25rem'
      },
      boxShadow: {
        page: '0 1px 2px rgba(0,0,0,0.35), 0 12px 32px -12px rgba(0,0,0,0.5)',
        elevated: '0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -8px rgba(0,0,0,0.45)'
      },
      transitionDuration: {
        DEFAULT: '160ms'
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)'
      }
    }
  },
  plugins: []
};
