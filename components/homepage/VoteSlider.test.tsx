// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import VoteControls from './VoteSlider';

vi.mock('@/hooks/useRememberedVoteWeight', () => ({
  useRememberedVoteWeight: () => ({ weight: 100, setWeight: vi.fn(), rememberWeight: vi.fn() }),
}));

vi.mock('@/components/shared/VotersModal', () => ({ default: () => null }));

describe('VoteControls', () => {
  it('gives the vote heart an accessible name', () => {
    render(
      <ChakraProvider>
        <VoteControls
          initialVoted={false}
          initialVoteCount={3}
          onVote={vi.fn(async () => ({ success: true }))}
        />
      </ChakraProvider>,
    );

    expect(screen.getByRole('button', { name: 'Vote' })).toBeTruthy();
  });
});
