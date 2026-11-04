import type {Metadata} from 'next';
import {SettingsView} from '@/components/settings/SettingsView';
export const metadata:Metadata={title:'Settings ? Brisky'};
export default async function SettingsPage({searchParams}:{searchParams:Promise<{section?:string}>}){const params=await searchParams;return <SettingsView initialSection={params.section}/>;}
