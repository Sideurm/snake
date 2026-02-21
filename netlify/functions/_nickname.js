function normalizeNickname(raw) {
  return String(raw || "").trim().toLowerCase();
}

function validateNickname(raw) {
  const nickname = String(raw || "").trim();
  if (nickname.length < 3 || nickname.length > 20) {
    return { ok: false, reason: "nickname_length_3_20" };
  }
  if (!/^[\p{L}\p{N}_]+$/u.test(nickname)) {
    return { ok: false, reason: "nickname_invalid_chars" };
  }
  return { ok: true };
}

module.exports = {
  normalizeNickname,
  validateNickname
};
