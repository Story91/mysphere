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

// Interfejs dla mentora
interface Mentor {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  specialization: string[];
  experience: number; // w miesiącach
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

// Interfejs dla ucznia
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

// Interfejs dla sesji mentoringu
interface MentorshipSession {
  id: string;
  mentorId: string;
  menteeId: string;
  scheduledAt: Date;
  duration: number; // w minutach
  status: 'scheduled' | 'completed' | 'cancelled';
  topic: string;
  notes: string;
  rating?: number;
  feedback?: string;
  goals: string[];
  completedGoals: string[];
}

interface MentoringSystemProps {
  communityId: string;
  mentors: Mentor[];
  mentees: Mentee[];
  sessions: MentorshipSession[];
  onAssignMentor: (menteeId: string, mentorId: string) => void;
  onRemoveMentor: (menteeId: string) => void;
  onUpdateProgress: (menteeId: string, progress: Partial<Mentee>) => void;
  onScheduleSession: (sessionData: Partial<MentorshipSession>) => void;
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

  // Formularz nowej sesji
  const [newSession, setNewSession] = useState({
    mentorId: '',
    menteeId: '',
    scheduledAt: '',
    duration: 60,
    topic: '',
    goals: [] as string[]
  });

  // Przykładowe dane
  const [allMentors, setAllMentors] = useState<Mentor[]>([
    {
      id: '1',
      userId: 'mentor1',
      username: 'AliceExpert',
      avatar: '',
      specialization: ['DeFi', 'Smart Contracts', 'Tokenomics'],
      experience: 24,
      rating: 4.8,
      totalMentees: 15,
      activeMentees: 3,
      completedSessions: 45,
      joinedAt: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000),
      isAvailable: true,
      maxMentees: 5,
      description: 'Ekspert DeFi z 2-letnim doświadczeniem w mentoringu',
      achievements: ['Top Mentor', 'DeFi Expert', 'Community Leader']
    },
    {
      id: '2',
      userId: 'mentor2',
      username: 'BobBuilder',
      avatar: '',
      specialization: ['Frontend', 'React', 'Web3 Integration'],
      experience: 18,
      rating: 4.6,
      totalMentees: 12,
      activeMentees: 4,
      completedSessions: 38,
      joinedAt: new Date(Date.now() - 4 * 30 * 24 * 60 * 60 * 1000),
      isAvailable: true,
      maxMentees: 6,
      description: 'Full-stack developer specjalizujący się w Web3',
      achievements: ['Code Mentor', 'React Expert']
    }
  ]);

  const [allMentees, setAllMentees] = useState<Mentee[]>([
    {
      id: '1',
      userId: 'mentee1',
      username: 'NewbieDev',
      avatar: '',
      mentorId: '1',
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      currentGoals: ['Nauczyć się Solidity', 'Zrozumieć DeFi protokoły'],
      completedGoals: ['Podstawy blockchain', 'Konfiguracja środowiska'],
      progressScore: 65,
      lastSessionDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      nextSessionDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      totalSessions: 8,
      status: 'active',
      notes: 'Bardzo zaangażowany uczeń, szybko się uczy'
    },
    {
      id: '2',
      userId: 'mentee2',
      username: 'JuniorCoder',
      avatar: '',
      mentorId: '2',
      startDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      currentGoals: ['Integracja z MetaMask', 'Pierwszy dApp'],
      completedGoals: ['React podstawy', 'Web3.js setup', 'Pierwszy smart contract'],
      progressScore: 80,
      lastSessionDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      nextSessionDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      totalSessions: 12,
      status: 'active',
      notes: 'Gotowy do zaawansowanych tematów'
    }
  ]);

  // Filtrowanie mentorów
  const filteredMentors = allMentors.filter(mentor => {
    const matchesSearch = mentor.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         mentor.specialization.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'active' && mentor.activeMentees > 0) ||
                         (filterStatus === 'available' && mentor.isAvailable && mentor.activeMentees < mentor.maxMentees);
    
    return matchesSearch && matchesFilter;
  });

  // Filtrowanie uczniów
  const filteredMentees = allMentees.filter(mentee => {
    const matchesSearch = mentee.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || filterStatus === mentee.status;
    
    return matchesSearch && matchesFilter;
  });

  // Funkcja przypisania mentora
  const handleAssignMentor = (menteeId: string, mentorId: string) => {
    onAssignMentor(menteeId, mentorId);
    setShowAssignModal(false);
  };

  // Funkcja planowania sesji
  const handleScheduleSession = () => {
    const sessionData: Partial<MentorshipSession> = {
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

  // Funkcja obliczania statystyk
  const getStats = () => {
    const totalMentors = allMentors.length;
    const activeMentors = allMentors.filter(m => m.activeMentees > 0).length;
    const totalMentees = allMentees.length;
    const activeMentees = allMentees.filter(m => m.status === 'active').length;
    const averageProgress = allMentees.reduce((sum, m) => sum + m.progressScore, 0) / allMentees.length;
    const completedSessions = allMentors.reduce((sum, m) => sum + m.completedSessions, 0);

    return {
      totalMentors,
      activeMentors,
      totalMentees,
      activeMentees,
      averageProgress,
      completedSessions
    };
  };

  const stats = getStats();

  return (
    <div className="space-y-6">
      {/* Nawigacja */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: 'overview', label: 'Przegląd', icon: TrendingUp },
          { id: 'mentors', label: 'Mentorzy', icon: Users },
          { id: 'mentees', label: 'Uczniowie', icon: BookOpen },
          { id: 'sessions', label: 'Sesje', icon: Calendar }
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

      {/* Tab: Przegląd */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Statystyki */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.totalMentors}</div>
                  <div className="text-sm text-gray-400">Mentorzy</div>
                  <div className="text-xs text-green-400">{stats.activeMentors} aktywnych</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.totalMentees}</div>
                  <div className="text-sm text-gray-400">Uczniowie</div>
                  <div className="text-xs text-green-400">{stats.activeMentees} aktywnych</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                  <Target className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.averageProgress.toFixed(0)}%</div>
                  <div className="text-sm text-gray-400">Średni postęp</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.completedSessions}</div>
                  <div className="text-sm text-gray-400">Sesje ukończone</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <Heart className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">4.7</div>
                  <div className="text-sm text-gray-400">Średnia ocena</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">85%</div>
                  <div className="text-sm text-gray-400">Wskaźnik sukcesu</div>
                </div>
              </div>
            </div>
          </div>

          {/* Najlepsi mentorzy */}
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Najlepsi mentorzy</h3>
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
                      <div className="text-xs text-gray-400">{mentor.completedSessions} sesji</div>
                    </div>
                    <div className="text-2xl font-bold text-purple-400">#{index + 1}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Nadchodzące sesje */}
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Nadchodzące sesje</h3>
              <button
                onClick={() => setShowSessionModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Zaplanuj sesję
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
                        <div className="text-sm text-gray-400">z {mentor?.username}</div>
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

      {/* Tab: Mentorzy */}
      {activeTab === 'mentors' && (
        <div className="space-y-4">
          {/* Nagłówek z wyszukiwarką */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Szukaj mentorów..."
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
                <option value="all">Wszyscy</option>
                <option value="active">Aktywni</option>
                <option value="available">Dostępni</option>
              </select>
            </div>
            
            <button
              onClick={() => setShowAssignModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Przypisz mentora
            </button>
          </div>

          {/* Lista mentorów */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                      {mentor.isAvailable ? 'Dostępny' : 'Niedostępny'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
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
                    <div className="text-xs text-gray-400">Aktywni uczniowie</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">{mentor.completedSessions}</div>
                    <div className="text-xs text-gray-400">Sesje</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">{mentor.experience}</div>
                    <div className="text-xs text-gray-400">Mies. doświadczenia</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => setSelectedMentor(mentor)}
                    className="flex-1 px-3 py-2 bg-gray-700/50 text-gray-300 rounded-lg hover:bg-gray-600/50 transition-colors text-sm"
                  >
                    Szczegóły
                  </button>
                  <button
                    disabled={!mentor.isAvailable || mentor.activeMentees >= mentor.maxMentees}
                    className="flex-1 px-3 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Przypisz
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Uczniowie */}
      {activeTab === 'mentees' && (
        <div className="space-y-4">
          {/* Nagłówek z wyszukiwarką */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Szukaj uczniów..."
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
                <option value="all">Wszyscy</option>
                <option value="active">Aktywni</option>
                <option value="completed">Ukończeni</option>
                <option value="paused">Wstrzymani</option>
              </select>
            </div>
          </div>

          {/* Lista uczniów */}
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
                            {mentee.status === 'active' ? 'Aktywny' :
                             mentee.status === 'completed' ? 'Ukończony' : 'Wstrzymany'}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-400 mb-2">
                          Mentor: {mentor?.username || 'Brak mentora'}
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(mentee.startDate).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {mentee.totalSessions} sesji
                          </span>
                          <span className="flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            {mentee.completedGoals.length} celów ukończonych
                          </span>
                        </div>

                        {/* Pasek postępu */}
                        <div className="mb-3">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-gray-400">Postęp</span>
                            <span className="text-sm font-medium text-white">{mentee.progressScore}%</span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${mentee.progressScore}%` }}
                            />
                          </div>
                        </div>

                        {/* Aktualne cele */}
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-gray-300">Aktualne cele:</div>
                          <div className="flex flex-wrap gap-1">
                            {mentee.currentGoals.map(goal => (
                              <span key={goal} className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-full">
                                {goal}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Akcje */}
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

                  {/* Następna sesja */}
                  {mentee.nextSessionDate && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-green-400" />
                        <span className="text-gray-400">Następna sesja:</span>
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

      {/* Modal: Planowanie sesji */}
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
              <h3 className="text-lg font-semibold text-white mb-4">Zaplanuj sesję</h3>
              
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
                    <option value="">Wybierz mentora</option>
                    {allMentors.map(mentor => (
                      <option key={mentor.id} value={mentor.id}>
                        {mentor.username}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Uczeń
                  </label>
                  <select
                    value={newSession.menteeId}
                    onChange={(e) => setNewSession({...newSession, menteeId: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Wybierz ucznia</option>
                    {allMentees.map(mentee => (
                      <option key={mentee.id} value={mentee.id}>
                        {mentee.username}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Data i godzina
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
                    Czas trwania (minuty)
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
                    Temat sesji
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
                    Zaplanuj
                  </button>
                  <button
                    onClick={() => setShowSessionModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-700/50 text-gray-400 rounded-lg hover:bg-gray-600/50 transition-colors"
                  >
                    Anuluj
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