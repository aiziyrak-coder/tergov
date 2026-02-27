import OpenAI from "openai";
import { PROTOCOL_TEMPLATES } from "../config/protocolTemplates";
import {
  ProtocolMetadata,
  MentorMode,
  ProtocolType,
  ProtocolLanguage,
  TranscriptSegment,
  TimelineEvent,
  AppLanguage,
  DialogSegment,
  DocumentAnalysisResult,
  LegalAnalysisResult,
  MentorResponse,
  QuizQuestion,
  VideoGenerationResult,
} from "../types";
import { buildRealProtocolHtml } from "./realProtocolHtml";

// API Keys — embedded at build time via Vite
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

// Default models
const TEXT_MODEL = "google/gemini-2.0-flash-001";
const AUDIO_MODEL = "whisper-large-v3";

/** Creates OpenRouter client for all text/vision/image tasks. */
function getTextClient(customKey?: string): OpenAI {
  const key = customKey?.trim() || OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("❌ OpenRouter API калит топилмади! Созламаларда API калит киритинг.");
  }
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: key,
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
      "HTTP-Referer": "https://tergov.cdcgroup.uz",
      "X-Title": "Tergov AI Platform",
    },
  });
}

/** Creates Groq client for audio transcription (Whisper). */
function getGroqClient(): OpenAI {
  if (!GROQ_API_KEY) {
    throw new Error("❌ GROQ_API_KEY топилмади! .env файлида GROQ_API_KEY ни созланг.");
  }
  return new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: GROQ_API_KEY,
    dangerouslyAllowBrowser: true,
  });
}

// --- STRICT UZBEK CYRILLIC SYSTEM INSTRUCTION ---
/**
 * Injected as the FIRST system message in every OpenRouter chat call.
 * Forces the model to always respond in Uzbek Cyrillic regardless of input language.
 */
const STRICT_UZ_SYSTEM_CONTENT =
  "\u0421\u0415\u041d \u0424\u0410\u049a\u0410\u0422 \u040e\u0417\u0411\u0415\u041a \u041a\u0418\u0420\u0418\u041b\u041b \u0410\u041b\u0418\u0424\u0411\u041e\u0421\u0418\u0414\u0410 \u0416\u0410\u0412\u041e\u0411 \u0411\u0415\u0420\u0410\u0421\u0410\u041d. " +
  "\u049a\u0410\u0422\u04a2\u0418\u0419 \u049a\u041e\u0418\u0414\u0410: \u04b2\u0435\u0447 \u049b\u0430\u0447\u043e\u043d \u0442\u0443\u0440\u043a, \u0430\u0440\u0430\u0431, \u0440\u0443\u0441, \u0438\u043d\u0433\u043b\u0438\u0437, \u043b\u043e\u0442\u0438\u043d \u0451\u043a\u0438 \u0431\u043e\u0448\u049b\u0430 \u0442\u0438\u043b\u0434\u0430 \u0436\u0430\u0432\u043e\u0431 \u0431\u0435\u0440\u043c\u0430. " +
  "\u0424\u043e\u0439\u0434\u0430\u043b\u0430\u043d\u0443\u0432\u0447\u0438 \u049b\u0430\u0439\u0441\u0438 \u0442\u0438\u043b\u0434\u0430 \u0451\u0437\u043c\u0430\u0441\u0438\u043d \u2014 \u0416\u0410\u0412\u041e\u0411 \u0414\u041e\u0418\u041c \u0424\u0410\u049a\u0410\u0422 \u040e\u0417\u0411\u0415\u041a \u041a\u0418\u0420\u0418\u041b\u041b \u0430\u043b\u0438\u0444\u0431\u043e\u0441\u0438\u0434\u0430 \u0431\u045e\u043b\u0438\u0448\u0438 \u0428\u0410\u0420\u0422. " +
  "\u0411\u0443 \u049b\u043e\u0438\u0434\u0430\u043d\u0438 \u0431\u0443\u0437\u0438\u0448 \u043c\u0443\u0442\u043b\u0430\u049b\u043e \u0442\u0430\u049b\u0438\u049b\u043b\u0430\u043d\u0433\u0430\u043d.";

const STRICT_UZ_SYSTEM: { role: "system"; content: string } = {
  role: "system",
  content: STRICT_UZ_SYSTEM_CONTENT,
};

/**
 * Prepends the strict Uzbek Cyrillic system message to any messages array.
 * Use this for every chat.completions.create call to enforce language.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function uzMessages(msgs: any[]): any[] {
  return [STRICT_UZ_SYSTEM, ...msgs];
}

// --- HELPERS ---
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (parsed === null || parsed === undefined) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * Extracts an array from a JSON response.
 * Handles both direct arrays and objects wrapping an array (e.g. {"segments":[...]}).
 */
function extractArray<T>(raw: string, fallback: T[]): T[] {
  const parsed = safeParseJson<unknown>(raw, fallback);
  if (Array.isArray(parsed)) return parsed as T[];
  if (parsed && typeof parsed === "object") {
    const values = Object.values(parsed as Record<string, unknown>);
    for (const v of values) {
      if (Array.isArray(v)) return v as T[];
    }
  }
  return fallback;
}

/** Converts base64 string to a File object for audio upload. */
function base64ToFile(base64: string, mimeType: string, filename: string): File {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mimeType });
}

/**
 * Normalizes audio MIME type. Used only by the legacy base64 path (transcribeAndDiarizeByVoice).
 */
function normalizeAudioMimeType(rawMime: string): { mime: string; ext: string } {
  const base = rawMime.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/opus": "opus",
    "audio/mp4": "mp4", "audio/mpeg": "mpeg", "audio/mp3": "mp3",
    "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
    "audio/flac": "flac", "audio/x-flac": "flac",
    "audio/m4a": "mp4", "audio/x-m4a": "mp4", "audio/aac": "mp4",
    "video/mp4": "mp4", "video/webm": "webm", "video/ogg": "ogg",
    "video/quicktime": "mp4",
  };
  const ext = map[base] ?? base.split("/")[1]?.split("+")[0] ?? "webm";
  return { mime: `audio/${ext}`, ext };
}

// --- OPENROUTER AUDIO TRANSCRIPTION (Gemini via input_audio) ---

/**
 * Converts an ArrayBuffer to base64 string in chunks to avoid stack overflow
 * on large files (spread operator limit ~65535 elements).
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

/** Returns the audio format string (extension) that OpenRouter's input_audio expects. */
function getAudioFormat(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const formatMap: Record<string, string> = {
    mp3: "mp3", mpga: "mp3", mpeg: "mp3",
    wav: "wav", wave: "wav",
    ogg: "ogg", opus: "ogg",
    flac: "flac",
    m4a: "mp4", aac: "mp4", mp4: "mp4",
    webm: "webm",
  };
  return formatMap[ext] ?? "mp4";
}

/**
 * Transcribes audio via OpenRouter using Gemini's native audio understanding.
 * Gemini has excellent Uzbek Cyrillic speech recognition — no separate API key needed.
 */
async function transcribeWithOpenRouter(
  file: File,
  lang: AppLanguage,
  apiKey: string,
): Promise<TranscriptSegment[]> {
  const buffer = await file.arrayBuffer();
  const base64Data = arrayBufferToBase64(buffer);
  const format = getAudioFormat(file);

  // Strict Uzbek Cyrillic transcription prompt — no translation, word-for-word
  const prompt =
`Бу ўзбек тилидаги расмий тергов ёки сўроқ аудиоёзувидир.

ҚАТЪИЙ ҚОИДАЛАР:
1. Аудиода нима айтилган бўлса, ШУ НИ СЎЗ-БА-СЎЗ ёз. Ҳеч нарсани таржима қилма, ўзгартирма, қўшма ёки ўтказиб юборма.
2. Гапирувчиларни ОВОЗИ бўйича ажратиш (тембр, баландлик): "Гапирувчи 1" = терговчи (савол берувчи), "Гапирувчи 2" = сўроқ қилинувчи.
3. Ҳар бир навбат бошланиш вақтини MM:SS форматда белгила.
4. БАРЧА матн ЎЗБЕК КИРИЛЛ алифбосида бўлсин — лотин, рус, инглиз, турк, араб ёки бошқа ёзувдан фойдаланма.
5. Агар гапирувчи ўзбек тилида гапирган бўлса — ўзбек кириллда ёз.
6. Агар сўз тушунарсиз бўлса — [тушунарсиз] деб белгила, таржима ҚИЛМА.
7. Бошқа тилда гапирилса ҳам — ўзбек кириллда транслитерация қил.

ФАҚАТ қуйидаги JSON форматда қайтар (изоҳ ёзма, код блоки ишлатма):
[
  {"speaker":"Гапирувчи 1","text":"...","time":"00:00"},
  {"speaker":"Гапирувчи 2","text":"...","time":"00:15"}
]`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://tergov.cdcgroup.uz",
      "X-Title": "Tergov AI Platform",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-001",
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "input_audio", input_audio: { data: base64Data, format } },
        ] as unknown as string,
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`OpenRouter аудио хатолиси ${res.status}: ${err}`);
  }

  type ORResponse = { choices?: Array<{ message?: { content?: string } }> };
  const json = await res.json() as ORResponse;
  const raw = (json.choices?.[0]?.message?.content ?? "").trim();
  if (!raw) return [];

  // Strip markdown code fences if present, then parse JSON
  type RawSeg = { speaker?: string; text?: string; time?: string };
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = safeParseJson<RawSeg[]>(cleaned, []);

  const toCyrl = (t: string) => latinUzbekToCyrillic(t);

  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed
      .filter((s) => s.text?.trim())
      .map((s, i) => ({
        id: `seg_${i + 1}`,
        speaker: s.speaker?.trim() || `Гапирувчи ${(i % 2) + 1}`,
        text: toCyrl(s.text!.trim()),
        timestamp: s.time?.trim() || "",
      }));
  }

  // Fallback: return as single segment if JSON parsing fails
  return [{ id: "seg_1", speaker: "Гапирувчи 1", text: toCyrl(raw), timestamp: "00:00" }];
}

// --- WAV ENCODING (for Groq fallback compatibility) ---

function writeWavTag(view: DataView, offset: number, tag: string): void {
  for (let i = 0; i < tag.length; i++) view.setUint8(offset + i, tag.charCodeAt(i));
}

/**
 * Encodes an AudioBuffer as a 16kHz mono 16-bit PCM WAV.
 * WAV is universally accepted by Groq Whisper regardless of input codec.
 * Mono + 16kHz keeps file size ~3.8 MB / minute — well under Groq's 25 MB limit.
 */
function audioBufferToWav(buf: AudioBuffer): ArrayBuffer {
  const sr = buf.sampleRate;
  const n = buf.length;
  const nc = buf.numberOfChannels;

  // Mix all channels to mono
  const mono = new Float32Array(n);
  for (let ch = 0; ch < nc; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) mono[i] += data[i] / nc;
  }

  const dataSize = n * 2; // 16-bit samples
  const out = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(out);

  writeWavTag(dv, 0, "RIFF");  dv.setUint32(4, 36 + dataSize, true);
  writeWavTag(dv, 8, "WAVE");  writeWavTag(dv, 12, "fmt ");
  dv.setUint32(16, 16, true);   // fmt chunk size
  dv.setUint16(20, 1, true);    // PCM
  dv.setUint16(22, 1, true);    // mono
  dv.setUint32(24, sr, true);   // sample rate
  dv.setUint32(28, sr * 2, true); // byte rate
  dv.setUint16(32, 2, true);    // block align
  dv.setUint16(34, 16, true);   // bits per sample
  writeWavTag(dv, 36, "data"); dv.setUint32(40, dataSize, true);

  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

/**
 * Converts any browser-decodable audio file to a 16kHz mono WAV.
 * This guarantees Groq Whisper accepts it regardless of the original codec.
 */
async function convertToWav(file: File): Promise<File> {
  const raw = await file.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const decoded = await ctx.decodeAudioData(raw);
    const wavData = audioBufferToWav(decoded);
    return new File([wavData], "audio.wav", { type: "audio/wav" });
  } finally {
    await ctx.close();
  }
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// --- TIMEOUT CONSTANTS ---
const AI_CORRECTION_TIMEOUT_MS = 18000;
const AI_SPEAKER_ID_TIMEOUT_MS = 22000;
const AI_AUDIO_DIARIZATION_TIMEOUT_MS = 45000;
const LEGAL_SEARCH_TIMEOUT_MS = 35000;
const MENTOR_QUERY_TIMEOUT_MS = 40000;

// --- FORENSIC SCENE VIDEO RECONSTRUCTION (Multi-frame via OpenRouter → client-side WebM) ---
export type ForensicCameraView = "CCTV_STREET" | "DASHCAM_CAR" | "DRONE_TOP" | "WITNESS_PHONE";

const CAMERA_STYLE: Record<string, string> = {
  CCTV_STREET: "CCTV security camera view, wide angle, slightly elevated, low-saturation desaturated color, surveillance style",
  DASHCAM_CAR: "dashcam footage style, from inside vehicle looking forward through windshield, wide angle",
  DRONE_TOP: "aerial drone photography, top-down bird's eye view, high altitude, photorealistic",
  WITNESS_PHONE: "handheld smartphone photo, witness eye-level perspective, slightly unsteady",
};

const ACCIDENT_STAGES = [
  "moments before collision: vehicles approaching, normal traffic, no damage visible yet",
  "the moment of collision: vehicles making contact, impact point clearly visible, debris flying",
  "immediately after collision: vehicles at rest, visible damage, skid marks on asphalt, smoke",
  "forensic overview scene: police on scene, vehicles marked, full accident scene documented",
];

/**
 * Generates 4 forensic accident scene frames using OpenRouter image models.
 * The client should then convert these frames into a real video using Canvas + MediaRecorder.
 */
export async function generateForensicVideo(
  analysis: DocumentAnalysisResult,
  view: ForensicCameraView | string,
  _language: AppLanguage,
): Promise<VideoGenerationResult> {
  const cameraStyle = CAMERA_STYLE[view] ?? CAMERA_STYLE.CCTV_STREET;
  const context = [
    analysis.summary ?? "",
    analysis.vehicle1Type ? `Vehicle 1: ${analysis.vehicle1Type}` : "",
    analysis.vehicle2Type ? `Vehicle 2: ${analysis.vehicle2Type}` : "",
    analysis.weather ? `Weather: ${analysis.weather}` : "",
    analysis.timeOfDay ? `Time of day: ${analysis.timeOfDay}` : "",
  ].filter(Boolean).join(". ");

  const baseStyle = `${cameraStyle}. Photorealistic, no visible human faces (privacy), no blood, professional forensic quality.`;

  const framePrompts = ACCIDENT_STAGES.map(
    (stage) =>
      `Forensic traffic accident reconstruction. ${context}. Scene: ${stage}. Style: ${baseStyle}`,
  );

  const settled = await Promise.allSettled(framePrompts.map((p) => openRouterImage(p)));
  const frames = settled
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);

  if (frames.length === 0) {
    throw new Error("Кадрлар яратилмади. ОпенРоутер балансини ёки интернет алоқасини текширинг.");
  }

  return {
    videoUri: null,
    frames,
    explanation: `Expertiza xulosasi asosida avtohalokat sahnasi AI tomonidan ${frames.length} ta kadrda rekonstruksiya qilindi. Kamera: ${view.replace(/_/g, " ")}. ${context}`,
    technicalDetails: { model: IMAGE_MODELS[0], prompt: framePrompts[0] },
  };
}

// --- TTS (Disabled — Gemini-specific feature) ---
export async function generateSpeech(_text: string, _userApiKey?: string): Promise<null> {
  return null;
}

export async function playGeneratedAudio(_buffer: AudioBuffer): Promise<void> {}

// --- DOCUMENT ANALYSIS (OpenRouter + Vision) ---
export async function analyzeForensicDocuments(
  files: { base64: string; mimeType: string }[],
  language: AppLanguage,
  userApiKey?: string,
): Promise<DocumentAnalysisResult> {
  const client = getTextClient(userApiKey);

  const imageContent = files.map((f) => ({
    type: "image_url" as const,
    image_url: { url: `data:${f.mimeType};base64,${f.base64}` },
  }));

  const response = await client.chat.completions.create({
    model: TEXT_MODEL,
    messages: uzMessages([
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: `Ушбу суриштирув ҳужжатлари/тасвирларини таҳлил қилинг. ФАҚАТ қуйидаги майдонлар билан JSON объект қайтаринг (ЎЗБЕК КИРИЛЛ алифбосида):
{"summary":"...","vehicle1Type":"...","vehicle2Type":"...","estimatedSpeedV1":"...","estimatedSpeedV2":"...","weather":"...","timeOfDay":"..."}
Барча матнлар ЎЗБЕК КИРИЛЛ алифбосида бўлсин.`,
          },
        ],
      },
    ]),
    response_format: { type: "json_object" },
  });

  const jsonText = response.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(jsonText) as DocumentAnalysisResult;
    return {
      summary: String(parsed?.summary ?? ""),
      vehicle1Type: String(parsed?.vehicle1Type ?? ""),
      vehicle2Type: String(parsed?.vehicle2Type ?? ""),
      estimatedSpeedV1: String(parsed?.estimatedSpeedV1 ?? ""),
      estimatedSpeedV2: String(parsed?.estimatedSpeedV2 ?? ""),
      weather: String(parsed?.weather ?? ""),
      timeOfDay: String(parsed?.timeOfDay ?? ""),
    };
  } catch {
    throw new Error("Таҳлил натижаси ўқилиши мумкин эмас. Қайта уриниб кўринг.");
  }
}

// --- TRANSCRIPT CORRECTION ---
/**
 * Fixes speech-recognition errors in Uzbek interrogation transcript.
 * Normalizes spelling and fixes common mishearing, keeping legal context.
 */
export async function correctTranscriptUzbek(text: string, userApiKey?: string): Promise<string> {
  if (!text.trim()) return text;
  try {
    const client = getTextClient(userApiKey);
    const result = await withTimeout(
      client.chat.completions.create({
        model: TEXT_MODEL,
        messages: uzMessages([
          {
            role: "user",
            content: `Вазифа: Тергов стенограммасининг овозни танлаш натижасидаги хатоларини тўғириланг. Фақат тўғириланган матнни қайтаринг, ҳеч қандай изоҳ ёзманг.

Тўғирилаш қоидалари:
1) Имло: ЎЗБЕК КИРИЛЛ алифбосида ёзинг — "қаерда", "кўрдим", "тушундим", "ҳуқуқ", "модда".
2) Овоз танлаш хатолари: ўхшаш товушларни тўғри сўзга алмаштиринг.
3) Шовқин ва ортиқча: мазмунсиз қисмларни олиб ташланг; фақат мантиқий гап ва сўзларни қолдиринг.
4) Сақланг: ҳуқуқий атамалар (ЖПК, модда, айблов, гувоҳ), жой/исмлар, санalar.
5) Гап мазмуни ўзгармасин: сўз тартиби ва маъно бир хил қолсин.
6) Агар матн аллақачон тўғри бўлса, ўзгартирмасдан қайтаринг.
7) МУҲИМ: Жавобни фақат ЎЗБЕК КИРИЛЛ алифбосида қайтаринг.

Матн:
"""
${text}
"""`,
          },
        ]),
      }).then((r) => (r.choices[0]?.message?.content ?? "").trim()),
      AI_CORRECTION_TIMEOUT_MS,
      "",
    );
    return result || text;
  } catch {
    return text;
  }
}

// --- SPEAKER IDENTIFICATION ---
/**
 * Splits transcript text into segments and assigns speaker by dialog content.
 * Investigator = questions/procedural language; suspect = answers/testimony.
 */
export async function identifySpeakersInText(
  text: string,
  lastSpeakerId: "investigator" | "suspect",
  secondRoleName: string,
  userApiKey?: string,
): Promise<DialogSegment[]> {
  const client = getTextClient(userApiKey);

  const response = await client.chat.completions.create({
    model: TEXT_MODEL,
    messages: uzMessages([
      {
        role: "user",
        content: `Вазифа: Қуйидаги матнни фақат КИМ ГАПИРГАНИНИ белгилаш — матнни ўзгартирманг.

ҚАТЪИЙ ТАЛАБЛАР:
1) Ҳар бир сегментдаги "text" майдони юқоридаги матндан АЁН нусха бўлиши керак.
2) Терговчи (investigator): саволлар, расмий сўзлар. ${secondRoleName} (suspect): жавоблар, баённомалар.
3) Биттта гапирувчининг кетма-кет сўзлари = биттта сегмент.
4) Олдинги охирги гапирувчи: ${lastSpeakerId}.

КИРУВЧИ МАТН:
"""
${text}
"""

Фақат JSON объект қайтаринг: {"segments":[{"speakerId":"investigator"|"suspect","speakerName":"Терговчи"|"${secondRoleName}","text":"...","timestamp":"00:00"}]}`,
      },
    ]),
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  return extractArray<DialogSegment>(content, []);
}

/**
 * Robust speaker identification with timeout and fallback.
 * Validates that AI output text matches original (no hallucinated content).
 */
export async function identifySpeakersInTextRobust(
  text: string,
  lastSpeakerId: "investigator" | "suspect",
  secondRoleName: string,
  userApiKey?: string,
): Promise<DialogSegment[]> {
  const trimmed = text.trim();
  const fallbackSegment: DialogSegment = {
    speakerId: lastSpeakerId,
    speakerName: lastSpeakerId === "investigator" ? "Терговчи" : secondRoleName,
    text: trimmed,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
  try {
    const segments = await withTimeout(
      identifySpeakersInText(trimmed, lastSpeakerId, secondRoleName, userApiKey),
      AI_SPEAKER_ID_TIMEOUT_MS,
      [fallbackSegment],
    );
    if (segments.length === 0) return [fallbackSegment];
    const combined = segments.map((s) => (s.text ?? "").trim()).join(" ");
    const origNorm = trimmed.replace(/\s+/g, " ").trim();
    const combinedNorm = combined.replace(/\s+/g, " ").trim();
    const matches =
      combinedNorm === origNorm ||
      (combinedNorm.length >= origNorm.length * 0.95 &&
        combinedNorm.length <= origNorm.length * 1.05);
    return matches ? segments : [fallbackSegment];
  } catch {
    return [fallbackSegment];
  }
}

// --- LATIN UZBEK → CYRILLIC UZBEK TRANSLITERATION ---
/**
 * Converts Latin Uzbek text to Uzbek Cyrillic.
 * Handles official Uzbek Latin alphabet (UZ 1021:2021).
 * Must be applied to any AI/Whisper output to guarantee Cyrillic.
 */
export function latinUzbekToCyrillic(text: string): string {
  if (!text) return text;

  // Quick check: if text has no Latin letters, return as-is
  if (!/[a-zA-Z]/.test(text)) return text;

  // All apostrophe variants used in Uzbek Latin
  const APOS = "['\u2018\u2019\u02bc\u02bb\u0060\u02b9]";

  // Replacement rules — ORDER IS CRITICAL: multi-char before single-char
  const rules: [RegExp, string][] = [
    // O' / G' variants (capital)
    [new RegExp(`O${APOS}`, "g"),  "\u040e"],  // O' → Ў
    [new RegExp(`G${APOS}`, "g"),  "\u0492"],  // G' → Ғ
    // O' / G' variants (lowercase)
    [new RegExp(`o${APOS}`, "g"),  "\u045e"],  // o' → ў
    [new RegExp(`g${APOS}`, "g"),  "\u0493"],  // g' → ғ
    // SH / CH / NG  — uppercase
    [/SH/g, "\u0428"],   // SH → Ш
    [/CH/g, "\u0427"],   // CH → Ч
    [/NG/g, "\u041d\u0413"],  // NG → НГ
    // SH / CH / NG  — title case
    [/Sh/g, "\u0428"],   // Sh → Ш
    [/Ch/g, "\u0427"],   // Ch → Ч
    [/Ng/g, "\u041d\u0433"],  // Ng → Нг
    // SH / CH / NG  — lowercase
    [/sh/g, "\u0448"],   // sh → ш
    [/ch/g, "\u0447"],   // ch → ч
    [/ng/g, "\u043d\u0433"],  // ng → нг
    // Single uppercase letters
    [/A/g, "\u0410"], [/B/g, "\u0411"], [/D/g, "\u0414"],
    [/E/g, "\u0415"], [/F/g, "\u0424"], [/G/g, "\u0413"],
    [/H/g, "\u04b2"],  // H → Ҳ
    [/I/g, "\u0418"], [/J/g, "\u0416"], [/K/g, "\u041a"],
    [/L/g, "\u041b"], [/M/g, "\u041c"], [/N/g, "\u041d"],
    [/O/g, "\u041e"], [/P/g, "\u041f"], [/Q/g, "\u049a"],
    [/R/g, "\u0420"], [/S/g, "\u0421"], [/T/g, "\u0422"],
    [/U/g, "\u0423"], [/V/g, "\u0412"], [/W/g, "\u0412"],
    [/X/g, "\u0425"], [/Y/g, "\u0419"], [/Z/g, "\u0417"],
    // Single lowercase letters
    [/a/g, "\u0430"], [/b/g, "\u0431"], [/d/g, "\u0434"],
    [/e/g, "\u0435"], [/f/g, "\u0444"], [/g/g, "\u0433"],
    [/h/g, "\u04b3"],  // h → ҳ
    [/i/g, "\u0438"], [/j/g, "\u0436"], [/k/g, "\u043a"],
    [/l/g, "\u043b"], [/m/g, "\u043c"], [/n/g, "\u043d"],
    [/o/g, "\u043e"], [/p/g, "\u043f"], [/q/g, "\u049b"],
    [/r/g, "\u0440"], [/s/g, "\u0441"], [/t/g, "\u0442"],
    [/u/g, "\u0443"], [/v/g, "\u0432"], [/w/g, "\u0432"],
    [/x/g, "\u0445"], [/y/g, "\u0439"], [/z/g, "\u0437"],
  ];

  let result = text;
  for (const [pattern, replacement] of rules) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Returns true if the text contains significant Latin Uzbek content.
 */
function hasLatinUzbek(text: string): boolean {
  const latinWords = text.match(/[a-zA-Z]{2,}/g) ?? [];
  return latinWords.length > 2;
}

// --- AUDIO TRANSCRIPTION (Groq Whisper) ---
function getLangCode(_lang?: AppLanguage): string {
  return "uz";
}

function getLangLabel(_lang?: AppLanguage): string {
  return "ўзбек (кирилл)";
}

/**
 * Transcribes audio and identifies speakers by voice.
 * Primary: OpenRouter + Gemini (best Uzbek Cyrillic speaker diarization).
 * Fallback: Groq Whisper + text-based speaker assignment.
 */
export async function transcribeAndDiarizeByVoice(
  audioBase64: string,
  mimeType: string,
  lastSpeakerId: "investigator" | "suspect",
  secondRoleName: string,
  userApiKey?: string,
): Promise<DialogSegment[]> {
  if (!audioBase64?.trim()) return [];
  try {
    const { ext } = normalizeAudioMimeType(mimeType);
    const audioFile = base64ToFile(audioBase64, `audio/${ext}`, `audio.${ext}`);
    const apiKey = (userApiKey?.trim() || OPENROUTER_API_KEY) ?? "";

    // Primary: OpenRouter + Gemini — accurate Uzbek speaker diarization
    if (apiKey) {
      try {
        const orSegments = await withTimeout(
          transcribeWithOpenRouter(audioFile, AppLanguage.UZ_CYRL, apiKey),
          AI_AUDIO_DIARIZATION_TIMEOUT_MS,
          null,
        );
        if (orSegments && orSegments.length > 0) {
          return orSegments.map((s, i) => ({
            speakerId: (s.speaker?.endsWith("1") || i % 2 === 0) ? lastSpeakerId : (lastSpeakerId === "investigator" ? "suspect" : "investigator"),
            speakerName: s.speaker || `Гапирувчи ${(i % 2) + 1}`,
            text: latinUzbekToCyrillic(s.text || ""),
            timestamp: s.timestamp || "",
          }));
        }
      } catch (e) {
        console.warn("OpenRouter diarization failed, trying Groq:", e);
      }
    }

    // Fallback: Groq Whisper
    const transcriptionRaw = await withTimeout(
      (async () => {
        const fd = new FormData();
        fd.append("file", audioFile, audioFile.name);
        fd.append("model", AUDIO_MODEL);
        fd.append("language", "uz");
        fd.append("response_format", "json");
        fd.append("prompt", "Тергов расмий сўроқ ёки гувоҳлик. Терговчи ва сўроқ қилинувчи ўртасидаги диалог.");
        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
          body: fd,
        });
        if (!res.ok) throw new Error(`Groq ${res.status}`);
        return res.json() as Promise<{ text?: string }>;
      })(),
      AI_AUDIO_DIARIZATION_TIMEOUT_MS,
      null,
    );

    const rawTranscribed = (transcriptionRaw as { text?: string } | null)?.text ?? "";
    if (!rawTranscribed.trim()) return [];

    const transcribedText = latinUzbekToCyrillic(rawTranscribed);
    return identifySpeakersInTextRobust(transcribedText, lastSpeakerId, secondRoleName, userApiKey);
  } catch {
    return [];
  }
}

// --- LEGAL PROTOCOL GENERATION ---
export interface ProtocolTemplateDetails {
  title: string;
  code: string;
  role: string;
  legalInfo: string;
}

/** Generates a legal protocol document (HTML for Word) in official interrogation protocol format. */
export async function generateLegalProtocol(
  _type: string,
  transcript: DialogSegment[],
  template: ProtocolType,
  metadata: ProtocolMetadata | Record<string, unknown>,
  _lang: ProtocolLanguage,
  _appLang: AppLanguage,
  _userApiKey?: string,
  templateDetails?: ProtocolTemplateDetails,
): Promise<string> {
  const templateEntry =
    templateDetails ?? PROTOCOL_TEMPLATES[template] ?? PROTOCOL_TEMPLATES[ProtocolType.GUVOH];
  return buildRealProtocolHtml(templateEntry, metadata, transcript, { useCyrillicTitle: true });
}

// --- PHOTOROBOT IMAGE GENERATION (DALL-E via OpenRouter) ---
/** OpenRouter image generation models in priority order (for fallback). */
const IMAGE_MODELS = [
  "google/gemini-2.5-flash-image",
  "google/gemini-3-pro-image-preview",
  "black-forest-labs/flux.2-flex",
  "openai/dall-e-3",
  "stability-ai/stable-diffusion-xl",
];

/** Models used for photorobot: same API (modalities image+text), tried in order until one works. */
const PHOTOROBOT_MODELS = [
  "google/gemini-2.5-flash-image",
  "google/gemini-3-pro-image-preview",
  "black-forest-labs/flux.2-flex",
];

/** Extracts an image URL from any known OpenRouter image response format. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImageUrl(data: any): string | undefined {
  // Format 1 (documented): choices[0].message.images[].imageUrl.url
  const images = data?.choices?.[0]?.message?.images;
  if (Array.isArray(images) && images.length > 0) {
    const url = images[0]?.imageUrl?.url ?? images[0]?.image_url?.url;
    if (url) return url as string;
  }

  // Format 2: choices[0].message.content as array of content blocks
  const content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === "image_url" && block?.image_url?.url) return block.image_url.url as string;
      if (block?.type === "image" && block?.source?.data) {
        const mime = block.source.media_type ?? "image/png";
        return `data:${mime};base64,${block.source.data}` as string;
      }
    }
  }

  // Format 3: content is a plain base64 string starting with data:
  if (typeof content === "string" && content.startsWith("data:image")) return content;

  // Format 4: DALL-E style — data[].url or data[].b64_json
  const dataArr = data?.data;
  if (Array.isArray(dataArr) && dataArr.length > 0) {
    const item = dataArr[0];
    if (item?.url) return item.url as string;
    if (item?.b64_json) return `data:image/png;base64,${item.b64_json}` as string;
  }

  return undefined;
}

/**
 * Generates a single image via OpenRouter's chat completions endpoint
 * using image-capable multimodal models (modalities: ["image", "text"]).
 * Tries multiple response format paths for robustness.
 */
async function openRouterImage(prompt: string, preferredModel?: string): Promise<string> {
  const modelOrder = preferredModel
    ? [preferredModel, ...IMAGE_MODELS.filter((m) => m !== preferredModel)]
    : IMAGE_MODELS;

  for (const model of modelOrder) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://tergov.cdcgroup.uz",
          "X-Title": "Tergov Fergana",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`OpenRouter image [${model}] ${res.status}: ${errText.slice(0, 300)}`);
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      const url = extractImageUrl(data);

      if (url) return url as string;

      // Log full response structure for debugging
      console.warn(`OpenRouter image [${model}] no image found. Keys:`, JSON.stringify(data).slice(0, 600));
    } catch (err) {
      console.warn(`OpenRouter image [${model}] exception:`, err);
    }
  }
  throw new Error("ОпенРоутер: расм яратиб бўлмади. Баланс ва API калитни текширинг.");
}

/**
 * Generates photorobot image variants via OpenRouter multimodal image models.
 * Uses google/gemini-2.5-flash-image or similar — works with existing OPENROUTER_API_KEY.
 */
export async function generatePhotorobotVariants(
  prompt: string,
  count: number,
  type: "HUMAN" | "OBJECT",
  _userApiKey?: string,
): Promise<string[]> {
  const actualCount = Math.max(1, Math.min(count, 5));
  const fullPrompt =
    type === "OBJECT"
      ? `${prompt} CRITICAL: Generate ONLY the single object described above. Do NOT add any vehicle, car, person, animal, or scene. No knife in car, no object stuck in anything. Just the one item alone on pure white background (#FFFFFF). Professional product photography, 8k, photorealistic.`
      : `Forensic identification portrait, photorealistic: ${prompt}. Sharp facial details, neutral solid white background, professional studio lighting, high quality, realistic face.`;

  // 5 parallel calls: round-robin over photorobot models so we get 5 variants (same model can serve multiple)
  const plannedModels = Array.from(
    { length: actualCount },
    (_, i) => PHOTOROBOT_MODELS[i % PHOTOROBOT_MODELS.length],
  );
  const settled = await Promise.allSettled(
    plannedModels.map((model, i) => openRouterImage(`${fullPrompt}\nVariant ${i + 1}.`, model)),
  );

  const images = settled
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);

  // Top up to 5 if any call failed: retry with any available model
  for (let need = actualCount - images.length; need > 0; need--) {
    try {
      const img = await openRouterImage(
        `${fullPrompt}\nAdditional variant ${images.length + 1}.`,
      );
      images.push(img);
    } catch {
      break;
    }
  }

  if (images.length === 0) {
    const firstError = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw new Error(firstError?.reason?.message ?? "Расм яратилмади. ОпенРоутер балансини текширинг.");
  }
  return images;
}

/**
 * Edits a photorobot image: uses vision LLM to describe the current image,
 * merges edit instructions, then re-generates. For OBJECT type avoids portrait wording.
 */
export async function editPhotorobotImage(
  imageUrl: string,
  editInstruction: string,
  userApiKey?: string,
  type: "HUMAN" | "OBJECT" = "HUMAN",
): Promise<string> {
  const client = getTextClient(userApiKey);

  const isObject = type === "OBJECT";
  const visionPrompt = isObject
    ? `Describe the single object in this product photo in detail (shape, color, material, condition). Then apply this change: "${editInstruction}". Return ONLY JSON: {"fullDescription":"updated object description in English for image generation"}`
    : `Ушбу фоторобот портретидаги шахснинг ташқи қиёфасини батафсил тавсифланг (йуз шакли, тери ранги, кўзлар, бурун, соч, соқол, кийим ва ҳ..). Кейин ушбу ўзгаришни киритинг: "${editInstruction}". ФАҚАТ JSON қайтаринг: {"fullDescription":"янгиланган портрет тавсифи (инглиз тилида расм генератсияси учун)"}`;

  const descResponse = await client.chat.completions.create({
    model: TEXT_MODEL,
    messages: uzMessages([{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl } },
        { type: "text", text: visionPrompt },
      ],
    }]),
    response_format: { type: "json_object" },
  });

  const desc = safeParseJson<{ fullDescription?: string }>(
    descResponse.choices[0]?.message?.content ?? "{}", {},
  );
  const finalPrompt = desc.fullDescription || editInstruction;

  const editFullPrompt = isObject
    ? `${finalPrompt} Single object only, no vehicle, no person, pure white background. 8k product photo, photorealistic.`
    : `Forensic identification portrait: ${finalPrompt}. Realistic, neutral white background, photorealistic, sharp details.`;

  return openRouterImage(editFullPrompt);
}

// --- VIRTUAL MENTOR ---
export interface MentorTurn {
  role: "user" | "model";
  content: string;
}

export async function askVirtualMentor(
  query: string,
  history: MentorTurn[],
  _mode: MentorMode,
  systemInstruction: string,
  _lang: AppLanguage,
  userApiKey?: string,
): Promise<MentorResponse> {
  const fallback: MentorResponse = {
    text: "Жавоб вақти тугади. Қайта сўранг.",
    feedback: "",
    suggestion: "",
  };
  try {
    const client = getTextClient(userApiKey);
    const combinedSystem = STRICT_UZ_SYSTEM_CONTENT + " " + systemInstruction;
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: combinedSystem },
      ...history.map((h) => ({
        role: (h.role === "model" ? "assistant" : "user") as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: query },
    ];

    const result = await withTimeout(
      client.chat.completions
        .create({ model: TEXT_MODEL, messages })
        .then((r) => r.choices[0]?.message?.content ?? ""),
      MENTOR_QUERY_TIMEOUT_MS,
      "",
    );
    return { text: result || fallback.text, feedback: "", suggestion: "" };
  } catch {
    return fallback;
  }
}

// --- LEGAL SEARCH ---
export async function searchLegalDatabase(
  query: string,
  lang: AppLanguage = AppLanguage.UZ_LATN,
  userApiKey?: string,
): Promise<LegalAnalysisResult> {
  const fallback: LegalAnalysisResult = {
    analysis: "Қидирув вақти тугади ёки тармоқ хатоси. Қайта уриниб кўринг.",
    articles: [],
    precedents: [],
  };
  try {
    const client = getTextClient(userApiKey);
  const response = await withTimeout(
      client.chat.completions
        .create({
          model: TEXT_MODEL,
          messages: uzMessages([
            {
              role: "user",
              content: `Ўзбекистон Республикаси қонунчилиги бўйича қуйидаги мавзуда ҳуқуқий маълумот беринг: "${query}".
БАРЧА жавобларни ЎЗБЕК КИРИЛЛ алифбосида ёзинг.
ФАҚАТ JSON объект қайтаринг:
{"analysis":"батафсил ҳуқуқий таҳлил","articles":[{"code":"...","number":"...","title":"...","summary":"..."}],"precedents":[{"source":"...","title":"...","link":"..."}]}`,
            },
          ]),
          response_format: { type: "json_object" },
        })
        .then((r) => r.choices[0]?.message?.content ?? "{}"),
      LEGAL_SEARCH_TIMEOUT_MS,
      "{}",
    );
    const parsed = safeParseJson<LegalAnalysisResult>(response, {
      analysis: "",
      articles: [],
      precedents: [],
    });
    return {
      analysis: String(parsed.analysis ?? ""),
      articles: Array.isArray(parsed.articles) ? parsed.articles : [],
      precedents: Array.isArray(parsed.precedents) ? parsed.precedents : [],
      sources: parsed.sources,
    };
  } catch {
    return fallback;
  }
}

// --- ACADEMY QUIZ ---
export async function generateAcademyQuiz(
  topic: string,
  lang: AppLanguage,
  userApiKey?: string,
): Promise<QuizQuestion[]> {
  const client = getTextClient(userApiKey);
  const response = await client.chat.completions.create({
    model: TEXT_MODEL,
    messages: uzMessages([
      {
        role: "user",
        content: `"${topic}" мавзусида тест саволлари тузинг. 5 та савол.
БАРЧА саволлар ва жавоблар ЎЗБЕК КИРИЛЛ алифбосида бўлсин.
ФАҚАТ JSON қайтаринг: {"questions":[{"id":"1","question":"...","options":["А","Б","В","Г"],"correctAnswer":0,"explanation":"..."}]}`,
      },
    ]),
    response_format: { type: "json_object" },
  });

  const jsonText = response.choices[0]?.message?.content ?? "{}";
  return extractArray<QuizQuestion>(jsonText, []);
}

// --- AUDIO TRANSCRIPTION (Groq Whisper) ---

type VerboseSegment = { id?: number; start?: number; end?: number; text?: string };

/** Parses the verbose_json response from Groq Whisper into TranscriptSegment[].
 *  Automatically converts any Latin Uzbek output to Cyrillic. */
function parseGroqTranscription(raw: unknown): TranscriptSegment[] {
  const result = raw as { text: string; segments?: VerboseSegment[] };
  const fullText = result.text ?? "";
  if (!fullText.trim()) return [];

  const segs = result.segments ?? [];
  if (segs.length > 1) {
    return segs.map((s, i) => {
      const t = (s.text ?? "").trim();
      return {
        id: `seg_${i + 1}`,
        speaker: `Гапирувчи ${(i % 2) + 1}`,
        text: latinUzbekToCyrillic(t),
        timestamp: s.start !== undefined ? formatTimestamp(s.start) : "",
        stressLevel: undefined,
        sentiment: undefined,
      };
    });
  }

  const t = fullText.trim();
  return [{ id: "seg_1", speaker: "Гапирувчи 1", text: latinUzbekToCyrillic(t), timestamp: "00:00" }];
}

/**
 * Sends a raw File object directly to Groq Whisper — no base64 roundtrip.
 * This preserves the exact original bytes and avoids any encoding corruption.
 */
export async function transcribeAudioFile(
  file: File,
  lang: AppLanguage,
  userApiKey?: string,
): Promise<TranscriptSegment[]> {
  // Primary: OpenRouter + Gemini via input_audio — native Uzbek/Russian accuracy
  const orKey = userApiKey?.trim() || OPENROUTER_API_KEY;
  if (orKey) {
    return transcribeWithOpenRouter(file, lang, orKey);
  }

  // Groq Whisper fallback (if no OpenRouter key configured)
  const wavFile = await convertToWav(file);

  const formData = new FormData();
  formData.append("file", wavFile, wavFile.name);
  formData.append("model", AUDIO_MODEL);
  formData.append("language", getLangCode(lang));
  formData.append("response_format", "verbose_json");
  formData.append(
    "prompt",
    "Тергов органи томонидан ўтказилган расмий сўроқ ёки гувоҳлик ёзуви. " +
    "Ҳуқуқий атамалар: тергов, далолатнома, гувоҳ, жабрланувчи, айбланувчи, " +
    "прокуратура, судя, Жиноят кодекси, модда, ҳибсга олиш, тинтув, айблов.",
  );

  const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: formData,
  });

  if (!groqResponse.ok) {
    const errBody = await groqResponse.text().catch(() => groqResponse.statusText);
    throw new Error(`Groq transkriptsiya xatosi ${groqResponse.status}: ${errBody}`);
  }

  const segments = parseGroqTranscription(await groqResponse.json() as unknown);
  if (segments.length === 0) return segments;

  // Ensure all segments are in Cyrillic
  const cyrillicSegments = segments.map((s) => ({
    ...s,
    text: latinUzbekToCyrillic(s.text),
  }));

  const rawText = cyrillicSegments.map((s) => s.text).join("\n");
  const corrected = await correctTranscriptUzbek(rawText).catch(() => "");
  if (!corrected.trim()) return cyrillicSegments;

  const correctedLines = corrected.trim().split("\n").filter((l) => l.trim());
  const toСyrl = (t: string) => latinUzbekToCyrillic(t);
  if (correctedLines.length === cyrillicSegments.length) {
    return cyrillicSegments.map((s, i) => ({ ...s, text: toСyrl(correctedLines[i].trim()) }));
  }
  return [{
    id: "seg_1",
    speaker: cyrillicSegments[0].speaker ?? "Гапирувчи 1",
    text: toСyrl(corrected.trim()),
    timestamp: cyrillicSegments[0].timestamp ?? "00:00",
  }];
}

/** Max size for single request (~18 MB) to avoid API limits; above this we chunk. */
const LONG_AUDIO_THRESHOLD_BYTES = 18 * 1024 * 1024;
/** Chunk duration in seconds for long audio (2 min so each chunk stays under ~15 MB at 48 kHz). */
const LONG_AUDIO_CHUNK_SECONDS = 2 * 60;

/**
 * Splits an AudioBuffer into chunks of up to chunkDurationSeconds and returns WAV Files.
 */
async function splitAudioToWavChunks(
  buffer: AudioBuffer,
  chunkDurationSeconds: number,
): Promise<File[]> {
  const sr = buffer.sampleRate;
  const totalSamples = buffer.length;
  const durationSec = totalSamples / sr;
  const files: File[] = [];
  const ctx = new AudioContext({ sampleRate: sr });

  try {
    for (let startSec = 0; startSec < durationSec; startSec += chunkDurationSeconds) {
      const endSec = Math.min(startSec + chunkDurationSeconds, durationSec);
      const startSample = Math.floor(startSec * sr);
      const endSample = Math.floor(endSec * sr);
      const chunkLength = endSample - startSample;
      if (chunkLength <= 0) continue;

      const chunkBuffer = ctx.createBuffer(buffer.numberOfChannels, chunkLength, sr);
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        chunkBuffer.copyToChannel(buffer.getChannelData(ch).subarray(startSample, endSample), ch);
      }
      const wavAb = audioBufferToWav(chunkBuffer);
      files.push(new File([wavAb], `chunk_${files.length}.wav`, { type: "audio/wav" }));
    }
  } finally {
    await ctx.close();
  }
  return files;
}

/**
 * Transcribes long audio by splitting into chunks, transcribing each, then merging segments.
 */
async function transcribeLongAudio(
  file: File,
  lang: AppLanguage,
  apiKey: string,
): Promise<TranscriptSegment[]> {
  const raw = await file.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(raw);
  } finally {
    await ctx.close();
  }

  const chunks = await splitAudioToWavChunks(decoded, LONG_AUDIO_CHUNK_SECONDS);
  const allSegments: TranscriptSegment[] = [];
  let timeOffsetSec = 0;

  for (let i = 0; i < chunks.length; i++) {
    const segs = await transcribeWithOpenRouter(chunks[i], lang, apiKey);
    for (const s of segs) {
      const ts = s.timestamp ? parseTimestampToSeconds(s.timestamp) : 0;
      allSegments.push({
        ...s,
        id: `seg_${allSegments.length + 1}`,
        timestamp: formatTimestamp(timeOffsetSec + ts),
      });
    }
    timeOffsetSec += LONG_AUDIO_CHUNK_SECONDS;
  }

  return allSegments;
}

function parseTimestampToSeconds(mmss: string): number {
  const parts = mmss.trim().split(":");
  if (parts.length >= 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(parts[1], 10) || 0;
    return m * 60 + s;
  }
  return 0;
}

/**
 * Transcribes audio from base64 for the SmartProtocol interrogation module.
 * For long recordings (>18 MB), chunks into 6-min segments to stay under API limits.
 * Primary: OpenRouter + Gemini. Fallback: Groq Whisper.
 */
export async function transcribeAudio(
  base64: string,
  mimeType: string,
  _mode: string,
  _identifySpeakers: boolean,
  lang: AppLanguage,
  _userApiKey?: string,
): Promise<TranscriptSegment[]> {
  const { ext } = normalizeAudioMimeType(mimeType);
  const audioFile = base64ToFile(base64, `audio/${ext}`, `audio.${ext}`);

  const useChunked = audioFile.size > LONG_AUDIO_THRESHOLD_BYTES;

  if (OPENROUTER_API_KEY) {
    try {
      if (useChunked) {
        const segments = await transcribeLongAudio(audioFile, lang, OPENROUTER_API_KEY);
        if (segments.length > 0) return segments;
      } else {
        const segments = await transcribeWithOpenRouter(audioFile, lang, OPENROUTER_API_KEY);
        if (segments.length > 0) return segments;
      }
    } catch (e) {
      console.warn("OpenRouter transcription failed, falling back to Groq:", e);
    }
  }

  if (!GROQ_API_KEY) {
    throw new Error("Аудио транскрипция учун API калит топилмади (OpenRouter ёки Groq).");
  }

  if (useChunked) {
    const raw = await audioFile.arrayBuffer();
    const ctx = new AudioContext({ sampleRate: 16000 });
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(raw);
    } finally {
      await ctx.close();
    }
    const chunks = await splitAudioToWavChunks(decoded, LONG_AUDIO_CHUNK_SECONDS);
    const allSegments: TranscriptSegment[] = [];
    for (const chunk of chunks) {
      const formData = new FormData();
      formData.append("file", chunk, chunk.name);
      formData.append("model", AUDIO_MODEL);
      formData.append("language", getLangCode(lang));
      formData.append("response_format", "verbose_json");
      formData.append("prompt", "Тергов сўроқ ёзуви. Ўзбек кирилл.");
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
        body: formData,
      });
      if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
      const parsed = parseGroqTranscription(await res.json() as unknown);
      parsed.forEach((s, i) => allSegments.push({ ...s, id: `seg_${allSegments.length + 1}` }));
    }
    return allSegments;
  }

  const formData = new FormData();
  formData.append("file", audioFile, audioFile.name);
  formData.append("model", AUDIO_MODEL);
  formData.append("language", getLangCode(lang));
  formData.append("response_format", "verbose_json");
  formData.append(
    "prompt",
    "Тергов органи томонидан ўтказилган расмий сўроқ ёки гувоҳлик ёзуви. " +
    "Ҳуқуқий атамалар: тергов, далолатнома, гувоҳ, жабрланувчи, айбланувчи, " +
    "прокуратура, судя, Жиноят кодекси, модда, ҳибсга олиш, тинтув, айблов.",
  );

  const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: formData,
  });

  if (!groqResponse.ok) {
    const errBody = await groqResponse.text().catch(() => groqResponse.statusText);
    throw new Error(`Groq транскрипция хатоси ${groqResponse.status}: ${errBody}`);
  }

  return parseGroqTranscription(await groqResponse.json() as unknown);
}

// --- TIMELINE EXTRACTION ---
export async function generateTimelineFromText(
  text: string,
  lang: AppLanguage,
  userApiKey?: string,
): Promise<TimelineEvent[]> {
  const client = getTextClient(userApiKey);
  const response = await client.chat.completions.create({
    model: TEXT_MODEL,
    messages: uzMessages([
      {
        role: "user",
        content: `Қуйидаги матндан воқеалар жадвалини ажратиб олинг: "${text}".
БАРЧА жавоблар ЎЗБЕК КИРИЛЛ алифбосида бўлсин.
ФАҚАТ JSON қайтаринг: {"events":[{"time":"...","date":"...","description":"...","location":"..."}]}`,
      },
    ]),
    response_format: { type: "json_object" },
  });

  const jsonText = response.choices[0]?.message?.content ?? "{}";
  return extractArray<TimelineEvent>(jsonText, []);
}

// Keep getLangLabel exported for any component that might use it
export { getLangLabel };
