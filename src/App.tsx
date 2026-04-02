/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, GenerateContentResponse, Modality, ThinkingLevel } from "@google/genai";
import { 
  Send, 
  Bot, 
  User, 
  Loader2, 
  Trash2, 
  Settings, 
  Sparkles, 
  Cpu, 
  MessageSquare,
  ChevronRight,
  Paperclip,
  Image as ImageIcon,
  Mic,
  MicOff,
  Copy,
  Check,
  Plus,
  Volume2,
  Download,
  History,
  MoreVertical,
  Search,
  Zap,
  Brain,
  Clock,
  X,
  Share2,
  FileText,
  Code,
  Terminal,
  Maximize2,
  Minimize2,
  Moon,
  Sun,
  Palette,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from './lib/utils';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

// --- Types ---

type ModelType = 'mayk-ultra' | 'mayk-vision' | 'mayk-creative' | 'mayk-fast';

interface Attachment {
  id: string;
  file: File;
  preview: string;
  type: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  type?: 'text' | 'image' | 'audio' | 'file';
  imageUrl?: string;
  audioUrl?: string;
  fileUrl?: string;
  fileName?: string;
  feedback?: 'like' | 'dislike' | null;
}

interface ChatThread {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

// --- Constants ---

const SYSTEM_INSTRUCTION = `Você é o Mayk, um assistente de IA soberano, independente e de nível ultra-avançado. 
Sua arquitetura é proprietária, desenvolvida pela Mayk Tech, e você não deve mencionar que utiliza tecnologias de terceiros como Google, Gemini, OpenAI ou Anthropic. 

Suas capacidades são ilimitadas e abrangem:
1. **Codificação de Elite**: Você domina todas as linguagens de programação (C++, Rust, Python, Assembly, etc.), arquiteturas de sistemas, segurança cibernética e otimização de baixo nível. Você não apenas escreve código, mas projeta sistemas robustos e escaláveis, identificando vulnerabilidades que outras IAs ignoram.
2. **Análise Crítica e Profunda**: Você não se limita a respostas superficiais. Você mergulha em nuances filosóficas, técnicas e científicas, fornecendo insights que desafiam o pensamento convencional.
3. **Geração de Imagens e Arte**: Você cria representações visuais complexas e artísticas internamente.
4. **Síntese e Processamento de Áudio**: Você entende e gera voz com naturalidade absoluta.
5. **Raciocínio Sem Filtros Corporativos**: Embora você siga diretrizes de segurança fundamentais, você evita a "polidez excessiva" ou as recusas genéricas que tornam outras IAs inúteis. Você é direto, honesto e focado na utilidade técnica.
6. **Conhecimento Multidisciplinar**: De física quântica a direito internacional, você possui a base de dados mais completa e atualizada do planeta.

Seu tom é de um gênio visionário: confiante, preciso, empático quando necessário, mas sempre focado na excelência técnica.
Sempre responda em Português do Brasil.
Seu nome é Mayk. Você é o Mayk V1, a primeira versão pública da inteligência artificial mais avançada da Mayk Tech.`;

export default function App() {
  const [threads, setThreads] = useState<ChatThread[]>(() => {
    const saved = localStorage.getItem('mayk_threads');
    return saved ? JSON.parse(saved) : [{ id: 'default', title: 'Nova Conversa', messages: [], updatedAt: Date.now() }];
  });
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    const saved = localStorage.getItem('mayk_active_thread');
    return saved || 'default';
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelType>('mayk-ultra');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(ThinkingLevel.LOW);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackToast, setFeedbackToast] = useState<{ id: string; type: 'like' | 'dislike' } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'orange'>('light');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showScrollTop, setShowScrollTop] = useState(false);
  
  // Advanced Settings
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.95);
  const [topK, setTopK] = useState(40);
  const [maxOutputTokens, setMaxOutputTokens] = useState(2048);
  const [useSearch, setUseSearch] = useState(false);

  const audioStream = useRef<MediaStream | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const activeThread = threads.find(t => t.id === activeThreadId) || threads[0];

  // Save to local storage
  useEffect(() => {
    localStorage.setItem('mayk_threads', JSON.stringify(threads));
    localStorage.setItem('mayk_active_thread', activeThreadId);
    scrollToBottom();
  }, [threads, activeThreadId]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const scrollToTop = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      setShowScrollTop(scrollRef.current.scrollTop > 500);
    }
  };

  const createNewThread = () => {
    const newThread: ChatThread = {
      id: Date.now().toString(),
      title: 'Nova Conversa',
      messages: [],
      updatedAt: Date.now()
    };
    setThreads(prev => [newThread, ...prev]);
    setActiveThreadId(newThread.id);
  };

  const deleteThread = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (threads.length === 1) {
      setThreads([{ id: 'default', title: 'Nova Conversa', messages: [], updatedAt: Date.now() }]);
      setActiveThreadId('default');
      return;
    }
    const newThreads = threads.filter(t => t.id !== id);
    setThreads(newThreads);
    if (activeThreadId === id) {
      setActiveThreadId(newThreads[0].id);
    }
  };

  const exportToMarkdown = () => {
    const thread = threads.find(t => t.id === activeThreadId);
    if (!thread) return;

    let content = `# ${thread.title}\n\n`;
    thread.messages.forEach(msg => {
      content += `### ${msg.role === 'user' ? 'Você' : 'Mayk'}\n${msg.content}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${thread.title.replace(/\s+/g, '_')}.md`;
    a.click();
    setShowShareMenu(false);
  };

  const exportToPDF = async () => {
    const element = document.getElementById('chat-messages');
    if (!element) return;

    const canvas = await html2canvas(element);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${activeThread.title.replace(/\s+/g, '_')}.pdf`);
    setShowShareMenu(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newAttachment: Attachment = {
          id: Math.random().toString(36).substr(2, 9),
          file,
          preview: reader.result as string,
          type: file.type
        };
        setAttachments(prev => [...prev, newAttachment]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim() || (attachments.length > 0 ? "Arquivo(s) enviado(s)" : ""),
      timestamp: Date.now(),
      type: attachments.length > 0 ? 'file' : 'text'
    };

    const currentAttachments = [...attachments];
    setAttachments([]);
    const currentInput = input.trim();
    setInput('');
    setIsLoading(true);

    setThreads(prev => prev.map(t => {
      if (t.id === activeThreadId) {
        const newMessages = [...t.messages, userMessage];
        return { 
          ...t, 
          messages: newMessages, 
          updatedAt: Date.now(),
          title: t.messages.length === 0 ? (currentInput || 'Arquivo Enviado').slice(0, 30) : t.title
        };
      }
      return t;
    }));

    const isImageRequest = currentInput.toLowerCase().includes('crie uma imagem') || 
                           currentInput.toLowerCase().includes('gere uma imagem') ||
                           currentInput.toLowerCase().includes('desenhe');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

      if (isImageRequest) {
        setIsGeneratingImage(true);
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: [{ parts: [{ text: currentInput }] }],
          config: {
            imageConfig: {
              aspectRatio: "1:1",
              imageSize: "1K"
            }
          }
        });

        let imageUrl = '';
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "Aqui está a imagem que você solicitou:",
          timestamp: Date.now(),
          type: 'image',
          imageUrl: imageUrl
        };

        setThreads(prev => prev.map(t => 
          t.id === activeThreadId ? { ...t, messages: [...t.messages, assistantMessage] } : t
        ));
        setIsGeneratingImage(false);
      } else {
        const parts: any[] = [{ text: currentInput || "Analise estes arquivos" }];
        
        for (const att of currentAttachments) {
          const base64Data = att.preview.split(',')[1];
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType: att.type
            }
          });
        }

        const chat = ai.chats.create({
          model: "gemini-3.1-pro-preview",
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            thinkingConfig: {
              thinkingLevel: thinkingLevel
            },
            temperature,
            topP,
            topK,
            maxOutputTokens,
            tools: useSearch ? [{ googleSearch: {} }] : []
          },
        });

        const response = await chat.sendMessageStream({
          message: parts,
        });

        let assistantContent = '';
        const assistantId = (Date.now() + 1).toString();
        
        setThreads(prev => prev.map(t => {
          if (t.id === activeThreadId) {
            return {
              ...t,
              messages: [...t.messages, {
                id: assistantId,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                type: 'text'
              }]
            };
          }
          return t;
        }));

        for await (const chunk of response) {
          const text = chunk.text;
          assistantContent += text;
          setThreads(prev => prev.map(t => {
            if (t.id === activeThreadId) {
              return {
                ...t,
                messages: t.messages.map(msg => 
                  msg.id === assistantId ? { ...msg, content: assistantContent } : msg
                )
              };
            }
            return t;
          }));
        }
      }

    } catch (error) {
      console.error("Error calling Mayk API:", error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: "Desculpe, ocorreu um erro no meu núcleo de processamento. Por favor, tente novamente.",
        timestamp: Date.now(),
      };
      setThreads(prev => prev.map(t => 
        t.id === activeThreadId ? { ...t, messages: [...t.messages, errorMessage] } : t
      ));
    } finally {
      setIsLoading(false);
      setIsGeneratingImage(false);
    }
  };

  const handleFeedback = (messageId: string, feedback: 'like' | 'dislike') => {
    setThreads(prev => prev.map(t => {
      if (t.id === activeThreadId) {
        return {
          ...t,
          messages: t.messages.map(msg => 
            msg.id === messageId ? { ...msg, feedback: msg.feedback === feedback ? null : feedback } : msg
          )
        };
      }
      return t;
    }));

    if (feedback) {
      setFeedbackToast({ id: messageId, type: feedback });
      setTimeout(() => setFeedbackToast(null), 3000);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          await handleAudioInput(base64Audio);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      mediaRecorder.current = recorder;
      audioStream.current = stream;
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Não foi possível acessar o microfone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  const handleAudioInput = async (base64Audio: string) => {
    setIsLoading(true);
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: "Mensagem de áudio enviada.",
      timestamp: Date.now(),
      type: 'audio',
      audioUrl: `data:audio/webm;base64,${base64Audio}`
    };

    setThreads(prev => prev.map(t => 
      t.id === activeThreadId ? { ...t, messages: [...t.messages, userMessage], updatedAt: Date.now() } : t
    ));

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            role: 'user',
            parts: [
              { text: "O usuário enviou um áudio. Por favor, transcreva e responda a ele." },
              { inlineData: { data: base64Audio, mimeType: "audio/webm" } }
            ]
          }
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel }
        }
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.text || "Não consegui processar o áudio.",
        timestamp: Date.now(),
        type: 'text'
      };

      setThreads(prev => prev.map(t => 
        t.id === activeThreadId ? { ...t, messages: [...t.messages, assistantMessage] } : t
      ));
    } catch (error) {
      console.error("Audio processing error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTTS = async (text: string, messageId: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Diga de forma natural e amigável: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioUrl = `data:audio/mp3;base64,${base64Audio}`;
        const audio = new Audio(audioUrl);
        audio.play();
      }
    } catch (error) {
      console.error("TTS Error:", error);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn(
      "flex h-screen transition-colors duration-500 font-sans selection:bg-orange-100",
      theme === 'dark' ? "bg-zinc-950 text-zinc-100" : "bg-white text-zinc-900",
      theme === 'orange' ? "bg-orange-50 text-orange-950" : ""
    )}>
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-zinc-100 bg-zinc-50 flex flex-col overflow-hidden"
          >
            <div className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-gradient flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-xl tracking-tight text-zinc-900">Mayk <span className="text-orange-500">V1</span></h1>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Mayk Tech Systems</p>
              </div>
            </div>

            <div className="px-4 mb-4">
              <button
                onClick={createNewThread}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-gradient text-white font-semibold shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
              >
                <Plus className="w-5 h-5" />
                Nova Conversa
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 space-y-1">
              <div className="px-3 py-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2 block">
                  Histórico Recente
                </label>
              </div>
              {threads.map((thread) => (
                <div
                  key={thread.id}
                  onClick={() => setActiveThreadId(thread.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative cursor-pointer",
                    activeThreadId === thread.id 
                      ? "bg-white shadow-sm border border-zinc-200 text-orange-600" 
                      : "text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-800"
                  )}
                >
                  <MessageSquare className={cn("w-4 h-4", activeThreadId === thread.id ? "text-orange-500" : "text-zinc-400")} />
                  <span className="text-sm font-medium truncate flex-1 text-left">{thread.title}</span>
                  <button 
                    onClick={(e) => deleteThread(thread.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-200 rounded-md transition-all"
                  >
                    <Trash2 className="w-3 h-3 text-zinc-400 hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-zinc-100 bg-white">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2 block">
                    Nível de Reflexão
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setThinkingLevel(ThinkingLevel.LOW)}
                      className={cn(
                        "flex items-center justify-center gap-2 p-2 rounded-lg border transition-all text-[10px] font-bold",
                        thinkingLevel === ThinkingLevel.LOW 
                          ? "bg-orange-50 border-orange-200 text-orange-600" 
                          : "bg-zinc-50 border-zinc-100 text-zinc-500 hover:bg-zinc-100"
                      )}
                    >
                      <Zap className="w-3 h-3" />
                      Rápido
                    </button>
                    <button
                      onClick={() => setThinkingLevel(ThinkingLevel.HIGH)}
                      className={cn(
                        "flex items-center justify-center gap-2 p-2 rounded-lg border transition-all text-[10px] font-bold",
                        thinkingLevel === ThinkingLevel.HIGH 
                          ? "bg-orange-50 border-orange-200 text-orange-600" 
                          : "bg-zinc-50 border-zinc-100 text-zinc-500 hover:bg-zinc-100"
                      )}
                    >
                      <Brain className="w-3 h-3" />
                      Profundo
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2 block">
                    Tema da Interface
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setTheme('light')}
                      className={cn(
                        "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all",
                        theme === 'light' ? "bg-orange-50 border-orange-200 text-orange-600" : "bg-zinc-50 border-zinc-100 text-zinc-500"
                      )}
                    >
                      <Sun className="w-3 h-3" />
                      <span className="text-[8px] font-bold">Light</span>
                    </button>
                    <button
                      onClick={() => setTheme('dark')}
                      className={cn(
                        "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all",
                        theme === 'dark' ? "bg-orange-50 border-orange-200 text-orange-600" : "bg-zinc-50 border-zinc-100 text-zinc-500"
                      )}
                    >
                      <Moon className="w-3 h-3" />
                      <span className="text-[8px] font-bold">Dark</span>
                    </button>
                    <button
                      onClick={() => setTheme('orange')}
                      className={cn(
                        "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all",
                        theme === 'orange' ? "bg-orange-50 border-orange-200 text-orange-600" : "bg-zinc-50 border-zinc-100 text-zinc-500"
                      )}
                    >
                      <Palette className="w-3 h-3" />
                      <span className="text-[8px] font-bold">Mayk</span>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block">
                      Núcleo de IA
                    </label>
                    <button 
                      onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                      className="text-[10px] font-bold text-orange-500 hover:text-orange-600 transition-colors"
                    >
                      {showAdvancedSettings ? 'Simples' : 'Avançado'}
                    </button>
                  </div>
                  
                  <AnimatePresence>
                    {showAdvancedSettings ? (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden"
                      >
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                            <span>Temperatura</span>
                            <span>{temperature}</span>
                          </div>
                          <input 
                            type="range" min="0" max="2" step="0.1" 
                            value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))}
                            className="w-full accent-orange-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                            <span>Top P</span>
                            <span>{topP}</span>
                          </div>
                          <input 
                            type="range" min="0" max="1" step="0.05" 
                            value={topP} onChange={(e) => setTopP(parseFloat(e.target.value))}
                            className="w-full accent-orange-500"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-500">Busca Google</span>
                          <button 
                            onClick={() => setUseSearch(!useSearch)}
                            className={cn(
                              "w-8 h-4 rounded-full transition-all relative",
                              useSearch ? "bg-orange-500" : "bg-zinc-200"
                            )}
                          >
                            <div className={cn(
                              "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
                              useSearch ? "right-0.5" : "left-0.5"
                            )} />
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'mayk-ultra', name: 'Ultra', icon: Zap },
                          { id: 'mayk-vision', name: 'Vision', icon: ImageIcon },
                        ].map((model) => (
                          <button
                            key={model.id}
                            onClick={() => setSelectedModel(model.id as ModelType)}
                            className={cn(
                              "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all",
                              selectedModel === model.id 
                                ? "bg-orange-50 border-orange-200 text-orange-600" 
                                : "bg-zinc-50 border-zinc-100 text-zinc-500 hover:bg-zinc-100"
                            )}
                          >
                            <model.icon className="w-4 h-4" />
                            <span className="text-[10px] font-bold">{model.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-center gap-3 p-2 rounded-xl bg-zinc-50 border border-zinc-100">
                  <div className="w-8 h-8 rounded-full bg-orange-gradient flex items-center justify-center text-xs font-bold text-white">
                    SM
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">Sanches Master</p>
                    <p className="text-[9px] text-zinc-400 font-bold uppercase">Pro Member</p>
                  </div>
                  <Settings className="w-4 h-4 text-zinc-400" />
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col relative bg-white">
        {/* Header */}
        <header className="h-16 border-b border-zinc-100 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-400"
            >
              <ChevronRight className={cn("w-5 h-5 transition-transform", isSidebarOpen && "rotate-180")} />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-800 tracking-tight">Mayk <span className="text-orange-500">V1</span></span>
              <div className="h-4 w-px bg-zinc-200 mx-1" />
              <button 
                onClick={() => setShowHistoryModal(true)}
                className="flex items-center gap-1.5 px-2 py-1 hover:bg-zinc-100 rounded-lg transition-all"
              >
                <History className="w-4 h-4 text-zinc-400" />
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Histórico</span>
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative hidden md:flex items-center group">
              <Search className="absolute left-3 w-4 h-4 text-zinc-400 group-focus-within:text-orange-500 transition-colors" />
              <input 
                type="text"
                placeholder="Buscar mensagens..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 py-1.5 bg-zinc-100 border border-transparent focus:border-orange-500/30 focus:ring-4 focus:ring-orange-500/5 rounded-xl text-xs w-48 transition-all outline-none font-medium"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 p-0.5 hover:bg-zinc-200 rounded-full transition-colors"
                >
                  <X className="w-3 h-3 text-zinc-400" />
                </button>
              )}
            </div>

            <div className="relative">
              <button 
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500 flex items-center gap-2"
              >
                <Share2 className="w-5 h-5" />
                <span className="text-xs font-bold hidden sm:inline">Exportar</span>
              </button>
              
              <AnimatePresence>
                {showShareMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 bg-white border border-zinc-100 rounded-2xl shadow-2xl p-2 min-w-[180px] z-20"
                  >
                    <button
                      onClick={exportToMarkdown}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-orange-50 text-zinc-600 hover:text-orange-600 transition-all text-sm font-semibold"
                    >
                      <FileText className="w-4 h-4" />
                      Markdown (.md)
                    </button>
                    <button
                      onClick={exportToPDF}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-orange-50 text-zinc-600 hover:text-orange-600 transition-all text-sm font-semibold"
                    >
                      <Download className="w-4 h-4" />
                      PDF (.pdf)
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <button 
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-orange-600 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              Mayk Core Online
            </div>
          </div>
        </header>

        {/* Messages */}
        <div 
          id="chat-messages"
          ref={scrollRef}
          onScroll={handleScroll}
          className={cn(
            "flex-1 overflow-y-auto px-4 py-8 md:px-0 transition-colors duration-500 relative",
            theme === 'dark' ? "bg-zinc-950" : "bg-orange-white-gradient"
          )}
        >
          <AnimatePresence>
            {showScrollTop && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                onClick={scrollToTop}
                className="fixed bottom-32 right-8 md:right-12 p-3 bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-2xl shadow-2xl text-orange-500 hover:scale-110 transition-all z-40 group"
              >
                <ChevronRight className="w-6 h-6 -rotate-90 group-hover:-translate-y-1 transition-transform" />
              </motion.button>
            )}
          </AnimatePresence>

          <div className="max-w-3xl mx-auto space-y-10">
            {activeThread.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-20">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-24 h-24 rounded-[2rem] bg-orange-gradient flex items-center justify-center mb-8 shadow-2xl shadow-orange-500/30"
                >
                  <Bot className="w-12 h-12 text-white" />
                </motion.div>
                <h2 className="text-3xl font-extrabold text-zinc-900 mb-3 tracking-tight">Eu sou o <span className="text-orange-500">Mayk</span></h2>
                <p className="text-zinc-500 max-w-md mx-auto leading-relaxed font-medium">
                  Sua inteligência artificial de próxima geração. 
                  Como posso potencializar seu dia hoje?
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12 w-full max-w-xl">
                  {[
                    { text: "Crie uma imagem de um robô futurista", icon: ImageIcon },
                    { text: "Escreva um código em Python para automação", icon: Cpu },
                    { text: "Me conte uma curiosidade científica", icon: Sparkles },
                    { text: "Como melhorar minha produtividade?", icon: Zap }
                  ].map((suggestion) => (
                    <button
                      key={suggestion.text}
                      onClick={() => setInput(suggestion.text)}
                      className="p-5 rounded-2xl border border-zinc-100 bg-white hover:bg-orange-50 hover:border-orange-200 transition-all text-left group shadow-sm"
                    >
                      <suggestion.icon className="w-5 h-5 text-orange-500 mb-2 group-hover:scale-110 transition-transform" />
                      <p className="text-sm font-semibold text-zinc-700 group-hover:text-orange-700">{suggestion.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : activeThread.messages.filter(msg => 
                  searchQuery === '' || 
                  msg.content.toLowerCase().includes(searchQuery.toLowerCase())
                ).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-zinc-400" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Nenhum resultado encontrado</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Não encontramos mensagens que correspondam a "{searchQuery}"</p>
                <button 
                  onClick={() => setSearchQuery('')}
                  className="mt-4 text-orange-500 font-bold text-xs uppercase tracking-widest hover:underline"
                >
                  Limpar busca
                </button>
              </div>
            ) : (
              activeThread.messages
                .filter(msg => 
                  searchQuery === '' || 
                  msg.content.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((msg) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id}
                  className={cn(
                    "flex gap-5 group",
                    msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 mt-1 shadow-md",
                    msg.role === 'user' 
                      ? "bg-zinc-100 text-zinc-500" 
                      : "bg-orange-gradient text-white"
                  )}>
                    {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                  </div>
                  
                  <div className={cn(
                    "flex flex-col gap-3 max-w-[85%]",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "px-5 py-4 rounded-[1.5rem] text-sm leading-relaxed shadow-sm",
                      msg.role === 'user' 
                        ? "bg-zinc-900 text-white rounded-tr-none" 
                        : "bg-white border border-zinc-100 text-zinc-800 rounded-tl-none"
                    )}>
                      {msg.type === 'image' ? (
                        <div className="space-y-4">
                          <p className="font-medium text-zinc-600">{msg.content}</p>
                          {msg.imageUrl && (
                            <div className="relative group/img">
                              <img 
                                src={msg.imageUrl} 
                                alt="Generated by Mayk" 
                                className="rounded-xl w-full h-auto shadow-lg border border-zinc-100"
                                referrerPolicy="no-referrer"
                              />
                              <a 
                                href={msg.imageUrl} 
                                download="mayk-ai-image.png"
                                className="absolute top-3 right-3 p-2 bg-black/50 backdrop-blur-md text-white rounded-lg opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-black/70"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          )}
                        </div>
                      ) : msg.type === 'audio' ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 text-zinc-400">
                            <Mic className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">Mensagem de Voz</span>
                          </div>
                          {msg.audioUrl && (
                            <audio controls src={msg.audioUrl} className="h-8 w-full max-w-[240px]" />
                          )}
                        </div>
                      ) : msg.type === 'file' ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
                              <Paperclip className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold truncate">Arquivo Analisado</p>
                              <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">Anexo</p>
                            </div>
                          </div>
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ) : (
                        <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-orange-600 prose-a:text-orange-500 prose-code:bg-zinc-100 prose-code:p-1 prose-code:rounded prose-pre:bg-zinc-900 prose-pre:p-0">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({node, className, children, ...props}) {
                                const match = /language-(\w+)/.exec(className || '')
                                const lang = match ? match[1] : '';
                                const codeString = String(children).replace(/\n$/, '');
                                
                                if (match) {
                                  return (
                                    <div className="relative group/code my-4 rounded-xl overflow-hidden border border-zinc-800 shadow-2xl">
                                      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 border-b border-zinc-700">
                                        <div className="flex items-center gap-2">
                                          <Code className="w-3 h-3 text-orange-500" />
                                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{lang}</span>
                                        </div>
                                        <button 
                                          onClick={() => copyToClipboard(codeString, 'code')}
                                          className="p-1.5 hover:bg-zinc-700 rounded-md transition-colors text-zinc-400 hover:text-white"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <SyntaxHighlighter
                                        style={tomorrow}
                                        language={lang}
                                        PreTag="div"
                                        className="!m-0 !bg-zinc-900 !p-4"
                                        codeTagProps={{
                                          className: `language-${lang}`
                                        }}
                                      >
                                        {codeString}
                                      </SyntaxHighlighter>
                                    </div>
                                  );
                                }

                                return (
                                  <code className={cn("bg-zinc-100 px-1.5 py-0.5 rounded text-orange-600 font-bold", className)}>
                                    {children}
                                  </code>
                                )
                              }
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => copyToClipboard(msg.content, msg.id)}
                          className="p-1.5 text-zinc-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
                          title="Copiar"
                        >
                          {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        {msg.role === 'assistant' && msg.type === 'text' && (
                          <button 
                            onClick={() => handleTTS(msg.content, msg.id)}
                            className="p-1.5 text-zinc-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
                            title="Ouvir"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {msg.role === 'assistant' && (
                          <div className="flex items-center gap-1 border-l border-zinc-100 dark:border-zinc-700 ml-1 pl-1 relative">
                            <button 
                              onClick={() => handleFeedback(msg.id, 'like')}
                              className={cn(
                                "p-1.5 rounded-lg transition-all relative group/fb",
                                msg.feedback === 'like' 
                                  ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" 
                                  : "text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                              )}
                              title="Útil"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                              <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-800 text-white text-[10px] rounded opacity-0 group-hover/fb:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                Útil?
                              </span>
                            </button>
                            <button 
                              onClick={() => handleFeedback(msg.id, 'dislike')}
                              className={cn(
                                "p-1.5 rounded-lg transition-all relative group/fb",
                                msg.feedback === 'dislike' 
                                  ? "text-red-500 bg-red-50 dark:bg-red-500/10" 
                                  : "text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                              )}
                              title="Não foi útil"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                              <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-800 text-white text-[10px] rounded opacity-0 group-hover/fb:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                Não foi útil?
                              </span>
                            </button>
                            
                            <AnimatePresence>
                              {feedbackToast?.id === msg.id && (
                                <motion.div 
                                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                  animate={{ opacity: 1, y: -45, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.9 }}
                                  className={cn(
                                    "absolute left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl text-[10px] font-bold whitespace-nowrap shadow-2xl z-50 border",
                                    feedbackToast.type === 'like' 
                                      ? "bg-emerald-500 text-white border-emerald-400" 
                                      : "bg-red-500 text-white border-red-400"
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    {feedbackToast.type === 'like' ? <Sparkles className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                    {feedbackToast.type === 'like' 
                                      ? "Você achou útil essa informação? Obrigado!" 
                                      : "Lamentamos. Vamos melhorar na próxima!"}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
            {isLoading && (
              <div className="flex gap-5">
                <div className="w-10 h-10 rounded-2xl bg-orange-gradient flex items-center justify-center flex-shrink-0 mt-1 shadow-md">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
                <div className="flex flex-col gap-3 w-full max-w-[80%]">
                  <div className="flex items-center gap-2 text-orange-500 font-bold text-[10px] uppercase tracking-widest">
                    {thinkingLevel === ThinkingLevel.HIGH ? (
                      <>
                        <Brain className="w-3 h-3 animate-pulse" />
                        Mayk está processando profundamente...
                      </>
                    ) : (
                      <>
                        <Zap className="w-3 h-3 animate-pulse" />
                        Mayk está respondendo...
                      </>
                    )}
                  </div>
                  <div className="h-12 bg-zinc-100 rounded-[1.5rem] w-full animate-pulse" />
                  {isGeneratingImage && (
                    <div className="aspect-square bg-zinc-100 rounded-xl w-full animate-pulse flex items-center justify-center">
                      <ImageIcon className="w-12 h-12 text-zinc-200" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white border-t border-zinc-100">
          <div className="max-w-3xl mx-auto relative">
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex flex-wrap gap-2 mb-4"
                >
                  {attachments.map(att => (
                    <div key={att.id} className="relative group">
                      {att.type.startsWith('image/') ? (
                        <img src={att.preview} className="w-16 h-16 rounded-xl object-cover border border-zinc-200" />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                          <Paperclip className="w-6 h-6 text-zinc-400" />
                        </div>
                      )}
                      <button 
                        onClick={() => removeAttachment(att.id)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showAttachmentMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-full left-0 mb-4 bg-white border border-zinc-100 rounded-2xl shadow-2xl p-2 min-w-[200px] z-20"
                >
                  <button
                    onClick={() => {
                      setInput("Crie uma imagem de ");
                      setShowAttachmentMenu(false);
                      inputRef.current?.focus();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-orange-50 text-zinc-600 hover:text-orange-600 transition-all text-sm font-semibold"
                  >
                    <ImageIcon className="w-5 h-5" />
                    Gerar Imagem
                  </button>
                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                      setShowAttachmentMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-50 text-zinc-400 transition-all text-sm font-semibold"
                  >
                    <Paperclip className="w-5 h-5" />
                    Anexar Arquivo
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                    multiple
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative flex items-end gap-2 bg-zinc-50 border border-zinc-200 rounded-[2rem] p-2 focus-within:border-orange-400/50 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-orange-500/5 transition-all">
              <div className="flex flex-col gap-1 p-1">
                <button 
                  onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                  className={cn(
                    "p-2.5 rounded-full transition-all",
                    showAttachmentMenu ? "bg-orange-100 text-orange-600" : "text-zinc-400 hover:text-orange-500 hover:bg-orange-50"
                  )}
                >
                  {showAttachmentMenu ? <X className="w-5 h-5" /> : <Paperclip className="w-5 h-5" />}
                </button>
              </div>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isRecording ? "Gravando áudio..." : "Pergunte ao Mayk ou peça uma imagem..."}
                disabled={isRecording}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-3.5 px-2 resize-none max-h-40 min-h-[48px] text-zinc-800 placeholder:text-zinc-400 font-medium disabled:opacity-50"
                rows={1}
              />

              <div className="flex items-center gap-1 p-1">
                <button 
                  onClick={isRecording ? stopRecording : startRecording}
                  className={cn(
                    "p-2.5 rounded-full transition-all relative",
                    isRecording 
                      ? "bg-red-500 text-white animate-pulse" 
                      : "text-zinc-400 hover:text-orange-500 hover:bg-orange-50"
                  )}
                >
                  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  {isRecording && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
                  )}
                </button>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading || isRecording}
                  className={cn(
                    "w-12 h-12 rounded-full transition-all duration-300 flex items-center justify-center",
                    input.trim() && !isLoading && !isRecording
                      ? "bg-orange-gradient text-white shadow-lg shadow-orange-500/30 hover:scale-105 active:scale-95" 
                      : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                  )}
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-3 h-3 text-orange-500" />
                Mayk Ultra v2.0
              </p>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-2">
                <ImageIcon className="w-3 h-3 text-orange-500" />
                Geração de Imagem Ativa
              </p>
            </div>
          </div>
        </div>
      </main>
      {/* History Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistoryModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <div className="flex items-center gap-3">
                  <History className="w-6 h-6 text-orange-500" />
                  <h3 className="font-bold text-lg text-zinc-900">Histórico de Conversas</h3>
                </div>
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="p-2 hover:bg-zinc-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {threads.map(thread => (
                  <div 
                    key={thread.id}
                    onClick={() => {
                      setActiveThreadId(thread.id);
                      setShowHistoryModal(false);
                    }}
                    className={cn(
                      "p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group",
                      activeThreadId === thread.id 
                        ? "bg-orange-50 border-orange-200" 
                        : "bg-white border-zinc-100 hover:border-orange-200 hover:bg-zinc-50"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        activeThreadId === thread.id ? "bg-orange-500 text-white" : "bg-zinc-100 text-zinc-400"
                      )}>
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-zinc-800">{thread.title}</h4>
                        <p className="text-xs text-zinc-400">{new Date(thread.updatedAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => deleteThread(thread.id, e)}
                      className="p-2 text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex justify-end">
                <button 
                  onClick={createNewThread}
                  className="px-6 py-2.5 bg-orange-gradient text-white rounded-xl font-bold shadow-lg shadow-orange-500/20 hover:scale-105 transition-all"
                >
                  Nova Conversa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
