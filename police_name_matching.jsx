import { useState, useCallback, useRef } from "react";

// ── Transliteration Map (Hindi → English phonetic) ──────────────────────────
const HINDI_TO_ROMAN = {
  "अ":"a","आ":"aa","इ":"i","ई":"ee","उ":"u","ऊ":"oo","ए":"e","ऐ":"ai",
  "ओ":"o","औ":"au","क":"k","ख":"kh","ग":"g","घ":"gh","च":"ch","छ":"chh",
  "ज":"j","झ":"jh","ट":"t","ठ":"th","ड":"d","ढ":"dh","त":"t","थ":"th",
  "द":"d","ध":"dh","न":"n","प":"p","फ":"ph","ब":"b","भ":"bh","म":"m",
  "य":"y","र":"r","ल":"l","व":"v","श":"sh","ष":"sh","स":"s","ह":"h",
  "ा":"a","ि":"i","ी":"i","ु":"u","ू":"u","े":"e","ै":"ai","ो":"o",
  "ौ":"au","ं":"n","ः":"h","्":"","ऋ":"ri","ञ":"n","ण":"n","क्ष":"ksh",
  "त्र":"tr","ज्ञ":"gya","ड़":"r","ढ़":"rh","फ़":"f","ज़":"z","ख़":"kh",
  "ग़":"gh","ऑ":"o","ँ":"n"
};

// ── Core Algorithms ──────────────────────────────────────────────────────────
function transliterateHindiToEnglish(text) {
  if (!text) return "";
  let result = "";
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const two = chars[i] + (chars[i+1] || "");
    if (HINDI_TO_ROMAN[two]) { result += HINDI_TO_ROMAN[two]; i++; }
    else if (HINDI_TO_ROMAN[chars[i]]) result += HINDI_TO_ROMAN[chars[i]];
    else if (chars[i] !== " ") result += chars[i];
    else result += " ";
  }
  return result.toLowerCase().trim();
}

function soundex(name) {
  if (!name) return "";
  const s = name.toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";
  const map = {B:1,F:1,P:1,V:1,C:2,G:2,J:2,K:2,Q:2,S:2,X:2,Z:2,D:3,T:3,L:4,M:5,N:5,R:6};
  let code = s[0];
  let prev = map[s[0]] || 0;
  for (let i = 1; i < s.length && code.length < 4; i++) {
    const c = map[s[i]] || 0;
    if (c && c !== prev) { code += c; }
    prev = c;
  }
  return code.padEnd(4, "0");
}

function metaphone(word) {
  if (!word) return "";
  let w = word.toUpperCase().replace(/[^A-Z]/g, "");
  w = w.replace(/^(AE|GN|KN|PN|WR)/, m => m[1]);
  w = w.replace(/MB$/, "M");
  const subs = [
    [/CIA|SCH/, "X"], [/CH/, "X"], [/CI|CE|CY/, "S"], [/C/, "K"],
    [/DGE|DGI|DGY/, "J"], [/DG/, "TK"], [/D/, "T"], [/GH(?=[AEIOU])/, "K"],
    [/GN(ED)?$/, ""], [/G/, "K"], [/PH/, "F"], [/QU/, "K"], [/S[CK]/, "SK"],
    [/SH/, "X"], [/TH/, "0"], [/TCH/, "X"], [/WH(?=[AEIOU])/, "W"],
    [/[AEIOU]+/, ""], [/[HWY]/, ""]
  ];
  for (const [re, rep] of subs) w = w.replace(new RegExp(re, "g"), rep);
  return [...new Set(w)].join("");
}

function levenshtein(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

function jaroWinkler(s1, s2) {
  s1 = s1.toLowerCase(); s2 = s2.toLowerCase();
  if (s1 === s2) return 1;
  const l1 = s1.length, l2 = s2.length;
  const matchDist = Math.max(Math.floor(Math.max(l1,l2)/2)-1, 0);
  const m1 = Array(l1).fill(false), m2 = Array(l2).fill(false);
  let matches = 0, transpositions = 0;
  for (let i=0;i<l1;i++) {
    const start = Math.max(0,i-matchDist), end = Math.min(i+matchDist+1,l2);
    for (let j=start;j<end;j++) if (!m2[j] && s1[i]===s2[j]) { m1[i]=m2[j]=true; matches++; break; }
  }
  if (!matches) return 0;
  const s1m = [...s1].filter((_,i)=>m1[i]);
  const s2m = [...s2].filter((_,i)=>m2[i]);
  for (let i=0;i<s1m.length;i++) if (s1m[i]!==s2m[i]) transpositions++;
  const jaro = (matches/l1 + matches/l2 + (matches-transpositions/2)/matches)/3;
  const prefix = Math.min([...Array(Math.min(4,l1,l2))].findIndex((_,i)=>s1[i]!==s2[i])+1||4, 4);
  return jaro + prefix * 0.1 * (1-jaro);
}

function ngramSimilarity(a, b, n=2) {
  const ngrams = s => new Set([...Array(Math.max(0,s.length-n+1))].map((_,i)=>s.slice(i,i+n)));
  const ga = ngrams(a.toLowerCase()), gb = ngrams(b.toLowerCase());
  const inter = [...ga].filter(x=>gb.has(x)).length;
  const union = new Set([...ga,...gb]).size;
  return union ? inter/union : 0;
}

function normalizeHindiName(name) {
  if (!name) return "";
  const n = name.toLowerCase().trim();
  return n
    .replace(/aa/g,"a").replace(/ee/g,"i").replace(/oo/g,"u")
    .replace(/ph/g,"f").replace(/bh/g,"b").replace(/gh/g,"g")
    .replace(/kh/g,"k").replace(/th/g,"t").replace(/dh/g,"d")
    .replace(/sh/g,"s").replace(/ch/g,"c").replace(/jh/g,"j")
    .replace(/[aeiou]+/g, v => v[0])
    .replace(/(.)\1+/g,"$1");
}

function computeSimilarity(query, candidate) {
  const q = query.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();
  if (!q || !c) return 0;
  const scores = [];
  // Exact
  if (q === c) return 1;
  // Levenshtein (normalized)
  const maxLen = Math.max(q.length, c.length);
  scores.push((maxLen - levenshtein(q,c)) / maxLen);
  // Jaro-Winkler
  scores.push(jaroWinkler(q,c));
  // N-gram
  scores.push(ngramSimilarity(q,c,2));
  // Soundex
  const sd = soundex(q)===soundex(c) ? 1 : 0.3;
  scores.push(sd);
  // Metaphone
  const mp = metaphone(q)===metaphone(c) ? 1 : 0.3;
  scores.push(mp);
  // Normalized Hindi forms
  const nq = normalizeHindiName(q), nc = normalizeHindiName(c);
  scores.push(nq===nc ? 1 : (nq.length - levenshtein(nq,nc)) / Math.max(nq.length,nc.length));
  // Weighted combination
  return 0.20*scores[0] + 0.25*scores[1] + 0.15*scores[2] + 0.15*scores[3] + 0.10*scores[4] + 0.15*scores[5];
}

// ── Mock Database ────────────────────────────────────────────────────────────
const RECORDS = [
  {id:"R001",name:"Suresh Kumar",hindi:"सुरेश कुमार",role:"Suspect",case:"CR-2024-001",dob:"1985-03-12",address:"12 MG Road, Delhi"},
  {id:"R002",name:"Rajesh Singh",hindi:"राजेश सिंह",role:"Witness",case:"CR-2024-002",dob:"1978-07-22",address:"45 Lajpat Nagar, Delhi"},
  {id:"R003",name:"Priya Sharma",hindi:"प्रिया शर्मा",role:"Victim",case:"CR-2024-003",dob:"1992-11-05",address:"7 Connaught Place, Delhi"},
  {id:"R004",name:"Amit Verma",hindi:"अमित वर्मा",role:"Reporter",case:"CR-2024-004",dob:"1990-01-18",address:"23 Karol Bagh, Delhi"},
  {id:"R005",name:"Sunita Devi",hindi:"सुनीता देवी",role:"Witness",case:"CR-2024-001",dob:"1968-09-30",address:"56 Rohini, Delhi"},
  {id:"R006",name:"Mohit Agarwal",hindi:"मोहित अग्रवाल",role:"Suspect",case:"CR-2024-005",dob:"1988-04-14",address:"34 Vasant Kunj, Delhi"},
  {id:"R007",name:"Kavita Joshi",hindi:"कविता जोशी",role:"Reporter",case:"CR-2024-006",dob:"1975-12-01",address:"89 Dwarka, Delhi"},
  {id:"R008",name:"Deepak Pandey",hindi:"दीपक पाण्डे",role:"Suspect",case:"CR-2024-007",dob:"1983-06-25",address:"11 Saket, Delhi"},
  {id:"R009",name:"Anita Gupta",hindi:"अनीता गुप्ता",role:"Victim",case:"CR-2024-008",dob:"1995-02-17",address:"67 Janakpuri, Delhi"},
  {id:"R010",name:"Vikram Yadav",hindi:"विक्रम यादव",role:"Reporter",case:"CR-2024-009",dob:"1980-08-08",address:"4 Pitampura, Delhi"},
  {id:"R011",name:"Sursh Kumar",hindi:"सुरेश कुमार",role:"Suspect",case:"CR-2024-010",dob:"1985-03-12",address:"12 MG Road, Delhi"},
  {id:"R012",name:"Rajeesh Singh",hindi:"राजेश सिंह",role:"Witness",case:"CR-2024-011",dob:"1978-07-22",address:"45 Lajpat Nagar, Delhi"},
  {id:"R013",name:"Kumaar Sharma",hindi:"कुमार शर्मा",role:"Suspect",case:"CR-2024-012",dob:"1970-05-20",address:"33 Paharganj, Delhi"},
  {id:"R014",name:"Suresha Kumari",hindi:"सुरेशा कुमारी",role:"Victim",case:"CR-2024-013",dob:"1993-09-10",address:"18 Tilak Nagar, Delhi"},
  {id:"R015",name:"Mohd Rizwan",hindi:"मोहम्मद रिजवान",role:"Reporter",case:"CR-2024-014",dob:"1987-03-28",address:"55 Okhla, Delhi"},
  {id:"R016",name:"Shyam Lal",hindi:"श्याम लाल",role:"Witness",case:"CR-2024-015",dob:"1965-11-15",address:"72 Laxmi Nagar, Delhi"},
  {id:"R017",name:"Geeta Rawat",hindi:"गीता रावत",role:"Victim",case:"CR-2024-016",dob:"1991-07-04",address:"9 Uttam Nagar, Delhi"},
  {id:"R018",name:"Harish Chandra",hindi:"हरीश चन्द्र",role:"Suspect",case:"CR-2024-017",dob:"1977-02-11",address:"62 Shahdara, Delhi"},
];

const ROLE_COLORS = {Suspect:"#E24B4A",Witness:"#378ADD",Victim:"#BA7517",Reporter:"#1D9E75"};
const ROLE_BG = {Suspect:"#FCEBEB",Witness:"#E6F1FB",Victim:"#FAEEDA",Reporter:"#E1F5EE"};
const TABS = ["Search","Database","Analytics","Guidelines"];

export default function App() {
  const [tab, setTab] = useState("Search");
  const [query, setQuery] = useState("");
  const [hindiQuery, setHindiQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [threshold, setThreshold] = useState(0.45);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [filterRole, setFilterRole] = useState("All");
  const [addName, setAddName] = useState({name:"",hindi:"",role:"Reporter",case:"",dob:"",address:""});
  const [dbRecords, setDbRecords] = useState(RECORDS);
  const [addMsg, setAddMsg] = useState("");
  const abortRef = useRef(null);

  const runSearch = useCallback(() => {
    setSearching(true);
    setSearched(false);
    setResults([]);
    setTimeout(() => {
      const rawQuery = hindiQuery ? transliterateHindiToEnglish(hindiQuery) : query;
      const effectiveQuery = rawQuery.trim();
      if (!effectiveQuery) { setSearching(false); return; }
      const scored = dbRecords.map(r => {
        const nameScore = computeSimilarity(effectiveQuery, r.name);
        const hindiTranslit = transliterateHindiToEnglish(r.hindi);
        const hindiScore = computeSimilarity(effectiveQuery, hindiTranslit);
        const score = Math.max(nameScore, hindiScore);
        return {...r, score, matchDetails: {
          levenshtein: Math.round((1-levenshtein(effectiveQuery.toLowerCase(),r.name.toLowerCase())/Math.max(effectiveQuery.length,r.name.length))*100),
          jaroWinkler: Math.round(jaroWinkler(effectiveQuery,r.name)*100),
          soundexMatch: soundex(effectiveQuery)===soundex(r.name),
          metaphoneMatch: metaphone(effectiveQuery)===metaphone(r.name),
          ngram: Math.round(ngramSimilarity(effectiveQuery,r.name)*100),
        }};
      })
      .filter(r => r.score >= threshold && (filterRole==="All"||r.role===filterRole))
      .sort((a,b) => b.score-a.score);
      setResults(scored);
      setSearching(false);
      setSearched(true);
    }, 600);
  }, [query, hindiQuery, threshold, filterRole, dbRecords]);

  const getAiAnalysis = async (record) => {
    setSelectedRecord(record);
    setAiAnalysis("");
    setAiLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        signal: controller.signal,
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:600,
          system:"You are a police records analyst specializing in Indian name matching. Provide concise, factual analysis. Use bullet points. Be professional.",
          messages:[{role:"user",content:`Analyze this name match result for a police database search:
Search Query: "${query || hindiQuery}"
Matched Record: ${record.name} (${record.hindi || "N/A"})
Match Score: ${Math.round(record.score*100)}%
Role: ${record.role} | Case: ${record.case}
Match Details: Levenshtein ${record.matchDetails.levenshtein}%, Jaro-Winkler ${record.matchDetails.jaroWinkler}%, Soundex: ${record.matchDetails.soundexMatch}, Ngram: ${record.matchDetails.ngram}%

Provide: 1) Why this name matched, 2) Possible script/transliteration variations, 3) Confidence assessment, 4) Recommended action for officer. Keep it under 150 words.`}]
        })
      });
      const data = await resp.json();
      setAiAnalysis(data.content?.[0]?.text || "Analysis unavailable.");
    } catch(e) {
      if (e.name !== "AbortError") setAiAnalysis("Analysis failed. Please try again.");
    }
    setAiLoading(false);
  };

  const handleAddRecord = () => {
    if (!addName.name || !addName.case) { setAddMsg("Name and Case ID are required."); return; }
    const newRecord = {...addName, id:`R${String(dbRecords.length+1).padStart(3,"0")}`, score:0, matchDetails:{}};
    setDbRecords(prev => [...prev, newRecord]);
    setAddName({name:"",hindi:"",role:"Reporter",case:"",dob:"",address:""});
    setAddMsg(`Record added successfully: ${newRecord.id}`);
    setTimeout(()=>setAddMsg(""),3000);
  };

  const stats = {
    total: dbRecords.length,
    suspects: dbRecords.filter(r=>r.role==="Suspect").length,
    victims: dbRecords.filter(r=>r.role==="Victim").length,
    witnesses: dbRecords.filter(r=>r.role==="Witness").length,
    reporters: dbRecords.filter(r=>r.role==="Reporter").length,
  };

  return (
    <div style={{fontFamily:"'IBM Plex Mono','Courier New',monospace",background:"#0a0e1a",minHeight:"100vh",color:"#c8d6f0",padding:"0"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0d1b3e 0%,#0a0e1a 100%)",borderBottom:"1px solid #1e3a6e",padding:"1rem 1.5rem",display:"flex",alignItems:"center",gap:"1rem"}}>
        <div style={{width:42,height:42,background:"#1e3a6e",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid #378ADD",fontSize:20}}>🔏</div>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:"#e8f0ff",letterSpacing:2,textTransform:"uppercase"}}>Police Name Intelligence System</div>
          <div style={{fontSize:11,color:"#6a8abf",letterSpacing:1}}>Advanced Fuzzy Matching • Hindi-English Interoperability • AI Analysis</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          {["Online","Secure"].map(s=>(
            <span key={s} style={{fontSize:10,padding:"3px 8px",borderRadius:20,background:"#0d2e1a",color:"#1D9E75",border:"1px solid #1D9E75",letterSpacing:1}}>{s}</span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,borderBottom:"1px solid #1e3a6e",background:"#080c18",padding:"0 1.5rem"}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:"0.75rem 1.25rem",background:"none",border:"none",borderBottom:tab===t?"2px solid #378ADD":"2px solid transparent",color:tab===t?"#378ADD":"#4a6a9f",cursor:"pointer",fontSize:12,fontFamily:"inherit",letterSpacing:1,fontWeight:tab===t?700:400,transition:"all 0.2s"}}>{t.toUpperCase()}</button>
        ))}
      </div>

      <div style={{padding:"1.5rem",maxWidth:1100,margin:"0 auto"}}>

        {/* SEARCH TAB */}
        {tab==="Search" && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"1rem"}}>
              {/* English Search */}
              <div style={{background:"#0d1525",border:"1px solid #1e3a6e",borderRadius:10,padding:"1rem"}}>
                <label style={{fontSize:11,color:"#6a8abf",letterSpacing:1,display:"block",marginBottom:6}}>ENGLISH NAME / TRANSLITERATION</label>
                <input value={query} onChange={e=>{setQuery(e.target.value);setHindiQuery("");}} onKeyDown={e=>e.key==="Enter"&&runSearch()} placeholder="e.g. Suresh, Sursh, Rajeesh..." style={{width:"100%",background:"#080c18",border:"1px solid #1e3a6e",borderRadius:6,padding:"10px 12px",color:"#c8d6f0",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} />
              </div>
              {/* Hindi Search */}
              <div style={{background:"#0d1525",border:"1px solid #1e3a6e",borderRadius:10,padding:"1rem"}}>
                <label style={{fontSize:11,color:"#6a8abf",letterSpacing:1,display:"block",marginBottom:6}}>HINDI (DEVANAGARI) NAME</label>
                <input value={hindiQuery} onChange={e=>{setHindiQuery(e.target.value);setQuery("");}} onKeyDown={e=>e.key==="Enter"&&runSearch()} placeholder="e.g. सुरेश कुमार..." style={{width:"100%",background:"#080c18",border:"1px solid #1e3a6e",borderRadius:6,padding:"10px 12px",color:"#c8d6f0",fontSize:16,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} />
                {hindiQuery && <div style={{fontSize:11,color:"#4a8a6f",marginTop:4}}>→ Transliterated: <b style={{color:"#1D9E75"}}>{transliterateHindiToEnglish(hindiQuery)}</b></div>}
              </div>
            </div>

            {/* Controls */}
            <div style={{display:"flex",gap:"1rem",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,background:"#0d1525",border:"1px solid #1e3a6e",borderRadius:8,padding:"8px 12px"}}>
                <span style={{fontSize:11,color:"#6a8abf"}}>THRESHOLD</span>
                <input type="range" min="10" max="90" value={Math.round(threshold*100)} onChange={e=>setThreshold(e.target.value/100)} style={{width:80,accentColor:"#378ADD"}} />
                <span style={{fontSize:12,color:"#378ADD",minWidth:32}}>{Math.round(threshold*100)}%</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"#0d1525",border:"1px solid #1e3a6e",borderRadius:8,padding:"8px 12px"}}>
                <span style={{fontSize:11,color:"#6a8abf"}}>ROLE</span>
                <select value={filterRole} onChange={e=>setFilterRole(e.target.value)} style={{background:"#080c18",border:"none",color:"#c8d6f0",fontSize:12,fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
                  {["All","Suspect","Witness","Victim","Reporter"].map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <button onClick={runSearch} disabled={searching||(!query&&!hindiQuery)} style={{padding:"10px 24px",background:searching?"#1e3a6e":"#1a4a8e",border:"1px solid #378ADD",borderRadius:8,color:"#78b8ff",cursor:searching?"wait":"pointer",fontSize:12,fontFamily:"inherit",fontWeight:700,letterSpacing:2,transition:"all 0.2s"}}>
                {searching?"SEARCHING...":"🔍 SEARCH"}
              </button>
              {searched&&<span style={{fontSize:11,color:"#4a6a9f"}}>{results.length} match{results.length!==1?"es":""} found</span>}
            </div>

            {/* Algorithm Explanation */}
            <div style={{background:"#080c18",border:"1px solid #1e2a4e",borderRadius:8,padding:"0.75rem 1rem",marginBottom:"1rem",display:"flex",gap:"1.5rem",flexWrap:"wrap"}}>
              {[["Levenshtein","Edit distance","#378ADD"],["Jaro-Winkler","Prefix weight","#1D9E75"],["Soundex","Phonetic code","#BA7517"],["Metaphone","Sound pattern","#D4537E"],["N-gram","Substring match","#7F77DD"]].map(([n,d,c])=>(
                <div key={n} style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:c,display:"inline-block"}}></span>
                  <span style={{fontSize:11,color:c,fontWeight:700}}>{n}</span>
                  <span style={{fontSize:10,color:"#4a5a7f"}}>{d}</span>
                </div>
              ))}
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div style={{display:"grid",gap:"0.75rem"}}>
                {results.map(r=>(
                  <div key={r.id} style={{background:"#0d1525",border:`1px solid ${r.score>0.8?"#1D9E75":r.score>0.6?"#1e3a6e":"#2e1a1a"}`,borderRadius:10,padding:"1rem",display:"grid",gridTemplateColumns:"auto 1fr auto",gap:"1rem",alignItems:"center",cursor:"pointer",transition:"border-color 0.2s"}} onClick={()=>getAiAnalysis(r)}>
                    <div style={{textAlign:"center",minWidth:52}}>
                      <div style={{fontSize:22,fontWeight:800,color:r.score>0.8?"#1D9E75":r.score>0.6?"#378ADD":"#E24B4A"}}>{Math.round(r.score*100)}%</div>
                      <div style={{fontSize:9,color:"#4a6a9f",letterSpacing:1}}>MATCH</div>
                    </div>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <span style={{fontSize:15,fontWeight:700,color:"#e8f0ff"}}>{r.name}</span>
                        {r.hindi&&<span style={{fontSize:14,color:"#7a9abf"}}>{r.hindi}</span>}
                        <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:ROLE_BG[r.role],color:ROLE_COLORS[r.role],fontWeight:700}}>{r.role}</span>
                      </div>
                      <div style={{fontSize:11,color:"#4a6a9f",display:"flex",gap:"1rem",flexWrap:"wrap"}}>
                        <span>📋 {r.case}</span><span>🎂 {r.dob}</span><span>📍 {r.address}</span><span style={{color:"#3a5a8f"}}>ID: {r.id}</span>
                      </div>
                      <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                        {[["LV",r.matchDetails.levenshtein],["JW",r.matchDetails.jaroWinkler],["NG",r.matchDetails.ngram]].map(([k,v])=>(
                          <span key={k} style={{fontSize:10,padding:"1px 6px",background:"#080c18",border:"1px solid #1e3a6e",borderRadius:4,color:"#6a8abf"}}>{k}:{v}%</span>
                        ))}
                        {r.matchDetails.soundexMatch&&<span style={{fontSize:10,padding:"1px 6px",background:"#0d2e1a",border:"1px solid #1D9E75",borderRadius:4,color:"#1D9E75"}}>SOUNDEX✓</span>}
                        {r.matchDetails.metaphoneMatch&&<span style={{fontSize:10,padding:"1px 6px",background:"#0d1e3e",border:"1px solid #378ADD",borderRadius:4,color:"#378ADD"}}>PHONETIC✓</span>}
                      </div>
                    </div>
                    <div style={{fontSize:10,color:"#4a5a7f",textAlign:"right"}}>
                      <div style={{color:"#378ADD",marginBottom:2}}>Click for AI Analysis →</div>
                      <div style={{height:4,width:60,background:"#1e2a4e",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${Math.round(r.score*100)}%`,background:r.score>0.8?"#1D9E75":r.score>0.6?"#378ADD":"#E24B4A",transition:"width 0.5s"}}></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searched && results.length===0 && (
              <div style={{textAlign:"center",padding:"3rem",color:"#4a5a7f",border:"1px dashed #1e2a4e",borderRadius:10}}>
                <div style={{fontSize:32,marginBottom:8}}>🔍</div>
                <div style={{fontSize:14}}>No records match above {Math.round(threshold*100)}% threshold.</div>
                <div style={{fontSize:11,marginTop:4}}>Try lowering the threshold or checking spelling variations.</div>
              </div>
            )}

            {/* AI Analysis Panel */}
            {selectedRecord && (
              <div style={{marginTop:"1rem",background:"#080c18",border:"1px solid #1e3a6e",borderRadius:10,padding:"1rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"0.75rem"}}>
                  <span style={{fontSize:11,color:"#378ADD",fontWeight:700,letterSpacing:1}}>⚡ AI ANALYSIS — {selectedRecord.name}</span>
                  {aiLoading&&<span style={{fontSize:10,color:"#4a6a9f",animation:"pulse 1s infinite"}}>Analyzing...</span>}
                </div>
                {aiLoading ? (
                  <div style={{color:"#4a6a9f",fontSize:12}}>Consulting AI for match analysis...</div>
                ) : (
                  <div style={{fontSize:12,lineHeight:1.8,color:"#a0b8d8",whiteSpace:"pre-wrap"}}>{aiAnalysis}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* DATABASE TAB */}
        {tab==="Database" && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"0.75rem",marginBottom:"1.25rem"}}>
              {[["Total",stats.total,"#378ADD"],["Suspects",stats.suspects,"#E24B4A"],["Witnesses",stats.witnesses,"#378ADD"],["Victims",stats.victims,"#BA7517"],["Reporters",stats.reporters,"#1D9E75"]].map(([l,v,c])=>(
                <div key={l} style={{background:"#0d1525",border:`1px solid ${c}33`,borderRadius:8,padding:"0.75rem",textAlign:"center"}}>
                  <div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div>
                  <div style={{fontSize:10,color:"#6a8abf",letterSpacing:1}}>{l.toUpperCase()}</div>
                </div>
              ))}
            </div>

            {/* Add Record */}
            <div style={{background:"#0d1525",border:"1px solid #1e3a6e",borderRadius:10,padding:"1rem",marginBottom:"1rem"}}>
              <div style={{fontSize:11,color:"#378ADD",fontWeight:700,letterSpacing:1,marginBottom:"0.75rem"}}>+ ADD NEW RECORD</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.75rem",marginBottom:"0.75rem"}}>
                {[["name","Full Name (English)*"],["hindi","Hindi Name (optional)"],["case","Case ID*"]].map(([k,p])=>(
                  <input key={k} value={addName[k]} onChange={e=>setAddName(prev=>({...prev,[k]:e.target.value}))} placeholder={p} style={{background:"#080c18",border:"1px solid #1e3a6e",borderRadius:6,padding:"8px 10px",color:"#c8d6f0",fontSize:12,fontFamily:"inherit",outline:"none"}} />
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.75rem",marginBottom:"0.75rem"}}>
                <select value={addName.role} onChange={e=>setAddName(prev=>({...prev,role:e.target.value}))} style={{background:"#080c18",border:"1px solid #1e3a6e",borderRadius:6,padding:"8px 10px",color:"#c8d6f0",fontSize:12,fontFamily:"inherit",outline:"none"}}>
                  {["Suspect","Witness","Victim","Reporter"].map(r=><option key={r}>{r}</option>)}
                </select>
                <input value={addName.dob} onChange={e=>setAddName(prev=>({...prev,dob:e.target.value}))} placeholder="DOB (YYYY-MM-DD)" type="date" style={{background:"#080c18",border:"1px solid #1e3a6e",borderRadius:6,padding:"8px 10px",color:"#c8d6f0",fontSize:12,fontFamily:"inherit",outline:"none"}} />
                <input value={addName.address} onChange={e=>setAddName(prev=>({...prev,address:e.target.value}))} placeholder="Address" style={{background:"#080c18",border:"1px solid #1e3a6e",borderRadius:6,padding:"8px 10px",color:"#c8d6f0",fontSize:12,fontFamily:"inherit",outline:"none"}} />
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
                <button onClick={handleAddRecord} style={{padding:"8px 20px",background:"#0d2e1a",border:"1px solid #1D9E75",borderRadius:6,color:"#1D9E75",cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:700,letterSpacing:1}}>ADD RECORD</button>
                {addMsg&&<span style={{fontSize:11,color:addMsg.includes("success")?"#1D9E75":"#E24B4A"}}>{addMsg}</span>}
              </div>
            </div>

            {/* Table */}
            <div style={{overflowX:"auto",background:"#0d1525",border:"1px solid #1e3a6e",borderRadius:10}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:"#080c18"}}>
                    {["ID","Name","Hindi","Role","Case","DOB","Address"].map(h=>(
                      <th key={h} style={{padding:"10px 12px",textAlign:"left",color:"#6a8abf",fontWeight:700,letterSpacing:1,borderBottom:"1px solid #1e2a4e"}}>{h.toUpperCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dbRecords.map((r,i)=>(
                    <tr key={r.id} style={{background:i%2===0?"transparent":"#080c180a",borderBottom:"1px solid #1e2a4e11"}}>
                      <td style={{padding:"8px 12px",color:"#4a6a9f"}}>{r.id}</td>
                      <td style={{padding:"8px 12px",color:"#c8d6f0",fontWeight:500}}>{r.name}</td>
                      <td style={{padding:"8px 12px",color:"#7a9abf",fontSize:13}}>{r.hindi||"—"}</td>
                      <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:ROLE_BG[r.role],color:ROLE_COLORS[r.role],fontWeight:700}}>{r.role}</span></td>
                      <td style={{padding:"8px 12px",color:"#4a6a9f"}}>{r.case}</td>
                      <td style={{padding:"8px 12px",color:"#4a6a9f"}}>{r.dob||"—"}</td>
                      <td style={{padding:"8px 12px",color:"#4a6a9f",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.address||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ANALYTICS TAB */}
        {tab==="Analytics" && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"1rem"}}>
              <div style={{background:"#0d1525",border:"1px solid #1e3a6e",borderRadius:10,padding:"1.25rem"}}>
                <div style={{fontSize:11,color:"#6a8abf",letterSpacing:1,marginBottom:"1rem"}}>ALGORITHM PERFORMANCE COMPARISON</div>
                {[["Jaro-Winkler","Best for names with prefix variations",92,"#378ADD"],["Levenshtein","Edit-distance based, handles typos",85,"#1D9E75"],["N-gram","Substring matches, transliteration",78,"#7F77DD"],["Soundex","Phonetic grouping for Indian names",71,"#BA7517"],["Metaphone","Deep phonetic similarity",68,"#D4537E"]].map(([a,d,v,c])=>(
                  <div key={a} style={{marginBottom:"0.75rem"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:12,color:"#c8d6f0",fontWeight:500}}>{a}</span>
                      <span style={{fontSize:12,color:c,fontWeight:700}}>{v}%</span>
                    </div>
                    <div style={{fontSize:10,color:"#4a6a9f",marginBottom:4}}>{d}</div>
                    <div style={{height:4,background:"#1e2a4e",borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${v}%`,background:c,borderRadius:2,transition:"width 1s"}}></div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{background:"#0d1525",border:"1px solid #1e3a6e",borderRadius:10,padding:"1.25rem"}}>
                <div style={{fontSize:11,color:"#6a8abf",letterSpacing:1,marginBottom:"1rem"}}>COMMON HINDI NAME VARIATIONS</div>
                {[["Suresh","Sursh, Suresha, Sureshh",82],["Kumar","Kumaar, Kumarr, Kumr",78],["Sharma","Sharmaa, Sherma, Sarma",75],["Rajesh","Rajeesh, Rajesh, Rajsh",71],["Priya","Priyaa, Preya, Priya",68],["Singh","Singhh, Sing, Singo",65]].map(([n,v,c])=>(
                  <div key={n} style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"6px 0",borderBottom:"1px solid #1e2a4e"}}>
                    <span style={{fontWeight:700,color:"#e8f0ff",minWidth:60,fontSize:12}}>{n}</span>
                    <span style={{fontSize:10,color:"#4a6a9f",flex:1}}>{v}</span>
                    <div style={{width:40,height:4,background:"#1e2a4e",borderRadius:2}}><div style={{height:"100%",width:`${c}%`,background:"#378ADD",borderRadius:2}}></div></div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{background:"#0d1525",border:"1px solid #1e3a6e",borderRadius:10,padding:"1.25rem"}}>
              <div style={{fontSize:11,color:"#6a8abf",letterSpacing:1,marginBottom:"1rem"}}>TRANSLITERATION EXAMPLES</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0.75rem"}}>
                {[["सुरेश","Suresh","Sursh, Suresha"],["राजेश","Rajesh","Rajeesh, Rajsh"],["प्रिया","Priya","Preya, Priyaa"],["कुमार","Kumar","Kumaar, Kumr"],["शर्मा","Sharma","Sarma, Sharmaa"],["विक्रम","Vikram","Vikram, Vikrum"]].map(([h,e,v])=>(
                  <div key={h} style={{background:"#080c18",border:"1px solid #1e2a4e",borderRadius:8,padding:"0.75rem"}}>
                    <div style={{fontSize:20,color:"#7a9abf",marginBottom:4}}>{h}</div>
                    <div style={{fontSize:13,color:"#e8f0ff",fontWeight:700}}>{e}</div>
                    <div style={{fontSize:10,color:"#4a6a9f",marginTop:3}}>→ {v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* GUIDELINES TAB */}
        {tab==="Guidelines" && (
          <div style={{display:"grid",gap:"1rem"}}>
            {[
              {icon:"📝",title:"Data Entry Standards",color:"#378ADD",items:["Always enter names in both English and Devanagari script when available","Follow standard ITRANS transliteration: श=sh, ष=sh, स=s, ज=j, झ=jh","For aspirated consonants: ख=kh, घ=gh, छ=chh, झ=jh, ठ=th, ढ=dh, फ=ph, भ=bh","Double-check vowel lengths: अ=a, आ=aa, इ=i, ई=ee, उ=u, ऊ=oo","Record full name as per official ID documents when available"]},
              {icon:"🔍",title:"Search Best Practices",color:"#1D9E75",items:["Try both English and Hindi script when searching for a name","Use lower threshold (30-40%) for broader searches in investigations","Use higher threshold (70%+) for confirmation and verification searches","If exact match not found, check phonetically similar spellings","Search by first name alone if full name search yields no results"]},
              {icon:"⚠️",title:"Common Transliteration Mistakes",color:"#BA7517",items:["'aa' and 'a' are often interchanged (Kumar/Kumaar)","'sh' can represent both श and ष","'ph' is used for फ — do not confuse with the 'f' sound","Aspirated consonants are often written without 'h' suffix","Schwa deletion: Suresh vs Sursh (vowel dropped at word end)"]},
              {icon:"🔄",title:"Script Interoperability",color:"#7F77DD",items:["Always attempt both script searches before concluding no match","Use the Hindi input field for Devanagari searches — system auto-transliterates","Cross-reference Hindi records with English transliterations","Request Hindi spelling from witnesses/informants for verification","Use AI Analysis feature to understand why a name matched"]},
            ].map(({icon,title,color,items})=>(
              <div key={title} style={{background:"#0d1525",border:`1px solid ${color}33`,borderRadius:10,padding:"1.25rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"0.75rem"}}>
                  <span style={{fontSize:18}}>{icon}</span>
                  <span style={{fontSize:13,fontWeight:700,color,letterSpacing:1}}>{title.toUpperCase()}</span>
                </div>
                <div style={{display:"grid",gap:6}}>
                  {items.map((item,i)=>(
                    <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      <span style={{color,fontSize:10,marginTop:3,flexShrink:0}}>▸</span>
                      <span style={{fontSize:12,color:"#a0b8d8",lineHeight:1.6}}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        input::placeholder{color:#4a5a7f;}
        input:focus{border-color:#378ADD!important;box-shadow:0 0 0 2px #378ADD22;}
        select:focus{border-color:#378ADD!important;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        ::-webkit-scrollbar{width:6px;height:6px;}
        ::-webkit-scrollbar-track{background:#080c18;}
        ::-webkit-scrollbar-thumb{background:#1e3a6e;border-radius:3px;}
      `}</style>
    </div>
  );
}
