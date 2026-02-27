
// ... (imports remain same)
import React, { useState, useRef, useEffect } from 'react';
import { generateForensicVideo, analyzeForensicDocuments } from '../../services/geminiService';
import { DocumentAnalysisResult } from '../../types';
import { storageService } from '../../services/storageService';
import { Upload, Play, Pause, Loader2, Video, ArrowLeft, Trash2, FileText, FileImage, Cctv, Disc, Map, Eye, Save, Edit3, CheckCircle2, Activity } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import heic2any from 'heic2any';
import { useToast } from '../../contexts/ToastContext';

interface ForensicVisualizerProps {
  onBack: () => void;
}

type CameraView = 'CCTV_STREET' | 'DASHCAM_CAR' | 'DRONE_TOP' | 'WITNESS_PHONE';

interface FileItem {
    name: string;
    base64: string;
    mimeType: string;
}

const STAGE_LABELS = [
  "Тўқнашувдан аввал",
  "Тўқнашув лаҳзаси",
  "Дарҳол оқибат",
  "Политсия саҳнаси",
];

const AccidentVisualizer: React.FC<ForensicVisualizerProps> = ({ onBack }) => {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DocumentAnalysisResult | null>(null);
  const [editableSummary, setEditableSummary] = useState<string>("");
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [selectedView, setSelectedView] = useState<CameraView>('CCTV_STREET');
  const [frames, setFrames] = useState<string[]>([]);
  const [activeFrame, setActiveFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [expertExplanation, setExpertExplanation] = useState<string | null>(null);
  const [technicalDetails, setTechnicalDetails] = useState<Record<string, unknown> | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying && frames.length > 1) {
      playTimerRef.current = setInterval(() => {
        setActiveFrame((prev) => {
          if (prev >= frames.length - 1) { setIsPlaying(false); return prev; }
          return prev + 1;
        });
      }, 2000);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }
    return () => { if (playTimerRef.current) clearInterval(playTimerRef.current); };
  }, [isPlaying, frames.length]);

  const getMimeTypeFromExtension = (filename: string, defaultType: string): string => {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
      if (ext === 'png') return 'image/png';
      if (ext === 'webp') return 'image/webp';
      if (ext === 'pdf') return 'application/pdf';
      return defaultType;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []) as File[];
      
      for (const file of selectedFiles) {
          let processFile = file;

          // Handle HEIC conversion
          if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic')) {
              try {
                  toast("ХЕИЦ формат ўзгартирилмоқда...", "info");
                  const converted = await heic2any({ blob: file, toType: 'image/jpeg' });
                  const blob = Array.isArray(converted) ? converted[0] : converted;
                  processFile = new File([blob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
              } catch(e) {
                  console.error("HEIC conversion failed", e);
                  toast("ХЕИЦ форматини ўқишда хатолик", "error");
                  continue; // Skip failed conversion
              }
          }

          const reader = new FileReader();
          reader.onloadend = () => {
              const resultString = reader.result as string;
              // Extract pure Base64
              const base64 = resultString.split(',')[1];
              
              // Robust MIME type detection
              let mimeType = processFile.type;
              if (!mimeType || mimeType === '') {
                  mimeType = getMimeTypeFromExtension(processFile.name, 'image/jpeg');
              }
              
              setFiles(prev => [...prev, { name: processFile.name, base64, mimeType }]);
          };
          reader.readAsDataURL(processFile);
      }
  };

  const removeFile = (index: number) => {
      setFiles(prev => prev.filter((_, i) => i !== index));
      if(files.length <= 1) { setAnalysisResult(null); setEditableSummary(""); }
  };

  const ANALYSIS_TIMEOUT_MS = 60000;
  const startAnalysis = async () => {
      if (files.length === 0) return;
      setAnalyzing(true);
      setAnalysisResult(null);
      try {
          const result = await Promise.race([
              analyzeForensicDocuments(files, language),
              new Promise<DocumentAnalysisResult | null>((_, reject) =>
                  setTimeout(() => reject(new Error("Таҳлил вақти тугади (60 с). Қайта уриниб кўринг.")), ANALYSIS_TIMEOUT_MS)
              ),
          ]);
          if (result && (result.summary || result.vehicle1Type)) {
              setAnalysisResult(result);
              setEditableSummary(result.summary);
              toast("Таҳлил муваффақиятли якунланди", "success");
          } else {
              throw new Error("Бўш натижа қайтди");
          }
      } catch (e) {
          const msg = e instanceof Error ? e.message : "Таҳлилда хатолик юз берди. Расм сифатини текширинг.";
          toast(msg, "error");
      } finally {
          setAnalyzing(false);
      }
  };

  const startGeneration = async () => {
      setGenerating(true);
      setFrames([]);
      setActiveFrame(0);
      setIsPlaying(false);
      const refinedAnalysis = { ...analysisResult, summary: editableSummary };

      toast("Саҳналар генератсия қилинмоқда...", "info");

      try {
          const result = await generateForensicVideo(refinedAnalysis, selectedView, language);
          if (result.frames.length === 0) throw new Error("Расмлар қайтмади.");

          setFrames(result.frames);
          setActiveFrame(0);
          setIsPlaying(true);
          setExpertExplanation(result.explanation);
          setTechnicalDetails(result.technicalDetails as Record<string, unknown>);
          toast(`${result.frames.length} та саҳна муваффақиятли яратилди!`, "success");
      } catch (e) {
          console.error("Scene Gen Error:", e);
          toast(e instanceof Error ? e.message : "Саҳналарни яратишда хатолик.", "error");
      } finally {
          setGenerating(false);
      }
  };

  const saveToArchive = () => {
      if (!analysisResult) return;
      storageService.saveDocument({
          title: `Автоҳалокат реконструксияси: ${analysisResult.timeOfDay || "Номаълум вақт"}`,
          category: 'VIDEO',
          description: editableSummary,
          content: expertExplanation || '',
          tags: ['Реконструксия', selectedView],
          metadata: technicalDetails,
      });
      toast("Архивга сақланди.", "success");
  };

  const getViewLabel = (view: CameraView) => {
      switch(view) {
          case 'CCTV_STREET': return { icon: Cctv, label: 'Кузатув Камераси' };
          case 'DASHCAM_CAR': return { icon: Disc, label: 'Видео Регистратор' };
          case 'DRONE_TOP': return { icon: Map, label: 'Дрон (Юқоридан)' };
          case 'WITNESS_PHONE': return { icon: Eye, label: 'Гувоҳ Телефони' };
      }
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#F8FAFC] overflow-hidden relative font-sans text-slate-900">
      
      {/* HEADER */}
      <div className="h-20 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-6">
             <button type="button" onClick={onBack} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-uzblue hover:text-white transition-all" aria-label="Ортага">
                <ArrowLeft size={20}/>
             </button>
             <div>
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-3 tracking-tight uppercase">
                    <Video className="text-uzred" size={24}/>
                    Автоҳалокат <span className="text-uzred">Экспертизаси</span>
                </h2>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">AI Саҳнани Реконструксия Moduli</p>
             </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative z-10 p-6 gap-6 flex">
        
        {/* LEFT CONFIGURATION PANEL */}
        <div className="w-[450px] flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2 pb-20">
            
            {/* 1. UPLOAD */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-black text-slate-500 uppercase mb-4 flex items-center gap-2">
                    <FileText size={14} className="text-uzblue"/> Експерт Хулосаси
                </h3>

                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 bg-slate-50 rounded-xl cursor-pointer hover:border-uzblue hover:bg-blue-50 transition-all group relative overflow-hidden">
                    <input type="file" multiple accept="image/png, image/jpeg, image/jpg, image/webp, application/pdf, .heic" className="hidden" onChange={handleFileUpload}/>
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
                        <Upload size={28} className="text-slate-400 group-hover:text-uzblue mb-3 transition-colors"/>
                        <p className="text-xs font-bold text-slate-600 group-hover:text-uzblue">Файл юклаш (JPG/PNG/PDF)</p>
                    </div>
                </label>

                <div className="space-y-2 mt-4">
                    {files.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-100 border border-slate-200">
                            <div className="flex items-center gap-3 overflow-hidden">
                                {file.mimeType.includes('pdf') ? <FileText size={16} className="text-red-500 shrink-0"/> : <FileImage size={16} className="text-blue-500 shrink-0"/>}
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-xs font-bold text-slate-700 truncate">{file.name}</span>
                                    <span className="text-[9px] text-slate-400 font-mono">{file.mimeType}</span>
                                </div>
                            </div>
                            <button onClick={() => removeFile(idx)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 size={14}/></button>
                        </div>
                    ))}
                    {files.length === 0 && (
                        <div className="text-center p-2 text-xs text-slate-400 italic">Ҳозирча файллар йўқ</div>
                    )}
                </div>

                <button 
                    onClick={startAnalysis}
                    disabled={files.length === 0 || analyzing}
                    className="w-full mt-4 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all uppercase tracking-wider shadow-lg shadow-slate-200"
                >
                    {analyzing ? <Loader2 className="animate-spin" size={16}/> : <Activity size={16}/>}
                    {analyzing ? 'Таҳлил қилинмоқда...' : 'Ҳужжатни Таҳлил Қилиш'}
                </button>
            </div>

            {/* 2. PARAMETERS */}
            {analysisResult && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-in slide-in-from-left">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-black text-slate-500 uppercase">Simulyatsiya Ssenariysi</h3>
                        <button onClick={() => setIsEditingSummary(!isEditingSummary)} className="text-slate-400 hover:text-uzblue transition-colors">
                            {isEditingSummary ? <CheckCircle2 size={16}/> : <Edit3 size={16}/>}
                        </button>
                    </div>

                    <div className={`p-4 rounded-xl border transition-all mb-4 ${isEditingSummary ? 'bg-white border-uzblue ring-1 ring-uzblue/20' : 'bg-slate-50 border-slate-200'}`}>
                        {isEditingSummary ? (
                            <textarea 
                                value={editableSummary}
                                onChange={(e) => setEditableSummary(e.target.value)}
                                className="w-full h-32 bg-transparent text-xs text-slate-800 outline-none resize-none leading-relaxed font-medium"
                            />
                        ) : (
                            <p className="text-xs text-slate-600 leading-relaxed font-medium">{editableSummary}</p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {Object.entries({
                            "Tezlik V1": analysisResult.estimatedSpeedV1,
                            "Tezlik V2": analysisResult.estimatedSpeedV2,
                            "Ob-havo": analysisResult.weather,
                            "Вақт": analysisResult.timeOfDay
                        }).map(([k, v], i) => (
                            <div key={i} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <div className="text-[9px] text-slate-400 uppercase font-black mb-1">{k}</div>
                                <div className="text-xs text-slate-800 font-bold truncate">{v || 'Noma\'lum'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>

        {/* RIGHT PREVIEW & CONTROLS */}
        <div className="flex-1 flex flex-col gap-4">
            
            {/* VIEWPORT */}
            <div className="flex-1 bg-slate-100 rounded-3xl border border-slate-200 relative overflow-hidden shadow-inner group flex items-center justify-center">
                
                {/* View Selector HUD */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 p-1.5 bg-white border border-slate-200 rounded-xl z-30 shadow-sm">
                    {['CCTV_STREET', 'DASHCAM_CAR', 'DRONE_TOP', 'WITNESS_PHONE'].map((view) => {
                        const info = getViewLabel(view as CameraView);
                        return (
                            <button
                                key={view}
                                onClick={() => setSelectedView(view as CameraView)}
                                className={`p-2 rounded-lg transition-all flex items-center gap-2 ${selectedView === view ? 'bg-uzblue text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                                title={info.label}
                            >
                                <info.icon size={16}/>
                            </button>
                        );
                    })}
                </div>

                {generating || analyzing ? (
                    <div className="flex flex-col items-center gap-6 z-20">
                        <div className="w-20 h-20 border-4 border-slate-200 border-t-uzblue rounded-full animate-spin"/>
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">
                            {analyzing ? "Ҳужжатлар ўқилмоқда..." : "AI саҳналар яратмоқда..."}
                        </p>
                        {generating && <p className="text-xs text-slate-400">4 та саҳна параллел генератсия қилинмоқда, ~30-60 сония</p>}
                    </div>
                ) : frames.length > 0 ? (
                    <div className="w-full h-full flex flex-col gap-3">
                        {/* Main image */}
                        <div className="flex-1 relative overflow-hidden rounded-2xl bg-black/5 shadow-xl">
                            <img
                                key={activeFrame}
                                src={frames[activeFrame]}
                                alt={STAGE_LABELS[activeFrame] ?? `Саҳна ${activeFrame + 1}`}
                                className="w-full h-full object-contain animate-fadeIn"
                            />
                            <div className="absolute top-3 left-3 bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-lg backdrop-blur-sm">
                                {STAGE_LABELS[activeFrame] ?? `Саҳна ${activeFrame + 1}`}
                            </div>
                            <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-lg backdrop-blur-sm">
                                {activeFrame + 1} / {frames.length}
                            </div>
                        </div>
                        {/* Controls + thumbnails */}
                        <div className="flex items-center gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    if (activeFrame >= frames.length - 1) setActiveFrame(0);
                                    setIsPlaying((p) => !p);
                                }}
                                className="p-2.5 rounded-xl bg-uzblue text-white hover:bg-blue-700 transition-all shrink-0"
                            >
                                {isPlaying ? <Pause size={16}/> : <Play size={16} fill="currentColor"/>}
                            </button>
                            <div className="flex gap-2 flex-1 overflow-x-auto">
                                {frames.map((src, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => { setActiveFrame(i); setIsPlaying(false); }}
                                        className={`shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${i === activeFrame ? "border-uzblue scale-105 shadow-md" : "border-transparent opacity-60 hover:opacity-100"}`}
                                    >
                                        <img src={src} alt={STAGE_LABELS[i]} className="w-full h-full object-cover"/>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center opacity-30">
                        <Video size={80} className="mx-auto mb-4 text-slate-400"/>
                        <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">Саҳнани Реконструксия</h3>
                        <p className="text-xs text-slate-400 mt-2">Ҳужжатларни юкланг, таҳлил қилинг, кейин "Реконструксия" тугмасини босинг</p>
                    </div>
                )}
            </div>

            {/* ACTION BAR */}
            <div className="h-20 bg-white border border-slate-200 rounded-2xl flex items-center justify-between px-6 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase font-black">Танланган Ракурс</span>
                        <span className="text-sm text-slate-800 font-bold">{getViewLabel(selectedView).label}</span>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={saveToArchive}
                        disabled={frames.length === 0}
                        className="px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-uzblue hover:text-uzblue transition-all font-bold text-xs flex items-center gap-2 disabled:opacity-50"
                    >
                        <Save size={16}/> АРХИВГА САҚЛАШ
                    </button>
                    <button
                        type="button"
                        onClick={startGeneration}
                        disabled={!analysisResult || generating}
                        className="px-8 py-3 rounded-xl bg-uzred text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-uzred/20 hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {generating ? <Loader2 className="animate-spin" size={16}/> : <Play size={16} fill="currentColor"/>}
                        {generating ? 'ЯРАТИЛМОҚДА...' : 'РЕКОНСТРУКСИЯ'}
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AccidentVisualizer;
