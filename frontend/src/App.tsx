import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Diagnostic } from './pages/Diagnostic'
import { DnsLookup } from './pages/DnsLookup'
import { HttpHeaders } from './pages/HttpHeaders'
import { PortScanner } from './pages/PortScanner'
import { SslAudit } from './pages/SslAudit'
import { Traceroute } from './pages/Traceroute'
import { Whois } from './pages/Whois'

function NotFound() {
  return (
    <div className="flex items-center justify-center h-full min-h-screen">
      <div className="text-center">
        <div
          className="text-6xl font-bold mb-4"
          style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-family-heading)' }}
        >
          404
        </div>
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Page not found
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="diagnostic" element={<Diagnostic />} />
          <Route path="port-scanner" element={<PortScanner />} />
          <Route path="ssl-audit" element={<SslAudit />} />
          <Route path="dns" element={<DnsLookup />} />
          <Route path="whois" element={<Whois />} />
          <Route path="traceroute" element={<Traceroute />} />
          <Route path="http-headers" element={<HttpHeaders />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
