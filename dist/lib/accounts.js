import { loadAccounts, saveAccounts } from "./storage";
import { selectHybridAccount, initHealthTracker, initTokenTracker } from "./rotation";
import { refreshAccessToken, decodeJWT } from "./auth/auth";
export class AccountManager {
    accounts = [];
    healthTracker;
    tokenTracker;
    constructor(accounts) {
        this.accounts = accounts;
        this.healthTracker = initHealthTracker({});
        this.tokenTracker = initTokenTracker({});
        // Fix indices
        this.accounts.forEach((acc, idx) => acc.index = idx);
    }
    static async load() {
        const stored = await loadAccounts();
        return new AccountManager(stored?.accounts || []);
    }
    getAccountCount() {
        return this.accounts.length;
    }
    getAccounts() {
        return this.accounts;
    }
    async clear() {
        this.accounts = [];
        await this.save();
    }
    async addAccount(auth) {
        // Check duplicates by refresh token
        let account = this.accounts.find(a => a.refreshToken === auth.refresh);
        // If not found, check by email to update existing account with new token
        if (!account) {
            const decoded = decodeJWT(auth.access);
            const email = decoded?.email;
            if (email) {
                account = this.accounts.find(a => a.email === email);
            }
        }
        if (account) {
            account.accessToken = auth.access;
            account.refreshToken = auth.refresh;
            account.expiresAt = auth.expires;
        }
        else {
            const decoded = decodeJWT(auth.access);
            const email = decoded?.email || `account-${this.accounts.length + 1}`;
            this.accounts.push({
                index: this.accounts.length,
                email,
                accessToken: auth.access,
                refreshToken: auth.refresh,
                expiresAt: auth.expires,
                addedAt: Date.now(),
                lastUsed: 0
            });
        }
        await this.save();
    }
    async save() {
        await saveAccounts({
            version: 1,
            accounts: this.accounts,
            activeIndex: 0
        });
    }
    async getBestAccount() {
        if (this.accounts.length === 0)
            return null;
        const metrics = this.accounts.map(acc => ({
            index: acc.index,
            lastUsed: acc.lastUsed,
            healthScore: this.healthTracker.getScore(acc.index),
            isRateLimited: (acc.rateLimitResetTime || 0) > Date.now(),
            isCoolingDown: false
        }));
        const selectedIndex = selectHybridAccount(metrics, this.tokenTracker);
        // Fallback if all are limited/unhealthy: just pick the first one not rate limited, or just the first one
        if (selectedIndex === null) {
            const available = this.accounts.find(acc => (acc.rateLimitResetTime || 0) <= Date.now());
            if (available)
                return available;
            // If all rate limited, return the one with earliest reset time
            return this.accounts.sort((a, b) => (a.rateLimitResetTime || 0) - (b.rateLimitResetTime || 0))[0];
        }
        return this.accounts[selectedIndex];
    }
    async refreshAccount(account) {
        // Check if expired
        if (Date.now() < account.expiresAt - 60000) {
            return account;
        }
        const result = await refreshAccessToken(account.refreshToken);
        if (result.type === "success" && result.access && result.refresh && result.expires) {
            account.accessToken = result.access;
            account.refreshToken = result.refresh;
            account.expiresAt = result.expires;
            await this.save();
            return account;
        }
        else {
            this.healthTracker.recordFailure(account.index);
            throw new Error("Token refresh failed");
        }
    }
    markSuccess(account) {
        this.healthTracker.recordSuccess(account.index);
        account.lastUsed = Date.now();
        // Refund token cost (simplified: we consumed it when selecting? No, rotation logic in Antigravity consumed it)
        // Antigravity calls `tokenTracker.consume` inside `selectHybridAccount`? No, it calls it after selection.
        // I need to consume tokens here.
        this.tokenTracker.consume(account.index);
        this.save();
    }
    markRateLimit(account, retryAfterMs = 60000) {
        this.healthTracker.recordRateLimit(account.index);
        this.tokenTracker.refund(account.index); // Refund if we failed
        account.rateLimitResetTime = Date.now() + retryAfterMs;
        this.save();
    }
    markFailure(account) {
        this.healthTracker.recordFailure(account.index);
        this.tokenTracker.refund(account.index);
        this.save();
    }
}
//# sourceMappingURL=accounts.js.map