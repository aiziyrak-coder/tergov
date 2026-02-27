import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowLeft, Save, StopCircle, Play, FileText, Radio, Gavel,
  Brain, Lightbulb, Loader2, Mic, MicOff, Clock,
} from "lucide-react";
import { ProtocolMetadata, ProtocolType, DialogSegment, AppLanguage, ProtocolLanguage } from "../../types";
import { useToast } from "../../contexts/ToastContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { generateLegalProtocol, transcribeAudio, latinUzbekToCyrillic } from "../../services/geminiService";
import { saveSoroqAudio, getSoroqAudio, clearSoroqAudio, type SavedSoroqAudio } from "../../services/soroqAudioStorage";
import { PROTOCOL_TEMPLATES, type ProtocolTemplateEntry } from "../../config/protocolTemplates";

/** Safe template getter */
function getTemplateEntry(selected: ProtocolType | string): ProtocolTemplateEntry {
  return PROTOCOL_TEMPLATES[selected as ProtocolType] ?? PROTOCOL_TEMPLATES[ProtocolType.GUVOH];
}

/** Demo anketa defaults per protocol type — template o'zgarganda mos ravishda qo'llanadi */
const DEMO_ANKETA_BY_TYPE: Record<ProtocolType, Partial<ExtendedMetadata>> = {
  [ProtocolType.GUVOH]: {
    personName: "Жураев Фарходжон Абдумуталибович",
    birthDate: "24.08.1965",
    birthPlace: "Фарғона тумани",
    nationality: "Ўзбек",
    citizenship: "Ўзбекистон Республикаси",
    education: "Олий, Фарғона давлат университети",
    workPlace: "Олиев Солий Саноат МЧЖ, бухгалтер",
    address: "Фарғона шаҳри, Сўхи кўчаси 15-уй",
    familyStatus: "Оилали, 3 нафар фарзанд",
    conviction: "Судланмаган",
    idDocument: "AB 1234567",
    relationVictim: "Таниш эмас",
    relationSuspect: "Таниш эмас",
    deputyStatus: "Хизмат қилган",
    phoneNumber: "+998 97 276-21-63",
  },
  [ProtocolType.GUMONLANUVCHI]: {
    personName: "Каримов Хуршид Шукруллаевич",
    birthDate: "15.03.1988",
    birthPlace: "Марғилон шаҳри",
    nationality: "Ўзбек",
    citizenship: "Ўзбекистон Республикаси",
    education: "Ўрта махсус, автомобиль техники",
    workPlace: "Такси ҳайдовчи",
    address: "Фарғона шаҳри, Навоий кўчаси 42-уй",
    familyStatus: "Турмуш қурмаган",
    conviction: "Судланмаган",
    idDocument: "AC 7890123",
    relationVictim: "Қўшни",
    relationSuspect: "—",
    deputyStatus: "Хизмат қилмаган",
    phoneNumber: "+998 91 234-56-78",
  },
  [ProtocolType.AYBLANUVCHI]: {
    personName: "Турсунов Акмалжон Отабекович",
    birthDate: "02.11.1990",
    birthPlace: "Қўқон шаҳри",
    nationality: "Ўзбек",
    citizenship: "Ўзбекистон Республикаси",
    education: "Ўрта махсус",
    workPlace: "Ишсиз",
    address: "Фарғона шаҳри, Амира Темура 78-уй",
    familyStatus: "Оилали, 2 нафар фарзанд",
    conviction: "2019 йилда ҲК 167-модда",
    idDocument: "AD 3456789",
    relationVictim: "Таниш эмас",
    relationSuspect: "—",
    deputyStatus: "Хизмат қилган",
    phoneNumber: "+998 93 456-78-90",
  },
  [ProtocolType.JABRLANUVCHI]: {
    personName: "Рахмонова Ойша Абдурахимовна",
    birthDate: "18.05.1975",
    birthPlace: "Фарғона шаҳри",
    nationality: "Ўзбек",
    citizenship: "Ўзбекистон Республикаси",
    education: "Олий, педагоника",
    workPlace: "20-мактаб, ўқитувчи",
    address: "Фарғона шаҳри, Ислом Каримов кўчаси 25-уй",
    familyStatus: "Оилали, 2 нафар фарзанд",
    conviction: "Судланмаган",
    idDocument: "AB 5678901",
    relationVictim: "Жабрланувчи",
    relationSuspect: "Таниш эмас",
    deputyStatus: "Хизмат қилмаган",
    phoneNumber: "+998 94 567-89-01",
  },
  [ProtocolType.YUZLASHTIRISH]: {
    personName: "Қодиров Бобур Жасур ўғли",
    birthDate: "30.07.1982",
    birthPlace: "Андижон вилояти",
    nationality: "Ўзбек",
    citizenship: "Ўзбекистон Республикаси",
    education: "Олий",
    workPlace: "Савдо маркази, менежер",
    address: "Фарғона шаҳри, Мустақиллик 100-уй",
    familyStatus: "Оилали",
    conviction: "Судланмаган",
    idDocument: "AB 2345678",
    relationVictim: "Иккинчи тараф билан таниш",
    relationSuspect: "Иккинчи тараф билан таниш",
    deputyStatus: "Хизмат қилган",
    phoneNumber: "+998 90 123-45-67",
  },
};

/** Format seconds to mm:ss */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

interface SmartProtocolProps {
  onBack: () => void;
}

interface ExtendedMetadata extends ProtocolMetadata {
  idDocument: string;
  relationSuspect: string;
  relationVictim: string;
  deputyStatus: string;
  phoneNumber: string;
}

const SmartProtocol: React.FC<SmartProtocolProps> = ({ onBack }) => {
  const { t } = useLanguage();
  const { toast } = useToast();

  // --- CONFIGURATION ---
  const [selectedTemplate, setSelectedTemplate] = useState<ProtocolType>(ProtocolType.GUVOH);
  const getBaseMeta = () => ({
    caseNumber: "300001/2025-15ГУ",
    city: "Фарғона шаҳри",
    investigatorName: "Турдиев Сарвар Илхомович",
    investigatorRank: "подполковник",
    officeNumber: "118",
    date: new Date().toISOString().split("T")[0],
    startTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    endTime: "",
    participants: [],
  });

  const [metadata, setMetadata] = useState<ExtendedMetadata>(() => ({
    ...getBaseMeta(),
    ...DEMO_ANKETA_BY_TYPE[ProtocolType.GUVOH],
  }));

  useEffect(() => {
    const tpl = selectedTemplate as ProtocolType;
    const anketa = DEMO_ANKETA_BY_TYPE[tpl] ?? DEMO_ANKETA_BY_TYPE[ProtocolType.GUVOH];
    setMetadata((prev) => ({
      ...prev,
      ...anketa,
    }));
  }, [selectedTemplate]);

  // --- RECORDING STATE ---
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [savedAudio, setSavedAudio] = useState<SavedSoroqAudio | null>(null);
  const [transcriptText, setTranscriptText] = useState("");

  // --- REAL-TIME SPEECH-TO-TEXT (display only; does not affect recording or bayonnoma) ---
  const [liveTranscript, setLiveTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");

  // --- REFS ---
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeRef = useRef(0);
  const speechRecognitionRef = useRef<InstanceType<Window["SpeechRecognition"]> | null>(null);
  const liveTranscriptEndRef = useRef<HTMLDivElement | null>(null);

  const stopEverything = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null;
    }
    setInterimTranscript("");
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopEverything();
  }, [stopEverything]);

  useEffect(() => {
    getSoroqAudio().then(setSavedAudio).catch(() => setSavedAudio(null));
  }, []);

  useEffect(() => {
    liveTranscriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveTranscript, interimTranscript]);

  const loadSavedAudio = useCallback(() => {
    if (savedAudio) {
      setAudioBlob(savedAudio.blob);
      toast("Сақланган овоз юкланди. Баённома яратиш тугмасини босинг.", "success");
    }
  }, [savedAudio, toast]);

  const removeSavedAudio = useCallback(async () => {
    await clearSoroqAudio();
    setSavedAudio(null);
    toast("Сақланган овоз ўчирилди", "info");
  }, [toast]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Setup audio visualizer
      const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const audioContext = new Ctx() as AudioContext;
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const draw = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
          setAudioLevel(avg);
          animationFrameRef.current = requestAnimationFrame(draw);
        };
        draw();
      }

      // Setup MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        audioChunksRef.current = [];
        saveSoroqAudio(blob, mimeType, recordingTimeRef.current).catch(() => {});
      };

      recorder.start(1000); // Collect data every second
      mediaRecorderRef.current = recorder;

      // Ҳақиқий вақтда аваздан-матнга (фақат кўрсатиш; язува ёки баённомага таъсир қилмайди)
      setLiveTranscript("");
      setInterimTranscript("");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = typeof window !== "undefined" ? (window as any) : null;
      const SpeechRecognitionCtor = w?.SpeechRecognition || w?.webkitSpeechRecognition || null;
      if (SpeechRecognitionCtor) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const recognition: any = new SpeechRecognitionCtor();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "uz-UZ";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recognition.onresult = (e: any) => {
            let interim = "";
            let finalText = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const result = e.results[i];
              const text = ((result[0]?.transcript as string | undefined) ?? "").trim();
              if (result.isFinal) {
                finalText += (finalText ? " " : "") + text;
              } else {
                interim += (interim ? " " : "") + text;
              }
            }
            if (finalText) {
              const cyFinal = latinUzbekToCyrillic(finalText);
              setLiveTranscript((prev) => (prev ? prev + " " + cyFinal : cyFinal));
            }
            setInterimTranscript(latinUzbekToCyrillic(interim));
          };
          recognition.onerror = () => {
            // Silent; optional: setInterimTranscript("") on no-speech
          };
          recognition.onend = () => {
            if (speechRecognitionRef.current === recognition && mediaRecorderRef.current?.state === "recording") {
              try {
                recognition.start();
              } catch {
                // already ended
              }
            }
          };
          speechRecognitionRef.current = recognition;
          recognition.start();
        } catch {
          // Browser may not support or mic busy
        }
      }

      setRecordingTime(0);
      recordingTimeRef.current = 0;
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
        recordingTimeRef.current += 1;
      }, 1000);

      setIsRecording(true);
      toast("Овоз юзиш бошланди", "success");
    } catch (e) {
      console.error("Microphone error:", e);
      toast("Микрофонга уланиб бўлмади. Руқсатни текширинг.", "error");
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    stopEverything();
    setAudioLevel(0);
    toast("Овоз юзиш тўхтатилди", "info");
  }, [stopEverything, toast]);

  const processAndGenerate = useCallback(async () => {
    if (!audioBlob) {
      toast("Аввал овоз юзинг", "error");
      return;
    }

    setIsProcessing(true);
    setProcessingStatus("Овоз таҳлил қилинмоқда...");

    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      // Transcribe audio
      setProcessingStatus("Матн ажратилмоқда...");
      const segments = await transcribeAudio(
        base64,
        audioBlob.type || "audio/webm",
        "STENOGRAM",
        true,
        AppLanguage.UZ_CYRL
      );

      if (!segments || segments.length === 0) {
        toast("Овозни таниб бўлмади. Қайта юзинг.", "error");
        setIsProcessing(false);
        return;
      }

      // Convert to DialogSegment format (no timestamps for protocol - only stenogram needs them)
      // Speaker assignment: "Гапирувчи 1" / even turns → investigator (Савол:), odd → suspect (Жавоб:)
      const dialogSegments: DialogSegment[] = segments.map((seg, idx) => {
        const spk = (seg.speaker ?? "").toLowerCase();
        const isInvestigator =
          spk.includes("tergov") ||
          spk.includes("терговч") ||
          spk.includes("investigator") ||
          spk.endsWith("1") ||
          idx % 2 === 0;
        return {
          speakerId: isInvestigator ? "investigator" : "suspect",
          speakerName: isInvestigator ? "Терговчи" : (getTemplateEntry(selectedTemplate).role || "Гапирувчи"),
          text: latinUzbekToCyrillic(seg.text || ""),
          timestamp: "",
        };
      });

      // Store transcript for display
      const fullText = dialogSegments.map((s) => `${s.speakerName}: ${s.text}`).join("\n\n");
      setTranscriptText(fullText);

      // Generate protocol
      setProcessingStatus("Баюннома шакллантирилмоқда...");
      const htmlContent = await generateLegalProtocol(
        "DICTATION",
        dialogSegments,
        selectedTemplate,
        metadata,
        ProtocolLanguage.UZ_CYRILLIC,
        AppLanguage.UZ_CYRL,
        undefined,
        getTemplateEntry(selectedTemplate)
      );

      // Download
      const blob = new Blob([htmlContent], { type: "application/msword" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const templateTitle = getTemplateEntry(selectedTemplate).title;
      a.download = `${templateTitle}_${metadata.personName || "Номсиз"}.doc`;
      a.click();
      URL.revokeObjectURL(url);

      toast("Баюннома тайор ва юклаб олинди!", "success");
    } catch (e) {
      console.error("Processing error:", e);
      const msg = (e as Error)?.message || "Хатолик юз берди";
      toast(`Хатолик: ${msg.substring(0, 80)}`, "error");
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  }, [audioBlob, selectedTemplate, metadata, toast]);

  const clearRecording = useCallback(() => {
    setAudioBlob(null);
    setTranscriptText("");
    setLiveTranscript("");
    setInterimTranscript("");
    setRecordingTime(0);
    toast("Юзув ўчирилди", "info");
  }, [toast]);

  return (
    <div className="flex flex-col h-full w-full bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden relative">
      {/* HEADER */}
      <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-sm z-30">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-all text-slate-500"
            aria-label="Ортага"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${isRecording ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-400"}`}>
              <Radio className={isRecording ? "animate-pulse" : ""} size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none mb-1">
                Жонли Сўрўқ
              </h2>
              <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                <span className="flex items-center gap-1">
                  <Brain size={10} /> Овоз юзиш ва AI таҳлил
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {audioBlob && !isRecording && (
            <button
              type="button"
              onClick={clearRecording}
              disabled={isProcessing}
              className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200"
            >
              Тозалаш
            </button>
          )}
          <button
            type="button"
            onClick={processAndGenerate}
            disabled={isProcessing || !audioBlob || isRecording}
            className="bg-uzblue hover:bg-blue-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20"
          >
            {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            {isProcessing ? processingStatus || "ТАҲЛИЛ..." : "БАЁННОМА ЯРАТИШ"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT: SETTINGS PANEL */}
        <div className="w-[380px] bg-white border-r border-slate-200 flex flex-col z-20 shadow-xl shadow-slate-200/50">
          <div className="p-5 flex-1 overflow-y-auto custom-scrollbar space-y-6">
            {/* Metadata fields */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <FileText size={12} /> Иш Тафсилотлари
              </h3>
              <select
                value={Object.prototype.hasOwnProperty.call(PROTOCOL_TEMPLATES, selectedTemplate) ? selectedTemplate : ProtocolType.GUVOH}
                onChange={(e) => setSelectedTemplate(e.target.value as ProtocolType)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] font-bold text-slate-700 outline-none"
              >
                {Object.entries(PROTOCOL_TEMPLATES).map(([k, v]) => (
                  <option key={k} value={k}>{v.title}</option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-slate-400 font-bold uppercase">Жиноят Иши №</label>
                  <input value={metadata.caseNumber} onChange={(e) => setMetadata({ ...metadata, caseNumber: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                </div>
                <div>
                  <label className="text-[9px] text-slate-400 font-bold uppercase">Хона №</label>
                  <input value={metadata.officeNumber} onChange={(e) => setMetadata({ ...metadata, officeNumber: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-uzblue">Терговчи</h3>
                <input value={metadata.investigatorName} onChange={(e) => setMetadata({ ...metadata, investigatorName: e.target.value })} placeholder="Ф.И.Ш" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold mb-2" />
                <input value={metadata.investigatorRank} onChange={(e) => setMetadata({ ...metadata, investigatorRank: e.target.value })} placeholder="Унвон" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-uzred">
                  {getTemplateEntry(selectedTemplate).role} (Анкета)
                </h3>
                <div className="space-y-2">
                  <input value={metadata.personName} onChange={(e) => setMetadata({ ...metadata, personName: e.target.value })} placeholder="1. Ф.И.Ш" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={metadata.birthDate} onChange={(e) => setMetadata({ ...metadata, birthDate: e.target.value })} placeholder="2. Туғилган сана" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                    <input value={metadata.birthPlace} onChange={(e) => setMetadata({ ...metadata, birthPlace: e.target.value })} placeholder="3. Туғилган жой" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  </div>
                  <input value={metadata.nationality} onChange={(e) => setMetadata({ ...metadata, nationality: e.target.value })} placeholder="4. Миллати" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  <input value={metadata.citizenship} onChange={(e) => setMetadata({ ...metadata, citizenship: e.target.value })} placeholder="5. Фуқаролиги" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  <input value={metadata.education} onChange={(e) => setMetadata({ ...metadata, education: e.target.value })} placeholder="6. Маълумоти" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  <input value={metadata.workPlace} onChange={(e) => setMetadata({ ...metadata, workPlace: e.target.value })} placeholder="7. Иш жойи" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  <input value={metadata.address} onChange={(e) => setMetadata({ ...metadata, address: e.target.value })} placeholder="8. Яшаш жойи" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  <input value={metadata.familyStatus} onChange={(e) => setMetadata({ ...metadata, familyStatus: e.target.value })} placeholder="9. Оилавий аҳволи" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  <input value={metadata.idDocument} onChange={(e) => setMetadata({ ...metadata, idDocument: e.target.value })} placeholder="10. Паспорти" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  <input value={metadata.conviction} onChange={(e) => setMetadata({ ...metadata, conviction: e.target.value })} placeholder="11. Судланганлиги" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  <input value={metadata.deputyStatus} onChange={(e) => setMetadata({ ...metadata, deputyStatus: e.target.value })} placeholder="12. Ҳарбий хизмат" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  <input value={metadata.relationVictim} onChange={(e) => setMetadata({ ...metadata, relationVictim: e.target.value })} placeholder="13. Жабрланувчига алоқаси" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  <input value={metadata.relationSuspect} onChange={(e) => setMetadata({ ...metadata, relationSuspect: e.target.value })} placeholder="14. Айбланувчига алоқаси" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                  <input value={metadata.phoneNumber} onChange={(e) => setMetadata({ ...metadata, phoneNumber: e.target.value })} placeholder="15. Телефони" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER: RECORDING AREA */}
        <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 relative">
          <div className="flex-1 flex flex-col items-center justify-center p-10">
            {savedAudio && !audioBlob && !isRecording && (
              <div className="w-full max-w-2xl mb-4 p-4 rounded-xl border border-blue-200 bg-blue-50/80 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-800">
                  Сақланган сўроқ овози мавжуд. Баённома яратишда хатолик бўлса, шу овоздан қайта урининг.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={loadSavedAudio} className="px-4 py-2 bg-uzblue text-white rounded-lg text-xs font-bold hover:bg-blue-600">
                    Ишлатиш
                  </button>
                  <button type="button" onClick={removeSavedAudio} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300">
                    Ўчириш
                  </button>
                </div>
              </div>
            )}
            {/* Real-time speech-to-text (display only; does not affect recording or bayonnoma) */}
            <div className="w-full max-w-2xl mb-6">
              <div className="rounded-2xl border border-slate-200 bg-white/95 shadow-lg shadow-slate-200/50 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Реал вақт транскрипцияси — фақат кўриниш учун
                  </span>
                </div>
                <div
                  className="min-h-[120px] max-h-[200px] overflow-y-auto p-4 text-base leading-relaxed font-medium text-slate-800 custom-scrollbar"
                  style={{ scrollBehavior: "smooth" }}
                >
                  {liveTranscript && <span>{liveTranscript}</span>}
                  {interimTranscript && (
                    <span className="text-slate-400 italic">{liveTranscript ? " " : ""}{interimTranscript}</span>
                  )}
                  {!liveTranscript && !interimTranscript && (
                    <span className="text-slate-400">
                      {isRecording ? "Гапиринг — матн шу ерда пайдо бўлади..." : "Гапиришни бошланг — суҳбат матни реал вақтда кўринади."}
                    </span>
                  )}
                  <div ref={liveTranscriptEndRef} />
                </div>
              </div>
            </div>

            {/* Recording visualization */}
            <div className="relative mb-8">
              {/* Outer rings animation */}
              <div
                className={`absolute inset-0 rounded-full transition-all duration-150 ${isRecording ? "animate-ping" : ""}`}
                style={{
                  width: 200 + audioLevel * 1.5,
                  height: 200 + audioLevel * 1.5,
                  left: -(audioLevel * 0.75),
                  top: -(audioLevel * 0.75),
                  background: isRecording
                    ? `radial-gradient(circle, rgba(239,68,68,${0.1 + audioLevel / 500}) 0%, transparent 70%)`
                    : "transparent",
                }}
              />
              <div
                className={`absolute rounded-full border-4 transition-all duration-75 ${isRecording ? "border-red-300" : "border-slate-200"}`}
                style={{
                  width: 180 + audioLevel,
                  height: 180 + audioLevel,
                  left: 10 - audioLevel / 2,
                  top: 10 - audioLevel / 2,
                  opacity: isRecording ? 0.6 : 0.3,
                }}
              />
              <div
                className={`absolute rounded-full border-2 transition-all duration-75 ${isRecording ? "border-red-200" : "border-slate-200"}`}
                style={{
                  width: 220 + audioLevel * 1.2,
                  height: 220 + audioLevel * 1.2,
                  left: -10 - audioLevel * 0.6,
                  top: -10 - audioLevel * 0.6,
                  opacity: isRecording ? 0.4 : 0.2,
                }}
              />

              {/* Main button */}
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={`relative w-[200px] h-[200px] rounded-full flex flex-col items-center justify-center shadow-2xl transition-all hover:scale-105 active:scale-95 ${
                  isRecording
                    ? "bg-gradient-to-br from-red-500 to-red-600 shadow-red-300/50"
                    : "bg-gradient-to-br from-slate-800 to-slate-900 shadow-slate-400/30"
                } disabled:opacity-50`}
              >
                {isRecording ? (
                  <>
                    <StopCircle size={64} className="text-white mb-2" />
                    <span className="text-white font-black text-lg">ТўХТАТИШ</span>
                  </>
                ) : (
                  <>
                    <Mic size={64} className="text-white mb-2" />
                    <span className="text-white font-black text-lg">БОШЛАШ</span>
                  </>
                )}
              </button>
            </div>

            {/* Timer */}
            <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl ${isRecording ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-600"}`}>
              <Clock size={20} />
              <span className="font-mono font-black text-2xl">{formatTime(recordingTime)}</span>
              {isRecording && <span className="animate-pulse text-red-500">●</span>}
            </div>

            {/* Status text */}
            <p className="mt-6 text-sm text-slate-500 text-center max-w-md">
              {isRecording ? (
                <span className="text-red-600 font-bold">Овоз ёзилмоқда... Гапиринг!</span>
              ) : audioBlob ? (
                <span className="text-green-600 font-bold">
                  Ёзув тайёр ({formatTime(recordingTime)}). "Баённома Яратиш" босинг.
                </span>
              ) : (
                "Микрофон тугмасини босиб, сўроқни бошланг. Ёзув тугагач, AI таҳлил қилиб баённома тайёрлайди."
              )}
            </p>

            {/* Transcript preview (if available) */}
            {transcriptText && (
              <div className="mt-6 w-full max-w-2xl bg-white rounded-xl border border-slate-200 p-4 max-h-48 overflow-y-auto">
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Транскрипция:</h4>
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{transcriptText}</pre>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: TIPS & LEGAL INFO */}
        <div className="w-[300px] bg-white border-l border-slate-200 flex flex-col z-20">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
              <Lightbulb size={14} /> Йўриқнома
            </h3>
            <div className="space-y-3 text-[11px] text-slate-600">
              <p className="flex items-start gap-2">
                <span className="text-uzblue font-bold">1.</span>
                Чап панелда шахс маълумотларини тўлдиринг
              </p>
              <p className="flex items-start gap-2">
                <span className="text-uzblue font-bold">2.</span>
                Катта микрофон тугмасини босиб ёзишни бошланг
              </p>
              <p className="flex items-start gap-2">
                <span className="text-uzblue font-bold">3.</span>
                Сўроқ давомида эркин гапиринг
              </p>
              <p className="flex items-start gap-2">
                <span className="text-uzblue font-bold">4.</span>
                Тўхтатиб, "Баённома Яратиш" босинг
              </p>
              <p className="flex items-start gap-2">
                <span className="text-uzblue font-bold">5.</span>
                AI овозни таҳлил қилиб, тўлиқ ҳужжат тайёрлайди
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Gavel size={14} className="text-amber-500" />
                <span className="text-[10px] font-black uppercase text-slate-400">Юридик Маълумотнома</span>
              </div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Иш тури бўйича</p>
              <p className="text-[10px] font-black text-uzblue uppercase tracking-wide mb-2 border-b border-slate-100 pb-2">
                {getTemplateEntry(selectedTemplate).title}
              </p>
              <p className="text-[10px] font-bold text-slate-600 leading-relaxed mb-1">
                {getTemplateEntry(selectedTemplate).code}:
              </p>
              <p className="text-[9px] text-slate-500 leading-relaxed text-justify">
                {getTemplateEntry(selectedTemplate).legalInfo}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartProtocol;
