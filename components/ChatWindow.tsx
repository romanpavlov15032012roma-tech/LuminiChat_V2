import React, { useState, useRef, useEffect } from 'react';
import { Chat, Attachment, Message } from '../types';
import { User } from '../types';
import { 
  Send, Paperclip, Smile, MoreVertical, Phone, Video, ArrowLeft, Bot, 
  X, Image as ImageIcon, FileText, Mic, MicOff, VideoOff, PhoneOff, Plus, Download, Pencil, Check, CheckCheck, Clock, Play, Trash2, StopCircle, PlayCircle, Camera
} from 'lucide-react';
import { doc, onSnapshot, setDoc, updateDoc, collection, addDoc, getDoc, deleteDoc, addDoc as firestoreAddDoc } from 'firebase/firestore';
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
        { urls: 'stun:stun2.l.google.com:19302' },
    ],
};

export const ChatWindow: React.FC<ChatWindowProps> = ({ chat, messages, currentUser, onSendMessage, onEditMessage, onBack, onReaction, onViewProfile }) => {
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Attachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  
  // Video Playback State
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  // Editing state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  // --- REAL CALL STATE ---
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidate[]>([]); // Queue for candidates
  
  // --- RECORDING STATE (Audio & Video) ---
  const [recordMode, setRecordMode] = useState<'audio' | 'video'>('audio');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingPreviewVideoRef = useRef<HTMLVideoElement>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const participant = chat.participants[0];

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


  // --- REAL WEB RTC IMPLEMENTATION ---

  // Fix: Recording Preview
  useEffect(() => {
      if (isRecording && recordMode === 'video' && recordingPreviewVideoRef.current && recordingStreamRef.current) {
          recordingPreviewVideoRef.current.srcObject = recordingStreamRef.current;
          recordingPreviewVideoRef.current.play().catch(e => console.log("Preview play error", e));
      }
  }, [isRecording, recordMode]);

  // Fix: Call Video Elements
  useEffect(() => {
      // Local Video
      if (callStatus !== 'idle' && localVideoRef.current && localStream.current) {
          localVideoRef.current.srcObject = localStream.current;
      }
      // Remote Video
      if (callStatus === 'connected' && remoteVideoRef.current && peerConnection.current) {
          const remoteStream = new MediaStream();
          peerConnection.current.getReceivers().forEach(receiver => {
              if (receiver.track) {
                  remoteStream.addTrack(receiver.track);
              }
          });
          remoteVideoRef.current.srcObject = remoteStream;
      }
  }, [callStatus, isVideoEnabled]);

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
              remoteVideoRef.current.srcObject = event.streams[0];
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
              video: type === 'video', 
              audio: true 
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
              type: 'offer',
              sdp: offer.sdp,
              callType: type,
              callerId: currentUser.id
          });

          // Listen for Answer
          const unsubscribe = onSnapshot(doc(db, 'calls', chat.id), async (snapshot) => {
              const data = snapshot.data();
              if (pc && !pc.currentRemoteDescription && data?.answer) {
                  const answer = new RTCSessionDescription({
                      type: 'answer',
                      sdp: data.answer.sdp
                  });
                  await pc.setRemoteDescription(answer);
                  setCallStatus('connected');
                  
                  // Process queued candidates
                  iceCandidatesQueue.current.forEach(c => pc.addIceCandidate(c).catch(console.error));
                  iceCandidatesQueue.current = [];
              }
          });
          
          // Listen for candidates
          onSnapshot(collection(db, 'calls', chat.id, 'candidates'), (snapshot) => {
              snapshot.docChanges().forEach((change) => {
                  if (change.type === 'added') {
                       const candidate = new RTCIceCandidate(change.doc.data());
                       if (pc && pc.remoteDescription) {
                           pc.addIceCandidate(candidate).catch(console.error);
                       } else {
                           iceCandidatesQueue.current.push(candidate);
                       }
                  }
              });
          });

      } catch (e) {
          console.error("Error starting call:", e);
          alert("Ошибка доступа к камере или микрофону. Разрешите доступ в браузере.");
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
            video: callData.callType === 'video', 
            audio: true 
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

          await updateDoc(doc(db, 'calls', chat.id), {
              answer: { type: 'answer', sdp: answer.sdp }
          });
          
          // Process queued candidates
          iceCandidatesQueue.current.forEach(c => pc.addIceCandidate(c).catch(console.error));
          iceCandidatesQueue.current = [];

          onSnapshot(collection(db, 'calls', chat.id, 'candidates'), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                     const candidate = new RTCIceCandidate(change.doc.data());
                     if (pc && pc.remoteDescription) {
                         pc.addIceCandidate(candidate).catch(console.error);
                     } else {
                         iceCandidatesQueue.current.push(candidate);
                     }
                }
            });
          });

      } catch (e) {
          console.error("Error answering call", e);
          hangUp();
      }
  };

  const hangUp = async () => {
      if (localStream.current) {
          localStream.current.getTracks().forEach(track => track.stop());
          localStream.current = null;
      }
      if (peerConnection.current) {
          peerConnection.current.close();
          peerConnection.current = null;
      }
      setCallStatus('idle');
      try {
          await deleteDoc(doc(db, 'calls', chat.id));
      } catch (e) {}
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


  // --- RECORDING LOGIC (SEPARATE BUTTONS) ---

  const handleRecordButtonDown = (mode: 'audio' | 'video', e: React.PointerEvent) => {
      e.preventDefault();
      setRecordMode(mode);
      
      // Delay recording start slightly to prevent accidental clicks
      pressTimerRef.current = setTimeout(() => {
          startRecording(mode);
      }, 200);
  };

  const handleRecordButtonUp = (e: React.PointerEvent) => {
      e.preventDefault();
      
      if (pressTimerRef.current) {
          // Timer didn't fire (short tap) -> Do nothing or maybe handle as toggle in future
          clearTimeout(pressTimerRef.current);
          pressTimerRef.current = null;
      } else if (isRecording) {
          // Timer fired, so we were recording -> stop
          stopRecording(true);
      }
  };

  const startRecording = async (mode: 'audio' | 'video') => {
    try {
        const constraints = mode === 'video' 
            ? { video: { facingMode: "user", width: { ideal: 400 }, height: { ideal: 400 } }, audio: true }
            : { audio: true };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        recordingStreamRef.current = stream;

        if (mode === 'video' && recordingPreviewVideoRef.current) {
            recordingPreviewVideoRef.current.srcObject = stream;
        }

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        recordedChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
            }
        };

        mediaRecorder.start();
        setIsRecording(true);
        setRecordingDuration(0);

        recordingTimerRef.current = setInterval(() => {
            setRecordingDuration(prev => prev + 1);
        }, 1000);

    } catch (e) {
        console.error("Error accessing media devices:", e);
        alert("Ошибка доступа к камере или микрофону. Проверьте разрешения.");
        setIsRecording(false);
    }
  };

  const stopRecording = (shouldSend: boolean) => {
      if (mediaRecorderRef.current && isRecording) {
          mediaRecorderRef.current.stop();
          if (recordingStreamRef.current) {
              recordingStreamRef.current.getTracks().forEach(track => track.stop());
              recordingStreamRef.current = null;
          }
          
          mediaRecorderRef.current.onstop = () => {
              if (shouldSend && recordedChunksRef.current.length > 0) {
                  const mimeType = recordMode === 'video' ? 'video/webm' : 'audio/webm';
                  const blob = new Blob(recordedChunksRef.current, { type: mimeType });
                  
                  const reader = new FileReader();
                  reader.readAsDataURL(blob);
                  reader.onloadend = () => {
                      const base64Data = reader.result as string;
                      const durationStr = formatDuration(recordingDuration);
                      
                      const attachment: Attachment = {
                          id: Date.now().toString(),
                          type: recordMode === 'video' ? 'video' : 'audio',
                          url: base64Data,
                          name: recordMode === 'video' ? 'Видеосообщение' : 'Голосовое сообщение',
                          duration: durationStr
                      };
                      
                      onSendMessage('', [attachment]);
                  };
              }
          };
      }
      
      if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
      }
      setIsRecording(false);
      setRecordingDuration(0);
      mediaRecorderRef.current = null;
      recordedChunksRef.current = [];
  };

  const cancelRecording = () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      stopRecording(false);
  };

  // --- End Recording Logic ---

  const handleSend = () => {
    if (inputText.trim() || selectedFiles.length > 0) {
      onSendMessage(inputText, selectedFiles);
      setInputText('');
      setSelectedFiles([]);
      setShowEmojiPicker(false);
    }
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
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          saveEdit();
      } else if (e.key === 'Escape') {
          cancelEdit();
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
                  }
                  else if (file.type.startsWith('video/')) type = 'video';

                  const newAttachment: Attachment = {
                      id: Date.now().toString(),
                      type: type,
                      url: finalUrl,
                      name: file.name,
                      size: fileSize
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

  const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (date: Date | string | undefined) => {
    if (!date) return '';
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
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
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
             <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-violet-600/5 dark:bg-violet-600/10 rounded-full blur-[100px]"></div>
             <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-blue-600/5 dark:bg-blue-600/10 rounded-full blur-[100px]"></div>
        </div>

      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="md:hidden text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white">
            <ArrowLeft size={24} />
          </button>
          
          <div 
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onViewProfile(participant)}
          >
             <div className="relative">
                <img src={participant.avatar} alt={participant.name} className="w-10 h-10 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700" />
                {participant.isOnline && (
                    <>
                        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900 z-20"></span>
                        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full animate-ping opacity-75 z-10"></span>
                    </>
                )}
             </div>
             
             <div className="flex flex-col">
                <h2 className="text-slate-800 dark:text-slate-100 font-bold text-lg flex items-center gap-2 hover:text-violet-600 dark:hover:text-violet-200 transition-colors">
                    {participant.name}
                    {participant.isAi && <Bot size={18} className="text-violet-500 dark:text-violet-400" />}
                </h2>
                <div className={`text-xs flex items-center gap-1.5 ${participant.isOnline ? 'text-emerald-500 dark:text-emerald-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                    {participant.isAi ? (
                        'ИИ Ассистент'
                    ) : (participant.isOnline ? (
                        <>
                            <span className="w-1.5 h-1.5 bg-emerald-500 dark:bg-emerald-400 rounded-full animate-pulse"></span>
                            В сети
                        </>
                    ) : (
                        'Был(а) недавно'
                    ))}
                </div>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <button onClick={() => startCall('audio')} className="hover:text-violet-500 dark:hover:text-violet-400 transition-colors p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><Phone size={20} /></button>
          <button onClick={() => startCall('video')} className="hover:text-violet-500 dark:hover:text-violet-400 transition-colors p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><Video size={20} /></button>
          <button onClick={() => onViewProfile(participant)} className="hover:text-violet-500 dark:hover:text-violet-400 transition-colors p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><MoreVertical size={20} /></button>
        </div>
      </div>

      {/* --- REAL CALL OVERLAY --- */}
      {callStatus !== 'idle' && (
          <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center animate-fade-in">
             
             <div className="absolute inset-0 w-full h-full overflow-hidden">
                 {callType === 'video' && (
                     <video 
                        ref={remoteVideoRef} 
                        autoPlay 
                        playsInline
                        className="w-full h-full object-cover"
                     />
                 )}
                 {(callType === 'audio' || !remoteVideoRef.current?.srcObject) && (
                     <>
                        <img src={participant.avatar} className="absolute inset-0 w-full h-full object-cover opacity-20 blur-2xl" />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/50 to-slate-950/80"></div>
                     </>
                 )}
             </div>

             {callType === 'video' && (
                 <div className="absolute top-4 right-4 w-32 h-48 bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-700 z-20">
                     <video 
                        ref={localVideoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover mirror-mode"
                     />
                 </div>
             )}
             
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
                                {callStatus === 'calling' && (
                                    <div className="absolute inset-0 bg-violet-500 rounded-full animate-pulse-ring"></div>
                                )}
                                <img src={participant.avatar} className="w-32 h-32 rounded-full border-4 border-slate-800 relative z-10 shadow-2xl" />
                             </div>
                        )}
                        {callStatus !== 'incoming' && (
                             <h2 className="text-2xl font-bold text-white mb-2">{participant.name}</h2>
                        )}
                        <p className="text-slate-300 font-medium mb-8">
                            {callStatus === 'calling' ? 'Звонок...' : callStatus === 'connected' ? 'Разговор' : ''}
                        </p>
                     </div>
                 )}
                 
                 <div className="flex items-center gap-6 mt-auto mb-12">
                     {callStatus === 'incoming' ? (
                         <>
                            <button 
                                onClick={hangUp}
                                className="p-5 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg"
                            >
                                <PhoneOff size={32} />
                            </button>
                            <button 
                                onClick={answerCall}
                                className="p-5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg animate-pulse"
                            >
                                <Phone size={32} />
                            </button>
                         </>
                     ) : (
                         <>
                            <button 
                                onClick={toggleMute}
                                className={`p-4 rounded-full transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-800/80 text-white hover:bg-slate-700'}`}
                            >
                                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                            </button>
                            
                            <button 
                                onClick={hangUp}
                                className="p-5 rounded-full bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/30 transform hover:scale-110 transition-all"
                            >
                                <PhoneOff size={32} />
                            </button>
                            
                            {callType === 'video' && (
                                <button 
                                    onClick={toggleVideo}
                                    className={`p-4 rounded-full transition-all ${!isVideoEnabled ? 'bg-white text-slate-900' : 'bg-slate-800/80 text-white hover:bg-slate-700'}`}
                                >
                                    {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
                                </button>
                            )}
                         </>
                     )}
                 </div>
             </div>
          </div>
      )}

      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.map((msg, index) => {
          const isMe = msg.senderId === currentUser.id;
          const showAvatar = !isMe && (index === 0 || messages[index - 1].senderId !== msg.senderId);
          const isHovered = hoveredMessageId === msg.id;
          const isEditingThis = editingMessageId === msg.id;

          return (
            <div 
                key={msg.id} 
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1 animate-message-in relative group/messageRow`}
                style={{ 
                    zIndex: isHovered || isEditingThis ? 50 : 'auto',
                }}
                onMouseEnter={() => !isEditingThis && setHoveredMessageId(msg.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
            >
                {!isMe && (
                    <div className={`w-8 h-8 mr-2 flex-shrink-0 ${showAvatar ? 'opacity-100 cursor-pointer' : 'opacity-0'}`} onClick={() => onViewProfile(participant)}>
                        <img src={participant.avatar} className="w-8 h-8 rounded-full" />
                    </div>
                )}
              
              <div className="relative max-w-[85%] md:max-w-[70%] flex flex-col group/bubbleContainer">
                  <div 
                    className={`px-3 py-2 rounded-2xl relative shadow-sm overflow-hidden z-0 ${
                      isMe 
                        ? 'bg-violet-600 text-white rounded-br-sm shadow-violet-900/20' 
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm border border-slate-200 dark:border-slate-700 shadow-md'
                    } ${isEditingThis ? 'ring-2 ring-violet-400 ring-offset-2 ring-offset-slate-900' : ''}`}
                  >
                    {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mb-2 space-y-2">
                            {msg.attachments.map(att => (
                                <div key={att.id}>
                                    {att.type === 'image' ? (
                                        <img src={att.url} alt="Attachment" className="rounded-lg max-h-60 object-cover w-full cursor-pointer hover:opacity-90 transition-opacity" />
                                    ) : att.type === 'video' ? (
                                        <div className={`rounded-lg overflow-hidden bg-black relative group/video ${att.name === 'Видеосообщение' ? 'w-64 h-64 rounded-full object-cover border-4 border-white/20' : 'max-h-60 w-full'}`}>
                                            {playingVideoId === att.id ? (
                                                <video 
                                                    src={att.url} 
                                                    controls 
                                                    autoPlay 
                                                    className={`w-full h-full ${att.name === 'Видеосообщение' ? 'object-cover' : 'object-contain'}`}
                                                    onEnded={() => setPlayingVideoId(null)}
                                                />
                                            ) : (
                                                <div 
                                                    className="relative w-full h-full cursor-pointer" 
                                                    onClick={() => setPlayingVideoId(att.id)}
                                                >
                                                    <video src={att.url} className={`w-full h-full ${att.name === 'Видеосообщение' ? 'object-cover' : 'object-contain'}`} />
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover/video:bg-black/20 transition-all">
                                                        <PlayCircle size={48} className="text-white opacity-90 drop-shadow-lg transform group-hover/video:scale-110 transition-transform" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : att.type === 'audio' ? (
                                        <div className={`flex items-center gap-3 p-2 rounded-xl w-60 ${isMe ? 'bg-violet-500/50' : 'bg-slate-100 dark:bg-slate-700'}`}>
                                            <div className="p-2 rounded-full bg-white/20">
                                                <Mic size={20} className={isMe ? 'text-white' : 'text-slate-600 dark:text-slate-300'} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <audio src={att.url} controls className="w-full h-8" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3 bg-black/5 dark:bg-black/20 p-3 rounded-lg">
                                            <div className="p-2 bg-black/5 dark:bg-white/10 rounded-lg">
                                                <FileText size={20} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium truncate">{att.name}</div>
                                                <div className="text-xs opacity-70">{att.size}</div>
                                            </div>
                                            <a href={att.url} download={att.name} className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-full">
                                                <Download size={16} />
                                            </a>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {isEditingThis ? (
                        <div className="min-w-[200px]">
                            <input 
                                ref={editInputRef}
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                className="w-full bg-black/20 text-white p-2 rounded focus:outline-none mb-2"
                            />
                            <div className="flex justify-end gap-2">
                                <button onClick={cancelEdit} className="p-1 hover:bg-white/10 rounded"><X size={14} /></button>
                                <button onClick={saveEdit} className="p-1 bg-white/20 hover:bg-white/30 rounded"><Check size={14} /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                             {msg.text && (
                                <p className="whitespace-pre-wrap text-[15px] leading-relaxed break-words relative z-10 pr-2">
                                    {msg.text}
                                    {msg.isEdited && <span className="text-[10px] opacity-60 ml-1 italic">(ред.)</span>}
                                </p>
                             )}
                            <div className={`text-[10px] mt-1 flex items-center justify-end gap-1.5 ${isMe ? 'text-violet-200/80' : 'text-slate-400 dark:text-slate-500'}`}>
                                <span>{formatTime(msg.timestamp)}</span>
                                {isMe && (
                                    <span title={msg.status}>
                                        {getStatusIcon(msg.status)}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                  </div>
                  
                  {msg.reactions && msg.reactions.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 relative z-0 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {msg.reactions.map((reaction, i) => (
                              <button 
                                key={i}
                                onClick={() => onReaction(msg.id, reaction.emoji)}
                                className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 transition-colors ${
                                    reaction.userId === currentUser.id 
                                        ? 'bg-violet-100 dark:bg-violet-500/20 border-violet-200 dark:border-violet-500/50 text-violet-700 dark:text-violet-200' 
                                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                              >
                                  <span>{reaction.emoji}</span>
                                  <span className="font-semibold">{reaction.count > 1 ? reaction.count : ''}</span>
                              </button>
                          ))}
                      </div>
                  )}

                  <div 
                    className={`absolute top-2 transition-opacity duration-200 z-50 ${isMe ? '-left-16' : '-right-8'} ${isHovered ? 'opacity-100' : 'opacity-0'}`}
                  >
                      <div className="flex gap-1">
                          {isMe && (
                              <button 
                                onClick={() => startEditing(msg)}
                                className="p-1.5 rounded-full bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-400 hover:text-violet-500 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-700"
                                title="Редактировать"
                              >
                                  <Pencil size={14} />
                              </button>
                          )}

                          <div className="relative group/reaction">
                              <div className="absolute -inset-4 bg-transparent z-0 hidden group-hover/reaction:block"></div>

                              <button className="relative z-10 p-1.5 rounded-full bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-400 hover:text-violet-500 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-700">
                                 <Smile size={14} />
                              </button>
                              
                              <div className={`absolute bottom-full mb-2 hidden group-hover/reaction:flex z-50 ${isMe ? 'right-0' : 'left-0'}`}>
                                   <div className="absolute top-full w-full h-4 bg-transparent"></div>
                                   
                                   <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-xl p-1.5 flex gap-1 animate-slide-up whitespace-nowrap">
                                      {REACTION_EMOJIS.map(emoji => (
                                          <button 
                                            key={emoji}
                                            onClick={() => onReaction(msg.id, emoji)}
                                            className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all hover:scale-125 transform"
                                          >
                                              {emoji}
                                          </button>
                                      ))}
                                      <button 
                                        onClick={() => {
                                            onReaction(msg.id, '👍'); 
                                        }}
                                        className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all"
                                      >
                                          <Plus size={16} />
                                      </button>
                                   </div>
                              </div>
                          </div>
                      </div>
                  </div>

              </div>
            </div>
          );
        })}
        {chat.isTyping && (
             <div className="flex justify-start mb-1 animate-slide-up">
                 <div className="w-8 h-8 mr-2 flex-shrink-0">
                        <img src={participant.avatar} className="w-8 h-8 rounded-full" />
                 </div>
                 <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1 items-center h-10">
                     <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                     <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                     <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"></span>
                 </div>
             </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="relative z-10 p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 transition-colors duration-200">
        
        {selectedFiles.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto pb-2 px-1">
                {selectedFiles.map(file => (
                    <div key={file.id} className="relative group flex-shrink-0">
                        {file.type === 'image' ? (
                            <img src={file.url} className="h-16 w-16 object-cover rounded-xl border border-slate-200 dark:border-slate-700" />
                        ) : file.type === 'video' ? (
                            <div className="h-16 w-16 bg-black rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center">
                                <video src={file.url} className="h-full w-full object-cover opacity-50" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Play size={20} className="text-white fill-white" />
                                </div>
                            </div>
                        ) : (
                            <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-1">
                                <FileText size={20} className="text-slate-400 mb-1" />
                                <span className="text-[8px] text-slate-500 w-full text-center truncate">{file.name}</span>
                            </div>
                        )}
                        <button 
                            onClick={() => removeAttachment(file.id)}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600 transition-colors"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
            </div>
        )}

        {showEmojiPicker && (
            <>
            <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)}></div>
            <div className="absolute bottom-full left-4 mb-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-3 grid grid-cols-6 gap-1 w-72 z-20">
                {INPUT_EMOJIS.map(emoji => (
                    <button 
                        key={emoji}
                        onClick={() => {
                            setInputText(prev => prev + emoji);
                        }}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xl transition-colors"
                    >
                        {emoji}
                    </button>
                ))}
            </div>
            </>
        )}

        <div className="max-w-4xl mx-auto flex items-end gap-2 bg-slate-100 dark:bg-slate-800/50 p-2 rounded-2xl border border-slate-200 dark:border-slate-700/50 focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20 transition-all relative overflow-hidden">
          
          {isRecording ? (
               <div className="flex-1 flex items-center justify-between px-2 h-12">
                   {recordMode === 'video' && (
                       <div className="absolute bottom-16 right-4 w-48 h-48 rounded-full border-4 border-violet-500 overflow-hidden shadow-2xl z-50 bg-black animate-pop-in">
                           <video 
                                ref={recordingPreviewVideoRef} 
                                autoPlay 
                                muted 
                                className="w-full h-full object-cover mirror-mode"
                           />
                       </div>
                   )}
                   
                   <div className="flex items-center gap-3">
                       <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                       </span>
                       <span className="font-mono text-slate-700 dark:text-slate-200 font-medium w-16">
                           {formatDuration(recordingDuration)}
                       </span>
                       <span className="text-sm text-slate-500">
                           {recordMode === 'video' ? 'Запись видеосообщения...' : 'Запись голосового...'}
                       </span>
                   </div>
                   
                   <div className="flex items-center gap-2">
                       <button 
                           onPointerUp={cancelRecording}
                           className="text-sm text-red-500 hover:text-red-600 font-medium px-3"
                       >
                           Отмена
                       </button>
                   </div>
               </div>
          ) : (
              <>
                <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                    multiple 
                    accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded-xl"
                >
                    <Paperclip size={20} />
                </button>
                
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={selectedFiles.length > 0 ? "Добавьте подпись..." : "Напишите сообщение..."}
                    className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 resize-none focus:outline-none max-h-32 py-2"
                    rows={1}
                    style={{ minHeight: '40px' }}
                />
                
                <button 
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={`p-2 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded-xl ${showEmojiPicker ? 'text-violet-500 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                >
                    <Smile size={20} />
                </button>

                {inputText.trim() || selectedFiles.length > 0 ? (
                    <button 
                        onClick={handleSend}
                        className="p-2 rounded-xl transition-all bg-violet-600 text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500 scale-100"
                    >
                        <Send size={20} />
                    </button>
                ) : (
                    <div className="flex items-center gap-1">
                        <button 
                            onPointerDown={(e) => handleRecordButtonDown('video', e)}
                            onPointerUp={handleRecordButtonUp}
                            onPointerLeave={cancelRecording}
                            className="p-2 rounded-xl transition-all bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-violet-100 hover:text-violet-600 dark:hover:bg-violet-900/30 dark:hover:text-violet-300 active:scale-95"
                        >
                            <Camera size={20} />
                        </button>
                        <button 
                            onPointerDown={(e) => handleRecordButtonDown('audio', e)}
                            onPointerUp={handleRecordButtonUp}
                            onPointerLeave={cancelRecording}
                            className="p-2 rounded-xl transition-all bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-violet-100 hover:text-violet-600 dark:hover:bg-violet-900/30 dark:hover:text-violet-300 active:scale-95"
                        >
                            <Mic size={20} />
                        </button>
                    </div>
                )}
              </>
          )}
        </div>
      </div>
    </div>
  );
};