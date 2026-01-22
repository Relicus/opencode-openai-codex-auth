import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
const STORAGE_DIR = join(homedir(), ".config", "opencode");
const ACCOUNTS_FILE = join(STORAGE_DIR, "openai-accounts.json");
export async function loadAccounts() {
    try {
        const content = await readFile(ACCOUNTS_FILE, "utf-8");
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
export async function saveAccounts(storage) {
    try {
        await mkdir(STORAGE_DIR, { recursive: true });
        await writeFile(ACCOUNTS_FILE, JSON.stringify(storage, null, 2));
    }
    catch (error) {
        console.error("Failed to save accounts:", error);
    }
}
//# sourceMappingURL=storage.js.map