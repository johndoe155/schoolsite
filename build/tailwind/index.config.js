/* Extracted verbatim from the inline tailwind.config in public/index.html,
   which used to be handed to the Tailwind Play CDN at runtime. Kept as a
   real config so the stylesheet can be built at deploy time instead. */
module.exports = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Montserrat', 'system-ui', 'sans-serif'],
            display: ['Libre Baskerville', 'Georgia', 'serif'],
            statement: ['Abril Fatface', 'Georgia', 'serif'],
            brand: ['Montserrat', 'sans-serif'],
            serif: ['Libre Baskerville', 'Georgia', 'serif'],
          },
          colors: {
            brand: {
              indigo: '#05014a',
              yellow: '#FACC15',
              dark: '#0f172a',
              cream: '#F3EFE5',
              stone: '#E4DCCB',
            }
          },
          borderRadius: { '3xl': '1.5rem', '4xl': '2rem' },
          keyframes: {
            fadeInUp:   { '0%': { opacity:'0', transform:'translateY(32px)' }, '100%': { opacity:'1', transform:'translateY(0)' } },
            fadeInLeft: { '0%': { opacity:'0', transform:'translateX(-32px)' }, '100%': { opacity:'1', transform:'translateX(0)' } },
            fadeInRight:{ '0%': { opacity:'0', transform:'translateX(32px)' }, '100%': { opacity:'1', transform:'translateX(0)' } },
            drawLine:   { '0%': { transform:'scaleY(0)' }, '100%': { transform:'scaleY(1)' } },
            shimmer:    { '0%': { backgroundPosition: '-200% center' }, '100%': { backgroundPosition: '200% center' } },
            quoteScale: { '0%': { opacity:'0', transform:'scale(0.7) rotate(-8deg)' }, '100%': { opacity:'1', transform:'scale(1) rotate(0deg)' } },
          },
          animation: {
            fadeInUp:   'fadeInUp 0.75s cubic-bezier(0.22,1,0.36,1) both',
            fadeInLeft: 'fadeInLeft 0.75s cubic-bezier(0.22,1,0.36,1) both',
            fadeInRight:'fadeInRight 0.75s cubic-bezier(0.22,1,0.36,1) both',
            drawLine:   'drawLine 1.2s cubic-bezier(0.22,1,0.36,1) both',
            shimmer:    'shimmer 3s linear infinite',
            quoteScale: 'quoteScale 0.6s cubic-bezier(0.34,1.56,0.64,1) both',
          }
        }
      }
    };
