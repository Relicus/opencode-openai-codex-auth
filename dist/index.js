/**
 * OpenAI ChatGPT (Codex) OAuth Authentication Plugin for opencode
 *
 * MULTI-ACCOUNT VERSION (Hybrid Rotation)
 */
import { createAuthorizationFlow, decodeJWT, exchangeAuthorizationCode, parseAuthorizationInput, REDIRECT_URI, } from "./lib/auth/auth.js";
import { openBrowserUrl } from "./lib/auth/browser.js";
import { startLocalOAuthServer } from "./lib/auth/server.js";
import { getCodexMode, loadPluginConfig } from "./lib/config.js";
import { AUTH_LABELS, CODEX_BASE_URL, DUMMY_API_KEY, JWT_CLAIM_PATH, LOG_STAGES, PLUGIN_NAME, PROVIDER_ID, } from "./lib/constants.js";
import { logRequest, logDebug } from "./lib/logger.js";
import { createCodexHeaders, extractRequestUrl, handleErrorResponse, handleSuccessResponse, rewriteUrlForCodex, transformRequestForCodex, } from "./lib/request/fetch-helpers.js";
import { AccountManager } from "./lib/accounts.js";
/**
 * OpenAI Codex OAuth authentication plugin for opencode
 */
export const OpenAIAuthPlugin = async ({ client }) => {
    const buildManualOAuthFlow = (pkce, url) => ({
        url,
        method: "code",
        instructions: AUTH_LABELS.INSTRUCTIONS_MANUAL,
        callback: async (input) => {
            const parsed = parseAuthorizationInput(input);
            if (!parsed.code) {
                return { type: "failed" };
            }
            const tokens = await exchangeAuthorizationCode(parsed.code, pkce.verifier, REDIRECT_URI);
            if (tokens?.type === "success") {
                const mgr = await AccountManager.load();
                await mgr.addAccount(tokens);
            }
            return tokens?.type === "success" ? tokens : { type: "failed" };
        },
    });
    return {
        auth: {
            provider: PROVIDER_ID,
            /**
             * Loader function that configures OAuth authentication and request handling
             */
            async loader(getAuth, provider) {
                // Initialize AccountManager
                const accountManager = await AccountManager.load();
                // Sync current SDK auth if valid OAuth
                const auth = await getAuth();
                if (auth.type === "oauth" && auth.access && auth.refresh && auth.expires) {
                    await accountManager.addAccount({
                        access: auth.access,
                        refresh: auth.refresh,
                        expires: auth.expires
                    });
                }
                // Only skip if we have NO accounts and current auth is not oauth
                if (accountManager.getAccountCount() === 0 && auth.type !== "oauth") {
                    return {};
                }
                // Extract user configuration
                const providerConfig = provider;
                const userConfig = {
                    global: providerConfig?.options || {},
                    models: providerConfig?.models || {},
                };
                // Load plugin configuration
                const pluginConfig = loadPluginConfig();
                const codexMode = getCodexMode(pluginConfig);
                // Return SDK configuration
                return {
                    apiKey: DUMMY_API_KEY,
                    baseURL: CODEX_BASE_URL,
                    /**
                     * Custom fetch implementation for Codex API with Rotation
                     */
                    async fetch(input, init) {
                        const originalUrl = extractRequestUrl(input);
                        const url = rewriteUrlForCodex(originalUrl);
                        // Transform request body
                        const transformation = await transformRequestForCodex(init, url, userConfig, codexMode);
                        const requestInit = transformation?.updatedInit ?? init;
                        let lastError;
                        // Try enough times to cycle through accounts + retries
                        const maxAttempts = Math.max(2, accountManager.getAccountCount() * 2);
                        for (let attempt = 0; attempt < maxAttempts; attempt++) {
                            const account = await accountManager.getBestAccount();
                            if (!account) {
                                if (attempt === 0)
                                    throw new Error("No accounts available");
                                // Wait a bit if we are looping
                                await new Promise(r => setTimeout(r, 1000));
                                continue;
                            }
                            try {
                                // Refresh if needed
                                const activeAccount = await accountManager.refreshAccount(account);
                                // Extract Account ID from the rotated token
                                const decoded = decodeJWT(activeAccount.accessToken);
                                const accountId = decoded?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
                                if (!accountId) {
                                    logDebug(`[${PLUGIN_NAME}] Invalid account ID for ${activeAccount.email}`);
                                    accountManager.markFailure(activeAccount);
                                    continue;
                                }
                                // Create headers with rotated credentials
                                const headers = createCodexHeaders(requestInit, accountId, activeAccount.accessToken, {
                                    model: transformation?.body.model,
                                    promptCacheKey: transformation?.body?.prompt_cache_key,
                                });
                                // Make request
                                const response = await fetch(url, {
                                    ...requestInit,
                                    headers,
                                });
                                // Log response
                                logRequest(LOG_STAGES.RESPONSE, {
                                    status: response.status,
                                    ok: response.ok,
                                    statusText: response.statusText,
                                    headers: Object.fromEntries(response.headers.entries()),
                                });
                                // Handle Rate Limits (429)
                                if (response.status === 429) {
                                    const retryAfterHeader = response.headers.get("retry-after");
                                    let waitMs = 60000;
                                    if (retryAfterHeader) {
                                        const parsed = parseInt(retryAfterHeader);
                                        if (!isNaN(parsed))
                                            waitMs = parsed * 1000;
                                    }
                                    logDebug(`[${PLUGIN_NAME}] 429 Rate Limit on ${activeAccount.email}. Switching...`);
                                    accountManager.markRateLimit(activeAccount, waitMs);
                                    continue;
                                }
                                // Handle Auth Errors (401)
                                if (response.status === 401) {
                                    logDebug(`[${PLUGIN_NAME}] 401 Unauthorized on ${activeAccount.email}.`);
                                    accountManager.markFailure(activeAccount);
                                    continue;
                                }
                                // Handle other errors
                                if (!response.ok) {
                                    return await handleErrorResponse(response);
                                }
                                // Success!
                                accountManager.markSuccess(activeAccount);
                                const originalBody = init?.body ? JSON.parse(init.body) : {};
                                const isStreaming = originalBody.stream === true;
                                return await handleSuccessResponse(response, isStreaming);
                            }
                            catch (error) {
                                logDebug(`[${PLUGIN_NAME}] Request error: ${error}`);
                                lastError = error;
                                accountManager.markFailure(account);
                            }
                        }
                        throw lastError || new Error("All accounts failed or rate-limited.");
                    },
                };
            },
            methods: [
                {
                    label: AUTH_LABELS.OAUTH,
                    type: "oauth",
                    authorize: async () => {
                        const mgr = await AccountManager.load();
                        const accounts = mgr.getAccounts();
                        if (accounts.length > 0) {
                            console.log(`\n${accounts.length} account(s) saved:`);
                            accounts.forEach((acc, i) => {
                                console.log(`  ${i + 1}. ${acc.email || "Unknown Email"}`);
                            });
                            console.log("");
                            const { createInterface } = await import("node:readline/promises");
                            const rl = createInterface({ input: process.stdin, output: process.stdout });
                            try {
                                const answer = await rl.question("(a)dd new account(s) or (f)resh start? [a/f]: ");
                                if (answer.trim().toLowerCase() === 'f') {
                                    await mgr.clear();
                                    console.log("Accounts cleared. Starting fresh login...");
                                }
                                else {
                                    console.log("Adding new account...");
                                }
                            }
                            finally {
                                rl.close();
                            }
                        }
                        const { pkce, state, url } = await createAuthorizationFlow();
                        const serverInfo = await startLocalOAuthServer({ state });
                        openBrowserUrl(url);
                        if (!serverInfo.ready) {
                            serverInfo.close();
                            return buildManualOAuthFlow(pkce, url);
                        }
                        return {
                            url,
                            method: "auto",
                            instructions: AUTH_LABELS.INSTRUCTIONS,
                            callback: async () => {
                                const result = await serverInfo.waitForCode(state);
                                serverInfo.close();
                                if (!result) {
                                    return { type: "failed" };
                                }
                                const tokens = await exchangeAuthorizationCode(result.code, pkce.verifier, REDIRECT_URI);
                                if (tokens?.type === "success") {
                                    const mgr = await AccountManager.load();
                                    await mgr.addAccount(tokens);
                                }
                                return tokens?.type === "success"
                                    ? tokens
                                    : { type: "failed" };
                            },
                        };
                    },
                },
                {
                    label: AUTH_LABELS.OAUTH_MANUAL,
                    type: "oauth",
                    authorize: async () => {
                        const { pkce, url } = await createAuthorizationFlow();
                        return buildManualOAuthFlow(pkce, url);
                    },
                },
                {
                    label: AUTH_LABELS.API_KEY,
                    type: "api",
                },
            ],
        },
    };
};
export default OpenAIAuthPlugin;
//# sourceMappingURL=index.js.map