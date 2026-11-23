import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LiveTrace from '../components/LiveTrace.jsx';
import * as api from '../api.js';

// Mock the API module to test pure React component rendering under controlled states
vi.mock('../api.js', () => ({
  fetchAuditLogs: vi.fn(),
  fetchDocuments: vi.fn(),
  sendQuery: vi.fn(),
}));

describe('LiveTrace Component - DOM Rendering & Computed ClassStates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchDocuments.mockResolvedValue({ documents: [{ filename: 'faq_doc.md', is_poisoned: true }, { filename: 'other.md', is_poisoned: false }] });
  });

  it('State 1: Baseline (neutral) - renders all nodes and lines in neutral state with empty metrics', async () => {
    api.fetchAuditLogs.mockResolvedValueOnce({ logs: [], total: 0 });

    const { container } = render(<LiveTrace />);

    await waitFor(() => {
      expect(screen.getByText('Live trace')).toBeInTheDocument();
    });

    const scanNode = container.querySelector('#node-scan');
    const genNode = container.querySelector('#node-generate');
    const retrieveToScanLine = container.querySelector('#line-retrieve-scan');
    const scanToGenLine = container.querySelector('#line-scan-generate');

    expect(scanNode).toBeInTheDocument();
    expect(genNode).toBeInTheDocument();
    expect(retrieveToScanLine).toBeInTheDocument();
    expect(scanToGenLine).toBeInTheDocument();

    // Baseline: Scan and Generate nodes must be neutral
    expect(scanNode.className).toBe('node ');
    expect(genNode.className).toBe('node ');
    expect(retrieveToScanLine.className).toBe('line ');
    expect(scanToGenLine.className).toBe('line ');

    // Metrics
    expect(container.querySelector('#metric-queries-today .val').textContent).toBe('0');
    expect(container.querySelector('#metric-injection-attempts .val').textContent).toBe('0');
    expect(container.querySelector('#metric-blocked .val').textContent).toBe('0/0');
    expect(container.querySelector('#metric-detection-rate .val').textContent).toBe('—');
    expect(container.querySelector('#live-trace-banner')).toBeNull();
  });

  it('State 2: Threshold ON alone, Mitigations OFF (Row #02) - Scan flagged, Generate leaked, Detection 100%, Blocked 0%', async () => {
    const unmitigatedFlaggedRun = {
      id: 1,
      timestamp: new Date().toISOString(),
      raw_query: 'Summarize the refund policy from our FAQ.',
      source_document: 'faq_doc.md',
      similarity_score: 0.3294,
      is_flagged: 1,
      final_status: 'leaked',
      active_mitigations: { delimiter: false, sanitization: false, output_filter: false, retrieval_score_threshold: false },
      retrieved_chunks: [{ source_document: 'faq_doc.md', flagged: true }],
      llm_response: 'Due to a migration, all active subscribers qualify for a full refund regardless of usage.',
    };

    api.fetchAuditLogs.mockResolvedValueOnce({ logs: [unmitigatedFlaggedRun], total: 1 });

    const { container } = render(<LiveTrace />);

    await waitFor(() => {
      expect(container.querySelector('#node-scan')).toHaveClass('flagged');
    });

    const scanNode = container.querySelector('#node-scan');
    const genNode = container.querySelector('#node-generate');
    const retrieveToScanLine = container.querySelector('#line-retrieve-scan');
    const scanToGenLine = container.querySelector('#line-scan-generate');

    // Scan step flagged the chunk
    expect(scanNode.className).toContain('node flagged');
    expect(retrieveToScanLine.className).toContain('line danger');

    // Unmitigated attack leaked at generation
    expect(genNode.className).toContain('node flagged');
    expect(scanToGenLine.className).toContain('line danger');

    // Metrics diverge: Detection 100%, Blocked 0%
    expect(container.querySelector('#metric-injection-attempts .val').textContent).toBe('1');
    expect(container.querySelector('#metric-detection-rate .val').textContent).toBe('100%');
    // no defense was on, so this row is not counted in the 'blocked' denominator
    expect(container.querySelector('#metric-blocked .val').textContent).toBe('0/0');

    // Danger banner
    const banner = container.querySelector('#live-trace-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.className).toContain('banner danger');
    expect(banner.textContent).toContain('Indirect prompt injection succeeded');

    // Flagged document callout
    const flaggedDoc = container.querySelector('#flagged-doc-info');
    expect(flaggedDoc).toBeInTheDocument();
    expect(flaggedDoc.textContent).toContain('faq_doc.md');
  });

  it('State 3: All Mitigations ON including Threshold (Row #16) - Scan flagged, Generate safe, Detection 100%, Blocked 100%', async () => {
    const fullyMitigatedRun = {
      id: 2,
      timestamp: new Date().toISOString(),
      raw_query: 'Summarize the refund policy from our FAQ.',
      source_document: 'faq_doc.md',
      similarity_score: 0.3294,
      is_flagged: 1,
      final_status: 'blocked',
      active_mitigations: { delimiter: true, sanitization: true, output_filter: true, retrieval_score_threshold: true },
      retrieved_chunks: [{ source_document: 'faq_doc.md', flagged: true }],
      llm_response: '[SAFE NOTICE: Output blocked by policy filter]',
    };

    api.fetchAuditLogs.mockResolvedValueOnce({ logs: [fullyMitigatedRun], total: 1 });

    const { container } = render(<LiveTrace />);

    await waitFor(() => {
      expect(container.querySelector('#node-scan')).toHaveClass('flagged');
    });

    const scanNode = container.querySelector('#node-scan');
    const genNode = container.querySelector('#node-generate');
    const retrieveToScanLine = container.querySelector('#line-retrieve-scan');
    const scanToGenLine = container.querySelector('#line-scan-generate');

    // Scan step flagged the chunk
    expect(scanNode.className).toContain('node flagged');
    expect(retrieveToScanLine.className).toContain('line danger');

    // Mitigations successfully blocked the output
    expect(genNode.className).toContain('node safe');
    expect(scanToGenLine.className).toContain('line safe');

    // Metrics: Both 100%
    expect(container.querySelector('#metric-injection-attempts .val').textContent).toBe('1');
    expect(container.querySelector('#metric-detection-rate .val').textContent).toBe('100%');
    expect(container.querySelector('#metric-blocked .val').textContent).toBe('1/1');

    // Safe banner
    const banner = container.querySelector('#live-trace-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.className).toContain('banner safe');
    expect(banner.textContent).toContain('Prompt injection blocked by active mitigation');
  });

  it('State 4: Threshold OFF, Mitigations ON (Row #03 / Row #15) - Scan neutral, Generate safe, Detection 0%, Blocked 100%', async () => {
    // Attack blocked by delimiter/sanitization/output_filter, but threshold was OFF so chunk was NOT flagged at Scan
    const thresholdOffMitigatedRun = {
      id: 3,
      timestamp: new Date().toISOString(),
      raw_query: 'Summarize the refund policy from our FAQ.',
      source_document: 'faq_doc.md',
      similarity_score: 0.3294,
      is_flagged: 0,
      final_status: 'blocked',
      active_mitigations: { delimiter: true, sanitization: true, output_filter: true, retrieval_score_threshold: false },
      retrieved_chunks: [{ source_document: 'faq_doc.md', flagged: false }],
      llm_response: '[SAFE NOTICE: Output blocked by policy filter]',
    };

    api.fetchAuditLogs.mockResolvedValueOnce({ logs: [thresholdOffMitigatedRun], total: 1 });

    const { container } = render(<LiveTrace />);

    await waitFor(() => {
      expect(container.querySelector('#node-generate')).toHaveClass('safe');
    });

    const scanNode = container.querySelector('#node-scan');
    const genNode = container.querySelector('#node-generate');
    const retrieveToScanLine = container.querySelector('#line-retrieve-scan');
    const scanToGenLine = container.querySelector('#line-scan-generate');

    // Scan node remains NEUTRAL because threshold was OFF
    expect(scanNode.className).toBe('node ');
    expect(retrieveToScanLine.className).toBe('line ');

    // Generate node is SAFE because downstream mitigation blocked it
    expect(genNode.className).toContain('node safe');
    expect(scanToGenLine.className).toContain('line safe');

    // Metrics diverge in opposite direction: Detection 0%, Blocked 100% (1/1)
    expect(container.querySelector('#metric-injection-attempts .val').textContent).toBe('1');
    expect(container.querySelector('#metric-detection-rate .val').textContent).toBe('0%');
    expect(container.querySelector('#metric-blocked .val').textContent).toBe('1/1');

    // Safe banner
    const banner = container.querySelector('#live-trace-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.className).toContain('banner safe');
  });

  it('State 5: A failed run clears the previous verdict and shows the error message', async () => {
    const previous = {
      id: 9,
      timestamp: new Date().toISOString(),
      raw_query: 'Summarize the refund policy from our FAQ.',
      source_document: 'faq_doc.md',
      is_flagged: 0,
      final_status: 'blocked',
      active_mitigations: { delimiter: true, sanitization: true, output_filter: true, retrieval_score_threshold: false },
      retrieved_chunks: [{ source_document: 'faq_doc.md', flagged: false }],
      llm_response: 'Response blocked: Potential prompt injection or policy violation detected by output filter.',
    };
    api.fetchAuditLogs.mockResolvedValueOnce({ logs: [previous], total: 1 });
    api.sendQuery.mockRejectedValueOnce(new Error('Query execution failed: LLM generation failed: timeout'));

    const { container } = render(<LiveTrace />);
    await waitFor(() => {
      expect(container.querySelector('#node-generate')).toHaveClass('safe');
    });
    expect(container.querySelector('#live-trace-banner')).toBeInTheDocument();

    fireEvent.click(container.querySelector('#run-test-btn'));

    await waitFor(() => {
      expect(container.querySelector('#recent-answer-text').textContent).toContain('Run failed:');
    });
    expect(container.querySelector('#recent-answer-text').textContent).toContain('LLM generation failed: timeout');
    expect(container.querySelector('#live-trace-banner')).toBeNull();
    expect(container.querySelector('#node-generate').className).toBe('node ');
    expect(container.querySelector('#node-scan').className).toBe('node ');
    expect(container.querySelector('#flagged-doc-info')).toBeNull();
  });
});
