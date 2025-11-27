
import React, { useState, useRef, useEffect } from 'react';
import { Chat, Attachment, Message } from '../types';
import { User } from '../types';
import { 
  Send, Paperclip, Smile, MoreVertical, Phone, Video, ArrowLeft, Bot, 
  X, FileText, Mic, MicOff, VideoOff, PhoneOff, Download, Pencil, Check, CheckCheck, Clock, Play, PlayCircle, Camera
} from 'lucide-react';
import { doc, onSnapshot, updateDoc, collection, addDoc, getDoc, deleteDoc, setDoc, addDoc as firestoreAddDoc } from 'firebase/firestore';
import { db } from '../src/firebase';

interface ChatWindowProps {
  chat: Chat;
  messages: Message[];
  currentUser: User;
  onSendMessage: (text: string, attachments?: Attachment[]) => void;
  onEditMessage: (messageId: string, newText: string) => void;
  onBack: () => void;
  onReaction: (messageId: string, emoji: string) => void;
  onViewProfile: (user: User) => void; 
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const INPUT_EMOJIS = [
    '😊', '😂', '🥰', '😍', '😒', '😭', '😩', '😤', '😡', '😱',
    '👍', '👎', '👊', '👋', '🙏', '💪', '🔥', '✨', '🎉', '💯',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️'
];

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

const getSupportedMimeType = (type: 'audio' | 'video') => {
    const types = type === 'video' 
      ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] 
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
};

export const ChatWindow: React.FC<ChatWindowProps> = ({ chat, messages, currentUser, onSendMessage, onEditMessage, onBack, onReaction, onViewProfile }) => {
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Attachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidate[]>([]); 
  
  const [recordMode, setRecordMode] = useState<'audio' | 'video'>('audio');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingMimeTypeRef = useRef<string>('');
  
  const recordingPreviewVideoRef = useRef<HTMLVideoElement>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  
  const isGroup = chat.isGroup;
  const participant = chat.participants[0]; 
  const displayAvatar = isGroup ? chat.groupAvatar : participant?.avatar;
  const displayName = isGroup ? chat.groupName : participant?.name;
  const isOnline = !isGroup && participant?.isOnline;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!editingMessageId) {
        scrollToBottom();
    }
  }, [messages, selectedFiles, editingMessageId]);

  useEffect(() => {
      if (editingMessageId && editInputRef.current) {
          editInputRef.current.focus();
      }
  }, [editingMessageId]);

  useEffect(() => {
      if (callStatus !== 'idle' && localVideoRef.current && localStream.current) {
          localVideoRef.current.srcObject = localStream.current;
      }
      if (callStatus === 'connected' && remoteVideoRef.current && peerConnection.current) {
          const remoteStream = new MediaStream();
          peerConnection.current.getReceivers().forEach(receiver => {
              if (receiver.track) {
                  remoteStream.addTrack(receiver.track);
                  receiver.track.enabled = true;
              }
          });
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.muted = false; 
          remoteVideoRef.current.play().catch(console.error);
      }
  }, [callStatus, isVideoEnabled]);

  useEffect(() => {
      if (isRecording && recordMode === 'video' && recordingPreviewVideoRef.current && recordingStreamRef.current) {
          recordingPreviewVideoRef.current.srcObject = recordingStreamRef.current;
          recordingPreviewVideoRef.current.muted = true;
          recordingPreviewVideoRef.current.play().catch(console.error);
      }
  }, [isRecording, recordMode]);

  useEffect(() => {
      const callDocRef = doc(db, 'calls', chat.id);
      const unsubscribe = onSnapshot(callDocRef, async (snapshot) => {
          const data = snapshot.data();
          if (data && data.type === 'offer' && !peerConnection.current && data.callerId !== currentUser.id) {
              setCallStatus('incoming');
              setCallType(data.callType);
          } else if (!data && callStatus !== 'idle') {
              hangUp();
          }
      });
      return () => unsubscribe();
  }, [chat.id, callStatus]);

  const initializePeerConnection = async () => {
      const pc = new RTCPeerConnection(rtcConfig);
      pc.onicecandidate = (event) => {
          if (event.candidate) {
              const candidatesRef = collection(db, 'calls', chat.id, 'candidates');
              firestoreAddDoc(candidatesRef, event.candidate.toJSON());
          }
      };
      pc.ontrack = (event) => {
          if (remoteVideoRef.current) {
              const stream = remoteVideoRef.current.srcObject as MediaStream || new MediaStream();
              stream.addTrack(event.track);
              remoteVideoRef.current.srcObject = stream;
              remoteVideoRef.current.play().catch(console.error);
          }
      };
      peerConnection.current = pc;
      return pc;
  };

  const startCall = async (type: 'audio' | 'video') => {
      setCallType(type);
      setCallStatus('calling');
      setIsVideoEnabled(type === 'video');
      iceCandidatesQueue.current = [];
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
              video: type === 'video', audio: true 
          });
          localStream.current = stream;
          if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
              localVideoRef.current.muted = true;
          }
          const pc = await initializePeerConnection();
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await setDoc(doc(db, 'calls', chat.id), {
              type: 'offer', sdp: offer.sdp, callType: type, callerId: currentUser.id
          });
          const unsubscribe = onSnapshot(doc(db, 'calls', chat.id), async (snapshot) => {
              const data = snapshot.data();
              if (pc && !pc.currentRemoteDescription && data?.answer) {
                  const answer = new RTCSessionDescription({ type: 'answer', sdp: data.answer.sdp });
                  await pc.setRemoteDescription(answer);
                  setCallStatus('connected');
                  iceCandidatesQueue.current.forEach(c => pc.addIceCandidate(c).catch(console.error));
                  iceCandidatesQueue.current = [];
              }
          });
          onSnapshot(collection(db, 'calls', chat.id, 'candidates'), (snapshot) => {
              snapshot.docChanges().forEach((change) => {
                  if (change.type === 'added') {
                       const candidate = new RTCIceCandidate(change.doc.data());
                       if (pc && pc.remoteDescription) pc.addIceCandidate(candidate).catch(console.error);
                       else iceCandidatesQueue.current.push(candidate);
                  }
              });
          });
      } catch (e) {
          console.error("Error starting call:", e);
          alert("Ошибка доступа к камере или микрофону.");
          hangUp();
      }
  };

  const answerCall = async () => {
      iceCandidatesQueue.current = [];
      try {
          const callDoc = await getDoc(doc(db, 'calls', chat.id));
          const callData = callDoc.data();
          if (!callData) return;
          setCallStatus('connected');
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: callData.callType === 'video', audio: true 
          });
          localStream.current = stream;
          if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
              localVideoRef.current.muted = true;
          }
          const pc = await initializePeerConnection();
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
          const offer = new RTCSessionDescription({ type: 'offer', sdp: callData.sdp });
          await pc.setRemoteDescription(offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await updateDoc(doc(db, 'calls', chat.id), { answer: { type: 'answer', sdp: answer.sdp } });
          iceCandidatesQueue.current.forEach(c => pc.addIceCandidate(c).catch(console.error));
          iceCandidatesQueue.current = [];
          onSnapshot(collection(db, 'calls', chat.id, 'candidates'), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                     const candidate = new RTCIceCandidate(change.doc.data());
                     if (pc && pc.remoteDescription) pc.addIceCandidate(candidate).catch(console.error);
                     else iceCandidatesQueue.current.push(candidate);
                }
            });
          });
      } catch (e) {
          console.error("Error answering call", e);
          hangUp();
      }
  };

  const hangUp = async () => {
      if (localStream.current) { localStream.current.getTracks().forEach(track => track.stop()); localStream.current = null; }
      if (peerConnection.current) { peerConnection.current.close(); peerConnection.current = null; }
      setCallStatus('idle');
      try { await deleteDoc(doc(db, 'calls', chat.id)); } catch (e) {}
  };

  const toggleMute = () => {
      if (localStream.current) {
          localStream.current.getAudioTracks().forEach(track => track.enabled = !track.enabled);
          setIsMuted(!isMuted);
      }
  };

  const toggleVideo = () => {
      if (localStream.current) {
          localStream.current.getVideoTracks().forEach(track => track.enabled = !track.enabled);
          setIsVideoEnabled(!isVideoEnabled);
      }
  };

  const handleRecordButtonDown = (mode: 'audio' | 'video', e: React.PointerEvent) => {
      e.preventDefault(); 
      if (isRecording) return;
      setRecordMode(mode);
      // Small delay to filter out accidental taps
      pressTimerRef.current = setTimeout(() => {
          startRecording(mode);
      }, 150);
  };

  const handleRecordButtonUp = (e: React.PointerEvent) => {
      e.preventDefault();
      // If timer pending, it was a short tap -> cancel
      if (pressTimerRef.current) {
          clearTimeout(pressTimerRef.current);
          pressTimerRef.current = null;
      } 
      // If recording started -> Stop & Send
      if (isRecording) {
          stopRecording(true);
      }
  };

  const startRecording = async (mode: 'audio' | 'video') => {
    try {
        const constraints = mode === 'video' 
            ? { video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } }, audio: true }
            : { audio: true };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        recordingStreamRef.current = stream;

        if (mode === 'video' && recordingPreviewVideoRef.current) {
            recordingPreviewVideoRef.current.srcObject = stream;
            recordingPreviewVideoRef.current.muted = true;
            recordingPreviewVideoRef.current.play().catch(e => console.log('Preview start err', e));
        }

        const mimeType = getSupportedMimeType(mode);
        recordingMimeTypeRef.current = mimeType;
        
        const options = mimeType ? { mimeType } : undefined;
        const mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = mediaRecorder;
        recordedChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) recordedChunksRef.current.push(event.data);
        };

        mediaRecorder.start(100); 
        setIsRecording(true);
        setRecordingDuration(0);

        recordingTimerRef.current = setInterval(() => {
            setRecordingDuration(prev => prev + 1);
        }, 1000);

    } catch (e) {
        console.error("Error accessing media devices:", e);
        alert("Ошибка доступа к микрофону или камере.");
        setIsRecording(false);
    }
  };

  const stopRecording = (shouldSend: boolean) => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.onstop = () => {
              const chunks = [...recordedChunksRef.current];
              const currentMode = recordMode; 
              const duration = recordingDuration;
              const mimeType = recordingMimeTypeRef.current || (currentMode === 'video' ? 'video/webm' : 'audio/webm');

              if (shouldSend && chunks.length > 0 && duration >= 0.5) {
                  const blob = new Blob(chunks, { type: mimeType });
                  const reader = new FileReader();
                  reader.readAsDataURL(blob);
                  reader.onloadend = () => {
                      const base64Data = reader.result as string;
                      const durationStr = formatDuration(duration);
                      const attachment: Attachment = {
                          id: Date.now().toString(),
                          type: currentMode === 'video' ? 'video' : 'audio',
                          url: base64Data,
                          name: currentMode === 'video' ? 'Видеосообщение' : 'Голосовое сообщение',
                          duration: durationStr
                      };
                      onSendMessage('', [attachment]);
                  };
              }
              if (recordingStreamRef.current) {
                  recordingStreamRef.current.getTracks().forEach(track => track.stop());
                  recordingStreamRef.current = null;
              }
          };
          mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      setIsRecording(false);
      setRecordingDuration(0);
      mediaRecorderRef.current = null;
      recordedChunksRef.current = [];
  };

  const cancelRecording = () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      stopRecording(false);
  };

  const handleSend = () => {
    if (inputText.trim() || selectedFiles.length > 0) {
      onSendMessage(inputText, selectedFiles);
      setInputText('');
      setSelectedFiles([]);
      setShowEmojiPicker(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          const reader = new FileReader();
          
          const compressImage = (base64Str: string, maxWidth = 800, quality = 0.7): Promise<string> => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = base64Str;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
            });
          };

          reader.onload = async (event) => {
              if (event.target?.result) {
                  let type: 'image' | 'video' | 'file' = 'file';
                  let finalUrl = event.target.result as string;
                  let fileSize = (file.size / 1024).toFixed(1) + ' KB';
                  if (file.type.startsWith('image/')) {
                      type = 'image';
                      finalUrl = await compressImage(finalUrl);
                      const head = 'data:image/jpeg;base64,';
                      const sizeInBytes = Math.round((finalUrl.length - head.length) * 3 / 4);
                      fileSize = (sizeInBytes / 1024).toFixed(1) + ' KB';
                  } else if (file.type.startsWith('video/')) type = 'video';
                  const newAttachment: Attachment = {
                      id: Date.now().toString(), type: type, url: finalUrl, name: file.name, size: fileSize
                  };
                  setSelectedFiles(prev => [...prev, newAttachment]);
              }
          };
          reader.readAsDataURL(file);
      }
  };

  const removeAttachment = (id: string) => {
      setSelectedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startEditing = (msg: { id: string, text: string }) => {
      setEditingMessageId(msg.id);
      setEditText(msg.text);
      setHoveredMessageId(null);
  };

  const saveEdit = () => {
      if (editingMessageId && editText.trim()) {
          onEditMessage(editingMessageId, editText);
          setEditingMessageId(null);
          setEditText('');
      }
  };

  const cancelEdit = () => {
      setEditingMessageId(null);
      setEditText('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } else if (e.key === 'Escape') cancelEdit();
  };

  const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (date: Date | string | undefined) => {
    if (!date) return '';
    try { const d = new Date(date); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  };
  
  const getStatusIcon = (status: string) => {
      switch(status) {
          case 'sending': return <Clock size={14} className="text-slate-400" />;
          case 'sent': return <Check size={16} className="text-slate-400" />;
          case 'delivered': return <CheckCheck size={16} className="text-slate-400" />;
          case 'read': return <CheckCheck size={16} className="text-blue-400 dark:text-blue-400" />;
          default: return <Clock size={14} className="text-slate-400" />;
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0B1120] relative overflow-hidden transition-colors duration-200">
      
      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="md:hidden text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"><ArrowLeft size={24} /></button>
          
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => !isGroup && onViewProfile(participant)}>
             <div className="relative">
                <img src={displayAvatar} alt={displayName} className="w-10 h-10 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700" />
                {isOnline && <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900 z-20"></span>}
             </div>
             <div className="flex flex-col">
                <h2 className="text-slate-800 dark:text-slate-100 font-bold text-lg flex items-center gap-2 hover:text-violet-600 dark:hover:text-violet-200 transition-colors">
                    {displayName}
                    {participant?.isAi && <Bot size={18} className="text-violet-500 dark:text-violet-400" />}
                </h2>
                <div className={`text-xs flex items-center gap-1.5 ${isOnline ? 'text-emerald-500 dark:text-emerald-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                    {isGroup ? `${chat.participants.length} участников` : participant?.isAi ? 'ИИ Ассистент' : isOnline ? 'В сети' : 'Был(а) недавно'}
                </div>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          {!isGroup && !participant?.isAi && (
              <>
                <button onClick={() => startCall('audio')} className="hover:text-violet-500 dark:hover:text-violet-400 transition-colors p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><Phone size={20} /></button>
                <button onClick={() => startCall('video')} className="hover:text-violet-500 dark:hover:text-violet-400 transition-colors p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><Video size={20} /></button>
              </>
          )}
          <button onClick={() => !isGroup && onViewProfile(participant)} className="hover:text-violet-500 dark:hover:text-violet-400 transition-colors p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><MoreVertical size={20} /></button>
        </div>
      </div>

      {callStatus !== 'idle' && (
          <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center animate-fade-in">
             <div className="absolute inset-0 w-full h-full overflow-hidden">
                 <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover transition-opacity duration-500" style={{ opacity: callType === 'video' ? 1 : 0, pointerEvents: 'none' }} />
                 {(callType === 'audio' || !remoteVideoRef.current?.srcObject) && (
                     <>
                        <img src={participant.avatar} className="absolute inset-0 w-full h-full object-cover opacity-20 blur-2xl" />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/50 to-slate-950/80"></div>
                     </>
                 )}
             </div>
             {callType === 'video' && <div className="absolute top-4 right-4 w-32 h-48 bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-700 z-20"><video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror-mode" /></div>}
             <div className="relative z-10 flex flex-col items-center flex-1 justify-center w-full max-w-sm mt-20">
                 {callStatus === 'incoming' ? (
                     <div className="text-center animate-bounce">
                         <img src={participant.avatar} className="w-32 h-32 rounded-full border-4 border-emerald-500 shadow-2xl mb-4 mx-auto" />
                         <h2 className="text-2xl font-bold text-white mb-1">{participant.name}</h2>
                         <p className="text-emerald-400 font-medium">Входящий {callType === 'video' ? 'видео' : 'аудио'} звонок...</p>
                     </div>
                 ) : (
                     <div className="text-center">
                        {(callType === 'audio' || callStatus === 'calling') && (
                             <div className="relative mb-8 mx-auto w-32 h-32">
                                {callStatus === 'calling' && <div className="absolute inset-0 bg-violet-500 rounded-full animate-pulse-ring"></div>}
                                <img src={participant.avatar} className="w-32 h-32 rounded-full border-4 border-slate-800 relative z-10 shadow-2xl" />
                             </div>
                        )}
                        <h2 className="text-2xl font-bold text-white mb-2">{participant.name}</h2>
                        <p className="text-slate-300 font-medium mb-8">{callStatus === 'calling' ? 'Звонок...' : callStatus === 'connected' ? 'Разговор' : ''}</p>
                     </div>
                 )}
                 <div className="flex items-center gap-6 mt-auto mb-12">
                     {callStatus === 'incoming' ? (
                         <>
                            <button onClick={hangUp} className="p-5 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg"><PhoneOff size={32} /></button>
                            <button onClick={answerCall} className="p-5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg animate-pulse"><Phone size={32} /></button>
                         </>
                     ) : (
                         <>
                            <button onClick={toggleMute} className={`p-4 rounded-full transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-800/80 text-white hover:bg-slate-700'}`}>{isMuted ? <MicOff size={24} /> : <Mic size={24} />}</button>
                            <button onClick={hangUp} className="p-5 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/30 transform hover:scale-110 transition-all"><PhoneOff size={32} /></button>
                            {callType === 'video' && <button onClick={toggleVideo} className={`p-4 rounded-full transition-all ${!isVideoEnabled ? 'bg-white text-slate-900' : 'bg-slate-800/80 text-white hover:bg-slate-700'}`}>{isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}</button>}
                         </>
                     )}
                 </div>
             </div>
          </div>
      )}

      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.map((msg, index) => {
          const isMe = msg.senderId === currentUser.id;
          const msgSender = chat.participants.find(p => p.id === msg.senderId);
          const showAvatar = !isMe && (index === 0 || messages[index - 1].senderId !== msg.senderId);
          const isHovered = hoveredMessageId === msg.id;
          const isEditingThis = editingMessageId === msg.id;

          return (
            <div 
                key={msg.id} 
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1 animate-message-in relative group/messageRow`}
                onMouseEnter={() => !isEditingThis && setHoveredMessageId(msg.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
            >
                {!isMe && (
                    <div className={`w-8 h-8 mr-2 flex-shrink-0 flex flex-col items-center ${showAvatar ? 'opacity-100' : 'opacity-0'}`}>
                        <img src={msgSender?.avatar || chat.groupAvatar} className="w-8 h-8 rounded-full cursor-pointer" onClick={() => msgSender && !isGroup && onViewProfile(msgSender)} />
                    </div>
                )}
              
              <div className="relative max-w-[85%] md:max-w-[70%] flex flex-col group/bubbleContainer">
                  {isGroup && !isMe && showAvatar && <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-1 mb-0.5">{msgSender?.name || 'Unknown'}</span>}
                  <div className={`px-3 py-2 rounded-2xl relative shadow-sm overflow-hidden z-0 ${isMe ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm border border-slate-200 dark:border-slate-700'}`}>
                    {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mb-2 space-y-2">
                            {msg.attachments.map(att => (
                                <div key={att.id}>
                                    {att.type === 'image' ? <img src={att.url} className="rounded-lg max-h-60 object-cover w-full" /> : att.type === 'video' ? (
                                        <div className={`rounded-lg overflow-hidden bg-black relative group/video ${att.name.includes('Видеосообщение') ? 'w-64 h-64 rounded-full object-cover border-4 border-white/20' : 'max-h-60 w-full'}`}>
                                            {playingVideoId === att.id ? (
                                                <video src={att.url} controls autoPlay className={`w-full h-full ${att.name.includes('Видеосообщение') ? 'object-cover' : 'object-contain'}`} onEnded={() => setPlayingVideoId(null)} />
                                            ) : (
                                                <div className="relative w-full h-full cursor-pointer" onClick={() => setPlayingVideoId(att.id)}>
                                                    <video src={att.url} className={`w-full h-full ${att.name.includes('Видеосообщение') ? 'object-cover' : 'object-contain'}`} />
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40"><PlayCircle size={48} className="text-white opacity-90" /></div>
                                                </div>
                                            )}
                                        </div>
                                    ) : att.type === 'audio' ? (
                                        <div className={`flex items-center gap-3 p-2 rounded-xl w-60 ${isMe ? 'bg-violet-500/50' : 'bg-slate-100 dark:bg-slate-700'}`}>
                                            <div className="p-2 rounded-full bg-white/20"><Mic size={20} /></div>
                                            <div className="flex-1 min-w-0"><audio src={att.url} controls className="w-full h-8" /></div>
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}
                    {isEditingThis ? (
                        <div className="min-w-[200px]">
                            <input ref={editInputRef} value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={handleEditKeyDown} className="w-full bg-black/20 text-white p-2 rounded focus:outline-none mb-2" />
                            <div className="flex justify-end gap-2"><button onClick={cancelEdit}><X size={14}/></button><button onClick={saveEdit}><Check size={14}/></button></div>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                             {msg.text && <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.text}</p>}
                            <div className={`text-[10px] mt-1 flex items-center justify-end gap-1.5 ${isMe ? 'text-violet-200/80' : 'text-slate-400 dark:text-slate-500'}`}>
                                <span>{formatTime(msg.timestamp)}</span>{isMe && <span>{getStatusIcon(msg.status)}</span>}
                            </div>
                        </div>
                    )}
                  </div>
                  {msg.reactions && msg.reactions.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 relative z-0 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {msg.reactions.map((reaction, i) => (
                              <button key={i} onClick={() => onReaction(msg.id, reaction.emoji)} className="text-xs px-2 py-1 rounded-full border flex items-center gap-1 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                                  <span>{reaction.emoji}</span><span className="font-semibold">{reaction.count > 1 ? reaction.count : ''}</span>
                              </button>
                          ))}
                      </div>
                  )}
                  <div className={`absolute top-2 transition-opacity duration-200 z-50 ${isMe ? '-left-16' : '-right-8'} ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                      <div className="flex gap-1">
                          {isMe && <button onClick={() => startEditing(msg)} className="p-1.5 rounded-full bg-white dark:bg-slate-800 shadow-sm border"><Pencil size={14} /></button>}
                          <div className="relative group/reaction">
                              <button className="p-1.5 rounded-full bg-white dark:bg-slate-800 shadow-sm border"><Smile size={14} /></button>
                              <div className={`absolute bottom-full mb-2 hidden group-hover/reaction:flex z-50 ${isMe ? 'right-0' : 'left-0'}`}>
                                   <div className="bg-white dark:bg-slate-800 border rounded-full shadow-xl p-1.5 flex gap-1">{REACTION_EMOJIS.map(emoji => <button key={emoji} onClick={() => onReaction(msg.id, emoji)} className="w-8 h-8 rounded-full hover:bg-slate-100">{emoji}</button>)}</div>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
            </div>
          );
        })}
        {chat.isTyping && <div className="text-sm text-slate-500 ml-12">Печатает...</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="relative z-10 p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 transition-colors duration-200">
        
        {selectedFiles.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto pb-2 px-1">
                {selectedFiles.map(file => (
                    <div key={file.id} className="relative group flex-shrink-0">
                        <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-700">
                            {file.type === 'image' ? <img src={file.url} className="h-full w-full object-cover rounded-xl" /> : <FileText size={20} />}
                        </div>
                        <button onClick={() => removeAttachment(file.id)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md"><X size={12} /></button>
                    </div>
                ))}
            </div>
        )}

        {showEmojiPicker && (
            <>
            <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)}></div>
            <div className="absolute bottom-full left-4 mb-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-3 grid grid-cols-6 gap-1 w-72 z-20">
                {INPUT_EMOJIS.map(emoji => (
                    <button key={emoji} onClick={() => setInputText(prev => prev + emoji)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xl">{emoji}</button>
                ))}
            </div>
            </>
        )}

        <div className="max-w-4xl mx-auto flex items-end gap-2 bg-slate-100 dark:bg-slate-800/50 p-2 rounded-2xl border border-slate-200 dark:border-slate-700/50 focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20 transition-all relative overflow-hidden">
          
          {isRecording ? (
               <div className="flex-1 flex items-center justify-between px-2 h-12">
                   {/* Recording UI */}
                   {recordMode === 'video' && (
                       <div className="absolute bottom-16 right-4 w-48 h-48 rounded-full border-4 border-violet-500 overflow-hidden shadow-2xl z-50 bg-black animate-pop-in">
                           <video ref={recordingPreviewVideoRef} autoPlay muted className="w-full h-full object-cover mirror-mode" />
                       </div>
                   )}
                   
                   <div className="flex items-center gap-3">
                       <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>
                       <span className="font-mono text-slate-700 dark:text-slate-200 font-medium w-16">{formatDuration(recordingDuration)}</span>
                       <span className="text-sm text-slate-500">{recordMode === 'video' ? 'Запись видеосообщения...' : 'Запись голосового...'}</span>
                   </div>
                   
                   <div className="flex items-center gap-4">
                       <span className="text-xs text-slate-400 animate-pulse hidden sm:block">Отпустите, чтобы отправить</span>
                   </div>
               </div>
          ) : (
              <>
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" multiple accept="image/*,video/*,.pdf,.doc,.docx,.txt" />
                <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded-xl"><Paperclip size={20} /></button>
                
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={selectedFiles.length > 0 ? "Добавьте подпись..." : "Напишите сообщение..."}
                    className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 resize-none focus:outline-none max-h-32 py-2"
                    rows={1}
                    style={{ minHeight: '40px' }}
                />
                <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-2 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded-xl ${showEmojiPicker ? 'text-violet-500 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400'}`}><Smile size={20} /></button>
              </>
          )}

          {/* Action Buttons - Always mounted to catch onPointerUp */}
          {inputText.trim() || selectedFiles.length > 0 ? (
                <button onClick={handleSend} className="p-2 rounded-xl transition-all bg-violet-600 text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500 scale-100"><Send size={20} /></button>
          ) : (
                <div className="flex items-center gap-1 relative z-50">
                    {/* CAMERA BUTTON */}
                    <button 
                        onPointerDown={(e) => handleRecordButtonDown('video', e)}
                        onPointerUp={handleRecordButtonUp}
                        className={`p-2 rounded-xl transition-all active:scale-95 ${isRecording && recordMode === 'video' ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-500/50' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-violet-100 hover:text-violet-600 dark:hover:bg-violet-900/30 dark:hover:text-violet-300'} ${isRecording && recordMode !== 'video' ? 'opacity-0 pointer-events-none w-0 p-0 overflow-hidden' : ''}`}
                    >
                        <Camera size={20} />
                    </button>

                    {/* MIC BUTTON */}
                    <button 
                        onPointerDown={(e) => handleRecordButtonDown('audio', e)}
                        onPointerUp={handleRecordButtonUp}
                        className={`p-2 rounded-xl transition-all active:scale-95 ${isRecording && recordMode === 'audio' ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-500/50' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-violet-100 hover:text-violet-600 dark:hover:bg-violet-900/30 dark:hover:text-violet-300'} ${isRecording && recordMode !== 'audio' ? 'opacity-0 pointer-events-none w-0 p-0 overflow-hidden' : ''}`}
                    >
                        <Mic size={20} />
                    </button>
                </div>
          )}
        </div>
      </div>
    </div>
  );
};
