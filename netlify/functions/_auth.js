const crypto = require("crypto");

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

function getSecret() {
  const secret = process.env.AUTH_JWT_SECRET || process.env.NETLIFY_AUTH_JWT_SECRET;
  if (!secret) throw new Error("AUTH_JWT_SECRET is not set (or NETLIFY_AUTH_JWT_SECRET)");
  return secret;
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, packedHash) {
  if (!packedHash || typeof packedHash !== "string" || !packedHash.includes(":")) {
    return false;
  }
  const [salt, oldHash] = packedHash.split(":");
  if (!salt || !oldHash) return false;
  const newHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(oldHash, "hex");
  const b = Buffer.from(newHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function signToken(payload) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(body));
  } catch (_) {
    return null;
  }
  if (!payload || !payload.uid || !payload.exp) return null;
  if (Date.now() >= Number(payload.exp) * 1000) return null;
  return payload;
}

function issueUserToken(user) {
  const now = Math.floor(Date.now() / 1000);
  return signToken({
    uid: user.id,
    email: user.email,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  });
}

function extractBearerToken(headers = {}) {
  const auth = headers.authorization || headers.Authorization;
  if (!auth || typeof auth !== "string") return null;
  const [kind, token] = auth.split(" ");
  if ((kind || "").toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

module.exports = {
  hashPassword,
  verifyPassword,
  issueUserToken,
  verifyToken,
  extractBearerToken
};
