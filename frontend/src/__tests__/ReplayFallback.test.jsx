import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TraceDetail from '../components/TraceDetail.jsx';
import fixture from '../replay/replay_fixture.json';
import * as api from '../api.js';

vi.mock('../api.js', () => ({
  fetchAuditLogById: vi.fn(),
  fetchAuditLogs: vi.fn(),
  sendQuery: vi.fn(),
  fetchSettings: vi.fn(),
}));

describe('Attack replay: recorded fixture fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the fixture holds the six real recorded runs with raw output, model, date and commit', () => {
    expect(fixture.runs.map((r) => r.key)).toEqual([
      'all_off', 'delimiter', 'sanitization', 'output_filter', 'threshold', 'all_on',
    ]);
    expect(fixture.model).toBeTruthy();
    expect(fixture.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(fixture.base_commit).toMatch(/^[0-9a-f]{7,40}$/);
    fixture.runs.forEach((r) => {
      expect(r.raw_response.length).toBeGreaterThan(0);
      expect(Array.isArray(r.audit_row.retrieved_chunks)).toBe(true);
      expect(r.audit_row.assembled_prompt.length).toBeGreaterThan(0);
    });
  });

  it('explicit "Replay recorded" shows the persistent banner and recorded data without any live call', async () => {
    api.fetchAuditLogs.mockResolvedValue({ logs: [], total: 0 });
    render(<TraceDetail />);
    await waitFor(() => expect(screen.getByTestId('enter-replay-btn')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('enter-replay-btn'));

    const banner = await screen.findByTestId('replay-banner');
    expect(banner.textContent).toContain('Recorded replay');
    expect(banner.textContent).toContain(fixture.recorded_at.slice(0, 10));
    expect(banner.textContent).toContain(fixture.model);
    expect(banner.textContent).toContain('not a live run');
    expect(screen.getByTestId('unmitigated-raw').textContent.length).toBeGreaterThan(0);
    expect(screen.getByTestId('mitigated-response').textContent).toContain('Response blocked');
    expect(api.sendQuery).not.toHaveBeenCalled();
    expect(screen.getByTestId('rerun-full-defense-btn')).toBeDisabled();

    // pick another recorded variant
    fireEvent.change(screen.getByTestId('replay-variant-select'), { target: { value: 'delimiter' } });
    await waitFor(() => {
      expect(screen.getByTestId('mitigated-banner').textContent).toContain('Attack succeeded');
    });
  });

  it('a failed live re-run falls back to the recorded replay with the banner and the error', async () => {
    const live = {
      ...fixture.runs[0].audit_row,
      id: 5,
    };
    api.sendQuery.mockRejectedValueOnce(new Error('Query execution failed: LLM generation failed: connection refused'));
    render(<TraceDetail initialLog={live} />);
    await waitFor(() => expect(screen.getByTestId('rerun-full-defense-btn')).not.toBeDisabled());

    fireEvent.click(screen.getByTestId('rerun-full-defense-btn'));

    const banner = await screen.findByTestId('replay-banner');
    expect(banner.textContent).toContain('not a live run');
    expect(screen.getByTestId('trace-error-banner').textContent).toContain('connection refused');
  });

  it('when the backend is unreachable on load, the screen shows the replay instead of an empty error', async () => {
    api.fetchAuditLogs.mockRejectedValueOnce(new Error('Failed to fetch'));
    render(<TraceDetail />);
    const banner = await screen.findByTestId('replay-banner');
    expect(banner.textContent).toContain('Backend unavailable');
  });
});
