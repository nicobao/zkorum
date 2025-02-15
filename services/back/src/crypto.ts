import { log } from "./app.js";

// see https://nodejs.org/api/crypto.html for reasons behind dynamic ESM import
type CryptoModule = typeof import("node:crypto");
let crypto: CryptoModule;
try {
    crypto = await import("node:crypto");
} catch (err) {
    log.error("crypto support is disabled!");
}

// Used to generate cryptographically random user identifier (for VC and voting purpose, to preserve privacy)
export function generateRandomHex() {
    // 32 random bytes (16 would already be considered resistant to brute-force attacks and is often used as API token)
    const randomBytes = new Uint8Array(32);
    crypto.webcrypto.getRandomValues(randomBytes);
    return Buffer.from(randomBytes).toString("hex");
}

// Generate cryptographically random 6 digits code for email validation.
// Standard practice, used by Ory for example.
// Though Node's crypto functions - which are based on OpenSSL - aren't the most secure compared to libsodium, it's enough for this purpose as we also rate-limit the number of attempts.
export function generateOneTimeCode(): number {
    return crypto.randomInt(0, 999999);
}

export function codeToString(code: number): string {
    return code.toString().padStart(6, "0");
}

export function generateUUID() {
    return crypto.webcrypto.randomUUID();
}
