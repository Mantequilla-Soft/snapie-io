'use client';
import { useEffect, useRef, useState } from 'react';
import { Box, Flex, Icon, IconButton, Text, Spinner } from '@chakra-ui/react';
import jsQR from 'jsqr';
import { FiX } from 'react-icons/fi';
import { decodeHiveTransferQR, HiveTransferQRData } from '@/lib/hive/qr-utils';

interface QRScanSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: HiveTransferQRData) => void;
}

export default function QRScanSheet({ isOpen, onClose, onScan }: QRScanSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const doneRef = useRef(false);

  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    doneRef.current = false;
    setStatus('starting');
    setErrorMsg('');

    function scan() {
      if (doneRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(scan); return; }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });

      if (code) {
        const data = decodeHiveTransferQR(code.data);
        if (data) {
          doneRef.current = true;
          stopStream();
          onScan(data);
          onClose();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(scan);
    }

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (doneRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');
        scan();
      } catch (err: unknown) {
        const name = (err as { name?: string }).name ?? '';
        setStatus('error');
        setErrorMsg(
          name === 'NotAllowedError'
            ? 'Camera access denied.\nAllow camera access in your browser settings and try again.'
            : 'Could not start the camera.',
        );
      }
    }

    startCamera();

    return () => {
      doneRef.current = true;
      cancelAnimationFrame(rafRef.current);
      stopStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  function handleClose() {
    doneRef.current = true;
    cancelAnimationFrame(rafRef.current);
    stopStream();
    onClose();
  }

  if (!isOpen) return null;

  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={1500}
      bg="black"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      {/* Close */}
      <Box position="absolute" top={4} right={4} zIndex={10}>
        <IconButton
          aria-label="Close scanner"
          icon={<Icon as={FiX} boxSize={6} />}
          onClick={handleClose}
          bg="blackAlpha.700"
          color="white"
          borderRadius="full"
          _hover={{ bg: 'blackAlpha.800' }}
        />
      </Box>

      {/* Camera feed — hidden canvas offscreen */}
      <video
        ref={videoRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        playsInline
        muted
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Starting spinner */}
      {status === 'starting' && (
        <Flex
          position="absolute" inset={0}
          align="center" justify="center"
          bg="blackAlpha.700"
          flexDirection="column"
          gap={3}
        >
          <Spinner color="white" size="xl" thickness="3px" />
          <Text color="whiteAlpha.800" fontSize="sm">Starting camera…</Text>
        </Flex>
      )}

      {/* Error */}
      {status === 'error' && (
        <Flex
          position="absolute" inset={0}
          align="center" justify="center"
          bg="blackAlpha.900"
          p={8}
          flexDirection="column"
          gap={3}
        >
          <Text color="white" textAlign="center" whiteSpace="pre-line" fontSize="sm">
            {errorMsg}
          </Text>
        </Flex>
      )}

      {/* Scan guide frame + label */}
      {status === 'scanning' && (
        <>
          <Box
            position="absolute"
            w="240px" h="240px"
            borderRadius="16px"
            border="2px solid"
            borderColor="cyan.300"
            boxShadow="0 0 0 9999px rgba(0,0,0,0.45)"
            pointerEvents="none"
          />
          <Text
            position="absolute"
            bottom={12}
            left={0} right={0}
            textAlign="center"
            color="whiteAlpha.800"
            fontSize="sm"
          >
            Align a Hive payment QR within the frame
          </Text>
        </>
      )}
    </Box>
  );
}
