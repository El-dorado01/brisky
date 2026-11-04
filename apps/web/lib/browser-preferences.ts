"use client";
import {briskyVoices} from './brisky-voices';
import {useMemo,useSyncExternalStore} from 'react';

export const defaultPreferences={theme:'system' as 'system'|'light'|'dark',textSize:'standard' as 'small'|'standard'|'large'|'extra-large',showMascot:true,mascotMotion:'system' as 'system'|'reduced',readAloud:true,speechRate:1,speechVoice:'',briskyVoice:'Kore',voicePreviewCaptions:true};
export type BrowserPreferences=typeof defaultPreferences;
const key='brisky.browser-preferences.v1',event='brisky-preferences-changed';
function snapshot(){try{return localStorage.getItem(key)||'';}catch{return '';}}
function subscribe(callback:()=>void){const storage=(e:StorageEvent)=>{if(e.key===key||e.key===null)callback();};window.addEventListener('storage',storage);window.addEventListener(event,callback);return()=>{window.removeEventListener('storage',storage);window.removeEventListener(event,callback);};}
function parse(raw:string):BrowserPreferences{try{const v=JSON.parse(raw);return {theme:['light','dark'].includes(v.theme)?v.theme:'system',textSize:['small','large','extra-large'].includes(v.textSize)?v.textSize:'standard',showMascot:typeof v.showMascot==='boolean'?v.showMascot:true,mascotMotion:v.mascotMotion==='reduced'?'reduced':'system',readAloud:typeof v.readAloud==='boolean'?v.readAloud:true,speechRate:typeof v.speechRate==='number'&&Number.isFinite(v.speechRate)&&v.speechRate>=0.75&&v.speechRate<=1.5?v.speechRate:1,briskyVoice:briskyVoices.some(voice=>voice.value===v.briskyVoice)?v.briskyVoice:'Kore',voicePreviewCaptions:typeof v.voicePreviewCaptions==='boolean'?v.voicePreviewCaptions:true,speechVoice:typeof v.speechVoice==='string'&&v.speechVoice.length<=500?v.speechVoice:''};}catch{return {...defaultPreferences};}}
export function useBrowserPreferences(){const raw=useSyncExternalStore(subscribe,snapshot,()=>''),preferences=useMemo(()=>parse(raw),[raw]);return {preferences,save:(changes:Partial<BrowserPreferences>)=>{try{localStorage.setItem(key,JSON.stringify(parse(JSON.stringify({...parse(snapshot()),...changes}))));window.dispatchEvent(new Event(event));return true;}catch{return false;}}};}
export function readBrowserPreferences(){return parse(snapshot());}
