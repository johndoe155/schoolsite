module.exports = {
  "darkMode": "class",
  "theme": {
    "extend": {
      "fontFamily": {
        "sans": [
          "Montserrat",
          "sans-serif"
        ],
        "serif": [
          "Libre Baskerville",
          "Georgia",
          "serif"
        ]
      },
      "colors": {
        "lux": {
          "navy": "#0b1220",
          "charcoal": "#0f1724",
          "gold": "#c59b53",
          "gold-light": "#d4af6a",
          "cream": "#f7f5f2",
          "surface": "rgba(255, 255, 255, 0.03)",
          "surface-hover": "rgba(255, 255, 255, 0.08)",
          "border": "rgba(255, 255, 255, 0.08)"
        }
      },
      "animation": {
        "fade-up": "fadeUp 0.5s cubic-bezier(0.2, 0.9, 0.3, 1) forwards",
        "in-dialog": "inDialog 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards"
      },
      "keyframes": {
        "fadeUp": {
          "0%": {
            "opacity": "0",
            "transform": "translateY(16px)"
          },
          "100%": {
            "opacity": "1",
            "transform": "translateY(0)"
          }
        },
        "inDialog": {
          "0%": {
            "opacity": "0",
            "transform": "scale(0.95) translateY(10px)"
          },
          "100%": {
            "opacity": "1",
            "transform": "scale(1) translateY(0)"
          }
        }
      }
    }
  },
  "content": [
    "./public/library.html"
  ]
};
