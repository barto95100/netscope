import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { PrivacyProvider } from '../hooks/usePrivacy'

export function Layout() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [pathname])

  return (
    <PrivacyProvider>
      <div className="flex min-h-screen" style={{ background: 'var(--color-bg-root)' }}>
        <Sidebar />
        <main ref={mainRef} className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </PrivacyProvider>
  )
}
