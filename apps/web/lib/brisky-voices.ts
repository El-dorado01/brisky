export const briskyVoices=[
  {value:'Kore',label:'Kore - Brisky default',description:'Firm and assured'},
  {value:'Puck',label:'Puck',description:'Upbeat'},
  {value:'Charon',label:'Charon',description:'Informative'},
  {value:'Aoede',label:'Aoede',description:'Breezy'},
  {value:'Zephyr',label:'Zephyr',description:'Bright'},
  {value:'Sulafat',label:'Sulafat',description:'Warm'},
];
// Fixed server-owned samples; the client sends only this index, never arbitrary text.
export const voiceSamples=[
  'Hi, I am Brisky. Every moment has a story. Let us find yours.',
  'The rain has stopped, the kettle is on, and there is still time for a little adventure.',
  'Some memories make us laugh. Others remind us how far we have come.',
  'Imagine opening a window to a bright morning, with a whole new day ahead.',
];
export function endsVoiceSession(text:string){
  const value=text.toLowerCase().replace(/[\u2019]/g,"'").replace(/[.!?,]/g,' ').replace(/\s+/g,' ').trim();
  return /^(?:(?:okay|ok|alright|brisky|please|thank you|thanks)\s+)*(?:that'?s all(?: for (?:the|this|today'?s) session| for (?:now|today))?|(?:end|close|stop|finish) (?:the |this |our )?(?:voice )?(?:session|call|conversation)|(?:i am|i'm|we are|we're) done(?: for (?:now|today))?|goodbye|bye(?: bye)?)(?:\s+(?:brisky|please|thank you|thanks|have a (?:good|great|wonderful) day))*$/.test(value);
}
