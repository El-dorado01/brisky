"use client";
import {useEffect,useLayoutEffect} from 'react';
import {useBrowserPreferences,readBrowserPreferences} from '@/lib/browser-preferences';

/** Shared account/app appearance; marketing pages retain their own visual identity. */
export function AuthThemeEnforcer(){
  const {preferences}=useBrowserPreferences();
  useLayoutEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)'),root=document.documentElement;
    const apply=()=>{const saved=readBrowserPreferences();root.dataset.briskyTheme=saved.theme==='system'?(media.matches?'dark':'light'):saved.theme;root.dataset.briskyText=saved.textSize;};
    apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);
  },[preferences.theme,preferences.textSize]);
  useEffect(()=>()=>{delete document.documentElement.dataset.briskyTheme;delete document.documentElement.dataset.briskyText;},[]);
  return null;
}
