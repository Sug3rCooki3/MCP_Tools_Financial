import { useState } from "react";

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export default function CodeBlock({ inline, className, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  if (inline) {
    return (
      <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">
        {children}
      </code>
    );
  }

  const code = String(children ?? "").replace(/\n$/, "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2">
      <pre className="bg-gray-900 text-gray-100 rounded-lg px-4 py-3 overflow-x-auto text-xs font-mono">
        <code className={className}>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
