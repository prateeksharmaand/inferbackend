import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { company } from './config/company'
import './index.css'

// Apply brand colours from the central config.
const root = document.documentElement.style
root.setProperty('--color-brand', company.primaryColor)
root.setProperty('--color-sky', company.secondaryColor)
root.setProperty('--color-accent', company.accentColor)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
