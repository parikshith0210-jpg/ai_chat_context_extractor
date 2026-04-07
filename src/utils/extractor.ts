import { ConversationTurn, CodeBlock, ExtractionOptions, OutputFormat, AIModel } from '../types';

export function parseTurns(raw: string): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  const lines = raw.split('\n');
  let current: ConversationTurn | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try to match various patterns
    const match = trimmed.match(/^(User|Human|Me|You|Assistant|AI|Claude|GPT|Gemini|Bot|System)\s*[:：]\s*/i);
    
    if (match) {
      if (current && current.content.trim()) {
        turns.push(current);
      }
      const role = match[1].toLowerCase();
      const isUser = ['user', 'human', 'me', 'you'].includes(role);
      current = {
        role: isUser ? 'user' : 'assistant',
        content: trimmed.slice(match[0].length).trim()
      };
    } else if (current) {
      current.content += (current.content ? '\n' : '') + trimmed;
    } else if (!current) {
      current = { role: 'user', content: trimmed };
    }
  }

  if (current && current.content.trim()) {
    turns.push(current);
  }

  // Fallback: if only 1 turn or none, split by blank lines into alternating user/assistant
  if (turns.length <= 1) {
    const chunks = raw.trim().split(/\n\n+/);
    return chunks
      .filter(c => c.trim())
      .map((c, i) => ({
        role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: c.trim()
      }));
  }

  return turns.filter(t => t.content.length > 0);
}

export function extractTopics(turns: ConversationTurn[]): string[] {
  const text = turns.map(t => t.content).join(' ');
  
  // Naive keyword extraction: capitalized phrases, tech terms, etc.
  const words = text.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  const freq: Record<string, number> = {};
  
  words.forEach(w => {
    if (w.length > 3) {
      freq[w] = (freq[w] || 0) + 1;
    }
  });
  
  // Also extract quoted/code terms
  const codeTerms = text.match(/`([^`]+)`/g) || [];
  codeTerms.forEach(t => {
    const k = t.replace(/`/g, '');
    if (k.length > 2 && k.length < 30) {
      freq[k] = (freq[k] || 0) + 2;
    }
  });
  
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(e => e[0]);
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
