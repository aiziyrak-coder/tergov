import React, { useState, useEffect } from "react";
import { ArrowLeft, Search, FileText, Download, Copy, Eye, Bookmark, LayoutTemplate, Tag, Gavel, Scale, AlertOctagon, FileCheck, Printer, UserPlus, Trash2, User, RefreshCw, PenTool } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";

interface TemplatesGalleryProps {
  onBack: () => void;
}

interface Participant {
  id: string;
  role: string;
  name: string;
}

/** Template form data for legal documents. */
interface TemplateFormData {
  date: string;
  city: string;
  investigatorName: string;
  investigatorRank?: string;
  officeNumber?: string;
  participants: Participant[];
  [key: string]: string | Participant[] | undefined;
}

/** Escape HTML to prevent XSS in user-provided template fields. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- DYNAMIC TEMPLATE GENERATORS ---

const TEMPLATE_STYLE = `
  <style>
    body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #000; }
    h1, h2, h3 { text-align: center; text-transform: uppercase; font-weight: bold; margin-bottom: 10px; margin-top: 15px; }
    .header { text-align: right; margin-bottom: 30px; font-weight: bold; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    td, th { border: 1px solid black; padding: 5px; vertical-align: top; }
    .footer { margin-top: 40px; }
    .indent { text-indent: 30px; margin-bottom: 10px; text-align: justify; }
    .participants-list { margin: 10px 0; font-style: italic; }
  </style>
`;

const getParticipantsHTML = (list: Participant[]) => {
  if (list.length === 0) return "";
  return `<ul class="participants-list">` +
    list.map((p) => `<li><strong>${escapeHtml(p.role)}:</strong> ${escapeHtml(p.name)}</li>`).join("") +
    `</ul>`;
};

const getShablonAyblov = (data: TemplateFormData) => {
  const d = data.date.split("-");
  const dateStr = d.length >= 3 ? `«${d[2]}» ${d[1]} ${d[0]} йил` : data.date;
  const city = escapeHtml(data.city);
  const mainPerson = data.participants.find((p) => p.role.includes("Айб") || p.role.includes("Гум"))?.name ?? "__________________";
  return `
<div class="header">
    « ТАСДИҚЛАЙМАН »<br>
    Вилоят прокурорининг биринчи ўринбосари<br>
    адлия маслаҳатчиси<br>
    И.А.Қамбаров<br>
    ${dateStr}
</div>

<h1>А Й Б Л О В  Х У Л О С А С И</h1>
<div class="center"><strong>300002/2025-206ХО-сонли жиноят иши юзасидан</strong></div>
<br>

<p class="indent">
    <strong>Жиноят иши бўйича иштирокчилар:</strong>
</p>
${getParticipantsHTML(data.participants)}

<p class="indent">
    <strong>Модда:</strong> Ўзбекистон Республикаси ЖКнинг 168-моддаси 3-қисми “а” банди.
</p>

<h3>ДАСТЛАБКИ ТЕРГОВДА АНИҚЛАНДИ:</h3>
<p class="indent">
    Фуқаро ${escapeHtml(mainPerson)} ва бошқалар ўзларининг бошқа шахслардан бўлган қарзларини қайтариш учун жиноий тил бириктириб, ${city} марказида жойлашган бозорда фаолият юритувчи жабрланувчиларга нисбатан фирибгарлик содир этганлар.
</p>

<h3>ЖИНОИЙ РЕЖА:</h3>
<p class="indent">
    Улар жабрланувчилардан насияга мол-мулкларни бозор нархидан қимматроққа олишни ва пулини келишилган муддатда беришни ваъда қилишган. Аслида эса олинган нарсаларни бошқа шахсларга арзонроққа сотиб, тушган пулларни ўзларининг эски қарзларини ёпишга ва шахсий эҳтиёжларига ишлатиб юборишган.
</p>

<h3>ЗАРАР МИҚДОРИ:</h3>
<p class="indent">
    Жабрланувчиларга жами <strong>кўп миқдорда</strong> моддий зарар етказилган.
</p>

<h3>ДАЛИЛЛАР:</h3>
<ol>
    <li>Жабрланувчиларнинг кўрсатмалари.</li>
    <li>Гувоҳларнинг кўрсатмалари.</li>
    <li>Юзлаштириш баённомалари.</li>
    <li>Тилхатлар ва СМС ёзишмалари.</li>
</ol>

<h3>ХУЛОСА:</h3>
<p class="indent">
    Юқоридаги шахсларнинг ҳаракатларида Ўзбекистон Республикаси ЖКнинг 168-моддаси 3-қисми “а” банди (кўп миқдорда фирибгарлик) жиноят таркиби мавжуд.
</p>

<br>
<p><strong>Терговчи:</strong> ________________ ${escapeHtml(data.investigatorName)}</p>
`;
};

const getShablonTanibOlish = (data: TemplateFormData) => `
<h1>ШАХСНИ ТАНИБ ОЛИШ УЧУН КЎРСАТИШ<br>БАЁННОМАСИ</h1>

<div style="display: flex; justify-content: space-between;">
    <div>${escapeHtml(data.city)}</div>
    <div>${escapeHtml(data.date)}<br>соат: ____ дақиқа ____</div>
</div>
<br>

<p class="indent">
    Ички ишлар органи терговчиси <strong>${escapeHtml(data.investigatorName)}</strong>, холислар иштирокида, ушбу тергов ҳаракати ўтказилиш тартибини тушунтириб, ЎзР ЖПКнинг 125-127-моддаларига асосан мазкур баённомани тузди.
</p>

<p class="indent"><strong>Иштирок этувчи шахслар:</strong></p>
${getParticipantsHTML(data.participants)}

<p class="indent">
    Таниб олиш учун кўрсатиладиган шахслар:<br>
    <strong>1. (Таниб олиниши лозим бўлган шахс):</strong> ___________________________________<br>
    2. (Бошқа шахс): ___________________________________________________<br>
    3. (Бошқа шахс): ___________________________________________________
</p>

<p class="indent">
    Таниб олувчига (гувоҳ/жабрланувчи) била туриб ёлғон кўрсатма берганлик учун ЖКнинг 238-моддаси бўйича жавобгарлик тушунтирилди.
</p>
<div class="center">
    <strong>Имзо: _______________</strong>
</div>

<h3>КЎРСАТМАЛАР:</h3>
<p class="indent">
    Таниб олувчига юқоридаги уч нафар шахс кўрсатилди ва улардан бирортасини таниши ёки танимаслиги сўралди.
</p>
<p class="indent">
    Таниб олувчи диққат билан қараб чиқиб, <strong>Чапдан/Ўнгдан _______ - рақамда турган</strong> фуқарони таниб олди ва қуйидагиларни маълум қилди:
</p>
<p class="indent" style="border-bottom: 1px dotted black; line-height: 2;">
    "Мен ушбу шахсни унинг юз тузилишидан, кўзларидан ва ўша куни кийган кийимидан танидим..."
</p>

<br>
<div class="footer">
    <strong>Терговчи:</strong> ${escapeHtml(data.investigatorName)}
</div>
`;

const getShablonGuvoh = (data: TemplateFormData) => `
<h1>ГУВОҲНИ СЎРОҚ ҚИЛИШ БАЁННОМАСИ</h1>

<div style="display: flex; justify-content: space-between;">
    <div>${escapeHtml(data.city)}</div>
    <div>${escapeHtml(data.date)}</div>
</div>
<br>

<p class="indent">
    Терговчи <strong>${escapeHtml(data.investigatorName)}</strong>, хизмат хонасида, ушбу жиноят иши бўйича гувоҳ тариқасида чақирилган қуйидаги шахсни сўроқ қилди:
</p>

<table border="1">
    <tr><td><strong>1. Фамилияси, исми, шарифи:</strong></td><td>${data.participants.find((p: Participant) => p.role.includes("Гувоҳ"))?.name ?? "________________________________________"}</td></tr>
    <tr><td><strong>2. Туғилган йили ва жойи:</strong></td><td>________________________________________</td></tr>
    <tr><td><strong>3. Миллати:</strong></td><td>________________________________________</td></tr>
    <tr><td><strong>4. Маълумоти:</strong></td><td>________________________________________</td></tr>
    <tr><td><strong>5. Иш жойи ва лавозими:</strong></td><td>________________________________________</td></tr>
    <tr><td><strong>6. Яшаш манзили:</strong></td><td>________________________________________</td></tr>
    <tr><td><strong>7. Телефон рақами:</strong></td><td>________________________________________</td></tr>
</table>

<p class="indent">
    Гувоҳга ЎзР ЖПКнинг 66-моддасидаги ҳуқуқ ва мажбуриятлари тушунтирилди. Кўрсатма беришдан бош тортганлик ёки била туриб ёлғон кўрсатма берганлик учун ЖКнинг 238, 240-моддалари билан огоҳлантирилди.
</p>
<div class="center">
    <strong>Гувоҳ имзоси: _______________</strong>
</div>

<h3>КЎРСАТМА:</h3>
<p class="indent" style="line-height: 2;">
    Саволга жавобан қуйидагиларни маълум қиламан: __________________________________________________
    ________________________________________________________________________________________________
    ________________________________________________________________________________________________
    ________________________________________________________________________________________________
    ________________________________________________________________________________________________
    (эркин баён).
</p>

<br>
<div class="footer">
    <strong>Баённомани ўқидим, сўзларим тўғри ёзилган.</strong><br><br>
    <strong>Терговчи:</strong> ${escapeHtml(data.investigatorName)}
</div>
`;

const TEMPLATE_DB = [
    {
        id: 't-001',
        title: 'Айблов Хулосаси (Тилла - Фирибгарлик)',
        category: 'Фирибгарлик',
        code: 'ЖК 168-модда',
        description: 'Тилла тақинчоқлар савдоси билан боғлиқ кўп миқдордаги фирибгарлик иши (Реал Намуна 2025).',
        generator: getShablonAyblov,
        tags: ['Фирибгарлик', 'Тилла', 'Гуруҳ', 'Насия'],
        color: 'emerald'
    },
    {
        id: 't-tanib-olish',
        title: 'Шахсни Таниб Олиш Баённомаси',
        category: 'Процессуал Ҳужжатлар',
        code: 'ЖПК 125-модда',
        description: 'Жабрланувчи ёки гувоҳ томонидан жиноятчини таниб олиш учун кўрсатиш протоколи.',
        generator: getShablonTanibOlish,
        tags: ['Таниб олиш', 'Баённома', 'Гувоҳ', 'таниб олиш'],
        color: 'blue'
    },
    {
        id: 't-guvoh',
        title: 'Гувоҳни Сўроқ Қилиш Баённомаси',
        category: 'Процессуал Ҳужжатлар',
        code: 'ЖПК 96-модда',
        description: 'Гувоҳни сўроқ қилиш учун стандарт бўш бланк (Анкета маълумотлари билан).',
        generator: getShablonGuvoh,
        tags: ['Баённома', 'Гувоҳ', 'Сўроқ'],
        color: 'indigo'
    }
];

const TemplatesGallery: React.FC<TemplatesGalleryProps> = ({ onBack }) => {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedTemplate, setSelectedTemplate] = useState<typeof TEMPLATE_DB[0] | null>(null);

  // --- FORM STATE ---
  const [formData, setFormData] = useState({
      date: new Date().toISOString().split('T')[0],
      city: 'Фарғона шаҳри',
      investigatorName: '',
      participants: [] as Participant[]
  });
  
  const [newParticipant, setNewParticipant] = useState({ role: 'Гувоҳ', name: '' });
  const [generatedContent, setGeneratedContent] = useState('');

  useEffect(() => {
      if (selectedTemplate) {
          setGeneratedContent(selectedTemplate.generator(formData));
      }
  }, [selectedTemplate, formData]);

  const addParticipant = () => {
      if (newParticipant.name) {
          setFormData(prev => ({
              ...prev,
              participants: [...prev.participants, { id: Date.now().toString(), role: newParticipant.role, name: newParticipant.name }]
          }));
          setNewParticipant({ ...newParticipant, name: '' });
          toast("Одди истирокчи қўшилди", "success");
      }
  };

  const removeParticipant = (id: string) => {
      setFormData(prev => ({
          ...prev,
          participants: prev.participants.filter(p => p.id !== id)
      }));
  };

  const categories = ['ALL', 'Фирибгарлик', 'Процессуал Ҳужжатлар', 'Қарорлар'];

  const filteredTemplates = TEMPLATE_DB.filter(t => {
      const lowerSearch = search.toLowerCase();
      const matchSearch = t.title.toLowerCase().includes(lowerSearch) || 
                          t.description.toLowerCase().includes(lowerSearch) ||
                          t.tags.some(tag => tag.toLowerCase().includes(lowerSearch));
      const matchCat = selectedCategory === 'ALL' || t.category === selectedCategory;
      return matchSearch && matchCat;
  });

  const handleDownloadWord = () => {
      if (!selectedTemplate) return;
      
      const preHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <title>${selectedTemplate.title}</title>
            ${TEMPLATE_STYLE}
        </head>
        <body>
      `;
      const postHtml = "</body></html>";
      const htmlContent = preHtml + generatedContent + postHtml;
      
      const blob = new Blob([htmlContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTemplate.title.replace(/\s+/g, '_')}_${formData.date}.doc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("Hujjat yuklab olindi", "success");
  };

  const handlePrint = () => {
      const printWindow = window.open('', '', 'height=600,width=800');
      if (printWindow) {
          printWindow.document.write('<html><head><title>Print</title>');
          printWindow.document.write(TEMPLATE_STYLE);
          printWindow.document.write('</head><body>');
          printWindow.document.write(generatedContent);
          printWindow.document.write('</body></html>');
          printWindow.document.close();
          setTimeout(() => printWindow.print(), 500);
      }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#F8FAFC] font-sans overflow-hidden relative text-slate-900">
        
        {/* HEADER */}
        <div className="h-20 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0 z-20 shadow-sm">
            <div className="flex items-center gap-4">
                <button type="button" onClick={onBack} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-500 transition-all" aria-label="Orqaga">
                    <ArrowLeft size={20}/>
                </button>
                <div>
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-3 tracking-tight uppercase">
                        <LayoutTemplate className="text-uzgreen" size={24}/>
                        Tezkor <span className="text-uzgreen">Namunalar</span>
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Protsessual Hujjatlar Bazasi</p>
                </div>
            </div>
            
            <div className="flex gap-4 items-center">
                 <div className="relative group">
                    <div className="relative flex items-center bg-white border border-slate-300 rounded-xl focus-within:border-uzgreen focus-within:ring-4 focus-within:ring-green-50 transition-all shadow-sm">
                        <Search className="ml-3 text-slate-400" size={18}/>
                        <input 
                            type="text" 
                            placeholder="Qidiruv (Mas: 'таниб олиш')..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-transparent pl-3 pr-4 py-2 text-sm text-slate-800 outline-none w-64 placeholder-slate-400 font-medium"
                        />
                    </div>
                 </div>
            </div>
        </div>

        <div className="flex flex-1 min-h-0">
            {/* Sidebar Categories */}
            {!selectedTemplate && (
                <div className="w-64 border-r border-slate-200 p-4 flex flex-col gap-2 bg-white shrink-0">
                    <div className="text-[10px] font-black text-slate-400 uppercase mb-2 pl-2 tracking-widest">Kategoriyalar</div>
                    {categories.map(cat => (
                        <button 
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between group ${selectedCategory === cat ? 'bg-green-50 text-uzgreen border border-green-200' : 'text-slate-500 hover:bg-slate-50 border border-transparent'}`}
                        >
                            <span>{cat === 'ALL' ? 'Barchasi' : cat}</span>
                            {selectedCategory === cat && <div className="w-2 h-2 rounded-full bg-uzgreen"></div>}
                        </button>
                    ))}
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden">
                
                {/* List of Templates */}
                <div className={`${selectedTemplate ? 'hidden' : 'w-full'} overflow-y-auto custom-scrollbar p-8 transition-all duration-500 bg-[#F8FAFC]`}>
                    <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                        {filteredTemplates.map(tpl => (
                            <div 
                                key={tpl.id}
                                onClick={() => setSelectedTemplate(tpl)}
                                className="group relative p-6 rounded-2xl border bg-white border-slate-200 hover:border-uzgreen hover:shadow-xl cursor-pointer transition-all duration-300 hover:-translate-y-1"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-${tpl.color}-50 text-${tpl.color}-600 border border-${tpl.color}-100`}>
                                        <FileText size={24}/>
                                    </div>
                                    <span className="text-[10px] font-black bg-slate-50 border border-slate-200 px-2 py-1 rounded text-slate-500">{tpl.code}</span>
                                </div>
                                
                                <h3 className="text-base font-black text-slate-800 mb-2 leading-tight group-hover:text-uzgreen transition-colors">{tpl.title}</h3>
                                <p className="text-xs text-slate-500 line-clamp-2 mb-4 h-8 font-medium">{tpl.description}</p>
                                
                                <div className="flex flex-wrap gap-1.5">
                                    {tpl.tags.slice(0, 3).map(tag => (
                                        <span key={tag} className="text-[9px] px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-500 flex items-center gap-1 font-bold">
                                            <Tag size={10}/> {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    {filteredTemplates.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 opacity-50">
                            <Search size={48} className="mb-4"/>
                            <p className="font-medium">Ҳеч нарса топилмади: "{search}"</p>
                        </div>
                    )}
                </div>

                {/* Preview Panel (A4 Style) WITH INPUTS */}
                {selectedTemplate && (
                    <div className="flex-1 flex flex-row animate-in slide-in-from-right h-full overflow-hidden">
                        
                        {/* LEFT INPUT PANEL */}
                        <div className="w-[350px] bg-white border-r border-slate-200 flex flex-col z-20 shrink-0">
                            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 uppercase">
                                    <PenTool size={16} className="text-uzgreen"/> Rekvizitlar
                                </h3>
                                <button onClick={() => setSelectedTemplate(null)} className="p-1 text-slate-400 hover:text-slate-800"><ArrowLeft size={18}/></button>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                                
                                {/* Basic Fields */}
                                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <div className="text-[10px] text-slate-400 font-black uppercase">Асосий Маълумотлар</div>
                                    <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-slate-800 outline-none focus:border-uzgreen"/>
                                    <input type="text" placeholder="Shahar/Tuman" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-slate-800 outline-none focus:border-uzgreen"/>
                                    <input type="text" placeholder="Tergovchi (F.I.SH)" value={formData.investigatorName} onChange={e => setFormData({...formData, investigatorName: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-slate-800 outline-none focus:border-uzgreen"/>
                                </div>

                                {/* Participants List */}
                                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <div className="text-[10px] text-slate-400 font-black uppercase flex justify-between items-center">
                                        <span>Ishtirokchilar</span>
                                        <span className="bg-slate-200 px-1.5 rounded text-slate-600">{formData.participants.length}</span>
                                    </div>
                                    
                                    {/* Add Participant Input */}
                                    <div className="flex flex-col gap-2">
                                        <select 
                                            value={newParticipant.role} 
                                            onChange={e => setNewParticipant({...newParticipant, role: e.target.value})}
                                            className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-slate-800 outline-none focus:border-uzgreen"
                                        >
                                            <option>Гувоҳ</option>
                                            <option>Жабрланувчи</option>
                                            <option>Гумонланувчи</option>
                                            <option>Холис</option>
                                            <option>Таржимон</option>
                                            <option>Айбланувчи</option>
                                        </select>
                                        <div className="flex gap-2">
                                            <input 
                                                placeholder="F.I.SH" 
                                                value={newParticipant.name} 
                                                onChange={e => setNewParticipant({...newParticipant, name: e.target.value})}
                                                className="flex-1 bg-white border border-slate-200 rounded-lg p-3 text-xs font-bold text-slate-800 outline-none focus:border-uzgreen"
                                            />
                                            <button onClick={addParticipant} className="p-3 bg-uzgreen rounded-lg text-white hover:bg-green-600 shadow-lg shadow-green-200"><UserPlus size={16}/></button>
                                        </div>
                                    </div>

                                    {/* List */}
                                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                        {formData.participants.map(p => (
                                            <div key={p.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 text-xs shadow-sm">
                                                <div>
                                                    <div className="font-bold text-uzgreen">{p.role}</div>
                                                    <div className="text-slate-600 font-medium">{p.name}</div>
                                                </div>
                                                <button onClick={() => removeParticipant(p.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-6 border-t border-slate-200 bg-slate-50">
                                <button 
                                    onClick={handleDownloadWord}
                                    className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xl shadow-slate-300 transition-all active:scale-95"
                                >
                                    <Download size={16}/> ВОРД ЮКЛАШ
                                </button>
                            </div>
                        </div>

                        {/* RIGHT PREVIEW (Fixed Height Issue) */}
                        <div className="flex-1 bg-slate-100 relative flex flex-col h-full overflow-hidden">
                            {/* Toolbar */}
                            <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 shadow-sm">
                                <span className="text-[10px] text-slate-400 uppercase font-black">{selectedTemplate.title} (Кўриб чиқиш)</span>
                                <div className="flex gap-2">
                                    <button onClick={handlePrint} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"><Printer size={16}/></button>
                                </div>
                            </div>

                            {/* Scrollable Paper Container */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-10 flex justify-center">
                                {/* The Paper: Added 'min-h-[297mm]' and 'h-auto' to allow expansion */}
                                <div className="w-[210mm] min-h-[297mm] h-auto bg-white text-black p-[25mm] shadow-2xl ring-1 ring-slate-200 mb-10">
                                    <div 
                                        className="font-serif text-[12pt] leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: generatedContent }}
                                        style={{ fontFamily: '"Times New Roman", Times, serif' }}
                                    />
                                </div>
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default TemplatesGallery;

