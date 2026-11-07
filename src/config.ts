import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Config = { spotify?: { favorites?: string } };

/** Server data directory: $MCP_OSX_HOME or ~/.mcp-osx */
export function dataDir(): string {
  return process.env.MCP_OSX_HOME || join(homedir(), '.mcp-osx');
}

export async function loadConfig(): Promise<Config> {
  try {
    return JSON.parse(await readFile(join(dataDir(), 'config.json'), 'utf8')) as Config;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`Invalid ${join(dataDir(), 'config.json')}: ${(e as Error).message}`);
  }
}
