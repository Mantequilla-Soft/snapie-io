'use client';

import { Suspense } from 'react';
import { Box, Spinner } from '@chakra-ui/react';
import { useSearchParams } from 'next/navigation';
import CreateAccountForm from '@/components/join/CreateAccountForm';
import SponsorFlow from '@/components/join/SponsorFlow';

function JoinPageInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  if (code) return <SponsorFlow code={code} />;
  return <CreateAccountForm />;
}

export default function JoinPage() {
  return (
    <Suspense fallback={<Box display="flex" justifyContent="center" py={16}><Spinner /></Box>}>
      <JoinPageInner />
    </Suspense>
  );
}
