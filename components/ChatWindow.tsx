
import React, { useState, useRef, useEffect } from 'react';
import { Chat, Attachment, Message } from '../types';
import { User } from '../types';
import { 
  Send, Paperclip, Smile, MoreVertical, Phone, Video, ArrowLeft, Bot, 
  X, FileText, Mic, MicOff, VideoOff, PhoneOff, Download, Pencil, Check, CheckCheck, Clock, Play, PlayCircle, Camera,
  Wand2, Heart, Code, Zap, Eye, Ghost, Droplets, Grid3X3, Film, Sword, Skull, Flame, Cat, ExternalLink
} from 'lucide-react';
import { doc, onSnapshot, updateDoc, collection, addDoc, getDoc, deleteDoc, setDoc, addDoc as firestoreAddDoc, serverTimestamp, deleteField } from 'firebase/firestore';
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

type MaskType = 'none' | 'matrix' | 'hearts' | 'retro' | 'ghost' | 'blur' | 'pixel' | 'vintage' | 'jedi' | 'alien' | 'thermal' | 'jaguar';

const MASKS: { id: MaskType; name: string; icon: React.ReactNode; color: string }[] = [
    { id: 'none', name: 'Нет', icon: <VideoOff size={16} />, color: 'bg-slate-500' },
    { id: 'blur', name: 'Blur', icon: <Droplets size={16} />, color: 'bg-blue-400' },
    { id: 'pixel', name: '8-Bit', icon: <Grid3X3 size={16} />, color: 'bg-orange-500' },
    { id: 'vintage', name: '1980s', icon: <Film size={16} />, color: 'bg-amber-700' },
    { id: 'jaguar', name: 'Jaguar', icon: <Cat size={16} />, color: 'bg-yellow-600' },
    { id: 'alien', name: 'Alien', icon: <Skull size={16} />, color: 'bg-lime-500' },
    { id: 'jedi', name: 'Jedi', icon: <Sword size={16} />, color: 'bg-sky-400' },
    { id: 'thermal', name: 'Predator', icon: <Flame size={16} />, color: 'bg-red-600' },
    { id: 'hearts', name: 'Love', icon: <Heart size={16} />, color: 'bg-pink-500' },
    { id: 'matrix', name: 'Matrix', icon: <Code size={16} />, color: 'bg-green-500' },
    { id: 'retro', name: 'Neon', icon: <Zap size={16} />, color: 'bg-violet-500' },
    { id: 'ghost', name: 'Ghost', icon: <Ghost size={16} />, color: 'bg-cyan-500' },
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

// --- PARTICLES SYSTEM FOR MASKS ---
class ParticleSystem {
    particles: any[] = [];
    width: number = 0;
    height: number = 0;

    constructor() {}

    resize(w: number, h: number) {
        this.width = w;
        this.height = h;
    }

    updateHearts(ctx: CanvasRenderingContext2D) {
        if (Math.random() < 0.1) {
            this.particles.push({
                x: Math.random() * this.width,
                y: this.height + 20,
                size: Math.random() * 20 + 10,
                speed: Math.random() * 2 + 1,
                swing: Math.random() * 2,
                angle: 0
            });
        }

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.y -= p.speed;
            p.angle += 0.05;
            p.x += Math.sin(p.angle) * p.swing;
            
            ctx.font = `${p.size}px serif`;
            ctx.fillText("❤️", p.x, p.y);

            if (p.y < -50) {
                this.particles.splice(i, 1);
                i--;
            }
        }
    }

    updateMatrix(ctx: CanvasRenderingContext2D) {
        // Initialize columns if empty
        if (this.particles.length === 0) {
            const columns = Math.floor(this.width / 20);
            for (let i = 0; i < columns; i++) {
                this.particles[i] = Math.random() * this.height; // Store Y pos
            }
        }

        ctx.fillStyle = '#0F0';
        ctx.font = '15px monospace';
        
        for (let i = 0; i < this.particles.length; i++) {
            const text = String.fromCharCode(0x30A0 + Math.random() * 96);
            const x = i * 20;
            const y = this.particles[i] * 20;
            
            ctx.fillText(text, x, y);

            if (y > this.height && Math.random() > 0.975) {
                this.particles[i] = 0;
            }
            this.particles[i]++;
        }
    }
    
    clear() {
        this.particles = [];
    }
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ chat, messages, currentUser, onSendMessage, onEditMessage, onBack, onReaction, onViewProfile }) => {
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Attachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  
  // -- VIDEO PROCESSING STATE --
  const [activeMask, setActiveMask] = useState<MaskType>('none');
  const [showMaskMenu, setShowMaskMenu] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null); // Raw Camera Stream
  const processedStream = useRef<MediaStream | null>(null); // Canvas Stream
  const iceCandidatesQueue = useRef<RTCIceCandidate[]>([]); 
  
  // Hidden elements for processing
  const hiddenVideoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const animationFrameRef = useRef<number | null>(null);
  const particleSystem = useRef<ParticleSystem>(new ParticleSystem());

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
  
  const lastTypingSentRef = useRef<number>(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

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
    const handleClickOutside = (event: MouseEvent) => {
      if (activeReactionMessageId) {
        const target = event.target as HTMLElement;
        if (!target.closest('.reaction-menu-container') && !target.closest('.reaction-trigger-btn')) {
          setActiveReactionMessageId(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeReactionMessageId]);

  // --- VIDEO PROCESSING LOOP ---
  const processVideoFrame = () => {
      const video = hiddenVideoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              particleSystem.current.resize(canvas.width, canvas.height);
          }

          const mask = activeMask;
          const cx = canvas.width / 2;
          const cy = canvas.height / 2;

          // 1. CLEAR & DRAW BASE
          if (mask === 'blur') {
             ctx.filter = 'blur(10px)';
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
             ctx.filter = 'none';
          } else if (mask === 'vintage') {
             ctx.filter = 'sepia(0.8) contrast(1.2)';
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
             ctx.filter = 'none';
             // Film grain noise
             ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
             for(let i=0; i<100; i++) {
                 ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
             }
          } else if (mask === 'pixel') {
             const scale = 0.1; // 10% resolution
             const w = canvas.width * scale;
             const h = canvas.height * scale;
             // Draw tiny
             ctx.drawImage(video, 0, 0, w, h);
             // Draw back huge with no smoothing
             ctx.imageSmoothingEnabled = false;
             ctx.drawImage(canvas, 0, 0, w, h, 0, 0, canvas.width, canvas.height);
             ctx.imageSmoothingEnabled = true;
          } else if (mask === 'jedi') {
             // Hologram Effect
             ctx.filter = 'brightness(1.2) contrast(1.1) hue-rotate(180deg)'; // Shift towards blue
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
             ctx.filter = 'none';
             
             // Blue Tint Overlay
             ctx.fillStyle = 'rgba(0, 100, 255, 0.2)';
             ctx.fillRect(0,0, canvas.width, canvas.height);
             
             // Scanlines
             ctx.fillStyle = 'rgba(0, 20, 100, 0.3)';
             const time = Date.now() / 20;
             for (let y = 0; y < canvas.height; y += 4) {
                 if ((y + time) % 16 < 8) {
                     ctx.fillRect(0, y, canvas.width, 2);
                 }
             }
          } else if (mask === 'alien') {
             // Alien Skin (Shift RGB)
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
             const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
             const data = imageData.data;
             for (let i = 0; i < data.length; i += 4) {
                 const r = data[i];
                 const b = data[i+2];
                 data[i] = b; // R becomes B
                 data[i+2] = r; // B becomes R
                 data[i+1] = Math.min(255, data[i+1] * 1.5); // Boost Green
             }
             ctx.putImageData(imageData, 0, 0);

             // Draw Alien Eyes (Centered AR)
             ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
             // Left
             ctx.beginPath();
             ctx.ellipse(cx - 50, cy - 30, 30, 50, Math.PI / 8, 0, Math.PI * 2);
             ctx.fill();
             // Right
             ctx.beginPath();
             ctx.ellipse(cx + 50, cy - 30, 30, 50, -Math.PI / 8, 0, Math.PI * 2);
             ctx.fill();
             // Shine
             ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
             ctx.beginPath(); ctx.arc(cx - 40, cy - 40, 5, 0, Math.PI*2); ctx.fill();
             ctx.beginPath(); ctx.arc(cx + 60, cy - 40, 5, 0, Math.PI*2); ctx.fill();

          } else if (mask === 'thermal') {
             // Simulated Thermal Vision
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
             const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
             const data = imageData.data;
             for (let i = 0; i < data.length; i += 4) {
                 const avg = (data[i] + data[i+1] + data[i+2]) / 3;
                 if (avg < 80) {
                     data[i] = 0; data[i+1] = 0; data[i+2] = avg * 3; // Blue
                 } else if (avg < 160) {
                     data[i] = (avg - 80) * 3; data[i+1] = 0; data[i+2] = 255 - (avg-80)*3; // Red
                 } else {
                     data[i] = 255; data[i+1] = (avg - 160) * 3; data[i+2] = 0; // Yellow
                 }
             }
             ctx.putImageData(imageData, 0, 0);
          } else if (mask === 'jaguar') {
             // Jaguar/Cat Filter
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
             
             // 1. Warm Orange Tint
             ctx.globalCompositeOperation = 'overlay';
             ctx.fillStyle = 'rgba(255, 165, 0, 0.2)';
             ctx.fillRect(0,0, canvas.width, canvas.height);
             ctx.globalCompositeOperation = 'source-over';

             // 2. Ears (Triangles at top)
             ctx.fillStyle = 'rgba(255, 140, 0, 0.9)'; // Orange
             ctx.strokeStyle = '#333';
             ctx.lineWidth = 3;
             
             // Left Ear
             ctx.beginPath();
             ctx.moveTo(cx - 80, cy - 120);
             ctx.lineTo(cx - 140, cy - 200);
             ctx.lineTo(cx - 30, cy - 160);
             ctx.closePath();
             ctx.fill(); ctx.stroke();
             
             // Right Ear
             ctx.beginPath();
             ctx.moveTo(cx + 80, cy - 120);
             ctx.lineTo(cx + 140, cy - 200);
             ctx.lineTo(cx + 30, cy - 160);
             ctx.closePath();
             ctx.fill(); ctx.stroke();

             // 3. Nose
             ctx.fillStyle = '#222';
             ctx.beginPath();
             ctx.moveTo(cx - 15, cy + 20);
             ctx.lineTo(cx + 15, cy + 20);
             ctx.lineTo(cx, cy + 35);
             ctx.fill();

             // 4. Whiskers
             ctx.strokeStyle = '#fff';
             ctx.lineWidth = 2;
             ctx.beginPath();
             // Left
             ctx.moveTo(cx - 20, cy + 25); ctx.lineTo(cx - 100, cy + 10);
             ctx.moveTo(cx - 20, cy + 30); ctx.lineTo(cx - 110, cy + 30);
             ctx.moveTo(cx - 20, cy + 35); ctx.lineTo(cx - 100, cy + 50);
             // Right
             ctx.moveTo(cx + 20, cy + 25); ctx.lineTo(cx + 100, cy + 10);
             ctx.moveTo(cx + 20, cy + 30); ctx.lineTo(cx + 110, cy + 30);
             ctx.moveTo(cx + 20, cy + 35); ctx.lineTo(cx + 100, cy + 50);
             ctx.stroke();

          } else {
             // Normal
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }

          // 2. APPLY PARTICLE/OVERLAY MASKS (Foreground)
          if (mask === 'matrix') {
               ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Fade trail
               ctx.fillRect(0, 0, canvas.width, canvas.height);
               particleSystem.current.updateMatrix(ctx);
          } else if (mask === 'hearts') {
               particleSystem.current.updateHearts(ctx);
          } else if (mask === 'retro') {
               const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
               const data = imageData.data;
               for (let i = 0; i < data.length; i += 4) {
                   data[i] = data[i] * 1.2;     // R
                   data[i + 1] = data[i + 1] * 0.8; // G
                   data[i + 2] = data[i + 2] * 1.2; // B
               }
               ctx.putImageData(imageData, 0, 0);
               
               ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
               for (let y = 0; y < canvas.height; y += 4) {
                   ctx.fillRect(0, y, canvas.width, 1);
               }
          } else if (mask === 'ghost') {
               const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
               const data = imageData.data;
               for (let i = 0; i < data.length; i += 4) {
                   const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                   data[i] = 255 - avg;     
                   data[i + 1] = 255 - avg; 
                   data[i + 2] = 255 - avg + 50; 
               }
               ctx.putImageData(imageData, 0, 0);
               ctx.globalAlpha = 0.1;
               ctx.drawImage(video, Math.random() * 10 - 5, Math.random() * 10 - 5, canvas.width, canvas.height);
               ctx.globalAlpha = 1.0;
          }
      }
      animationFrameRef.current = requestAnimationFrame(processVideoFrame);
  };

  // Restart loop when mask changes to ensure fresh context/state closure if needed
  useEffect(() => {
     if (callStatus !== 'idle') {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        particleSystem.current.clear();
        processVideoFrame();
     }
  }, [activeMask]);


  useEffect(() => {
      // Connect processed stream to local video preview
      if (callStatus !== 'idle' && localVideoRef.current && processedStream.current) {
          localVideoRef.current.srcObject = processedStream.current;
      }
      
      // Handle remote stream
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

  const startProcessedStream = async (videoEnabled: boolean) => {
      // 1. Get Raw Camera
      const stream = await navigator.mediaDevices.getUserMedia({ 
          video: videoEnabled ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } : false, 
          audio: true 
      });
      localStream.current = stream;

      // 2. Setup Video Processing Pipeline
      if (videoEnabled) {
          hiddenVideoRef.current.srcObject = stream;
          hiddenVideoRef.current.muted = true;
          hiddenVideoRef.current.play().catch(console.error);
          
          // Start Loop
          processVideoFrame();
          
          // Capture Canvas Stream
          const canvasStream = canvasRef.current.captureStream(30);
          
          // Merge Audio from Raw with Video from Canvas
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) canvasStream.addTrack(audioTrack);
          
          processedStream.current = canvasStream;
      } else {
          processedStream.current = stream; // Audio only
      }
      return processedStream.current;
  };

  const startCall = async (type: 'audio' | 'video') => {
      setCallType(type);
      setCallStatus('calling');
      setIsVideoEnabled(type === 'video');
      iceCandidatesQueue.current = [];
      try {
          const finalStream = await startProcessedStream(type === 'video');

          if (localVideoRef.current) {
              localVideoRef.current.srcObject = finalStream;
              localVideoRef.current.muted = true;
          }

          const pc = await initializePeerConnection();
          finalStream.getTracks().forEach(track => pc.addTrack(track, finalStream));
          
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
          
          const isVideoCall = callData.callType === 'video';
          const finalStream = await startProcessedStream(isVideoCall);

          if (localVideoRef.current) {
              localVideoRef.current.srcObject = finalStream;
              localVideoRef.current.muted = true;
          }

          const pc = await initializePeerConnection();
          finalStream.getTracks().forEach(track => pc.addTrack(track, finalStream));
          
          const offer = new RTCSessionDescription({ type: 'offer', sdp: callData.sdp });
          await pc.setRemoteDescription(offer);
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          await updateDoc(doc(db, 'calls', chat.id), { answer: { sdp: answer.sdp } });
          
          onSnapshot(collection(db, 'calls', chat.id, 'candidates'), (snapshot) => {
              snapshot.docChanges().forEach((change) => {
                  if (change.type === 'added') {
                      const candidate = new RTCIceCandidate(change.doc.data());
                      pc.addIceCandidate(candidate).catch(console.error);
                  }
              });
          });
      } catch (e) {
          console.error("Error answering call:", e);
          hangUp();
      }
  };

  const hangUp = async () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      
      if (localStream.current) {
          localStream.current.getTracks().forEach(track => track.stop());
          localStream.current = null;
      }
      if (processedStream.current) {
          processedStream.current.getTracks().forEach(track => track.stop());
          processedStream.current = null;
      }
      if (peerConnection.current) {
          peerConnection.current.close();
          peerConnection.current = null;
      }
      setCallStatus('idle');
      setCallType(null);
      
      try {
          await deleteDoc(doc(db, 'calls', chat.id));
      } catch (e) { console.error("Error cleaning up call:", e); }
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

  // --- MESSAGING ---

  const handleSendMessage = () => {
      if (inputText.trim() || selectedFiles.length > 0) {
          onSendMessage(inputText, selectedFiles);
          setInputText('');
          setSelectedFiles([]);
          setShowEmojiPicker(false);
          // If in recording mode but sent text, reset recording mode visuals just in case
          if (isRecording) stopRecording();
      }
  };

  const handleEditSave = () => {
      if (editingMessageId && editText.trim()) {
          onEditMessage(editingMessageId, editText);
          setEditingMessageId(null);
          setEditText('');
      }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          const newFiles: Attachment[] = Array.from(e.target.files).map(file => {
              const type = file.type.startsWith('image') ? 'image' : 
                          file.type.startsWith('video') ? 'video' : 
                          file.type.startsWith('audio') ? 'audio' : 'file';
              return {
                  id: Math.random().toString(36).substr(2, 9),
                  type,
                  url: URL.createObjectURL(file), // Preview URL
                  name: file.name,
                  size: (file.size / 1024).toFixed(1) + ' KB'
              };
          });
          
          // Process files to Base64 for storage/transmission
          newFiles.forEach(async (att, index) => {
               const file = e.target.files![index];
               const reader = new FileReader();
               reader.onload = () => {
                   if (reader.result) {
                       setSelectedFiles(prev => prev.map(p => p.id === att.id ? { ...p, url: reader.result as string } : p));
                   }
               };
               reader.readAsDataURL(file);
          });

          setSelectedFiles(prev => [...prev, ...newFiles]);
      }
  };

  const startRecording = (mode: 'audio' | 'video') => {
      navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' })
          .then(stream => {
              recordingStreamRef.current = stream;
              const mimeType = getSupportedMimeType(mode);
              recordingMimeTypeRef.current = mimeType;
              
              if (!mimeType) {
                  alert("Browser does not support recording " + mode);
                  return;
              }

              const mediaRecorder = new MediaRecorder(stream, { mimeType });
              mediaRecorderRef.current = mediaRecorder;
              recordedChunksRef.current = [];

              mediaRecorder.ondataavailable = (e) => {
                  if (e.data.size > 0) recordedChunksRef.current.push(e.data);
              };

              mediaRecorder.onstop = () => {
                  const blob = new Blob(recordedChunksRef.current, { type: mimeType });
                  const url = URL.createObjectURL(blob);
                  const fileType = mode === 'video' ? 'video' : 'audio';
                  const fileName = `rec_${Date.now()}.${mode === 'video' ? 'webm' : 'webm'}`; // Simplify ext
                  
                  // Convert blob to base64 for sending
                  const reader = new FileReader();
                  reader.onloadend = () => {
                       const base64 = reader.result as string;
                       onSendMessage('', [{
                          id: Date.now().toString(),
                          type: fileType,
                          url: base64,
                          name: fileName,
                          duration: '0:00' // Placeholder
                      }]);
                  };
                  reader.readAsDataURL(blob);

                  if (stream) stream.getTracks().forEach(t => t.stop());
              };

              mediaRecorder.start();
              setIsRecording(true);
              setRecordMode(mode);
              setRecordingDuration(0);
              
              recordingTimerRef.current = setInterval(() => {
                  setRecordingDuration(prev => prev + 1);
              }, 1000);
          })
          .catch(err => console.error("Recording error", err));
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && isRecording) {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
          if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      }
  };

  const handleMouseDownRecord = (mode: 'audio' | 'video') => {
      pressTimerRef.current = setTimeout(() => {
          startRecording(mode);
      }, 300); // Small delay to prevent accidental clicks
  };

  const handleMouseUpRecord = () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      if (isRecording) {
          stopRecording();
      }
  };

  const formatDuration = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const updateTypingStatus = (text: string) => {
      setInputText(text);
      if (!chat.id || !currentUser) return;
      
      const now = Date.now();
      if (now - lastTypingSentRef.current > 2000) {
          lastTypingSentRef.current = now;
          const userTypingRef = doc(db, 'chats', chat.id);
          // Use dot notation to update specific map field in Firestore
          updateDoc(userTypingRef, {
             [`typing.${currentUser.id}`]: serverTimestamp()
          }).catch(console.error);
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="md:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
            <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          
          <div 
             className="flex items-center gap-3 cursor-pointer"
             onClick={() => onViewProfile(participant || currentUser)}
          >
              <div className="relative">
                 <img 
                    src={displayAvatar || 'https://via.placeholder.com/150'} 
                    alt={displayName} 
                    className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                 />
                 {isOnline && <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>}
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white leading-tight">{displayName}</h3>
                {chat.isTyping ? (
                    <span className="text-xs text-violet-500 font-medium animate-pulse">Печатает...</span>
                ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {isGroup ? `${chat.participantIds.length} участников` : (isOnline ? 'В сети' : 'Не в сети')}
                    </span>
                )}
              </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!isGroup && !chat.participantIds.includes('gemini_ai') && (
              <>
                <button onClick={() => startCall('audio')} className="p-2.5 text-slate-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <Phone size={20} />
                </button>
                <button onClick={() => startCall('video')} className="p-2.5 text-slate-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <Video size={20} />
                </button>
              </>
          )}
          <button className="p-2.5 text-slate-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-slate-800 rounded-full transition-colors">
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
        {messages.map((msg, index) => {
          const isMe = msg.senderId === currentUser.id;
          const isSystem = msg.senderId === 'system';
          const isAi = msg.senderId === 'gemini_ai';
          const showAvatar = !isMe && (index === 0 || messages[index - 1].senderId !== msg.senderId);
          
          if (isSystem) {
              return (
                  <div key={msg.id} className="flex justify-center my-4">
                      <span className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs px-3 py-1 rounded-full">
                          {msg.text}
                      </span>
                  </div>
              )
          }

          return (
            <div 
                key={msg.id} 
                className={`flex w-full group ${isMe ? 'justify-end' : 'justify-start'}`}
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
            >
              <div className={`flex max-w-[85%] md:max-w-[70%] gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar for receiver */}
                {!isMe && (
                  <div className="w-8 flex-shrink-0 flex flex-col justify-end">
                    {showAvatar ? (
                       <img src={isAi ? 'https://picsum.photos/id/532/200/200' : (displayAvatar || '')} className="w-8 h-8 rounded-full bg-slate-200" alt="" />
                    ) : <div className="w-8" />}
                  </div>
                )}

                <div className={`relative flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {/* Message Bubble */}
                    <div className={`relative px-4 py-2 rounded-2xl shadow-sm animate-message-in ${
                        isMe 
                        ? 'bg-violet-600 text-white rounded-br-none' 
                        : isAi 
                            ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-bl-none border border-white/10'
                            : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-none border border-slate-100 dark:border-slate-700'
                    }`}>
                        {/* Name in Group */}
                        {isGroup && !isMe && showAvatar && (
                            <p className="text-xs font-bold text-violet-500 mb-1">
                                {chat.participants.find(p => p.id === msg.senderId)?.name || 'Unknown'}
                            </p>
                        )}
                        
                        {/* Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mb-2 space-y-2">
                                {msg.attachments.map((att, i) => (
                                    <div key={i} className="rounded-lg overflow-hidden">
                                        {att.type === 'image' && (
                                            <img 
                                                src={att.url} 
                                                alt="attachment" 
                                                className="max-w-full h-auto rounded-lg max-h-60 object-cover cursor-pointer hover:opacity-95 transition-opacity" 
                                                onClick={() => setLightboxImage(att.url)} 
                                            />
                                        )}
                                        {att.type === 'video' && (
                                            att.url.startsWith('http') ? (
                                                <div className="p-3 bg-black/20 dark:bg-black/40 rounded-lg flex flex-col gap-2">
                                                    <div className="flex items-center gap-2 text-sm font-medium">
                                                        <Video size={16} />
                                                        <span>Сгенерированное видео</span>
                                                    </div>
                                                    <a 
                                                        href={att.url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="flex items-center justify-center gap-2 w-full py-2 bg-white text-violet-600 rounded-lg font-bold text-sm hover:bg-slate-100 transition-colors"
                                                    >
                                                        <ExternalLink size={16} />
                                                        Смотреть видео (Veo)
                                                    </a>
                                                </div>
                                            ) : (
                                                <div className="relative bg-black rounded-lg overflow-hidden">
                                                    <video 
                                                        src={att.url} 
                                                        controls 
                                                        className="max-w-full max-h-60 w-full"
                                                    />
                                                </div>
                                            )
                                        )}
                                        {att.type === 'audio' && (
                                            <div className="flex items-center gap-2 bg-black/10 dark:bg-white/10 p-2 rounded-lg min-w-[200px]">
                                                <div className="p-2 bg-white/20 rounded-full">
                                                    <PlayCircle size={20} className="text-white" />
                                                </div>
                                                <div className="flex-1">
                                                     <div className="h-1 bg-white/30 rounded-full w-full">
                                                         <div className="h-full bg-white w-1/3 rounded-full"></div>
                                                     </div>
                                                </div>
                                                <span className="text-xs opacity-80">{att.duration || 'Audio'}</span>
                                            </div>
                                        )}
                                        {att.type === 'file' && (
                                            <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-600">
                                                <div className="p-2 bg-slate-200 dark:bg-slate-600 rounded-lg text-slate-500 dark:text-slate-300">
                                                    <FileText size={24} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{att.name}</p>
                                                    <p className="text-xs text-slate-500">{att.size || 'File'}</p>
                                                </div>
                                                <a href={att.url} download={att.name} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors text-slate-500">
                                                    <Download size={18} />
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Text Content */}
                        {msg.text && (
                            <p className={`text-sm md:text-[15px] whitespace-pre-wrap leading-relaxed ${isAi ? 'font-medium' : ''}`}>{msg.text}</p>
                        )}

                        {/* Metadata */}
                        <div className={`flex items-center justify-end gap-1 mt-1 ${isMe || isAi ? 'text-white/70' : 'text-slate-400'}`}>
                            {msg.isEdited && <Pencil size={10} className="opacity-70" />}
                            <span className="text-[10px]">{msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            {isMe && (
                                <span className="ml-0.5">
                                    {msg.status === 'read' ? <CheckCheck size={12} /> : <Check size={12} />}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Reactions Display */}
                    {msg.reactions && msg.reactions.length > 0 && (
                        <div className={`flex gap-1 mt-1 ${isMe ? 'mr-1' : 'ml-1'}`}>
                            {msg.reactions.map((reaction, i) => (
                                <button 
                                    key={i}
                                    onClick={() => onReaction(msg.id, reaction.emoji)}
                                    className={`text-xs px-1.5 py-0.5 rounded-full border shadow-sm transition-transform hover:scale-110 ${
                                        reaction.userId === currentUser.id 
                                        ? 'bg-violet-100 border-violet-200 text-violet-800 dark:bg-violet-900/30 dark:border-violet-500/30 dark:text-violet-200' 
                                        : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                                    }`}
                                >
                                    {reaction.emoji} <span className="opacity-60 text-[10px]">{reaction.count > 1 ? reaction.count : ''}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Reaction Picker Trigger */}
                <div className={`flex items-center opacity-0 group-hover:opacity-100 transition-opacity ${activeReactionMessageId === msg.id ? 'opacity-100' : ''}`}>
                    <div className="relative reaction-menu-container">
                         {activeReactionMessageId === msg.id && (
                             <div className={`absolute top-1/2 -translate-y-1/2 ${isMe ? 'right-full mr-2' : 'left-full ml-2'} bg-white dark:bg-slate-800 shadow-xl rounded-full p-1 flex items-center gap-1 border border-slate-100 dark:border-slate-700 z-20 animate-fade-in`}>
                                 {REACTION_EMOJIS.map(emoji => (
                                     <button
                                         key={emoji}
                                         onClick={() => {
                                             onReaction(msg.id, emoji);
                                             setActiveReactionMessageId(null);
                                         }}
                                         className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-lg transition-transform hover:scale-125"
                                     >
                                         {emoji}
                                     </button>
                                 ))}
                                 <button 
                                     onClick={() => {
                                         setEditingMessageId(msg.id);
                                         setEditText(msg.text);
                                         setActiveReactionMessageId(null);
                                     }}
                                     className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"
                                 >
                                     <Pencil size={14} />
                                 </button>
                             </div>
                         )}
                         <button 
                             className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors reaction-trigger-btn"
                             onClick={(e) => {
                                 e.stopPropagation();
                                 setActiveReactionMessageId(activeReactionMessageId === msg.id ? null : msg.id);
                             }}
                         >
                             <Smile size={16} />
                         </button>
                    </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        
        {/* File Preview */}
        {selectedFiles.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto py-2">
                {selectedFiles.map((file, i) => (
                    <div key={i} className="relative group flex-shrink-0">
                        {file.type === 'image' ? (
                            <img src={file.url} alt="preview" className="h-16 w-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                        ) : (
                            <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-lg flex flex-col items-center justify-center border border-slate-200 dark:border-slate-700">
                                <FileText size={20} className="text-slate-400 mb-1" />
                                <span className="text-[8px] text-slate-500 truncate w-full text-center px-1">{file.name}</span>
                            </div>
                        )}
                        <button 
                            onClick={() => setSelectedFiles(files => files.filter((_, idx) => idx !== i))}
                            className="absolute -top-1 -right-1 bg-slate-500 text-white rounded-full p-0.5 hover:bg-red-500 transition-colors"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
            </div>
        )}

        {/* Edit Mode Header */}
        {editingMessageId && (
            <div className="flex items-center justify-between bg-violet-50 dark:bg-violet-900/20 px-4 py-2 rounded-t-xl text-sm border-l-4 border-violet-500 mb-1">
                <div className="flex flex-col">
                    <span className="font-bold text-violet-600 dark:text-violet-400">Редактирование</span>
                    <span className="text-slate-500 dark:text-slate-400 text-xs truncate max-w-[200px]">{messages.find(m => m.id === editingMessageId)?.text}</span>
                </div>
                <button onClick={() => setEditingMessageId(null)} className="text-slate-400 hover:text-slate-600">
                    <X size={16} />
                </button>
            </div>
        )}

        <div className="flex items-end gap-2">
           {/* Attachment Button */}
           <div className="relative">
                <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 text-slate-500 hover:text-violet-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                    <Paperclip size={20} />
                </button>
           </div>

           {/* Text Input */}
           <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center px-4 py-2 border border-transparent focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all">
                <div className="relative">
                    <button 
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className={`p-1.5 mr-2 rounded-full transition-colors ${showEmojiPicker ? 'text-violet-500 bg-violet-100 dark:bg-violet-900/30' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Smile size={20} />
                    </button>
                    {/* Emoji Picker Popover */}
                    {showEmojiPicker && (
                        <div className="absolute bottom-full left-0 mb-4 bg-white dark:bg-slate-800 shadow-xl rounded-2xl p-3 border border-slate-200 dark:border-slate-700 w-64 grid grid-cols-6 gap-2 z-50">
                            {INPUT_EMOJIS.map(emoji => (
                                <button 
                                    key={emoji}
                                    onClick={() => {
                                        if (editingMessageId) setEditText(prev => prev + emoji);
                                        else updateTypingStatus(inputText + emoji);
                                    }}
                                    className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xl transition-colors"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <textarea
                    ref={editInputRef}
                    value={editingMessageId ? editText : inputText}
                    onChange={(e) => {
                        if (editingMessageId) setEditText(e.target.value);
                        else updateTypingStatus(e.target.value);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (editingMessageId) handleEditSave();
                            else handleSendMessage();
                        }
                    }}
                    placeholder={isRecording ? (recordMode === 'audio' ? 'Запись аудио...' : 'Запись видео...') : "Сообщение..."}
                    className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 py-2 min-h-[44px] text-slate-900 dark:text-slate-100 placeholder-slate-500"
                    rows={1}
                    style={{ height: 'auto' }} 
                    onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                    }}
                />
           </div>

           {/* Record/Send Buttons */}
           {(inputText.trim() || selectedFiles.length > 0 || editingMessageId) ? (
                <button 
                    onClick={editingMessageId ? handleEditSave : handleSendMessage}
                    className="p-3 bg-violet-600 hover:bg-violet-500 text-white rounded-full shadow-lg shadow-violet-600/30 transform active:scale-95 transition-all"
                >
                    {editingMessageId ? <Check size={20} /> : <Send size={20} />}
                </button>
           ) : (
               <div className="flex gap-2">
                   {/* Record Audio */}
                   <button 
                       onMouseDown={() => handleMouseDownRecord('audio')}
                       onMouseUp={handleMouseUpRecord}
                       onTouchStart={() => handleMouseDownRecord('audio')}
                       onTouchEnd={handleMouseUpRecord}
                       className={`p-3 rounded-full transition-all duration-200 ${isRecording && recordMode === 'audio' ? 'bg-red-500 text-white scale-110 animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-violet-600'}`}
                   >
                       {isRecording && recordMode === 'audio' ? <div className="w-5 h-5 bg-white rounded-sm" /> : <Mic size={20} />}
                   </button>
                   
                   {/* Record Video Message */}
                   <button 
                       onMouseDown={() => handleMouseDownRecord('video')}
                       onMouseUp={handleMouseUpRecord}
                       onTouchStart={() => handleMouseDownRecord('video')}
                       onTouchEnd={handleMouseUpRecord}
                       className={`p-3 rounded-full transition-all duration-200 ${isRecording && recordMode === 'video' ? 'bg-red-500 text-white scale-110 animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-violet-600'}`}
                   >
                        {isRecording && recordMode === 'video' ? <div className="w-5 h-5 bg-white rounded-sm" /> : <Camera size={20} />}
                   </button>
               </div>
           )}
        </div>
      </div>

      {/* Recording Overlay */}
      {isRecording && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
               <div className="bg-slate-900 p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 animate-pulse-ring border border-red-500/50">
                   {recordMode === 'video' ? (
                       <div className="relative w-48 h-48 rounded-2xl overflow-hidden bg-black border-2 border-red-500">
                           <video ref={recordingPreviewVideoRef} className="w-full h-full object-cover" autoPlay muted />
                       </div>
                   ) : (
                       <div className="w-24 h-24 rounded-full bg-red-500 flex items-center justify-center text-white">
                           <Mic size={48} className="animate-bounce" />
                       </div>
                   )}
                   <div className="text-white font-mono text-xl font-bold">{formatDuration(recordingDuration)}</div>
                   <p className="text-slate-400 text-sm">Отпустите, чтобы отправить</p>
               </div>
          </div>
      )}

      {/* CALL OVERLAY */}
      {callStatus !== 'idle' && (
          <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col">
              {/* Call Header */}
              <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10 bg-gradient-to-b from-black/50 to-transparent">
                  <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-xl overflow-hidden">
                          {displayAvatar ? <img src={displayAvatar} className="w-full h-full object-cover"/> : displayName?.charAt(0)}
                      </div>
                      <div>
                          <h3 className="text-white font-bold text-lg shadow-black drop-shadow-md">{displayName}</h3>
                          <p className="text-slate-300 text-sm flex items-center gap-2">
                              {callStatus === 'connected' ? <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/> Идет звонок</span> : 'Соединение...'}
                          </p>
                      </div>
                  </div>
                  {/* Mask Menu Toggle */}
                  {callType === 'video' && (
                    <button 
                        onClick={() => setShowMaskMenu(!showMaskMenu)}
                        className={`p-3 rounded-full backdrop-blur-md transition-all ${showMaskMenu ? 'bg-violet-600 text-white' : 'bg-black/30 text-white hover:bg-white/20'}`}
                    >
                        <Wand2 size={24} />
                    </button>
                  )}
              </div>

              {/* Main Video Area */}
              <div className="flex-1 relative flex items-center justify-center bg-black">
                  {/* Remote Video */}
                  {callType === 'video' ? (
                      <video 
                        ref={remoteVideoRef} 
                        autoPlay 
                        className="w-full h-full object-cover"
                      />
                  ) : (
                      <div className="flex flex-col items-center gap-6 animate-pulse">
                          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 p-1">
                             <img src={displayAvatar || ''} className="w-full h-full rounded-full object-cover border-4 border-slate-900" />
                          </div>
                          <span className="text-slate-400">Аудиозвонок</span>
                      </div>
                  )}

                  {/* Local Video (PiP) */}
                  {callType === 'video' && (
                      <div className="absolute bottom-24 right-4 w-32 h-48 bg-slate-800 rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700/50 z-20">
                          <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover" />
                      </div>
                  )}

                  {/* Incoming Call Prompt */}
                  {callStatus === 'incoming' && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 flex-col gap-8">
                          <div className="text-center">
                              <div className="w-24 h-24 rounded-full bg-slate-700 mx-auto mb-4 overflow-hidden border-4 border-slate-600">
                                  <img src={displayAvatar || ''} className="w-full h-full object-cover" />
                              </div>
                              <h2 className="text-2xl font-bold text-white mb-2">{displayName}</h2>
                              <p className="text-slate-300">Входящий {callType === 'video' ? 'видео' : 'аудио'} звонок...</p>
                          </div>
                          <div className="flex gap-8">
                              <button onClick={hangUp} className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-transform hover:scale-110">
                                  <PhoneOff size={32} />
                              </button>
                              <button onClick={answerCall} className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white hover:bg-emerald-600 transition-transform hover:scale-110 animate-bounce">
                                  <Phone size={32} />
                              </button>
                          </div>
                      </div>
                  )}
              </div>

              {/* Mask Selection Bar */}
              {showMaskMenu && callType === 'video' && (
                  <div className="absolute bottom-24 left-0 right-0 p-4 z-20 animate-slide-up">
                      <div className="bg-black/60 backdrop-blur-xl rounded-2xl p-2 flex gap-3 overflow-x-auto scrollbar-hide border border-white/10">
                          {MASKS.map(mask => (
                              <button
                                  key={mask.id}
                                  onClick={() => setActiveMask(mask.id)}
                                  className={`flex flex-col items-center gap-1 min-w-[60px] p-2 rounded-xl transition-all ${activeMask === mask.id ? 'bg-white/20 scale-105' : 'hover:bg-white/10 opacity-70 hover:opacity-100'}`}
                              >
                                  <div className={`w-10 h-10 rounded-full ${mask.color} flex items-center justify-center text-white shadow-lg`}>
                                      {mask.icon}
                                  </div>
                                  <span className="text-[10px] text-white font-medium">{mask.name}</span>
                              </button>
                          ))}
                      </div>
                  </div>
              )}

              {/* Call Controls */}
              {callStatus === 'connected' && (
                  <div className="p-6 pb-8 flex justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent">
                      <button onClick={toggleMute} className={`p-4 rounded-full backdrop-blur-md transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-800/60 text-white hover:bg-slate-700/60'}`}>
                          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                      </button>
                      <button onClick={hangUp} className="p-4 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg shadow-red-500/30 transform hover:scale-105 transition-all">
                          <PhoneOff size={32} />
                      </button>
                      {callType === 'video' && (
                          <button onClick={toggleVideo} className={`p-4 rounded-full backdrop-blur-md transition-all ${!isVideoEnabled ? 'bg-white text-slate-900' : 'bg-slate-800/60 text-white hover:bg-slate-700/60'}`}>
                              {!isVideoEnabled ? <VideoOff size={24} /> : <Video size={24} />}
                          </button>
                      )}
                  </div>
              )}
          </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
          <div 
              className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in"
              onClick={() => setLightboxImage(null)}
          >
              <button 
                  className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                  onClick={() => setLightboxImage(null)}
              >
                  <X size={24} />
              </button>
              <img 
                  src={lightboxImage} 
                  alt="Full view" 
                  className="max-w-full max-h-screen object-contain rounded-lg shadow-2xl"
                  onClick={(e) => e.stopPropagation()} 
              />
          </div>
      )}
    </div>
  );
};
