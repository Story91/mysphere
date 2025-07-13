'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, AlertTriangle, Play, Pause, Download, AlertCircle, Lock, Unlock, Eye, EyeOff, RefreshCw } from 'lucide-react';

interface SecurityStatus {
  isPaused: boolean;
  lastPauseTime: string | null;
  pauseReason: string | null;
  emergencyMode: boolean;
  contractOwner: string;
  pendingOwnershipTransfer: string | null;
}

interface SecurityEvent {
  id: string;
  type: 'PAUSE' | 'UNPAUSE' | 'EMERGENCY_WITHDRAW' | 'OWNERSHIP_TRANSFER' | 'SECURITY_BREACH';
  timestamp: string;
  initiator: string;
  details: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

const mockSecurityStatus: SecurityStatus = {
  isPaused: false,
  lastPauseTime: null,
  pauseReason: null,
  emergencyMode: false,
  contractOwner: "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd",
  pendingOwnershipTransfer: null
};

const mockSecurityEvents: SecurityEvent[] = [
  {
    id: "1",
    type: "PAUSE",
    timestamp: "2024-01-20T10:30:00Z",
    initiator: "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd",
    details: "Platform paused for maintenance upgrade",
    severity: "MEDIUM"
  },
  {
    id: "2",
    type: "UNPAUSE",
    timestamp: "2024-01-20T11:15:00Z",
    initiator: "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd",
    details: "Platform resumed after successful upgrade",
    severity: "LOW"
  },
  {
    id: "3",
    type: "EMERGENCY_WITHDRAW",
    timestamp: "2024-01-19T09:45:00Z",
    initiator: "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd",
    details: "Emergency withdrawal of 0.5 ETH from stuck community",
    severity: "HIGH"
  }
];

export default function AdminSecurityPanel() {
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus>(mockSecurityStatus);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>(mockSecurityEvents);
  const [isLoading, setIsLoading] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showOwnershipModal, setShowOwnershipModal] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [emergencyAddress, setEmergencyAddress] = useState('');
  const [emergencyAmount, setEmergencyAmount] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  const handlePausePlatform = async () => {
    setIsLoading(true);
    try {
      // TODO: Implement actual contract call to pause()
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSecurityStatus(prev => ({
        ...prev,
        isPaused: true,
        lastPauseTime: new Date().toISOString(),
        pauseReason
      }));
      
      const newEvent: SecurityEvent = {
        id: Date.now().toString(),
        type: 'PAUSE',
        timestamp: new Date().toISOString(),
        initiator: securityStatus.contractOwner,
        details: pauseReason || 'Platform paused by admin',
        severity: 'MEDIUM'
      };
      
      setSecurityEvents(prev => [newEvent, ...prev]);
      setShowPauseModal(false);
      setPauseReason('');
      
      // TODO: Show success toast
      console.log('Platform paused');
    } catch (error) {
      console.error('Error pausing platform:', error);
      // TODO: Show error toast
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnpausePlatform = async () => {
    setIsLoading(true);
    try {
      // TODO: Implement actual contract call to unpause()
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSecurityStatus(prev => ({
        ...prev,
        isPaused: false,
        lastPauseTime: null,
        pauseReason: null
      }));
      
      const newEvent: SecurityEvent = {
        id: Date.now().toString(),
        type: 'UNPAUSE',
        timestamp: new Date().toISOString(),
        initiator: securityStatus.contractOwner,
        details: 'Platform resumed by admin',
        severity: 'LOW'
      };
      
      setSecurityEvents(prev => [newEvent, ...prev]);
      
      // TODO: Show success toast
      console.log('Platform resumed');
    } catch (error) {
      console.error('Error unpausing platform:', error);
      // TODO: Show error toast
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmergencyWithdraw = async () => {
    setIsLoading(true);
    try {
      // TODO: Implement actual contract call to emergencyWithdraw()
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newEvent: SecurityEvent = {
        id: Date.now().toString(),
        type: 'EMERGENCY_WITHDRAW',
        timestamp: new Date().toISOString(),
        initiator: securityStatus.contractOwner,
        details: `Emergency withdrawal of ${emergencyAmount} ETH to ${emergencyAddress}`,
        severity: 'HIGH'
      };
      
      setSecurityEvents(prev => [newEvent, ...prev]);
      setShowEmergencyModal(false);
      setEmergencyAddress('');
      setEmergencyAmount('');
      
      // TODO: Show success toast
      console.log('Emergency withdrawal completed');
    } catch (error) {
      console.error('Error with emergency withdrawal:', error);
      // TODO: Show error toast
    } finally {
      setIsLoading(false);
    }
  };

  const handleOwnershipTransfer = async () => {
    setIsLoading(true);
    try {
      // TODO: Implement actual contract call to transferOwnership()
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSecurityStatus(prev => ({
        ...prev,
        pendingOwnershipTransfer: newOwner
      }));
      
      const newEvent: SecurityEvent = {
        id: Date.now().toString(),
        type: 'OWNERSHIP_TRANSFER',
        timestamp: new Date().toISOString(),
        initiator: securityStatus.contractOwner,
        details: `Ownership transfer initiated to ${newOwner}`,
        severity: 'CRITICAL'
      };
      
      setSecurityEvents(prev => [newEvent, ...prev]);
      setShowOwnershipModal(false);
      setNewOwner('');
      
      // TODO: Show success toast
      console.log('Ownership transfer initiated');
    } catch (error) {
      console.error('Error with ownership transfer:', error);
      // TODO: Show error toast
    } finally {
      setIsLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'LOW': return 'text-green-400 bg-green-400/10';
      case 'MEDIUM': return 'text-yellow-400 bg-yellow-400/10';
      case 'HIGH': return 'text-orange-400 bg-orange-400/10';
      case 'CRITICAL': return 'text-red-400 bg-red-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'PAUSE': return <Pause className="h-4 w-4" />;
      case 'UNPAUSE': return <Play className="h-4 w-4" />;
      case 'EMERGENCY_WITHDRAW': return <AlertTriangle className="h-4 w-4" />;
      case 'OWNERSHIP_TRANSFER': return <RefreshCw className="h-4 w-4" />;
      case 'SECURITY_BREACH': return <AlertCircle className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Security Panel</h2>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${securityStatus.isPaused ? 'bg-red-400' : 'bg-green-400'}`} />
          <span className="text-sm text-slate-400">
            Platform Status: {securityStatus.isPaused ? 'Paused' : 'Active'}
          </span>
        </div>
      </div>

      {/* Security Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800 rounded-xl p-6 border border-slate-700"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-lg ${securityStatus.isPaused ? 'bg-red-500' : 'bg-green-500'}`}>
              <Shield className="h-6 w-6 text-white" />
            </div>
            <span className={`text-sm font-medium ${securityStatus.isPaused ? 'text-red-400' : 'text-green-400'}`}>
              {securityStatus.isPaused ? 'PAUSED' : 'ACTIVE'}
            </span>
          </div>
          <h3 className="text-slate-400 text-sm font-medium mb-1">Platform Status</h3>
          <p className="text-white">
            {securityStatus.isPaused ? 'Platform is paused' : 'Platform is operational'}
          </p>
          {securityStatus.pauseReason && (
            <p className="text-slate-400 text-sm mt-2">{securityStatus.pauseReason}</p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800 rounded-xl p-6 border border-slate-700"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-lg ${securityStatus.emergencyMode ? 'bg-red-500' : 'bg-blue-500'}`}>
              <AlertTriangle className="h-6 w-6 text-white" />
            </div>
            <span className={`text-sm font-medium ${securityStatus.emergencyMode ? 'text-red-400' : 'text-blue-400'}`}>
              {securityStatus.emergencyMode ? 'EMERGENCY' : 'NORMAL'}
            </span>
          </div>
          <h3 className="text-slate-400 text-sm font-medium mb-1">Emergency Mode</h3>
          <p className="text-white">
            {securityStatus.emergencyMode ? 'Emergency protocols active' : 'Standard operation'}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800 rounded-xl p-6 border border-slate-700"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-lg bg-purple-500">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <span className="text-sm font-medium text-purple-400">OWNER</span>
          </div>
          <h3 className="text-slate-400 text-sm font-medium mb-1">Contract Owner</h3>
          <p className="text-white font-mono text-sm">
            {formatAddress(securityStatus.contractOwner)}
          </p>
          {securityStatus.pendingOwnershipTransfer && (
            <p className="text-yellow-400 text-xs mt-2">
              Pending transfer to {formatAddress(securityStatus.pendingOwnershipTransfer)}
            </p>
          )}
        </motion.div>
      </div>

      {/* Security Controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-slate-800 rounded-xl p-6 border border-slate-700"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Security Controls</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Pause/Unpause */}
          <button
            onClick={() => securityStatus.isPaused ? handleUnpausePlatform() : setShowPauseModal(true)}
            disabled={isLoading}
            className={`p-4 rounded-lg border-2 transition-all duration-200 ${
              securityStatus.isPaused 
                ? 'border-green-500 bg-green-500/10 hover:bg-green-500/20' 
                : 'border-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20'
            } disabled:opacity-50`}
          >
            <div className="flex items-center justify-center mb-2">
              {securityStatus.isPaused ? (
                <Play className="h-8 w-8 text-green-400" />
              ) : (
                <Pause className="h-8 w-8 text-yellow-400" />
              )}
            </div>
            <h4 className="text-white font-medium">
              {securityStatus.isPaused ? 'Resume Platform' : 'Pause Platform'}
            </h4>
            <p className="text-slate-400 text-sm mt-1">
              {securityStatus.isPaused ? 'Restore normal operations' : 'Halt all platform activity'}
            </p>
          </button>

          {/* Emergency Withdraw */}
          <button
            onClick={() => setShowEmergencyModal(true)}
            disabled={isLoading}
            className="p-4 rounded-lg border-2 border-red-500 bg-red-500/10 hover:bg-red-500/20 transition-all duration-200 disabled:opacity-50"
          >
            <div className="flex items-center justify-center mb-2">
              <Download className="h-8 w-8 text-red-400" />
            </div>
            <h4 className="text-white font-medium">Emergency Withdraw</h4>
            <p className="text-slate-400 text-sm mt-1">
              Extract funds in emergency situations
            </p>
          </button>

          {/* Ownership Transfer */}
          <button
            onClick={() => setShowOwnershipModal(true)}
            disabled={isLoading}
            className="p-4 rounded-lg border-2 border-purple-500 bg-purple-500/10 hover:bg-purple-500/20 transition-all duration-200 disabled:opacity-50"
          >
            <div className="flex items-center justify-center mb-2">
              <RefreshCw className="h-8 w-8 text-purple-400" />
            </div>
            <h4 className="text-white font-medium">Transfer Ownership</h4>
            <p className="text-slate-400 text-sm mt-1">
              Transfer contract ownership
            </p>
          </button>

          {/* Contract Information */}
          <div className="p-4 rounded-lg border-2 border-blue-500 bg-blue-500/10">
            <div className="flex items-center justify-center mb-2">
              <Shield className="h-8 w-8 text-blue-400" />
            </div>
            <h4 className="text-white font-medium">Contract Info</h4>
            <p className="text-slate-400 text-sm mt-1">
              View contract details and stats
            </p>
          </div>
        </div>
      </motion.div>

      {/* Security Events */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-slate-800 rounded-xl p-6 border border-slate-700"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Security Events</h3>
        <div className="space-y-3">
          {securityEvents.map((event, index) => (
            <div key={event.id} className="flex items-center justify-between py-3 border-b border-slate-700 last:border-b-0">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${getSeverityColor(event.severity)}`}>
                  {getEventIcon(event.type)}
                </div>
                <div>
                  <h4 className="text-white font-medium">{event.type.replace('_', ' ')}</h4>
                  <p className="text-slate-400 text-sm">{event.details}</p>
                  <p className="text-slate-500 text-xs">
                    By {formatAddress(event.initiator)} • {formatDate(event.timestamp)}
                  </p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(event.severity)}`}>
                {event.severity}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Pause Modal */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-md w-full mx-4"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Pause Platform</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Reason for pausing (optional)
              </label>
              <textarea
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="Enter reason for pausing the platform..."
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 h-24 resize-none"
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowPauseModal(false);
                  setPauseReason('');
                }}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePausePlatform}
                disabled={isLoading}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Pausing...' : 'Pause Platform'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Emergency Withdraw Modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-md w-full mx-4"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Emergency Withdraw</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Destination Address
                </label>
                <input
                  type="text"
                  value={emergencyAddress}
                  onChange={(e) => setEmergencyAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Amount (ETH)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={emergencyAmount}
                  onChange={(e) => setEmergencyAmount(e.target.value)}
                  placeholder="0.000"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowEmergencyModal(false);
                  setEmergencyAddress('');
                  setEmergencyAmount('');
                }}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEmergencyWithdraw}
                disabled={isLoading || !emergencyAddress || !emergencyAmount}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Withdrawing...' : 'Emergency Withdraw'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Ownership Transfer Modal */}
      {showOwnershipModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-md w-full mx-4"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Transfer Ownership</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-2">
                New Owner Address
              </label>
              <input
                type="text"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-red-400 mt-1">
                Warning: This action cannot be undone. Make sure the address is correct.
              </p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowOwnershipModal(false);
                  setNewOwner('');
                }}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleOwnershipTransfer}
                disabled={isLoading || !newOwner}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Transferring...' : 'Transfer Ownership'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
} 