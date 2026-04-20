// Web fetch: lets the agent pull any public URL (pitch deck, landing page, competitor site, etc.).
// Server-side fetch → strip HTML to plain text → cap length so it fits in context.

export async function fetchUrl({ url, max_chars = 40000 }) {
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('url must start with http(s)://');

  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SpotsNowStrategyBot/1.0)',
      Accept: 'text/html,application/json,text/plain,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  const contentType = res.headers.get('content-type') || '';

  let body = await res.text();
  if (contentType.includes('application/json')) {
    // JSON: return as-is (truncated)
    return { url, content_type: contentType, content: body.slice(0, max_chars), truncated: body.length > max_chars };
  }

  // HTML: strip scripts, styles, then tags, collapse whitespace
  let text = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]*\n+/g, '\n\n')
    .trim();

  const truncated = text.length > max_chars;
  if (truncated) text = text.slice(0, max_chars) + `\n...[truncated from ${text.length} chars]`;
  return { url, content_type: contentType, content: text, truncated };
}
