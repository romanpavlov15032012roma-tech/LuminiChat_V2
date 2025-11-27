
import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { AuthScreen } from './components/AuthScreen';
import { ProfileModal } from './components/ProfileModal';
import { SnakeGameModal } from './components/SnakeGameModal';
import { CreateGroupModal } from './components/CreateGroupModal';
import { FirebaseSetup } from './components/FirebaseSetup';
import { PermissionError } from './components/PermissionError';
import { Chat, Message, User, Attachment } from './types';
import { sendMessageToGemini } from './services/geminiService';
import { auth, db, isFirebaseConfigured } from './src/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  collection, query, where, onSnapshot, orderBy, 
  addDoc, doc, updateDoc, getDoc, getDocs, setDoc, Timestamp, deleteDoc 
} from 'firebase/firestore';
import { AI_USER, NOTIFICATION_SOUND } from './constants';

const THEME_KEY = 'lumini_theme';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showDevSetup, setShowDevSetup] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeMessages, setActiveMessages] = useState<Message[]>([]); 
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [isGameOpen, setIsGameOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [otherUsers, setOtherUsers] = useState<User[]>([]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
  }, []);

  const playNotificationSound = () => { try { new Audio(NOTIFICATION_SOUND).play().catch(e=>{}); } catch (e) {} };
  const sendNotification = (title: string, body: string) => { if (document.hidden) new Notification(title, { body, icon: '/vite.svg' }); playNotificationSound(); };

  useEffect(() => {
    if (!isFirebaseConfigured) { setLoading(false); return; }
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) setIsDarkMode(savedTheme === 'dark');
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
            const docRef = doc(db, "users", firebaseUser.uid);
            try {
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const userData = docSnap.data() as User;
                    await updateDoc(docRef, { isOnline: true, lastActive: Timestamp.now() });
                    setCurrentUser({ ...userData, isOnline: true });
                    ensureUserData(userData);
                    ensureAiChat(userData.id);
                } else {
                    const fallbackUser = { id: firebaseUser.uid, name: firebaseUser.displayName || 'User', avatar: firebaseUser.photoURL || '', isOnline: true, email: firebaseUser.email };
                    setCurrentUser(fallbackUser);
                    ensureUserData(fallbackUser);
                    ensureAiChat(firebaseUser.uid);
                }
            } catch (e: any) { if (e.code === 'permission-denied') setPermissionError(true); }
        } else { setCurrentUser(null); setChats([]); setActiveMessages([]); }
        setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
      if (!currentUser || !isFirebaseConfigured) return;
      const userRef = doc(db, "users", currentUser.id);
      updateDoc(userRef, { isOnline: true, lastActive: Timestamp.now() }).catch(() => {});
      const interval = setInterval(() => {
          updateDoc(userRef, { isOnline: true, lastActive: Timestamp.now() }).catch(() => {});
      }, 2 * 60 * 1000);
      return () => clearInterval(interval);
  }, [currentUser]);

  const ensureUserData = async (user: User) => {
      if (!user.uniqueCode) {
          try { await updateDoc(doc(db, "users", user.id), { uniqueCode: Math.floor(100000 + Math.random() * 900000).toString() }); } catch (e: any) { if (e.code === 'permission-denied') setPermissionError(true); else await setDoc(doc(db, "users", user.id), { ...user, uniqueCode: "123456" }); }
      }
  };
  const ensureAiChat = async (userId: string) => {
      try {
          const q = query(collection(db, "chats"), where("participantIds", "==", [userId, AI_USER.id]));
          const snap = await getDocs(q);
          if (snap.empty) {
              await addDoc(collection(db, "chats"), { participantIds: [userId, AI_USER.id], updatedAt: Timestamp.now(), lastMessage: { id: 'welcome', senderId: AI_USER.id, text: 'Привет! Я Lumini AI.', timestamp: Timestamp.now(), status: 'read' } });
          }
      } catch (e: any) { if (e.code === 'permission-denied') setPermissionError(true); }
  };
  useEffect(() => {
      if (isDarkMode) { document.documentElement.classList.add('dark'); localStorage.setItem(THEME_KEY, 'dark'); } 
      else { document.documentElement.classList.remove('dark'); localStorage.setItem(THEME_KEY, 'light'); }
  }, [isDarkMode]);
  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  useEffect(() => {
      if (!isFirebaseConfigured || !currentUser) return;
      const q = query(collection(db, "chats"), where("participantIds", "array-contains", currentUser.id));
      const unsubscribe = onSnapshot(q, async (snapshot) => {
          snapshot.docChanges().forEach((change) => {
              if (change.type === 'modified') {
                  const chatData = change.doc.data();
                  const lastMsg = chatData.lastMessage as Message | undefined;
                  if (lastMsg && lastMsg.senderId !== currentUser.id && (Math.abs(Date.now() - (lastMsg.timestamp?.toDate ? lastMsg.timestamp.toDate().getTime() : Date.now())) < 5000)) {
                      const isChatOpen = selectedChatId === change.doc.id;
                      if (!isChatOpen || document.hidden) {
                          sendNotification(chatData.isGroup ? chatData.groupName : "Новое сообщение", lastMsg.text || 'Вложение');
                      }
                  }
              }
          });

          const loadedDataPromises = snapshot.docs.map(async (chatDoc) => {
              const chatData = chatDoc.data();
              const otherUserId = chatData.participantIds.find((id: string) => id !== currentUser.id);
              let participants: User[] = [];
              
              if (chatData.isGroup) {
                  const promises = chatData.participantIds.map(async (pid: string) => {
                      if (pid === AI_USER.id) return AI_USER;
                      try {
                          const uSnap = await getDoc(doc(db, "users", pid));
                          return uSnap.exists() ? uSnap.data() as User : { id: pid, name: 'Unknown', avatar: '', isOnline: false };
                      } catch (e) { return { id: pid, name: 'Unknown', avatar: '', isOnline: false }; }
                  });
                  participants = await Promise.all(promises);
              } else {
                  if (otherUserId === AI_USER.id) {
                      participants = [AI_USER];
                  } else if (otherUserId) {
                      try {
                          const userSnap = await getDoc(doc(db, "users", otherUserId));
                          if (userSnap.exists()) {
                              const uData = userSnap.data() as any;
                              const lastActive = uData.lastActive?.toDate ? uData.lastActive.toDate() : new Date(0);
                              const isOnline = (Date.now() - lastActive.getTime()) < 5 * 60 * 1000;
                              participants = [{ ...uData, isOnline }];
                          } else {
                              participants = [{ id: otherUserId, name: 'Неизвестный', avatar: '', isOnline: false }];
                          }
                      } catch (e) {
                          participants = [{ id: otherUserId, name: 'Неизвестный', avatar: '', isOnline: false }];
                      }
                  }
              }

              let lastMsg: Message | undefined = undefined;
              if (chatData.lastMessage) {
                  lastMsg = {
                      ...chatData.lastMessage,
                      timestamp: chatData.lastMessage.timestamp?.toDate ? chatData.lastMessage.timestamp.toDate() : new Date()
                  };
              }

              return {
                  id: chatDoc.id,
                  participantIds: chatData.participantIds,
                  participants: participants,
                  messages: [],
                  unreadCount: 0,
                  lastMessage: lastMsg,
                  updatedAt: chatData.updatedAt?.toDate(),
                  isGroup: chatData.isGroup,
                  groupName: chatData.groupName,
                  groupAvatar: chatData.groupAvatar,
                  adminIds: chatData.adminIds
              } as Chat;
          });

          const freshChats = await Promise.all(loadedDataPromises);
          freshChats.sort((a, b) => {
             const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
             const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
             return timeB - timeA;
          });
          setChats(freshChats);
      }, (error) => { if (error.code === 'permission-denied') setPermissionError(true); });
      return () => unsubscribe();
  }, [currentUser, selectedChatId]); 

  useEffect(() => {
      if (!isFirebaseConfigured || !selectedChatId) { setActiveMessages([]); return; }
      const q = query(collection(db, "chats", selectedChatId, "messages"), orderBy("timestamp", "asc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
          const msgs = snapshot.docs.map(doc => {
              const data = doc.data();
              return { ...data, id: doc.id, timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(), } as Message;
          });
          setActiveMessages(msgs);
      }, (error) => { if (error.code === 'permission-denied') setPermissionError(true); });
      return () => unsubscribe();
  }, [selectedChatId]);

  useEffect(() => {
      if (!isFirebaseConfigured || !searchQuery) { setOtherUsers([]); return; }
      const searchUsers = async () => {
          try {
              const querySnapshot = await getDocs(collection(db, "users"));
              const matches: User[] = [];
              querySnapshot.forEach(doc => {
                  const u = doc.data() as User;
                  if (u.id === currentUser?.id) return;
                  const q = searchQuery.toLowerCase();
                  if ((u.name && u.name.toLowerCase().includes(q)) || (u.phoneNumber && u.phoneNumber.includes(q)) || (u.uniqueCode && u.uniqueCode.includes(q))) { matches.push(u); }
              });
              const existingChatPartnerIds = new Set(chats.flatMap(c => c.participantIds.filter(id => id !== currentUser?.id)));
              setOtherUsers(matches.filter(u => !existingChatPartnerIds.has(u.id)));
          } catch (e: any) { if (e.code === 'permission-denied') setPermissionError(true); }
      };
      const timer = setTimeout(searchUsers, 500);
      return () => clearTimeout(timer);
  }, [searchQuery, chats, currentUser]);

  const handleLogin = (user: User) => { /* Handled by AuthState */ };
  const handleUpdateProfile = (updatedUser: User) => { setCurrentUser(updatedUser); };
  const handleLogout = async () => { if (currentUser) { try { await updateDoc(doc(db, "users", currentUser.id), { isOnline: false }); } catch(e) {} } await signOut(auth); setSelectedChatId(null); setIsMobileChatOpen(false); setIsProfileOpen(false); };
  const handleSelectChat = (chatId: string) => { setSelectedChatId(chatId); setIsMobileChatOpen(true); setSearchQuery(''); };
  const handleBackToSidebar = () => { setIsMobileChatOpen(false); setTimeout(() => setSelectedChatId(null), 300); };
  
  const handleStartChat = async (user: User) => {
      if (!currentUser) return;
      const existing = chats.find(c => !c.isGroup && c.participantIds.includes(user.id));
      if (existing) { handleSelectChat(existing.id); return; }
      const newChatData = { participantIds: [currentUser.id, user.id], updatedAt: Timestamp.now(), lastMessage: null };
      try { const docRef = await addDoc(collection(db, "chats"), newChatData); handleSelectChat(docRef.id); } catch (e: any) { if (e.code === 'permission-denied') setPermissionError(true); }
  };

  const handleCreateGroup = async (name: string, participantIds: string[], avatar?: string) => {
      if (!currentUser) return;
      const allParticipants = [currentUser.id, ...participantIds];
      
      const newGroupData = {
          isGroup: true,
          groupName: name,
          groupAvatar: avatar || '',
          adminIds: [currentUser.id],
          participantIds: allParticipants,
          updatedAt: Timestamp.now(),
          lastMessage: {
              id: 'system_create',
              senderId: 'system',
              text: `Группа "${name}" создана`,
              timestamp: Timestamp.now(),
              status: 'read'
          }
      };

      try {
          const docRef = await addDoc(collection(db, "chats"), newGroupData);
          setIsCreateGroupOpen(false);
          handleSelectChat(docRef.id);
      } catch (e: any) {
          console.error("Group creation error", e);
          if (e.code === 'permission-denied') setPermissionError(true);
      }
  };

  const handleDeleteChat = async (chatId: string) => {
      if (!window.confirm("Вы уверены?")) return;
      try { await deleteDoc(doc(db, "chats", chatId)); if (selectedChatId === chatId) { setSelectedChatId(null); setIsMobileChatOpen(false); } } catch (e: any) { if (e.code === 'permission-denied') setPermissionError(true); }
  };

  const handleSendMessage = async (text: string, attachments: Attachment[] = []) => {
    if (!selectedChatId || !currentUser) return;
    const newMessageData = { senderId: currentUser.id, text: text, timestamp: Timestamp.now(), status: 'sent', attachments: attachments, reactions: [] };
    try {
        await addDoc(collection(db, "chats", selectedChatId, "messages"), newMessageData);
        const previewAttachments = attachments.map(a => ({ ...a, url: '' }));
        await updateDoc(doc(db, "chats", selectedChatId), { lastMessage: { ...newMessageData, attachments: previewAttachments }, updatedAt: Timestamp.now() });
        
        const currentChat = chats.find(c => c.id === selectedChatId);
        const isAiChat = currentChat?.participantIds.includes(AI_USER.id) && !currentChat.isGroup;

        if (isAiChat && (text.trim() || attachments.length > 0)) {
            const history = activeMessages.map(m => ({ role: m.senderId === AI_USER.id ? 'model' as const : 'user' as const, parts: [{ text: m.text }] }));
            if (text) history.push({ role: 'user', parts: [{ text }] });
            
            try {
                // Now returns object with { text, attachments }
                const aiResponse = await sendMessageToGemini(text, history);
                
                const aiMessageData = { 
                    senderId: AI_USER.id, 
                    text: aiResponse.text, 
                    timestamp: Timestamp.now(), 
                    status: 'read', 
                    attachments: aiResponse.attachments 
                };
                
                await addDoc(collection(db, "chats", selectedChatId, "messages"), aiMessageData);
                
                // For preview in sidebar, we strip large base64 URLs from the lastMessage
                const aiPreviewAttachments = aiResponse.attachments.map(a => ({...a, url: ''}));
                
                await updateDoc(doc(db, "chats", selectedChatId), { 
                    lastMessage: { ...aiMessageData, attachments: aiPreviewAttachments }, 
                    updatedAt: Timestamp.now() 
                });
            } catch (e) { console.error("AI Error", e); }
        }
    } catch (e: any) { if (e.code === 'permission-denied') setPermissionError(true); }
  };

  const handleEditMessage = async (messageId: string, newText: string) => { if (!selectedChatId) return; try { const msgRef = doc(db, "chats", selectedChatId, "messages", messageId); await updateDoc(msgRef, { text: newText, isEdited: true }); } catch (e: any) { if (e.code === 'permission-denied') setPermissionError(true); } };
  const handleReaction = async (messageId: string, emoji: string) => { if (!selectedChatId || !currentUser) return; const msg = activeMessages.find(m => m.id === messageId); if (!msg) return; let newReactions = msg.reactions || []; const userReactionIndex = newReactions.findIndex(r => r.emoji === emoji && r.userId === currentUser.id); if (userReactionIndex >= 0) { newReactions.splice(userReactionIndex, 1); } else { newReactions.push({ emoji, userId: currentUser.id, count: 1 }); } try { const msgRef = doc(db, "chats", selectedChatId, "messages", messageId); await updateDoc(msgRef, { reactions: newReactions }); } catch (e: any) { if (e.code === 'permission-denied') setPermissionError(true); } };
  const handleViewProfile = (user: User) => { setViewingUser(user); };

  if (showDevSetup) return <FirebaseSetup onBack={() => setShowDevSetup(false)} />;
  if (permissionError) return <PermissionError />;
  if (loading) return <div className="h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-violet-500 rounded-full border-t-transparent"></div></div>;
  if (!currentUser) return <AuthScreen onLogin={handleLogin} onOpenDevSettings={() => setShowDevSetup(true)} />;

  const selectedChat = chats.find((c) => c.id === selectedChatId) || null;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden transition-colors duration-200">
      <div className={`${isMobileChatOpen ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-shrink-0 h-full`}>
        <Sidebar 
          chats={chats} currentUser={currentUser} selectedChatId={selectedChatId} onSelectChat={handleSelectChat}
          onOpenProfile={() => setIsProfileOpen(true)} className="w-full" searchQuery={searchQuery} onSearchChange={setSearchQuery} otherUsers={otherUsers}
          onStartChat={handleStartChat} onOpenGame={() => setIsGameOpen(true)} onDeleteChat={handleDeleteChat}
          onCreateGroup={() => setIsCreateGroupOpen(true)}
        />
      </div>
      <div className={`flex-1 h-full relative ${!isMobileChatOpen ? 'hidden md:flex' : 'flex'}`}>
        {selectedChat ? (
          <ChatWindow chat={selectedChat} messages={activeMessages} currentUser={currentUser} onSendMessage={handleSendMessage} onEditMessage={handleEditMessage} onBack={handleBackToSidebar} onReaction={handleReaction} onViewProfile={handleViewProfile} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-center p-4">
              <div className="w-24 h-24 bg-violet-100 dark:bg-violet-900/20 rounded-full flex items-center justify-center mb-6 animate-pulse-ring"><span className="text-4xl">👋</span></div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Добро пожаловать в Lumini</h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md">Выберите чат слева или создайте новую группу.</p>
          </div>
        )}
      </div>
      {isProfileOpen && <ProfileModal user={currentUser} onUpdate={handleUpdateProfile} onLogout={handleLogout} onClose={() => setIsProfileOpen(false)} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />}
      {viewingUser && <ProfileModal user={viewingUser} onClose={() => setViewingUser(null)} isDarkMode={isDarkMode} toggleTheme={toggleTheme} isReadOnly={true} />}
      {isGameOpen && <SnakeGameModal onClose={() => setIsGameOpen(false)} />}
      {isCreateGroupOpen && <CreateGroupModal currentUser={currentUser} onClose={() => setIsCreateGroupOpen(false)} onCreate={handleCreateGroup} />}
    </div>
  );
};

export default App;
