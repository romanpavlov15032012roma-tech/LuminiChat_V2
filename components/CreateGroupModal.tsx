
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { X, Search, Check, Users, Camera } from 'lucide-react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../src/firebase';

interface CreateGroupModalProps {
  currentUser: User;
  onClose: () => void;
  onCreate: (name: string, participantIds: string[], avatar?: string) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ currentUser, onClose, onCreate }) => {
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, "users"));
            const snapshot = await getDocs(q);
            const users: User[] = [];
            snapshot.forEach(doc => {
                const u = doc.data() as User;
                if (u.id !== currentUser.id) {
                    users.push(u);
                }
            });
            setAvailableUsers(users);
        } catch (e) {
            console.error("Error fetching users", e);
        } finally {
            setLoading(false);
        }
    };
    fetchUsers();
  }, [currentUser.id]);

  const toggleUser = (userId: string) => {
      const newSet = new Set(selectedUserIds);
      if (newSet.has(userId)) {
          newSet.delete(userId);
      } else {
          newSet.add(userId);
      }
      setSelectedUserIds(newSet);
  };

  const handleCreate = () => {
      if (!groupName.trim()) return alert("Введите название группы");
      if (selectedUserIds.size === 0) return alert("Выберите хотя бы одного участника");
      
      const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(groupName)}&background=7c3aed&color=fff&size=200`;
      
      onCreate(groupName, Array.from(selectedUserIds), avatar);
  };

  const filteredUsers = availableUsers.filter(u => 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.phoneNumber && u.phoneNumber.includes(searchQuery))
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users size={20} className="text-violet-500" />
                Новая группа
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
                <X size={20} />
            </button>
        </div>

        <div className="p-4 space-y-4">
            <div className="flex gap-4 items-center">
                <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-400 border-2 border-dashed border-slate-300 dark:border-slate-700">
                    <Camera size={24} />
                </div>
                <div className="flex-1">
                    <input 
                        type="text" 
                        placeholder="Название группы" 
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="w-full bg-transparent border-b-2 border-slate-200 dark:border-slate-700 py-2 text-slate-900 dark:text-white focus:border-violet-500 outline-none transition-colors"
                        autoFocus
                    />
                </div>
            </div>

            <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Поиск участников..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-100 dark:bg-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500/50 outline-none"
                />
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
                <div className="flex justify-center p-4"><span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></span></div>
            ) : filteredUsers.length > 0 ? (
                filteredUsers.map(user => {
                    const isSelected = selectedUserIds.has(user.id);
                    return (
                        <div 
                            key={user.id}
                            onClick={() => toggleUser(user.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-violet-50 dark:bg-violet-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                        >
                            <div className="relative">
                                <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                                {isSelected && (
                                    <div className="absolute -bottom-1 -right-1 bg-violet-600 rounded-full p-0.5 border-2 border-white dark:border-slate-900">
                                        <Check size={10} className="text-white" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1">
                                <h4 className={`font-medium text-sm ${isSelected ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-200'}`}>
                                    {user.name}
                                </h4>
                                {user.isOnline && <span className="text-[10px] text-emerald-500">В сети</span>}
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="text-center text-slate-500 py-4 text-sm">Никого не найдено</div>
            )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button 
                onClick={handleCreate}
                disabled={!groupName.trim() || selectedUserIds.size === 0}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl font-medium transition-colors shadow-lg shadow-violet-600/20 flex items-center gap-2"
            >
                Создать ({selectedUserIds.size})
            </button>
        </div>

      </div>
    </div>
  );
};
