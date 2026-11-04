/** Decorative creation cards, not generated documents or saved media. */
export function StudioEmptyArtwork() {
  return (
    <div aria-hidden className="mx-auto flex h-24 w-fit items-center -space-x-5 px-3">
      {[
        { background: '#e4efe9', ink: '#579586', rotation: '-10deg', kind: 'moment' },
        { background: '#eae3fb', ink: '#8170c8', rotation: '0deg', kind: 'brief' },
        { background: '#fae8dd', ink: '#d59570', rotation: '10deg', kind: 'storyline' },
      ].map((card, index) => (
        <div key={card.kind} className={`relative grid size-[68px] place-items-center rounded-[20px] border-[3px] border-white shadow-[0_4px_14px_rgba(34,40,63,.09)] ${index === 1 ? 'z-10' : 'z-0'}`} style={{ background: card.background, color: card.ink, transform: `rotate(${card.rotation})${index === 1 ? ' translateY(-8px)' : ''}` }}>
          <svg viewBox="0 0 40 40" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            {card.kind === 'moment' ? <><rect x="7" y="9" width="26" height="22" rx="5" fill="white" fillOpacity=".5" /><path d="m17 15 8 5-8 5Z" fill="currentColor" stroke="none" /></> : card.kind === 'brief' ? <><rect x="9" y="5" width="23" height="30" rx="4" fill="white" fillOpacity=".5" /><path d="M15 13h11M15 19h11M15 25h7" /></> : <><path d="M13 11v18" /><circle cx="13" cy="10" r="3" fill="white" /><circle cx="13" cy="20" r="3" fill="white" /><circle cx="13" cy="30" r="3" fill="white" /><path d="M21 10h9M21 20h7M21 30h9" /></>}
          </svg>
        </div>
      ))}
    </div>
  );
}
