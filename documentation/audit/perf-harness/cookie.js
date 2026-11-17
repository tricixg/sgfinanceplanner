const b64u = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now()/1000) + 86400*30;
const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "perf@example.com", app_metadata: {}, user_metadata: {} };
const jwt = b64u(JSON.stringify({alg:"HS256",typ:"JWT"})) + "." + b64u(JSON.stringify({sub:user.id, aud:"authenticated", role:"authenticated", email:user.email, exp, iat: exp-86400*31, session_id:"s1"})) + ".sig";
const session = { access_token: jwt, refresh_token: "r", expires_at: exp, expires_in: 86400*30, token_type: "bearer", user };
process.stdout.write("sb-127-auth-token=base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"));
