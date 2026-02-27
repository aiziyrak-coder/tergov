
import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from "../../contexts/LanguageContext";
import { askVirtualMentor, searchLegalDatabase, generateAcademyQuiz, generateSpeech, playGeneratedAudio } from '../../services/geminiService';
import { 
    Send, User, Bot, ArrowLeft, Loader2, 
    Shield, Briefcase, BrainCircuit, GraduationCap, 
    PlayCircle, Star, Scale, Search, Library, ScrollText, ExternalLink,
    Swords, AlertTriangle, Lightbulb, Target, CheckCircle2, Trophy,
    Wifi, Database, Cpu, Lock, Smartphone, Globe, Mic, StopCircle, Volume2,
    BookOpen, FileText, FileCheck, Landmark, FolderOpen, Download, Filter
} from 'lucide-react';
import { Message, MentorMode, AppLanguage, AcademyCourse, QuizQuestion, LegalAnalysisResult } from "../../types";
import { useToast } from "../../contexts/ToastContext";
import type { ISpeechRecognition } from "../../types";

interface VirtualMentorProps {
  onBack: () => void;
  onOpenTemplates?: () => void;
}

const COURSES_DB: AcademyCourse[] = [
    {
        id: 'c-001',
        title: "Сўроқ Тактикаси (Асосий)",
        description: "Гумонланувчининг психологик ҳолатини аниқлаш ва новербал белгиларни ўқиш бўйича махсус курс.",
        level: 'Бошланғич',
        duration: '4 соат',
        topics: ['Новербал белгилар', 'Психологик босим', 'Манипуляция'],
        icon: 'brain'
    },
    {
        id: 'c-cyber-01',
        title: "Кибержиноят ва IP Таҳлил",
        description: "IP манзилларни аниқлаш, VPN/Proxy орқали яширинган жиноятчиларни топиш ва ижтимоий тармоқлар (OSINT) таҳлили.",
        level: 'Юқори',
        duration: '12 соат',
        topics: ['IP Геолокация', 'VPN/Proxy Кузатув', 'OSINT Воситалари', 'DDOS ва Фишинг', 'Email Сарлавҳа Таҳлили'],
        icon: 'globe'
    },
    {
        id: 'c-crypto-01',
        title: "Криптовалюта ва Блокчейн",
        description: "Крипто-активлар билан боғлиқ фирибгарликлар, ноқонуний P2P айланмалари ва ҳамёнларни кузатиш.",
        level: 'Юқори',
        duration: '10 соат',
        topics: ['Blockchain Тафтишчи', 'USDT/BTC Трансакциялар', 'Binance P2P Схемалар', 'Mixer Хизматлар', 'Совуқ Ҳамёнлар'],
        icon: 'cpu'
    },
    {
        id: 'c-forensic-01',
        title: "Рақамли Далиллар (Evidence)",
        description: "Электрон далилларни (ёзишмалар, файллар) қонуний расмийлаштириш, ўчирилган маълумотларни тиклаш ва хеш-лаш.",
        level: 'Ўрта',
        duration: '8 соат',
        topics: ['Маълумот Тиклаш', 'Хеш-лаш (MD5/SHA)', 'Далиллар Занжири', 'Мобил Криминалистика', 'Cloud Ажратиш'],
        icon: 'database'
    },
    {
        id: 'c-003',
        title: "Иқтисодий Жиноятлар Таҳлили",
        description: "Яширин бухгалтерия ва ноқонуний пул айланмаларини фош этиш стратегиялари.",
        level: 'Юқори',
        duration: '8 соат',
        topics: ['Откатлар', 'Солиқдан қочиш', 'Сохта фирмалар'],
        icon: 'chart'
    }
];

// --- SAMPLE DOCUMENTS DATABASE ---
const SAMPLE_DOCS_DB = [
    { type: 'Талабнома', title: 'Вақтинча фойдаланиш учун нарсаларни олиш ҳақида Талабнома', desc: 'ЖПК 199-модда тартибида' },
    { type: 'Тилхат', title: 'Олинган нарса ва ҳужжатларни қабул қилиш ва қайтариш бўйича Тилхат', desc: 'Ашёвий далиллар ҳаракати' },
    { type: 'Баённома', title: 'Ҳужжатларни тақдим қилиш Баённомаси', desc: 'ЖПК 200, 202-моддалар' },
    { type: 'Қарор', title: 'Ашёвий далил сифатида эътироф этиш ҳақида Қарор', desc: 'ЖПК 203, 204, 207-моддалар' },
    { type: 'Қарор', title: 'Мол-мулкни хатлаш ҳақида Қарор', desc: 'ЖПК 290-модда (Зарарни қоплаш)' },
    { type: 'Баённома', title: 'Мол-мулкни хатлаш тўғрисида Баённома', desc: 'Холислар иштирокида' },
    { type: 'Қарор', title: 'Гумон қилинувчи тариқасида жалб қилиш ҳақида Қарор', desc: 'ЖПК 359, 360-моддалар' },
    { type: 'Баённома', title: 'Гумон қилинувчини сўроқ қилиш Баённомаси', desc: 'Видеокамера ёрдамида' },
    { type: 'Қарор', title: 'Айбланувчи тариқасида ишда иштирок этишга жалб қилиш Қарори', desc: 'ЖПК 361-модда' },
    { type: 'Баённома', title: 'Айбланувчини сўроқ қилиш Баённомаси', desc: 'Ҳимоячи иштирокида' },
    { type: 'Қарор', title: 'Айбловни ўзгартириш тўғрисида Қарор', desc: 'Янги очилган ҳолатлар бўйича' },
    { type: 'Қарор', title: 'Қамоққа олиш эҳтиёт чорасини қўллаш ҳақида Илтимоснома', desc: 'Судга тақдим этиш учун' },
    { type: 'Баённома', title: 'Шахсни ушлаб туриш тўғрисида Баённома', desc: 'ЖПК 221-модда тартибида' },
    { type: 'Қарор', title: 'Паспорт ва ҳужжатларни олиш тўғрисида Қарор', desc: 'Қонунга хилоф равишда эгалланган ҳужжатлар' },
    { type: 'Айблов Хулосаси', title: 'Айблов Хулосаси (Намуна)', desc: 'Тергов якунида тузиладиган ҳужжат' },
    { type: 'Қарор', title: 'Жиноят ишини тугатиш тўғрисида Қарор', desc: 'Реабилитация ёки бошқа асослар' },
    { type: 'Қарор', title: 'Лавозимдан четлаштириш тўғрисида Қарор', desc: 'ЖПК 255-модда' },
    { type: 'Қарор', title: 'Мажбурий келтириш тўғрисида Қарор', desc: 'Гувоҳ ёки айбланувчига нисбатан' },
    { type: 'Топшириқ', title: 'Халқаро ҳамkorlik доирасида сўровнома', desc: 'Бошқа давлатга юбориладиган сўров' },
    { type: 'Қарор', title: 'Тиббий муассасага жойлаштириш ҳақида Қарор', desc: 'Экспертиза ўтказиш учун' }
];

const VirtualMentor: React.FC<VirtualMentorProps> = ({ onBack, onOpenTemplates }) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'CHAT' | 'ACADEMY'>('CHAT');
  
  // ACADEMY SUB-TABS
  const [academyTab, setAcademyTab] = useState<'COURSES' | 'LIBRARY'>('COURSES');

  const [mentorMode, setMentorMode] = useState<MentorMode>(MentorMode.PLANNER);
  
  // CHAT STATE
  const [messages, setMessages] = useState<Message[]>([
      { id: '1', role: 'model', content: `Хуш келибсиз. Мен Ўзбекистон Республикаси ИИВ Тергов Департаментининг стратегик маслаҳатчисиман. Кибер хавфсизлик, рақамли далиллар ёки классик тергов бўйича ёрдам бера оламан.`, timestamp: new Date() }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  // VOICE STATE
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  // ACADEMY - LIBRARY SEARCH STATE
  const [libQuery, setLibQuery] = useState('');
  const [libResult, setLibResult] = useState<LegalAnalysisResult | null>(null);
  const [libLoading, setLibLoading] = useState(false);

  // ACADEMY - SAMPLE DOCS STATE
  const [sampleSearch, setSampleSearch] = useState('');
  const [sampleFilter, setSampleFilter] = useState('Барчаси');

  // ACADEMY - COURSES STATE
  const [selectedCourse, setSelectedCourse] = useState<AcademyCourse | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizQuestion[] | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<{[key:string]: number}>({});
  const [quizScore, setQuizScore] = useState<number | null>(null);

  useEffect(() => {
    return () => {
        if (recognitionRef.current) recognitionRef.current.stop();
    }
  }, []);

  // --- CHAT FUNCTIONS ---
  const handleSend = async (text?: string) => {
    const query = text || input;
    if (!query.trim()) return;

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: query, timestamp: new Date() }]);
    setInput('');
    setLoading(true);

    try {
        const response = await askVirtualMentor(
            query,
            [],
            mentorMode,
            `СИЗ: Ўзбекистон Республикаси ИИВ Тергов Департаментининг элита устози ва маслаҳатчисисиз. Режим: ${mentorMode}. МУҲИМ: Барча жавобларни ФАҚАТ ЎЗБЕК КИРИЛЛ алифбосида, расмий ва аниқ тилда беринг. Лотин алифбосидан фойдаланманг.`,
            AppLanguage.UZ_CYRL
        );
        const content = response.text || "Хатолик юз берди";
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: content, timestamp: new Date() }]);
        
        // Auto TTS
        if (voiceEnabled && content) {
            handleSpeak(content);
        }

    } catch (e) {
        const msg = e instanceof Error ? e.message : "Тизимда хатолик.";
        toast(msg, "error");
        setMessages(prev => [...prev, { id: Date.now().toString(), role: "model", content: "Жавоб юборишда хатолик юз берди. Қайта уриниб кўринг.", timestamp: new Date() }]);
    } finally {
        setLoading(false);
    }
  };

  const handleSpeak = async (text: string) => {
      try {
          setIsSpeaking(true);
          await generateSpeech(text);
          // generateSpeech is a no-op placeholder; speech not yet implemented
          setIsSpeaking(false);
      } catch (e) {
          console.error("Speech generation failed", e);
          setIsSpeaking(false);
      }
  };

  const toggleVoiceInput = () => {
      if (isListening) {
          if (recognitionRef.current) recognitionRef.current.stop();
          setIsListening(false);
      } else {
          const win = typeof window !== "undefined" ? (window as unknown) as { SpeechRecognition?: new () => { start(): void; stop(): void; continuous: boolean; interimResults: boolean; lang: string; onstart: () => void; onresult: (e: unknown) => void; onend: () => void; onerror: (e?: unknown) => void }; webkitSpeechRecognition?: new () => { start(): void; stop(): void; continuous: boolean; interimResults: boolean; lang: string; onstart: () => void; onresult: (e: unknown) => void; onend: () => void; onerror: (e?: unknown) => void } } : null;
          const SpeechRecognitionCtor = win?.SpeechRecognition ?? win?.webkitSpeechRecognition;
          if (!SpeechRecognitionCtor) return toast("Микрофон қўллаб-қувватланмайди", "error");

          const recognition = new SpeechRecognitionCtor();
          recognition.continuous = false;
          recognition.interimResults = false;
          recognition.lang = "uz-UZ";

          recognition.onstart = () => setIsListening(true);

          recognition.onresult = (event: unknown) => {
              const e = event as { results: { [i: number]: { [j: number]: { transcript: string } } } };
              const text = e.results[0]?.[0]?.transcript ?? "";
              setInput(text);
              handleSend(text); // Auto send on voice end
          };

          recognition.onend = () => setIsListening(false);
          recognition.onerror = () => { setIsListening(false); toast("Овозни танишда хатолик", "error"); };

          recognitionRef.current = recognition;
          recognition.start();
      }
  };

  // --- ACADEMY: LIBRARY SEARCH ---
  const handleLibrarySearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!libQuery) return;
      setLibLoading(true);
      setLibResult(null);
      try {
          const data = await searchLegalDatabase(libQuery, AppLanguage.UZ_CYRL);
          setLibResult(data);
          toast("Hujjatlar topildi", "success");
      } catch (e) {
          const msg = e instanceof Error ? e.message : "Қидирувда хатолик.";
          toast(msg, "error");
      } finally {
          setLibLoading(false);
      }
  };

  // --- ACADEMY: QUIZ FUNCTIONS ---
  const startQuiz = async (topic: string) => {
      setLoading(true);
      try {
          const questions = await generateAcademyQuiz(topic, AppLanguage.UZ_CYRL);
          setActiveQuiz(questions);
          setQuizAnswers({});
          setQuizScore(null);
      } catch (e) {
          const msg = e instanceof Error ? e.message : "Тест тузишда хатолик.";
          toast(msg, "error");
      } finally {
          setLoading(false);
      }
  };

  const submitQuiz = () => {
      if (!activeQuiz) return;
      let correct = 0;
      activeQuiz.forEach((q, idx) => {
          if (quizAnswers[idx] === q.correctAnswer) correct++;
      });
      setQuizScore(Math.round((correct / activeQuiz.length) * 100));
  };

  const getModeIcon = (mode: MentorMode) => {
      switch(mode) {
          case MentorMode.PLANNER: return <Target size={18}/>;
          case MentorMode.CRITIC: return <Swords size={18}/>;
          case MentorMode.QUALIFIER: return <BrainCircuit size={18}/>;
          default: return <Bot size={18}/>;
      }
  };

  const getModeLabel = (mode: MentorMode) => {
    switch(mode) {
        case MentorMode.PLANNER: return "Стратег (Planner)";
        case MentorMode.CRITIC: return "Танқидчи (Critic)";
        case MentorMode.QUALIFIER: return "Психолог (Profiler)";
        default: return "Umumiy";
    }
  };

  const getCourseIcon = (iconName: string) => {
      switch(iconName) {
          case 'globe': return <Globe size={24}/>;
          case 'cpu': return <Cpu size={24}/>;
          case 'database': return <Database size={24}/>;
          case 'wifi': return <Wifi size={24}/>;
          case 'chart': return <Briefcase size={24}/>;
          default: return <GraduationCap size={24}/>;
      }
  };

  // Filter Sample Docs
  const filteredSamples = SAMPLE_DOCS_DB.filter(doc => {
      const matchesSearch = doc.title.toLowerCase().includes(sampleSearch.toLowerCase());
      const matchesFilter = sampleFilter === 'Барчаси' || doc.type === sampleFilter;
      return matchesSearch && matchesFilter;
  });

  return (
    <div className="w-full h-full flex flex-col bg-[#F8FAFC] font-sans overflow-hidden text-slate-900">
      
      {/* HEADER */}
      <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-sm z-20">
          <div className="flex items-center gap-4">
              <button type="button" onClick={onBack} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-uzblue hover:text-white transition-all" aria-label="Orqaga">
                  <ArrowLeft size={20}/>
              </button>
              <div>
                  <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase">
                      <GraduationCap className="text-amber-500" size={24}/>
                      Virtual <span className="text-amber-500">Murabbiy</span>
                  </h2>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">AI Asosidagi Malaka Oshirish Markazi</p>
              </div>
          </div>
          <div className="flex items-center gap-4">
               {/* Voice Toggle */}
               <button 
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  className={`p-2 rounded-xl border transition-all ${voiceEnabled ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                  title="Ovozli rejim"
               >
                  <Volume2 size={20} className={isSpeaking ? 'animate-pulse' : ''}/>
               </button>

               <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button onClick={() => setActiveTab('CHAT')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'CHAT' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      <Bot size={16}/> MASLAHAT
                  </button>
                  <button onClick={() => setActiveTab('ACADEMY')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'ACADEMY' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      <Star size={16}/> AKADEMIYA
                  </button>
              </div>
          </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
          
          {/* --- CHAT MODE --- */}
          {activeTab === 'CHAT' && (
              <div className="flex-1 flex flex-col relative">
                
                {/* Mode Selector */}
                <div className="h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Rejimi:</span>
                    {[MentorMode.PLANNER, MentorMode.CRITIC, MentorMode.QUALIFIER].map(m => (
                        <button 
                            key={m}
                            onClick={() => setMentorMode(m)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${mentorMode === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                        >
                            {getModeIcon(m)}
                            {getModeLabel(m)}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-[#F8FAFC]">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[70%] p-6 rounded-2xl shadow-sm border ${msg.role === 'user' ? 'bg-slate-800 text-white border-slate-800 rounded-tr-none' : 'bg-white text-slate-800 border-slate-200 rounded-tl-none'}`}>
                                <div className="flex items-center gap-2 mb-2 opacity-80">
                                    {msg.role === 'user' ? <User size={14}/> : <Bot size={14}/>}
                                    <span className="text-[10px] font-black uppercase tracking-widest">
                                        {msg.role === 'user' ? 'Tergovchi' : 'Ziyrak AI'}
                                    </span>
                                </div>
                                <div className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{msg.content}</div>
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl w-fit shadow-sm">
                            <Loader2 className="animate-spin text-amber-500" size={18}/>
                            <span className="text-xs font-bold text-slate-500 uppercase">Стратегик таҳлил кетмоқда...</span>
                        </div>
                    )}
                    {isSpeaking && (
                         <div className="flex items-center gap-2 p-4 w-fit">
                             <div className="flex gap-1 items-end h-4">
                                 <div className="w-1 bg-amber-500 animate-[bounce_1s_infinite] h-2"></div>
                                 <div className="w-1 bg-amber-500 animate-[bounce_1s_infinite_0.1s] h-4"></div>
                                 <div className="w-1 bg-amber-500 animate-[bounce_1s_infinite_0.2s] h-3"></div>
                             </div>
                             <span className="text-[10px] font-bold text-amber-600 uppercase">Овозли жавоб...</span>
                         </div>
                    )}
                </div>
                
                <div className="p-6 bg-white border-t border-slate-200 relative">
                    {/* Voice Active Indicator */}
                    {isListening && (
                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-bottom-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                            Eshitmoqdaman...
                        </div>
                    )}

                    <div className="max-w-4xl mx-auto flex gap-4">
                        <button 
                            onClick={toggleVoiceInput}
                            className={`p-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center ${isListening ? 'bg-red-500 text-white shadow-red-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            {isListening ? <StopCircle size={24}/> : <Mic size={24}/>}
                        </button>

                        <input 
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            placeholder={isListening ? "Гапиринг..." : `${getModeLabel(mentorMode)} режимидан сўранг...`}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-50 transition-all text-slate-900 placeholder-slate-400"
                        />
                        <button onClick={() => handleSend()} className="p-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg shadow-slate-200 transition-all active:scale-95">
                            <Send size={24}/>
                        </button>
                    </div>
                </div>
              </div>
          )}

          {/* --- ACADEMY MODE --- */}
          {activeTab === 'ACADEMY' && (
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                  
                  {/* Academy Tab Switcher */}
                  {!selectedCourse && (
                      <div className="flex items-center justify-center pt-6 pb-2">
                          <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex">
                              <button 
                                onClick={() => setAcademyTab('COURSES')}
                                className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${academyTab === 'COURSES' ? 'bg-amber-50 text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                              >
                                  <GraduationCap size={16}/> Ўқув Курслари
                              </button>
                              <button 
                                onClick={() => setAcademyTab('LIBRARY')}
                                className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${academyTab === 'LIBRARY' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                              >
                                  <Library size={16}/> Elektron Kutubxona
                              </button>
                          </div>
                      </div>
                  )}

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                      {/* --- COURSES TAB --- */}
                      {academyTab === 'COURSES' && (
                          !selectedCourse ? (
                              <div className="max-w-6xl mx-auto">
                                  <div className="mb-8">
                                      <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Malaka Oshirish Kurslari</h2>
                                      <p className="text-slate-500 font-medium">ИИВ Академияси ва Зиёрак AI ҳамкорлигидаги махсус ўқув дастурлари.</p>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                      {COURSES_DB.map(course => (
                                          <div key={course.id} className="bg-white p-6 rounded-3xl border border-slate-200 hover:shadow-xl hover:border-amber-500 transition-all group cursor-pointer flex flex-col h-full" onClick={() => setSelectedCourse(course)}>
                                              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                                  {getCourseIcon(course.icon)}
                                              </div>
                                              <h3 className="text-lg font-black text-slate-800 mb-2 uppercase leading-tight">{course.title}</h3>
                                              <p className="text-xs text-slate-500 mb-6 flex-1">{course.description}</p>
                                              
                                              <div className="flex items-center gap-3 mb-6">
                                                  <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase">{course.level}</span>
                                                  <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase">{course.duration}</span>
                                              </div>
                                              
                                              <button className="w-full py-3 bg-slate-50 text-slate-600 font-bold text-xs rounded-xl group-hover:bg-slate-900 group-hover:text-white transition-all">
                                                  КУРСНИ БОШЛАШ
                                              </button>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          ) : (
                              <div className="max-w-4xl mx-auto bg-white min-h-full border-x border-slate-200 shadow-2xl flex flex-col">
                                   {/* Course Header */}
                                   <div className="p-8 border-b border-slate-100 bg-slate-50 relative overflow-hidden">
                                       <div className="absolute top-0 right-0 p-10 opacity-5"><GraduationCap size={150}/></div>
                                       <button onClick={() => { setSelectedCourse(null); setActiveQuiz(null); }} className="mb-4 text-slate-400 hover:text-slate-700 flex items-center gap-2 text-xs font-bold uppercase"><ArrowLeft size={14}/> Kurslarga qaytish</button>
                                       <h2 className="text-3xl font-black text-slate-900 uppercase mb-2 relative z-10">{selectedCourse.title}</h2>
                                       <div className="flex gap-2 relative z-10 flex-wrap">
                                            {selectedCourse.topics.map(t => <span key={t} className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase">{t}</span>)}
                                       </div>
                                   </div>

                                   <div className="flex-1 p-8">
                                        {!activeQuiz ? (
                                            <div className="space-y-8">
                                                <div className="p-6 rounded-2xl bg-blue-50 border border-blue-100 flex gap-4">
                                                    <div className="shrink-0 pt-1 text-blue-600"><Lightbulb size={24}/></div>
                                                    <div>
                                                        <h4 className="font-black text-blue-900 text-sm uppercase mb-1">AI Simulyatsiya</h4>
                                                        <p className="text-sm text-blue-800/80 mb-4">Ушбу мавзу бўйича сунъий интеллект сизнинг билимингизни текшириш учун индивидуал имтиҳон тузиб беради.</p>
                                                        <button 
                                                            onClick={() => startQuiz(selectedCourse.title)}
                                                            disabled={loading}
                                                            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
                                                        >
                                                            {loading ? <Loader2 className="animate-spin"/> : <BrainCircuit/>}
                                                            {loading ? 'TEST TUZILMOQDA...' : 'IMTIHON TOPSHIRISH'}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div>
                                                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Видео Дарслар</h3>
                                                    <div className="space-y-3">
                                                        {['1-дарс. Кириш ва Назария', '2-дарс. Амалий машғулот', '3-дарс. Хатолар таҳлили', '4-дарс. Кейслар Таҳлили'].map((l, i) => (
                                                            <div 
                                                                key={i} 
                                                                onClick={() => toast("Видео дарслар тайёрланмоқда. Имтиҳон ва Қонунчилик қидируви бўлимларидан фойдаланинг.", "info")}
                                                                className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer group active:scale-95 transition-all"
                                                                role="button"
                                                                aria-label="Видео Дарс"
                                                            >
                                                                <div className="flex items-center gap-4">
                                                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-amber-500 group-hover:text-white transition-all"><PlayCircle size={20}/></div>
                                                                    <span className="font-bold text-slate-700 text-sm">{l}</span>
                                                                </div>
                                                                <span className="text-xs font-mono text-slate-400">15:00</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="max-w-2xl mx-auto animate-in slide-in-from-right">
                                                <div className="flex justify-between items-center mb-6">
                                                    <h3 className="text-xl font-black text-slate-800 uppercase">Imtihon Jarayoni</h3>
                                                    {quizScore !== null && (
                                                        <div className={`px-4 py-2 rounded-xl text-white font-black text-lg ${quizScore >= 70 ? 'bg-green-500' : 'bg-red-500'}`}>
                                                            {quizScore}%
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-8">
                                                    {activeQuiz.map((q, qIdx) => (
                                                        <div key={q.id} className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                                            <h4 className="font-bold text-slate-900 mb-4 text-sm">{qIdx + 1}. {q.question}</h4>
                                                            <div className="space-y-2">
                                                                {q.options.map((opt, oIdx) => {
                                                                    const isSelected = quizAnswers[qIdx] === oIdx;
                                                                    const isCorrect = q.correctAnswer === oIdx;
                                                                    let btnClass = "border-slate-200 hover:bg-slate-50";
                                                                    
                                                                    if (quizScore !== null) {
                                                                        if (isCorrect) btnClass = "bg-green-100 border-green-500 text-green-800";
                                                                        else if (isSelected && !isCorrect) btnClass = "bg-red-100 border-red-500 text-red-800";
                                                                        else btnClass = "opacity-50 border-slate-100";
                                                                    } else if (isSelected) {
                                                                        btnClass = "bg-amber-50 border-amber-500 text-amber-900";
                                                                    }

                                                                    return (
                                                                        <button 
                                                                            key={oIdx}
                                                                            onClick={() => { if (quizScore === null) setQuizAnswers({...quizAnswers, [qIdx]: oIdx}); }}
                                                                            className={`w-full text-left p-4 rounded-xl border text-sm font-medium transition-all flex justify-between items-center ${btnClass}`}
                                                                        >
                                                                            <span>{opt}</span>
                                                                            {quizScore !== null && isCorrect && <CheckCircle2 size={16} className="text-green-600"/>}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                            {quizScore !== null && (
                                                                <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
                                                                    <strong>Izoh:</strong> {q.explanation}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                {quizScore === null ? (
                                                    <button onClick={submitQuiz} className="w-full mt-8 py-4 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-widest hover:bg-slate-800 shadow-xl transition-all">
                                                        Якунлаш ва Текшириш
                                                    </button>
                                                ) : (
                                                    <button onClick={() => setActiveQuiz(null)} className="w-full mt-8 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase tracking-widest hover:bg-slate-200 transition-all">
                                                        Чиқиш
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                   </div>
                              </div>
                          )
                      )}

                      {/* --- LIBRARY TAB --- */}
                      {academyTab === 'LIBRARY' && (
                          <div className="max-w-5xl mx-auto space-y-12">
                              {/* 1. Legal Search Section */}
                              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-lg relative overflow-hidden">
                                  <div className="absolute top-0 right-0 p-8 opacity-5"><Scale size={180}/></div>
                                  <div className="relative z-10">
                                      <h2 className="text-2xl font-black text-slate-900 uppercase mb-4 flex items-center gap-3">
                                          <Library className="text-blue-600" size={32}/>
                                          Qonunchilik <span className="text-blue-600">Qidiruvi (AI)</span>
                                      </h2>
                                      <form onSubmit={handleLibrarySearch} className="flex gap-4">
                                          <div className="flex-1 relative">
                                              <input 
                                                  value={libQuery}
                                                  onChange={(e) => setLibQuery(e.target.value)}
                                                  placeholder="Модда рақами, фармон ёки калит сўзни киритинг (Lex.uz)..."
                                                  className="w-full p-4 pl-12 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-medium text-slate-800"
                                              />
                                              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                                          </div>
                                          <button 
                                              type="submit" 
                                              disabled={libLoading} 
                                              className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2"
                                          >
                                              {libLoading ? <Loader2 className="animate-spin"/> : <Search size={20}/>}
                                              ҚИДИРИШ
                                          </button>
                                      </form>
                                      
                                      <div className="mt-6 flex gap-2 flex-wrap">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest py-2 mr-2">Tezkor Filtrlar:</span>
                                          {['Hammasi', 'JK (Jinoyat Kodeksi)', 'JPK (Jarayon)', 'Plenum Қарорларi', 'Prezident Farmonlari'].map(filter => (
                                              <button key={filter} onClick={() => setLibQuery(filter === 'Hammasi' ? '' : filter)} className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all">
                                                  {filter}
                                              </button>
                                          ))}
                                      </div>
                                  </div>
                              </div>

                              {/* Search Results */}
                              {libResult && (
                                  <div className="animate-in slide-in-from-bottom duration-500 space-y-6">
                                      {/* AI Analysis Card */}
                                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
                                          <div className="flex items-center gap-3 mb-4">
                                              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Bot size={20}/></div>
                                              <h3 className="font-bold text-slate-800 text-lg">AI Tahlili</h3>
                                          </div>
                                          <p className="text-slate-600 leading-relaxed text-sm font-medium">{libResult.analysis}</p>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                          {/* Articles Column */}
                                          <div className="space-y-4">
                                              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest pl-2">Topilgan Моддалар</h3>
                                              {libResult.articles.map((art, i) => (
                                                  <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-300 transition-all group cursor-pointer hover:shadow-md">
                                                      <div className="flex items-center justify-between mb-2">
                                                          <div className="flex items-center gap-2">
                                                              <BookOpen size={16} className="text-blue-500"/>
                                                              <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded">{art.code} {art.number}</span>
                                                          </div>
                                                      </div>
                                                      <h4 className="font-bold text-slate-800 text-sm mb-2">{art.title}</h4>
                                                      <p className="text-xs text-slate-500 line-clamp-3">{art.summary}</p>
                                                  </div>
                                              ))}
                                              {libResult.articles.length === 0 && <div className="text-center p-4 text-slate-400 text-xs">Моддалар топилмади</div>}
                                          </div>

                                          {/* Precedents Column */}
                                          <div className="space-y-4">
                                              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest pl-2">Суд Амалиёти ва Қарорлар</h3>
                                              {libResult.precedents.map((prec, i) => (
                                                  <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-green-300 transition-all hover:shadow-md">
                                                      <div className="flex items-center gap-2 mb-3 text-green-600">
                                                          <Landmark size={16}/>
                                                          <span className="text-[10px] font-black uppercase">{prec.source}</span>
                                                      </div>
                                                      <h4 className="font-bold text-slate-800 text-sm mb-2">{prec.title}</h4>
                                                      {prec.link && (
                                                          <a href={prec.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 hover:underline mt-2">
                                                              <ExternalLink size={12}/> Манбани очиш (Lex.uz)
                                                          </a>
                                                      )}
                                                  </div>
                                              ))}
                                              {libResult.precedents.length === 0 && <div className="text-center p-4 text-slate-400 text-xs">Қарорлар топилмади</div>}
                                          </div>
                                      </div>
                                  </div>
                              )}
                              
                              {/* 2. SAMPLE DOCUMENTS SECTION (NEW) */}
                              <div className="pt-8 border-t border-slate-200">
                                  <div className="flex items-center justify-between mb-6">
                                      <h2 className="text-2xl font-black text-slate-900 uppercase flex items-center gap-3">
                                          <FolderOpen className="text-amber-500" size={32}/>
                                          Namunaviy <span className="text-amber-500">Hujjatlar</span>
                                      </h2>
                                      <div className="flex bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm">
                                          <Search size={18} className="text-slate-400 ml-2"/>
                                          <input 
                                              value={sampleSearch}
                                              onChange={(e) => setSampleSearch(e.target.value)}
                                              placeholder="Намуна қидириш..."
                                              className="bg-transparent outline-none text-sm px-3 w-48"
                                          />
                                      </div>
                                  </div>

                                  <div className="flex gap-2 mb-6 flex-wrap">
                                       {['Барчаси', 'Қарор', 'Баённома', 'Талабнома', 'Тилхат', 'Айблов Хулосаси'].map(cat => (
                                          <button 
                                              key={cat}
                                              onClick={() => setSampleFilter(cat)}
                                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-1 ${sampleFilter === cat ? 'bg-amber-500 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                          >
                                              {cat === 'Барчаси' && <Filter size={10}/>} {cat}
                                          </button>
                                      ))}
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                      {filteredSamples.map((doc, idx) => (
                                          <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-amber-400 transition-all hover:shadow-lg group relative overflow-hidden">
                                              <div className="flex justify-between items-start mb-3">
                                                  <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                                                      <FileText size={20}/>
                                                  </div>
                                                  <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded uppercase">{doc.type}</span>
                                              </div>
                                              <h4 className="font-bold text-slate-800 text-sm mb-2 leading-tight group-hover:text-amber-600 transition-colors">{doc.title}</h4>
                                              <p className="text-[10px] text-slate-500 line-clamp-2 mb-4">{doc.desc}</p>
                                              
                                              <button 
                                                  type="button"
                                                  onClick={() => { onOpenTemplates?.(); toast("Шаблонлар галереясига йўналтирилди. Керакли шаблонни танланг ва юклаб олинг.", "success"); }}
                                                  className="w-full py-2 bg-slate-50 text-slate-600 hover:bg-amber-500 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                                                  aria-label="Шаблонни юклаб олиш"
                                              >
                                                  <Download size={14}/> ЮКЛАШ
                                              </button>
                                          </div>
                                      ))}
                                      {filteredSamples.length === 0 && (
                                          <div className="col-span-full text-center p-8 text-slate-400 text-sm italic">
                                              Ҳужжатлар топилмади.
                                          </div>
                                      )}
                                  </div>
                              </div>

                          </div>
                      )}
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default VirtualMentor;
