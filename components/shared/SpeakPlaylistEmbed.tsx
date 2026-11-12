"use client";

import { Box, Flex, Link, Spinner, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuListMusic } from "react-icons/lu";

const PLAYLIST_IFRAME_HEIGHT_PX = 480;

type Props = {
  /** 3Speak playlist id (from `audio.3speak.tv/play?list=<id>`). */
  listId: string;
};

type State = "loading" | "audio" | "no-audio";

/**
 * 3Speak playlist embed. 3Speak's playlist player only plays the audio tracks,
 * so a playlist with no audio (missing, private, or videos only) gets a link
 * card to the playlist page instead of an empty player.
 */
export default function SpeakPlaylistEmbed({ listId }: Props) {
  const [state, setState] = useState<State>("loading");
  const id = encodeURIComponent(listId);
  const pageUrl = `https://3speak.tv/playlist/${id}`;

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`https://audio.3speak.tv/api/audio/playlist/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { tracks?: unknown[] } | null) => {
        if (!cancelled) setState(data?.tracks?.length ? "audio" : "no-audio");
      })
      .catch(() => {
        if (!cancelled) setState("no-audio");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state === "loading") {
    return (
      <Flex maxW="550px" mx="auto" mb={2} h="80px" align="center" justify="center">
        <Spinner size="sm" color="primary" thickness="3px" />
      </Flex>
    );
  }

  if (state === "no-audio") {
    return (
      <Link
        href={pageUrl}
        isExternal
        display="flex"
        alignItems="center"
        gap={3}
        maxW="550px"
        mx="auto"
        mb={2}
        px={5}
        py={4}
        borderRadius="10px"
        border="1px solid"
        borderColor="rgba(28, 161, 241, 0.3)"
        _hover={{ textDecoration: "none", borderColor: "primary" }}
      >
        <LuListMusic size={22} />
        <Text fontSize="sm" fontWeight="medium">
          Open playlist on 3Speak
        </Text>
      </Link>
    );
  }

  return (
    <Box maxW="550px" mx="auto" mb={2} borderRadius="10px" overflow="hidden">
      <iframe
        src={`https://audio.3speak.tv/play?list=${id}&iframe=1`}
        title="3Speak playlist"
        width="100%"
        height={PLAYLIST_IFRAME_HEIGHT_PX}
        loading="lazy"
        allow="autoplay; clipboard-write"
        style={{ border: 0, display: "block" }}
      />
    </Box>
  );
}
