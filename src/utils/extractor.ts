import { ConversationTurn, CodeBlock, ExtractionOptions, OutputFormat, AIModel } from '../types';

const ROLE_PATTERNS = /^(?:\[\s*)?(User|Human|Me|Assistant|AI|Claude|GPT|Gemini|Bot|System)(?:\s*\])?\s*(?::|：|-)\s*/i;
const TECHNICAL_TERMS = new Set([
  'api', 'json', 'async', 'await', 'react', 'typescript', 'javascript', 'vite', 'node',
  'http', 'https', 'sdk', 'sql', 'orm', 'schema', 'endpoint', 'token', 'auth', 'oauth',
  'webhook', 'prompt', 'llm', 'model', 'embedding', 'vector', 'regex', 'parser', 'debounce',
  'typescript', 'tailwind', 'css', 'ui', 'ux', 'component', 'state', 'hook',
]);
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'your', 'about', 'there',
  'what', 'when', 'where', 'which', 'would', 'could', 'should', 'into', 'while', 'then',
  'than', 'just', 'also', 'very', 'more', 'most', 'some', 'such', 'only', 'been', 'being',
  'were', 'they', 'them', 'their', 'here', 'will', 'shall', 'must', 'does', 'did', 'done',
  'you', 'are', 'our', 'out', 'can', 'not', 'but', 'all', 'any', 'how', 'why', 'its',
  'let', 'lets', 'use', 'using',
]);

function normalizeRole(rawRole: string): ConversationTurn['role'] {
  const role = rawRole.toLowerCase();
  if (['user', 'human', 'me'].includes(role)) return 'user';
  return 'assistant';
}

function tryParseJsonTurns(raw: string): ConversationTurn[] | null {
  const trimmed = raw.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;

  try {
    const data = JSON.parse(trimmed) as unknown;
    const messages = Array.isArray(data)
      ? data
      : (data as Record<string, unknown>).messages ??
        (data as Record<string, unknown>).conversation ??
        (data as Record<string, unknown>).turns;

    if (!Array.isArray(messages)) return null;

    const parsed = messages
      .map((message): ConversationTurn | null => {
        if (!message || typeof message !== 'object') return null;
        const m = message as Record<string, unknown>;
        const roleValue = String(m.role ?? m.author ?? m.speaker ?? m.from ?? 'assistant');
        const contentValue = m.content ?? m.text ?? m.message ?? m.value ?? '';
        const content =
          typeof contentValue === 'string' ? contentValue.trim() : JSON.stringify(contentValue);
        if (!content) return null;
        return {
          role: normalizeRole(roleValue),
          content,
        };
      })
      .filter((turn): turn is ConversationTurn => turn !== null);

    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function parseTurns(raw: string): ConversationTurn[] {
  const jsonTurns = tryParseJsonTurns(raw);
  if (jsonTurns) return jsonTurns;

  const turns: ConversationTurn[] = [];
  const lines = raw.split('\n');
  let current: ConversationTurn | null = null;
  let matchedRoleLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try to match various patterns: "User:", "[User]:", "> User:", "User -"
    const prefixed = trimmed.replace(/^>\s*/, '');
    const match = prefixed.match(ROLE_PATTERNS);
    
    if (match) {
      if (current && current.content.trim()) {
        turns.push(current);
      }
      matchedRoleLines += 1;
      current = {
        role: normalizeRole(match[1]),
        content: prefixed.slice(match[0].length).trim(),
      };
    } else if (current) {
      current.content += (current.content ? '\n' : '') + trimmed;
    } else {
      current = { role: 'assistant', content: trimmed };
    }
  }

  if (current && current.content.trim()) {
    turns.push(current);
  }

  const filteredTurns = turns.filter(t => t.content.length > 0);
  const confidence = lines.length > 0 ? matchedRoleLines / Math.max(lines.filter(Boolean).length, 1) : 0;

  // Fallback only when confidence is low and output isn't clearly structured.
  if (filteredTurns.length <= 1 || confidence < 0.12) {
    const structured = raw.trim();
    if (!structured) return [];
    return [{ role: 'assistant', content: structured }];
  }

  return filteredTurns;
}

export function extractTopics(turns: ConversationTurn[]): string[] {
  const text = turns.map(t => t.content).join(' ');
  const freq: Record<string, number> = {};

  // Frequent normal words.
  const words = text.toLowerCase().match(/\b[a-z][a-z0-9_-]{2,}\b/g) || [];
  words.forEach((word) => {
    if (STOP_WORDS.has(word)) return;
    freq[word] = (freq[word] || 0) + 1;
  });

  // Technical terms receive a boost.
  for (const term of TECHNICAL_TERMS) {
    const termMatches = text.toLowerCase().match(new RegExp(`\\b${term}\\b`, 'g'));
    if (termMatches?.length) {
      freq[term] = (freq[term] || 0) + termMatches.length * 2;
    }
  }

  // Code identifiers from backticks.
  const codeTerms = text.match(/`([^`]+)`/g) || [];
  codeTerms.forEach((segment) => {
    const cleaned = segment.replace(/`/g, '').trim();
    const identifiers = cleaned.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) || [];
    identifiers.forEach((identifier) => {
      const normalized = identifier.toLowerCase();
      if (STOP_WORDS.has(normalized)) return;
      freq[normalized] = (freq[normalized] || 0) + 3;
    });
  });

  return Object.entries(freq)
    .filter(([term]) => term.length >= 3 && term.length <= 40)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term]) => term);
}

export function extractDecisions(turns: ConversationTurn[]): string[] {
  const decisions: string[] = [];
  
  turns.forEach(t => {
    // Match decision-like patterns
    const patterns = [
      /(?:we(?:'ll)? |will |let's |going to |decided to |agreed to |conclusion[:\s])(.{10,80})/gi,
      /(?:the answer is|result is|solution is|therefore|thus|in conclusion)[:\s]+(.{10,100})/gi,
      /(?:^|\n)[-*]\s+(.{15,100})/gm,
    ];
    
    patterns.forEach(pattern => {
      let m;
      const re = new RegExp(pattern.source, pattern.flags);
      while ((m = re.exec(t.content)) !== null) {
        const d = m[1]?.trim();
        if (d && d.length > 10 && d.length < 120 && !decisions.includes(d)) {
          decisions.push(d);
        }
      }
    });
  });
  
  return decisions.slice(0, 8);
}

export function extractCodeBlocks(turns: ConversationTurn[]): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const codeRe = /```(\w*)\n?([\s\S]*?)```/g;
  
  turns.forEach(t => {
    let m;
    while ((m = codeRe.exec(t.content)) !== null) {
      blocks.push({
        lang: m[1] || 'code',
        code: m[2]?.trim() || ''
      });
    }
  });
  
  return blocks;
}

export function summarize(turns: ConversationTurn[]): string {
  if (turns.length === 0) return '';
  
  return turns
    .map(t => {
      const first = t.content.split(/[.!?]\s/)[0] || '';
      const truncated = first.slice(0, 120);
      return `[${t.role === 'user' ? 'User' : 'AI'}] ${truncated}${first.length > 120 ? '…' : ''}`;
    })
    .join('\n');
}

export function extractFromJSON(data: unknown): string {
  // Handle common chat export formats
  if (Array.isArray(data)) {
    return data
      .map(m => {
        const role = (m as Record<string, unknown>).role || (m as Record<string, unknown>).author || 'unknown';
        const content = (m as Record<string, unknown>).content || (m as Record<string, unknown>).text || (m as Record<string, unknown>).message || '';
        return `${String(role).charAt(0).toUpperCase() + String(role).slice(1)}: ${typeof content === 'string' ? content : JSON.stringify(content)}`;
      })
      .join('\n\n');
  }
  
  const obj = data as Record<string, unknown>;
  if (obj.messages) return extractFromJSON(obj.messages);
  if (obj.conversation) return extractFromJSON(obj.conversation);
  return JSON.stringify(data, null, 2);
}

const modelPreambles: Record<AIModel, string> = {
  generic: `You are continuing a conversation that started on another AI platform. The full context is compressed below. Please read it carefully and continue helping where we left off.`,
  gpt: `[SYSTEM] You are resuming a conversation. The compressed context below contains: the topic, key discussion points, and the most recent exchange. Continue naturally as if this conversation is already in progress.`,
  claude: `<context>You are continuing an AI conversation that was transferred from another platform. The compressed context below contains the conversation history, key topics, and recent exchanges. Pick up naturally from where it left off.</context>`,
  gemini: `[Conversation Transfer] The following is a compressed context from a previous AI conversation. It includes the main topics, a summary of the discussion, and the most recent messages verbatim. Please continue this conversation from the point it was left off.`,
  perplexity: `This is a transferred conversation context. Please read the summary and recent messages below, then continue the conversation naturally without re-introducing yourself or asking for context.`,
  mistral: `### Instruction
You are continuing a previous conversation. The context below provides the topic, summary, and recent messages. Continue helpfully.

### Context`,
};

const usageGuides: Record<AIModel, string> = {
  generic: 'Copy the block above → go to your target AI → start a new chat → paste as your first message. The AI will read the context and continue naturally.',
  gpt: 'Copy → open ChatGPT → New chat → paste. Works with GPT-4o, GPT-4, and GPT-3.5.',
  claude: 'Copy → open Claude.ai → Start new conversation → paste. Claude reads the XML-style context block automatically.',
  gemini: 'Copy → open Gemini → new chat → paste. Gemini works best with a clean context header.',
  perplexity: 'Copy → open Perplexity → Ask anything → paste as first message.',
  mistral: 'Copy → open Mistral/Le Chat or any Llama-based model → paste in the system or user message.',
};

export function buildOutput(
  turns: ConversationTurn[],
  opts: ExtractionOptions,
  fmt: OutputFormat,
  model: AIModel,
  recentTurnsCount: number
): string {
  const recentTurns = turns.slice(-recentTurnsCount * 2);
  const olderTurns = turns.slice(0, -recentTurnsCount * 2);
  const topics = opts.entities ? extractTopics(turns) : [];
  const decisions = opts.decisions ? extractDecisions(turns) : [];
  const codeBlocks = opts.code ? extractCodeBlocks(turns) : [];
  const summaryText = opts.summary && olderTurns.length > 0 ? summarize(olderTurns) : '';

  // JSON format
  if (fmt === 'json') {
    const obj = {
      meta: {
        model,
        extracted_at: new Date().toISOString(),
        total_turns: turns.length
      },
      topics,
      decisions,
      summary: summaryText,
      code_blocks: codeBlocks,
      recent_turns: recentTurns.map(t => ({ role: t.role, content: t.content })),
    };
    return JSON.stringify(obj, null, 2);
  }

  const sections: string[] = [];

  // Preamble
  if (fmt === 'prompt' || fmt === 'plain') {
    sections.push(modelPreambles[model] || modelPreambles.generic);
    sections.push('---');
  }

  // Topics
  if (opts.entities && topics.length > 0) {
    if (fmt === 'markdown') {
      sections.push(`## Key Topics\n${topics.map(t => `- ${t}`).join('\n')}`);
    } else {
      sections.push(`KEY TOPICS: ${topics.join(', ')}`);
    }
  }

  // Summary of older conversation
  if (opts.summary && olderTurns.length > 0) {
    if (fmt === 'markdown') {
      sections.push(`## Conversation Summary\n${summaryText}`);
    } else {
      sections.push(`CONVERSATION SUMMARY:\n${summaryText}`);
    }
  }

  // Decisions
  if (opts.decisions && decisions.length > 0) {
    if (fmt === 'markdown') {
      sections.push(`## Key Decisions & Outcomes\n${decisions.map(d => `- ${d}`).join('\n')}`);
    } else {
      sections.push(`DECISIONS & OUTCOMES:\n${decisions.map(d => `• ${d}`).join('\n')}`);
    }
  }

  // Code blocks
  if (opts.code && codeBlocks.length > 0) {
    if (fmt === 'markdown') {
      sections.push(`## Code Snippets\n${codeBlocks.map(b => '```' + b.lang + '\n' + b.code + '\n```').join('\n\n')}`);
    } else {
      sections.push(`CODE SNIPPETS:\n${codeBlocks.map(b => `[${b.lang}]\n${b.code}`).join('\n---\n')}`);
    }
  }

  // Context block (brief background from first few turns)
  if (opts.context && turns.length > 0) {
    const bgTurns = turns.slice(0, Math.min(2, turns.length));
    const bg = bgTurns
      .map(t => `[${t.role}] ${t.content.slice(0, 200)}${t.content.length > 200 ? '…' : ''}`)
      .join('\n');
    if (fmt === 'markdown') {
      sections.push(`## Original Context\n${bg}`);
    } else {
      sections.push(`ORIGINAL CONTEXT:\n${bg}`);
    }
  }

  // Recent turns verbatim
  if (opts.turns && recentTurns.length > 0) {
    if (fmt === 'markdown') {
      sections.push(`## Recent Conversation\n${recentTurns.map(t => `**${t.role === 'user' ? 'User' : 'Assistant'}:** ${t.content}`).join('\n\n')}`);
    } else {
      const label = `RECENT CONVERSATION (last ${recentTurns.length} messages — verbatim):`;
      sections.push(label + '\n' + recentTurns.map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`).join('\n\n'));
    }
  }

  if (fmt === 'prompt' || fmt === 'plain') {
    sections.push('---\nContinue from here:');
  }
  if (fmt === 'markdown') {
    sections.push('\n---\n*Continue the conversation from this point.*');
  }

  return sections.join(fmt === 'markdown' ? '\n\n' : '\n\n');
}

export function getUsageGuide(model: AIModel): string {
  return usageGuides[model] || usageGuides.generic;
}
