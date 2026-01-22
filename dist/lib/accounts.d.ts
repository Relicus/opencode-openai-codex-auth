import { OpenAIAccount } from "./storage";
export declare class AccountManager {
    private accounts;
    private healthTracker;
    private tokenTracker;
    private constructor();
    static load(): Promise<AccountManager>;
    getAccountCount(): number;
    getAccounts(): OpenAIAccount[];
    clear(): Promise<void>;
    addAccount(auth: {
        access: string;
        refresh: string;
        expires: number;
    }): Promise<void>;
    save(): Promise<void>;
    getBestAccount(): Promise<OpenAIAccount | null>;
    refreshAccount(account: OpenAIAccount): Promise<OpenAIAccount>;
    markSuccess(account: OpenAIAccount): void;
    markRateLimit(account: OpenAIAccount, retryAfterMs?: number): void;
    markFailure(account: OpenAIAccount): void;
}
//# sourceMappingURL=accounts.d.ts.map