# Snapie Livestreaming - Implementation Plan

## Overview

Instagram-style livestreaming where users can go live from their phone or browser directly within Snapie.

---

## Recommended Stack: LiveKit

**Why LiveKit:**
- Open source, self-hosted
- WebRTC native (browser/phone friendly - no OBS needed)
- Has React SDK (`@livekit/components-react`)
- Can output HLS for large audiences
- Can record streams for VOD
- Scales well, great docs

---

## Architecture

```
┌──────────────────┐         WebRTC          ┌─────────────────┐        HLS/WebRTC
│  Phone/Browser   │ ──────────────────────→ │  LiveKit        │ ─────────────────→  Viewers
│  getUserMedia()  │   (camera + mic)        │  Server (VPS)   │   
└──────────────────┘                         └─────────────────┘
                                                    │
                                                    ↓
                                             Recording Storage
                                             (optional VOD)
```

---

## VPS Setup (Docker Compose)

```yaml
# docker-compose.yml
version: '3.8'

services:
  livekit:
    image: livekit/livekit-server:latest
    restart: unless-stopped
    ports:
      - "7880:7880"   # HTTP/WebSocket
      - "7881:7881"   # TURN/TLS
      - "7882:7882/udp"  # UDP (WebRTC media)
    environment:
      - LIVEKIT_KEYS=APIxxxxxxx: secretxxxxxxxxxxxxxxx
    volumes:
      - ./livekit.yaml:/livekit.yaml
    command: ["--config", "/livekit.yaml"]

  redis:
    image: redis:alpine
    restart: unless-stopped
```

```yaml
# livekit.yaml
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true
redis:
  address: redis:6379
keys:
  APIxxxxxxx: secretxxxxxxxxxxxxxxx
```

**VPS Requirements:**
- 2+ CPU cores (4 recommended)
- 4GB+ RAM
- Good bandwidth
- UDP port 7882 open

---

## Backend API Routes

```typescript
// app/api/stream/create/route.ts
// Create a new stream, generate LiveKit token for streamer
POST { title: string }
→ { streamId, token, wsUrl }

// app/api/stream/[id]/route.ts  
// Get stream info for viewers
GET → { streamer, title, status, viewerCount, token }

// app/api/stream/[id]/end/route.ts
// End the stream
POST → { success: true }

// app/api/streams/live/route.ts
// List all currently live streams
GET → { streams: [...] }
```

---

## Database Schema

```typescript
interface Stream {
  id: string;
  streamer: string;        // Hive username
  title: string;
  description?: string;
  status: 'live' | 'ended';
  started_at: number;
  ended_at?: number;
  viewer_count: number;
  peak_viewers: number;
  thumbnail?: string;
  recording_url?: string;  // VOD after stream ends
}
```

Could also store in Hive via `custom_json` for decentralization.

---

## Frontend Components

### 1. Go Live Button (Streamer)

```tsx
// components/streaming/GoLiveButton.tsx
import { LiveKitRoom, VideoTrack, useLocalParticipant } from '@livekit/components-react';

function GoLiveModal({ onClose }) {
  const [title, setTitle] = useState('');
  const [token, setToken] = useState(null);
  
  const startStream = async () => {
    const res = await fetch('/api/stream/create', {
      method: 'POST',
      body: JSON.stringify({ title })
    });
    const { token, wsUrl } = await res.json();
    setToken(token);
  };
  
  if (token) {
    return (
      <LiveKitRoom token={token} serverUrl={wsUrl}>
        <StreamerView onEnd={onClose} />
      </LiveKitRoom>
    );
  }
  
  return (
    <Modal>
      <Input placeholder="Stream title" value={title} onChange={setTitle} />
      <Button onClick={startStream}>Go Live</Button>
    </Modal>
  );
}
```

### 2. Live Player (Viewer)

```tsx
// components/streaming/LivePlayer.tsx
import { LiveKitRoom, VideoTrack } from '@livekit/components-react';

function LivePlayer({ streamId }) {
  const [streamData, setStreamData] = useState(null);
  
  useEffect(() => {
    fetch(`/api/stream/${streamId}`).then(r => r.json()).then(setStreamData);
  }, [streamId]);
  
  if (!streamData) return <Spinner />;
  
  return (
    <LiveKitRoom token={streamData.viewerToken} serverUrl={streamData.wsUrl}>
      <VideoTrack />
      <ViewerCount count={streamData.viewerCount} />
      <LiveChat streamId={streamId} />
    </LiveKitRoom>
  );
}
```

### 3. Live Badge & Discovery

```tsx
// Show LIVE badge on profiles
{user.isLive && <Badge colorScheme="red">LIVE</Badge>}

// Live streams section on home
<LiveStreamsCarousel streams={liveStreams} />
```

---

## User Flow

### Streamer:
1. Click "Go Live" button in Snapie
2. Enter stream title
3. Grant camera/mic permissions
4. See preview → Click "Start"
5. Stream is live, see viewer count
6. Click "End Stream" when done
7. Optionally save as VOD

### Viewer:
1. See "LIVE" indicator on home feed or profile
2. Click to join stream
3. Watch via WebRTC (low latency) or HLS (fallback)
4. Chat alongside (Ecency chat or custom)
5. React with emojis

---

## Estimated Timeline

| Task | Time |
|------|------|
| Set up LiveKit on VPS | 2 hours |
| Backend API routes | 3-4 hours |
| Go Live UI & flow | 4-5 hours |
| Viewer player | 3-4 hours |
| Live discovery/badges | 2-3 hours |
| Chat integration | 2-3 hours |
| Testing & polish | 4-5 hours |
| **Total MVP** | **~3 days** |

---

## Future Enhancements

- [ ] VOD recording & playback
- [ ] Stream to 3Speak (auto-upload after stream)
- [ ] Scheduled streams
- [ ] Co-streaming (multiple people)
- [ ] Screen sharing
- [ ] Virtual gifts / tips (Hive transfers)
- [ ] Stream clips
- [ ] RTMP ingest for OBS users

---

## Resources

- [LiveKit Docs](https://docs.livekit.io/)
- [LiveKit React Components](https://docs.livekit.io/reference/components/react/)
- [LiveKit Server SDK (Node)](https://docs.livekit.io/reference/server/node/)
