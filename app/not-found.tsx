export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-[#0052FF] mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-white mb-4">Page Not Found</h2>
        <p className="text-gray-400 mb-8">The page you are looking for doesn't exist or has been moved.</p>
        <a 
          href="/" 
          className="px-6 py-3 bg-[#0052FF] text-white rounded-xl hover:bg-[#0052FF]/90 transition-all duration-300"
        >
          Go Home
        </a>
      </div>
    </div>
  );
} 