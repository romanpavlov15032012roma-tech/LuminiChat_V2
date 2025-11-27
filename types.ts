
export interface User {
  id: string;
  name: string;
  avatar: string;
  email?: string;
  phoneNumber?: string;
  uniqueCode?: string;
  isOnline: boolean;
  isAi?: boolean;
}

export interface Attachment {
  id: string;
  type: 'image' | 'file' | 'video' | 'audio';
  url: string;
  name: string;
  size?: string;
  duration?: string;
}

export interface Reaction {
  emoji: string;
  userId: string;
  count: number;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: any; // Allow Firestore Timestamp or Date
  status: 'sending' | 'sent' | 'delivered' | 'read';
  reactions?: Reaction[];
  attachments?: Attachment[];
  isEdited?: boolean;
}

export interface Chat {
  id: string;
  participantIds: string[]; // Firestore friendly
  participants: User[]; // Hydrated for UI
  messages: Message[];
  unreadCount: number;
  lastMessage?: Message;
  updatedAt?: any;
  
  // Key: userId, Value: Timestamp of last keystroke
  typing?: { [userId: string]: any }; 
  
  // Group Chat Fields
  isGroup?: boolean;
  groupName?: string;
  groupAvatar?: string;
  adminIds?: string[];
  
  // Helper for UI (computed)
  isTyping?: boolean; 
}
