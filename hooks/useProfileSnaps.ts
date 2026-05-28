import HiveClient from '@/lib/hive/hiveclient';
import { useState, useEffect, useRef } from 'react';
import { ExtendedComment } from './useComments';

const PAGE_SIZE = 10;   // snaps to collect before yielding a page
const FETCH_LIMIT = 20; // comments to request per API call
const MAX_ITERATIONS = 20; // safety cap to avoid infinite loops when a user has few snaps

export function useProfileSnaps(username: string) {
  const [snaps, setSnaps] = useState<ExtendedComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const cursorRef = useRef('');
  const exhaustedRef = useRef(false);
  const fetchingRef = useRef(false);
  const versionRef = useRef(0); // incremented on refresh to invalidate in-flight requests

  // Reset everything when the target user changes
  useEffect(() => {
    cursorRef.current = '';
    exhaustedRef.current = false;
    fetchingRef.current = false;
    setSnaps([]);
    setHasMore(true);
    setPage(1);
  }, [username]);

  // Fetch a page of snaps whenever `page` increments
  useEffect(() => {
    if (page === 0 || !username || fetchingRef.current || exhaustedRef.current) return;

    fetchingRef.current = true;
    setIsLoading(true);
    const requestVersion = versionRef.current;

    const run = async () => {
      try {
        const collected: ExtendedComment[] = [];
        let cursor = cursorRef.current;
        let iterations = 0;

        while (collected.length < PAGE_SIZE && iterations < MAX_ITERATIONS) {
          iterations++;

          const results: ExtendedComment[] = await HiveClient.database.call(
            'get_discussions_by_comments',
            [{ start_author: username, start_permlink: cursor, limit: FETCH_LIMIT }]
          );

          if (!results?.length) {
            exhaustedRef.current = true;
            break;
          }

          // On paginated calls the API returns the cursor item again — skip it
          const items = cursor === '' ? results : results.slice(1);
          if (items.length === 0) {
            exhaustedRef.current = true;
            break;
          }

          collected.push(...items.filter(c => c.parent_author === 'peak.snaps'));

          cursor = results[results.length - 1].permlink;

          // Fewer results than requested means we've hit the end
          if (results.length < FETCH_LIMIT) {
            exhaustedRef.current = true;
            break;
          }
        }

        // Discard results if a refresh was triggered while this fetch was in flight
        if (versionRef.current !== requestVersion) return;

        cursorRef.current = cursor;

        setSnaps(prev => {
          const seen = new Set(prev.map(c => c.permlink));
          return [...prev, ...collected.filter(c => !seen.has(c.permlink))];
        });

        if (exhaustedRef.current) setHasMore(false);
      } catch (err) {
        console.error('useProfileSnaps fetch error:', err);
      } finally {
        if (versionRef.current === requestVersion) {
          fetchingRef.current = false;
          setIsLoading(false);
        }
      }
    };

    run();
  }, [page, username]);

  const loadNextPage = () => {
    if (!isLoading && hasMore && !fetchingRef.current) {
      setPage(p => p + 1);
    }
  };

  const refresh = () => {
    versionRef.current++;
    cursorRef.current = '';
    exhaustedRef.current = false;
    fetchingRef.current = false;
    setSnaps([]);
    setHasMore(true);
    setPage(p => p + 1);
  };

  return { comments: snaps, isLoading, hasMore, loadNextPage, refresh };
}
