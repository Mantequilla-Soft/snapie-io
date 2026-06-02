import { Box, Spinner } from '@chakra-ui/react';

// Root loading boundary. Without a loading.tsx, App Router navigations block on
// the destination route's server work (e.g. generateMetadata's Hive call) and are
// NOT interruptible — clicking a post freezes the app until the render resolves,
// and queued link clicks only flush on the next discrete state update. This Suspense
// fallback makes every navigation show instant feedback and stay interruptible.
export default function Loading() {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
      <Spinner size="xl" color="primary" />
    </Box>
  );
}
