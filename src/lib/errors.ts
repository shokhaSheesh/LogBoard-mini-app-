// ─── Error wording ────────────────────────────────────────────────────────────
//
// The API writes its error messages for the person using the app (backend ADR 0028): a
// response's `message` is a plain sentence, and it is shown as it arrives. The client
// branches on `code` and never on the text of a message, so nothing here rewrites what
// the server said.
//
// What is left for the client is only what the server cannot word:
//
//   • the request never arrived (offline, DNS, a dropped connection)
//   • the response carried no message at all (a gateway's bare 502, an HTML error page)
//   • a message that is plainly not a sentence — a safety net, so a stack trace or a
//     driver error can never reach a dispatcher even if one slips past the API's own rule
//
// It has no imports, so the API client uses it too: an ApiError's `message` is already
// safe to show, and its `raw` keeps exactly what the server sent.

const GENERIC = "Something went wrong. Please try again.";
const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

// Text written for a programmer, not a person. Deliberately narrow: it is a net under the
// API's own rule, not a second place to word errors.
const NOT_A_SENTENCE = new RegExp([
  "^HTTP \\d{3}$", "^Unauthorized$", "<html|<!doctype",
  "\\bjson:", "unmarshal", "\\bSQLSTATE\\b", "\\bpgx?\\b", "\\bpq:", "^ERROR:",
  "context (canceled|deadline)", "\\bpanic\\b", "\\bnil pointer\\b", "Error:Field validation",
  "Unexpected token", "is not valid JSON",
].join("|"), "i");

// The line for a failure the server did not explain.
function byStatus(status: number | undefined, fallback: string): string {
  switch (status) {
    case 400: case 422: return "Some of the details aren't valid. Check them and try again.";
    case 401: return "Your session has ended. Sign in again.";
    case 403: return "You don't have permission to do that.";
    case 404: return "That item no longer exists. Refresh and try again.";
    case 409: return "That conflicts with something already saved. Refresh and try again.";
    case 413: return "That file is too large.";
    case 429: return "Too many requests. Wait a moment and try again.";
    default:
      if (status !== undefined && status >= 500) return "Something went wrong on our side. Please try again.";
      return fallback;
  }
}

/** The server's message when it is one, otherwise the plain line for that kind of failure. */
export function humanize(message: string, status?: number, fallback = GENERIC): string {
  const text = (message ?? "").trim();
  if (!text || NOT_A_SENTENCE.test(text)) return byStatus(status, fallback);
  return text;
}

/** Whatever a request threw, as a sentence that is safe to show. */
export function friendlyError(e: unknown, fallback = GENERIC): string {
  // fetch() rejects with a TypeError when the request never reached the server.
  if (e instanceof TypeError) return OFFLINE;
  const text = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(text)) return OFFLINE;
  const meta = e as { status?: number; raw?: string };
  // Word it from what the server sent, so the caller's own fallback ("Couldn't save the
  // driver.") is the one used when the server sent nothing.
  return humanize(meta?.raw ?? text, meta?.status, fallback);
}
