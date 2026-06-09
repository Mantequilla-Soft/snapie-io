'use client'
import { useEffect, useState } from 'react'
import { Badge, Box, Skeleton, Text, Tooltip } from '@chakra-ui/react'
import { getQuota } from '@/lib/snapie-auth/client'
import type { QuotaResponse } from '@/lib/snapie-auth/types'

export default function QuotaWidget() {
  const [quota, setQuota] = useState<QuotaResponse | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      try {
        const q = await getQuota()
        if (!cancelled) { setQuota(q); setError(false) }
      } catch {
        if (!cancelled) setError(true)
      }
    }

    fetch()
    const interval = setInterval(fetch, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (error || !quota) {
    return <Skeleton height="20px" width="200px" borderRadius="full" />
  }

  const resetsAt = new Date(quota.resetsAt)
  const resetStr = resetsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

  return (
    <Tooltip
      label={`Resets at ${resetStr} UTC. Use a sponsor link to bypass this limit.`}
      placement="bottom"
    >
      <Box display="inline-flex" alignItems="center" gap={2} cursor="default">
        <Badge
          colorScheme={quota.remaining === 0 ? 'red' : quota.remaining <= 3 ? 'orange' : 'green'}
          borderRadius="full"
          px={2}
          fontSize="xs"
        >
          {quota.remaining === 0 ? 'Full today' : `${quota.remaining} of ${quota.total} free slots`}
        </Badge>
        <Text fontSize="xs" color="gray.500">
          resets {resetStr} UTC
        </Text>
      </Box>
    </Tooltip>
  )
}
