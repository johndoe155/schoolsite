/* Extracted verbatim from the inline tailwind.config in public/admin.html,
   which used to be handed to the Tailwind Play CDN at runtime. Kept as a
   real config so the stylesheet can be built at deploy time instead. */
module.exports = {
      theme: {
        extend: {
          fontFamily: {
            sans:    ['Montserrat','system-ui','sans-serif'],
            serif:   ['Libre Baskerville','Georgia','serif'],
          },
          colors: {
            brand: {
              indigo: '#05014a',
              yellow: '#FACC15',
              dark:   '#0f172a',
            }
          }
        }
      }
    };
