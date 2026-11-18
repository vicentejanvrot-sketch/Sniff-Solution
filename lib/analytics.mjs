import {mediaMetrics} from './insights.mjs';
export function analyticsReport(s,{brandId='',accountId='',from='',to=''}={}){
 const snapshots=(s.analytics?.snapshots||[]).filter(x=>(!brandId||x.brandId===brandId)&&(!accountId||x.accountId===accountId));
 // Date filters select publication cohorts for media, observation dates for accounts.
 const latest=new Map();
 for(const row of snapshots.filter(x=>x.kind==='media')){const day=(row.publishedAt||'').slice(0,10);if(from&&day<from||to&&day>to)continue;const key=row.accountId+':'+row.mediaId;if(!latest.has(key)||row.capturedAt>latest.get(key).capturedAt)latest.set(key,row);}
 const posts=[...latest.values()].map(p=>{const values=['likes','comments','saved','shares'].map(m=>p.metrics[m]);const interactions=values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null;return {...p,interactions,engagementRate:interactions!==null&&p.metrics.reach>0?100*interactions/p.metrics.reach:null};}).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
 const summary=Object.fromEntries(mediaMetrics.map(m=>{const known=posts.map(p=>p.metrics[m]).filter(Number.isFinite);return [m,{total:known.length?known.reduce((a,b)=>a+b,0):null,available:known.length,posts:posts.length}];}));
 const formats=['reel','image'].map(format=>{const rows=posts.filter(p=>p.format===format),known=rows.map(p=>p.metrics.views).filter(Number.isFinite);return {format,posts:rows.length,measured:known.length,averageViews:known.length?known.reduce((a,b)=>a+b,0)/known.length:null};});
 const timeGroups=new Map();
 for(const post of posts){const schedule=(s.schedules||[]).find(x=>x.id===post.publicationId);if(!schedule?.localTime||!Number.isFinite(post.metrics.views))continue;const label=schedule.localTime.slice(11,13)+':00 · '+schedule.timezone;const group=timeGroups.get(label)||{label,posts:0,totalViews:0};group.posts++;group.totalViews+=post.metrics.views;timeGroups.set(label,group);}
 const postingTimes=[...timeGroups.values()].map(g=>({...g,averageViews:g.totalViews/g.posts})).sort((a,b)=>b.averageViews-a.averageViews);
 const accountDays=snapshots.filter(x=>x.kind==='account'&&(!from||x.day>=from)&&(!to||x.day<=to)).sort((a,b)=>a.day.localeCompare(b.day));
 const top=posts.filter(p=>Number.isFinite(p.metrics.views)).sort((a,b)=>b.metrics.views-a.metrics.views)[0];
 const learning=posts.length<5?'Small sample: collect at least five measured posts before drawing conclusions. Test one topic or format at a time.':top?'Highest observed lifetime views: '+top.metrics.views+' for “'+top.caption.slice(0,100)+'”. Older posts have had longer to accumulate views; this is an observation, not proof of cause. Test a related idea and compare after equal time.':'Views are unavailable. Check Insights permissions and wait for Instagram processing.';
 return {posts,summary,formats,postingTimes,accountDays,learning,definition:'Media metrics are latest lifetime observations for posts published in the selected UTC dates. Summed post reach is not unique account reach. Engagement rate = (likes + comments + saves + shares) / reach × 100; unavailable if any component is missing. Account metrics cover each labelled UTC day; followers are observed at capture time.'};
}
export function analyticsCSV(report){
 const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
 return [['publicationId','format','publishedAt','capturedAt','caption',...mediaMetrics,'engagementRate'],...report.posts.map(p=>[p.publicationId,p.format,p.publishedAt,p.capturedAt,p.caption,...mediaMetrics.map(m=>p.metrics[m]),p.engagementRate])].map(row=>row.map(cell).join(',')).join('\r\n');
}
