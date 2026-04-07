export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CodeBlock {
  lang: string;
  code: string;
}

export interface ExtractedContent {
  turns: ConversationTurn[];
  topics: string[];
  decisions: string[];
  codeBlocks: CodeBlock[];
  summary: string;
}

export interface ExtractionOptions {
  summary: boolean;
  entities: boolean;
  context: boolean;
  turns: boolean;
  code: boolean;
  decisions: boolean;
}

export type OutputFormat = 'prompt' | 'markdown' | 'json' | 'plain';
export type AIModel = 'generic' | 'gpt' | 'claude' | 'gemini' | 'perplexity' | 'mistral';

export interface Stats {
  originalChars: number;
  compressedChars: number;
  compressionRatio: string;
  turns: number;
  topics: number;
}
