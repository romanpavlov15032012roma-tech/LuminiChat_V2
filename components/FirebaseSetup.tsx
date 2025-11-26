import React, { useState } from 'react';
import { Save, AlertCircle, Database, ArrowLeft } from 'lucide-react';

interface FirebaseSetupProps {
  onBack?: () => void;
}

export const FirebaseSetup: React.FC<FirebaseSetupProps> = ({ onBack }) => {
  const [apiKey, setApiKey] = useState('');
  const [authDomain, setAuthDomain] = useState('');
  const [projectId, setProjectId] = useState('');
  const [storageBucket, setStorageBucket] = useState('');
  const [messagingSenderId, setMessagingSenderId] = useState('');
  const [appId, setAppId] = useState('');
  
  const [showManual, setShowManual] = useState(false);
  const [jsonInput, setJsonInput] = useState('');

  const handleJsonPaste = () => {
    try {
      const jsonStr = jsonInput.substring(
        jsonInput.indexOf('{'), 
        jsonInput.lastIndexOf('}') + 1
      );
      
      const fixedJson = jsonStr.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2": ').replace(/'/g, '"');
      
      const config = JSON.parse(fixedJson);
      
      saveConfig(config);
    } catch (e) {
      alert("Не удалось распознать JSON. Попробуйте ввести данные вручную.");
    }
  };

  const handleManualSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveConfig({
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId
    });
  };

  const saveConfig = (config: any) => {
    if (!config.apiKey || !config.projectId) {
      alert("Некорректная конфигурация. Нужен хотя бы API Key и Project ID.");
      return;
    }
    localStorage.setItem('lumini_firebase_config', JSON.stringify(config));
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-700">
        <div className="p-6 border-b border-slate-700 bg-gradient-to-r from-violet-900 to-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="text-violet-400" size={32} />
            <h1 className="text-2xl font-bold text-white">Настройка Базы Данных</h1>
          </div>
          {onBack && (
              <button 
                onClick={onBack}
                className="p-2 hover:bg-slate-700 rounded-full transition-colors"
              >
                  <ArrowLeft size={24} />
              </button>
          )}
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-xl flex gap-3">
             <AlertCircle className="text-blue-400 flex-shrink-0" size={24} />
             <div className="text-sm text-slate-300">
                <p className="font-bold text-blue-300 mb-1">Режим разработчика</p>
                Здесь вы можете подключить свой проект Firebase. Данные сохраняются локально в вашем браузере.
             </div>
          </div>

          <div className="space-y-4">
             <h3 className="font-semibold text-lg border-b border-slate-700 pb-2">Способ 1: Вставить JSON</h3>
             <textarea 
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder={'const firebaseConfig = {\n  apiKey: "...",\n  ...\n};'}
                className="w-full h-32 bg-slate-950 font-mono text-xs text-green-400 p-3 rounded-lg border border-slate-700 focus:border-violet-500 focus:outline-none"
             />
             <button 
                onClick={handleJsonPaste}
                disabled={!jsonInput}
                className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
             >
                <Save size={18} /> Сохранить и Запустить
             </button>
          </div>

          <div className="relative flex items-center py-2">
             <div className="flex-grow border-t border-slate-700"></div>
             <span className="flex-shrink-0 mx-4 text-slate-500 text-sm">ИЛИ ВРУЧНУЮ</span>
             <div className="flex-grow border-t border-slate-700"></div>
          </div>

          <button 
             onClick={() => setShowManual(!showManual)}
             className="text-violet-400 hover:text-violet-300 text-sm font-medium w-full text-center"
          >
             {showManual ? 'Скрыть поля' : 'Ввести поля по отдельности'}
          </button>

          {showManual && (
            <form onSubmit={handleManualSave} className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
              <input 
                placeholder="apiKey" 
                value={apiKey} onChange={e => setApiKey(e.target.value)}
                className="bg-slate-950 p-3 rounded-lg border border-slate-700 text-white" required
              />
              <input 
                placeholder="authDomain" 
                value={authDomain} onChange={e => setAuthDomain(e.target.value)}
                className="bg-slate-950 p-3 rounded-lg border border-slate-700 text-white" required
              />
              <input 
                placeholder="projectId" 
                value={projectId} onChange={e => setProjectId(e.target.value)}
                className="bg-slate-950 p-3 rounded-lg border border-slate-700 text-white" required
              />
              <input 
                placeholder="storageBucket" 
                value={storageBucket} onChange={e => setStorageBucket(e.target.value)}
                className="bg-slate-950 p-3 rounded-lg border border-slate-700 text-white" 
              />
              <input 
                placeholder="messagingSenderId" 
                value={messagingSenderId} onChange={e => setMessagingSenderId(e.target.value)}
                className="bg-slate-950 p-3 rounded-lg border border-slate-700 text-white" 
              />
              <input 
                placeholder="appId" 
                value={appId} onChange={e => setAppId(e.target.value)}
                className="bg-slate-950 p-3 rounded-lg border border-slate-700 text-white" 
              />
              <div className="md:col-span-2">
                 <button type="submit" className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition-colors">
                    Сохранить настройки
                 </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};