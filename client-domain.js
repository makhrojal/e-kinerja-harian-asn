// Pure date-only and record functions; shared by runtime and regression tests.
const Domain=Object.freeze({
  ymd(date,zone){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);},
  addDays(ymd,days){const d=new Date(ymd+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);},
  week(ymd){const day=new Date(ymd+'T12:00:00Z').getUTCDay();const mon=this.addDays(ymd,-((day+6)%7));return [mon,this.addDays(mon,6)];},
  streak(dates,today){const set=new Set(dates);let day=set.has(today)?today:this.addDays(today,-1),count=0;while(set.has(day)){count++;day=this.addDays(day,-1);}return count;},
  same(a,b){return !!a&&!!b&&['id','date','activity','result','evidence','status','followup'].every(k=>a[k]===b[k]);},
  recent(a,b){return String(b.date||'').localeCompare(String(a.date||''))||String(b.updated||'').localeCompare(String(a.updated||''))||String(a.id||'').localeCompare(String(b.id||''));}
});
