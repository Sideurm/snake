function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}

function methodNotAllowed() {
  return json(405, { error: "method_not_allowed" });
}

function badRequest(message = "bad_request") {
  return json(400, { error: message });
}

function unauthorized(message = "unauthorized") {
  return json(401, { error: message });
}

function internalError(error) {
  console.error(error);
  const detail = error && error.message ? String(error.message) : "unknown_error";
  return json(500, { error: "internal_error", detail });
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (_) {
    return null;
  }
}

module.exports = {
  json,
  methodNotAllowed,
  badRequest,
  unauthorized,
  internalError,
  parseBody
};
