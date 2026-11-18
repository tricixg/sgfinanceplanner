// Forge a session cookie for the LOCAL mock only. Tokens are ES256-signed with a throwaway key
// (keypair.json, shared with mock-supabase.js, which serves the matching JWKS), like a project
// on asymmetric JWT signing keys. `node cookie.js forged` signs with a different key under the
// same kid: the proxy must reject it.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const b64u = (s) => Buffer.from(s).toString("base64url");
const KEYFILE = path.join(__dirname, "keypair.json");
const KID = "perf-harness-key";

function loadKeys() {
  if (!fs.existsSync(KEYFILE)) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    fs.writeFileSync(KEYFILE, JSON.stringify({
      private: privateKey.export({ format: "jwk" }),
      public: { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "ES256", use: "sig", key_ops: ["verify"] },
    }));
  }
  return JSON.parse(fs.readFileSync(KEYFILE, "utf8"));
}

const keys = loadKeys();
const signingJwk = process.argv[2] === "forged"
  ? crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" })
  : keys.private;
const exp = Math.floor(Date.now() / 1000) + 86400 * 30;
const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "perf@example.com", app_metadata: {}, user_metadata: {} };
const head = b64u(JSON.stringify({ alg: "ES256", typ: "JWT", kid: KID }));
const body = b64u(JSON.stringify({ sub: user.id, aud: "authenticated", role: "authenticated", email: user.email, user_metadata: {}, exp, iat: exp - 86400 * 31, session_id: "s1" }));
const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: crypto.createPrivateKey({ key: signingJwk, format: "jwk" }), dsaEncoding: "ieee-p1363" }).toString("base64url");
const jwt = `${head}.${body}.${sig}`;
const session = { access_token: jwt, refresh_token: "r", expires_at: exp, expires_in: 86400 * 30, token_type: "bearer", user };
process.stdout.write("sb-127-auth-token=base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"));
