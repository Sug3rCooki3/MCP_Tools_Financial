interface ComposerSendControlProps {
  disabled: boolean;
  isLoading: boolean;
  onClick: () => void;
}

export default function ComposerSendControl({
  disabled,
  isLoading,
  onClick,
}: ComposerSendControlProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label="Send message"
      className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
    >
      {isLoading ? (
        <svg
          className="animate-spin w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 19V5m0 0l-7 7m7-7l7 7"
          />
        </svg>
      )}
    </button>
  );
}
