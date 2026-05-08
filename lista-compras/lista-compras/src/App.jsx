import React, { useState, useEffect, useRef, useCallback } from 'react';


const CATS = [
  { id: "frutas",     label: "Frutas & Legumes", emoji: "🍎", color: "#43a047" },
  { id: "laticinios", label: "Laticínios",        emoji: "🥛", color: "#1e88e5" },
  { id: "carnes",     label: "Carnes & Aves",     emoji: "🥩", color: "#e53935" },
  { id: "padaria",    label: "Padaria",            emoji: "🍞", color: "#fb8c00" },
  { id: "limpeza",    label: "Limpeza",            emoji: "🧹", color: "#8e24aa" },
  { id: "bebidas",    label: "Bebidas",            emoji: "🥤", color: "#00acc1" },
  { id: "higiene",    label: "Higiene Pessoal",    emoji: "🧴", color: "#f06292" },
  { id: "pet",        label: "Pet Shop 🐾",        emoji: "🐶", color: "#ff8f00" },
  { id: "outros",     label: "Outros",             emoji: "📦", color: "#546e7a" },
];

function guessCategory(cats = "") {
  const c = cats.toLowerCase();
  if (/pet|dog|cat|racao|caes|gato|cachorro|animal|veterinar|coleira|petisco/.test(c)) return "pet";
  if (/bebida|drink|suco|agua|refri|cerveja|vinho/.test(c)) return "bebidas";
  if (/leite|queijo|iogurte|dairy|manteiga/.test(c)) return "laticinios";
  if (/carne|frango|peixe|meat|aves|presunto/.test(c)) return "carnes";
  if (/pao|bolo|biscoito|bread|padaria|bolacha/.test(c)) return "padaria";
  if (/fruta|legume|vegetal|fruit|verdura/.test(c)) return "frutas";
  if (/limpeza|deterg|sabao|amaciante/.test(c)) return "limpeza";
  if (/higiene|shampoo|sabonete|creme|dent/.test(c)) return "higiene";
  return "outros";
}

async function lookupBarcode(code) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
    const d = await r.json();
    if (d.status === 1 && d.product) {
      const p = d.product;
      return {
        name: p.product_name_pt || p.product_name || p.product_name_en || "Produto",
        brand: p.brands || "",
        image: p.image_thumb_url || null,
        category: guessCategory((p.categories || "") + " " + (p.labels || "")),
      };
    }
  } catch {}
  return null;
}

const fmt = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtTime = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2,"0")}min`
    : `${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`;
};

const ROOM_PREFIX  = "collab_room_v4_";
const MY_NAME_KEY  = "lc_name_v4";
const LAST_ROOM_KEY = "lc_last_room_v4";
const ACOLORS = ["#43a047","#e53935","#1e88e5","#fb8c00","#8e24aa","#00acc1","#f06292","#ff8f00"];
const avatarColor = (n) => ACOLORS[(n?.charCodeAt(0)||0) % ACOLORS.length];

export default function App() {
  const [screen, setScreen]     = useState("home");
  const [autoJoining, setAutoJoining] = useState(true);
  const [tab, setTab]           = useState("lista");
  const [nameInput, setNameInput] = useState("");
  const [myName, setMyName]     = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomItems, setRoomItems] = useState([]);
  const [members, setMembers]   = useState([]);
  const syncRef = useRef(null);

  const [itemName, setItemName] = useState("");
  const [itemCat, setItemCat]   = useState("outros");
  const [itemQty, setItemQty]   = useState("1");
  const [itemPrice, setItemPrice] = useState("");
  const [foundProd, setFoundProd] = useState(null);
  const [manualCode, setManualCode] = useState("");
  const [lookingUp, setLookingUp]  = useState(false);

  const [scanning, setScanning]   = useState(false);
  const [scanMsg, setScanMsg]     = useState("Aponte para o código de barras");
  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const scanningRef = useRef(false);

  // Timer
  const [timerState, setTimerState] = useState("idle");
  const [elapsed, setElapsed]       = useState(0);
  const [timerHistory, setTimerHistory] = useState([]);
  const timerRef  = useRef(null);
  const startedAt = useRef(null);
  const pausedSec = useRef(0);

  const [filterCat, setFilterCat]   = useState("all");
  const [toast, setToast]           = useState(null);
  const [showMembers, setShowMembers] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // item id being edited
  const [editPriceVal, setEditPriceVal] = useState("");
  const [editQtyVal, setEditQtyVal] = useState("");

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };
  useEffect(() => { if(myName) localStorage.setItem(MY_NAME_KEY, myName); }, [myName]);

  // Auto-rejoin last room on startup
  useEffect(() => {
    const autoRejoin = async () => {
      try {
        // Load saved name
        const savedName = localStorage.getItem(MY_NAME_KEY) || "";
        if (savedName) { setMyName(savedName); setNameInput(savedName); }

        // Load last room
        const lastRoom = localStorage.getItem(LAST_ROOM_KEY);
        if (lastRoom) {
          const { code, name } = JSON.parse(lastRoom);
          const raw = localStorage.getItem(`${ROOM_PREFIX}${code}`); const res = raw ? {value: raw} : null;
          if (res?.value) {
            const data = JSON.parse(res.value);
            const n = name || savedName;
            setMyName(n); setNameInput(n);
            setRoomCode(code);
            setRoomItems(data.items || []);
            setMembers(data.members || []);
            setScreen("room");
          }
        }
      } catch(e) { console.error(e); }
      setAutoJoining(false);
    };
    autoRejoin();
  }, []);
  useEffect(() => () => clearInterval(timerRef.current), []);

  // ── Timer ───────────────────────────────────────────────────────────────
  const startTimer = () => {
    startedAt.current = Date.now() - pausedSec.current * 1000;
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    setTimerState("running");
    notify("⏱️ Cronômetro iniciado! Boas compras!");
  };
  const pauseTimer = () => {
    clearInterval(timerRef.current);
    pausedSec.current = elapsed;
    setTimerState("paused");
  };
  const resumeTimer = () => {
    startedAt.current = Date.now() - pausedSec.current * 1000;
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    setTimerState("running");
  };
  const finishTimer = (items, checked, spent) => {
    clearInterval(timerRef.current);
    const record = { id: Date.now(), date: new Date().toLocaleDateString("pt-BR"), time: elapsed, items, checked, total: spent };
    setTimerHistory(h => [record, ...h.slice(0,9)]);
    setTimerState("done");
    notify(`🎉 Compras em ${fmtTime(elapsed)}!`);
  };
  const resetTimer = () => { clearInterval(timerRef.current); setElapsed(0); pausedSec.current = 0; setTimerState("idle"); };

  // ── Room ────────────────────────────────────────────────────────────────
  const loadRoom = useCallback(async (code) => {
    try {
      const raw = localStorage.getItem(`${ROOM_PREFIX}${code}`);
      if (raw) { const d = JSON.parse(raw); setRoomItems(d.items||[]); setMembers(d.members||[]); }
    } catch {}
  }, []);

  const saveRoom = useCallback(async (code, items, mems) => {
    try { localStorage.setItem(`${ROOM_PREFIX}${code}`, JSON.stringify({ items, members: mems, updatedAt: Date.now() })); } catch {}
  }, []);

  useEffect(() => {
    if (screen !== "room") return;
    loadRoom(roomCode);
    syncRef.current = setInterval(() => loadRoom(roomCode), 2000);
    return () => clearInterval(syncRef.current);
  }, [screen, roomCode, loadRoom]);

  const createRoom = async () => {
    if (!nameInput.trim()) { notify("Digite seu nome!"); return; }
    const code = Math.random().toString(36).slice(2,7).toUpperCase();
    const mems = [{ name: nameInput.trim(), color: avatarColor(nameInput.trim()) }];
    setMyName(nameInput.trim());
    await saveRoom(code, [], mems);
    setRoomCode(code); setRoomItems([]); setMembers(mems); setScreen("room");
    localStorage.setItem(LAST_ROOM_KEY, JSON.stringify({ code, name: nameInput.trim() }));
    notify(`Sala ${code} criada! 🎉`);
  };

  const joinRoom = async () => {
    if (!nameInput.trim()) { notify("Digite seu nome!"); return; }
    if (!joinCode.trim()) { notify("Digite o código!"); return; }
    const code = joinCode.trim().toUpperCase();
    try {
      const raw2 = localStorage.getItem(`${ROOM_PREFIX}${code}`);
      if (!raw2) { notify("Sala não encontrada!"); return; }
      const data = JSON.parse(raw2);
      const name = nameInput.trim();
      setMyName(name);
      const already = data.members?.some(m => m.name === name);
      const mems = already ? data.members : [...(data.members||[]), { name, color: avatarColor(name) }];
      await saveRoom(code, data.items||[], mems);
      setRoomCode(code); setRoomItems(data.items||[]); setMembers(mems); setScreen("room");
      localStorage.setItem(LAST_ROOM_KEY, JSON.stringify({ code, name: nameInput.trim() }));
      notify(`Entrou na sala ${code}! 🎉`);
    } catch { notify("Erro ao entrar."); }
  };

  // ── Items ───────────────────────────────────────────────────────────────
  const addItem = async () => {
    if (!itemName.trim()) return;
    const item = { id: Date.now()+Math.random(), name: itemName.trim(), cat: itemCat, qty: itemQty||"1", price: itemPrice ? parseFloat(itemPrice.replace(",",".")) : null, checked: false, checkedBy: null, addedBy: myName, image: foundProd?.image||null, brand: foundProd?.brand||"" };
    const updated = [...roomItems, item];
    setRoomItems(updated); await saveRoom(roomCode, updated, members);
    setItemName(""); setItemQty("1"); setItemPrice(""); setFoundProd(null);
    notify("Item adicionado ✓");
  };

  const toggleItem = async (id) => {
    const updated = roomItems.map(i => i.id===id ? {...i, checked:!i.checked, checkedBy:!i.checked?myName:null} : i);
    setRoomItems(updated); await saveRoom(roomCode, updated, members);
  };

  const removeItem = async (id) => {
    const updated = roomItems.filter(i => i.id!==id);
    setRoomItems(updated); await saveRoom(roomCode, updated, members);
  };

  const clearChecked = async () => {
    const updated = roomItems.filter(i => !i.checked);
    setRoomItems(updated); await saveRoom(roomCode, updated, members);
    notify("Itens comprados removidos");
  };

  const updateItem = async (id, newPrice, newQty) => {
    const price = newPrice ? parseFloat(String(newPrice).replace(",",".")) : null;
    const qty = newQty || "1";
    const updated = roomItems.map(i => i.id===id ? {...i, price, qty} : i);
    setRoomItems(updated); await saveRoom(roomCode, updated, members);
    notify("Item atualizado! ✓");
  };

  // ── Scanner ─────────────────────────────────────────────────────────────
  const startScan = async () => {
    setScanMsg("Iniciando câmera..."); setScanning(true); scanningRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      if ("BarcodeDetector" in window) {
        const det = new window.BarcodeDetector({ formats: ["ean_13","ean_8","code_128","upc_a","upc_e"] });
        setScanMsg("Aponte para o código de barras");
        const loop = async () => {
          if (!scanningRef.current) return;
          try {
            const codes = await det.detect(videoRef.current);
            if (codes.length > 0) {
              const code = codes[0].rawValue; stopScan();
              setLookingUp(true);
              const prod = await lookupBarcode(code);
              setLookingUp(false);
              if (prod) { setFoundProd(prod); setItemName(prod.name+(prod.brand?` – ${prod.brand}`:"")); setItemCat(prod.category); notify("Produto encontrado! ✓"); }
              else { setItemName(code); notify("Produto não encontrado. Edite o nome."); }
              return;
            }
          } catch {}
          if (scanningRef.current) setTimeout(loop, 300);
        };
        loop();
      } else { setScanMsg("Scanner não disponível. Use o campo de código manual."); }
    } catch { setScanMsg("Câmera não acessível. Verifique as permissões."); }
  };

  const stopScan = () => { scanningRef.current=false; streamRef.current?.getTracks().forEach(t=>t.stop()); setScanning(false); };

  const lookupManual = async () => {
    if (!manualCode.trim()) return;
    setLookingUp(true);
    const prod = await lookupBarcode(manualCode.trim());
    setLookingUp(false);
    if (prod) { setFoundProd(prod); setItemName(prod.name+(prod.brand?` – ${prod.brand}`:"")); setItemCat(prod.category); notify("Produto encontrado! ✓"); }
    else notify("Produto não encontrado.");
    setManualCode("");
  };

  // ── Computed ─────────────────────────────────────────────────────────────
  const displayed    = filterCat==="all" ? roomItems : roomItems.filter(i=>i.cat===filterCat);
  const grouped      = CATS.map(c=>({...c, items:displayed.filter(i=>i.cat===c.id)})).filter(g=>g.items.length>0);
  const checkedCount = roomItems.filter(i=>i.checked).length;
  const grandTotal   = roomItems.reduce((s,i)=>s+(i.price?i.price*parseFloat(i.qty||1):0),0);
  const spentTotal   = roomItems.reduce((s,i)=>s+(i.checked&&i.price?i.price*parseFloat(i.qty||1):0),0);
  const petItems     = roomItems.filter(i=>i.cat==="pet");
  const timerColor   = timerState==="running"?"#43a047":timerState==="paused"?"#fb8c00":timerState==="done"?"#1e88e5":"#90a4ae";

  // ════════════════════════════════════════════════════════════════════════
  //  HOME
  // ════════════════════════════════════════════════════════════════════════
  if (autoJoining) return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=swap');body{margin:0;font-family:'Nunito',sans-serif;}`}</style>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(160deg,#e8f5e9,#f0f4f0)",gap:16}}>
        <div style={{fontSize:52}}>🛒</div>
        <div style={{fontSize:18,fontWeight:800,color:"#2e7d32"}}>Carregando sua lista...</div>
      </div>
    </>
  );

  if (screen === "home") return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:#f0f4f0;font-family:'Nunito',sans-serif;}input:focus,select:focus{border-color:#43a047!important;outline:none;}button:active{opacity:.85;transform:scale(.98);}`}</style>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,background:"linear-gradient(160deg,#e8f5e9 0%,#f0f4f0 60%)"}}>
        <div style={{fontSize:62,marginBottom:6}}>🛒</div>
        <h1 style={{fontSize:30,fontWeight:900,color:"#1b5e20",letterSpacing:-1}}>Lista Colaborativa</h1>
        <p style={{color:"#999",fontSize:14,marginBottom:28,marginTop:4}}>Compre junto, em tempo real 🐾⏱️</p>

        <div style={{width:"100%",maxWidth:380,background:"#fff",borderRadius:20,padding:20,boxShadow:"0 2px 20px rgba(0,0,0,.07)",marginBottom:14}}>
          <p style={{fontSize:11,fontWeight:800,color:"#aaa",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Seu nome</p>
          <input style={{width:"100%",border:"1.5px solid #e0e0e0",borderRadius:12,padding:"12px 14px",fontSize:15,fontFamily:"inherit"}} placeholder="Como te chamamos? Ex: Liliane" value={nameInput} onChange={e=>setNameInput(e.target.value)} />
        </div>

        <div style={{width:"100%",maxWidth:380,background:"#fff",borderRadius:20,padding:20,boxShadow:"0 2px 20px rgba(0,0,0,.07)",marginBottom:14}}>
          <p style={{fontSize:11,fontWeight:800,color:"#aaa",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Criar nova lista</p>
          <button onClick={createRoom} style={{width:"100%",background:"linear-gradient(135deg,#2e7d32,#43a047)",color:"#fff",border:"none",borderRadius:12,padding:14,fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>✨ Criar lista</button>
        </div>

        <div style={{width:"100%",maxWidth:380,background:"#fff",borderRadius:20,padding:20,boxShadow:"0 2px 20px rgba(0,0,0,.07)"}}>
          <p style={{fontSize:11,fontWeight:800,color:"#aaa",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Entrar em lista existente</p>
          <input style={{width:"100%",border:"1.5px solid #e0e0e0",borderRadius:12,padding:"12px 14px",fontSize:15,fontFamily:"inherit",marginBottom:8,textTransform:"uppercase",letterSpacing:2}} placeholder="Código da sala (ex: ABC12)" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&joinRoom()} />
          <button onClick={joinRoom} style={{width:"100%",background:"#fff",color:"#2e7d32",border:"2px solid #c8e6c9",borderRadius:12,padding:13,fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>🔗 Entrar na sala</button>
        </div>

        {toast && <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:"#1b5e20",color:"#fff",padding:"11px 22px",borderRadius:24,fontSize:14,fontWeight:700,zIndex:200,boxShadow:"0 4px 20px rgba(0,0,0,.2)",whiteSpace:"nowrap"}}>{toast}</div>}
      </div>
    </>
  );

  // ════════════════════════════════════════════════════════════════════════
  //  ROOM
  // ════════════════════════════════════════════════════════════════════════
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#f0f4f0;font-family:'Nunito',sans-serif;}
        input:focus,select:focus{border-color:#43a047!important;outline:none;}
        button:active{opacity:.85;}
        @keyframes scanPulse{0%,100%{opacity:.3}50%{opacity:1}}
        @keyframes timerPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .fadeUp{animation:fadeUp .3s ease;}
        .item-row:last-child{border-bottom:none!important;}
      `}</style>

      <div style={{fontFamily:"'Nunito',sans-serif",background:"#f0f4f0",minHeight:"100vh",maxWidth:500,margin:"0 auto",paddingBottom:40}}>

        {/* HEADER */}
        <div style={{background:"linear-gradient(135deg,#1b5e20 0%,#388e3c 100%)",padding:"18px 16px 14px",color:"#fff"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <h1 style={{fontSize:20,fontWeight:900,letterSpacing:-.5}}>🛒 Lista de Compras</h1>
              <p style={{fontSize:12,opacity:.8,marginTop:2}}>{checkedCount}/{roomItems.length} itens · {myName}</p>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{background:"rgba(255,255,255,.2)",borderRadius:10,padding:"5px 12px",fontSize:13,fontWeight:900,letterSpacing:1.5}}>{roomCode}</div>
              <div style={{fontSize:11,opacity:.7,marginTop:3,cursor:"pointer"}} onClick={()=>setShowMembers(v=>!v)}>👥 {members.length} pessoa{members.length!==1?"s":""}</div>
            </div>
          </div>

          {showMembers && (
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}} className="fadeUp">
              {members.map(m=>(
                <div key={m.name} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,.15)",borderRadius:20,padding:"4px 10px",fontSize:12,fontWeight:700}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:m.color||"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:900}}>{m.name?.[0]?.toUpperCase()}</div>
                  {m.name}{m.name===myName&&" (você)"}
                </div>
              ))}
            </div>
          )}

          <div style={{display:"flex",gap:8,marginTop:12}}>
            {[["💰",fmt(grandTotal),"Total estimado"],["🛒",fmt(spentTotal),"No carrinho"]].map(([ic,v,l])=>(
              <div key={l} style={{flex:1,background:"rgba(255,255,255,.15)",borderRadius:12,padding:"10px 12px"}}>
                <div style={{fontSize:17,fontWeight:900}}>{ic} {v}</div>
                <div style={{fontSize:10,opacity:.8,marginTop:1}}>{l}</div>
              </div>
            ))}
            {timerState!=="idle" && (
              <div style={{flex:1,background:"rgba(255,255,255,.15)",borderRadius:12,padding:"10px 12px",animation:timerState==="running"?"timerPulse 2s ease-in-out infinite":"none"}}>
                <div style={{fontSize:17,fontWeight:900}}>⏱️ {fmtTime(elapsed)}</div>
                <div style={{fontSize:10,opacity:.8,marginTop:1}}>{timerState==="running"?"Cronômetro":timerState==="paused"?"Pausado":"Finalizado"}</div>
              </div>
            )}
          </div>

          {roomItems.length>0 && (
            <div style={{height:5,background:"rgba(255,255,255,.2)",borderRadius:10,marginTop:12,overflow:"hidden"}}>
              <div style={{height:"100%",background:"#fff",borderRadius:10,width:`${(checkedCount/roomItems.length)*100}%`,transition:"width .4s ease"}}/>
            </div>
          )}
        </div>

        {/* TABS */}
        <div style={{display:"flex",background:"#fff",borderBottom:"2px solid #f0f0f0"}}>
          {[["lista","🛒 Lista"],["timer","⏱️ Tempo"],["membros","👥 Membros"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"12px 0",border:"none",background:"none",cursor:"pointer",fontSize:12,fontWeight:800,color:tab===t?"#2e7d32":"#aaa",borderBottom:tab===t?"2.5px solid #2e7d32":"2.5px solid transparent",fontFamily:"inherit"}}>{l}</button>
          ))}
        </div>

        {/* ── TAB LISTA ── */}
        {tab==="lista" && (
          <div style={{padding:"14px 14px 0"}}>

            {petItems.length>0 && (
              <div style={{background:"linear-gradient(135deg,#fff8e1,#ffecb3)",border:"1.5px solid #ffe082",borderRadius:14,padding:"11px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}} className="fadeUp">
                <span style={{fontSize:28}}>🐶</span>
                <div>
                  <div style={{fontWeight:800,fontSize:13,color:"#e65100"}}>Para o bichinho 🐾</div>
                  <div style={{fontSize:12,color:"#bf360c"}}>{petItems.length} item(ns) · {fmt(petItems.reduce((s,i)=>s+(i.price||0)*parseFloat(i.qty||1),0))}</div>
                </div>
              </div>
            )}

            {/* Add card */}
            <div style={{background:"#fff",borderRadius:16,padding:16,marginBottom:12,boxShadow:"0 1px 8px rgba(0,0,0,.05)"}}>
              <p style={{fontSize:11,fontWeight:800,color:"#aaa",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Adicionar item</p>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <button onClick={startScan} style={{display:"flex",alignItems:"center",gap:6,background:"#e8f5e9",color:"#2e7d32",border:"2px solid #c8e6c9",borderRadius:10,padding:"9px 12px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>📷 Escanear</button>
                <input style={{flex:1,border:"1.5px solid #e0e0e0",borderRadius:10,padding:"9px 12px",fontSize:13,fontFamily:"inherit"}} placeholder="Código de barras..." value={manualCode} onChange={e=>setManualCode(e.target.value)} onKeyDown={e=>e.key==="Enter"&&lookupManual()} />
                <button onClick={lookupManual} disabled={lookingUp} style={{background:"#f5f5f5",border:"none",borderRadius:10,padding:"9px 12px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{lookingUp?"⏳":"🔍"}</button>
              </div>

              {foundProd && (
                <div style={{background:"#f1f8e9",border:"1.5px solid #c8e6c9",borderRadius:12,padding:10,marginBottom:10,display:"flex",gap:10,alignItems:"center"}} className="fadeUp">
                  {foundProd.image && <img src={foundProd.image} style={{width:44,height:44,objectFit:"contain",borderRadius:8,background:"#fff",flexShrink:0}} alt=""/>}
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:13}}>{foundProd.name}</div>
                    {foundProd.brand && <div style={{fontSize:12,color:"#777"}}>{foundProd.brand}</div>}
                    <div style={{fontSize:11,color:"#43a047",marginTop:2}}>✓ Produto identificado</div>
                  </div>
                  <button onClick={()=>setFoundProd(null)} style={{background:"none",border:"none",color:"#bbb",fontSize:18,cursor:"pointer"}}>✕</button>
                </div>
              )}

              <input style={{width:"100%",border:"1.5px solid #e0e0e0",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"inherit",marginBottom:8}} placeholder="Nome do produto..." value={itemName} onChange={e=>setItemName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()} />

              <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                <input style={{width:64,border:"1.5px solid #e0e0e0",borderRadius:10,padding:"10px 8px",fontSize:14,fontFamily:"inherit",textAlign:"center"}} placeholder="Qtd" value={itemQty} onChange={e=>setItemQty(e.target.value)} type="number" min="1" />
                <input style={{width:96,border:"1.5px solid #e0e0e0",borderRadius:10,padding:"10px 8px",fontSize:14,fontFamily:"inherit",textAlign:"center"}} placeholder="R$ preço" value={itemPrice} onChange={e=>setItemPrice(e.target.value)} />
                <select style={{flex:1,border:"1.5px solid #e0e0e0",borderRadius:10,padding:"10px 8px",fontSize:13,fontFamily:"inherit",background:"#fff"}} value={itemCat} onChange={e=>setItemCat(e.target.value)}>
                  {CATS.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
              </div>
              <button onClick={addItem} style={{width:"100%",background:"linear-gradient(135deg,#2e7d32,#43a047)",color:"#fff",border:"none",borderRadius:12,padding:12,fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>+ Adicionar à lista</button>
            </div>

            {/* Filters */}
            {roomItems.length>0 && (
              <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,marginBottom:8}}>
                <button onClick={()=>setFilterCat("all")} style={{whiteSpace:"nowrap",border:"none",borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",background:filterCat==="all"?"#2e7d32":"#fff",color:filterCat==="all"?"#fff":"#555"}}>Todos ({roomItems.length})</button>
                {CATS.filter(c=>roomItems.some(i=>i.cat===c.id)).map(c=>(
                  <button key={c.id} onClick={()=>setFilterCat(c.id)} style={{whiteSpace:"nowrap",border:"none",borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",background:filterCat===c.id?c.color:"#fff",color:filterCat===c.id?"#fff":"#555"}}>
                    {c.emoji} {roomItems.filter(i=>i.cat===c.id).length}
                  </button>
                ))}
              </div>
            )}

            {grouped.length===0 && (
              <div style={{textAlign:"center",color:"#ccc",padding:"48px 0"}}>
                <div style={{fontSize:52,marginBottom:10}}>🛒</div>
                <div style={{fontSize:15}}>Lista vazia — adicione itens acima!</div>
              </div>
            )}

            {grouped.map(g=>(
              <div key={g.id} style={{background:"#fff",borderRadius:16,padding:"12px 14px",marginBottom:12,boxShadow:"0 1px 8px rgba(0,0,0,.05)"}} className="fadeUp">
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,paddingBottom:8,borderBottom:"1.5px solid #f5f5f5"}}>
                  <span style={{fontSize:20}}>{g.emoji}</span>
                  <span style={{fontWeight:900,fontSize:13,color:g.color}}>{g.label}</span>
                  <span style={{marginLeft:"auto",fontSize:12,fontWeight:800,color:"#aaa"}}>{g.items.some(i=>i.price)&&fmt(g.items.reduce((s,i)=>s+(i.price||0)*parseFloat(i.qty||1),0))}</span>
                </div>
                {g.items.map((item,idx)=>(
                  <div key={item.id} className="item-row" style={{borderBottom:"1px solid #f5f5f5"}}>
                    {/* Main row */}
                    <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",opacity:item.checked?.55:1,transition:"opacity .2s"}}>
                      <div onClick={()=>toggleItem(item.id)} style={{width:26,height:26,borderRadius:7,border:item.checked?"2px solid #2e7d32":"2px solid #ddd",background:item.checked?"#2e7d32":"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,color:"#fff",fontSize:14,transition:"all .15s"}}>
                        {item.checked&&"✓"}
                      </div>
                      {item.image&&<img src={item.image} style={{width:32,height:32,objectFit:"contain",borderRadius:6,flexShrink:0}} alt=""/>}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:700,textDecoration:item.checked?"line-through":"none",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.name}</div>
                        <div style={{fontSize:11,color:"#aaa",marginTop:1}}>
                          Qtd: <b style={{color:"#555"}}>{item.qty}</b>
                          {item.price && <span style={{color:"#2e7d32",fontWeight:700}}> · {fmt(item.price)}/un</span>}
                          {item.addedBy && ` · ${item.addedBy}`}
                          {item.checkedBy&&<span style={{color:"#43a047"}}> · marcado por {item.checkedBy}</span>}
                        </div>
                      </div>
                      {/* Total price badge */}
                      {item.price && (
                        <div style={{background:"#f1f8e9",color:"#2e7d32",borderRadius:8,padding:"3px 8px",fontSize:13,fontWeight:800,flexShrink:0}}>
                          {fmt(item.price*parseFloat(item.qty||1))}
                        </div>
                      )}
                      {/* EDIT BUTTON - always visible */}
                      <button
                        onClick={()=>{ setEditingItem(editingItem===item.id?null:item.id); setEditPriceVal(item.price?String(item.price):""); setEditQtyVal(item.qty||"1"); }}
                        style={{background: editingItem===item.id?"#ff8f00":"#43a047", color:"#fff", border:"none", borderRadius:10, padding:"8px 12px", fontWeight:900, fontSize:13, cursor:"pointer", fontFamily:"inherit", flexShrink:0, minWidth:52, textAlign:"center", lineHeight:1.3}}
                      >
                        {editingItem===item.id ? "Fechar" : "Editar"}
                      </button>
                      <button onClick={()=>removeItem(item.id)} style={{background:"none",border:"none",color:"#ffb3b3",fontSize:18,cursor:"pointer",padding:"0 2px",flexShrink:0}}>✕</button>
                    </div>
                    {/* Edit panel */}
                    {editingItem===item.id && (
                      <div style={{background:"#fffde7",border:"2px solid #ffe082",borderRadius:12,padding:"12px",marginBottom:8}} className="fadeUp">
                        <div style={{fontSize:11,fontWeight:800,color:"#f57f17",textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Editar item</div>
                        <div style={{display:"flex",gap:8,marginBottom:8}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:11,color:"#aaa",fontWeight:700,marginBottom:4}}>QUANTIDADE</div>
                            <input
                              style={{width:"100%",border:"2px solid #ffe082",borderRadius:10,padding:"10px 12px",fontSize:16,fontFamily:"inherit",background:"#fff",textAlign:"center",fontWeight:800}}
                              value={editQtyVal}
                              onChange={e=>setEditQtyVal(e.target.value)}
                              type="number"
                              min="1"
                              placeholder="Qtd"
                            />
                          </div>
                          <div style={{flex:2}}>
                            <div style={{fontSize:11,color:"#aaa",fontWeight:700,marginBottom:4}}>PRECO (R$)</div>
                            <input
                              autoFocus
                              style={{width:"100%",border:"2px solid #ffe082",borderRadius:10,padding:"10px 12px",fontSize:16,fontFamily:"inherit",background:"#fff",fontWeight:800}}
                              value={editPriceVal}
                              onChange={e=>setEditPriceVal(e.target.value)}
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Ex: 12.90"
                            />
                          </div>
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button
                            onClick={()=>{ updateItem(item.id,editPriceVal,editQtyVal); setEditingItem(null); }}
                            style={{flex:1,background:"linear-gradient(135deg,#e65100,#ff8f00)",color:"#fff",border:"none",borderRadius:10,padding:"11px",fontWeight:900,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}
                          >Salvar</button>
                          <button
                            onClick={()=>setEditingItem(null)}
                            style={{background:"#f5f5f5",color:"#888",border:"none",borderRadius:10,padding:"11px 16px",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}
                          >Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {roomItems.length>0 && (
              <div style={{background:"linear-gradient(135deg,#1b5e20,#2e7d32)",color:"#fff",borderRadius:16,padding:"14px 16px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div><div style={{fontSize:22,fontWeight:900}}>{fmt(grandTotal)}</div><div style={{fontSize:11,opacity:.8}}>Total estimado</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:800}}>{fmt(spentTotal)}</div><div style={{fontSize:11,opacity:.8}}>No carrinho</div></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  {checkedCount>0&&<button onClick={clearChecked} style={{flex:1,background:"rgba(255,255,255,.2)",color:"#fff",border:"none",borderRadius:10,padding:"9px",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>🗑️ Limpar comprados</button>}
                  <button onClick={()=>setTab("timer")} style={{flex:1,background:"rgba(255,255,255,.2)",color:"#fff",border:"none",borderRadius:10,padding:"9px",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>⏱️ Cronômetro</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB TIMER ── */}
        {tab==="timer" && (
          <div style={{padding:"20px 16px 0"}}>
            <div style={{background:"#fff",borderRadius:20,padding:28,textAlign:"center",boxShadow:"0 2px 16px rgba(0,0,0,.07)",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:800,color:"#aaa",textTransform:"uppercase",letterSpacing:.8,marginBottom:18}}>Cronômetro de Compras</div>
              <div style={{fontSize:64,fontWeight:900,color:timerColor,letterSpacing:-2,fontVariantNumeric:"tabular-nums",transition:"color .3s",animation:timerState==="running"?"timerPulse 2s ease-in-out infinite":"none",lineHeight:1}}>
                {fmtTime(elapsed)}
              </div>
              <div style={{fontSize:13,color:"#aaa",marginTop:8,marginBottom:26,minHeight:20}}>
                {timerState==="idle"&&"Toque em Iniciar quando chegar ao mercado!"}
                {timerState==="running"&&"🛒 Fazendo compras... vai que vai!"}
                {timerState==="paused"&&"⏸️ Pausado — retome quando quiser"}
                {timerState==="done"&&`🎉 Compras finalizadas em ${fmtTime(elapsed)}!`}
              </div>
              <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                {timerState==="idle"&&<button onClick={startTimer} style={{background:"linear-gradient(135deg,#2e7d32,#43a047)",color:"#fff",border:"none",borderRadius:14,padding:"14px 36px",fontWeight:900,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>▶ Iniciar</button>}
                {timerState==="running"&&<>
                  <button onClick={pauseTimer} style={{background:"#fff8e1",color:"#e65100",border:"2px solid #ffe082",borderRadius:14,padding:"12px 24px",fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>⏸ Pausar</button>
                  <button onClick={()=>finishTimer(roomItems.length,checkedCount,spentTotal)} style={{background:"linear-gradient(135deg,#1565c0,#1e88e5)",color:"#fff",border:"none",borderRadius:14,padding:"12px 24px",fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>✅ Finalizar</button>
                </>}
                {timerState==="paused"&&<>
                  <button onClick={resumeTimer} style={{background:"linear-gradient(135deg,#2e7d32,#43a047)",color:"#fff",border:"none",borderRadius:14,padding:"12px 24px",fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>▶ Continuar</button>
                  <button onClick={()=>finishTimer(roomItems.length,checkedCount,spentTotal)} style={{background:"linear-gradient(135deg,#1565c0,#1e88e5)",color:"#fff",border:"none",borderRadius:14,padding:"12px 24px",fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>✅ Finalizar</button>
                </>}
                {timerState==="done"&&<button onClick={resetTimer} style={{background:"#f5f5f5",color:"#555",border:"none",borderRadius:14,padding:"12px 30px",fontWeight:900,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>🔄 Novo cronômetro</button>}
              </div>
            </div>

            {timerState==="done"&&(
              <div style={{background:"linear-gradient(135deg,#1565c0,#1e88e5)",color:"#fff",borderRadius:16,padding:18,marginBottom:14}} className="fadeUp">
                <div style={{fontWeight:900,fontSize:15,marginBottom:12}}>📊 Resumo da compra</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[["⏱️ Tempo total",fmtTime(elapsed)],["🛒 Itens na lista",roomItems.length],["✅ Itens comprados",checkedCount],["💰 Total estimado",fmt(grandTotal)]].map(([l,v])=>(
                    <div key={l} style={{background:"rgba(255,255,255,.15)",borderRadius:12,padding:"10px 12px"}}>
                      <div style={{fontSize:11,opacity:.8}}>{l}</div>
                      <div style={{fontSize:18,fontWeight:900,marginTop:2}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {timerHistory.length>0&&(
              <div style={{background:"#fff",borderRadius:16,padding:16,boxShadow:"0 1px 8px rgba(0,0,0,.05)"}}>
                <p style={{fontSize:11,fontWeight:800,color:"#aaa",textTransform:"uppercase",letterSpacing:.8,marginBottom:12}}>Histórico de compras</p>
                {timerHistory.map((h,i)=>(
                  <div key={h.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<timerHistory.length-1?"1px solid #f5f5f5":"none"}}>
                    <div style={{fontSize:24}}>🛍️</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:800,fontSize:13}}>{h.date}</div>
                      <div style={{fontSize:11,color:"#aaa"}}>{h.checked}/{h.items} itens · {fmt(h.total)}</div>
                    </div>
                    <div style={{fontWeight:900,fontSize:16,color:"#2e7d32"}}>{fmtTime(h.time)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB MEMBROS ── */}
        {tab==="membros"&&(
          <div style={{padding:"16px 14px 0"}}>
            <div style={{background:"#fff",borderRadius:16,padding:16,boxShadow:"0 1px 8px rgba(0,0,0,.05)",marginBottom:12}}>
              <p style={{fontSize:11,fontWeight:800,color:"#aaa",textTransform:"uppercase",letterSpacing:.8,marginBottom:12}}>Código da sala</p>
              <div style={{background:"#f1f8e9",border:"2.5px dashed #c8e6c9",borderRadius:14,padding:20,textAlign:"center"}}>
                <div style={{fontSize:36,fontWeight:900,letterSpacing:6,color:"#2e7d32"}}>{roomCode}</div>
                <div style={{fontSize:12,color:"#888",marginTop:6}}>Compartilhe com quem vai ajudar nas compras 🛒</div>
              </div>
            </div>

            <div style={{background:"#fff",borderRadius:16,padding:16,boxShadow:"0 1px 8px rgba(0,0,0,.05)",marginBottom:12}}>
              <p style={{fontSize:11,fontWeight:800,color:"#aaa",textTransform:"uppercase",letterSpacing:.8,marginBottom:12}}>Participantes ({members.length})</p>
              {members.map((m,i)=>(
                <div key={m.name} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<members.length-1?"1px solid #f5f5f5":"none"}}>
                  <div style={{width:42,height:42,borderRadius:"50%",background:m.color||"#43a047",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:"#fff",flexShrink:0}}>{m.name?.[0]?.toUpperCase()}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:14}}>{m.name} {m.name===myName&&<span style={{color:"#43a047",fontSize:12}}>(você)</span>}</div>
                    <div style={{fontSize:11,color:"#aaa"}}>{roomItems.filter(i=>i.addedBy===m.name).length} adicionados · {roomItems.filter(i=>i.checkedBy===m.name).length} marcados</div>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={()=>{clearInterval(syncRef.current);setScreen("home");resetTimer();localStorage.removeItem(LAST_ROOM_KEY)}} style={{width:"100%",background:"#fff",color:"#e53935",border:"2px solid #ffcdd2",borderRadius:14,padding:13,fontWeight:900,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>← Sair da sala</button>
          </div>
        )}
      </div>

      {/* SCANNER */}
      {scanning&&(
        <div style={{position:"fixed",inset:0,background:"#000",zIndex:100,display:"flex",flexDirection:"column"}}>
          <video ref={videoRef} autoPlay playsInline muted style={{width:"100%",flex:1,objectFit:"cover"}}/>
          <div style={{position:"absolute",left:"12%",right:"12%",top:"38%",height:140,border:"2.5px solid rgba(76,175,80,.8)",borderRadius:14}}/>
          <div style={{position:"absolute",left:"14%",right:"14%",top:"50%",height:2,background:"#4CAF50",boxShadow:"0 0 10px #4CAF50",animation:"scanPulse 1.4s ease-in-out infinite"}}/>
          <div style={{position:"absolute",bottom:44,left:0,right:0,textAlign:"center",color:"rgba(255,255,255,.85)",fontSize:14,fontWeight:700}}>{scanMsg}</div>
          <button onClick={stopScan} style={{position:"absolute",top:18,right:18,background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:"50%",width:44,height:44,fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
      )}

      {/* TOAST */}
      {toast&&<div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:"#1b5e20",color:"#fff",padding:"11px 22px",borderRadius:24,fontSize:14,fontWeight:700,zIndex:200,boxShadow:"0 4px 20px rgba(0,0,0,.2)",whiteSpace:"nowrap"}}>{toast}</div>}
    </>
  );
}
