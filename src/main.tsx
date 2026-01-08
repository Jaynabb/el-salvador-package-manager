import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { DocProvider } from './contexts/DocContext.tsx'

console.log('🚀 ImportFlow starting...');

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AuthProvider>
        <DocProvider>
          <App />
        </DocProvider>
      </AuthProvider>
    </StrictMode>,
  )
  console.log('✅ ImportFlow rendered');
} catch (error) {
  console.error('❌ Error rendering app:', error);
  document.body.innerHTML = `
    <div style="padding: 20px; font-family: monospace; background: #1e293b; color: white; min-height: 100vh;">
      <h1 style="color: #ef4444;">Error Loading ImportFlow</h1>
      <pre style="background: #0f172a; padding: 20px; border-radius: 8px; overflow: auto;">${error}</pre>
    </div>
  `;
}
