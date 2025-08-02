'use client';

import React, { useState } from 'react';
import { Notification, NotificationType } from '../../utils/friends';
import { useSocial } from './hooks';

// ===============================================
// 🔔 NOTIFICATIONS VIEW COMPONENT
// ===============================================

interface NotificationsViewProps {
  currentUserAddress: string;
  onUserClick?: (userAddress: string) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  currentUserAddress,
  onUserClick
}) => {
  const { 
    notifications, 
    notificationsSummary, 
    unreadCount, 
    loading, 
    error,
    markNotificationAsRead,
    markAllNotificationsAsRead
  } = useSocial(currentUserAddress);

  const [filterType, setFilterType] = useState<NotificationType | 'all'>('all');
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);

  // Filter notifications
  const filteredNotifications = notifications.filter(notification => {
    if (filterType !== 'all' && notification.type !== filterType) return false;
    if (showOnlyUnread && notification.isRead) return false;
    return true;
  });

  // Get notification icon
  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'LIKE':
        return '❤️';
      case 'COMMENT':
        return '💬';
      case 'FOLLOW':
        return '👥';
      case 'FRIEND_REQUEST':
        return '🤝';
      case 'FRIEND_REQUEST_ACCEPTED':
        return '✅';
      case 'TIP_RECEIVED':
        return '💰';
      case 'POST_PINNED':
        return '📌';
      case 'ACHIEVEMENT':
        return '🏆';
      case 'SYSTEM':
        return '📢';
      default:
        return '🔔';
    }
  };

  // Get notification color
  const getNotificationColor = (type: NotificationType) => {
    switch (type) {
      case 'LIKE':
        return 'text-red-500';
      case 'COMMENT':
        return 'text-blue-500';
      case 'FOLLOW':
        return 'text-purple-500';
      case 'FRIEND_REQUEST':
      case 'FRIEND_REQUEST_ACCEPTED':
        return 'text-green-500';
      case 'TIP_RECEIVED':
        return 'text-yellow-500';
      case 'POST_PINNED':
        return 'text-indigo-500';
      case 'ACHIEVEMENT':
        return 'text-orange-500';
      case 'SYSTEM':
        return 'text-gray-500';
      default:
        return 'text-gray-500';
    }
  };

  // Handle notification click
  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if unread
    if (!notification.isRead) {
      await markNotificationAsRead(notification.id!);
    }

    // Handle action URL or user click
    if (notification.actionUrl) {
      // For now, just handle user clicks
      if (notification.fromUserId && onUserClick) {
        onUserClick(notification.fromUserId);
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading notifications...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-4">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">🔔 Notifications</h2>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold">{notificationsSummary?.total || 0}</div>
            <div className="text-blue-100">Total</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">{unreadCount}</div>
            <div className="text-blue-100">Unread</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">{notificationsSummary?.recent.length || 0}</div>
            <div className="text-blue-100">Recent</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Filters */}
          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as NotificationType | 'all')}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
                                <option value="all">All Types</option>
                  <option value="LIKE">Likes</option>
                  <option value="COMMENT">Comments</option>
                  <option value="FOLLOW">Follows</option>
                  <option value="FRIEND_REQUEST">Friend Requests</option>
                  <option value="TIP_RECEIVED">Tips</option>
                  <option value="SYSTEM">System</option>
            </select>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showOnlyUnread}
                onChange={(e) => setShowOnlyUnread(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Unread only
              </span>
            </label>
          </div>

          {/* Mark all as read button */}
          {unreadCount > 0 && (
            <button
              onClick={markAllNotificationsAsRead}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {/* Notifications list */}
      {filteredNotifications.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">
            No notifications
          </h3>
          <p className="text-gray-500">
            {showOnlyUnread 
                          ? 'All caught up!'
            : 'Start interacting to receive notifications!'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              className={`
                bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 
                hover:shadow-md transition-all cursor-pointer
                ${!notification.isRead ? 'border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}
              `}
            >
              <div className="flex items-start space-x-3">
                {/* Notification icon */}
                <div className={`text-2xl ${getNotificationColor(notification.type)}`}>
                  {getNotificationIcon(notification.type)}
                </div>

                {/* Notification content */}
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {notification.title}
                      </h4>
                      
                      <p className="text-gray-700 dark:text-gray-300 mt-1">
                        {notification.fromUserName && (
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            {notification.fromUserName}{' '}
                          </span>
                        )}
                        {notification.message}
                      </p>

                      <div className="flex items-center gap-4 mt-2">
                        <p className="text-xs text-gray-500">
                          {new Date(notification.createdAt).toLocaleString('en-US')}
                        </p>
                        
                        {!notification.isRead && (
                          <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-full">
                            New
                          </span>
                        )}
                      </div>
                    </div>

                    {/* User avatar if available */}
                    {notification.fromUserAvatar && (
                      <img
                        src={notification.fromUserAvatar}
                        alt={notification.fromUserName || 'User'}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more notifications */}
      {filteredNotifications.length > 0 && filteredNotifications.length % 20 === 0 && (
        <div className="text-center">
          <button className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
            Load More
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationsView;