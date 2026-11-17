export function elapsedLabel(job,current=Date.now()){
 const active=['queued','running'].includes(job.status),start=Date.parse(job.createdAt),end=active?current:Date.parse(job.finishedAt);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return 'Elapsed time unavailable';
 const seconds=Math.floor((end-start)/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;
 const duration=hours?hours+'h '+minutes+'m '+rest+'s':minutes?minutes+'m '+rest+'s':seconds?seconds+'s':'less than 1s';
 return (active?'Elapsed: ':'Total elapsed: ')+duration;
}
