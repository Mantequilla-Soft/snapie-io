'use client'
import { useEffect, useRef, useState } from 'react'
import { Box, Spinner, Text } from '@chakra-ui/react'
import { getPublicConfig } from '@/lib/snapie-auth/client'

interface Props {
  onCredential: (credential: string) => void
  width?: number
}

// Module-level singleton so we only load the script once.
let gisReady = false
let gisLoading: Promise<void> | null = null

function loadGIS(): Promise<void> {
  if (gisReady) return Promise.resolve()
  if (gisLoading) return gisLoading
  gisLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      gisReady = true
      resolve()
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
  return gisLoading
}

export default function GoogleLoginButton({ onCredential, width = 368 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // Keep a stable ref so the GIS callback doesn't capture a stale closure.
  const onCredentialRef = useRef(onCredential)
  useEffect(() => { onCredentialRef.current = onCredential }, [onCredential])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const config = await getPublicConfig()
        if (cancelled) return

        await loadGIS()
        if (cancelled) return

        const g = (window as any).google
        g.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: (res: { credential: string }) => onCredentialRef.current(res.credential),
          auto_select: false,
        })

        if (containerRef.current) {
          g.accounts.id.renderButton(containerRef.current, {
            theme: 'outline',
            size: 'large',
            width,
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left',
          })
        }
        if (!cancelled) setLoading(false)
      } catch {
        if (!cancelled) {
          setLoading(false)
          setFailed(true)
        }
      }
    }

    init()
    return () => { cancelled = true }
  }, [width])

  if (failed) return null

  return (
    <Box position="relative" width={`${width}px`} height="44px">
      {loading && (
        <Box
          position="absolute"
          inset={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Spinner size="sm" />
        </Box>
      )}
      <Box ref={containerRef} opacity={loading ? 0 : 1} transition="opacity 0.15s" />
    </Box>
  )
}
