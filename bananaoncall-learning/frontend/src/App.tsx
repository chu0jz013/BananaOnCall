import { useEffect, useMemo, useState } from 'react';

type Incident = {
  id:string; service:string; severity:string; summary:string; status:string;
  alert_count:number; acknowledged_by?:string; created_at:string;
};

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

function Pill({children}:{children:string}) {
  return <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{children}</span>;
}

export function App(){
  const [incidents,setIncidents]=useState<Incident[]>([]);
  const [oncall,setOncall]=useState('loading…');
  const open=useMemo(()=>incidents.filter(i=>i.status!=='resolved').length,[incidents]);

  async function refresh(){
    const [i,o]=await Promise.all([
      fetch(`${API}/api/v1/incidents`).then(r=>r.json()),
      fetch(`${API}/api/v1/oncall/current?team=platform`).then(r=>r.json()),
    ]);
    setIncidents(i); setOncall(o.user || 'unassigned');
  }

  async function action(id:string, action:'ack'|'resolve'){
    await fetch(`${API}/api/v1/incidents/${id}/${action}`, {method:'POST',headers:{'content-type':'application/json'},body: action==='ack'?JSON.stringify({by:'web-user'}):'{}'});
    await refresh();
  }

  useEffect(()=>{ refresh().catch(console.error); },[]);

  return <main className="mx-auto max-w-6xl p-6 md:p-10">
    <header className="mb-10 flex items-end justify-between gap-6">
      <div><p className="text-sm text-amber-300">🍌 SRE learning project</p><h1 className="text-4xl font-semibold tracking-tight">bananaoncall</h1><p className="mt-2 text-zinc-400">Incidents, rotations, escalations and integrations.</p></div>
      <button onClick={()=>refresh()} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900">Refresh</button>
    </header>

    <section className="mb-8 grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"><p className="text-sm text-zinc-400">Open incidents</p><p className="mt-2 text-3xl font-semibold">{open}</p></div>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"><p className="text-sm text-zinc-400">Current primary</p><p className="mt-2 text-3xl font-semibold">{oncall}</p></div>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"><p className="text-sm text-zinc-400">Core integrations</p><p className="mt-2 text-3xl font-semibold">5+</p></div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-zinc-800">
      <div className="border-b border-zinc-800 bg-zinc-900/60 px-5 py-4"><h2 className="font-medium">Incidents</h2></div>
      {incidents.length===0 ? <div className="p-10 text-center text-zinc-500">No incidents yet. POST a demo alert to the backend.</div> : incidents.map(i=><div key={i.id} className="grid gap-3 border-b border-zinc-900 px-5 py-4 last:border-0 md:grid-cols-[1fr_auto]">
        <div><div className="flex flex-wrap items-center gap-2"><strong>{i.service}</strong><Pill>{i.severity}</Pill><Pill>{i.status}</Pill><Pill>{`${i.alert_count} alerts`}</Pill></div><p className="mt-2 text-sm text-zinc-400">{i.summary}</p><p className="mt-2 font-mono text-xs text-zinc-600">{i.id}</p></div>
        <div className="flex items-center gap-2">{i.status==='triggered' && <button onClick={()=>action(i.id,'ack')} className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-medium text-zinc-950">ACK</button>}{i.status!=='resolved' && <button onClick={()=>action(i.id,'resolve')} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Resolve</button>}</div>
      </div>)}
    </section>
  </main>;
}
