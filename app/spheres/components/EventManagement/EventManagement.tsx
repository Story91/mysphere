'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import { toast } from 'react-hot-toast';
import { 
  Calendar, 
  Plus, 
  Users, 
  DollarSign, 
  Trophy,
  Clock,
  MapPin,
  Star,
  TrendingUp,
  Settings,
  Eye,
  Edit3,
  Trash2,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';

// Interfejsy
interface Event {
  id: string;
  title: string;
  description: string;
  creator: string;
  startDate: Date;
  endDate: Date;
  location: string;
  isVirtual: boolean;
  category: 'workshop' | 'conference' | 'meetup' | 'hackathon' | 'social' | 'other';
  price: number;
  maxParticipants: number;
  currentParticipants: number;
  status: 'draft' | 'published' | 'ongoing' | 'completed' | 'cancelled';
  requirements: string[];
  tags: string[];
  imageUrl?: string;
  rewards: {
    type: 'token' | 'nft' | 'badge' | 'points';
    amount: number;
    description: string;
  }[];
  participants: Participant[];
  totalRevenue: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Participant {
  id: string;
  address: string;
  username: string;
  avatar?: string;
  registeredAt: Date;
  paymentStatus: 'pending' | 'paid' | 'refunded';
  attendance: 'registered' | 'checked_in' | 'completed' | 'no_show';
  rating?: number;
  feedback?: string;
  rewardsReceived: boolean;
}

interface EventManagementProps {
  communityId: string;
  currentUserAddress: string;
  isCreator: boolean;
}

const EventManagement: React.FC<EventManagementProps> = ({
  communityId,
  currentUserAddress,
  isCreator
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'create' | 'participants' | 'analytics'>('overview');
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Formularz nowego eventu
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    location: '',
    isVirtual: false,
    category: 'workshop' as Event['category'],
    price: 0,
    maxParticipants: 50,
    requirements: [] as string[],
    tags: [] as string[],
    rewards: [] as Event['rewards']
  });

  // Przykładowe dane
  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      
      // Symulowane dane eventów
      const mockEvents: Event[] = [
        {
          id: '1',
          title: 'DeFi Workshop: Yield Farming Strategies',
          description: 'Kompleksowy warsztat na temat strategii yield farming w DeFi. Nauczysz się jak maksymalizować zyski przy minimalnym ryzyku.',
          creator: currentUserAddress,
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
          location: 'Virtual Event',
          isVirtual: true,
          category: 'workshop',
          price: 0.05,
          maxParticipants: 30,
          currentParticipants: 18,
          status: 'published',
          requirements: ['Podstawowa wiedza o DeFi', 'Portfel MetaMask'],
          tags: ['DeFi', 'Yield Farming', 'Blockchain'],
          rewards: [
            { type: 'token', amount: 100, description: 'Community tokens' },
            { type: 'badge', amount: 1, description: 'DeFi Expert Badge' }
          ],
          participants: [],
          totalRevenue: 0.9,
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        },
        {
          id: '2',
          title: 'NFT Art Showcase & Networking',
          description: 'Wystawa prac NFT członków społeczności z sesją networkingową. Prezentacja portfolio, feedback i możliwości współpracy.',
          creator: currentUserAddress,
          startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
          location: 'Community Center, Warsaw',
          isVirtual: false,
          category: 'social',
          price: 0,
          maxParticipants: 50,
          currentParticipants: 35,
          status: 'published',
          requirements: ['Portfolio NFT (opcjonalnie)'],
          tags: ['NFT', 'Art', 'Networking'],
          rewards: [
            { type: 'points', amount: 50, description: 'Social points' },
            { type: 'nft', amount: 1, description: 'Event commemorative NFT' }
          ],
          participants: [],
          totalRevenue: 0,
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000)
        },
        {
          id: '3',
          title: 'Blockchain Hackathon 2024',
          description: '48-godzinny hackathon z tematyk blockchain i Web3. Zespoły do 4 osób, mentoring, cenne nagrody.',
          creator: currentUserAddress,
          startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000),
          location: 'Tech Hub, Krakow',
          isVirtual: false,
          category: 'hackathon',
          price: 0.02,
          maxParticipants: 100,
          currentParticipants: 67,
          status: 'published',
          requirements: ['Doświadczenie programistyczne', 'Laptop', 'Zespół (opcjonalnie)'],
          tags: ['Hackathon', 'Blockchain', 'Web3', 'Programming'],
          rewards: [
            { type: 'token', amount: 1000, description: 'Winning team tokens' },
            { type: 'nft', amount: 1, description: 'Winner NFT' },
            { type: 'badge', amount: 1, description: 'Hackathon Participant Badge' }
          ],
          participants: [],
          totalRevenue: 1.34,
          createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        }
      ];

      setEvents(mockEvents);
      setLoading(false);
    };

    loadEvents();
  }, [communityId, currentUserAddress]);

  // Funkcja tworzenia eventu
  const handleCreateEvent = async () => {
    try {
      const eventData: Partial<Event> = {
        ...newEvent,
        id: Date.now().toString(),
        creator: currentUserAddress,
        startDate: new Date(newEvent.startDate),
        endDate: new Date(newEvent.endDate),
        currentParticipants: 0,
        status: 'draft',
        participants: [],
        totalRevenue: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      setEvents(prev => [...prev, eventData as Event]);
      setShowCreateModal(false);
      setNewEvent({
        title: '',
        description: '',
        startDate: '',
        endDate: '',
        location: '',
        isVirtual: false,
        category: 'workshop',
        price: 0,
        maxParticipants: 50,
        requirements: [],
        tags: [],
        rewards: []
      });
      
      toast.success('Event utworzony pomyślnie!');
    } catch (error) {
      toast.error('Błąd podczas tworzenia eventu');
    }
  };

  // Funkcja aktualizacji statusu eventu
  const handleUpdateEventStatus = async (eventId: string, newStatus: Event['status']) => {
    try {
      setEvents(prev => prev.map(event => 
        event.id === eventId ? { ...event, status: newStatus, updatedAt: new Date() } : event
      ));
      
      toast.success(`Status eventu zaktualizowany na: ${newStatus}`);
    } catch (error) {
      toast.error('Błąd podczas aktualizacji statusu');
    }
  };

  // Funkcja usuwania eventu
  const handleDeleteEvent = async (eventId: string) => {
    try {
      setEvents(prev => prev.filter(event => event.id !== eventId));
      if (selectedEvent?.id === eventId) {
        setSelectedEvent(null);
      }
      toast.success('Event usunięty pomyślnie');
    } catch (error) {
      toast.error('Błąd podczas usuwania eventu');
    }
  };

  // Funkcja formatowania daty
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Funkcja określająca kolor statusu
  const getStatusColor = (status: Event['status']) => {
    switch (status) {
      case 'draft': return 'text-gray-400 bg-gray-500/20';
      case 'published': return 'text-green-400 bg-green-500/20';
      case 'ongoing': return 'text-blue-400 bg-blue-500/20';
      case 'completed': return 'text-purple-400 bg-purple-500/20';
      case 'cancelled': return 'text-red-400 bg-red-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  // Funkcja określająca ikonę kategorii
  const getCategoryIcon = (category: Event['category']) => {
    switch (category) {
      case 'workshop': return <Settings className="w-4 h-4" />;
      case 'conference': return <Users className="w-4 h-4" />;
      case 'meetup': return <Calendar className="w-4 h-4" />;
      case 'hackathon': return <Trophy className="w-4 h-4" />;
      case 'social': return <Star className="w-4 h-4" />;
      default: return <Calendar className="w-4 h-4" />;
    }
  };

  // Obliczanie statystyk
  const getStats = () => {
    const totalEvents = events.length;
    const publishedEvents = events.filter(e => e.status === 'published').length;
    const ongoingEvents = events.filter(e => e.status === 'ongoing').length;
    const completedEvents = events.filter(e => e.status === 'completed').length;
    const totalParticipants = events.reduce((sum, e) => sum + e.currentParticipants, 0);
    const totalRevenue = events.reduce((sum, e) => sum + e.totalRevenue, 0);
    const avgParticipants = totalEvents > 0 ? totalParticipants / totalEvents : 0;

    return {
      totalEvents,
      publishedEvents,
      ongoingEvents,
      completedEvents,
      totalParticipants,
      totalRevenue,
      avgParticipants
    };
  };

  const stats = getStats();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Nagłówek */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Zarządzanie eventami
            </h1>
            <p className="text-gray-400">
              Twórz, zarządzaj i analizuj eventy społeczności
            </p>
          </div>
          
          {isCreator && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <Plus className="w-5 h-5" />
              Nowy event
            </button>
          )}
        </div>

        {/* Nawigacja */}
        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { id: 'overview', label: 'Przegląd', icon: TrendingUp },
            { id: 'events', label: 'Eventy', icon: Calendar },
            { id: 'participants', label: 'Uczestnicy', icon: Users },
            { id: 'analytics', label: 'Analityka', icon: DollarSign }
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{stats.totalEvents}</div>
                    <div className="text-sm text-gray-400">Wszystkie eventy</div>
                    <div className="text-xs text-green-400">{stats.publishedEvents} opublikowanych</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{stats.totalParticipants}</div>
                    <div className="text-sm text-gray-400">Uczestnicy</div>
                    <div className="text-xs text-blue-400">{stats.avgParticipants.toFixed(1)} średnio</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{stats.totalRevenue.toFixed(2)}</div>
                    <div className="text-sm text-gray-400">ETH przychód</div>
                    <div className="text-xs text-green-400">+15% w tym miesiącu</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{stats.completedEvents}</div>
                    <div className="text-sm text-gray-400">Ukończone</div>
                    <div className="text-xs text-purple-400">{stats.ongoingEvents} w trakcie</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Nadchodzące eventy */}
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Nadchodzące eventy</h3>
              <div className="space-y-3">
                {events.filter(e => e.status === 'published' && e.startDate > new Date()).slice(0, 3).map(event => (
                  <div key={event.id} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                        {getCategoryIcon(event.category)}
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">{event.title}</h4>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(event.startDate)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {event.currentParticipants}/{event.maxParticipants}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {event.isVirtual ? 'Virtual' : event.location}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(event.status)}`}>
                        {event.status}
                      </span>
                      <button
                        onClick={() => setSelectedEvent(event)}
                        className="p-2 hover:bg-gray-600/50 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Lista eventów */}
        {activeTab === 'events' && (
          <div className="space-y-4">
            {/* Filtry */}
            <div className="flex flex-wrap gap-2 mb-4">
              <select className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500">
                <option value="all">Wszystkie statusy</option>
                <option value="draft">Drafty</option>
                <option value="published">Opublikowane</option>
                <option value="ongoing">W trakcie</option>
                <option value="completed">Ukończone</option>
                <option value="cancelled">Anulowane</option>
              </select>
              <select className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500">
                <option value="all">Wszystkie kategorie</option>
                <option value="workshop">Warsztaty</option>
                <option value="conference">Konferencje</option>
                <option value="meetup">Spotkania</option>
                <option value="hackathon">Hackathony</option>
                <option value="social">Społeczne</option>
              </select>
            </div>

            {/* Lista eventów */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {events.map(event => (
                <div key={event.id} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                        {getCategoryIcon(event.category)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{event.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(event.status)}`}>
                            {event.status}
                          </span>
                          <span className="text-xs text-gray-400">{event.category}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedEvent(event)}
                        className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {isCreator && (
                        <>
                          <button
                            onClick={() => {/* Implementacja edycji */}}
                            className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(event.id)}
                            className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">{event.description}</p>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(event.startDate)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <MapPin className="w-4 h-4" />
                      <span>{event.isVirtual ? 'Virtual Event' : event.location}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Users className="w-4 h-4" />
                      <span>{event.currentParticipants}/{event.maxParticipants} uczestników</span>
                    </div>
                    {event.price > 0 && (
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <DollarSign className="w-4 h-4" />
                        <span>{event.price} ETH</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {event.tags.slice(0, 3).map((tag, index) => (
                        <span key={index} className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                    
                    {isCreator && event.status === 'draft' && (
                      <button
                        onClick={() => handleUpdateEventStatus(event.id, 'published')}
                        className="flex items-center gap-1 px-3 py-1 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm"
                      >
                        <Play className="w-3 h-3" />
                        Opublikuj
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal tworzenia eventu */}
        <AnimatePresence>
          {showCreateModal && (
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
                className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700"
              >
                <div className="p-6 space-y-6">
                  <h3 className="text-xl font-semibold text-white">Utwórz nowy event</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Tytuł eventu
                      </label>
                      <input
                        type="text"
                        value={newEvent.title}
                        onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
                        className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                        placeholder="Podaj tytuł eventu..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Opis
                      </label>
                      <textarea
                        value={newEvent.description}
                        onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
                        rows={3}
                        className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                        placeholder="Opisz szczegóły eventu..."
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Data rozpoczęcia
                        </label>
                        <input
                          type="datetime-local"
                          value={newEvent.startDate}
                          onChange={(e) => setNewEvent({...newEvent, startDate: e.target.value})}
                          className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Data zakończenia
                        </label>
                        <input
                          type="datetime-local"
                          value={newEvent.endDate}
                          onChange={(e) => setNewEvent({...newEvent, endDate: e.target.value})}
                          className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Lokalizacja
                      </label>
                      <input
                        type="text"
                        value={newEvent.location}
                        onChange={(e) => setNewEvent({...newEvent, location: e.target.value})}
                        className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                        placeholder="Podaj miejsce lub link do wydarzenia..."
                      />
                      <label className="flex items-center gap-2 mt-2">
                        <input
                          type="checkbox"
                          checked={newEvent.isVirtual}
                          onChange={(e) => setNewEvent({...newEvent, isVirtual: e.target.checked})}
                          className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-300">Event wirtualny</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Kategoria
                        </label>
                        <select
                          value={newEvent.category}
                          onChange={(e) => setNewEvent({...newEvent, category: e.target.value as Event['category']})}
                          className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="workshop">Warsztat</option>
                          <option value="conference">Konferencja</option>
                          <option value="meetup">Spotkanie</option>
                          <option value="hackathon">Hackathon</option>
                          <option value="social">Społeczne</option>
                          <option value="other">Inne</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Cena (ETH)
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          value={newEvent.price}
                          onChange={(e) => setNewEvent({...newEvent, price: parseFloat(e.target.value) || 0})}
                          className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Max uczestników
                        </label>
                        <input
                          type="number"
                          value={newEvent.maxParticipants}
                          onChange={(e) => setNewEvent({...newEvent, maxParticipants: parseInt(e.target.value) || 50})}
                          className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <button
                        onClick={handleCreateEvent}
                        className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
                      >
                        Utwórz event
                      </button>
                      <button
                        onClick={() => setShowCreateModal(false)}
                        className="flex-1 px-4 py-2 bg-gray-700/50 text-gray-400 rounded-lg hover:bg-gray-600/50 transition-colors"
                      >
                        Anuluj
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default EventManagement; 