"use client";

import {
  Box,
  Flex,
  IconButton,
  Link,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuPause, LuPlay } from "react-icons/lu";
import {
  fetchSnapieAudioMetadata,
  type SnapieAudioApiMeta,
  SPEAK_AUDIO_IFRAME_HEIGHT_PX,
} from "@/lib/utils/snapUtils";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  /** Full `https://audio.3speak.tv/play?...` URL (any query shape). */
  playUrl: string;
};

/**
 * In-app 3Speak audio: uses the public metadata API + HTML5 audio so we are not stuck
 * with their iframe’s light-theme chrome (cross-origin CSS cannot fix that).
 */
export default function SnapieSpeakAudio({ playUrl }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackedPlay = useRef(false);

  const [meta, setMeta] = useState<SnapieAudioApiMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [srcIndex, setSrcIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPlaybackError(null);
    setMeta(null);
    (async () => {
      try {
        const m = await fetchSnapieAudioMetadata(playUrl);
        if (cancelled) return;
        if (!m?.audioUrl) {
          setLoadError("Audio not found");
          return;
        }
        setMeta(m);
        setDuration(
          typeof m.duration === "number" && m.duration > 0 ? m.duration : 0
        );
      } catch {
        if (!cancelled) setLoadError("Could not load audio");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playUrl]);

  useEffect(() => {
    setPlaybackError(null);
  }, [meta, srcIndex]);

  const activeSrc =
    meta == null
      ? ""
      : srcIndex === 0
        ? meta.audioUrl
        : meta.audioUrlFallback || meta.audioUrl;

  const trackPlayCount = useCallback(() => {
    if (trackedPlay.current || !meta?.permlink) return;
    trackedPlay.current = true;
    void fetch("https://audio.3speak.tv/api/audio/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permlink: meta.permlink }),
    }).catch(() => {});
  }, [meta?.permlink]);

  const syncProgress = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
    setCurrent(el.currentTime);
    if (d > 0) setProgress((el.currentTime / d) * 100);
  }, [duration]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }, []);

  const onSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const el = audioRef.current;
      if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
      const pct = parseFloat(e.target.value);
      el.currentTime = (pct / 100) * el.duration;
      setProgress(pct);
      setCurrent(el.currentTime);
    },
    []
  );

  const onAudioError = useCallback(() => {
    if (srcIndex === 0 && meta?.audioUrlFallback) {
      setSrcIndex(1);
      setPlaybackError(null);
      return;
    }
    setPlaybackError("Playback failed");
  }, [meta?.audioUrlFallback, srcIndex]);

  const displayDuration =
    Number.isFinite(duration) && duration > 0
      ? duration
      : audioRef.current?.duration && Number.isFinite(audioRef.current.duration)
        ? audioRef.current.duration
        : 0;

  if (loadError && !meta) {
    return (
      <Box
        maxW="550px"
        mx="auto"
        mb={2}
        px={5}
        py={3}
        borderRadius="full"
        border="1px solid rgba(102, 228, 255, 0.22)"
        bg="rgba(8, 24, 40, 0.55)"
        backdropFilter="blur(14px)"
      >
        <Text fontSize="sm" color="rgba(255,255,255,0.85)" mb={2}>
          {loadError}
        </Text>
        <Link href={playUrl} isExternal color="primary" fontSize="sm">
          Open in 3Speak
        </Link>
      </Box>
    );
  }

  return (
    <Box
      maxW="550px"
      mx="auto"
      mb={2}
      px={5}
      py={3}
      minH={`${SPEAK_AUDIO_IFRAME_HEIGHT_PX}px`}
      borderRadius="full"
      border="1px solid rgba(102, 228, 255, 0.22)"
      bg="rgba(8, 24, 40, 0.5)"
      backdropFilter="blur(16px)"
      boxShadow="0 8px 28px rgba(0, 0, 0, 0.22)"
    >
      {loading && (
        <Flex align="center" justify="center" minH={`${SPEAK_AUDIO_IFRAME_HEIGHT_PX - 16}px`}>
          <Spinner size="sm" color="primary" thickness="3px" />
        </Flex>
      )}
      {!loading && meta && (
        <>
          <audio
            ref={audioRef}
            key={activeSrc}
            src={activeSrc}
            preload="metadata"
            onPlay={() => {
              setPlaying(true);
              trackPlayCount();
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setProgress(0);
              setCurrent(0);
            }}
            onTimeUpdate={syncProgress}
            onLoadedMetadata={() => {
              const el = audioRef.current;
              if (el && Number.isFinite(el.duration) && el.duration > 0) {
                setDuration(el.duration);
              }
              syncProgress();
            }}
            onError={onAudioError}
            style={{ display: "none" }}
          />
          <Flex align="center" gap={3} mb={2}>
            <IconButton
              aria-label={playing ? "Pause" : "Play"}
              isRound
              size="md"
              variant="solid"
              colorScheme="blue"
              onClick={togglePlay}
              flexShrink={0}
            >
              {playing ? <LuPause size={20} /> : <LuPlay size={20} style={{ marginLeft: 2 }} />}
            </IconButton>
            <Text
              fontSize="sm"
              fontWeight="medium"
              color="rgba(236, 252, 255, 0.92)"
              flex="1"
              minW={0}
              noOfLines={1}
            >
              {meta.title?.trim() || "Audio"}
            </Text>
            <Text
              as="span"
              fontSize="xs"
              fontFamily="mono"
              color="rgba(180, 220, 245, 0.88)"
              flexShrink={0}
            >
              {formatTime(current)} / {formatTime(displayDuration)}
            </Text>
          </Flex>
          <input
            type="range"
            min={0}
            max={100}
            step={0.25}
            value={Number.isFinite(progress) ? progress : 0}
            onChange={onSeek}
            disabled={!Number.isFinite(displayDuration) || displayDuration <= 0}
            style={{
              width: "100%",
              height: 6,
              borderRadius: 9999,
              appearance: "none",
              WebkitAppearance: "none",
              background: "rgba(102, 228, 255, 0.18)",
              outline: "none",
              cursor: "pointer",
            }}
          />
          {playbackError && (
            <Text fontSize="xs" color="red.300" mt={2} textAlign="center">
              {playbackError}{" "}
              <Link href={playUrl} isExternal color="primary">
                Open original
              </Link>
            </Text>
          )}
        </>
      )}
    </Box>
  );
}
