
import React from 'react';
import { Chat, User } from '../types';
import { Search, Settings, UserPlus, Phone, Hash, Mic, Gamepad2, Trash2, Users, Plus, XCircle } from 'lucide-react';

interface SidebarProps {
  chats: Chat[];
  currentUser: User;
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onOpenProfile: () => void;
  className?: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  otherUsers: User[]; 
  onStartChat: (user: User) => void;
  onOpenGame: () => void;
  onDeleteChat: (chatId: string) => void;
  onCreateGroup: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  chats, 
  currentUser,
  selectedChatId, 
  onSelectChat, 
  onOpenProfile,
  className = '',
  searchQuery,
  onSearchChange,
  otherUsers,
  onStartChat,
  onOpenGame,
  onDeleteChat,
  onCreateGroup
}) => {
  
  const formatTime = (date: Date | any | undefined) => {
    if (!date) return '';
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      if (isNaN(d.getTime())) return '';
      // Check if it's today
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
          return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      }
      // Check if it's this year
      if (d.getFullYear() === now.getFullYear()) {
          return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      }
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric', year: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const getPreviewText = (chat: Chat) => {
      if (chat.isTyping) {
          return <span className="text-violet-500 dark:text-violet-400 animate-pulse font-medium">Печатает...</span>;
      }
      if (!chat.lastMessage) {
          return <span className="italic opacity-50">{chat.isGroup ? 'Группа создана' : 'Начните общение'}</span>;
      }
      const msg = chat.lastMessage;
      
      let senderPrefix = '';
      if (chat.isGroup && msg.senderId !== currentUser.id) {
          const sender = chat.participants.find(p => p.id === msg.senderId);
          if (sender) senderPrefix = `${sender.name.split(' ')[0]}: `;
      }

      if (msg.attachments && msg.attachments.length > 0) {
          const lastAtt = msg.attachments[0];
          let content = 'Файл';
          let Icon = Plus;
          if (lastAtt.type === 'audio') { content = 'Голосовое'; Icon = Mic; }
          if (lastAtt.type === 'image') { content = 'Фото'; Icon = Plus; } // Simplified icon logic
          if (lastAtt.type === 'video') { content = 'Видео'; Icon = Plus; }
          
          return (
              <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
                  {senderPrefix}
                  {lastAtt.type === 'audio' && <Mic size={12} />} 
                  {content}
              </span>
          );
      }
      return <span className="truncate group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">{senderPrefix}{msg.text}</span>;
  };

  // Filter existing chats based on search query
  const filteredChats = chats.filter(chat => {
      if (!searchQuery) return true;
      const lowerQ = searchQuery.toLowerCase();
      if (chat.isGroup) {
          return chat.groupName?.toLowerCase().includes(lowerQ);
      }
      const participant = chat.participants.find(p => p.id !== currentUser.id);
      return participant?.name.toLowerCase().includes(lowerQ);
  });

  return (
    <div className={`flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800 h-full transition-all duration-300 ${className}`}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between sticky top-0 z-20 bg-inherit/80 backdrop-blur-md">
        <div 
          className="flex items-center gap-3 cursor-pointer group select-none"
          onClick={onOpenProfile}
        >
           <div className="relative transform transition-transform duration-300 group-hover:scale-105">
             {currentUser.avatar ? (
                <img 
                  src={currentUser.avatar} 
                  alt="Profile" 
                  className="w-11 h-11 rounded-full object-cover border-2 border-violet-600/50 group-hover:border-violet-600 transition-colors shadow-sm"
                />
             ) : (
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <span className="text-white font-bold text-lg">{currentUser.name.charAt(0)}</span>
                </div>
             )}
             <div className="absolute -bottom-0.5 -right-0.5 bg-white dark:bg-slate-900 rounded-full p-1 border border-slate-100 dark:border-slate-800">
                <Settings size={10} className="text-slate-500 dark:text-slate-400" />
             </div>
           </div>
           
           <div className="flex flex-col">
             <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white leading-none">Lumini</span>
             <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors uppercase tracking-wider mt-1">
                 {currentUser.isOnline ? 'Online' : 'Offline'}
             </span>
           </div>
        </div>
        
        <div className="flex items-center gap-1">
            <button 
                onClick={onOpenGame}
                className="p-2.5 text-slate-400 hover:text-violet-500 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all rounded-full active:scale-95" 
            >
               <Gamepad2 size={20} />
            </button>
            <button 
                onClick={onCreateGroup}
                className="p-2.5 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-full transition-all active:scale-95"
                title="Создать группу"
            >
               <Users size={20} />
            </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="relative group">
          <input 
            type="text" 
            placeholder="Поиск..." 
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-800/50 text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-500 rounded-2xl py-2.5 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all border border-transparent focus:border-violet-500/30 focus:bg-white dark:focus:bg-slate-800"
          />
          <Search className="absolute left-3.5 top-3 text-slate-400 dark:text-slate-500 group-focus-within:text-violet-500 transition-colors duration-300" size={18} />
          {searchQuery && (
              <button 
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 animate-zoom-in"
              >
                  <XCircle size={16} />
              </button>
          )}
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 py-2 custom-scrollbar">
        {filteredChats.length > 0 ? (
          filteredChats.map((chat, index) => {
            let displayName = 'Chat';
            let displayAvatar = '';
            let isOnline = false;

            if (chat.isGroup) {
                displayName = chat.groupName || 'Группа';
                displayAvatar = chat.groupAvatar || '';
            } else {
                const participant = chat.participants.find(p => p.id !== currentUser.id) || chat.participants[0];
                displayName = participant?.name || 'Пользователь';
                displayAvatar = participant?.avatar || '';
                isOnline = participant?.isOnline || false;
            }

            const isSelected = selectedChatId === chat.id;
            
            return (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`group flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-200 relative pr-4 animate-fade-in-up ${
                  isSelected 
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20 transform scale-[1.02]' 
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent hover:scale-[1.01]'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="relative flex-shrink-0">
                  <img 
                    src={displayAvatar || 'https://via.placeholder.com/150'} 
                    alt={displayName} 
                    className={`w-12 h-12 rounded-full object-cover border-2 transition-all ${isSelected ? 'border-white/30' : 'border-slate-100 dark:border-slate-700 group-hover:border-violet-200 dark:group-hover:border-slate-600'}`}
                  />
                  {!chat.isGroup && isOnline && (
                    <span className={`absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 ${isSelected ? 'border-violet-600 bg-emerald-300' : 'border-white dark:border-slate-900 bg-emerald-500'}`}></span>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                      {displayName}
                    </h3>
                    {chat.lastMessage && (
                      <span className={`text-[10px] font-medium flex-shrink-0 ml-2 ${isSelected ? 'text-violet-200' : 'text-slate-400 group-hover:text-slate-500'}`}>
                        {formatTime(chat.lastMessage.timestamp)}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <p className={`text-sm truncate mr-2 ${isSelected ? 'text-violet-100' : 'text-slate-500 dark:text-slate-400'} ${chat.unreadCount > 0 && !isSelected ? 'font-semibold text-slate-800 dark:text-white' : ''}`}>
                      {getPreviewText(chat)}
                    </p>
                    {chat.unreadCount > 0 && (
                        <div className={`text-[10px] font-bold h-5 min-w-[1.25rem] px-1.5 flex items-center justify-center rounded-full shadow-sm animate-zoom-in ${isSelected ? 'bg-white text-violet-600' : 'bg-violet-600 text-white'}`}>
                            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </div>
                    )}
                  </div>
                </div>

                {/* Delete Button - Only visible on hover and not selected */}
                {!isSelected && (
                  <button
                      onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChat(chat.id);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm scale-90 hover:scale-100"
                      title="Удалить чат"
                  >
                      <Trash2 size={16} />
                  </button>
                )}
              </div>
            );
          })
        ) : (
             searchQuery && otherUsers.length === 0 && (
                <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm animate-fade-in-up">
                    <p>Чатов не найдено</p>
                </div>
             )
        )}

        {/* Global Search Results */}
        {searchQuery && otherUsers.length > 0 && (
          <div className="animate-fade-in-up">
            <div className="px-3 pt-4 pb-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
               <Search size={10} />
               <span>Глобальный поиск</span>
            </div>
            {otherUsers.map((user, i) => (
              <div
                key={user.id}
                onClick={() => onStartChat(user)}
                className="group flex items-center gap-3 p-3 rounded-2xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent transition-all duration-200 hover:scale-[1.01]"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="relative flex-shrink-0">
                  <img 
                    src={user.avatar || 'https://via.placeholder.com/150'} 
                    alt={user.name} 
                    className="w-12 h-12 rounded-full object-cover border-2 border-slate-100 dark:border-slate-700 group-hover:border-violet-200 dark:group-hover:border-slate-600"
                  />
                </div>
                
                <div className="flex-1 min-w-0 flex justify-between items-center">
                   <div className="min-w-0">
                     <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                        {user.name}
                     </h3>
                     <div className="flex items-center gap-2 text-xs text-slate-500">
                        {user.uniqueCode && (
                            <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-700/50 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium">
                                <Hash size={8} />
                                <span>{user.uniqueCode}</span>
                            </div>
                        )}
                        {user.phoneNumber && (
                             <span className="opacity-70">{user.phoneNumber}</span>
                        )}
                     </div>
                   </div>
                   <div className="p-2 bg-slate-100 dark:bg-slate-700/50 rounded-full text-slate-400 group-hover:bg-violet-600 group-hover:text-white transition-all transform group-hover:rotate-90">
                      <UserPlus size={18} />
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
