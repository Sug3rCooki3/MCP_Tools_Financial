interface ChatHeaderProps {
  appName: string;
  onNewChat: () => void;
}

export default function ChatHeader({ appName, onNewChat }: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
      <h1 className="text-base font-semibold text-gray-900">{appName}</h1>
      <button
        type="button"
        onClick={onNewChat}
        data-testid="new-chat-button"
        className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
      >
        New Chat
      </button>
    </header>
  );
}
