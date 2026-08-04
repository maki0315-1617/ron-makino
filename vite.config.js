import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 警告で提案されていた制限の調整と、Rolldown向けのエラー回避設定
    chunkSizeWarningLimit: 1000, 
    rollupOptions: {
      // @emailjs/browser のバンドルエラーを防ぐため外部化する
      external: ['@emailjs/browser'],
      output: {
        // 必要に応じてチャンク分割の設定
        codeSplitting: true,
        globals: {
          '@emailjs/browser': 'emailjs'
        }
      }
    }
  }
})