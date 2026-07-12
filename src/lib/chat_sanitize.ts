// Client-safe guards against machine artifacts rendering as chat text.
// Server uses looksLikeJsonArtifact before persisting an assistant reply;
// ChatView uses it at render time so blobs already persisted by past incidents
// (provider error bodies, echoed tool results) display as a human sentence.
// Kept dependency-free so both sides can import it (same pattern as tool_display).

export const ARTIFACT_FALLBACK = 'That reply came out garbled — ask again.';

export function looksLikeJsonArtifact(text: string): boolean {
	const t = text.trim();
	if (!t) return false;
	// A reply that opens as a JSON object/array with a quoted key is a machine
	// payload, not a sentence ("{" alone could open a legit aside — require the key).
	// The `[{` arm catches echoed tool-result arrays like [{"id":1,"name":…}].
	if (/^\[?\s*[{[]\s*"[\w-]+"\s*:/.test(t)) return true;
	// Raw provider failure echoed verbatim (pre-fix error shape).
	if (/^OpenRouter \d+:/i.test(t)) return true;
	return false;
}
