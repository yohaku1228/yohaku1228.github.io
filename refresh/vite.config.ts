import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { offlineBuild } from './pwa-build'

export default defineConfig({
  base: process.env.VITE_CLOUDFLARE === '1' ? '/' : '/refresh/',
  plugins: [react(), tailwindcss(), offlineBuild()],
})
