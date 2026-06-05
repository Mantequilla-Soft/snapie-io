import dynamic from 'next/dynamic';

// SSR disabled — Swiper and usePlayer require browser APIs
const ShortsPlayer = dynamic(() => import('@/components/shorts/ShortsPlayer'), {
  ssr: false,
  loading: () => <div style={{ height: '100dvh', background: '#000' }} />,
});

export default function ShortsPage() {
  return <ShortsPlayer />;
}
