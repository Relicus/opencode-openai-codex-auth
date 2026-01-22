import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export interface OpenAIAccount {
  index: number;
  email?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  addedAt: number;
  lastUsed: number;
  consecutiveFailures?: number;
  rateLimitResetTime?: number;
}

export interface AccountStorage {
  version: number;
  accounts: OpenAIAccount[];
  activeIndex: number;
}

const STORAGE_DIR = join(homedir(), ".config", "opencode");
const ACCOUNTS_FILE = join(STORAGE_DIR, "openai-accounts.json");

export async function loadAccounts(): Promise<AccountStorage | null> {
  try {
    const content = await readFile(ACCOUNTS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function saveAccounts(storage: AccountStorage): Promise<void> {
  try {
    await mkdir(STORAGE_DIR, { recursive: true });
    await writeFile(ACCOUNTS_FILE, JSON.stringify(storage, null, 2));
  } catch (error) {
    console.error("Failed to save accounts:", error);
  }
}
