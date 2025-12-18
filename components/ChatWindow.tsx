
import React, { useState, useRef, useEffect } from 'react';
import { Chat, Attachment, Message, User } from '../types';
import { 
  Send, Paperclip, Smile, MoreVertical, Phone, Video, ArrowLeft, Bot, 
  X, FileText, Mic, MicOff, VideoOff, PhoneOff, Download, Pencil, Check, CheckCheck, PlayCircle, Camera,
  Wand2, Heart, Code, Zap, Eye, Ghost, Droplets, Grid3X3, Film, Sword, Skull, Flame, Cat, ExternalLink, Loader2
} from 'lucide-react';
import { doc, onSnapshot, updateDoc, collection, addDoc, getDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../src/firebase';

// MediaPipe Types
declare global {
  interface Window {
    FaceLandmarker: any;
    FilesetResolver: any;
  }
}

type MaskType = 'none' | 'matrix' | 'hearts' | 'retro' | 'ghost' | 'blur' | 'pixel' | 'vintage' | 'jedi' | 'alien' | 'thermal' | 'jaguar';

const MASKS: { id: MaskType; name: string; icon: React.ReactNode; color: string }[] = [
    { id: 'none', name: 'Нет', icon: <VideoOff size={16} />, color: 'bg-slate-500' },
    { id: 'jaguar', name: 'Jaguar', icon: <Cat size={16} />, color: 'bg-yellow-600' },
    { id: 'alien', name: 'Alien', icon: <Skull size={16} />, color: 'bg-lime-500' },
    { id: 'jedi', name: 'Holo', icon: <Sword size={16} />, color: 'bg-sky-400' },
    { id: 'thermal', name: 'Predator', icon: <Flame size={16} />, color: 'bg-red-600' },
    { id: 'hearts', name: 'Love', icon: <Heart size={16} />, color: 'bg-pink-500' },
    { id: 'matrix', name: 'Matrix', icon: <Code size={16} />, color: 'bg-green-500' },
];

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

export const ChatWindow: React.FC<{ chat: Chat; messages: Message[]; currentUser: User; onSendMessage: any; onEditMessage: any; onBack: any; onReaction: any; onViewProfile: any; }> = ({ chat, messages, currentUser, onSendMessage, onEditMessage, onBack, onReaction, onViewProfile }) => {
  const [inputText, setInputText] = useState('');
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [activeMask, setActiveMask] = useState<MaskType>('none');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showMaskMenu, setShowMaskMenu] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const processedStream = useRef<MediaStream | null>(null);
  const faceLandmarker = useRef<any>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const hiddenVideoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const animationFrameRef = useRef<number | null>(null);

  // 1. Load MediaPipe Scripts
  useEffect(() => {
    const loadScripts = async () => {
      if (window.FaceLandmarker) return;
      return new Promise<void>((resolve) => {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js";
        script.async = true;
        script.onload = () => resolve();
        document.head.appendChild(script);
      });
    };
    loadScripts();
  }, []);

  // 2. Signaling Listener
  useEffect(() => {
    if (!chat.id) return;
    const unsub = onSnapshot(doc(db, 'calls', chat.id), async (snapshot) => {
      const data = snapshot.data();
      if (!data) {
        if (callStatus !== 'idle') hangUp();
        return;
      }

      // Incoming Offer
      if (data.type === 'offer' && data.callerId !== currentUser.id && callStatus === 'idle') {
        setCallType(data.callType);
        setCallStatus('incoming');
      }

      // Answer Received (on caller side)
      if (data.type === 'answer' && data.callerId === currentUser.id && peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
        setCallStatus('connected');
      }

      // Candidates
      if (data.candidates && peerConnection.current) {
        data.candidates.forEach((c: any) => {
          if (c.userId !== currentUser.id) {
            peerConnection.current?.addIceCandidate(new RTCIceCandidate(c));
          }
        });
      }
    });
    return () => unsub();
  }, [chat.id, callStatus]);

  const initFaceLandmarker = async () => {
    if (faceLandmarker.current) return;
    setIsAiLoading(true);
    try {
        const vision = await (window as any).FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        faceLandmarker.current = await (window as any).FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                delegate: "GPU"
            },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1
        });
    } catch (e) { console.error("FaceLandmarker init failed", e); }
    setIsAiLoading(false);
  };

  const processVideoFrame = () => {
    const video = hiddenVideoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (video.readyState < 2 || !ctx) {
        animationFrameRef.current = requestAnimationFrame(processVideoFrame);
        return;
    }

    if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    // Draw background
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    if (activeMask !== 'none' && faceLandmarker.current) {
        const results = faceLandmarker.current.detectForVideo(video, performance.now());
        if (results.faceLandmarks?.[0]) {
            const landmarks = results.faceLandmarks[0];
            const getPt = (idx: number) => ({ x: (1 - landmarks[idx].x) * canvas.width, y: landmarks[idx].y * canvas.height });

            if (activeMask === 'jaguar') {
                const nose = getPt(1);
                ctx.fillStyle = 'rgba(255, 140, 0, 0.7)';
                ctx.beginPath(); ctx.arc(nose.x, nose.y, 20, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = 'black'; ctx.lineWidth = 3;
                [[-10, 0], [10, 0]].forEach(([ox, oy]) => {
                  ctx.beginPath(); ctx.moveTo(nose.x + ox, nose.y + oy); 
                  ctx.lineTo(nose.x + (ox * 6), nose.y - 10); ctx.stroke();
                });
            } else if (activeMask === 'alien') {
                ctx.fillStyle = 'black';
                [33, 263].forEach(idx => {
                    const p = getPt(idx);
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, 30, 45, 0, 0, Math.PI*2); ctx.fill();
                });
            } else if (activeMask === 'matrix') {
                ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
                ctx.fillRect(0,0, canvas.width, canvas.height);
            }
        }
    }
    animationFrameRef.current = requestAnimationFrame(processVideoFrame);
  };

  const createPC = (stream: MediaStream) => {
    const pc = new RTCPeerConnection(rtcConfig);
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getDoc(doc(db, 'calls', chat.id)).then(snap => {
          const data = snap.data() || {};
          const candidates = data.candidates || [];
          updateDoc(doc(db, 'calls', chat.id), {
            candidates: [...candidates, { ...event.candidate.toJSON(), userId: currentUser.id }]
          });
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };

    peerConnection.current = pc;
    return pc;
  };

  const startCall = async (type: 'audio' | 'video') => {
    setCallType(type);
    setCallStatus('calling');
    if (type === 'video') await initFaceLandmarker();
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true });
        localStream.current = stream;
        
        if (type === 'video') {
            hiddenVideoRef.current.srcObject = stream;
            hiddenVideoRef.current.muted = true;
            await hiddenVideoRef.current.play();
            processVideoFrame();
            const cStream = canvasRef.current.captureStream(30);
            cStream.addTrack(stream.getAudioTracks()[0]);
            processedStream.current = cStream;
        } else {
            processedStream.current = stream;
        }

        if (localVideoRef.current) localVideoRef.current.srcObject = processedStream.current;

        const pc = createPC(processedStream.current!);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await setDoc(doc(db, 'calls', chat.id), { 
          type: 'offer', 
          sdp: offer.sdp, 
          callType: type, 
          callerId: currentUser.id,
          candidates: [] 
        });
    } catch (e) { console.error(e); hangUp(); }
  };

  const answerCall = async () => {
    if (callType === 'video') await initFaceLandmarker();
    setCallStatus('connected');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true });
        localStream.current = stream;

        if (callType === 'video') {
            hiddenVideoRef.current.srcObject = stream;
            hiddenVideoRef.current.muted = true;
            await hiddenVideoRef.current.play();
            processVideoFrame();
            const cStream = canvasRef.current.captureStream(30);
            cStream.addTrack(stream.getAudioTracks()[0]);
            processedStream.current = cStream;
        } else {
            processedStream.current = stream;
        }

        if (localVideoRef.current) localVideoRef.current.srcObject = processedStream.current;

        const pc = createPC(processedStream.current!);
        const snap = await getDoc(doc(db, 'calls', chat.id));
        const data = snap.data();
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data!.sdp }));
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await updateDoc(doc(db, 'calls', chat.id), { type: 'answer', sdp: answer.sdp });
    } catch (e) { console.error(e); hangUp(); }
  };

  const hangUp = async () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    localStream.current?.getTracks().forEach(t => t.stop());
    peerConnection.current?.close();
    peerConnection.current = null;
    setCallStatus('idle');
    setCallType(null);
    await deleteDoc(doc(db, 'calls', chat.id)).catch(() => {});
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="md:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><ArrowLeft size={20} /></button>
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onViewProfile(chat.participants[0])}>
            <img src={chat.isGroup ? chat.groupAvatar : chat.participants[0]?.avatar} className="w-10 h-10 rounded-full object-cover" />
            <div>
              <h3 className="font-semibold">{chat.isGroup ? chat.groupName : chat.participants[0]?.name}</h3>
              <span className="text-xs text-slate-500">{chat.isTyping ? 'Печатает...' : 'Онлайн'}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => startCall('audio')} className="p-2.5 text-slate-500 hover:text-violet-600 rounded-full"><Phone size={20} /></button>
          <button onClick={() => startCall('video')} className="p-2.5 text-slate-500 hover:text-violet-600 rounded-full"><Video size={20} /></button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.senderId === currentUser.id ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-2 rounded-2xl shadow-sm ${msg.senderId === currentUser.id ? 'bg-violet-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'}`}>
              {msg.attachments?.map((att, i) => (
                <div key={i} className="mb-2">
                   {att.type === 'image' && <img src={att.url} className="rounded-lg max-h-60 cursor-pointer" onClick={() => setLightboxImage(att.url)} />}
                   {att.type === 'video' && (
                     att.url.startsWith('http') 
                        ? <a href={att.url} target="_blank" className="flex items-center gap-2 p-3 bg-black/20 rounded-lg text-sm font-bold"><ExternalLink size={16}/> Смотреть видео</a>
                        : <video src={att.url} controls className="rounded-lg max-h-60 w-full" />
                   )}
                </div>
              ))}
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              <span className="text-[10px] opacity-60 block text-right mt-1">{msg.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button className="p-3 text-slate-500"><Paperclip size={20} /></button>
          <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2">
            <input 
              value={inputText} 
              onChange={(e) => setInputText(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && onSendMessage(inputText)}
              placeholder="Сообщение..." 
              className="w-full bg-transparent outline-none" 
            />
          </div>
          <button onClick={() => onSendMessage(inputText)} className="p-3 bg-violet-600 text-white rounded-full shadow-lg"><Send size={20} /></button>
        </div>
      </div>

      {/* CALL UI */}
      {callStatus !== 'idle' && (
          <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-4">
              {isAiLoading && <div className="absolute inset-0 z-[110] bg-black/80 flex flex-col items-center justify-center text-white gap-4">
                  <Loader2 size={48} className="animate-spin text-violet-500" />
                  <p className="animate-pulse">Загрузка AR-модулей...</p>
              </div>}

              {callStatus === 'incoming' ? (
                <div className="bg-slate-900 p-8 rounded-3xl text-center space-y-6 animate-slide-up max-w-sm w-full">
                  <div className="w-24 h-24 rounded-full mx-auto relative">
                    <img src={chat.participants[0]?.avatar} className="w-full h-full rounded-full object-cover border-4 border-violet-500" />
                    <div className="absolute inset-0 animate-ping border-4 border-violet-500 rounded-full"></div>
                  </div>
                  <h2 className="text-2xl font-bold text-white">Входящий {callType === 'video' ? 'видеозвонок' : 'звонок'}</h2>
                  <p className="text-slate-400">от {chat.participants[0]?.name}</p>
                  <div className="flex gap-4 justify-center">
                    <button onClick={hangUp} className="p-5 bg-red-500 text-white rounded-full"><PhoneOff size={28}/></button>
                    <button onClick={answerCall} className="p-5 bg-emerald-500 text-white rounded-full"><Phone size={28}/></button>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full relative flex flex-col">
                    <div className="flex-1 relative bg-black rounded-3xl overflow-hidden shadow-2xl">
                        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
                        {callType === 'video' && <video ref={localVideoRef} autoPlay muted playsInline className="absolute bottom-4 right-4 w-32 md:w-48 h-48 md:h-64 bg-slate-800 rounded-2xl object-cover border-2 border-white/20" />}
                    </div>
                    <div className="mt-4 flex justify-center gap-6 p-4">
                        {callType === 'video' && <button onClick={() => setShowMaskMenu(!showMaskMenu)} className={`p-4 rounded-full transition-colors ${showMaskMenu ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300'}`}><Wand2 size={24}/></button>}
                        <button onClick={hangUp} className="p-4 bg-red-500 text-white rounded-full shadow-lg"><PhoneOff size={32}/></button>
                    </div>
                    {showMaskMenu && (
                        <div className="mt-4 flex gap-4 overflow-x-auto p-4 scrollbar-hide">
                            {MASKS.map(m => (
                                <button key={m.id} onClick={() => setActiveMask(m.id)} className={`flex-shrink-0 flex flex-col items-center gap-1 p-3 rounded-2xl ${activeMask === m.id ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                    {m.icon}
                                    <span className="text-[10px]">{m.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
              )}
          </div>
      )}

      {/* Lightbox */}
      {lightboxImage && (
          <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4" onClick={() => setLightboxImage(null)}>
              <img src={lightboxImage} className="max-w-full max-h-screen object-contain" />
          </div>
      )}
    </div>
  );
};
