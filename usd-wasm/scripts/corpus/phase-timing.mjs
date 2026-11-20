/** Keep completed and interrupted phase durations on the host, even when the
 * browser cannot return its final performance measurements. */
export function createPhaseTiming(clock=()=>performance.now()){
 const started=clock(),finished=[];let active='page',phaseStarted=started;
 return {
  enter(phase){
   const now=clock();
   if(phase!==active){finished.push({phase:active,startedSeconds:(phaseStarted-started)/1000,durationSeconds:(now-phaseStarted)/1000});active=phase;phaseStarted=now;}
   return (now-started)/1000;
  },
  snapshot(){const now=clock();return {wallSeconds:(now-started)/1000,phases:[...finished,{phase:active,startedSeconds:(phaseStarted-started)/1000,durationSeconds:(now-phaseStarted)/1000}]};},
 };
}
