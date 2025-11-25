import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Fix: Cast process to any to avoid "Property 'cwd' does not exist on type 'Process'" error
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    // base: './' ensures assets are loaded relatively, making it work on GitHub Pages subdirectories
    base: './', 
    plugins: [react()],
    define: {
      // Это позволяет использовать process.env.API_KEY в коде браузера
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});