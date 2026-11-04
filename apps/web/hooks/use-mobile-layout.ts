"use client";
import { useSyncExternalStore } from 'react';

function subscribe(callback:()=>void) {
  const query=window.matchMedia('(max-width: 767px)');
  query.addEventListener('change',callback);
  return ()=>query.removeEventListener('change',callback);
}
export function useMobileLayout() {
  return useSyncExternalStore(subscribe,()=>window.matchMedia('(max-width: 767px)').matches,()=>false);
}
