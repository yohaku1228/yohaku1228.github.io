import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { offlineBuild } from './pwa-build'

export default defineConfig({
  base: '/refresh/',
  plugins: [react(), tailwindcss(), offlineBuild()],
})
