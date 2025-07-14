'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { 
  Calendar, 
  Users, 
  DollarSign, 
  Trophy, 
  Star, 
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  CreditCard,
  Gift,
  Medal,
  Target,
  TrendingUp,
  Award,
  Zap,
  Heart,
  Eye,
  ExternalLink,
  Share2,
  Bookmark
} from 'lucide-react';

// Interfaces
interface EventParticipation {
  eventId: string;
  userId: string;
  username: string;
  avatar?: string;
  registeredAt: Date;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentTxHash?: string;
  checkInTime?: Date;
  checkOutTime?: Date;
  attendanceStatus: 'registered' | 'checked_in' | 'completed' | 'no_show';
  rating?: number;
  feedback?: string;
  rewardsReceived: boolean;
  position?: number;
  score?: number;
}

interface EventDetails {
  id: string;
  title: string;
  description: string;
  creator: string;
  startDate: Date;
  endDate: Date;
  location: string;
  isVirtual: boolean;
  category: string;
  price: number;
  maxParticipants: number;
  currentParticipants: number;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  requirements: string[];
  tags: string[];
  imageUrl?: string;
  rewards: {
    type: 'token' | 'nft' | 'badge' | 'points';
    amount: number;
    description: string;
  }[];
  participantRanking: boolean;
  competitionRules?: string;
}

interface EventParticipationSystemProps {
  eventId: string;
  currentUserAddress: string;
}

const EventParticipationSystem: React.FC<EventParticipationSystemProps> = ({
  eventId,
  currentUserAddress
}) => {
  const router = useRouter();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [participants, setParticipants] = useState<EventParticipation[]>([]);
  const [currentUserParticipation, setCurrentUserParticipation] = useState<EventParticipation | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'participants' | 'ranking' | 'rewards'>('details');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Feedback form
  const [feedback, setFeedback] = useState({
    rating: 5,
    comment: ''
  });

  // Example event data
  useEffect(() => {
    const loadEventData = async () => {
      setLoading(true);
      
      const mockEvent: EventDetails = {
        id: eventId,
        title: 'DeFi Workshop: Yield Farming Strategies',
        description: 'Comprehensive workshop on yield farming strategies in DeFi. Learn how to maximize profits with minimal risk. Workshop includes practical examples, case studies and hands-on exercises.',
        creator: '0x1234567890123456789012345678901234567890',
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
        location: 'Virtual Event - Zoom',
        isVirtual: true,
        category: 'workshop',
        price: 0.05,
        maxParticipants: 30,
        currentParticipants: 18,
        status: 'upcoming',
        requirements: ['Basic DeFi knowledge', 'MetaMask wallet', 'Computer with internet'],
        tags: ['DeFi', 'Yield Farming', 'Blockchain', 'Workshop'],
        rewards: [
          { type: 'token', amount: 100, description: 'Community tokens for completion' },
          { type: 'badge', amount: 1, description: 'DeFi Expert Badge' },
          { type: 'nft', amount: 1, description: 'Workshop completion NFT' }
        ],
        participantRanking: true,
        competitionRules: 'Ranking based on activity, questions asked and practical tasks completed.'
      };

      const mockParticipants: EventParticipation[] = [
        {
          eventId: eventId,
          userId: '0x1111111111111111111111111111111111111111',
          username: 'AliceTrader',
          avatar: '',
          registeredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          paymentStatus: 'paid',
          paymentTxHash: '0xabc123...',
          attendanceStatus: 'registered',
          rewardsReceived: false,
          position: 1,
          score: 95
        },
        {
          eventId: eventId,
          userId: '0x2222222222222222222222222222222222222222',
          username: 'BobDeFi',
          avatar: '',
          registeredAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
          paymentStatus: 'paid',
          paymentTxHash: '0xdef456...',
          attendanceStatus: 'registered',
          rewardsReceived: false,
          position: 2,
          score: 88
        },
        {
          eventId: eventId,
          userId: currentUserAddress,
          username: 'CurrentUser',
          avatar: '',
          registeredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          paymentStatus: 'paid',
          paymentTxHash: '0xghi789...',
          attendanceStatus: 'registered',
          rewardsReceived: false,
          position: 3,
          score: 82
        }
      ];

      setEvent(mockEvent);
      setParticipants(mockParticipants);
      setCurrentUserParticipation(mockParticipants.find(p => p.userId === currentUserAddress) || null);
      setLoading(false);
    };

    loadEventData();
  }, [eventId, currentUserAddress]);

  // Event registration function
  const handleRegister = async () => {
    if (!event) return;
    
    setProcessing(true);
    try {
      if (event.price > 0) {
        setShowPaymentModal(true);
      } else {
        await registerForFreeEvent();
      }
    } catch (error) {
      toast.error('Error during registration');
    } finally {
      setProcessing(false);
    }
  };

  // Payment function
  const handlePayment = async () => {
    if (!event) return;
    
    setProcessing(true);
    try {
      // Payment simulation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const newParticipation: EventParticipation = {
        eventId: eventId,
        userId: currentUserAddress,
        username: 'CurrentUser',
        registeredAt: new Date(),
        paymentStatus: 'paid',
        paymentTxHash: '0x' + Math.random().toString(16).substr(2, 8) + '...',
        attendanceStatus: 'registered',
        rewardsReceived: false
      };

      setParticipants(prev => [...prev, newParticipation]);
      setCurrentUserParticipation(newParticipation);
      setEvent(prev => prev ? { ...prev, currentParticipants: prev.currentParticipants + 1 } : null);
      setShowPaymentModal(false);
      
      toast.success('Payment completed successfully! You are registered for the event.');
    } catch (error) {
      toast.error('Payment error');
    } finally {
      setProcessing(false);
    }
  };

  // Free event registration function
  const registerForFreeEvent = async () => {
    if (!event) return;
    
    const newParticipation: EventParticipation = {
      eventId: eventId,
      userId: currentUserAddress,
      username: 'CurrentUser',
      registeredAt: new Date(),
      paymentStatus: 'paid',
      attendanceStatus: 'registered',
      rewardsReceived: false
    };

    setParticipants(prev => [...prev, newParticipation]);
    setCurrentUserParticipation(newParticipation);
    setEvent(prev => prev ? { ...prev, currentParticipants: prev.currentParticipants + 1 } : null);
    
    toast.success('You have been registered for the event!');
  };

  // Unregistration function
  const handleUnregister = async () => {
    if (!currentUserParticipation) return;
    
    setProcessing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setParticipants(prev => prev.filter(p => p.userId !== currentUserAddress));
      setCurrentUserParticipation(null);
      setEvent(prev => prev ? { ...prev, currentParticipants: prev.currentParticipants - 1 } : null);
      
      toast.success('Registration cancelled successfully');
    } catch (error) {
      toast.error('Error cancelling registration');
    } finally {
      setProcessing(false);
    }
  };

  // Feedback submission function
  const handleSubmitFeedback = async () => {
    if (!currentUserParticipation) return;
    
    setProcessing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setCurrentUserParticipation(prev => prev ? {
        ...prev,
        rating: feedback.rating,
        feedback: feedback.comment
      } : null);
      
      setParticipants(prev => prev.map(p => 
        p.userId === currentUserAddress 
          ? { ...p, rating: feedback.rating, feedback: feedback.comment }
          : p
      ));
      
      setShowFeedbackModal(false);
      toast.success('Feedback sent successfully!');
    } catch (error) {
      toast.error('Error sending feedback');
    } finally {
      setProcessing(false);
    }
  };

  // Date formatting function
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Status color function
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'upcoming': return 'text-blue-400 bg-blue-500/20';
      case 'ongoing': return 'text-green-400 bg-green-500/20';
      case 'completed': return 'text-purple-400 bg-purple-500/20';
      case 'cancelled': return 'text-red-400 bg-red-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  // Payment status color function
  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'text-green-400 bg-green-500/20';
      case 'pending': return 'text-yellow-400 bg-yellow-500/20';
      case 'failed': return 'text-red-400 bg-red-500/20';
      case 'refunded': return 'text-gray-400 bg-gray-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <div className="text-red-400 text-lg">Event not found</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-900 text-white min-h-screen p-8">
          {loading ? (
            <p>Loading event...</p>
          ) : !event ? (
            <p>Event not found.</p>
          ) : (
            <div>
              <div className="flex items-center space-x-4 mb-8">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <div>
                    <h1 className="text-4xl font-bold">{event.title}</h1>
                    <p className="text-slate-400">Participate and engage in community events</p>
                </div>
              </div>
              
              {/* Event header */}
              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 mb-6 border border-gray-700">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h1 className="text-3xl font-bold text-white mb-2">{event.title}</h1>
                    <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(event.startDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {event.isVirtual ? 'Virtual Event' : event.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {event.currentParticipants}/{event.maxParticipants}
                      </span>
                      {event.price > 0 && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4" />
                          {event.price} ETH
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className={`px-3 py-1 text-sm rounded-full ${getStatusColor(event.status)}`}>
                        {event.status}
                      </span>
                      <span className="px-3 py-1 text-sm bg-gray-600/20 text-gray-400 rounded-full">
                        {event.category}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors">
                      <Share2 className="w-5 h-5 text-gray-400" />
                    </button>
                    <button className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors">
                      <Bookmark className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                </div>

                {/* Registration actions */}
                <div className="flex items-center gap-4">
                  {!currentUserParticipation ? (
                    <button
                      onClick={handleRegister}
                      disabled={processing || event.currentParticipants >= event.maxParticipants}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processing ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          {event.price > 0 ? `Buy for ${event.price} ETH` : 'Register'}
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg">
                        <CheckCircle className="w-5 h-5" />
                        <span>Registered</span>
                      </div>
                      <button
                        onClick={handleUnregister}
                        disabled={processing}
                        className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
                      >
                        Cancel Registration
                      </button>
                      {event.status === 'completed' && !currentUserParticipation.rating && (
                        <button
                          onClick={() => setShowFeedbackModal(true)}
                          className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                        >
                          Rate Event
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation */}
              <div className="flex flex-wrap gap-2 mb-6">
                {[
                  { id: 'details', label: 'Details', icon: Eye },
                  { id: 'participants', label: 'Participants', icon: Users },
                  { id: 'ranking', label: 'Ranking', icon: Trophy, condition: event.participantRanking },
                  { id: 'rewards', label: 'Rewards', icon: Gift }
                ].filter(tab => tab.condition !== false).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab: Details */}
              {activeTab === 'details' && (
                <div className="space-y-6">
                  {/* Description */}
                  <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-4">Event Description</h3>
                    <p className="text-gray-300 leading-relaxed">{event.description}</p>
                  </div>

                  {/* Requirements */}
                  <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-4">Requirements</h3>
                    <ul className="space-y-2">
                      {event.requirements.map((requirement, index) => (
                        <li key={index} className="flex items-center gap-2 text-gray-300">
                          <CheckCircle className="w-4 h-4 text-green-400" />
                          {requirement}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Tags */}
                  <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-4">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {event.tags.map((tag, index) => (
                        <span key={index} className="px-3 py-1 text-sm bg-purple-500/20 text-purple-400 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Competition rules */}
                  {event.participantRanking && event.competitionRules && (
                    <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                      <h3 className="text-lg font-semibold text-white mb-4">Competition Rules</h3>
                      <p className="text-gray-300">{event.competitionRules}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Participants */}
              {activeTab === 'participants' && (
                <div className="space-y-4">
                  <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-4">
                      Participants ({participants.length}/{event.maxParticipants})
                    </h3>
                    <div className="space-y-3">
                      {participants.map((participant, index) => (
                        <div key={participant.userId} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                              <span className="text-white font-bold">
                                {participant.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <h4 className="font-semibold text-white">{participant.username}</h4>
                              <div className="flex items-center gap-2 text-sm text-gray-400">
                                <span>Registered: {formatDate(participant.registeredAt)}</span>
                                {participant.userId === currentUserAddress && (
                                  <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-full">
                                    You
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 text-xs rounded-full ${getPaymentStatusColor(participant.paymentStatus)}`}>
                              {participant.paymentStatus}
                            </span>
                            {participant.position && (
                              <div className="flex items-center gap-1 text-sm text-yellow-400">
                                <Medal className="w-4 h-4" />
                                #{participant.position}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Ranking */}
              {activeTab === 'ranking' && event.participantRanking && (
                <div className="space-y-4">
                  <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-4">Participant Ranking</h3>
                    <div className="space-y-3">
                      {participants
                        .filter(p => p.position)
                        .sort((a, b) => (a.position || 0) - (b.position || 0))
                        .map((participant, index) => (
                          <div key={participant.userId} className={`flex items-center justify-between p-4 rounded-lg ${
                            participant.userId === currentUserAddress ? 'bg-purple-500/20 border border-purple-500/30' : 'bg-gray-700/30'
                          }`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                                participant.position === 1 ? 'bg-yellow-500 text-black' :
                                participant.position === 2 ? 'bg-gray-400 text-black' :
                                participant.position === 3 ? 'bg-orange-500 text-black' :
                                'bg-gray-600 text-white'
                              }`}>
                                {participant.position}
                              </div>
                              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                                <span className="text-white font-bold">
                                  {participant.username.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <h4 className="font-semibold text-white">{participant.username}</h4>
                                <div className="text-sm text-gray-400">
                                  Score: {participant.score || 0} points
                                </div>
                              </div>
                            </div>
                            
                            {participant.position && participant.position <= 3 && (
                              <div className="flex items-center gap-1">
                                <Trophy className={`w-5 h-5 ${
                                  participant.position === 1 ? 'text-yellow-500' :
                                  participant.position === 2 ? 'text-gray-400' :
                                  'text-orange-500'
                                }`} />
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Rewards */}
              {activeTab === 'rewards' && (
                <div className="space-y-4">
                  <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-4">Participation Rewards</h3>
                    <div className="space-y-3">
                      {event.rewards.map((reward, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 bg-gray-700/30 rounded-lg">
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                            {reward.type === 'token' ? <Star className="w-5 h-5 text-white" /> :
                             reward.type === 'nft' ? <Award className="w-5 h-5 text-white" /> :
                             reward.type === 'badge' ? <Medal className="w-5 h-5 text-white" /> :
                             <Zap className="w-5 h-5 text-white" />}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-white">
                              {reward.amount > 1 ? `${reward.amount}x ` : ''}{reward.description}
                            </h4>
                            <p className="text-sm text-gray-400">
                              Type: {reward.type === 'token' ? 'Token' : 
                                    reward.type === 'nft' ? 'NFT' :
                                    reward.type === 'badge' ? 'Badge' : 'Points'}
                            </p>
                          </div>
                          {currentUserParticipation?.rewardsReceived ? (
                            <div className="flex items-center gap-1 text-green-400">
                              <CheckCircle className="w-4 h-4" />
                              <span className="text-sm">Received</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-gray-400">
                              <Clock className="w-4 h-4" />
                              <span className="text-sm">Pending</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {event.participantRanking && (
                      <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <h4 className="font-semibold text-yellow-400 mb-2">Additional Ranking Rewards</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-300">🥇 1st place:</span>
                            <span className="text-yellow-400">500 bonus tokens + Exclusive NFT</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-300">🥈 2nd place:</span>
                            <span className="text-gray-400">300 bonus tokens + Rare Badge</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-300">🥉 3rd place:</span>
                            <span className="text-orange-400">200 bonus tokens + Badge</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Payment modal */}
              <AnimatePresence>
                {showPaymentModal && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                  >
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700"
                    >
                      <div className="p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Event Payment</h3>
                        
                        <div className="space-y-4">
                          <div className="bg-gray-700/30 rounded-lg p-4">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-gray-400">Event:</span>
                              <span className="text-white">{event.title}</span>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-gray-400">Price:</span>
                              <span className="text-white">{event.price} ETH</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400">Network:</span>
                              <span className="text-white">Base</span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={handlePayment}
                              disabled={processing}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 disabled:opacity-50"
                            >
                              {processing ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              ) : (
                                <>
                                  <CreditCard className="w-4 h-4" />
                                  Pay
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => setShowPaymentModal(false)}
                              disabled={processing}
                              className="flex-1 px-4 py-2 bg-gray-700/50 text-gray-400 rounded-lg hover:bg-gray-600/50 transition-colors disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Feedback modal */}
              <AnimatePresence>
                {showFeedbackModal && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                  >
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700"
                    >
                      <div className="p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Rate Event</h3>
                        
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Rating (1-5 stars)
                            </label>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  onClick={() => setFeedback({ ...feedback, rating: star })}
                                  className={`w-8 h-8 ${
                                    star <= feedback.rating ? 'text-yellow-400' : 'text-gray-600'
                                  }`}
                                >
                                  <Star className="w-full h-full fill-current" />
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Comment (optional)
                            </label>
                            <textarea
                              value={feedback.comment}
                              onChange={(e) => setFeedback({ ...feedback, comment: e.target.value })}
                              rows={3}
                              className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                              placeholder="Share your thoughts..."
                            />
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={handleSubmitFeedback}
                              disabled={processing}
                              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 disabled:opacity-50"
                            >
                              {processing ? 'Sending...' : 'Send Feedback'}
                            </button>
                            <button
                              onClick={() => setShowFeedbackModal(false)}
                              disabled={processing}
                              className="flex-1 px-4 py-2 bg-gray-700/50 text-gray-400 rounded-lg hover:bg-gray-600/50 transition-colors disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EventParticipationSystem; 