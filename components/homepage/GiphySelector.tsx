import React, { useEffect, useRef, useState } from 'react';
import { Input, Center, Spinner, InputGroup, InputRightElement } from '@chakra-ui/react';
import type { GiphyFetch, GifsResult } from '@giphy/js-fetch-api';
import type { IGif } from '@giphy/js-types';
import { FaSearch } from 'react-icons/fa';

interface GiphySelectorProps {
    apiKey: string;
    onSelect: (gif: IGif, e: React.SyntheticEvent<HTMLElement>) => void;
}

type GifGrid = React.ComponentType<{
    width: number;
    columns: number;
    fetchGifs: (offset: number) => Promise<GifsResult>;
    onGifClick: (gif: IGif, e: React.SyntheticEvent<HTMLElement>) => void;
}>;

// The Giphy UI is only mounted while the picker is open. Keep its packages out
// of the feed's first-load chunk and pull them in when this component mounts.
const GiphySelector: React.FC<GiphySelectorProps> = ({ apiKey, onSelect }) => {
    const gfRef = useRef<GiphyFetch | null>(null);
    // Hold the component in an object so setState does not treat it as an updater.
    const [grid, setGrid] = useState<{ Comp: GifGrid } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [key, setKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [ui, api] = await Promise.all([
                import('@giphy/react-components'),
                import('@giphy/js-fetch-api'),
            ]);
            if (cancelled) return;
            gfRef.current = new api.GiphyFetch(apiKey);
            setGrid({ Comp: ui.Grid as unknown as GifGrid });
        })();
        return () => { cancelled = true; };
    }, [apiKey]);

    const fetchGifs = async (offset: number): Promise<GifsResult> => {
        const gf = gfRef.current;
        if (!gf) {
            return { data: [], pagination: { total_count: 0, count: 0, offset }, meta: { status: 200, msg: 'OK', response_id: '' } };
        }
        setIsLoading(true);
        const result = searchTerm
            ? await gf.search(searchTerm, { offset, limit: 10 })
            : await gf.trending({ offset, limit: 10 });
        setIsLoading(false);
        return result;
    };

    const handleSearchTermChange = (value: string) => {
        setSearchTerm(value);
    };

    const handleSearchIconClick = () => {
        fetchGifs(0);
        setKey(key + 1);
    };

    const handleGifClick = (gif: IGif, e: React.SyntheticEvent<HTMLElement>) => {
        onSelect(gif, e);
    };

    useEffect(() => {
        if (!grid) return;
        fetchGifs(0);
        setKey(k => k + 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, grid]);

    const Grid = grid?.Comp;

    return (
        <>
            <InputGroup>
                <InputRightElement>
                    {isLoading || !Grid ? <Spinner /> : <FaSearch cursor="pointer" onClick={handleSearchIconClick} />}
                </InputRightElement>
                <Input
                    pr="4.5rem"
                    placeholder="Type to search..."
                    value={searchTerm}
                    onChange={(e) => handleSearchTermChange(e.target.value)}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                            fetchGifs(0);
                            setKey(key + 1);
                        }
                    }}
                />
            </InputGroup>
            <Center mt={4}>
                {Grid && (
                    <Grid
                        key={key}
                        width={450}
                        columns={3}
                        fetchGifs={fetchGifs}
                        onGifClick={handleGifClick}
                    />
                )}
            </Center>
        </>
    );
};

export default GiphySelector;
