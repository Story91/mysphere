'use client';

import { motion } from 'framer-motion';

export default function GovernanceDocs() {
  return (
    <div className="max-w-5xl mx-auto bg-[#1a1b1f] rounded-2xl p-8 mb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-2xl font-bold text-blue-400 mb-6">
          $AIS Governance System
        </h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-xl text-blue-300 mb-3">How It Works</h3>
            <p className="text-blue-200">
              The $AIS governance system allows token holders to participate in the decision-making
              process of the protocol. Your voting power is proportional to your token holdings.
            </p>
          </div>

          <div>
            <h3 className="text-xl text-blue-300 mb-3">Voting Power</h3>
            <p className="text-blue-200">
              1 $AIS token = 1 vote. Your tokens must be held in your wallet at the time of voting.
              Staked tokens also count towards your voting power.
            </p>
            <p className="text-blue-200 mt-2">
              A minimum of 100M $AIS tokens is required to participate in voting. This threshold ensures that voters have a significant stake in the ecosystem.
            </p>
          </div>

          <div>
            <h3 className="text-xl text-blue-300 mb-3">Proposal Process</h3>
            <div className="space-y-2 text-blue-200">
              <p>1. Proposal Creation: Any holder of 1B+ $AIS can create a proposal</p>
              <p>2. Voting Period: Each proposal has a 10-day voting period</p>
              <p>3. Execution: If passed, proposals are executed automatically within 24 hours</p>
              <p>4. Review: Proposals undergo technical feasibility review before implementation</p>
            </div>
          </div>

          <div>
            <h3 className="text-xl text-blue-300 mb-3">Quorum Requirements</h3>
            <div className="space-y-2 text-blue-200">
              <p>• Minimum participation: 3-5% of total supply depending on holders quantity</p>
              <p className="pl-4 text-sm">- For under 1,000 holders: 5% required</p>
              <p className="pl-4 text-sm">- For 1,000-10,000 holders: 4% required</p>
              <p className="pl-4 text-sm">- For over 10,000 holders: 3% required</p>
              <p>• Passing threshold: 50% of votes must be in favor</p>
              <p>• Critical proposals require 10% participation and 66% approval</p>
              <p className="pl-4 text-sm">- Critical proposals include: treasury disbursements over 10M $AIS, protocol changes, and fee structure modifications</p>
            </div>
          </div>

          <div className="bg-[#2A2D35] rounded-xl p-6 mt-8">
            <h3 className="text-xl text-blue-300 mb-3">Important Notes</h3>
            <ul className="list-disc list-inside space-y-2 text-blue-200">
              <li>Votes cannot be changed once cast</li>
              <li>Proposals cannot be canceled once voting begins</li>
              <li>Emergency proposals may have shorter voting periods (minimum 48 hours)</li>
              <li>The DAO treasury can only be accessed through successful proposals</li>
              <li>Snapshot voting may be used for non-binding community sentiment</li>
              <li>A cooling-off period of 3 days applies between similar proposals</li>
              <li>Delegation of voting power to trusted community members is supported</li>
            </ul>
          </div>

          <div className="bg-[#1E2025] rounded-xl p-6 mt-8 border border-blue-900/20">
            <h3 className="text-xl text-blue-300 mb-3">Governance Evolution</h3>
            <p className="text-blue-200 mb-4">
              The $AIS governance system is designed to evolve over time. The community can propose changes to the governance system itself through the standard proposal process.
            </p>
            <p className="text-blue-200">
              As the ecosystem matures, specialized committees may be formed to handle specific aspects of governance, such as treasury management, technical development, and marketing initiatives.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 