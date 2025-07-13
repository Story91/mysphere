'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

interface EventManagementCardProps {
  community: {
    id: number;
    name: string;
    totalMembers: number;
  };
}

export default function EventManagementCard({ community }: EventManagementCardProps) {
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventFee, setEventFee] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Symulowane dane eventów (w rzeczywistej aplikacji pobierane z API)
  const events = [
    {
      id: 1,
      name: 'Web3 Workshop',
      description: 'Learn advanced Web3 development techniques',
      participants: 15,
      maxParticipants: 20,
      fee: 0.005,
      prizePool: 0.075,
      startDate: '2024-01-25',
      status: 'upcoming',
      type: 'workshop'
    },
    {
      id: 2,
      name: 'NFT Art Competition',
      description: 'Create and showcase your digital art',
      participants: 8,
      maxParticipants: 15,
      fee: 0.01,
      prizePool: 0.08,
      startDate: '2024-01-30',
      status: 'upcoming',
      type: 'competition'
    },
    {
      id: 3,
      name: 'Community Meetup',
      description: 'Monthly community gathering and networking',
      participants: 12,
      maxParticipants: 12,
      fee: 0.002,
      prizePool: 0.024,
      startDate: '2024-01-20',
      status: 'completed',
      type: 'meetup'
    }
  ];

  const handleCreateEvent = async () => {
    if (!eventName || !eventDescription || !eventFee || !maxParticipants || !eventDate) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsCreating(true);
    try {
      // Tutaj będzie implementacja tworzenia eventu z kontraktu
      await new Promise(resolve => setTimeout(resolve, 2000)); // Symulacja
      toast.success('Event created successfully!');
      setShowCreateEvent(false);
      setEventName('');
      setEventDescription('');
      setEventFee('');
      setMaxParticipants('');
      setEventDate('');
    } catch (error) {
      toast.error('Failed to create event');
    } finally {
      setIsCreating(false);
    }
  };

  const upcomingEvents = events.filter(event => event.status === 'upcoming');
  const totalRevenue = events.reduce((sum, event) => sum + event.prizePool, 0);
  const totalParticipants = events.reduce((sum, event) => sum + event.participants, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white">Event Management</h3>
        <button
          onClick={() => setShowCreateEvent(!showCreateEvent)}
          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg text-sm font-medium transition-all"
        >
          {showCreateEvent ? 'Cancel' : 'Create Event'}
        </button>
      </div>

      {/* Event Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-white/5 rounded-xl">
          <div className="text-lg font-bold text-green-400">{upcomingEvents.length}</div>
          <div className="text-xs text-gray-400">Upcoming</div>
        </div>
        <div className="text-center p-3 bg-white/5 rounded-xl">
          <div className="text-lg font-bold text-blue-400">{totalParticipants}</div>
          <div className="text-xs text-gray-400">Total Participants</div>
        </div>
        <div className="text-center p-3 bg-white/5 rounded-xl">
          <div className="text-lg font-bold text-purple-400">{totalRevenue.toFixed(3)}</div>
          <div className="text-xs text-gray-400">ETH Revenue</div>
        </div>
      </div>

      {/* Create Event Form */}
      {showCreateEvent && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10"
        >
          <h4 className="text-lg font-semibold text-white mb-4">Create New Event</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Event Name</label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Enter event name"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Description</label>
              <textarea
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                placeholder="Describe your event"
                rows={3}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Participation Fee (ETH)</label>
                <input
                  type="number"
                  value={eventFee}
                  onChange={(e) => setEventFee(e.target.value)}
                  placeholder="0.001"
                  step="0.001"
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Max Participants</label>
                <input
                  type="number"
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(e.target.value)}
                  placeholder="20"
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Event Date</label>
              <input
                type="datetime-local"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <button
              onClick={handleCreateEvent}
              disabled={isCreating}
              className={`w-full py-3 rounded-xl font-semibold transition-all ${
                isCreating
                  ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white'
              }`}
            >
              {isCreating ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </motion.div>
      )}

      {/* Event List */}
      <div className="space-y-3">
        <h4 className="text-lg font-semibold text-white">Recent & Upcoming Events</h4>
        {events.map((event, index) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="p-4 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <h5 className="font-semibold text-white">{event.name}</h5>
                <p className="text-sm text-gray-400">{event.description}</p>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  event.status === 'upcoming' ? 'bg-green-500/20 text-green-400' :
                  event.status === 'completed' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {event.status}
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(event.startDate).toLocaleDateString()}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-4 gap-4 mb-3">
              <div className="text-center">
                <div className="text-sm font-bold text-blue-400">{event.participants}</div>
                <div className="text-xs text-gray-400">Participants</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-purple-400">{event.maxParticipants}</div>
                <div className="text-xs text-gray-400">Max</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-green-400">{event.fee.toFixed(3)}</div>
                <div className="text-xs text-gray-400">Fee ETH</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-orange-400">{event.prizePool.toFixed(3)}</div>
                <div className="text-xs text-gray-400">Prize Pool</div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400">
                {event.type.charAt(0).toUpperCase() + event.type.slice(1)} • 
                {((event.participants / event.maxParticipants) * 100).toFixed(0)}% full
              </div>
              <div className="flex space-x-2">
                <button className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs transition-colors">
                  View
                </button>
                <button className="px-3 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-xs transition-colors">
                  Edit
                </button>
                {event.status === 'upcoming' && (
                  <button className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs transition-colors">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
} 