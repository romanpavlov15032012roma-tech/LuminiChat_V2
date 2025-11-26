import React, { useState, useRef, useEffect } from 'react';
import { User } from '../types';
import { X, Camera, Save, LogOut, Moon, Sun, Copy, Check, Hash, Mail, Phone, Calendar, AlertTriangle } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../src/firebase';

interface ProfileModalProps {
  user: User;
  onUpdate?: (updatedUser: User) => void; // Optional for read-only
  onLogout?: () => void; // Optional for read-only
  onClose: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  isReadOnly?: boolean; // New prop to toggle edit mode
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ 
    user, 
    onUpdate, 
    onLogout, 
    onClose, 
    isDarkMode, 
    toggleTheme,
    isReadOnly = false 
}) => {
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state if user prop changes (e.g. switching between different profiles)
  useEffect(() => {
      setName(user.name);
      setAvatar(user.avatar);
  }, [user]);

  const handleSave = async () => {
    if (isReadOnly || !onUpdate) return;
    
    setIsSaving(true);
    try {
        const updatedData = { name, avatar };
        
        // Update in Firestore
        const userRef = doc(db, "users", user.id);
        await updateDoc(userRef, updatedData);
        
        // Update Local State
        onUpdate({ ...user, name, avatar });
        onClose();
    } catch (error) {
        console.error("Error updating profile:", error);
        alert("Ошибка при сохранении профиля");
    } finally {
        setIsSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isReadOnly) return;
      
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
              if (event.target?.result) {
                  setAvatar(event.target.result as string);
              }
          };
          reader.readAsDataURL(file);
      }
  };

  const copyCode = () => {
      if (user.uniqueCode) {
          navigator.clipboard.writeText(user.uniqueCode);
          setCopiedCode(true);
          setTimeout(() => setCopiedCode(false), 2000);
      }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden transition-colors duration-200 transform transition-all scale-100">
        
        {/* Header Background */}
        <div className={`h-32 relative ${isReadOnly ? 'bg-slate-700 dark:bg-slate-800' : 'bg-gradient-to-r from-violet-600 to-indigo-600'}`}>
            <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full backdrop-blur-md transition-colors"
            >
                <X size={20} />
            </button>
        </div>

        {/* Avatar Section */}
        <div className="relative px-6 -mt-16 mb-6 text-center">
            <div className={`relative inline-block group ${!isReadOnly ? 'cursor-pointer' : ''}`}>
                <img 
                    src={avatar || 'https://via.placeholder.com/150'} 
                    alt={name} 
                    className="w-32 h-32 rounded-full border-4 border-white dark:border-slate-900 object-cover bg-slate-100 dark:bg-slate-800 shadow-md"
                />
                {!isReadOnly && (
                    <label className="absolute bottom-0 right-0 p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-full border-4 border-white dark:border-slate-900 cursor-pointer transition-colors shadow-lg">
                        <Camera size={18} />
                        <input 
                            type="file" 
                            ref={fileInputRef}
                            className="hidden" 
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                    </label>
                )}
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-2 flex items-center justify-center gap-2">
                {isReadOnly ? user.name : (
                    <input 
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="bg-transparent text-center border-b border-transparent hover:border-slate-300 focus:border-violet-500 focus:outline-none w-full"
                    />
                )}
            </h2>
            <div className={`text-sm mt-1 flex items-center justify-center gap-2 ${user.isOnline ? 'text-emerald-500' : 'text-slate-500'}`}>
                <div className={`w-2 h-2 rounded-full ${user.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
                {user.isOnline ? 'В сети' : 'Не в сети'}
            </div>
        </div>

        {/* Info Grid */}
        <div className="px-6 pb-6 space-y-4">
            
            {/* Unique Code */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-200 dark:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400">
                        <Hash size={18} />
                    </div>
                    <div>
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Lumini ID</span>
                        <span className="font-mono text-base font-bold text-slate-800 dark:text-slate-200 tracking-widest">{user.uniqueCode || '---'}</span>
                    </div>
                </div>
                <button 
                    onClick={copyCode}
                    className={`p-2 rounded-lg transition-colors ${copiedCode ? 'bg-emerald-500/10 text-emerald-500' : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-violet-500'}`}
                >
                    {copiedCode ? <Check size={18} /> : <Copy size={18} />}
                </button>
            </div>

            {/* Read Only Details */}
            {isReadOnly && (
                <div className="space-y-3">
                     {user.email && (
                        <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <Mail className="text-slate-400" size={20} />
                            <div className="flex-1 overflow-hidden">
                                <p className="text-xs text-slate-500 uppercase font-bold">Email</p>
                                <p className="text-slate-800 dark:text-slate-200 truncate">{user.email}</p>
                            </div>
                        </div>
                     )}
                     {user.phoneNumber && (
                        <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <Phone className="text-slate-400" size={20} />
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-bold">Телефон</p>
                                <p className="text-slate-800 dark:text-slate-200">{user.phoneNumber}</p>
                            </div>
                        </div>
                     )}
                </div>
            )}

            {/* Theme Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800 mt-4 pt-4">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
                    Темная тема
                </span>
                <button 
                    onClick={toggleTheme}
                    className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ease-in-out relative ${isDarkMode ? 'bg-violet-600' : 'bg-slate-300'}`}
                >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${isDarkMode ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </button>
            </div>

            {/* Actions (Only for Current User) */}
            {!isReadOnly && onLogout && (
                <div className="pt-2">
                    {!showLogoutConfirm ? (
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setShowLogoutConfirm(true)}
                                className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400 text-slate-600 dark:text-slate-300 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-500/30"
                            >
                                <LogOut size={18} />
                                <span>Выйти</span>
                            </button>
                            <button 
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-[2] py-3 px-4 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20"
                            >
                                {isSaving ? (
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                ) : (
                                    <>
                                        <Save size={18} />
                                        <span>Сохранить</span>
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                         <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-3 rounded-xl animate-fade-in">
                            <p className="text-sm text-red-600 dark:text-red-300 font-medium mb-3 flex items-center gap-2">
                                <AlertTriangle size={16} />
                                Вы уверены, что хотите выйти?
                            </p>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setShowLogoutConfirm(false)}
                                    className="flex-1 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-50"
                                >
                                    Отмена
                                </button>
                                <button 
                                    onClick={onLogout}
                                    className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm shadow-md shadow-red-500/20"
                                >
                                    Да, выйти
                                </button>
                            </div>
                         </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};