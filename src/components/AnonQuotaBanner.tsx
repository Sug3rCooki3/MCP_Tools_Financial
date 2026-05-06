"use client";

interface AnonQuotaBannerProps {
  messagesUsed: number;
  limit: number;
  onSignUpClick: () => void;
}

export function AnonQuotaBanner({ messagesUsed, limit, onSignUpClick }: AnonQuotaBannerProps) {
  const isExhausted = messagesUsed >= limit;

  return (
    <div
      data-testid="anon-quota-banner"
      className={`flex items-center justify-between rounded-md px-4 py-2 text-sm ${
        isExhausted
          ? "bg-amber-100 text-amber-900 border border-amber-300"
          : "bg-blue-50 text-blue-800 border border-blue-200"
      }`}
    >
      <span>
        {isExhausted
          ? "Sign up to unlock unlimited messages"
          : `${messagesUsed} of ${limit} free messages used. Sign up to continue.`}
      </span>
      <button
        onClick={onSignUpClick}
        className="ml-4 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
      >
        Sign up
      </button>
    </div>
  );
}
