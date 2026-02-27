import React, { useState, useRef, useEffect, useCallback } from "react";
import { Upload, ArrowLeft, Save, FileAudio, Trash2, Loader2, Clock, Edit2, Check, User, Users, FileText, Download, UserPlus, ChevronDown, AlertCircle, Activity, CheckCircle2, Mic } from "lucide-react";
import { transcribeAudioFile } from "../../services/geminiService";
import { TranscriptSegment } from "../../types";
import { storageService } from "../../services/storageService";
import { useLanguage } from "../../contexts/LanguageContext";
import { useToast } from "../../contexts/ToastContext";
import { ConfirmModal } from "../ui/ConfirmModal";

interface StenogramProps {
  onBack: () => void;
}

// Maksimal fayl hajmi 25MB (Base64 encoding bilan hisoblaganda API limiti uchun xavfsiz chegara)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Groq Whisper qo'llab-quvvatlaydigan audio formatlar
const GROQ_SUPPORTED_EXTS = new Set(['mp3', 'wav', 'wave', 'ogg', 'flac', 'm4a', 'mp4', 'webm', 'opus', 'mpeg', 'mpga']);



function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

const Stenogram: React.FC<StenogramProps> = ({ onBack }) => {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'UPLOAD' | 'DOC'>('UPLOAD');
  
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);

  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(false);
  
  // --- PROTOCOL METADATA STATE ---
  const [protocolData, setProtocolData] = useState({
      applicants: 'Р.Т.Рахманова ва О.А.Шарипова',
      city: 'Фарғона шаҳри',
      date: new Date().toISOString().split('T')[0],
      startTime: '15:30',
      endTime: '16:35',
      investigatorRank: 'подполковник',
      investigatorName: 'Турдиев Сарвар Илхомович',
      deviceInfo: '"DVD-R" диск',
      legalArticles: '90-92',
      caseDetails: 'Фуқаро Х.Ш.Каримовнинг аризаси юзасидан ўтказилаётган терговга қадар текширув материали бўйича',
      fileName: 'audio_2025'
  });

  const [allSpeakers, setAllSpeakers] = useState<string[]>([]);
  const [deleteSegmentId, setDeleteSegmentId] = useState<string | null>(null);

  useEffect(() => {
    return () => { if (mediaUrl) URL.revokeObjectURL(mediaUrl); }
  }, [mediaUrl]);

  // Sync unique speakers from segments on load or update (but preserve existing manual edits)
  useEffect(() => {
    if (segments.length > 0) {
        const detectedSpeakers = Array.from(new Set(segments.map(s => s.speaker)));
        setAllSpeakers(prev => {
            const combined = new Set([...prev, ...detectedSpeakers]);
            return Array.from(combined);
        });
    }
  }, [segments.length]); // Depend only on length changes to avoid loops

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];

          if (file.size > MAX_FILE_SIZE) {
              toast("Файл ҳажми жуда катта! Максимал 25 MB.", "error");
              return;
          }

          const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
          if (!GROQ_SUPPORTED_EXTS.has(ext)) {
              toast(`"${ext.toUpperCase()}" формат қўллаб-қувватланмайди. Илтимос MP3, WAV, M4A, OGG, FLAC ёки WebM файл юкланг.`, "error");
              return;
          }

          setMediaFile(file);
          setMediaUrl(URL.createObjectURL(file));
          setProtocolData(prev => ({ ...prev, fileName: file.name }));
          toast("Аудио файл юклинди.", "info");
      }
  };

  const processAudioFile = async () => {
      if (!mediaFile) return;
      setLoading(true);
      setSegments([]);
      
      try {
          // Send original File directly — no base64 roundtrip, no byte corruption risk
          const results = await transcribeAudioFile(mediaFile, language);
          
          if (results && results.length > 0) {
              setSegments(results);
              // Initialize speakers based on result
              const initialSpeakers = Array.from(new Set(results.map(r => r.speaker)));
              setAllSpeakers(initialSpeakers.length > 0 ? initialSpeakers : ['Гапирувчи 1', 'Гапирувчи 2']);
              setActiveTab('DOC');
              toast("Таҳлил муваффақиятли якунланди.", "success");
          } else {
              toast("Матн аниқланмади ёки аудио сифати паст.", "warning");
          }

      } catch (e) {
          console.error(e);
          const msg = e instanceof Error ? e.message : "Номаълум";
          toast("Тизим хатолиги: " + msg, "error");
      } finally {
          setLoading(false);
      }
  };

  // --- SPEAKER MANAGEMENT FUNCTIONS ---

  // 1. Rename a speaker globally (sidebar input) — allow empty so user can clear and type new name
  const handleGlobalRename = (oldName: string, newName: string) => {
      setAllSpeakers(prev => prev.map(s => s === oldName ? newName : s));
      setSegments(prev => prev.map(s => s.speaker === oldName ? { ...s, speaker: newName } : s));
  };

  // 2. Add a new manual speaker
  const handleAddSpeaker = () => {
      const newSpeakerName = `Гапирувчи ${allSpeakers.length + 1}`;
      if (!allSpeakers.includes(newSpeakerName)) {
          setAllSpeakers(prev => [...prev, newSpeakerName]);
          toast("Янги иштирокчи рўйхатга қўшилди", "success");
      }
  };

  // 3. Change speaker for ONE specific segment (dropdown in transcript)
  const handleChangeSegmentSpeaker = (segmentId: string, newSpeaker: string) => {
      setSegments(prev => prev.map(s => s.id === segmentId ? { ...s, speaker: newSpeaker } : s));
  };

  const handleTextEdit = (id: string, newText: string) => {
      setSegments(prev => prev.map(s => s.id === id ? { ...s, text: newText } : s));
  };

  const deleteSegment = (id: string) => setDeleteSegmentId(id);
  const confirmDeleteSegment = useCallback(() => {
    if (deleteSegmentId) {
      setSegments((prev) => prev.filter((s) => s.id !== deleteSegmentId));
      setDeleteSegmentId(null);
      toast("Қатор ўчирилди", "info");
    }
  }, [deleteSegmentId, toast]);

  // --- WORD GENERATION (official stenogram format) ---
  /** Remove leading MM:SS or M:SS timestamp from segment text so only one timestamp shows (at line start). */
  const stripLeadingTimestamp = (text: string): string => text.replace(/^\s*\d{1,2}:\d{2}\s+/, "").trim();

  const downloadWordDocument = () => {
      const dialoguesHtml = segments.map(s => {
          const timeTag = s.timestamp
              ? `<span style="color:#6b7280;font-size:10pt;font-family:'Courier New',monospace;">[${escapeHtml(s.timestamp)}]</span> `
              : "";
          const textOnly = stripLeadingTimestamp(s.text ?? "");
          return `<p style="margin-bottom: 6px;">${timeTag}<strong>${escapeHtml(s.speaker)}:</strong> ${escapeHtml(textOnly)}</p>`;
      }).join("");

      const templateHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; }
                h1 { text-align: center; text-transform: uppercase; font-weight: bold; margin-bottom: 10px; }
                .subtitle { text-align: center; margin-bottom: 20px; font-size: 11pt; }
                .justify { text-align: justify; text-indent: 30px; }
                .right { text-align: right; }
                .dialogue-box { margin-top: 15px; margin-bottom: 15px; }
            </style>
        </head>
        <body>
            <h1>Фуқаро ${escapeHtml(protocolData.applicants)} томонидан тақдим қилинган дискдаги аудио ва видеоёзувларнинг<br/>СТЕНОГРАММАСИ</h1>
            <div class="subtitle">
                ${escapeHtml(protocolData.deviceInfo)} даги аудиоёзувларни эшитиш ҳақида
            </div>
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 12pt 0;border-collapse:collapse;table-layout:fixed;">
              <tr>
                <td width="50%" align="left" style="font-size:14pt;font-family:'Times New Roman',serif;padding:0;">${escapeHtml(protocolData.date)} йил</td>
                <td width="50%" align="right" style="font-size:14pt;font-family:'Times New Roman',serif;padding:0;text-align:right;">${escapeHtml(protocolData.city)}</td>
              </tr>
            </table>
            <br>
            <p class="justify">
                Фарғона шаҳар ИИО ФМБ ҳузуридаги тергов бўлими катта терговчиси ${escapeHtml(protocolData.investigatorRank)} ${escapeHtml(protocolData.investigatorName)},
                ${escapeHtml(protocolData.caseDetails)} бўйича фуқаро ${escapeHtml(protocolData.applicants)} томонидан тақдим қилинган ${escapeHtml(protocolData.deviceInfo)} даги аудиоёзувларни эшитиб кўриб,
                ЖПКнинг ${escapeHtml(protocolData.legalArticles)}-моддаларига риоя қилган ҳолда мазкур баённомани тузди.
            </p>
            <div>Эшитиш соат ${escapeHtml(protocolData.startTime)} да бошланди.</div>
            <p class="justify">
                Ушбу ${escapeHtml(protocolData.deviceInfo)} "HP" русумли компьютерга солинганда, унда <strong>"${escapeHtml(protocolData.fileName)}"</strong> номли аудиофайл мавжудлиги аниқланди ва қуйидаги мазмундаги сўзлашувлар қайд қилинган:
            </p>
            <div class="dialogue-box">${dialoguesHtml}</div>
            <div>Аудиоёзувларни эшитиш соат ${escapeHtml(protocolData.endTime)} да тамомланди.</div>
            <br><br>
            <div style="font-weight: bold;">
                Баённома туздим:<br>
                Тергов бўлими катта терговчиси ${escapeHtml(protocolData.investigatorRank)} ________________ ${escapeHtml(protocolData.investigatorName)}
            </div>
        </body>
        </html>
      `;

      const blob = new Blob([templateHtml], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Стенограмма_${protocolData.date}.doc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("Стенограмма (.doc) юклаб олинди", "success");
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#F8FAFC] overflow-hidden relative font-sans text-slate-900">
        <div className="h-20 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0 z-20 shadow-sm">
            <div className="flex items-center gap-6">
                <button type="button" onClick={onBack} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-all" aria-label="Ортага">
                    <ArrowLeft size={20} className="text-slate-500"/>
                </button>
                <div>
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-3 tracking-tight uppercase">
                        <Mic className="text-blue-600" size={24}/>
                        <span className="text-blue-600">Стенограмма</span>
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Аудио Таҳлил Модули</p>
                </div>
            </div>
            {/* Steps */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button type="button" onClick={() => setActiveTab('UPLOAD')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'UPLOAD' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`} aria-pressed={activeTab === 'UPLOAD'}>1. Юклаш</button>
                <button type="button" disabled={segments.length===0} onClick={() => setActiveTab('DOC')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'DOC' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`} aria-pressed={activeTab === 'DOC'}>2. Таҳрирлаш</button>
            </div>
        </div>

        <div className="flex-1 overflow-hidden relative z-10 p-6 flex flex-col">
            {activeTab === 'UPLOAD' && (
                <div className="w-full h-full flex items-center justify-center">
                    <div className="w-full max-w-4xl bg-white p-12 rounded-3xl border border-slate-200 shadow-xl flex flex-col relative overflow-hidden">
                        {loading && (
                             <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center p-10 text-center animate-in fade-in">
                                 <Loader2 size={64} className="text-blue-600 animate-spin mb-6"/>
                                 <h3 className="text-2xl font-black text-slate-800 uppercase mb-2">AI Таҳлил Қилмоқда...</h3>
                                 <p className="text-base text-slate-500 font-medium mb-8">AI овозлар сонини ва матнни аниқламоқда. Илтимос кутинг.</p>
                             </div>
                        )}

                        <div className="flex flex-col items-center justify-center gap-8 py-10">
                            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 shadow-inner">
                                <FileAudio size={48}/>
                            </div>
                            
                            <div className="text-center">
                                <h3 className="text-2xl font-black text-slate-800 uppercase mb-2">Аудио Файлни Юклаш</h3>
                                <p className="text-slate-500 font-medium">MP3, WAV, M4A, OGG, FLAC, WebM форматлар. Максимал ҳажм: 25 MB.</p>
                            </div>

                            {!mediaFile ? (
                                <label className="w-full max-w-lg h-48 border-3 border-dashed border-slate-300 bg-slate-50 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all group">
                                    <div className="p-4 bg-white rounded-full mb-4 shadow-sm group-hover:shadow-md transition-all">
                                        <Upload size={32} className="text-slate-400 group-hover:text-blue-600"/>
                                    </div>
                                    <span className="text-sm font-bold text-slate-600 group-hover:text-blue-700">Файлни танлаш учун босинг</span>
                                    <input type="file" accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,.opus,.mp4,audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/m4a,audio/mp4,audio/webm,audio/opus" onChange={handleFileSelect} className="hidden"/>
                                </label>
                            ) : (
                                <div className="w-full max-w-lg space-y-4">
                                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold">AUDIO</div>
                                            <div className="text-left">
                                                <div className="font-bold text-slate-800 text-sm">{mediaFile.name}</div>
                                                <div className="text-xs text-slate-500 font-medium">{(mediaFile.size / (1024*1024)).toFixed(2)} MB</div>
                                            </div>
                                        </div>
                                        <button onClick={() => {setMediaFile(null); setMediaUrl(null)}} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={20}/></button>
                                    </div>
                                    <audio ref={audioPlayerRef} src={mediaUrl || ''} controls className="w-full" />
                                    
                                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 flex gap-3 items-start">
                                        <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18}/>
                                        <p className="text-xs text-amber-800 font-medium">
                                            AI автоматик равишда спикерларни ажратади. Агар хатолик бўлса, кейинги босқичда қўлда тўғирлаш мумкин.
                                        </p>
                                    </div>

                                    <button onClick={processAudioFile} disabled={loading} className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-200 flex justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest">
                                        {loading ? <Activity className="animate-spin"/> : <CheckCircle2/>} 
                                        {loading ? 'Юборилмоқда...' : 'Таҳлилни Бошлаш'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'DOC' && (
                <div className="w-full h-full flex gap-6">
                    {/* LEFT: MAIN TRANSCRIPT EDITOR */}
                    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                        <div className="h-16 border-b border-slate-200 px-6 flex items-center justify-between bg-slate-50">
                            <h3 className="text-sm font-black text-slate-600 uppercase">Таҳрирлаш Режими</h3>
                            <button onClick={downloadWordDocument} className="text-xs font-bold bg-slate-900 text-white px-4 py-2 rounded-xl hover:bg-slate-700 transition-all flex items-center gap-2 shadow-lg shadow-slate-300">
                                <Download size={16}/> WORD ЮКЛАШ
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-slate-50/50">
                            {segments.length === 0 && (
                                <div className="text-center p-10 text-slate-400">
                                    Матн топилмади. Қайта уриниб кўринг.
                                </div>
                            )}
                            {segments.map((seg, idx) => (
                                <div key={idx} className="group relative pl-6 border-l-4 border-slate-200 hover:border-blue-500 transition-colors bg-white p-4 rounded-r-xl shadow-sm hover:shadow-md">
                                    <div className="flex justify-between items-center mb-2">
                                        {/* Dropdown for selecting speaker per segment (LOCAL CHANGE) */}
                                        <div className="relative group/speaker">
                                            <select
                                                value={seg.speaker}
                                                onChange={(e) => handleChangeSegmentSpeaker(seg.id, e.target.value)}
                                                className="appearance-none bg-blue-50 text-blue-600 text-xs font-black uppercase px-3 py-1 rounded-lg outline-none cursor-pointer hover:bg-blue-100 transition-colors pr-8 border border-transparent hover:border-blue-200"
                                            >
                                                {allSpeakers.map((s, i) => (
                                                    <option key={i} value={s}>{s}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none"/>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1"><Clock size={10}/> {seg.timestamp}</span>
                                            <button onClick={() => deleteSegment(seg.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"><Trash2 size={14}/></button>
                                        </div>
                                    </div>
                                    
                                    <textarea 
                                        value={seg.text}
                                        onChange={(e) => handleTextEdit(seg.id, e.target.value)}
                                        className="w-full bg-transparent text-base text-slate-800 leading-relaxed outline-none resize-none overflow-hidden h-auto focus:bg-blue-50/50 focus:p-2 rounded-lg transition-all"
                                        style={{ height: 'auto', minHeight: '60px' }}
                                        onFocus={(e) => {
                                            e.target.style.height = 'auto';
                                            e.target.style.height = e.target.scrollHeight + 'px';
                                        }}
                                        onInput={(e) => {
                                            (e.target as HTMLTextAreaElement).style.height = 'auto';
                                            (e.target as HTMLTextAreaElement).style.height = (e.target as HTMLTextAreaElement).scrollHeight + 'px';
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RIGHT: METADATA & SPEAKER MAP */}
                    <div className="w-[360px] h-full flex flex-col gap-4">
                        {/* 1. STENOGRAM METADATA */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col h-[40%]">
                             <h3 className="text-xs font-black text-slate-500 uppercase mb-4 flex items-center gap-2"><FileText size={14}/> Стенограмма Маълумотлари</h3>
                             <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                                 <div>
                                   <label className="text-[10px] font-bold text-slate-400 uppercase">Тақдим этган фуқаролар</label>
                                   <input value={protocolData.applicants} onChange={e=>setProtocolData({...protocolData, applicants:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-bold"/>
                                 </div>
                                 <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Сана ва Вақт</label>
                                    <div className="grid grid-cols-3 gap-2 mt-1">
                                        <input type="date" value={protocolData.date} onChange={e=>setProtocolData({...protocolData, date:e.target.value})} className="col-span-2 bg-slate-50 border border-slate-200 rounded p-2 text-xs font-bold"/>
                                        <input type="time" value={protocolData.startTime} onChange={e=>setProtocolData({...protocolData, startTime:e.target.value})} className="bg-slate-50 border border-slate-200 rounded p-2 text-xs font-bold"/>
                                    </div>
                                    <input type="time" value={protocolData.endTime} onChange={e=>setProtocolData({...protocolData, endTime:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-bold mt-2"/>
                                 </div>
                                 <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Шаҳар</label>
                                    <input value={protocolData.city} onChange={e=>setProtocolData({...protocolData, city:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-bold"/>
                                 </div>
                                 <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Терговчи (Унвон ва Ф.И.Ш)</label>
                                    <div className="flex gap-2">
                                        <input value={protocolData.investigatorRank} onChange={e=>setProtocolData({...protocolData, investigatorRank:e.target.value})} placeholder="Унвон" className="w-1/3 bg-slate-50 border border-slate-200 rounded p-2 text-xs font-bold"/>
                                        <input value={protocolData.investigatorName} onChange={e=>setProtocolData({...protocolData, investigatorName:e.target.value})} placeholder="Ф.И.Ш" className="w-2/3 bg-slate-50 border border-slate-200 rounded p-2 text-xs font-bold"/>
                                    </div>
                                 </div>
                                 <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Диск / Ёзув Қурилмаси Тури</label>
                                    <input value={protocolData.deviceInfo} onChange={e=>setProtocolData({...protocolData, deviceInfo:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-bold"/>
                                 </div>
                                 <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">ЖПК моддалари</label>
                                    <input value={protocolData.legalArticles} onChange={e=>setProtocolData({...protocolData, legalArticles:e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-bold"/>
                                 </div>
                                 <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Иш Мазмуни</label>
                                    <textarea value={protocolData.caseDetails} onChange={e=>setProtocolData({...protocolData, caseDetails:e.target.value})} className="w-full h-20 bg-slate-50 border border-slate-200 rounded p-2 text-xs font-medium resize-none"/>
                                 </div>
                             </div>
                        </div>

                        {/* 2. SPEAKER MAPPER (GLOBAL RENAME) */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col flex-1">
                             <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-black text-slate-500 uppercase flex items-center gap-2"><Users size={14}/> Иштирокчилар</h3>
                                <button onClick={handleAddSpeaker} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold hover:bg-blue-100 transition-colors flex items-center gap-1">
                                    <UserPlus size={12}/> Қўшиш
                                </button>
                             </div>
                             
                             <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                                 {allSpeakers.length === 0 && <div className="text-center text-xs text-slate-400 italic py-4">Иштирокчилар топилмади</div>}
                                 {allSpeakers.map((speaker, i) => (
                                     <div key={i} className="flex flex-col gap-1">
                                         <div className="flex items-center gap-2">
                                             <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 font-bold text-xs">
                                                 {i + 1}
                                             </div>
                                             {/* Global Rename Input */}
                                             <input 
                                                 value={speaker} 
                                                 onChange={(e) => handleGlobalRename(speaker, e.target.value)}
                                                 className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 transition-colors"
                                                 placeholder={`Гапирувчи ${i+1}`}
                                                 title="Номни ўзгартирсангиз, бутун матн бўйлаб ўзгаради"
                                             />
                                         </div>
                                     </div>
                                 ))}
                             </div>
                             <div className="bg-blue-50 p-3 rounded-xl mt-2">
                                 <p className="text-[10px] text-blue-700 font-medium flex items-start gap-1">
                                     <AlertCircle size={10} className="mt-0.5 shrink-0"/>
                                     Изоҳ: Бу ердан ўзгартириш бутун матнга таъсир қилади. Алоҳида қатор учун чап томондан танланг.
                                 </p>
                             </div>
                        </div>

                        <button onClick={() => {
                                    storageService.saveDocument({
                                        title: `Стенограмма – ${protocolData.date}`,
                                        category: 'STENOGRAM',
                                        tags: ['AI', 'ТАҲРИРЛАНГАН', 'СТЕНОГРАММА'],
                                        content: JSON.stringify(segments),
                                        metadata: { ...protocolData }
                                    });
                                    toast("Архивга сақланди", "success");
                                }} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold text-xs flex justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg"><Save size={16}/> ЛОЙИҲАНИ САҚЛАШ</button>
                    </div>
                </div>
            )}
        </div>

        <ConfirmModal
          open={deleteSegmentId !== null}
          title="Қаторни ўчириш"
          message="Ушбу стенограмма қатори ўчирилади. Давом этасизми?"
          confirmLabel="Очириш"
          cancelLabel="Бекор қилиш"
          variant="danger"
          onConfirm={confirmDeleteSegment}
          onCancel={() => setDeleteSegmentId(null)}
        />
    </div>
  );
};
export default Stenogram;
