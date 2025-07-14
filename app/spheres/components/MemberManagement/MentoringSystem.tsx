'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserPlus, 
  Star, 
  Award, 
  BookOpen, 
  TrendingUp, 
  MessageCircle,
  Calendar,
  Clock,
  Target,
  CheckCircle,
  XCircle,
  ArrowRight,
  Filter,
  Search,
  Plus,
  Edit3,
  Trash2,
  Eye,
  AlertCircle,
  Heart,
  Zap
} from 'lucide-react';

// Mentor interface
interface Mentor {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  specialization: string[];
  experience: number; // in months
  rating: number;
  totalMentees: number;
  activeMentees: number;
  completedSessions: number;
  joinedAt: Date;
  isAvailable: boolean;
  maxMentees: number;
  description: string;
  achievements: string[];
}

// Mentee interface
interface Mentee {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  mentorId: string;
  startDate: Date;
  currentGoals: string[];
  completedGoals: string[];
  progressScore: number;
  lastSessionDate?: Date;
  nextSessionDate?: Date;
  totalSessions: number;
  status: 'active' | 'completed' | 'paused';
  notes: string;
}

// Mentoring session interface
interface MentoringSession {
  id: string;
  mentorId: string;
  menteeId: string;
  scheduledAt: Date;
  duration: number;
  topic: string;
  goals: string[];
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  feedback?: {
    mentorRating: number;
    menteeRating: number;
    mentorFeedback: string;
    menteeFeedback: string;
  };
}

interface MentoringSystemProps {
  communityId: string;
  mentors: Mentor[];
  mentees: Mentee[];
  sessions: MentoringSession[];
  onAssignMentor: (menteeId: string, mentorId: string) => void;
  onRemoveMentor: (menteeId: string) => void;
  onUpdateProgress: (menteeId: string, progress: number) => void;
  onScheduleSession: (sessionData: Partial<MentoringSession>) => void;
  currentUserId: string;
}

const MentoringSystem: React.FC<MentoringSystemProps> = ({
  communityId,
  mentors,
  mentees,
  sessions,
  onAssignMentor,
  onRemoveMentor,
  onUpdateProgress,
  onScheduleSession,
  currentUserId
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'mentors' | 'mentees' | 'sessions'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'available' | 'completed'>('all');
  const [selectedMentor, setSelectedMentor] = useState<Mentor | null>(null);
  const [selectedMentee, setSelectedMentee] = useState<Mentee | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);

  // New session form
  const [newSession, setNewSession] = useState({
    mentorId: '',
    menteeId: '',
    scheduledAt: '',
    duration: 60,
    topic: '',
    goals: [] as string[]
  });

  // Example data - will be replaced with real contract data
  const [allMentors, setAllMentors] = useState<Mentor[]>([]);
  const [allMentees, setAllMentees] = useState<Mentee[]>([]);

  // Load real mentor and mentee data from contract
  useEffect(() => {
    const loadMentoringData = async () => {
      try {
        // Convert actual mentors data from props
        const mentorData = mentors.map(mentor => ({
          ...mentor,
          achievements: mentor.achievements || []
        }));
        
        // Convert actual mentees data from props
        const menteeData = mentees.map(mentee => ({
          ...mentee,
          currentGoals: mentee.currentGoals || [],
          completedGoals: mentee.completedGoals || []
        }));
        
        setAllMentors(mentorData);
        setAllMentees(menteeData);
      } catch (error) {
        console.error('Failed to load mentoring data:', error);
        // Fallback to empty arrays if loading fails
        setAllMentors([]);
        setAllMentees([]);
      }
    };

    loadMentoringData();
  }, [mentors, mentees]);

  // Filter mentors
  const filteredMentors = allMentors.filter(mentor => {
    const matchesSearch = mentor.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         mentor.specialization.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'active' && mentor.activeMentees > 0) ||
                         (filterStatus === 'available' && mentor.isAvailable && mentor.activeMentees < mentor.maxMentees);
    
    return matchesSearch && matchesFilter;
  });

  // Filter mentees
  const filteredMentees = allMentees.filter(mentee => {
    const matchesSearch = mentee.username.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'active' && mentee.status === 'active') ||
                         (filterStatus === 'completed' && mentee.status === 'completed');
    
    return matchesSearch && matchesFilter;
  });

  // Statistics
  const stats = {
    totalMentors: allMentors.length,
    activeMentors: allMentors.filter(m => m.activeMentees > 0).length,
    totalMentees: allMentees.length,
    activeMentees: allMentees.filter(m => m.status === 'active').length,
    completedSessions: allMentors.reduce((sum, m) => sum + m.completedSessions, 0),
    avgRating: allMentors.reduce((sum, m) => sum + m.rating, 0) / allMentors.length
  };

  // Handle session scheduling
  const handleScheduleSession = () => {
    const sessionData: Partial<MentoringSession> = {
      mentorId: newSession.mentorId,
      menteeId: newSession.menteeId,
      scheduledAt: new Date(newSession.scheduledAt),
      duration: newSession.duration,
      topic: newSession.topic,
      goals: newSession.goals,
      status: 'scheduled'
    };

    onScheduleSession(sessionData);
    setShowSessionModal(false);
    setNewSession({
      mentorId: '',
      menteeId: '',
      scheduledAt: '',
      duration: 60,
      topic: '',
      goals: []
    });
  };

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'mentors', label: 'Mentors', icon: Users },
          { id: 'mentees', label: 'Mentees', icon: BookOpen },
          { id: 'sessions', label: 'Sessions', icon: Calendar }
        ].map(tab => (
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

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Statistics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.totalMentors}</div>
                  <div className="text-sm text-gray-400">Total Mentors</div>
                  <div className="text-xs text-green-400">{stats.activeMentors} active</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.totalMentees}</div>
                  <div className="text-sm text-gray-400">Total Mentees</div>
                  <div className="text-xs text-blue-400">{stats.activeMentees} active</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.completedSessions}</div>
                  <div className="text-sm text-gray-400">Sessions</div>
                  <div className="text-xs text-green-400">Completed</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                  <Star className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.avgRating.toFixed(1)}</div>
                  <div className="text-sm text-gray-400">Avg Rating</div>
                  <div className="text-xs text-purple-400">Out of 5</div>
                </div>
              </div>
            </div>
          </div>

          {/* Top mentors */}
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Top Mentors</h3>
              <button
                onClick={() => setActiveTab('mentors')}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
              >
                <Eye className="w-4 h-4" />
                View All
              </button>
            </div>
            
            <div className="space-y-3">
              {allMentors.slice(0, 3).map((mentor, index) => (
                <div key={mentor.id} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {mentor.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-semibold text-white">{mentor.username}</div>
                      <div className="text-sm text-gray-400">{mentor.specialization.join(', ')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-400 fill-current" />
                        <span className="text-sm font-medium text-white">{mentor.rating}</span>
                      </div>
                      <div className="text-xs text-gray-400">{mentor.completedSessions} sessions</div>
                    </div>
                    <div className="text-2xl font-bold text-purple-400">#{index + 1}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming sessions */}
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Upcoming Sessions</h3>
              <button
                onClick={() => setShowSessionModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Schedule Session
              </button>
            </div>
            
            <div className="space-y-3">
              {allMentees.filter(m => m.nextSessionDate).slice(0, 3).map(mentee => {
                const mentor = allMentors.find(m => m.id === mentee.mentorId);
                return (
                  <div key={mentee.id} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">
                          {mentee.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-white">{mentee.username}</div>
                        <div className="text-sm text-gray-400">with {mentor?.username}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm text-white">
                        <Calendar className="w-4 h-4" />
                        {mentee.nextSessionDate?.toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-400">
                        {mentee.nextSessionDate?.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Mentors */}
      {activeTab === 'mentors' && (
        <div className="space-y-4">
          {/* Header with search */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search mentors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="available">Available</option>
              </select>
            </div>
            
            <button
              onClick={() => setShowAssignModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Assign Mentor
            </button>
          </div>

          {/* Mentors list */}
          <div className="space-y-4">
            {filteredMentors.map(mentor => (
              <div key={mentor.id} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold">
                        {mentor.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{mentor.username}</h4>
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-400 fill-current" />
                        <span className="text-sm text-gray-400">{mentor.rating}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      mentor.isAvailable ? 'bg-green-500' : 'bg-gray-500'
                    }`} />
                    <span className="text-xs text-gray-400">
                      {mentor.isAvailable ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 mb-3">
                  <div className="text-sm text-gray-300">{mentor.description}</div>
                  <div className="flex flex-wrap gap-1">
                    {mentor.specialization.map(spec => (
                      <span key={spec} className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded-full">
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-white">{mentor.activeMentees}</div>
                    <div className="text-xs text-gray-400">Active Students</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">{mentor.completedSessions}</div>
                    <div className="text-xs text-gray-400">Sessions</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">{mentor.experience}</div>
                    <div className="text-xs text-gray-400">Months Experience</div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setSelectedMentor(mentor)}
                    className="flex-1 px-3 py-2 bg-gray-700/50 text-gray-300 rounded-lg hover:bg-gray-600/50 transition-colors text-sm"
                  >
                    Details
                  </button>
                  <button
                    disabled={!mentor.isAvailable || mentor.activeMentees >= mentor.maxMentees}
                    className="flex-1 px-3 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Assign
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Mentees */}
      {activeTab === 'mentees' && (
        <div className="space-y-4">
          {/* Header with search */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search mentees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>

          {/* Mentees list */}
          <div className="space-y-4">
            {filteredMentees.map(mentee => {
              const mentor = allMentors.find(m => m.id === mentee.mentorId);
              return (
                <div key={mentee.id} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold">
                          {mentee.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-white">{mentee.username}</h4>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            mentee.status === 'active' ? 'bg-green-500/20 text-green-400' :
                            mentee.status === 'completed' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {mentee.status === 'active' ? 'Active' :
                             mentee.status === 'completed' ? 'Completed' : 'Paused'}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-400 mb-2">
                          Mentor: {mentor?.username || 'No mentor assigned'}
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(mentee.startDate).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {mentee.totalSessions} sessions
                          </span>
                          <span className="flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            {mentee.completedGoals.length} goals completed
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-3">
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Progress</span>
                            <span>{mentee.progressScore}%</span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${mentee.progressScore}%` }}
                            />
                          </div>
                        </div>

                        <div className="text-xs text-gray-500">{mentee.notes}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedMentee(mentee)}
                        className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onRemoveMentor(mentee.id)}
                        className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors text-red-400"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Next session */}
                  {mentee.nextSessionDate && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-green-400" />
                        <span className="text-gray-400">Next session:</span>
                        <span className="text-white font-medium">
                          {mentee.nextSessionDate.toLocaleDateString()} {mentee.nextSessionDate.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: Schedule session */}
      <AnimatePresence>
        {showSessionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700"
            >
              <h3 className="text-lg font-semibold text-white mb-4">Schedule Session</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Mentor
                  </label>
                  <select
                    value={newSession.mentorId}
                    onChange={(e) => setNewSession({...newSession, mentorId: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select mentor</option>
                    {allMentors.map(mentor => (
                      <option key={mentor.id} value={mentor.id}>
                        {mentor.username}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Mentee
                  </label>
                  <select
                    value={newSession.menteeId}
                    onChange={(e) => setNewSession({...newSession, menteeId: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select mentee</option>
                    {allMentees.map(mentee => (
                      <option key={mentee.id} value={mentee.id}>
                        {mentee.username}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Date and Time
                  </label>
                  <input
                    type="datetime-local"
                    value={newSession.scheduledAt}
                    onChange={(e) => setNewSession({...newSession, scheduledAt: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    value={newSession.duration}
                    onChange={(e) => setNewSession({...newSession, duration: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Session Topic
                  </label>
                  <input
                    type="text"
                    value={newSession.topic}
                    onChange={(e) => setNewSession({...newSession, topic: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleScheduleSession}
                    className="flex-1 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
                  >
                    Schedule
                  </button>
                  <button
                    onClick={() => setShowSessionModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-700/50 text-gray-400 rounded-lg hover:bg-gray-600/50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MentoringSystem; 