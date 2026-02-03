import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark mode colors (default theme)
        bg: {
          main: '#1A1A1A',      // Main background
          elevated: '#242424',  // Slightly lighter for cards/drawer
        },
        text: {
          main: '#F5F5F5',      // Main text
          secondary: '#8C8C8C', // Secondary/muted text
        },
        divider: '#484848',     // Dividers/borders

        // Semantic colors
        error: '#CC2424',
        success: '#14C935',     // Also for "on/good-to-go" states

        // Highlight colors (for text highlighting feature)
        highlight: {
          yellow: '#FFEB3B',
          green: '#4CAF50',
          blue: '#2196F3',
          pink: '#E91E63',
          purple: '#9C27B0',
        },
      },

      // Spacing uses even numbers only (2, 4, 8, 16, 24, 32, etc.)
      spacing: {
        // Tailwind defaults already use even numbers, but emphasizing key ones:
        // 1 = 4px, 2 = 8px, 4 = 16px (minimum margin), 6 = 24px, 8 = 32px
      },

      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
      },

      // Default font weight is light (300)
      fontWeight: {
        light: '300',    // Default for most text
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },

      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem', fontWeight: '300' }],     // 12px
        sm: ['0.875rem', { lineHeight: '1.25rem', fontWeight: '300' }], // 14px
        base: ['1rem', { lineHeight: '1.5rem', fontWeight: '300' }],    // 16px
        lg: ['1.125rem', { lineHeight: '1.75rem', fontWeight: '300' }], // 18px
        xl: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '300' }],  // 20px
      },

      // Simple shadows for dark mode (subtle)
      boxShadow: {
        drawer: '0 -4px 24px rgba(0, 0, 0, 0.4)',
        card: '0 2px 8px rgba(0, 0, 0, 0.3)',
      },

      // Simple border radius
      borderRadius: {
        DEFAULT: '0.5rem',  // 8px
        lg: '0.75rem',      // 12px
      },

      // Animation durations
      transitionDuration: {
        fast: '150ms',
        normal: '300ms',
      },
    },
  },
  plugins: [],
} satisfies Config;
