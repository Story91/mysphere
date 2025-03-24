export const globalStyles = {
  gradientAnimation: `
    @keyframes gradient-shift {
      0% {
        background-position: 0% 50%;
      }
      50% {
        background-position: 100% 50%;
      }
      100% {
        background-position: 0% 50%;
      }
    }
  `,
};

export const tailwindConfig = {
  theme: {
    extend: {
      animation: {
        'gradient-shift': 'gradient-shift 3s ease infinite',
      },
      backgroundSize: {
        '400%': '400% 400%',
      },
    },
  },
}; 