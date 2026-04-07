import React, { useState, useRef, useCallback } from 'react';
import { useTheme } from './hooks/useTheme';
import { useToast } from './hooks/useToast';
import { ExtractionOptions, OutputFormat, AIModel, Stats } from './types';
import { parseTurns, extractTopics, buildOutput, extractFromJSON, getUsageGuide } from './utils/extractor';
import { cn } from './utils/cn';
import {
  LogoIcon,
  SunIcon,
  MoonIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  PlayIcon,
  UploadIcon,
} from './components/Icons';
import { Toast } from './components/Toast';

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className = '',
}) => (
  <div
    className={cn('rounded-xl p-6 mb-6 card-surface', className)}
    style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-md)',
    }}
  >
    <div
      className="text-sm font-bold uppercase tracking-wider mb-4"
      style={{ color: 'var(--color-text-muted)' }}
    >
      {title}
    </div>
    {children}
  </div>
);

const BtnPrimary: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ children, onClick, disabled, className = '' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'inline-flex items-center gap-2 px-5 py-3 rounded-md font-semibold btn-primary disabled:opacity-40 disabled:cursor-not-allowed',
      className
    )}
    style={{
      background: 'var(--color-primary)',
      color: '#fff',
    }}
  >
    {children}
  </button>
);

const BtnGhost: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}> = ({ children, onClick, disabled, size = 'md' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(`inline-flex items-center gap-2 rounded-md font-semibold btn-ghost disabled:opacity-40 disabled:cursor-not-allowed ${
      size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
    }`)}
    style={{
      color: 'var(--color-text-muted)',
      border: '1px solid var(--color-border)',
    }}
  >
    {children}
  </button>
);

export default function App() {
  const MAX_INPUT_CHARS = 300_000;
  const { theme, toggleTheme } = useTheme();
  const { toasts, showToast } = useToast();

  // Input state
  const [activeTab, setActiveTab] = useState<'paste' | 'url' | 'file'>('paste');
  const [chatInput, setChatInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isFetching, setIsFetching] = useState(false);

  // Options state
  const [options, setOptions] = useState<ExtractionOptions>({
    summary: true,
    entities: true,
    context: true,
    turns: true,
    code: false,
    decisions: true,
  });
  const [recentTurnsCount, setRecentTurnsCount] = useState(3);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('prompt');
  const [selectedModel, setSelectedModel] = useState<AIModel>('generic');

  // Output state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [output, setOutput] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  // Word/char count
  const charCount = chatInput.length;
  const wordCount = (chatInput.match(/\S+/g) || []).length;

  // Handle file upload
  const handleFile = useCallback(
    (file: File) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        let text = e.target?.result as string;
        if (file.name.endsWith('.json')) {
          try {
            const data = JSON.parse(text);
            text = extractFromJSON(data);
          } catch {
            // Keep original text
          }
        } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
          const tmp = document.createElement('div');
          tmp.innerHTML = text;
          text = tmp.innerText;
        }
        setChatInput(text);
        setActiveTab('paste');
        showToast('File loaded!', 'success');
      };
      reader.readAsText(file);
    },
    [showToast]
  );

  // Handle URL fetch
  const handleUrlFetch = useCallback(async () => {
    if (!urlInput.trim()) {
      showToast('Enter a URL first', 'error');
      return;
    }

    setIsFetching(true);
    showToast('Fetching page…', 'success');

    try {
      const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(urlInput)}`;
      const res = await fetch(proxy);
      const data = await res.json();
      const tmp = document.createElement('div');
      tmp.innerHTML = data.contents;
      const text = tmp.innerText;
      setChatInput(text);
      setActiveTab('paste');
      showToast('Page fetched! Review and process.', 'success');
    } catch {
      showToast('Could not fetch. Use paste instead.', 'error');
    } finally {
      setIsFetching(false);
    }
  }, [urlInput, showToast]);

  // Process conversation
  const handleProcess = useCallback(async () => {
    const raw = chatInput.trim();
    if (!raw) {
      showToast('Paste a conversation first', 'error');
      return;
    }
    if (raw.length > MAX_INPUT_CHARS) {
      showToast(`Input too large (${raw.length.toLocaleString()} chars). Please trim to under ${MAX_INPUT_CHARS.toLocaleString()} chars.`, 'error');
      return;
    }

    setIsProcessing(true);
    setShowOutput(false);
    setProgress(0);
    setProgressLabel('Starting…');

    try {
      const steps: [number, string][] = [
        [20, 'Parsing conversation turns…'],
        [45, 'Extracting topics and decisions…'],
        [70, 'Summarizing earlier context…'],
        [90, 'Compressing for target model…'],
      ];

      for (const [p, label] of steps) {
        setProgress(p);
        setProgressLabel(label);
        await new Promise((r) => setTimeout(r, 240));
      }

      await new Promise((r) => setTimeout(r, 0));
      const turns = parseTurns(raw);
      const outputText = buildOutput(turns, options, outputFormat, selectedModel, recentTurnsCount);
      const topics = extractTopics(turns);

      const ratio = ((1 - outputText.length / raw.length) * 100).toFixed(0);

      setOutput(outputText);
      setStats({
        originalChars: raw.length,
        compressedChars: outputText.length,
        compressionRatio: ratio > '0' ? `${ratio}% smaller` : `${Math.abs(parseFloat(ratio))}% larger`,
        turns: turns.length,
        topics: topics.length,
      });
      setProgress(100);
      setProgressLabel('Done!');
      setShowOutput(true);

      setTimeout(() => {
        document.getElementById('output-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (error) {
      console.error('Extraction failed:', error);
      showToast('Extraction failed. Please check the input format and try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [chatInput, options, outputFormat, selectedModel, recentTurnsCount, showToast]);

  // Copy output
  const handleCopy = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      showToast('Copied to clipboard!', 'success');
    } catch {
      showToast('Copy failed — select and copy manually', 'error');
    }
  }, [output, showToast]);

  // Download output
  const handleDownload = useCallback(() => {
    if (!output) return;
    const ext: Record<OutputFormat, string> = {
      prompt: 'txt',
      markdown: 'md',
      json: 'json',
      plain: 'txt',
    };
    const blob = new Blob([output], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chat-context.${ext[outputFormat]}`;
    a.click();
    showToast('Downloaded!', 'success');
  }, [output, outputFormat, showToast]);

  // Toggle option
  const toggleOption = (key: keyof ExtractionOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen grid grid-rows-[auto_1fr]" style={{ background: 'var(--color-bg)' }}>
      {/* Topbar */}
      <header
        className="flex items-center justify-between px-6 py-3.5 border-b sticky top-0 z-50"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2.5 text-sm font-bold tracking-tight">
          <LogoIcon style={{ color: 'var(--color-primary)' }} />
          ChatContext Extractor
        </div>
        <button
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-md transition-all"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <main className="max-w-[900px] mx-auto px-6 py-8 w-full">
        {/* Hero */}
        <div className="text-center py-10 pb-6">
          <div
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full mb-4"
            style={{
              background: 'color-mix(in oklab, var(--color-primary) 12%, var(--color-surface))',
              color: 'var(--color-primary)',
              border: '1px solid color-mix(in oklab, var(--color-primary) 20%, var(--color-border))',
            }}
          >
            <CheckIcon />
            Zero setup · Works offline
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight leading-tight mb-2">
            Extract & Continue Any AI Chat
          </h1>
          <p
            className="text-sm max-w-[52ch] mx-auto"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Paste your conversation or share link, compress the context, and continue the
            conversation on any AI model — Claude, GPT, Gemini, and more.
          </p>
        </div>

        {/* Input Section */}
        <Card title="Step 1 — Input Source">
          {/* Tabs */}
          <div
            className="flex gap-1 p-1 rounded-lg mb-6"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            {(['paste', 'url', 'file'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all"
                style={{
                  background: activeTab === tab ? 'var(--color-surface-2)' : 'transparent',
                  color: activeTab === tab ? 'var(--color-text)' : 'var(--color-text-muted)',
                  boxShadow: activeTab === tab ? 'var(--shadow-md)' : 'none',
                }}
              >
                {tab === 'paste' ? 'Paste Chat' : tab === 'url' ? 'Shared Link (URL)' : 'Upload File'}
              </button>
            ))}
          </div>

          {/* Tab panes */}
          {activeTab === 'paste' && (
            <div>
              <label
                className="text-xs font-semibold uppercase tracking-wider block mb-2"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Paste your conversation
              </label>
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={`Paste your AI chat conversation here...\n\nUser: Hello, can you help me understand machine learning?\nAssistant: Of course! Machine learning is...\nUser: What about neural networks?\nAssistant: Neural networks are...`}
                spellCheck={false}
                className="w-full min-h-[200px] p-4 rounded-lg resize-y transition-all focus:outline-none"
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 'clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)',
                  lineHeight: 1.7,
                  color: 'var(--color-text)',
                }}
              />
              <div
                className="text-xs text-right mt-1.5"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'var(--color-text-faint)',
                }}
              >
                {charCount.toLocaleString()} chars · {wordCount.toLocaleString()} words
              </div>
            </div>
          )}

          {activeTab === 'url' && (
            <div>
              <label
                className="text-xs font-semibold uppercase tracking-wider block mb-2"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Shared Chat URL
              </label>
              <div className="flex gap-2.5 mb-3">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://chat.openai.com/share/... or Claude, Gemini share link"
                  className="flex-1 px-3.5 py-2.5 text-sm rounded-md transition-all focus:outline-none"
                  style={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <BtnPrimary onClick={handleUrlFetch} disabled={isFetching}>
                  {isFetching ? 'Fetching...' : 'Fetch'}
                </BtnPrimary>
              </div>
              <div
                className="text-xs p-3.5 rounded-lg leading-relaxed"
                style={{
                  background:
                    'color-mix(in oklab, var(--color-primary) 6%, var(--color-surface))',
                  border:
                    '1px solid color-mix(in oklab, var(--color-primary) 20%, var(--color-border))',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'var(--color-text-muted)',
                }}
              >
                <strong style={{ color: 'var(--color-primary)', fontFamily: "'Satoshi', sans-serif" }}>
                  Supported formats:
                </strong>{' '}
                ChatGPT share links, Claude shared conversations, Perplexity threads, Gemini shares,
                and any page with readable chat content.
                <br />
                <br />
                Note: Due to browser security, some share links require you to open them, select all
                (Ctrl+A), copy (Ctrl+C), then paste in the "Paste Chat" tab.
              </div>
            </div>
          )}

          {activeTab === 'file' && (
            <div>
              <label
                className="text-xs font-semibold uppercase tracking-wider block mb-2"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Upload exported chat file
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                }}
                onDragLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  handleFile(e.dataTransfer.files[0]);
                }}
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <UploadIcon
                  className="mx-auto mb-3"
                  style={{ color: 'var(--color-text-faint)' }}
                />
                <p
                  className="text-sm"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Drop .txt, .md, .json, or .html chat exports
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: 'var(--color-text-faint)' }}
                >
                  or{' '}
                  <span
                    className="underline cursor-pointer"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    browse files
                  </span>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.json,.html,.htm"
                  onChange={(e) => handleFile(e.target.files?.[0]!)}
                  className="hidden"
                />
              </div>
            </div>
          )}
        </Card>

        {/* Options */}
        <Card title="Step 2 — Extraction Options">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {[
              { key: 'summary', label: 'Smart Summary', desc: 'Condense long exchanges into key points' },
              { key: 'entities', label: 'Extract Key Topics', desc: 'People, concepts, decisions, tasks' },
              { key: 'context', label: 'Context Block', desc: 'Preserve critical background info' },
              { key: 'turns', label: 'Recent Turns', desc: 'Keep last N exchanges verbatim' },
              { key: 'code', label: 'Code Blocks', desc: 'Extract and preserve all code snippets' },
              { key: 'decisions', label: 'Decisions & Outcomes', desc: 'Extract agreed-upon items and results' },
            ].map(({ key, label, desc }) => (
              <label
                key={key}
                className="flex items-start gap-2.5 p-3 rounded-md cursor-pointer transition-all"
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <input
                  type="checkbox"
                  checked={options[key as keyof ExtractionOptions]}
                  onChange={() => toggleOption(key as keyof ExtractionOptions)}
                  className="w-4 h-4 mt-0.5 shrink-0"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {desc}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* Recent turns slider */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <label
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Recent turns to keep verbatim
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={10}
                value={recentTurnsCount}
                onChange={(e) => setRecentTurnsCount(parseInt(e.target.value))}
                className="w-24"
                style={{ accentColor: 'var(--color-primary)' }}
              />
              <span
                className="font-bold w-5 text-center"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 'clamp(0.875rem, 0.8rem + 0.35vw, 1rem)',
                  color: 'var(--color-primary)',
                }}
              >
                {recentTurnsCount}
              </span>
            </div>
          </div>

          <hr
            className="my-5"
            style={{ borderColor: 'var(--color-divider)' }}
          />

          {/* Output format */}
          <label
            className="text-xs font-semibold uppercase tracking-wider block mb-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Output format
          </label>
          <div className="flex flex-wrap gap-2 mb-4">
            {(['prompt', 'markdown', 'json', 'plain'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setOutputFormat(fmt)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all"
                style={{
                  background: outputFormat === fmt ? 'var(--color-primary)' : 'transparent',
                  border: '1px solid var(--color-border)',
                  color: outputFormat === fmt ? '#fff' : 'var(--color-text-muted)',
                }}
              >
                {fmt === 'prompt' ? 'Prompt-ready' : fmt === 'markdown' ? 'Markdown' : fmt === 'json' ? 'JSON' : 'Plain text'}
              </button>
            ))}
          </div>

          {/* Model selector */}
          <label
            className="text-xs font-semibold uppercase tracking-wider block mb-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Target AI model (adds a tailored preamble)
          </label>
          <div className="flex flex-wrap gap-2">
            {(['generic', 'gpt', 'claude', 'gemini', 'perplexity', 'mistral'] as const).map(
              (model) => (
                <button
                  key={model}
                  onClick={() => setSelectedModel(model)}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all"
                  style={{
                    background:
                      selectedModel === model
                        ? 'color-mix(in oklab, var(--color-primary) 12%, var(--color-surface))'
                        : 'transparent',
                    border:
                      selectedModel === model
                        ? '1px solid var(--color-primary)'
                        : '1px solid var(--color-border)',
                    color:
                      selectedModel === model
                        ? 'var(--color-primary)'
                        : 'var(--color-text-muted)',
                  }}
                >
                  {model === 'generic'
                    ? 'Generic'
                    : model === 'gpt'
                    ? 'ChatGPT / GPT-4o'
                    : model === 'claude'
                    ? 'Claude'
                    : model === 'gemini'
                    ? 'Gemini'
                    : model === 'perplexity'
                    ? 'Perplexity'
                    : 'Mistral / Llama'}
                </button>
              )
            )}
          </div>
        </Card>

        {/* Process button */}
        <div className="flex justify-center mb-6">
          <BtnPrimary onClick={handleProcess} disabled={isProcessing}>
            {isProcessing ? <span className="spinner" aria-hidden="true" /> : <PlayIcon />}
            <span className="text-base">{isProcessing ? 'Processing...' : 'Extract & Compress'}</span>
          </BtnPrimary>
        </div>

        {/* Progress bar */}
        {isProcessing && (
          <div className="mb-6">
            <div
              className="text-xs mb-1.5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {progressLabel}
            </div>
            <div
              className="h-1 rounded-full overflow-hidden"
              style={{ background: 'var(--color-border)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  background: 'var(--color-primary)',
                  width: `${progress}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Output */}
        {showOutput && output && stats && (
          <div id="output-section" className="animate-fade-in">
            <div
              className="rounded-xl overflow-hidden"
              style={{
                border: '1px solid var(--color-border)',
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-3.5"
                style={{
                  background: 'var(--color-surface)',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div className="flex items-center gap-2 text-sm font-bold">
                  <CheckIcon style={{ color: 'var(--color-primary)' }} />
                  Compressed Context
                </div>
                <div className="flex gap-2">
                  <BtnGhost onClick={handleCopy} size="sm">
                    <CopyIcon />
                    Copy
                  </BtnGhost>
                  <BtnGhost onClick={handleDownload} size="sm">
                    <DownloadIcon />
                    Download
                  </BtnGhost>
                </div>
              </div>

              {/* Output content */}
              <div
                className="p-5 min-h-[120px] max-h-[440px] overflow-y-auto"
                style={{ background: 'var(--color-surface-2)' }}
              >
                <pre
                  ref={outputRef}
                  className="whitespace-pre-wrap break-words output-text"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 'clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)',
                    lineHeight: 1.8,
                    color: 'var(--color-text)',
                  }}
                >
                  {output}
                </pre>
              </div>

              {/* Stats */}
              <div
                className="flex flex-wrap gap-6 px-5 py-3.5"
                style={{
                  background: 'var(--color-surface-offset)',
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <Stat label="Original chars" value={stats.originalChars.toLocaleString()} />
                <Stat label="Compressed chars" value={stats.compressedChars.toLocaleString()} />
                <Stat label="Compression ratio" value={stats.compressionRatio} />
                <Stat label="Turns detected" value={stats.turns.toString()} />
                <Stat label="Topics extracted" value={stats.topics.toString()} />
              </div>
            </div>

            {/* Usage guide */}
            <Card title="How to Continue on Another AI">
              <div
                className="text-xs p-3.5 rounded-lg leading-relaxed"
                style={{
                  background:
                    'color-mix(in oklab, var(--color-primary) 6%, var(--color-surface))',
                  border:
                    '1px solid color-mix(in oklab, var(--color-primary) 20%, var(--color-border))',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'var(--color-text-muted)',
                }}
              >
                <strong
                  style={{
                    color: 'var(--color-primary)',
                    fontFamily: "'Satoshi', sans-serif",
                  }}
                >
                  Next steps for{' '}
                  {selectedModel === 'generic'
                    ? 'any AI'
                    : selectedModel.charAt(0).toUpperCase() + selectedModel.slice(1)}
                  :
                </strong>
                <br />
                {getUsageGuide(selectedModel)}
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Toast notifications */}
      <Toast toasts={toasts} />

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
        .spinner {
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          border: 2px solid color-mix(in oklab, white 60%, transparent);
          border-top-color: #fff;
          animation: spin 0.8s linear infinite;
        }
        .output-text {
          letter-spacing: 0.01em;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <div
      className="font-bold"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 'clamp(0.875rem, 0.8rem + 0.35vw, 1rem)',
        color: 'var(--color-primary)',
      }}
    >
      {value}
    </div>
    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
      {label}
    </div>
  </div>
);
