import type { AuthorizationFlow, TokenResult, ParsedAuthInput, JWTPayload } from "../types.js";
export declare const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export declare const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
export declare const TOKEN_URL = "https://auth.openai.com/oauth/token";
export declare const REDIRECT_URI = "http://localhost:1455/auth/callback";
export declare const SCOPE = "openid profile email offline_access";
/**
 * Generate a random state value for OAuth flow
 * @returns Random hex string
 */
export declare function createState(): string;
/**
 * Parse authorization code and state from user input
 * @param input - User input (URL, code#state, or just code)
 * @returns Parsed authorization data
 */
export declare function parseAuthorizationInput(input: string): ParsedAuthInput;
/**
 * Exchange authorization code for access and refresh tokens
 * @param code - Authorization code from OAuth flow
 * @param verifier - PKCE verifier
 * @param redirectUri - OAuth redirect URI
 * @returns Token result
 */
export declare function exchangeAuthorizationCode(code: string, verifier: string, redirectUri?: string): Promise<TokenResult>;
/**
 * Decode a JWT token to extract payload
 * @param token - JWT token to decode
 * @returns Decoded payload or null if invalid
 */
export declare function decodeJWT(token: string): JWTPayload | null;
/**
 * Refresh access token using refresh token
 * @param refreshToken - Refresh token
 * @returns Token result
 */
export declare function refreshAccessToken(refreshToken: string): Promise<TokenResult>;
/**
 * Create OAuth authorization flow
 * @returns Authorization flow details
 */
export declare function createAuthorizationFlow(): Promise<AuthorizationFlow>;
//# sourceMappingURL=auth.d.ts.map