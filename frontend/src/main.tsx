import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initAppUpdate } from './bootstrapAppUpdate'
import App from './App.tsx'

initAppUpdate('player')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
