'use client';

interface BanMessageProps {
  reason?: string;
  bannedAt?: string;
}

export default function BanMessage({ reason, bannedAt }: BanMessageProps) {
  return (
    <div className="bg-red-500 text-white shadow-lg relative z-[1]">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-red-400 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-2">
              Your account has been banned
            </h3>
            <div className="space-y-2 text-white/90">
              <p>
                <span className="font-medium">Reason:</span> {reason || 'Community Guidelines Violation'}
              </p>
              {bannedAt && (
                <p>
                  <span className="font-medium">Date:</span> {new Date(bannedAt).toLocaleString()}
                </p>
              )}
            </div>
            <div className="mt-4">
              <button
                onClick={() => window.open('mailto:support@basebook.com')}
                className="inline-flex items-center px-4 py-2 bg-white text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Appeal Ban
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 