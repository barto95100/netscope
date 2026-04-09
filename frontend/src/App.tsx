import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Alerts } from './pages/Alerts'
import { Certificates } from './pages/Certificates'
import { Dashboard } from './pages/Dashboard'
import { Diagnostic } from './pages/Diagnostic'
import { DnsLookup } from './pages/DnsLookup'
import { HttpHeaders } from './pages/HttpHeaders'
import { Monitors } from './pages/Monitors'
import { PortScanner } from './pages/PortScanner'
import { Reports } from './pages/Reports'
import { ScanHistory } from './pages/ScanHistory'
import { SslAudit } from './pages/SslAudit'
import { Traceroute } from './pages/Traceroute'
import { VulnScanner } from './pages/VulnScanner'
import { Whois } from './pages/Whois'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          {/* Network */}
          <Route path="diagnostic" element={<Diagnostic />} />
          <Route path="port-scanner" element={<PortScanner />} />
          <Route path="traceroute" element={<Traceroute />} />
          <Route path="dns" element={<DnsLookup />} />
          <Route path="whois" element={<Whois />} />
          {/* Security */}
          <Route path="vuln-scanner" element={<VulnScanner />} />
          <Route path="ssl-audit" element={<SslAudit />} />
          <Route path="http-headers" element={<HttpHeaders />} />
          {/* Monitoring */}
          <Route path="monitors" element={<Monitors />} />
          <Route path="certificates" element={<Certificates />} />
          <Route path="alerts" element={<Alerts />} />
          {/* History */}
          <Route path="history" element={<ScanHistory />} />
          <Route path="reports" element={<Reports />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
