import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Silent background warm-up ping for Render free tier backend
const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
try {
  fetch(`${API_URL}/health`, { method: 'GET', mode: 'cors' }).catch(() => {});
} catch {
  // Ignore network errors on background prewarm
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

