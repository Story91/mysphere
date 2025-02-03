'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { 
  searchUsers, 
  createChat, 
  sendMessage, 
  getMessages, 
  getUserChats,
  getFriendsList,
  sendFriendRequest,
  checkFriendship,
  getSentFriendRequests
} from '../../utils/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import FriendsPanel from '../FriendsPanel/FriendsPanel';

type ThemeMode = 'auto' | 'light' | 'dark';
type ThemeStyle = 'base' | 'cyberpunk' | 'hacker';

interface FirebaseUser {
  id: string;
  name?: string;
  address?: string;
  isBaseName?: boolean;
  baseChatPoints?: number;
  avatar?: string;
}

interface User {
  id: string;
  name: string;
  address: string;
  isBaseName: boolean;
  baseChatPoints?: number;
  avatar?: string;
  isFriend?: boolean;
  friendRequestStatus?: 'none' | 'pending';
}

export default function DirectMessages() {
  const { address } = useAccount();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [friendsList, setFriendsList] = useState<User[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [userChats, setUserChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [localMode, setLocalMode] = useState<ThemeMode>('auto');
  const [localStyle, setLocalStyle] = useState<ThemeStyle>('base');
  const [visibleUsers, setVisibleUsers] = useState(20);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showRecentChats, setShowRecentChats] = useState(false);
  const [messageUsers, setMessageUsers] = useState<{[key: string]: any}>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get background and text colors based on theme
  const getThemeColors = () => {
    if (localStyle === 'base') {
      return {
        bg: 'bg-[#0F172A]',
        bgSecondary: 'bg-[#1E293B]',
        text: 'text-white',
        textMuted: 'text-white/70',
      };
    }
    if (localStyle === 'cyberpunk') {
      return {
        bg: 'bg-black',
        bgSecondary: 'bg-[#FF00FF]/10',
        text: 'text-[#00FF00]',
        textMuted: 'text-[#00FF00]/70',
      };
    }
    if (localStyle === 'hacker') {
      return {
        bg: 'bg-black',
        bgSecondary: 'bg-green-900/20',
        text: 'text-green-500',
        textMuted: 'text-green-500/70',
      };
    }
    return {
      bg: 'bg-[#0F172A]',
      bgSecondary: 'bg-[#1E293B]',
      text: 'text-white',
      textMuted: 'text-white/70',
    };
  };

  const colors = getThemeColors();

  // Funkcja do sortowania użytkowników z priorytetyzacją wyszukiwania
  const sortUsers = (users: User[], query: string = '') => {
    return [...users].sort((a, b) => {
      // Jeśli jest fraza wyszukiwania, najpierw pokazujemy pasujące wyniki
      if (query) {
        const aStartsWithQuery = a.name.toLowerCase().startsWith(query.toLowerCase());
        const bStartsWithQuery = b.name.toLowerCase().startsWith(query.toLowerCase());
        const aContainsQuery = a.name.toLowerCase().includes(query.toLowerCase());
        const bContainsQuery = b.name.toLowerCase().includes(query.toLowerCase());

        // Priorytet 1: Zaczyna się od frazy
        if (aStartsWithQuery && !bStartsWithQuery) return -1;
        if (!aStartsWithQuery && bStartsWithQuery) return 1;

        // Priorytet 2: Zawiera frazę
        if (aContainsQuery && !bContainsQuery) return -1;
        if (!aContainsQuery && bContainsQuery) return 1;
      }

      // Domyślne sortowanie alfabetyczne
      return a.name.localeCompare(b.name);
    });
  };

  // Obsługa infinite scroll
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        setVisibleUsers(prev => prev + 20);
      }
    }
  };

  // Funkcja do losowego wybierania 10 użytkowników
  const getRandomUsers = (users: User[]) => {
    const shuffled = [...users].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 10);
  };

  // Funkcja generująca unikalny gradient na podstawie adresu/nazwy
  const generateGradient = (input: string) => {
    const hash = input.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    const hue1 = hash % 360;
    const hue2 = (hue1 + 40) % 360;
    const hue3 = (hue2 + 40) % 360;
    
    return `linear-gradient(135deg, hsl(${hue1}, 80%, 60%), hsl(${hue2}, 80%, 60%), hsl(${hue3}, 80%, 60%))`;
  };

  // Now dodaję useEffect do pobierania listy znajomych
  useEffect(() => {
    if (!address) return;
    const loadFriends = async () => {
      try {
         const friends = await getFriendsList(address);
         const mapped = (friends as any[]).map(friend => ({
           id: friend.id,
           name: friend.name || friend.id.slice(0,6) + '...',
           address: friend.address || friend.id,
           isFriend: true,
           isBaseName: false,
           avatar: friend.avatar
         })) as User[];
         setFriendsList(mapped);
      } catch (err) {
         console.error('Błąd pobierania listy znajomych:', err);
      }
    };
    loadFriends();
  }, [address]);

  // Funkcja wysyłania zaproszenia do znajomych
  const handleSendFriendRequest = async (user: User) => {
    if (!address) return;
    try {
      console.log('Sending friend request to:', user.address);
      const requestId = await sendFriendRequest(address, user.address);
      console.log('Friend request sent with ID:', requestId);
      
      // Aktualizuj stan searchResults, aby pokazać status "pending"
      setSearchResults(prevResults => 
        prevResults.map(result => 
          result.id === user.id 
            ? { ...result, friendRequestStatus: 'pending' }
            : result
        )
      );

      // Odśwież statusy wszystkich użytkowników
      await refreshUserStatuses();

      // Wyślij event do FriendsPanel aby odświeżyć listę wysłanych zaproszeń
      const event = new CustomEvent('refreshFriendRequests', {
        detail: { requestId, from: address, to: user.address }
      });
      document.dispatchEvent(event);

    } catch (error) {
      console.error('Error sending friend request:', error);
      if (error instanceof Error && error.message === 'Users are already friends') {
        // Jeśli użytkownicy są już znajomymi, zaktualizuj stan
        setSearchResults(prevResults => 
          prevResults.map(result => 
            result.id === user.id 
              ? { ...result, isFriend: true, friendRequestStatus: undefined }
              : result
          )
        );
      } else {
        // Pokaż błąd użytkownikowi
        alert(error instanceof Error ? error.message : 'Error sending friend request');
      }
    }
  };

  // Funkcja inicjująca czat tylko dla zaakceptowanych znajomych
  const startChatIfFriend = async (user: User) => {
    if (!user.isFriend) {
      alert('You need to send and accept friend request first!');
      return;
    }
    startChat(user.address);
  };

  // Modyfikuję funkcję handleSearch, dodając lepsze sprawdzanie statusu
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    try {
      const results = await searchUsers(query);
      const baseUsers = await Promise.all(
        results
          .filter(user => 
            user.address !== address && 
            (query === '' || 
             user.name?.toLowerCase().includes(query.toLowerCase()) ||
             user.address?.toLowerCase().includes(query.toLowerCase()))
          )
          .map(async (user: FirebaseUser) => {
            // Sprawdź czy są znajomymi
            const isFriend = address ? await checkFriendship(address, user.address || user.id) : false;
            
            // Sprawdź status zaproszenia tylko jeśli nie są znajomymi
            let friendRequestStatus: 'none' | 'pending' = 'none';
            if (!isFriend && address) {
              const sentRequests = await getSentFriendRequests(address);
              const isPending = sentRequests.some(req => req.to === (user.address || user.id));
              if (isPending) {
                friendRequestStatus = 'pending';
              }
            }

            const displayName = user.name || (user.address || user.id).slice(0, 6) + '...' + (user.address || user.id).slice(-4);
            const userAddress = user.address || user.id;
            
            return {
              id: user.id,
              name: displayName,
              address: userAddress,
              isFriend,
              friendRequestStatus,
              isBaseName: user.isBaseName || false,
              baseChatPoints: user.baseChatPoints || 0,
              avatar: user.avatar,
            } as User;
          })
      );
      
      const sortedUsers = query ? sortUsers(baseUsers, query) : getRandomUsers(baseUsers);
      setSearchResults(sortedUsers.slice(0, 10));
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    }
  };

  // Pobierz użytkowników Base przy pierwszym załadowaniu
  useEffect(() => {
    const fetchBaseUsers = async () => {
      const results = await searchUsers('');
      const baseUsers = await Promise.all(
        results
          .filter(user => 
            user.address !== address && 
            (user.name?.toLowerCase().includes('.base') || 
             user.name?.toLowerCase().includes('.base.eth') ||
             user.isBaseName)
          )
          .map(async (user, index) => {
            // Pobierz pełne dane użytkownika z Firebase
            const userRef = doc(db, 'users', user.address);
            const userDoc = await getDoc(userRef);
            const userData = userDoc.data();
            
            // Sprawdź czy są znajomymi
            const isFriend = address ? await checkFriendship(address, user.address) : false;
            
            // Sprawdź status zaproszenia tylko jeśli nie są znajomymi
            let friendRequestStatus: 'none' | 'pending' = 'none';
            if (!isFriend && address) {
              const sentRequests = await getSentFriendRequests(address);
              const isPending = sentRequests.some(req => req.to === user.address);
              if (isPending) {
                friendRequestStatus = 'pending';
              }
            }
            
            return {
              ...user,
              isFriend,
              friendRequestStatus,
              rank: index + 1,
              avatar: userData?.avatar || null
            };
          })
      );
      
      // Losowo wybierz 10 użytkowników
      setSearchResults(getRandomUsers(baseUsers));
    };
    fetchBaseUsers();

    // Dodaj interwał do odświeżania co 30 sekund
    const interval = setInterval(fetchBaseUsers, 30000);
    return () => clearInterval(interval);
  }, [address]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Rozpoczęcie czatu z użytkownikiem
  const startChat = async (userId: string) => {
    if (!address) return;
    setLoading(true);
    try {
      const chatId = await createChat(address, userId);
      setSelectedChat(chatId);
      const chatMessages = await getMessages(chatId);
      setMessages(chatMessages);
      setSearchQuery('');
    } catch (error) {
      console.error('Błąd podczas tworzenia czatu:', error);
    }
    setLoading(false);
  };

  // Dodaj funkcję do scrollowania na dół
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Modyfikacja useEffect dla wiadomości
  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedChat) return;
      try {
        const chatMessages = await getMessages(selectedChat);
        setMessages(chatMessages);
        
        // Pobierz dane wszystkich użytkowników z wiadomości
        const uniqueUsers = Array.from(new Set(chatMessages.map(msg => msg.sender)));
        await Promise.all(uniqueUsers.map(getUserData));
        
        // Scroll na dół po załadowaniu wiadomości
        scrollToBottom();
      } catch (error) {
        console.error('Błąd podczas pobierania wiadomości:', error);
      }
    };
    fetchMessages();
  }, [selectedChat]);

  // Modyfikacja funkcji wysyłania wiadomości
  const handleSendMessage = async () => {
    if (!address || !selectedChat || !newMessage.trim()) return;
    
    try {
      await sendMessage(selectedChat, {
        sender: address,
        content: newMessage.trim()
      });
      setNewMessage('');
      // Odśwież wiadomości
      const updatedMessages = await getMessages(selectedChat);
      setMessages(updatedMessages);
      // Scroll na dół po wysłaniu wiadomości
      scrollToBottom();
    } catch (error) {
      console.error('Błąd podczas wysyłania wiadomości:', error);
    }
  };

  const formatMessageDate = (timestamp: number) => {
    const messageDate = new Date(timestamp);
    const now = new Date();
    
    // Sprawdzamy czy wiadomość jest z dzisiaj
    const isToday = messageDate.toDateString() === now.toDateString();
    
    // Sprawdzamy czy wiadomość jest z wczoraj
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = messageDate.toDateString() === yesterday.toDateString();
    
    // Formatujemy godzinę
    const hours = messageDate.getHours().toString().padStart(2, '0');
    const minutes = messageDate.getMinutes().toString().padStart(2, '0');
    const time = `${hours}:${minutes}`;
    
    if (isToday) {
      return time;
    } else if (isYesterday) {
      return `Yesterday, ${time}`;
    } else {
      const day = messageDate.getDate().toString().padStart(2, '0');
      const month = (messageDate.getMonth() + 1).toString().padStart(2, '0');
      const year = messageDate.getFullYear();
      return `${day}.${month}.${year}, ${time}`;
    }
  };

  // Pobierz czaty użytkownika
  useEffect(() => {
    const fetchChats = async () => {
      if (!address) return;
      try {
        const chats = await getUserChats(address);
        
        // Pobierz dane użytkowników dla każdego czatu
        const chatsWithUserData = await Promise.all(
          chats.map(async (chat) => {
            const otherParticipant = chat.participants?.find((p: string) => p !== address);
            if (!otherParticipant) return chat;

            // Pobierz dane użytkownika z Firebase
            const userRef = doc(db, 'users', otherParticipant);
            const userDoc = await getDoc(userRef);
            const userData = userDoc.data();

            return {
              ...chat,
              participantData: {
                id: otherParticipant,
                name: userData?.name || `${otherParticipant.slice(0, 6)}...${otherParticipant.slice(-4)}`,
                avatar: userData?.avatar
              }
            };
          })
        );
        
        setUserChats(chatsWithUserData || []);
      } catch (error) {
        console.error('Error fetching chats:', error);
      }
    };
    fetchChats();
  }, [address, messages]);

  // Dodajemy funkcję do pobierania danych użytkownika
  const getUserData = async (userAddress: string) => {
    if (messageUsers[userAddress]) return messageUsers[userAddress];
    
    const userRef = doc(db, 'users', userAddress);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data();
    
    setMessageUsers(prev => ({
      ...prev,
      [userAddress]: {
        name: userData?.name || `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`,
        avatar: userData?.avatar
      }
    }));
    
    return userData;
  };

  // Funkcja do odświeżania statusów użytkowników
  const refreshUserStatuses = async () => {
    if (!address) return;
    
    const updatedResults = await Promise.all(
      searchResults.map(async user => {
        const isFriend = await checkFriendship(address, user.address);
        return {
          ...user,
          isFriend,
          friendRequestStatus: isFriend ? undefined : 'none'
        } as User;
      })
    );
    
    setSearchResults(updatedResults);
  };

  const ThemeControls = () => (
    <div className="mb-4">
      <select 
        value={localStyle}
        onChange={(e) => setLocalStyle(e.target.value as ThemeStyle)}
        className="w-full p-2 rounded-xl bg-black/50 backdrop-blur-xl border border-[#0052FF]/20 text-[#0052FF] hover:border-[#0052FF]/50 transition-all"
      >
        <option value="base">Base Theme</option>
        <option value="cyberpunk">Cyberpunk Theme</option>
        <option value="hacker">Hacker Theme</option>
      </select>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-180px)]">
      {/* Lewy panel z czatami i sugerowanymi użytkownikami */}
      <div className="w-[320px] border-r border-[#0052FF]/20 flex flex-col">
        {/* Nagłówek z kontrolkami motywu */}
        <div className="p-3 border-b border-[#0052FF]/20">
          <ThemeControls />
        </div>

        {/* Wyszukiwarka */}
        <div className="p-3 border-b border-[#0052FF]/20">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search users..."
            className={`w-full p-2 rounded-xl ${colors.bgSecondary} border border-[#0052FF]/20 ${colors.text} focus:outline-none focus:border-[#0052FF]`}
          />
        </div>

        {/* Recent Conversations */}
        <div className="p-3 border-b border-[#0052FF]/20">
          <button
            onClick={() => setShowRecentChats(!showRecentChats)}
            className={`w-full flex items-center justify-between text-xs uppercase tracking-wider font-semibold ${colors.textMuted} mb-2`}
          >
            <span>Recent Conversations</span>
            <span className="transform transition-transform duration-200" style={{ transform: showRecentChats ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              ▼
            </span>
          </button>
          {showRecentChats && (
            <div className="space-y-1.5">
              {userChats
                .filter(chat => {
                  return chat.participants?.find((p: string) => p !== address) && chat.lastMessage;
                })
                .map((chat) => {
                  const otherParticipant = chat.participants?.find((p: string) => p !== address);
                  
                  return (
                    <div
                      key={chat.id}
                      onClick={() => setSelectedChat(chat.id)}
                      className={`p-2 rounded-xl cursor-pointer transition-all duration-200 ${
                        selectedChat === chat.id
                          ? 'bg-[#0052FF] text-white'
                          : `${colors.bgSecondary} ${colors.text} hover:bg-[#0052FF]/10`
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium overflow-hidden">
                          {chat.participantData?.avatar ? (
                            <img 
                              src={chat.participantData.avatar}
                              alt={chat.participantData.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                target.parentElement!.textContent = chat.participantData?.name?.charAt(0) || otherParticipant?.slice(0, 2);
                              }}
                            />
                          ) : (
                            <div 
                              className="w-full h-full flex items-center justify-center text-white"
                              style={{ background: generateGradient(chat.participantData?.name || otherParticipant || '') }}
                            >
                              {chat.participantData?.name?.charAt(0) || otherParticipant?.slice(0, 2)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate text-sm">
                            {chat.participantData?.name}
                          </div>
                          <div className={`text-xs truncate ${selectedChat === chat.id ? 'text-white/70' : colors.textMuted}`}>
                            {chat.lastMessage}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Suggested Base Users and Search Results */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="p-3 border-b border-[#0052FF]/20">
            <div className={`text-xs uppercase tracking-wider font-semibold ${colors.textMuted}`}>
              {searchQuery ? 'Search Results' : 'Suggested Base Users'}
            </div>
          </div>
          <div 
            className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin scrollbar-thumb-[#0052FF]/20 scrollbar-track-transparent hover:scrollbar-thumb-[#0052FF]/40"
            ref={scrollRef}
            onScroll={handleScroll}
          >
            <div className="space-y-1.5">
              {(searchQuery ? searchResults : searchResults.slice(0, 10)).map((user) => (
                <div key={user.id} className={`p-2 rounded-xl ${colors.bgSecondary} ${colors.text} transition-all duration-200`}>
                  <div className="flex items-center space-x-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden">
                      {user.avatar ? (
                        <img 
                          src={user.avatar}
                          alt={user.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.parentElement!.textContent = user.name?.charAt(0) || user.address.slice(0, 2);
                          }}
                        />
                      ) : (
                        <div 
                          className="w-full h-full flex items-center justify-center text-white"
                          style={{ background: generateGradient(user.name || user.address) }}
                        >
                          {user.name?.charAt(0) || user.address.slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm">
                        {user.name?.includes('.base') || user.name?.includes('.base.eth') ? (
                          <span className="bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-transparent bg-clip-text">
                            {user.name || 'Unknown'}
                          </span>
                        ) : (
                          user.name || 'Unknown'
                        )}
                      </div>
                      <div 
                        className={`text-xs ${colors.textMuted} truncate cursor-pointer hover:text-[#0052FF]`}
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(user.address);
                        }}
                        title="Click to copy address"
                      >
                        {user.address ? `${user.address.slice(0, 6)}...${user.address.slice(-4)}` : 'No address'}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {user.isFriend ? (
                        <div className="px-2 py-1 text-xs rounded-xl text-green-500 border border-green-500">
                          Friends
                        </div>
                      ) : user.friendRequestStatus === 'pending' ? (
                        <div className="px-2 py-1 text-xs rounded-xl text-yellow-500 border border-yellow-500">
                          Pending
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            if (!user.isFriend) {
                              handleSendFriendRequest(user);
                            }
                          }}
                          className="px-2 py-1 text-xs rounded-xl text-[#0052FF] border border-[#0052FF] hover:bg-[#0052FF] hover:text-white transition-all duration-200"
                        >
                          Send Request
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Środkowy panel z czatem - zmniejszona wysokość */}
      <div className={`w-[calc(100%-640px)] flex flex-col ${colors.bg}`}>
        {selectedChat ? (
          <>
            {/* Chat messages - scrollowalne */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar scrollbar-w-1.5 scrollbar-track-[#1E293B] scrollbar-thumb-[#0052FF]/40 hover:scrollbar-thumb-[#0052FF]/60">
              <div className="flex flex-col space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex items-start gap-2 ${message.sender === address ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.sender !== address && (
                      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {messageUsers[message.sender]?.avatar ? (
                          <img 
                            src={messageUsers[message.sender].avatar}
                            alt={messageUsers[message.sender].name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div 
                            className="w-full h-full flex items-center justify-center text-white"
                            style={{ background: generateGradient(messageUsers[message.sender]?.name || message.sender) }}
                          >
                            {messageUsers[message.sender]?.name?.charAt(0) || message.sender.slice(0, 2)}
                          </div>
                        )}
                      </div>
                    )}
                    <div className={`flex flex-col max-w-[70%] ${message.sender === address ? 'items-end' : 'items-start'}`}>
                      <span className={`text-xs ${colors.textMuted} mb-0.5 flex items-center gap-2`}>
                        {message.sender === address ? 'You' : (messageUsers[message.sender]?.name || `${message.sender.slice(0, 6)}...${message.sender.slice(-4)}`)}
                        <span className="opacity-50">{formatMessageDate(message.timestamp)}</span>
                      </span>
                      <div
                        className={`p-2 rounded-xl ${
                          message.sender === address
                            ? 'bg-[#0052FF] text-white'
                            : `${colors.bgSecondary} ${colors.text}`
                        }`}
                      >
                        <span className="break-words text-sm">{message.content}</span>
                      </div>
                    </div>
                    {message.sender === address && (
                      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {messageUsers[message.sender]?.avatar ? (
                          <img 
                            src={messageUsers[message.sender].avatar}
                            alt="You"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div 
                            className="w-full h-full flex items-center justify-center text-white"
                            style={{ background: generateGradient('You') }}
                          >
                            Y
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} /> {/* Element do scrollowania */}
              </div>
            </div>

            {/* Message input - zawsze widoczne na dole */}
            <div className={`shrink-0 p-3 border-t border-[#0052FF]/20 ${colors.bg}`}>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex space-x-2"
              >
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className={`flex-1 p-2 h-[42px] rounded-xl ${colors.bgSecondary} border border-[#0052FF]/20 ${colors.text} focus:outline-none focus:border-[#0052FF]`}
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="px-4 h-[42px] bg-[#0052FF] text-white rounded-xl hover:bg-[#0052FF]/90 disabled:opacity-50 transition-all focus:outline-none text-sm"
                >
                  Send
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className={`text-lg font-medium ${colors.text}`}>
                Select a chat or start a new conversation
              </div>
              <div className={`mt-2 ${colors.textMuted}`}>
                You can only chat with friends
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Friends Panel */}
      <FriendsPanel 
        onFriendshipUpdate={refreshUserStatuses}
        onStartChat={(friendAddress) => {
          startChat(friendAddress);
        }}
      />
    </div>
  );
} 