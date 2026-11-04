import { StrictMode, useEffect, useState, useReducer, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BriskyCompanion, type BriskyPose } from './BriskyCompanion';
import './style.css';
import {initialSearch,searchSimulationReducer,type SearchOutcome} from './searchSimulation';

const ALL_POSES: readonly BriskyPose[] = [
  'idle',
  'listening',
  'thinking',
  'sleeping',
  'surprised',
  'playful',
  'dragged',
  'greeting',
  'searching',
  'success',
  'empty',
  'error',
  'spin',
];

function App() {
  const [size, setSize] = useState(160), [amplitude, setAmplitude] = useState(0.6);
  const [motion, setMotion] = useState(true), [satellites, setSatellites] = useState(true), [tracking, setTracking] = useState(true);
  const [systemReduced, setSystemReduced] = useState(false), [reduced, setReduced] = useState(false);
  const [dark, setDark] = useState(false), [mobile, setMobile] = useState(false), [enabled, setEnabled] = useState(true);
  const [pose, setPose] = useState<BriskyPose>(()=>{const p=new URLSearchParams(location.search).get('pose');return ALL_POSES.includes((p||'') as BriskyPose)?p as BriskyPose:'idle';}), [query, setQuery] = useState(''), [message, setMessage] = useState('');
  const [reaction, setReaction] = useState(''), [pokeSignal,setPokeSignal] = useState(0);
  const [greetingSignal,setGreetingSignal]=useState(0);
  const [search,dispatchSearch]=useReducer(searchSimulationReducer,initialSearch);
  const [outcome,setOutcome]=useState<SearchOutcome>('success');
  const searchTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const requestSequence=useRef(0);
  const [celebrating,setCelebrating]=useState< false | 'success' | 'spin' | 'empty' | 'error'>(false);
  const celebrationTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const playTimedPose=(target:'success'|'spin'|'empty'|'error')=>{clearTimeout(celebrationTimer.current);setPose('idle');setReaction('');setCelebrating(target);celebrationTimer.current=setTimeout(()=>setCelebrating(false),2300);};
  const celebrate=()=>playTimedPose('success');
  const celebrateSpin=()=>playTimedPose('spin');
  useEffect(()=>{if(search.status==='success')playTimedPose('success');else if(search.status==='empty')playTimedPose('empty');else if(search.status==='error')playTimedPose('error');else {clearTimeout(celebrationTimer.current);setCelebrating(false);}return()=>clearTimeout(celebrationTimer.current);},[search.status,search.requestId]);
  const pending=search.status==='pending';
  useEffect(()=>()=>clearTimeout(searchTimer.current),[]);
  const submitSearch=()=>{
    if(!query.trim()){setMessage('Type a memory to try the search field.');return;}
    clearTimeout(searchTimer.current);
    const requestId=++requestSequence.current;
    setPose('idle');setReaction('');setMessage('');
    dispatchSearch({type:'start',requestId,query:query.trim()});
    searchTimer.current=setTimeout(()=>dispatchSearch({type:'complete',requestId,outcome}),2800);
  };
  const currentPose:BriskyPose=pending?'searching':celebrating?celebrating:pose;
  const searchMessage=pending?`Searching the demo collection for “${search.query}”…`:search.status==='success'?`Demo complete for “${search.query}”. No real library is connected.`:search.status==='empty'?'No demo results. Try another description.':search.status==='error'?'Simulated search error. Try again.':'';

  useEffect(()=>{if(!reaction || reaction==='Wheeee!')return;const timer=setTimeout(()=>setReaction(''),1800);return()=>clearTimeout(timer);},[reaction]);
  const react = (event: 'poke'|'drag'|'release') => {clearTimeout(celebrationTimer.current);setCelebrating(false); setPose(p=>p==='sleeping'?'idle':p); setReaction(event==='poke'?'Hehe! That tickles!':event==='drag'?'Wheeee!':'Back to my little spot.'); };
  useEffect(() => { const mq = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setSystemReduced(mq.matches); update(); mq.addEventListener('change', update); return () => mq.removeEventListener('change', update); }, []);
  const reset = () => {clearTimeout(celebrationTimer.current);setCelebrating(false);clearTimeout(searchTimer.current);dispatchSearch({type:'reset'});setReaction('');setMessage(''); setSize(160); setAmplitude(0.6); setMotion(true); setSatellites(true); setTracking(true); setReduced(false); setEnabled(true); setPose('idle'); };
  const toggle = (label: string, value: boolean, action: (v: boolean) => void) => <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={value} onChange={e=>action(e.target.checked)}/></label>;
  return <div className={dark ? 'app dark' : 'app'}>
    <header><a className="brand" href="./"><span className="brand-mark">b.</span> brisky<span className="divider"/> <span className="header-label">Character lab</span></a><span className="phase"><i/> Interactions · 02</span></header>
    <main><section className="intro"><div><p className="eyebrow">A LITTLE CURIOUS. A LITTLE COSMIC.</p><h1>Meet your Brisky.</h1><p>A small companion for your world of memories.</p></div><div className="version">CHARACTER STUDY <span>v0.1</span></div></section>
    <div className="workspace"><section className={'preview '+(mobile?'mobile-preview':'')} aria-label="Mascot preview">
      <div className="preview-top"><span><i/> LIVE PREVIEW</span><div className="segmented"><button aria-pressed={!mobile} onClick={()=>setMobile(false)}>Desktop</button><button aria-pressed={mobile} onClick={()=>setMobile(true)}>Mobile</button></div></div>
      <div className="dashboard"><div className="hello">{enabled ? (pending||pose==='searching'?'On it!':search.status==='success'||celebrating==='success'||pose==='success'?'Found something!':celebrating==='spin'||pose==='spin'?'You got it!':search.status==='empty'||celebrating==='empty'||pose==='empty'?'Hmm… try another way?':search.status==='error'||celebrating==='error'||pose==='error'?'Something went wrong. Try again?':pose==='sleeping'?"I'll be right here…":reaction||(pose==='listening'?'Ooh… tell me more!':pose==='thinking'?'Let me think…':pose==='surprised'?'Wow!':pose==='playful'?'Hehe!':pose==='dragged'?'Wheeee!':'Hey Brisky!')) : 'Your memories are still here.'}</div>
        <div className="character-stage"><BriskyCompanion enabled={enabled} pokeSignal={pokeSignal} greetingSignal={greetingSignal} onInteraction={react} config={{size, amplitude, satellites, tracking, motion: motion && !reduced && !systemReduced, pose:currentPose}}/>{enabled && currentPose==='sleeping' && <span className="sleep-indicator" aria-hidden="true">z Z</span>}<div className="ground-shadow"/></div>
        <h2>A moment in mind?</h2><p>Let’s find it in your collection.</p>
        <form aria-busy={pending} onSubmit={e=>{e.preventDefault();submitSearch();}}><span aria-hidden="true">⌕</span><input aria-label="Search your memories" placeholder="That sunset by the ocean…" value={query} onChange={e=>setQuery(e.target.value)} onFocus={()=>{clearTimeout(celebrationTimer.current);setCelebrating(false);if(!pending){dispatchSearch({type:'reset'});setPose('listening');}setReaction('');}} onBlur={()=>{if(!pending&&pose==='listening')setPose('idle');}}/><button aria-label="Preview search" type="submit">{pending?'…':'↑'}</button></form>
        <div className="search-status" role="status">{message || searchMessage || 'Photos, videos, sounds. All your moments, together.'}</div>
      </div><div className="preview-bottom"><span>● {enabled?'Procedural WebGL · static fallback supported':'Mascot disabled'}</span><span>{size} px target</span></div>
    </section>
    <aside><div className="panel-title"><div><p className="eyebrow">MAKE IT FEEL RIGHT</p><h2>Character tuning</h2></div><button className="reset" onClick={reset}>Reset ↺</button></div>
      <div className="control-section"><h3>Expression</h3><div className="poses">{ALL_POSES.map(p=><button key={p} aria-pressed={pose===p} onClick={()=>{clearTimeout(celebrationTimer.current);setCelebrating(false);if(!pending)dispatchSearch({type:'reset'});setReaction('');setPose(p);}}><span>{p==='idle'?'◡':p==='listening'?'◉':p==='thinking'?'💭':p==='sleeping'?'☾':p==='surprised'?'!':p==='playful'?';)':p==='greeting'?'✋':p==='empty'?'?':p==='error'?'⚠':p==='spin'?'↻':'↗'}</span>{p}</button>)}</div></div>
      <div className="control-section"><h3>Touch & play</h3><p className="interaction-note">Tap Brisky for a jelly squish. Drag and release to spring home. Touch and search focus wake Brisky.</p><div className="interaction-tools"><button disabled={!enabled} onClick={()=>{setPokeSignal(v=>v+1);}}>Poke</button><button onClick={()=>{clearTimeout(celebrationTimer.current);setCelebrating(false);setPose('idle');setReaction('');}}>Wake</button></div></div>
      <div className="control-section"><h3>Shapeshifting</h3><p className="interaction-note">A jelly arm grows, waves hello, then melts back into Brisky. Select Greeting above to hold the pose.</p><div className="interaction-tools"><button disabled={!enabled || pending} onClick={()=>{clearTimeout(celebrationTimer.current);setCelebrating(false);setPose('idle');setReaction('Hey there!');setGreetingSignal(v=>v+1);}}>Say hello</button><button onClick={()=>{clearTimeout(celebrationTimer.current);setCelebrating(false);setPose('sleeping');setReaction('');}}>Rest</button></div></div>
      <div className="control-section"><h3>Celebrate</h3><p className="interaction-note">Both arms grow for a happy bounce or a 360° celebratory spin, then retract. A successful demo search plays Celebrate automatically.</p><div className="interaction-tools"><button disabled={!enabled || pending} onClick={celebrate}>Celebrate</button><button disabled={!enabled || pending} onClick={celebrateSpin}>Spin</button></div></div>
      <div className="control-section"><h3>Search simulator</h3><label className="simulation-label">Demo outcome<select aria-label="Demo search outcome" value={outcome} onChange={e=>setOutcome(e.target.value as SearchOutcome)}><option value="success">Success</option><option value="empty">No results</option><option value="error">Error</option></select></label><p className="interaction-note">Submit the search field to grow the antenna and send the satellites scouting. Re-submit to replace a pending demo.</p><div className="interaction-tools"><button disabled={!pending} onClick={()=>{clearTimeout(searchTimer.current);dispatchSearch({type:'reset'});setPose('idle');setReaction('');}}>Cancel search</button></div></div>
      <div className="control-section"><h3>Appearance</h3><label className="slider-label">Character size <output>{size} px</output><input aria-label="Character size" type="range" min="100" max="180" value={size} onChange={e=>setSize(+e.target.value)}/></label>{toggle('Satellite bubbles',satellites,setSatellites)}{toggle('Dark background',dark,setDark)}</div>
      <div className="control-section"><h3>Life & motion</h3>{toggle('Gentle breathing & hover',motion,setMotion)}{toggle('Follow pointer with eyes',tracking,setTracking)}<label className="slider-label">Hover amplitude <output>{amplitude.toFixed(1)}</output><input aria-label="Hover amplitude" type="range" min="0" max="1" step="0.1" value={amplitude} onChange={e=>setAmplitude(+e.target.value)}/></label>{toggle('Emulate reduced motion',reduced,setReduced)}{systemReduced && <small>System reduced motion is active.</small>}</div>
      <div className="control-section">{toggle('Enable Brisky',enabled,setEnabled)}<p className="control-note">The search field stays usable when Brisky is switched off.</p></div>
      <div className="gate"><span>✧</span><div><strong>A little more alive.</strong><p>Try poke, drag, and a softer sleeping pose. Try the growing greeting arm. Search antenna is ready. Try the two-arm success celebration.</p></div></div>
    </aside></div><footer><span>BRISKY MASCOT PLAYGROUND</span><span>Made of jelly. Full of possibility.</span></footer></main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
