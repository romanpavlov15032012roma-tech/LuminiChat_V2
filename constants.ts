
import { User, Chat } from './types';

// CURRENT_USER is now handled dynamically in App.tsx via Auth

// Soft pleasant pop sound
export const NOTIFICATION_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2346/2346-preview.mp3';

export const AI_USER: User = {
  id: 'gemini_ai',
  name: 'Lumini AI',
  avatar: 'https://picsum.photos/id/532/200/200', // Abstract tech look
  isOnline: true,
  isAi: true,
};

// Database of users that can be found via search
export const AVAILABLE_USERS: User[] = [
  {
    id: 'u1',
    name: 'Анна Смирнова',
    phoneNumber: '+79001112233',
    uniqueCode: '249102',
    avatar: 'https://picsum.photos/id/65/200/200',
    isOnline: true,
  },
  {
    id: 'u2',
    name: 'Максим Волков',
    phoneNumber: '+79004445566',
    uniqueCode: '853011',
    avatar: 'https://picsum.photos/id/91/200/200',
    isOnline: false,
  },
  {
    id: 'u3',
    name: 'Design Team',
    uniqueCode: '991234',
    avatar: 'https://picsum.photos/id/180/200/200',
    isOnline: false,
  },
  {
    id: 'u4',
    name: 'Елена Соколова',
    phoneNumber: '+79007778899',
    uniqueCode: '112233',
    avatar: 'https://picsum.photos/id/342/200/200',
    isOnline: true,
  },
  {
    id: 'u5',
    name: 'Дмитрий Петров',
    phoneNumber: '+79000001122',
    uniqueCode: '778899',
    avatar: 'https://picsum.photos/id/338/200/200',
    isOnline: true,
  },
  {
    id: 'u6',
    name: 'Tech Support',
    phoneNumber: '88005553535',
    uniqueCode: '000001',
    avatar: 'https://picsum.photos/id/445/200/200',
    isOnline: false,
  },
];

export const INITIAL_CHATS: Chat[] = [
  {
    id: 'c1',
    participantIds: [AI_USER.id],
    participants: [AI_USER],
    unreadCount: 0,
    messages: [
      {
        id: 'm1',
        senderId: 'gemini_ai',
        text: 'Привет! Я Lumini AI, твой персональный ассистент. Чем могу помочь сегодня?',
        timestamp: new Date(Date.now() - 1000 * 60 * 60),
        status: 'read',
      },
    ],
    lastMessage: {
        id: 'm1',
        senderId: 'gemini_ai',
        text: 'Привет! Я Lumini AI, твой персональный ассистент. Чем могу помочь сегодня?',
        timestamp: new Date(Date.now() - 1000 * 60 * 60),
        status: 'read',
    }
  }
];
