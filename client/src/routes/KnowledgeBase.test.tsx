/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KnowledgeBase } from './KnowledgeBase';
import { api } from '@/src/api';

vi.mock('@/src/api', () => ({
  api: { getKnowledgeBase: vi.fn() },
}));

describe('KnowledgeBase', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('opens a selected article with its full content', async () => {
    (api.getKnowledgeBase as any).mockResolvedValue([
      {
        id: 'article-1',
        title: 'Reset your password',
        category: 'Account',
        summary: 'Use the reset link to create a new password.',
        content: 'Open the reset link from your email, choose a new password, and sign in again.',
        published: true,
        createdAt: '2026-09-12T00:00:00.000Z',
        updatedAt: '2026-09-12T00:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter>
        <KnowledgeBase />
      </MemoryRouter>,
    );

    const articleButton = await screen.findByRole('button', { name: 'Read article: Reset your password' });
    fireEvent.click(articleButton);

    expect(screen.getByRole('dialog', { name: 'Reset your password' })).toBeDefined();
    expect(
      screen.getByText('Open the reset link from your email, choose a new password, and sign in again.'),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Close article' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
