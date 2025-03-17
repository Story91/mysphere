import { useBalance } from 'wagmi';
import { AGENT_WALLET_ADDRESS } from '../constants';

export default function AgentBalance() {
  const { data } = useBalance({
    address: AGENT_WALLET_ADDRESS,
    query: { refetchInterval: 5000 },
  });

  if (!data) {
    return null;
  }

  return (
    <div className="rounded-sm border-zinc-700">
      <span className="text-[#5788FA] text-base">
        {`${Number.parseFloat(data?.formatted || '').toFixed(6)} ETH`}
      </span>
    </div>
  );
}
