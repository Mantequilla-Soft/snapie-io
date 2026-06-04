import { Box, Spinner } from '@chakra-ui/react';

// Segment-level loading boundary for [...slug]. The root loading.tsx only
// activates for cross-segment navigations (e.g. /blog → /@author/permlink).
// Same-segment param changes (/@user → /@user/permlink) re-render only the
// page within this segment, so the boundary must live here to fire.
export default function Loading() {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
      <Spinner size="xl" color="primary" />
    </Box>
  );
}
