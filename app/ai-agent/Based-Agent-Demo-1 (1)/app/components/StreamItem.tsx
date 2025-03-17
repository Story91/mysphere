import type { StreamEntry } from '../types';
import TimeDisplay from './TimeDisplay';

type StreamItemProps = {
  entry: StreamEntry;
};

const formatContent = (content: string) => {
  // Regular expression to detect URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  // Replace URLs with clickable anchor tags
  return content.split(urlRegex).map((part, index) =>
    urlRegex.test(part) ? (
      <a
        key={`${index}-${part}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 underline"
      >
        {part}
      </a>
    ) : (
      <span key={`${index}-${part}`}>{part}</span>
    ),
  );
};

export default function StreamItem({ entry }: StreamItemProps) {
  return (
    <div className="mb-2">
      <TimeDisplay timestamp={entry.timestamp} />
      <div
        className={`flex max-w-full items-center space-x-2 ${entry?.type !== 'user' ? 'text-[#5788FA]' : 'text-gray-300'}`}
      >
        <span className="max-w-full text-wrap break-all">
          {' '}
          {formatContent(entry?.content)}
        </span>
      </div>
    </div>
  );
}
