import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface PrivacyContextType {
  privacyMode: boolean
  togglePrivacy: () => void
  maskIp: (value: string) => string
}

const PrivacyContext = createContext<PrivacyContextType>({
  privacyMode: false,
  togglePrivacy: () => {},
  maskIp: (v) => v,
})

export function usePrivacy() {
  return useContext(PrivacyContext)
}

/**
 * Mask IP addresses: replaces first two octets with **
 * 192.168.1.1 → **.**.1.1
 * Also handles IPv6 by masking first 4 groups
 * Non-IP strings (domains, MACs) are returned as-is
 */
function maskIpAddress(value: string): string {
  // IPv4 pattern
  const ipv4 = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g
  return value.replace(ipv4, '**.**.$3.$4')
}

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [privacyMode, setPrivacyMode] = useState(() => {
    return localStorage.getItem('netscope-privacy-mode') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('netscope-privacy-mode', String(privacyMode))
  }, [privacyMode])

  const togglePrivacy = () => setPrivacyMode((prev) => !prev)

  const maskIp = (value: string): string => {
    if (!privacyMode) return value
    return maskIpAddress(value)
  }

  return (
    <PrivacyContext.Provider value={{ privacyMode, togglePrivacy, maskIp }}>
      {children}
    </PrivacyContext.Provider>
  )
}
