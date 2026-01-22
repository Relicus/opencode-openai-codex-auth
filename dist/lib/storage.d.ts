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
export declare function loadAccounts(): Promise<AccountStorage | null>;
export declare function saveAccounts(storage: AccountStorage): Promise<void>;
//# sourceMappingURL=storage.d.ts.map