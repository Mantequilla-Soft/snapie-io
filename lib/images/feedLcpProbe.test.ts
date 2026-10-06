import { describe, expect, it } from 'vitest';
import { probeFeedImageHead } from './feedLcpProbe';

describe('probeFeedImageHead', () => {
  it('does not request a blocked host', async () => {
    await expect(probeFeedImageHead('http://127.0.0.1/secret.jpg')).resolves.toBeNull();
    await expect(probeFeedImageHead('http://localhost/a.png')).resolves.toBeNull();
    await expect(probeFeedImageHead('http://169.254.169.254/latest/meta-data')).resolves.toBeNull();
    await expect(probeFeedImageHead('not a url')).resolves.toBeNull();
  });
});
