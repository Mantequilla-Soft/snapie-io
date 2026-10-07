'use client'

import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertIcon, Box, Link as ChakraLink, Text } from '@chakra-ui/react'
import { FACTORY_ORIGIN, factoryAppUrl, factoryEmbedUrl } from '@/lib/factory/config'
import { parseFactoryMessage, type FactoryStatus } from '@/lib/factory/messages'

/**
 * The Butter Factory: a pixel-art replay of the org's last week of pull requests.
 * It runs as its own app, so this page only frames it and listens for its status.
 */
export default function FactoryEmbed({ origin = FACTORY_ORIGIN }: { origin?: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<FactoryStatus | null>(null)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Only our own frame, and only from the factory's origin.
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return
      const parsed = parseFactoryMessage(event.data)
      if (parsed) setStatus(parsed)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origin])

  return (
    <Box>
      <Box borderWidth="2px" borderColor="border" borderRadius="md" overflow="hidden" bg="black">
        <iframe
          ref={frameRef}
          src={factoryEmbedUrl(origin)}
          title="Butter Factory: a replay of last week's pull requests"
          loading="lazy"
          allow="fullscreen"
          referrerPolicy="origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          style={{ display: 'block', width: '100%', height: 'clamp(460px, 62vw, 700px)', border: 0 }}
        />
      </Box>

      <Box mt={3} minH="1.5rem" aria-live="polite">
        {status?.type === 'week-loaded' && (
          <Text fontSize="sm" color="fg.muted">
            {status.org}, week of {status.weekStart.slice(0, 10)}: {status.events} events across {status.repos} repos.
          </Text>
        )}
        {status?.type === 'error' && (
          <Alert status="warning" borderRadius="md" role="alert">
            <AlertIcon />
            <AlertDescription fontSize="sm">The factory couldn&apos;t load this week: {status.message}</AlertDescription>
          </Alert>
        )}
      </Box>

      <Text mt={2} fontSize="sm">
        <ChakraLink href={factoryAppUrl(origin)} isExternal color="accent">
          Open the full factory with the activity feed and week in numbers ↗
        </ChakraLink>
      </Text>
    </Box>
  )
}
