import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { PrivacyProvider } from '../hooks/usePrivacy'

export function Layout() {
  return (
    <PrivacyProvider>
      <div className="flex min-h-screen" style={{ background: 'var(--color-bg-root)' }}>
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </PrivacyProvider>
  )
}
