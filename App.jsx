import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from 'firebase/auth'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc
} from 'firebase/firestore'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import {
  Activity, CalendarDays, Check, ChevronDown, CircleDollarSign, FileImage,
  FileText, Gamepad2, History, LogOut, Plus, QrCode, Settings, ShieldCheck,
  Trash2, TrendingUp, Wallet, X, ImagePlus, Share2, Pencil, Save
} from 'lucide-react'
import { auth, db, firebaseConfigured } from './firebase'

const fmt = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n || 0))
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const prettyDate = s => s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const monthKey = s => (s || '').slice(0,7)

export default function App() {
  const [user,setUser] = useState(null), [authReady,setAuthReady] = useState(false)
  const [authMode,setAuthMode] = useState('login'), [email,setEmail] = useState(''), [password,setPassword] = useState('')
  const [authError,setAuthError] = useState(''), [entries,setEntries] = useState([]), [payments,setPayments] = useState([])
  const [rate,setRate] = useState(10), [qrUrl,setQrUrl] = useState(''), [includeQr,setIncludeQr] = useState(true)
  const [tab,setTab] = useState('home'), [entryDate,setEntryDate] = useState(today()), [lobbies,setLobbies] = useState('10'), [entryNote,setEntryNote] = useState('')
  const [payDate,setPayDate] = useState(today()), [payAmount,setPayAmount] = useState(''), [payNote,setPayNote] = useState('')
  const [newRate,setNewRate] = useState('10'), [qrBusy,setQrBusy] = useState(false), [loading,setLoading] = useState(false)
  const [toast,setToast] = useState(''), [reportStart,setReportStart] = useState(`${today().slice(0,7)}-01`), [reportEnd,setReportEnd] = useState(today())
  const reportRef = useRef(null), qrInput = useRef(null)

  useEffect(() => { if (!auth) { setAuthReady(true); return } return onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true) }) }, [])
  useEffect(() => {
    if (!user) return
    const base = `users/${user.uid}`
    const a = onSnapshot(query(collection(db,`${base}/entries`),orderBy('date','desc')),s=>setEntries(s.docs.map(d=>({id:d.id,...d.data()}))))
    const b = onSnapshot(query(collection(db,`${base}/payments`),orderBy('date','desc')),s=>setPayments(s.docs.map(d=>({id:d.id,...d.data()}))))
    const c = onSnapshot(doc(db,base,'settings'),s=>{
      if(s.exists()){
        const v=s.data(); setRate(Number(v.rate||10)); setNewRate(String(v.rate||10)); setQrUrl(v.qrData||''); setIncludeQr(v.includeQr !== false)
      } else { setDoc(doc(db,base,'settings'),{rate:10,qrUrl:'',includeQr:true},{merge:true}) }
    })
    return ()=>{a();b();c()}
  },[user])

  const totalLobbies = entries.reduce((s,e)=>s+Number(e.lobbies||0),0)
  const earned = entries.reduce((s,e)=>s+Number(e.amount||0),0)
  const received = payments.reduce((s,p)=>s+Number(p.amount||0),0)
  const pending = earned-received
  const filteredEntries = useMemo(()=>entries.filter(e=>e.date>=reportStart && e.date<=reportEnd),[entries,reportStart,reportEnd])
  const filteredPayments = useMemo(()=>payments.filter(p=>p.date>=reportStart && p.date<=reportEnd),[payments,reportStart,reportEnd])
  const reportEarned = filteredEntries.reduce((s,e)=>s+Number(e.amount||0),0)
  const reportReceived = filteredPayments.reduce((s,p)=>s+Number(p.amount||0),0)
  const reportLobbies = filteredEntries.reduce((s,e)=>s+Number(e.lobbies||0),0)
  const notify = m => { setToast(m); setTimeout(()=>setToast(''),2600) }

  async function authSubmit(e){
    e.preventDefault(); setAuthError('')
    try{
      if(authMode==='signup') await createUserWithEmailAndPassword(auth,email.trim(),password)
      else await signInWithEmailAndPassword(auth,email.trim(),password)
    }catch(err){setAuthError(err.message.replace('Firebase: ',''))}
  }
  async function addEntry(e){
    e.preventDefault()
    const count=Number(lobbies)
    if(!Number.isFinite(count)||count<=0||!Number.isInteger(count)){notify('Lobby count must be a whole number above zero');return}
    setLoading(true)
    try{
      await addDoc(collection(db,`users/${user.uid}/entries`),{date:entryDate,lobbies:count,rate,amount:count*rate,note:entryNote.trim(),createdAt:Date.now()})
      setLobbies('');setEntryNote('');notify('Lobby entry saved to cloud')
    }catch(err){notify(err.message)}finally{setLoading(false)}
  }
  async function addPayment(e){
    e.preventDefault(); const amount=Number(payAmount)
    if(!Number.isFinite(amount)||amount<=0){notify('Enter a valid payment amount');return}
    if(amount>pending+0.001){notify('Payment is greater than current pending balance');return}
    try{
      await addDoc(collection(db,`users/${user.uid}/payments`),{date:payDate,amount,note:payNote.trim(),createdAt:Date.now()})
      setPayAmount('');setPayNote('');notify('Payment recorded')
    }catch(err){notify(err.message)}
  }
  async function saveRate(e){
    e.preventDefault(); const r=Number(newRate)
    if(!Number.isFinite(r)||r<=0){notify('Rate must be greater than zero');return}
    await setDoc(doc(db,`users/${user.uid}/settings`),{rate:r},{merge:true})
    notify(`New rate saved: ${fmt(r)} per lobby. Existing entries stay unchanged.`)
  }
  async function uploadQr(e){
    const file=e.target.files?.[0]; if(!file)return
    if(!file.type.startsWith('image/')){notify('Please choose an image file');return}
    if(file.size>650*1024){notify('QR image must be under 650 KB so it fits safely in your cloud record. Please resize it and try again.');return}
    setQrBusy(true)
    try{
      const dataUrl=await new Promise((resolve,reject)=>{
        const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file)
      })
      await setDoc(doc(db,`users/${user.uid}/settings`),{qrData:dataUrl},{merge:true})
      setQrUrl(dataUrl); notify('Payment QR saved securely to your cloud account.')
    }catch(err){notify(err.message)}finally{setQrBusy(false);e.target.value=''}
  }
  async function removeQr(){
    if(!confirm('Remove your saved payment QR code?'))return
    await setDoc(doc(db,`users/${user.uid}/settings`),{qrData:''},{merge:true})
    setQrUrl('');notify('QR code removed')
  }
  async function deleteRecord(kind,id){
    if(!confirm('Delete this record permanently?'))return
    await deleteDoc(doc(db,`users/${user.uid}/${kind}`,id));notify('Record deleted')
  }
  async function shareOrSave(blob, filename, mime, fallback) {
    if (Capacitor.isNativePlatform()) {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      const saved = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache })
      await Share.share({ title: 'Rupak Lobby Ledger statement', text: 'My Free Fire lobby hosting statement', url: saved.uri, dialogTitle: 'Share statement' })
      return
    }
    const file = new File([blob], filename, { type: mime })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Lobby statement' })
    } else if (fallback) {
      fallback()
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  async function exportReport(type){
    if(!reportRef.current)return
    setLoading(true)
    try{
      const canvas=await html2canvas(reportRef.current,{scale:2,backgroundColor:'#0b1020',useCORS:true})
      const img=canvas.toDataURL('image/png')
      const filename=`Rupak-Lobby-Statement-${reportStart}-to-${reportEnd}`
      if(type==='png'){
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
        await shareOrSave(blob,`${filename}.png`,'image/png',()=>{const a=document.createElement('a');a.href=img;a.download=`${filename}.png`;a.click()})
      }else{
        const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'})
        const w=190,h=canvas.height*w/canvas.width
        let y=10, remaining=h
        pdf.addImage(img,'PNG',10,y,w,h)
        let pageHeight=277
        while(remaining>pageHeight){remaining-=pageHeight;pdf.addPage();y-=pageHeight;pdf.addImage(img,'PNG',10,y,w,h)}
        const blob=pdf.output('blob')
        await shareOrSave(blob,`${filename}.pdf`,'application/pdf',()=>pdf.save(`${filename}.pdf`))
      }
    }catch(err){notify(err.message||'Export failed')}finally{setLoading(false)}
  }

  if(!authReady)return <div className="splash"><div className="logo">RL</div><p>Loading your ledger…</p></div>
  if(!firebaseConfigured)return <SetupScreen/>
  if(!user)return <main className="auth-shell"><div className="auth-card"><div className="brand-mark">RL</div><div className="eyebrow">ESPORTS HOSTING FINANCE</div><h1>RUPAK <span>LOBBY LEDGER</span></h1><p className="muted">Your matches. Your money. One ledger.</p><form onSubmit={authSubmit} className="stack"><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" minLength="6" required/></label>{authError&&<p className="error">{authError}</p>}<button className="primary full">{authMode==='login'?'Sign in':'Create account'}</button></form><button className="link-button" onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthError('')}}>{authMode==='login'?"New here? Create your account":"Already registered? Sign in"}</button><p className="tiny">Private cloud account · Only you can access your records</p></div></main>

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark small">RL</div><div><strong>RUPAK <span>LOBBY LEDGER</span></strong><small>ESPORTS HOSTING ACCOUNT</small></div></div><button className="icon-btn" title="Sign out" onClick={()=>signOut(auth)}><LogOut size={18}/></button></header>
    <main className="main-content">
      <section className="welcome"><div><div className="eyebrow">PLAYER FINANCE / PERSONAL LEDGER</div><h1>Welcome back, <span>Rupak.</span></h1><p>Keep every lobby and every rupee accounted for.</p></div><div className="rate-chip"><CircleDollarSign size={16}/> {fmt(rate)} <small>/ lobby</small></div></section>
      <section className="stats-grid">
        <Stat icon={<TrendingUp/>} label="Total earned" value={fmt(earned)} tone="purple"/>
        <Stat icon={<Wallet/>} label="Received" value={fmt(received)} tone="cyan"/>
        <Stat icon={<Activity/>} label="Pending balance" value={fmt(pending)} tone="orange"/>
        <Stat icon={<Gamepad2/>} label="Total lobbies" value={totalLobbies.toLocaleString('en-IN')} tone="green"/>
      </section>
      <nav className="tabs">
        {[['home','Overview'],['entries','Lobby history'],['payments','Payments'],['report','Share report'],['settings','Settings']].map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}
      </nav>

      {tab==='home'&&<div className="content-grid">
        <section className="panel"><div className="panel-heading"><div><div className="eyebrow">QUICK ACTION</div><h2><Plus size={20}/> Add lobby entry</h2></div><span className="tag">CLOUD SYNC</span></div>
          <form className="stack" onSubmit={addEntry}><div className="two-col"><label>Lobby date<input type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} required/></label><label>Number of lobbies<input type="number" min="1" step="1" value={lobbies} onChange={e=>setLobbies(e.target.value)} placeholder="e.g. 10" required/></label></div><label>Note (optional)<input value={entryNote} onChange={e=>setEntryNote(e.target.value)} placeholder="Tournament / shift details"/></label><div className="calculation"><span>At {fmt(rate)} per lobby</span><strong>{fmt((Number(lobbies)||0)*rate)}</strong></div><button className="primary" disabled={loading}>{loading?'Saving…':'Save lobby entry'}</button></form>
        </section>
        <section className="panel"><div className="panel-heading"><div><div className="eyebrow">PAYMENT TRACKER</div><h2><CircleDollarSign size={20}/> Record payment</h2></div></div><form className="stack" onSubmit={addPayment}><label>Payment date<input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} required/></label><label>Amount received (₹)<input type="number" min="0.01" step="0.01" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder="e.g. 500" required/></label><label>Payment note<input value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="UPI / cash / reference"/></label><div className="calculation"><span>Current pending</span><strong>{fmt(pending)}</strong></div><button className="secondary" disabled={loading}>Save payment</button></form></section>
      </div>}

      {tab==='entries'&&<section className="panel"><div className="panel-heading"><div><div className="eyebrow">YOUR WORK LOG</div><h2><History size={20}/> Lobby history</h2></div><span className="tag">{entries.length} RECORDS</span></div>{entries.length===0?<Empty text="No lobby entries yet. Add your first entry from Overview."/>:<div className="record-list">{entries.map(e=><div className="record" key={e.id}><div className="record-icon"><Gamepad2/></div><div className="record-main"><strong>{prettyDate(e.date)}</strong><small>{e.lobbies} lobbies · {fmt(e.rate)} each {e.note?`· ${e.note}`:''}</small></div><b>{fmt(e.amount)}</b><button className="delete-btn" onClick={()=>deleteRecord('entries',e.id)} title="Delete entry"><Trash2 size={16}/></button></div>)}</div>}</section>}

      {tab==='payments'&&<section className="panel"><div className="panel-heading"><div><div className="eyebrow">MONEY RECEIVED</div><h2><Wallet size={20}/> Payment history</h2></div><span className="tag">{payments.length} PAYMENTS</span></div>{payments.length===0?<Empty text="No payments recorded yet."/>:<div className="record-list">{payments.map(p=><div className="record" key={p.id}><div className="record-icon cyan"><Check/></div><div className="record-main"><strong>{prettyDate(p.date)}</strong><small>{p.note||'Payment received'}</small></div><b className="green-text">+{fmt(p.amount)}</b><button className="delete-btn" onClick={()=>deleteRecord('payments',p.id)} title="Delete payment"><Trash2 size={16}/></button></div>)}</div>}</section>}

      {tab==='report'&&<div className="report-layout"><section className="panel"><div className="panel-heading"><div><div className="eyebrow">ADMIN-READY STATEMENT</div><h2><FileText size={20}/> Export report</h2></div></div><div className="two-col"><label>From<input type="date" value={reportStart} onChange={e=>setReportStart(e.target.value)}/></label><label>To<input type="date" value={reportEnd} onChange={e=>setReportEnd(e.target.value)}/></label></div><label className="toggle-row"><span><QrCode size={18}/> Include my payment QR code</span><input type="checkbox" checked={includeQr} onChange={e=>{setIncludeQr(e.target.checked);setDoc(doc(db,`users/${user.uid}/settings`),{includeQr:e.target.checked},{merge:true})}}/></label><div className="export-buttons"><button className="primary" onClick={()=>exportReport('pdf')} disabled={loading}><FileText size={17}/> {loading?'Preparing…':'Export / Share PDF'}</button><button className="secondary" onClick={()=>exportReport('png')} disabled={loading}><FileImage size={17}/> Export / Share PNG</button></div><p className="hint">On Android, the share sheet lets you send the PDF or PNG directly to WhatsApp or another app. If sharing is unavailable, the file downloads instead.</p></section>
        <div className="report-preview-wrap"><div className="preview-label">LIVE STATEMENT PREVIEW</div><div className="statement" ref={reportRef}><div className="statement-top"><div className="statement-logo">RL</div><div><div className="statement-kicker">ESPORTS HOSTING STATEMENT</div><h2>RUPAK NATH</h2><p>FREE FIRE LOBBY HOSTING</p></div><div className="statement-date">STATEMENT<br/><b>{prettyDate(reportStart)} — {prettyDate(reportEnd)}</b></div></div><div className="statement-rule"/><div className="statement-stats"><div><small>LOBBIES COMPLETED</small><b>{reportLobbies}</b></div><div><small>TOTAL EARNED</small><b>{fmt(reportEarned)}</b></div><div><small>PAYMENT LOGGED</small><b>{fmt(reportReceived)}</b></div></div><h3>LOBBY BREAKDOWN</h3><div className="statement-table"><div className="table-head"><span>DATE</span><span>LOBBIES</span><span>RATE</span><span>AMOUNT</span></div>{filteredEntries.length?filteredEntries.map(e=><div className="table-row" key={e.id}><span>{prettyDate(e.date)}</span><span>{e.lobbies}</span><span>{fmt(e.rate)}</span><b>{fmt(e.amount)}</b></div>):<div className="no-rows">No lobby entries in this date range.</div>}</div><h3>PAYMENT BREAKDOWN</h3><div className="statement-table">{filteredPayments.length?filteredPayments.map(p=><div className="table-row payment-row" key={p.id}><span>{prettyDate(p.date)}</span><span className="wide">{p.note||'Payment received'}</span><b>{fmt(p.amount)}</b></div>):<div className="no-rows">No payments in this date range.</div>}</div><div className="statement-total"><div><small>NET AMOUNT DUE FOR THIS PERIOD*</small><b>{fmt(reportEarned-reportReceived)}</b></div><div className="due-note">Prepared by<br/><strong>Rupak Nath</strong></div></div>{includeQr&&qrUrl&&<div className="statement-qr"><div><b>SCAN TO PAY</b><small>UPI payment QR</small></div><img src={qrUrl} crossOrigin="anonymous" alt="Payment QR code"/></div>}<div className="statement-footer">RUPAK LOBBY LEDGER · GENERATED STATEMENT<br/><small>*Based on entries and payments recorded within the selected date range.</small></div></div></div></div>}

      {tab==='settings'&&<div className="settings-grid"><section className="panel"><div className="panel-heading"><div><div className="eyebrow">EARNING CONFIGURATION</div><h2><Settings size={20}/> Lobby rate</h2></div></div><form className="stack" onSubmit={saveRate}><label>Current rate per lobby (₹)<input type="number" min="0.01" step="0.01" value={newRate} onChange={e=>setNewRate(e.target.value)} required/></label><p className="hint">Changing the rate only affects new entries. Older entries keep the rate they were saved with, so your past totals don't change.</p><button className="primary"><Save size={17}/> Save new rate</button></form></section><section className="panel"><div className="panel-heading"><div><div className="eyebrow">PAYMENT DETAILS</div><h2><QrCode size={20}/> Your UPI QR code</h2></div></div><p className="hint">Upload your personal payment QR. It is stored privately in your cloud account and can be included automatically in PDF and PNG statements.</p>{qrUrl?<div className="qr-preview"><img src={qrUrl} alt="Saved payment QR"/><button className="danger-outline" onClick={removeQr}><Trash2 size={16}/> Remove QR</button></div>:<div className="qr-empty"><QrCode size={34}/><span>No payment QR uploaded</span></div>}<input ref={qrInput} type="file" accept="image/*" hidden onChange={uploadQr}/><button className="secondary full" onClick={()=>qrInput.current?.click()} disabled={qrBusy}><ImagePlus size={17}/>{qrBusy?'Uploading…':qrUrl?'Replace QR code':'Upload QR code'}</button></section></div>}
    </main>
    <footer className="app-footer"><ShieldCheck size={15}/> Your records are private and synced to your Firebase account.</footer>
    {toast&&<div className="toast">{toast}</div>}
  </div>
}

function Stat({icon,label,value,tone}){return <div className={`stat-card ${tone}`}><div className="stat-icon">{icon}</div><small>{label}</small><strong>{value}</strong></div>}
function Empty({text}){return <div className="empty"><Gamepad2 size={28}/><p>{text}</p></div>}
function SetupScreen(){return <main className="auth-shell"><div className="auth-card setup-card"><div className="brand-mark">RL</div><h1>One quick setup needed</h1><p className="muted">Add your Firebase project keys to the <code>.env</code> file, then restart the app.</p><ol><li>Open Firebase Console and create a project.</li><li>Register a Web App and copy its config.</li><li>Enable Email/Password Authentication, Firestore and Storage.</li><li>Copy <code>.env.example</code> to <code>.env</code> and fill in the values.</li><li>Publish the included Firestore and Storage rules.</li></ol><p className="tiny">See README.md for the complete Android build and deployment guide.</p></div></main>}