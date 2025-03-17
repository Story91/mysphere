export default function Footer() {
  return (
    <div className="z-30 mt-auto flex w-full bg-black p-4 text-sm text-xs text-zinc-400 sm:text-sm md:border-[#5788FA]/50 md:border-t">
      Powered by{' '}
      <a
        href="https://onchainkit.xyz/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold transition-colors hover:text-zinc-300"
      >
        OnchainKit
      </a>
      <span className="mx-2">·</span>
      <a
        href="https://github.com/coinbase/onchain-agent-demo"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-zinc-300"
      >
        Fork this template
      </a>
    </div>
  );
}
