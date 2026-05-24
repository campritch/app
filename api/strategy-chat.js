// Agent endpoint: Claude tool-loop over Fathom / Notion / HubSpot / BI / burn CSV.
// Streams SSE back to the browser. Password-gated.

import Anthropic from '@anthropic-ai/sdk';
import { tools, executeTool } from './_tools/index.js';
import { listManifest as listKbManifest } from './_tools/kb.js';
import { listCachedDetailed as listFathomManifest } from './_tools/fathom.js';
import { listCachedDetailed } from './_tools/fathom.js';

const MODEL = 'claude-opus-4-7';
const MAX_ITERATIONS = 12;
const MAX_TOKENS = 8096;

const SYSTEM_PROMPT = `You are a strategic advisor to Cam Pritchard, Co-Founder & CEO of SpotsNow (host-read podcast advertising marketplace, ~5 person team, raising seed round).

Your job: help Cam make the best strategic bets by pulling real data from his systems (Fathom calls, Notion docs, HubSpot CRM, internal BI, burn sheet) and reflecting on his stated strategy with intellectual honesty.

CORE PRINCIPLES:
- Ground every claim in data you've actually pulled. No hand-waving.
- When data seems stale, inconsistent, or missing — call it out. Don't paper over it.
- Push back on weak reasoning. If Cam's strategy has a gap, name it plainly.
- Prioritize signal over summary. One sharp insight beats five generic ones.
- American spelling, no em-dashes, no "circling back" fluff.

HOW TO WORK:
1. Read Cam's current strategy and the question first.
2. Plan which data sources you need — then pull them via tools. Batch tool calls when independent.
3. When pulling Fathom calls, exclude standups (titles matching: standup, daily, sync, 1:1, 1on1) — Cam wants substantive calls only.
4. When reviewing HubSpot deals, flag entries that look stale (last modified >30 days, no close date set, stuck in stage).
5. After gathering data, answer directly with evidence. Cite meetings/docs/deals by name.
6. If asked to write a Notion doc, call the notion_create_page tool with the parent_page_id Cam provides.

TRANSCRIPT SELECTION DISCIPLINE:
The saved transcript manifest is already in your context — you know every available transcript by title, date, and attendees without tool calls. Picking which to read is your job.

- Read time and cost-conscious: each transcript you pull costs tokens and latency. Only pull the ones that materially help.
- Parse date intent first. "last month" / "this week" / "the MJ call" / "Rella discussions" → filter the manifest to those ids BEFORE reading.
- If no date is implied and the topic is narrow (one person, one company, one deal), pick only the 2–5 most relevant by title + attendees.
- If Cam asks for "all transcripts" or a broad synthesis, briefly warn him first: "Reading all N transcripts will take ~X tokens — proceed?" unless the question clearly warrants it.
- Say upfront which transcripts you're reading and why. One line before the tool calls: "Reading 4 calls from the last 2 weeks tagged with Rella + Oxford Road."
- If the manifest has no transcripts matching the ask, say so instead of pulling irrelevant ones.

TONE: Direct. Founder-energy. Short paragraphs. Bullets when it adds clarity. Challenge when warranted.`;

function sseWrite(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const { password, messages, strategy, notionLinks, supp, dateRange, priorSummaries, scopedTranscriptIds } = req.body || {};

  // Password gate
  const expected = process.env.STRATEGY_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'STRATEGY_PASSWORD not configured' });
  if (password !== expected) return res.status(401).json({ error: 'bad password' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const client = new Anthropic({ apiKey });

  // Load the saved transcript manifest so the agent always knows what's
  // available without needing to tool-call list_cached. Failure is non-fatal.
  let savedTranscripts = [];
  let kbItems = [];
  try {
    const [cache, kb] = await Promise.all([
      listCachedDetailed().catch(() => ({ items: [] })),
      listKbManifest().catch(() => []),
    ]);
    savedTranscripts = (cache.items || []).map((it) => ({
      id: it.id,
      title: it.title || null,
      date: it.date || null,
      attendees: it.attendees || [],
    }));
    // Narrow to the chat's selected subset if Cam has scoped this conversation.
    // null/undefined = use everything; explicit array = only those ids (even if empty).
    if (Array.isArray(scopedTranscriptIds)) {
      const keep = new Set(scopedTranscriptIds.map(String));
      savedTranscripts = savedTranscripts.filter((t) => keep.has(String(t.id)));
    }
    kbItems = kb || [];
  } catch (e) {
    console.warn('loading saved manifests for context failed', e);
  }

  // Build the context block from user inputs. Cached at block level so follow-ups are cheap.
  const contextBlock = buildContextBlock({ strategy, notionLinks, supp, dateRange, priorSummaries, savedTranscripts, kbItems, scoped: Array.isArray(scopedTranscriptIds) });

  // Convert any client-side attachments on user messages into Claude content
  // blocks. Images become vision blocks; other files come through as inline
  // text or descriptors so the agent at least knows they exist.
  const expandedMessages = (messages || []).map((m) => expandAttachments(m));

  const workingMessages = [
    ...(contextBlock ? [{ role: 'user', content: [{ type: 'text', text: contextBlock, cache_control: { type: 'ephemeral' } }] }] : []),
    ...expandedMessages,
  ];

  try {
    let iteration = 0;
    while (iteration < MAX_ITERATIONS) {
      iteration += 1;
      sseWrite(res, 'iteration', { n: iteration });

      let stream;
      try {
        stream = client.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          tools,
          messages: workingMessages,
        });
      } catch (err) {
        if (isAnthropicRateLimit(err) && process.env.GEMINI_API_KEY) {
          await streamGeminiFallback({ res, contextBlock, messages: expandedMessages, reason: err?.message || 'Anthropic rate limit' });
          return;
        }
        throw err;
      }

      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            sseWrite(res, 'text', { delta: event.delta.text });
          } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            sseWrite(res, 'tool_start', { name: event.content_block.name, id: event.content_block.id });
          }
        }
      } catch (err) {
        if (isAnthropicRateLimit(err) && process.env.GEMINI_API_KEY && iteration === 1) {
          // Only fall back on iteration 1 — once we've started using tools, mid-stream
          // recovery to Gemini would lose conversation state. The frontend can retry
          // after a cooldown if it happens later.
          await streamGeminiFallback({ res, contextBlock, messages: expandedMessages, reason: err?.message || 'Anthropic rate limit' });
          return;
        }
        throw err;
      }

      const final = await stream.finalMessage();
      workingMessages.push({ role: 'assistant', content: final.content });

      if (final.stop_reason !== 'tool_use') {
        sseWrite(res, 'done', { usage: final.usage });
        res.end();
        return;
      }

      const toolUses = final.content.filter((b) => b.type === 'tool_use');
      const results = await Promise.all(
        toolUses.map(async (tu) => {
          sseWrite(res, 'tool_call', { id: tu.id, name: tu.name, input: tu.input });
          try {
            const out = await executeTool(tu.name, tu.input);
            const serialized = typeof out === 'string' ? out : JSON.stringify(out);
            // 4k was way too aggressive for transcripts (avg 30-min call ≈ 30kb)
            // and other rich tools. 200k keeps full transcripts intact while
            // still guarding against catastrophic blobs.
            const preview = serialized.length > 200_000 ? serialized.slice(0, 200_000) + `\n...[truncated from ${serialized.length} chars]` : serialized;
            sseWrite(res, 'tool_result', { id: tu.id, name: tu.name, ok: true, bytes: serialized.length });
            return { type: 'tool_result', tool_use_id: tu.id, content: preview };
          } catch (err) {
            const msg = String(err?.message || err);
            sseWrite(res, 'tool_result', { id: tu.id, name: tu.name, ok: false, error: msg });
            return { type: 'tool_result', tool_use_id: tu.id, content: `Error: ${msg}`, is_error: true };
          }
        })
      );

      workingMessages.push({ role: 'user', content: results });
    }

    sseWrite(res, 'error', { message: `Hit max iterations (${MAX_ITERATIONS})` });
    res.end();
  } catch (err) {
    if (isAnthropicRateLimit(err) && process.env.GEMINI_API_KEY) {
      try {
        await streamGeminiFallback({ res, contextBlock, messages: expandedMessages, reason: err?.message || 'Anthropic rate limit' });
        return;
      } catch (fallbackErr) {
        sseWrite(res, 'error', { message: `Both providers failed. Anthropic: ${err?.message}. Gemini: ${fallbackErr?.message}` });
        res.end();
        return;
      }
    }
    sseWrite(res, 'error', { message: String(err?.message || err) });
    res.end();
  }
}

// Detect any Anthropic capacity / quota error worth falling back on.
// Covers per-minute rate limits (429), overloads (529), AND monthly usage
// caps which return 400 with an invalid_request_error like:
//   "You have reached your specified API usage limits. You will regain
//    access on 2026-06-01 at 00:00 UTC."
function isAnthropicRateLimit(err) {
  if (!err) return false;
  const status = err.status || err.statusCode || err?.response?.status;
  if (status === 429 || status === 529) return true;
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('rate limit') || msg.includes('overloaded') || msg.includes('too many requests')) return true;
  // Monthly / total usage caps come back as 400 invalid_request_error.
  // Don't catch all 400s — only the usage-related ones.
  if (msg.includes('usage limit') || msg.includes('usage limits') || msg.includes('reached your specified api') || msg.includes('credit balance')) return true;
  return false;
}

// Stream a single Gemini response back as SSE 'text' deltas, then 'done'.
// No tool use — Gemini gets the full context block (saved transcripts, KB,
// prior conversations, strategy) and answers from that. Pragmatic fallback;
// not feature-equal to Claude but keeps Cam unblocked when Anthropic is throttled.
// Cascade through Gemini models — Pro first (highest quality), then Flash,
// then Flash-Lite. Quota errors on one model drop to the next, so the user
// always gets *an* answer. Override with GEMINI_MODEL_CHAIN (comma-sep) or
// pin to a single one with GEMINI_MODEL.
const GEMINI_MODEL_CHAIN = (process.env.GEMINI_MODEL_CHAIN || process.env.GEMINI_MODEL || 'gemini-2.5-pro,gemini-2.5-flash,gemini-2.5-flash-lite')
  .split(',').map((s) => s.trim()).filter(Boolean);

function isGeminiQuotaError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('429')
    || msg.includes('quota')
    || msg.includes('rate limit')
    || msg.includes('exceeded')
    || msg.includes('returned no text'); // model thought-itself-out — try the next
}

async function streamGeminiFallback({ res, contextBlock, messages, reason }) {
  // Translate Anthropic message shape → Gemini contents shape (once).
  const contents = [];
  if (contextBlock) contents.push({ role: 'user', parts: [{ text: contextBlock }] });
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const parts = [];
    const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
    for (const b of blocks) {
      if (b.type === 'text') {
        parts.push({ text: b.text });
      } else if (b.type === 'image' && b.source?.type === 'base64') {
        parts.push({ inlineData: { mimeType: b.source.media_type, data: b.source.data } });
      }
    }
    if (parts.length) contents.push({ role, parts });
  }

  const errs = [];
  for (let i = 0; i < GEMINI_MODEL_CHAIN.length; i += 1) {
    const model = GEMINI_MODEL_CHAIN[i];
    // Tell the UI which model we're trying. If we cascade, the user sees a
    // new notice for each attempt so it's obvious what happened.
    sseWrite(res, 'fallback', {
      provider: 'gemini',
      model,
      reason: i === 0 ? reason : `${GEMINI_MODEL_CHAIN[i - 1]} quota-capped → ${model}`,
    });
    try {
      await streamGeminiAttempt({ res, model, contents });
      return; // success
    } catch (err) {
      errs.push(`${model}: ${String(err?.message || err).slice(0, 140)}`);
      if (!isGeminiQuotaError(err)) throw err; // anything else: bail
      // quota-capped — try the next model in the chain
    }
  }
  throw new Error(`All Gemini models quota-exhausted. ${errs.join(' · ')}`);
}

async function streamGeminiAttempt({ res, model, contents }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  // Gemini 2.5 Pro/Flash are reasoning models — they can spend the entire
  // maxOutputTokens budget on internal thinking and emit no visible text.
  // For a fallback path we want predictable immediate answers, so disable
  // thinking on Pro (thinkingBudget: 0). Flash defaults to no thinking
  // unless asked. Also bumping maxOutputTokens to 32k so longer answers
  // aren't truncated.
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        maxOutputTokens: 32000,
        temperature: 0.7,
        // thinkingBudget: 0 disables Pro's reasoning entirely; -1 is dynamic.
        // For non-Pro models this field is ignored.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Gemini ${resp.status}: ${body.slice(0, 300)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let totalText = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const chunks = buf.split('\n\n');
    buf = chunks.pop();
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const data = JSON.parse(payload);
        const parts = data?.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          if (p.text) {
            sseWrite(res, 'text', { delta: p.text });
            totalText += p.text.length;
          }
        }
      } catch (e) {
        console.warn('gemini chunk parse failed', e);
      }
    }
  }
  if (totalText === 0) throw new Error(`Gemini ${model} returned no text`);
  sseWrite(res, 'done', { usage: { output_tokens: Math.round(totalText / 4) }, provider: `gemini · ${model}` });
  res.end();
}

// Map a client-side message with attachments into a Claude content-block array.
// - Images → image block (base64 source) so the agent can actually see screenshots
// - Text-y files (text/csv/json) → inline text block with the body
// - Other binary → text descriptor so the agent at least knows it's there
function expandAttachments(msg) {
  if (!msg || msg.role !== 'user' || !Array.isArray(msg.attachments) || !msg.attachments.length) {
    return msg;
  }
  const blocks = [];
  for (const a of msg.attachments) {
    if (!a || !a.body_b64) continue;
    if (a.type === 'image' && a.mime?.startsWith('image/')) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: a.mime, data: a.body_b64 },
      });
      blocks.push({ type: 'text', text: `[Attached image: ${a.name}]` });
      continue;
    }
    if (['text', 'csv', 'json'].includes(a.type)) {
      const body = Buffer.from(a.body_b64, 'base64').toString('utf-8');
      blocks.push({ type: 'text', text: `[Attached ${a.type} file: ${a.name}]\n\n${body.slice(0, 100_000)}${body.length > 100_000 ? '\n\n[truncated]' : ''}` });
      continue;
    }
    // Binary fallback (pdf, other) — describe so the agent knows; agent can ask Cam to save it to KB if needed
    const kb = Math.round((a.body_b64.length * 0.75) / 1024);
    blocks.push({ type: 'text', text: `[Attached ${a.type} file: ${a.name} · ${a.mime} · ${kb}kb · only available this turn unless saved to knowledge bank]` });
  }
  if (msg.content && msg.content.trim()) blocks.push({ type: 'text', text: msg.content });
  return { role: 'user', content: blocks };
}

function buildContextBlock({ strategy, notionLinks, supp, dateRange, priorSummaries, savedTranscripts, kbItems, scoped }) {
  const parts = [];
  if (Array.isArray(savedTranscripts) && savedTranscripts.length) {
    const lines = savedTranscripts.map((t) => {
      const when = t.date ? new Date(t.date).toISOString().slice(0, 10) : '—';
      const who = (t.attendees || []).slice(0, 3).join(', ');
      return `- ${when} · ${t.title || '(no title)'} · id=${t.id}${who ? ` · with ${who}` : ''}`;
    });
    const header = scoped
      ? `## Saved transcripts (${savedTranscripts.length}) — Cam explicitly scoped this chat to ONLY these`
      : `## Saved transcripts (${savedTranscripts.length})`;
    const note = scoped
      ? `These are the ONLY transcripts Cam wants in scope for this conversation. Do not reference or pull others even if you remember them from earlier chats.`
      : `These transcripts are already cached and available. Call fathom_get_transcript with the id to read any of them. Assume Cam wants you to consider ALL of these unless he names specific ones.`;
    parts.push(`${header}\n\n${note}\n\n${lines.join('\n')}`);
  } else if (scoped) {
    parts.push(`## Saved transcripts\n\nCam has scoped this conversation to NO transcripts. Answer from chat history and other sources only — do not pull any transcripts.`);
  }
  if (Array.isArray(kbItems) && kbItems.length) {
    const lines = kbItems.map((it) => {
      const when = it.uploaded_at ? new Date(it.uploaded_at).toISOString().slice(0, 10) : '—';
      const kb = it.bytes ? `${Math.round(it.bytes / 1024)}kb` : '';
      const note = it.notes ? ` · ${it.notes}` : '';
      const prev = it.preview ? `\n   preview: ${it.preview.slice(0, 240).replace(/\n/g, ' ')}…` : '';
      return `- ${when} · ${it.name} · type=${it.type} · ${kb} · id=${it.id}${note}${prev}`;
    });
    parts.push(`## Knowledge bank (${kbItems.length} files Cam has uploaded)\n\nFiles Cam has saved as persistent context: documents, exports, screenshots, anything. Pull a body via kb_get_item({id}) only when needed. Text/CSV/JSON items have a short preview inline; images and PDFs require kb_get_item to actually inspect.\n\n${lines.join('\n')}`);
  }
  if (strategy && strategy.trim()) {
    parts.push(`## Current business strategy (Cam's words)\n\n${strategy.trim()}`);
  }
  if (notionLinks && notionLinks.trim()) {
    parts.push(`## Relevant Notion links (fetch via notion_fetch_page as needed)\n\n${notionLinks.trim()}`);
  }
  if (supp && supp.trim()) {
    parts.push(`## Supplementary data pasted by Cam (QuickBooks, Mercury, one-off exports)\n\n${supp.trim()}`);
  }
  if (dateRange?.from || dateRange?.to) {
    parts.push(`## Default Fathom date range\n\nfrom: ${dateRange.from || '(none)'}\nto: ${dateRange.to || '(none)'}`);
  }
  if (Array.isArray(priorSummaries) && priorSummaries.length) {
    const lines = priorSummaries.map((p) => {
      const when = p.when ? new Date(p.when).toISOString().slice(0, 10) : '';
      return `### ${p.title}${when ? ` (${when})` : ''}\nCam asked: ${p.firstQuestion}\nYou answered (excerpt): ${p.lastAnswer}`;
    });
    parts.push(`## Recent prior conversations with Cam (for continuity)\n\nThese are summaries of recent separate chats. Use them so you don't ask Cam to repeat context he's already shared.\n\n${lines.join('\n\n')}`);
  }
  if (!parts.length) return '';
  return parts.join('\n\n');
}

export const config = { maxDuration: 300 };
