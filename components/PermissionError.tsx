import React from 'react';
import { ShieldAlert, ExternalLink, Check, Copy } from 'lucide-react';

export const PermissionError: React.FC = () => {
  const [copied, setCopied] = React.useState(false);

  const rulesCode = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`;

  const copyRules = () => {
    navigator.clipboard.writeText(rulesCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-700">
        <div className="p-6 border-b border-slate-700 bg-red-900/20">
          <div className="flex items-center gap-3 mb-2">
            <ShieldAlert className="text-red-500" size={32} />
            <h1 className="text-2xl font-bold text-white">Доступ к Базе Данных Запрещен</h1>
          </div>
          <p className="text-red-200">
            Firebase отклоняет запросы приложения. Это происходит, когда <b>Security Rules</b> (Правила безопасности) настроены по умолчанию (блокировать всё).
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
             <h3 className="font-semibold text-lg text-white">Как исправить (за 1 минуту):</h3>
             
             <ol className="list-decimal list-inside space-y-3 text-slate-300 ml-2">
               <li>
                 Откройте <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 inline-flex items-center gap-1 underline">Firebase Console <ExternalLink size={12}/></a>
               </li>
               <li>Перейдите в раздел <b>Build</b> → <b>Firestore Database</b>.</li>
               <li>Откройте вкладку <b>Rules</b> (Правила).</li>
               <li>
                 Удалите всё, что там написано, и вставьте этот код (Разрешить всё для теста):
               </li>
             </ol>

             <div className="relative group">
                <div className="absolute top-2 right-2">
                  <button 
                    onClick={copyRules}
                    className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2 text-xs font-medium"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    {copied ? 'Скопировано' : 'Копировать'}
                  </button>
                </div>
                <pre className="bg-slate-950 p-4 rounded-xl border border-slate-700 font-mono text-sm text-green-400 overflow-x-auto">
{rulesCode}
                </pre>
             </div>

             <ol start={5} className="list-decimal list-inside space-y-3 text-slate-300 ml-2">
                <li>Нажмите кнопку <b>Publish</b> (Опубликовать).</li>
                <li>Обновите эту страницу.</li>
             </ol>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-700/30 p-4 rounded-xl text-xs text-yellow-200/80">
             ⚠️ <b>Внимание:</b> Эти правила <code>allow read, write: if true;</code> делают базу открытой для всех. 
             Это нормально для разработки и теста, но перед реальным запуском (Production) вам нужно будет настроить авторизацию.
          </div>
          
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-bold transition-colors shadow-lg shadow-violet-600/20"
          >
            Я обновил правила, перезагрузить
          </button>
        </div>
      </div>
    </div>
  );
};