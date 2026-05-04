# UI Components

## Stack

- React 19, Next.js App Router
- Tailwind CSS v3 for styling (see spec 01 for note on v3 vs v4)
- `react-markdown` + `remark-gfm` for rendering GPT responses
- No component library dependency — keep it lean

---

## Component Tree

```
app/page.tsx
└── <ChatSurface />
    ├── <ChatHeader />
    ├── <MessageList />
    │   ├── <ChatMessage role="user" />
    │   │   └── plain text
    │   └── <ChatMessage role="assistant" />
    │       ├── <MarkdownProse />   ← renders GPT markdown
    │       └── <ToolCallCard />    ← shown only when toolCalls are present; build it in v1
    ├── <ChatInput />
    │   ├── <textarea>
    │   └── <ComposerSendControl />
    └── <ErrorBoundary />
```

---

## Component Specs

### `<ChatSurface />` — `src/components/ChatSurface.tsx`

The top-level client component. Must have `"use client"` at the top of the file — it uses hooks and cannot be a Server Component.

Owns all state.

**State:**
```typescript
const [conversationId, setConversationId] = useState<string | null>(null);
const [messages, setMessages] = useState<DisplayMessage[]>([]);
const [isStreaming, setIsStreaming] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**`DisplayMessage` type:**
```typescript
interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;          // final or accumulated streaming content
  isStreaming?: boolean;    // true while this message is being streamed
  toolCalls?: ToolCallSummary[];  // optional tool call info for display
}

interface ToolCallSummary {
  name: string;
  result?: string;  // stringified or summarized result
}
```

**Responsibilities:**
- Calls `useChatStream` hook to send messages
- Appends user message immediately (optimistic update)
- Appends empty assistant message and sets `isStreaming: true`
- Accumulates delta chunks into the streaming assistant message
- On `done`, sets `isStreaming: false`, saves `conversationId`
- On error, sets `error` and removes the incomplete assistant message
- Passes `isStreaming` down to `<ChatInput />` to disable send

---

### `<MessageList />` — `src/components/MessageList.tsx`

Renders the list of messages. Auto-scrolls to the bottom when new content arrives.

**Props:**
```typescript
interface MessageListProps {
  messages: DisplayMessage[];
}
```

**Behavior:**
- Uses a `ref` on the bottom sentinel div + `useEffect` to scroll on new messages
- Does **not** scroll if the user has manually scrolled up (scroll-lock detection: check `scrollTop + clientHeight < scrollHeight - 50` before calling `scrollIntoView`)
- Each message is rendered as `<ChatMessage />`

---

### `<ChatMessage />` — `src/components/ChatMessage.tsx`

Renders a single message bubble.

**Props:**
```typescript
interface ChatMessageProps {
  message: DisplayMessage;
}
```

**Behavior:**
- `role === "user"`: right-aligned, plain text, no markdown parsing
- `role === "assistant"`: left-aligned, renders content through `<MarkdownProse />`
- If `isStreaming: true`: shows a blinking cursor after the content
- If `toolCalls` present: renders `<ToolCallCard />` above the message content

---

### `<MarkdownProse />` — `src/components/MarkdownProse.tsx`

Renders markdown from GPT with financial-friendly formatting.

```typescript
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownProse({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: CodeBlock,   // syntax-highlighted code blocks
        table: /* styled table wrapper */,
        a: /* open links in new tab */,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

GFM (GitHub Flavored Markdown) enables:
- **Tables** — essential for displaying stock data, portfolio summaries
- Strikethrough
- Task lists

---

### `<CodeBlock />` — `src/components/CodeBlock.tsx`

Renders inline `` `code` `` and fenced code blocks with a copy button.

**Props:**
```typescript
interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
}
```

No syntax highlighting library in v1 — use a `<pre>` with monospace styling. Can add `shiki` or `prism` later.

---

### `<ToolCallCard />` — `src/components/ToolCallCard.tsx`

Displayed above an assistant message when a tool was invoked. Shows the user what data was fetched.

**Props:**
```typescript
interface ToolCallCardProps {
  name: string;       // e.g. "get_stock_quote"
  result?: string;    // optional: show a brief result summary
}
```

**Display:**
- Shows a small badge with a tool icon and the tool name in human-readable form
- Example: `📊 Fetched stock quote` for `get_stock_quote`
- Kept minimal — not a full debug view

**Tool name → human label map:**
```typescript
const TOOL_LABELS: Record<string, string> = {
  get_stock_quote:      "Fetched stock quote",
  get_company_overview: "Fetched company overview",
  search_ticker:        "Searched for ticker",
  get_fx_rate:          "Fetched exchange rate",
  compound_interest:    "Calculated compound interest",
  simple_interest:      "Calculated simple interest",
  percent_change:       "Calculated percent change",
  portfolio_summary:    "Summarized portfolio",
};
```

---

### `<ChatInput />` — `src/components/ChatInput.tsx`

The message input area.

**Props:**
```typescript
interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;  // true while streaming
}
```

**Behavior:**
- `<textarea>` that auto-grows with content (CSS `field-sizing: content` or JS resize)
- `Enter` submits, `Shift+Enter` inserts a newline
- Clears on submit
- When `disabled`, textarea and send button are disabled with visual feedback
- Send button shows a spinner when `disabled`
- Empty messages are not submitted

---

### `<ComposerSendControl />` — `src/components/ComposerSendControl.tsx`

The send button inside the composer.

**Props:**
```typescript
interface ComposerSendControlProps {
  disabled: boolean;   // disables the button — set to isStreaming
  isLoading: boolean;  // shows a spinner — also set to isStreaming
  onClick: () => void;
}
```

Both `disabled` and `isLoading` will be set to the same value (`isStreaming`) by `<ChatInput />`. `disabled` prevents interaction; `isLoading` swaps the send icon for a spinner.

---

### `<ChatHeader />` — `src/components/ChatHeader.tsx`

Simple top bar with the app name and a "New Chat" button.

**Behavior:**
- "New Chat" button clears messages and resets `conversationId` to null

---

### `<ErrorBoundary />` — `src/components/ErrorBoundary.tsx`

React class component wrapping the whole chat surface. Catches render errors and shows a fallback UI with a reload prompt.

---

## Client-Side Hook: `useChatStream` — `src/hooks/useChatStream.ts`

The hook abstracts the streaming fetch call.

```typescript
interface UseChatStreamOptions {
  onDelta: (chunk: string) => void;
  onDone: (conversationId: string) => void;
  onError: (message: string) => void;
}

function useChatStream(options: UseChatStreamOptions) {
  const send = async (messages: DisplayMessage[], conversationId: string | null) => {
    // Strip UI-only fields — API only accepts { role, content }[]
    const apiMessages = messages.map(({ role, content }) => ({ role, content }));

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          // Omit conversationId entirely when null — Zod rejects explicit null
          ...(conversationId !== null && { conversationId }),
        }),
    });

    if (!response.ok || !response.body) {
      options.onError("Request failed. Please try again.");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      // Parse SSE lines: "data: {...}\n\n"
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") return;
        try {
          const event = JSON.parse(payload);
          if (event.type === "delta") options.onDelta(event.content);
          if (event.type === "done")  options.onDone(event.conversationId);
          if (event.type === "error") options.onError(event.message);
        } catch {
          // malformed chunk — skip
        }
      }
    }
  };

  return { send };
}
```

---

## Suggestion Chips

On first load (empty conversation), show suggestion chips from `config/prompts.json`. The default values defined in spec 06 are:

```
[ What is the current price of AAPL? ]
[ What is 1 USD in EUR today? ]
[ Calculate compound interest on $5,000 at 6% for 20 years ]
[ What is the market cap of Microsoft? ]
```

Clicking a chip populates the input and immediately submits it.

---

## Page Layout

```
┌─────────────────────────────────────────┐
│ Financial Assistant         [New Chat]  │  ← ChatHeader (fixed top)
├─────────────────────────────────────────┤
│                                         │
│  [User message]                         │
│           [Assistant response]          │
│  [User message]                         │
│           [Assistant streaming...]▊     │
│                                         │  ← MessageList (scrollable)
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │ Ask a financial question...     │    │  ← ChatInput (fixed bottom)
│  └─────────────────────────────────┘[→]│
└─────────────────────────────────────────┘
```
