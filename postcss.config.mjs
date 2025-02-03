/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    'tailwindcss': {},
    'autoprefixer': {},
    'postcss-preset-env': {
      features: { 'nesting-rules': false }
    }
  }
};
