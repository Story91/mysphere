'use client';

interface AIButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export default function AIButton({
  onClick,
  disabled = false,
  className = ""
}: AIButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center space-x-1 sm:space-x-2 text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 text-xs sm:text-sm bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      title="Generate AI post"
    >
      <span className="text-lg">🤖</span>
      <span className="hidden sm:inline font-medium text-purple-600 dark:text-purple-400">AI</span>
    </button>
  );
}
