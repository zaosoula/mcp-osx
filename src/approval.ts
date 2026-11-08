import { createHash, randomBytes } from 'node:crypto';
import {
  acceptedContent,
  createRequestStateCodec,
  inputRequired,
  type InputRequiredResult,
  type McpServer,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { CLIENT_CAPABILITIES_META_KEY } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { elicitMessage, nativeDialog, type ConfirmRequest, type Dialog } from './confirm.js';
import type { Runner } from './osascript.js';

const APPROVE_KEY = 'approve';
const approveSchema = z.object({ approve: z.boolean().describe('Check to allow this action') });

/** Everything the user is shown; the approval is only valid for exactly this. */
export const bindingOf = (req: ConfirmRequest) =>
  createHash('sha256').update(JSON.stringify([req.title, req.note ?? '', req.lang, req.script])).digest('hex');

/**
 * Multi-round-trip approval (MCP 2026-07-28 `inputRequired`; the SDK's legacy
 * shim serves 2025-era clients through the same path).
 *
 * Round 1 returns an `input_required` result asking the client to elicit an
 * approval, with an HMAC-signed `requestState` bound to a hash of what is shown.
 * Round 2 only approves when that state verifies and still matches the request,
 * so an approval can never carry over to a different script. Clients that cannot
 * elicit get the native macOS dialog instead. Everything fails closed.
 */
export function createApproval(deps: { runner: Runner; dialog?: Dialog; getServer: () => McpServer }) {
  const dialog = deps.dialog ?? nativeDialog;
  // Per-process key: stdio serves every round of a flow from this one process.
  const codec = createRequestStateCodec<{ h: string }>({ key: randomBytes(32), ttlSeconds: 600 });

  const canElicit = (ctx: ServerContext): boolean => {
    const env = ctx.mcpReq.envelope as Record<string, { elicitation?: unknown } | undefined> | undefined;
    const modern = env?.[CLIENT_CAPABILITIES_META_KEY];
    if (modern) return !!modern.elicitation;
    // 2025-era connections negotiate capabilities once, at initialize.
    return !!deps.getServer().server.getClientCapabilities()?.elicitation;
  };

  async function approve(req: ConfirmRequest, ctx: ServerContext): Promise<boolean | InputRequiredResult> {
    const binding = bindingOf(req);
    const responses = ctx.mcpReq.inputResponses;
    if (responses && APPROVE_KEY in responses) {
      const state = ctx.mcpReq.requestState<{ h: string }>();
      if (state?.h !== binding) return false;
      return acceptedContent(responses, APPROVE_KEY, approveSchema)?.approve === true;
    }
    if (canElicit(ctx)) {
      return inputRequired({
        inputRequests: { [APPROVE_KEY]: inputRequired.elicit({ message: elicitMessage(req), requestedSchema: approveSchema }) },
        requestState: await codec.mint({ h: binding }),
      });
    }
    try {
      return await dialog(req, deps.runner);
    } catch {
      return false;
    }
  }

  return { approve, verifyState: codec.verify };
}
