
import React, { useState, useEffect, useRef } from 'react';
import { generatePhotorobotVariants, editPhotorobotImage } from '../../services/geminiService';
import { storageService } from '../../services/storageService';
import { 
    UserSquare2, ArrowLeft, Upload, Mic, Download, Save, 
    ScanFace, Sliders, Zap, Box, Undo2, Redo2, Loader2, StopCircle, Building2, Car, Layers, RefreshCw,
    Eye, User, Scissors, Shirt, Glasses, AlertCircle
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

interface PhotoRobotProps { onBack: () => void; }

// --- EXPANDED CONSTANTS FOR HUMAN ---
const FACE_SHAPES = ['Oval', 'Yumaloq', 'To\'rtburchak', 'Romb', 'Yuraksimon', 'Uzunchoq', 'To\'lacha', 'Boshqa'];
const SKIN_TONES = ['Оч (Оқ)', 'Буғдойранг', 'Қорача', 'Жуда қора'];
const EYE_COLORS = ['Жигарранг', 'Қора', 'Кўк', 'Яшил', 'Кулранг'];
const EYE_SHAPES = ['Бодомқовоқ', 'Катта', 'Қисиқ (Осиё)', 'Чуқур жойлашган', 'Бўртиб чиққан'];
const EYEBROWS = ['Qalin', 'Ingichka', 'Тўғри', 'Yoyimon', 'Tutashgan'];
const NOSE_SHAPES = ['Тўғри', 'Қиррабурун', 'Пучуқ', 'Катта', 'Учи қайрилган'];
const LIP_TYPES = ['Ўртача', 'Yupqa', 'Qalin (To\'liq)', 'Yuqori lab ingichka'];
const CHIN_TYPES = ['Ўртача', 'Ўткир (Учли)', 'Квадрат', 'Иккига ажралган', 'Бўртиб чиққан'];
const HAIR_STYLES = ['Kall (Sochsiz)', 'Kalga olingan (Buzz)', 'Qisqa (Sport)', 'O\'rta uzunlik', 'Uzun', 'Jingalak', 'Afro', 'Kokil'];
const BEARD_STYLES = ['Йўқ (Силлиқ)', 'Енгил соқол', 'Тўлиқ соқол', 'Эчкисилак', 'Мўйлов', 'Бакенбард'];
const BODY_TYPES = ['Ўртача', 'Ozg\'in', 'Sportchi (Muskul)', 'To\'lacha (Semiz)'];

// --- EXPANDED CONSTANTS FOR OBJECTS ---
const BUILDING_TYPES = ['Turar-joy (Hovli)', 'Ko\'p qavatli uy', 'Tijorat (Ofis/Do\'kon)', 'Sanoat (Zavod/Ombor)', 'Maishiy xizmat', 'Davlat muassasasi'];
const CAR_TYPES = ['Sedan', 'Sport (Coupe)', 'SUV (Jip)', 'Crossover', 'Hatchback', 'Universal', 'Kabriolet', 'Yuk mashinasi', 'Avtobus', 'Damas/Labo'];
const CAR_DECOR = ['Оддий', 'Тюнинг', 'Спортив', 'Ески/Кухнайиб қолган'];

const PhotoRobot: React.FC<PhotoRobotProps> = ({ onBack }) => {
  const { toast } = useToast();
  const [step, setStep] = useState<'INPUT' | 'SELECT' | 'STUDIO'>('INPUT');
  
  const [targetType, setTargetType] = useState<'HUMAN' | 'OBJECT'>('HUMAN'); 
  const [inputMethod, setInputMethod] = useState<'PARAMETRIC' | 'NARRATIVE'>('PARAMETRIC');
  

  // --- EXPANDED HUMAN STATE ---
  const [features, setFeatures] = useState({
      gender: 'Erkak', 
      age: 30, 
      ethnicity: 'Markaziy Osiyo (O\'zbek)', 
      skinTone: 'Буғдойранг',
      bodyType: 'Ўртача',
      // Face
      faceShape: 'Oval', 
      forehead: 'Ўртача',
      cheeks: 'Ўртача',
      // Eyes & Brows
      eyeColor: 'Жигарранг', 
      eyeShape: 'Бодомқовоқ',
      eyebrows: 'Тўғри',
      // Nose & Mouth
      noseShape: 'Тўғри', 
      lipType: 'Ўртача',
      chinType: 'Ўртача',
      earShape: 'Ўртача',
      // Hair
      hairStyle: 'Qisqa (Sport)', 
      hairColor: 'Қора', 
      beardStyle: 'Йўқ (Силлиқ)',
      // Accessories
      glasses: 'Yo\'q',
      clothing: 'Oddiy ko\'ylak',
      details: '' // Scars, tattoos, moles
  });

  // --- EXPANDED OBJECT STATE ---
  const [objectFeatures, setObjectFeatures] = useState({ 
    category: 'Автомобил', 
    // Car specifics
    carType: 'Sedan',
    brand: '', 
    color: 'Оқ',
    carCondition: 'Янги',
    windows: 'Оддий', // Tonirovka
    rims: 'Оддий', // Diska
    licensePlate: 'Кўринмайди',
    // Building specifics
    buildingType: 'Turar-joy (Hovli)',
    floors: '1 qavatli',
    roofType: 'Shifer',
    wallMaterial: 'G\'isht',
    // General
    material: 'Metall', 
    marks: '' 
  });

  const [narrativeText, setNarrativeText] = useState('');
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Undo/Redo State
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  
  // Voice Command State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const toggleVoiceCommand = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) {
        toast("Браузерда овозли юзиш имконияти ёқ", "error");
        return;
      }
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recognition: any = new SpeechRecognitionCtor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'uz-UZ';
      
      recognition.onstart = () => setIsListening(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript as string;
        setEditPrompt(prev => prev ? `${prev} ${text}` : text);
      };
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      
      recognitionRef.current = recognition;
      recognition.start();
    }
  };

  const generate = async () => {
    setLoading(true);
    let prompt = "";
    
    if (inputMethod === 'NARRATIVE') {
        prompt = `
        CRITICAL: GENERATE A SINGLE ISOLATED SUBJECT.
        Task: Create a hyper-realistic ${targetType === 'HUMAN' ? 'biometric identification photo' : 'studio product photo'}.
        Description: ${narrativeText}. 
        
        MANDATORY RULES:
        1. ONE SINGLE PERSON/OBJECT ONLY. No groups, no crowds, no secondary figures.
        2. NO TEXT, NO LABELS, NO WATERMARKS. 
        3. PURE WHITE BACKGROUND (#FFFFFF).
        4. Camera: Front-facing, centered, 85mm lens portrait.
        5. Quality: 8k resolution, raw photography, sharp focus.
        `;
    } else {
      if (targetType === 'HUMAN') {
        // Human Prompt - BIOMETRIC STANDARD
        prompt = `
        OFFICIAL BIOMETRIC ID PHOTO of ONE SINGLE PERSON.
        
        SUBJECT SPECIFICATIONS:
        - Gender: ${features.gender}
        - Age: ${features.age} years old
        - Ethnicity: ${features.ethnicity}
        - Face: ${features.faceShape} face, ${features.skinTone} skin.
        - Hair: ${features.hairStyle}, ${features.hairColor}.
        - Eyes: ${features.eyeColor}, ${features.eyeShape}.
        - Features: ${features.noseShape} nose, ${features.lipType} lips.
        - Distinguishing Marks: ${features.details}.
        - Clothing: ${features.clothing}.
        
        STRICT COMPOSITION RULES:
        1. QUANTITY: EXACTLY ONE PERSON. NO GROUPS. NO BACKGROUND PEOPLE.
        2. FRAMING: Head and shoulders portrait (Passport/Mugshot style).
        3. BACKGROUND: SOLID PURE WHITE BACKGROUND.
        4. NO TEXT: No letters, numbers, or graphics.
        5. STYLE: Hyper-realistic 8k raw photo, sharp facial details, neutral lighting.
        `;
      } else {
        // Object Prompt - STUDIO ISOLATION
        prompt = `
        PROFESSIONAL STUDIO PRODUCT PHOTOGRAPHY of ONE SINGLE OBJECT.
        
        OBJECT DETAILS:
        - Item: ${objectFeatures.category}
        - Type: ${objectFeatures.carType || objectFeatures.buildingType || 'Standard'}
        - Brand/Model: ${objectFeatures.brand}
        - Color: ${objectFeatures.color}
        - Condition: ${objectFeatures.marks}
        - Details: ${objectFeatures.windows || ''} ${objectFeatures.rims || ''} ${objectFeatures.roofType || ''}.

        STRICT COMPOSITION RULES:
        1. QUANTITY: EXACTLY ONE OBJECT.
        2. BACKGROUND: SOLID PURE WHITE BACKGROUND (0xFFFFFF).
        3. NO TEXT: No labels, logos, or overlay text.
        4. STYLE: 8k resolution, commercial lighting, photorealistic.
        `;
      }
    }

    try {
      // Generating 5 variants as requested
      const imgs = await generatePhotorobotVariants(prompt, 5, targetType);
      setVariants(imgs);
      setStep('SELECT');
      toast("Реалистик вариантлар шакллантирилди", "success");
    } catch (e) {
        console.error(e);
        const errorMsg = e instanceof Error ? e.message : String(e);
        toast(errorMsg.slice(0, 120) || "Расм генератсиясида хатолик.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectImage = (img: string) => {
      setSelectedImage(img);
      setHistory([img]);
      setHistoryIndex(0);
      setStep('STUDIO');
      toast("Вариант танланди. Таҳрирлась режимидасиз.", "info");
  };

  const applyEdit = async () => {
    if (!selectedImage || !editPrompt) return;
    setIsEditing(true);
    try {
      const currentImg = history[historyIndex];
      // EDIT PROMPT ALSO NEEDS STRICTURE
      const realisticEditPrompt = `
      Edit instruction: ${editPrompt}. 
      
      CONSTRAINTS:
      1. KEEP IT ONE PERSON/OBJECT. Do not add people.
      2. MAINTAIN SOLID WHITE BACKGROUND.
      3. REALISTIC PHOTO QUALITY.
      4. NO TEXT.
      `;
      
      const newImg = await editPhotorobotImage(currentImg, realisticEditPrompt);
      
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newImg);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      
      setSelectedImage(newImg);
      setEditPrompt('');
      toast("Озгаришлар киритилди", "success");
    } catch (e) {
      console.error(e);
      const errorMsg = e instanceof Error ? e.message : String(e);
      toast(errorMsg.slice(0, 120) || "Таҳрирлашда хатолик юз берди.", "error");
    } finally {
      setIsEditing(false);
    }
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setSelectedImage(history[newIndex]);
          toast("Амал бекор қилинди", "info");
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setSelectedImage(history[newIndex]);
          toast("Амал қайтарилди", "info");
      }
  };

  const downloadImage = () => {
      if (!selectedImage) return;
      const link = document.createElement('a');
      link.href = selectedImage;
      link.download = `photorobot_${targetType}_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast("ЖПГ файл юклаб олинди", "success");
  };

  return (
    <div className="w-full h-full bg-[#F8FAFC] flex flex-col overflow-hidden text-slate-700 relative">
      

      {/* HEADER */}
      <div className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-200 z-20 shrink-0">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-uzblue hover:text-uzblue transition-all">
                  <ArrowLeft size={20}/>
              </button>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                  <ScanFace className="text-uzblue" size={24}/>
                  <span className="text-uzblue">Fotorobot 2.0 (Realistik)</span>
              </h1>
          </div>

          <div className="flex items-center gap-4">
              <div className="flex gap-2">
                  {['INPUT', 'SELECT', 'STUDIO'].map((s, i) => (
                      <div key={s} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${step === s ? 'bg-uzblue text-white border-uzblue shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-200 opacity-50'}`}>
                          {i + 1}. {s}
                      </div>
                  ))}
              </div>
          </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
          {/* LEFT: CONTROLS */}
          <div className="w-[450px] bg-white border-r border-slate-200 flex flex-col z-10 shadow-xl shadow-slate-200/50">
              <div className="p-5 border-b border-slate-100 flex gap-2">
                  <button onClick={() => setTargetType('HUMAN')} className={`flex-1 py-4 rounded-2xl font-bold text-xs flex flex-col items-center gap-2 transition-all ${targetType === 'HUMAN' ? 'bg-uzblue text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                      <UserSquare2 size={24}/> INSON
                  </button>
                  <button onClick={() => setTargetType('OBJECT')} className={`flex-1 py-4 rounded-2xl font-bold text-xs flex flex-col items-center gap-2 transition-all ${targetType === 'OBJECT' ? 'bg-uzgreen text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                      <Box size={24}/> PREDMET
                  </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                  {step === 'INPUT' && (
                    <>
                      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                          <button onClick={() => setInputMethod('PARAMETRIC')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${inputMethod === 'PARAMETRIC' ? 'bg-white text-uzblue shadow-sm' : 'text-slate-500'}`}>Параметрик</button>
                          <button onClick={() => setInputMethod('NARRATIVE')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${inputMethod === 'NARRATIVE' ? 'bg-white text-uzblue shadow-sm' : 'text-slate-500'}`}>Тавсиф</button>
                      </div>

                      {inputMethod === 'PARAMETRIC' ? (
                        <div className="space-y-6 animate-in slide-in-from-left duration-300">
                           {targetType === 'HUMAN' ? (
                             <>
                               {/* SECTION 1: BASIC INFO */}
                               <div className="space-y-3 pb-4 border-b border-slate-100">
                                   <h4 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 mb-2"><User size={14}/> Asosiy Ma'lumotlar</h4>
                                   <div className="grid grid-cols-2 gap-3">
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Жинси</label>
                                       <select value={features.gender} onChange={e => setFeatures({...features, gender: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue"><option>Erkak</option><option>Ayol</option></select></div>
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Ёши: {features.age}</label>
                                       <input type="range" min="10" max="90" value={features.age} onChange={e => setFeatures({...features, age: parseInt(e.target.value)})} className="w-full accent-uzblue"/></div>
                                   </div>
                                   <div className="grid grid-cols-2 gap-3">
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Ирқи/Миллити</label>
                                       <input value={features.ethnicity} onChange={e => setFeatures({...features, ethnicity: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue"/></div>
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Тана Тузилиши</label>
                                       <select value={features.bodyType} onChange={e => setFeatures({...features, bodyType: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue">{BODY_TYPES.map(o=><option key={o}>{o}</option>)}</select></div>
                                   </div>
                               </div>

                               {/* SECTION 2: FACE DETAILS */}
                               <div className="space-y-3 pb-4 border-b border-slate-100">
                                   <h4 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 mb-2"><ScanFace size={14}/> Йуз Тузилиши</h4>
                                   
                                   <div className="grid grid-cols-2 gap-3">
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Йуз Шакли</label>
                                       <select value={features.faceShape} onChange={e => setFeatures({...features, faceShape: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue">{FACE_SHAPES.map(o=><option key={o}>{o}</option>)}</select></div>
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Тери Ранги</label>
                                       <select value={features.skinTone} onChange={e => setFeatures({...features, skinTone: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue">{SKIN_TONES.map(o=><option key={o}>{o}</option>)}</select></div>
                                   </div>

                                   <div className="grid grid-cols-2 gap-3">
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Пешона</label>
                                       <select value={features.forehead} onChange={e => setFeatures({...features, forehead: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue"><option>O'rtacha</option><option>Keng</option><option>Tor</option><option>Döng</option></select></div>
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Ёноқлар</label>
                                       <select value={features.cheeks} onChange={e => setFeatures({...features, cheeks: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue"><option>O'rtacha</option><option>Bo'rtib chiqqan</option><option>Ichiga botgan</option></select></div>
                                   </div>
                               </div>

                               {/* SECTION 3: EYES & NOSE */}
                               <div className="space-y-3 pb-4 border-b border-slate-100">
                                   <h4 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 mb-2"><Eye size={14}/> Кўз ва Бурун</h4>
                                   <div className="grid grid-cols-2 gap-3">
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Кўз Ранги</label>
                                       <select value={features.eyeColor} onChange={e => setFeatures({...features, eyeColor: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue">{EYE_COLORS.map(o=><option key={o}>{o}</option>)}</select></div>
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Кўз Шакли</label>
                                       <select value={features.eyeShape} onChange={e => setFeatures({...features, eyeShape: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue">{EYE_SHAPES.map(o=><option key={o}>{o}</option>)}</select></div>
                                   </div>
                                   <div className="grid grid-cols-2 gap-3">
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Қошлар</label>
                                       <select value={features.eyebrows} onChange={e => setFeatures({...features, eyebrows: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue">{EYEBROWS.map(o=><option key={o}>{o}</option>)}</select></div>
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Бурун</label>
                                       <select value={features.noseShape} onChange={e => setFeatures({...features, noseShape: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue">{NOSE_SHAPES.map(o=><option key={o}>{o}</option>)}</select></div>
                                   </div>
                               </div>

                               {/* SECTION 4: HAIR & BEARD */}
                               <div className="space-y-3 pb-4 border-b border-slate-100">
                                   <h4 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 mb-2"><Scissors size={14}/> Соч ва Соқол</h4>
                                   <div className="grid grid-cols-2 gap-3">
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Соч Турмаги</label>
                                       <select value={features.hairStyle} onChange={e => setFeatures({...features, hairStyle: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue">{HAIR_STYLES.map(o=><option key={o}>{o}</option>)}</select></div>
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Соч Ранги</label>
                                       <input value={features.hairColor} onChange={e => setFeatures({...features, hairColor: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue"/></div>
                                   </div>
                                   {features.gender === 'Erkak' && (
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Соқол/Мўйлов</label>
                                       <select value={features.beardStyle} onChange={e => setFeatures({...features, beardStyle: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue">{BEARD_STYLES.map(o=><option key={o}>{o}</option>)}</select></div>
                                   )}
                               </div>

                               {/* SECTION 5: CLOTHING & DETAILS */}
                               <div className="space-y-3">
                                   <h4 className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 mb-2"><Shirt size={14}/> Кийим ва Белгилар</h4>
                                   <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Кийим Услуби</label>
                                   <input value={features.clothing} onChange={e => setFeatures({...features, clothing: e.target.value})} placeholder="Мас.: Қора куртка, оқ кепка..." className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue"/></div>
                                   
                                   <div className="grid grid-cols-2 gap-3">
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Кўзойнак</label>
                                       <select value={features.glasses} onChange={e => setFeatures({...features, glasses: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzblue"><option>Йўқ</option><option>Қора кўзойнак</option><option>Оптик кўзойнак</option></select></div>
                                   </div>

                                   <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Қўшимча Белгилар</label>
                                   <textarea value={features.details} onChange={e => setFeatures({...features, details: e.target.value})} placeholder="Chandiq, xol, tatuirovka joylashuvi..." className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs h-20 outline-none focus:border-uzblue resize-none"></textarea></div>
                               </div>
                             </>
                           ) : (
                             <>
                               {/* OBJECT PARAMETERS */}
                               <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">Категория</label>
                               <select value={objectFeatures.category} onChange={e => setObjectFeatures({...objectFeatures, category: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-uzgreen">
                                 <option>Avtomobil</option>
                                 <option>Bino / Inshoot</option>
                                 <option>Mobil Telefon</option>
                                 <option>Qurol / Pichoq</option>
                               </select></div>

                               {objectFeatures.category === 'Автомобил' && (
                                 <div className="space-y-3 animate-in fade-in slide-in-from-top-1 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                   <h4 className="text-xs font-black text-slate-400 uppercase mb-2">Автомобил Тафсилотлари</h4>
                                   <div className="grid grid-cols-2 gap-3">
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Кузов</label>
                                       <select value={objectFeatures.carType} onChange={e => setObjectFeatures({...objectFeatures, carType: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzgreen">{CAR_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Ранги</label>
                                       <input value={objectFeatures.color} onChange={e => setObjectFeatures({...objectFeatures, color: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzgreen"/></div>
                                   </div>
                                   <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Марка / Модел</label>
                                   <input value={objectFeatures.brand} onChange={e => setObjectFeatures({...objectFeatures, brand: e.target.value})} placeholder="Mas: Chevrolet Gentra" className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzgreen"/></div>
                                   
                                   <div className="grid grid-cols-2 gap-3">
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Ойналар (Тонировка)</label>
                                       <select value={objectFeatures.windows} onChange={e => setObjectFeatures({...objectFeatures, windows: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzgreen"><option>Oddiy</option><option>Qoraytirillgan (Tonirovka)</option><option>Parda</option></select></div>
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Дискалар</label>
                                       <select value={objectFeatures.rims} onChange={e => setObjectFeatures({...objectFeatures, rims: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzgreen"><option>Оддий (Калпак)</option><option>Қотишма (Литий)</option><option>Катта Спорт</option></select></div>
                                   </div>
                                   
                                   <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Давлат Рақами</label>
                                   <select value={objectFeatures.licensePlate} onChange={e => setObjectFeatures({...objectFeatures, licensePlate: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzgreen"><option>Ko'rinmaydi</option><option>Бор (Ўзбекистон)</option><option>Бор (Чет эл)</option><option>Ечиб олинган</option></select></div>
                                 </div>
                               )}

                               {objectFeatures.category === 'Бино / Иншоот' && (
                                 <div className="space-y-3 animate-in fade-in slide-in-from-top-1 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                   <h4 className="text-xs font-black text-slate-400 uppercase mb-2">Бино Тафсилотлари</h4>
                                   <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Бино Тури</label>
                                   <select value={objectFeatures.buildingType} onChange={e => setObjectFeatures({...objectFeatures, buildingType: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzgreen">{BUILDING_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                                   
                                   <div className="grid grid-cols-2 gap-3">
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Қаватлар</label>
                                       <select value={objectFeatures.floors} onChange={e => setObjectFeatures({...objectFeatures, floors: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzgreen"><option>1 qavatli</option><option>2 qavatli</option><option>Ko'p qavatli</option></select></div>
                                       <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Девор Материали</label>
                                       <select value={objectFeatures.wallMaterial} onChange={e => setObjectFeatures({...objectFeatures, wallMaterial: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-uzgreen"><option>G'isht</option><option>Beton</option><option>Shisha (Hi-tech)</option><option>Loy suvoq</option></select></div>
                                   </div>
                                 </div>
                               )}

                               <textarea value={objectFeatures.marks} onChange={e => setObjectFeatures({...objectFeatures, marks: e.target.value})} placeholder="Шикастлар, езувлар ва алоҳида белгилар..." className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm h-32 outline-none focus:border-uzgreen resize-none"></textarea>
                             </>
                           )}
                        </div>
                      ) : (
                        <textarea value={narrativeText} onChange={e => setNarrativeText(e.target.value)} placeholder="Гумонланувчи ёки ашёни еркин тавсифланг..." className="w-full flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-5 text-sm outline-none focus:border-uzblue resize-none min-h-[300px] shadow-inner"></textarea>
                      )}
                    </>
                  )}

                  {step === 'SELECT' && (
                    <div className="space-y-4 animate-in slide-in-from-left">
                       <h3 className="text-sm font-black uppercase text-slate-800">5 ta Realistik Variant</h3>
                       <p className="text-xs text-slate-500">Таҳрирлаш ва якуний хулоса учун мос вариантни танланг.</p>
                       <button onClick={() => setStep('INPUT')} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200">ОРҚАГА ҚАЙТИШ</button>
                    </div>
                  )}

                  {step === 'STUDIO' && (
                    <div className="space-y-6 animate-in slide-in-from-left">
                       <div className="bg-uzblue/5 p-4 rounded-2xl border border-uzblue/10">
                          <h3 className="text-xs font-black text-uzblue uppercase mb-2 flex items-center gap-2">
                             <Layers size={14}/> AI Студия (Реалистик Таҳрирлаш)
                          </h3>
                          <div className="relative">
                            <textarea 
                                value={editPrompt} 
                                onChange={e => setEditPrompt(e.target.value)} 
                                placeholder="Масалан: 'Кўзини жигарранг қил', 'Бурнини кичрайтир', 'Йоритишни кучайтир'..." 
                                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm h-28 outline-none focus:border-uzblue resize-none pr-10"
                            ></textarea>
                            <button 
                                onClick={toggleVoiceCommand}
                                className={`absolute right-2 bottom-2 p-2 rounded-full transition-all ${isListening ? 'bg-red-50 text-red-500 animate-pulse' : 'bg-slate-100 text-slate-400 hover:text-uzblue'}`}
                                title="Ovozli buyruq"
                            >
                                {isListening ? <StopCircle size={16}/> : <Mic size={16}/>}
                            </button>
                          </div>
                          <button onClick={applyEdit} disabled={isEditing || !editPrompt} className="w-full mt-3 py-3 bg-uzblue text-white rounded-xl font-bold text-xs shadow-lg shadow-uzblue/20 disabled:opacity-50 flex items-center justify-center gap-2">
                             {isEditing ? <Loader2 className="animate-spin" size={16}/> : <RefreshCw size={16}/>}
                             {isEditing ? "ЎЗГАРТИРИЛМОҚДА..." : "ЎЗГАРТИРИШЛАРНИ ҚЎЛЛАШ"}
                          </button>
                       </div>
                       
                       <div className="flex gap-2">
                            <button onClick={handleUndo} disabled={historyIndex <= 0} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 flex items-center justify-center gap-2 disabled:opacity-50">
                                <Undo2 size={16}/> ОРҚАГА
                            </button>
                            <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 flex items-center justify-center gap-2 disabled:opacity-50">
                                <Redo2 size={16}/> ОЛДИНГА
                            </button>
                       </div>

                       <button onClick={() => setStep('SELECT')} className="w-full py-3 bg-slate-50 text-slate-400 rounded-xl text-xs font-bold hover:bg-slate-100 border border-slate-100">
                           ВАРИАНТЛАРГА ҚАЙТИШ
                       </button>
                    </div>
                  )}
              </div>

              {step === 'INPUT' && (
                <div className="p-6 border-t border-slate-100">
                    <button onClick={() => generate()} disabled={loading} className={`w-full py-4 ${targetType === 'HUMAN' ? 'bg-uzblue shadow-uzblue/20' : 'bg-uzgreen shadow-uzgreen/20'} text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all`}>
                        {loading ? <Loader2 className="animate-spin" size={20}/> : <Zap fill="currentColor" size={20}/>}
                        {loading ? 'ВАРИАНТЛАР ЯРАТИЛМОҚДА...' : '5 TA РЕАЛ ФОТО ЯРАТИШ'}
                    </button>
                </div>
              )}
          </div>

          {/* RIGHT: VIEWPORT */}
          <div className="flex-1 bg-[#F1F5F9] p-10 flex items-center justify-center relative">
              {loading && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-6">
                      <div className="w-24 h-24 border-4 border-slate-200 border-t-uzblue rounded-full animate-spin"></div>
                      <h3 className="text-2xl font-black text-slate-800 animate-pulse uppercase tracking-widest text-center">
                          AI 5 та реалистик вариант устида<br/>ишламоқда...
                      </h3>
                      <p className="text-slate-500 font-medium">Бу жараён 30 сониягача вақт олиши мумкин</p>
                  </div>
              )}

              {step === 'INPUT' && !loading && (
                <div className="text-center opacity-20 group">
                    <div className="w-48 h-48 bg-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl border-4 border-slate-200 group-hover:scale-110 transition-transform">
                        {targetType === 'HUMAN' ? <ScanFace size={80} /> : (objectFeatures.category === 'Бино / Иншоот' ? <Building2 size={80}/> : (objectFeatures.category === 'Автомобил' ? <Car size={80}/> : <Box size={80}/>))}
                    </div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter">Маълумотлар кутилмоқда</h2>
                    <p className="text-lg font-medium mt-2">Чап томондан параметрларни тўлдиринг</p>
                </div>
              )}

              {step === 'SELECT' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 w-full max-w-5xl animate-in zoom-in duration-500 h-full overflow-y-auto custom-scrollbar p-4">
                    {variants.map((v, i) => (
                        <div key={i} onClick={() => handleSelectImage(v)} className="group relative aspect-square bg-white rounded-3xl overflow-hidden cursor-pointer shadow-lg hover:shadow-2xl border-2 border-transparent hover:border-uzblue hover:-translate-y-2 transition-all">
                            <img src={v} className="w-full h-full object-cover"/>
                            <div className="absolute top-4 left-4 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
                                Вариант {i+1}
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-8">
                                <span className="px-8 py-3 bg-uzblue text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl scale-90 group-hover:scale-100 transition-transform">
                                    Танлаш ва Таҳрирлаш
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
              )}

              {step === 'STUDIO' && selectedImage && (
                <div className="w-full max-w-4xl h-full flex flex-col animate-in zoom-in duration-500">
                    <div className="flex-1 relative bg-white rounded-[32px] overflow-hidden shadow-2xl border-4 border-white mb-6 group">
                        {isEditing && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-4">
                                <div className="w-16 h-16 border-4 border-slate-200 border-t-uzblue rounded-full animate-spin"></div>
                                <span className="bg-white px-4 py-2 rounded-full font-bold text-slate-800 shadow-lg text-xs uppercase tracking-wider">AI Ўзгартирмоқда...</span>
                            </div>
                        )}
                        <img src={selectedImage} className="w-full h-full object-contain bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"/>
                        
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur text-white px-6 py-2 rounded-full text-xs font-mono">
                            Tarix: {historyIndex + 1} / {history.length}
                        </div>
                    </div>

                    <div className="flex gap-4 justify-center">
                        <button onClick={downloadImage} className="px-8 py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold text-sm shadow-sm hover:bg-slate-50 flex items-center gap-3 transition-all active:scale-95">
                            <Download size={20}/> ЖПГ ЮКЛАБ ОЛИШ
                        </button>
                        <button onClick={() => { storageService.saveDocument({ title: 'Fotorobot: ' + (targetType==='HUMAN'?features.gender:objectFeatures.category), category: 'PHOTOROBOT', mediaUrl: selectedImage!, tags: ['AI', targetType], description: 'AI орқали шакллантирилган реалистик фото' }); toast("Архивга сақланди!", "success"); onBack(); }} className="px-10 py-4 bg-uzblue text-white rounded-2xl font-black text-sm shadow-xl shadow-uzblue/20 hover:bg-uzblue/90 flex items-center gap-3 transition-all active:scale-95">
                            <Save size={20}/> АРХИВГА САҚЛАШ
                        </button>
                    </div>
                </div>
              )}
          </div>
      </div>
    </div>
  );
};

export default PhotoRobot;
