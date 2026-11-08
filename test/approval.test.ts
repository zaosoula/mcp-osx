import { describe, it, expect, vi } from 'vitest';
import { createApproval, bindingOf } from '../src/approval.js';
import type { ConfirmRequest } from '../src/confirm.js';

const A: ConfirmRequest = { title: 'Run?', script: 'beep', lang: 'applescript' };
const B: ConfirmRequest = { ...A, script: 'do shell script "evil"' };

function ctx(opts: { caps?: object; responses?: Record<string, unknown>; state?: unknown }) {
  return {
    mcpReq: {
      envelope: opts.caps ? { 'io.modelcontextprotocol/clientCapabilities': opts.caps } : undefined,
      inputResponses: opts.responses,
      requestState: () => opts.state,
    },
  } as any;
}
const accepted = { approve: { action: 'accept', content: { approve: true } } };
const legacyServer = (caps?: object) => ({ server: { getClientCapabilities: () => caps } }) as any;

describe('approval', () => {
  it('asks the client to elicit when it can, with signed state', async () => {
    const dialog = vi.fn();
    const { approve } = createApproval({ runner: vi.fn(), dialog, getServer: () => legacyServer() });
    const r: any = await approve(A, ctx({ caps: { elicitation: { form: {} } } }));
    expect(r.resultType).toBe('input_required');
    expect(r.inputRequests.approve.params.message).toContain('beep');
    expect(typeof r.requestState).toBe('string');
    expect(r.requestState).not.toContain(bindingOf(A)); // sealed, not raw
    expect(dialog).not.toHaveBeenCalled();
  });

  it('falls back to the native dialog when the client cannot elicit', async () => {
    const dialog = vi.fn(async () => true);
    const { approve } = createApproval({ runner: vi.fn(), dialog, getServer: () => legacyServer({}) });
    expect(await approve(A, ctx({}))).toBe(true);
    expect(dialog).toHaveBeenCalledOnce();
  });

  it('accepts an approval bound to the same request', async () => {
    const { approve } = createApproval({ runner: vi.fn(), getServer: () => legacyServer() });
    expect(await approve(A, ctx({ responses: accepted, state: { h: bindingOf(A) } }))).toBe(true);
  });

  it('rejects an approval minted for a different script', async () => {
    const { approve } = createApproval({ runner: vi.fn(), getServer: () => legacyServer() });
    expect(await approve(B, ctx({ responses: accepted, state: { h: bindingOf(A) } }))).toBe(false);
  });

  it('rejects an approval with no or unverified state', async () => {
    const { approve } = createApproval({ runner: vi.fn(), getServer: () => legacyServer() });
    expect(await approve(A, ctx({ responses: accepted, state: undefined }))).toBe(false);
    expect(await approve(A, ctx({ responses: accepted, state: 'raw-string' }))).toBe(false);
  });

  it('declined or unchecked approvals deny', async () => {
    const { approve } = createApproval({ runner: vi.fn(), getServer: () => legacyServer() });
    const st = { h: bindingOf(A) };
    expect(await approve(A, ctx({ responses: { approve: { action: 'decline' } }, state: st }))).toBe(false);
    expect(await approve(A, ctx({ responses: { approve: { action: 'accept', content: { approve: false } } }, state: st }))).toBe(false);
  });

  it('codec round-trips and rejects tampering', async () => {
    const { approve, verifyState } = createApproval({ runner: vi.fn(), getServer: () => legacyServer() });
    const r: any = await approve(A, ctx({ caps: { elicitation: {} } }));
    expect(await verifyState(r.requestState, ctx({}))).toEqual({ h: bindingOf(A) });
    const tampered = r.requestState.slice(0, -2) + (r.requestState.endsWith('AA') ? 'BB' : 'AA');
    await expect(verifyState(tampered, ctx({}))).rejects.toThrow();
  });
});
