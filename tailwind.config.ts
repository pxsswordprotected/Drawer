import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark mode colors (default theme)
        bg: {
          main: '#1A1A1A', // Main background
          elevated: '#1A1A1A', // Matches toolbar background
        },
        text: {
          main: '#F5F5F5', // Main text
          secondary: '#8C8C8C', // Secondary/muted text
        },
        divider: '#484848', // Dividers/borders

        // Semantic colors
        error: '#CC2424',
        success: '#14C935', // Also for "on/good-to-go" states

        // Highlight colors (for text highlighting feature)
        highlight: {
          yellow: '#ffff02',
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
        light: '300', // Default for most text
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },

      fontSize: {
        xs: ['12px', { lineHeight: '16px', fontWeight: '300' }],
        sm: ['14px', { lineHeight: '20px', fontWeight: '300' }],
        base: ['16px', { lineHeight: '24px', fontWeight: '300' }],
        lg: ['18px', { lineHeight: '28px', fontWeight: '300' }],
        xl: ['20px', { lineHeight: '28px', fontWeight: '300' }],
      },

      // Simple shadows for dark mode (subtle)
      boxShadow: {
        drawer: '0 -4px 24px rgba(0, 0, 0, 0.4)',
        card: '0 2px 8px rgba(0, 0, 0, 0.3)',
      },

      // Simple border radius
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
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
