import React, { useState } from 'react';
import { User } from '../types';
import { Sparkles, ArrowRight, Lock, AlertCircle } from 'lucide-react';
import { auth, db } from '../src/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

interface AuthScreenProps {
  onLogin: (user: User) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
        if (isRegistering) {
            // 1. Register
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const firebaseUser = userCredential.user;
            
            // 2. Generate Metadata
            const uniqueCode = Math.floor(100000 + Math.random() * 900000).toString();
            const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`;

            const newUser: User = {
                id: firebaseUser.uid,
                name: name,
                email: email,
                phoneNumber: phoneNumber,
                uniqueCode: uniqueCode,
                avatar: avatar,
                isOnline: true
            };

            // 3. Save to Firestore 'users' collection
            await setDoc(doc(db, "users", firebaseUser.uid), newUser);
            
            // 4. Update Auth Profile
            await updateProfile(firebaseUser, { displayName: name, photoURL: avatar });

            onLogin(newUser);
        } else {
            // Login
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const firebaseUser = userCredential.user;

            // Fetch user details from Firestore
            const docRef = doc(db, "users", firebaseUser.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const userData = docSnap.data() as User;
                onLogin({ ...userData, isOnline: true }); // Ensure online status logic handled in App
            } else {
                // Fallback if user exists in Auth but not DB (shouldn't happen usually)
                const fallbackUser: User = {
                    id: firebaseUser.uid,
                    name: firebaseUser.displayName || 'User',
                    email: firebaseUser.email || '',
                    avatar: firebaseUser.photoURL || '',
                    isOnline: true
                };
                await setDoc(doc(db, "users", firebaseUser.uid), fallbackUser);
                onLogin(fallbackUser);
            }
        }
    } catch (err: any) {
        console.error("Auth error:", err);
        if (err.code === 'auth/email-already-in-use') {
            setError('Этот email уже зарегистрирован. Пожалуйста, войдите.');
        } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            setError('Неверный email или пароль.');
        } else if (err.code === 'auth/user-not-found') {
            setError('Пользователь не найден. Пожалуйста, зарегистрируйтесь.');
        } else if (err.code === 'auth/weak-password') {
            setError('Пароль слишком простой (минимум 6 символов).');
        } else if (err.code === 'auth/invalid-email') {
            setError('Некорректный формат email.');
        } else {
            setError('Ошибка: ' + err.message);
        }
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 relative overflow-hidden transition-colors duration-200">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-violet-600/10 dark:bg-violet-600/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-600/10 dark:bg-indigo-600/20 rounded-full blur-[120px] animate-pulse [animation-delay:2s]"></div>

        <div className="bg-white/80 dark:bg-slate-900/50 backdrop-blur-xl border border-slate-200 dark:border-slate-800 p-8 rounded-3xl shadow-2xl w-full max-w-md relative z-10 transition-colors duration-200">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-violet-500/30">
              <Sparkles className="text-white w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Lumini Chat</h1>
            <p className="text-slate-500 dark:text-slate-400">
              {isRegistering ? 'Создание облачного аккаунта' : 'Вход в систему'}
            </p>
          </div>

          {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl flex items-center gap-2 animate-slide-up">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  {error}
              </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegistering && (
              <>
              <div className="animate-fade-in">
                <label className="block text-slate-600 dark:text-slate-400 text-sm font-medium mb-1">Имя</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                />
              </div>
              <div className="animate-fade-in">
                <label className="block text-slate-600 dark:text-slate-400 text-sm font-medium mb-1">Телефон (для поиска)</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  placeholder="+7..."
                />
              </div>
              </>
            )}

            <div>
              <label className="block text-slate-600 dark:text-slate-400 text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 text-sm font-medium mb-1">Пароль</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
              />
            </div>
            
            <div className="pt-2">
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold py-3.5 rounded-xl hover:shadow-lg hover:shadow-violet-600/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    ) : (
                        <>
                           {isRegistering ? 'Зарегистрироваться' : 'Войти'}
                           <ArrowRight size={18} />
                        </>
                    )}
                </button>
            </div>
          </form>
          
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
             <button 
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError('');
                }}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white text-sm transition-colors"
             >
                {isRegistering 
                    ? 'Уже есть аккаунт? Войти' 
                    : 'Нет аккаунта? Зарегистрироваться'}
             </button>
          </div>
          
          <div className="mt-6 flex justify-center gap-2 text-xs text-slate-500 dark:text-slate-600">
             <Lock size={12} />
             <span>Firebase Secure Authentication</span>
          </div>
        </div>
    </div>
  );
};