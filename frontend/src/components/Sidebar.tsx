import { NavLink } from 'react-router-dom'
import { usePrivacy } from '../hooks/usePrivacy'

interface NavItem {
  label: string
  to: string
  icon: string
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', to: '/', icon: '⬡' },
    ],
  },
  {
    title: 'Network',
    items: [
      { label: 'Ping', to: '/diagnostic', icon: '◎' },
      { label: 'Port Scanner', to: '/port-scanner', icon: '⊞' },
      { label: 'Traceroute / MTR', to: '/traceroute', icon: '⇢' },
      { label: 'DNS Lookup', to: '/dns', icon: '◈' },
      { label: 'Whois', to: '/whois', icon: '◇' },
      { label: 'NetPath', to: '/netpath', icon: '⟿' },
      { label: 'MAC Lookup', to: '/mac-lookup', icon: '⎔' },
    ],
  },
  {
    title: 'Security',
    items: [
      { label: 'Vuln Scanner', to: '/vuln-scanner', icon: '⚡' },
      { label: 'SSL/TLS Audit', to: '/ssl-audit', icon: '⬡' },
      { label: 'HTTP Headers', to: '/http-headers', icon: '≡' },
    ],
  },
  {
    title: 'Monitoring',
    items: [
      { label: 'Uptime Checks', to: '/monitors', icon: '◉' },
      { label: 'Certificates', to: '/certificates', icon: '☐' },
      { label: 'Alerts', to: '/alerts', icon: '△' },
    ],
  },
  {
    title: 'History',
    items: [
      { label: 'Scan History', to: '/history', icon: '☰' },
      { label: 'Reports', to: '/reports', icon: '▤' },
    ],
  },
]

export function Sidebar() {
  const { privacyMode, togglePrivacy } = usePrivacy()
  return (
    <aside
      className="flex flex-col w-60 min-h-screen shrink-0"
      style={{ background: 'var(--color-bg-surface)', borderRight: '1px solid var(--color-border)' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7" style={{ color: 'var(--color-accent)' }}>
          <circle cx="12" cy="12" r="9" opacity="0.3"/>
          <ellipse cx="12" cy="12" rx="3.5" ry="9" opacity="0.2"/>
          <path d="M3 12h18" opacity="0.2"/>
          <circle cx="7" cy="7" r="2" fill="currentColor" stroke="none"/>
          <circle cx="18" cy="9" r="2" fill="currentColor" stroke="none"/>
          <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>
          <line x1="7" y1="7" x2="18" y2="9" strokeWidth="1"/>
          <line x1="18" y1="9" x2="10" y2="18" strokeWidth="1"/>
          <line x1="10" y1="18" x2="7" y2="7" strokeWidth="1"/>
        </svg>
        <span
          className="text-lg font-bold tracking-tight"
          style={{ fontFamily: 'var(--font-family-heading)', color: 'var(--color-text-primary)' }}
        >
          NetScope
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navGroups.map((group) => (
          <div key={group.title} className="mb-6">
            <div
              className="px-2 mb-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}
            >
              {group.title}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      [
                        'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                        isActive
                          ? 'font-medium'
                          : 'hover:bg-opacity-50',
                      ].join(' ')
                    }
                    style={({ isActive }) => ({
                      color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      background: isActive ? 'rgba(14, 165, 233, 0.08)' : 'transparent',
                      fontFamily: 'var(--font-family-body)',
                    })}
                    onMouseEnter={(e) => {
                      const target = e.currentTarget as HTMLAnchorElement
                      if (!target.getAttribute('aria-current')) {
                        target.style.background = 'rgba(255,255,255,0.03)'
                        target.style.color = 'var(--color-text-primary)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      const target = e.currentTarget as HTMLAnchorElement
                      if (!target.getAttribute('aria-current')) {
                        target.style.background = 'transparent'
                        target.style.color = 'var(--color-text-secondary)'
                      }
                    }}
                  >
                    <span className="text-xs opacity-70">{item.icon}</span>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 space-y-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={togglePrivacy}
          className="flex items-center gap-2 w-full text-xs px-2 py-1.5 rounded-md transition-colors"
          style={{
            color: privacyMode ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            background: privacyMode ? 'rgba(14, 165, 233, 0.08)' : 'transparent',
            fontFamily: 'var(--font-family-mono)',
          }}
        >
          <span style={{ fontSize: '14px' }}>{privacyMode ? '◉' : '○'}</span>
          Privacy Mode
        </button>
        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
          v0.2.0
        </div>
      </div>
    </aside>
  )
}
