"""Create a private local labelling sheet; never guesses names or uploads media."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from extract_sface import SFacePilot


PAGE = r'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brisky private footage review</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f6f5fb;color:#25283d;font:15px system-ui,sans-serif}header{position:sticky;top:0;z-index:5;background:#fffffff2;border-bottom:1px solid #e5e1f0;padding:16px 5vw;backdrop-filter:blur(12px)}h1{font-size:22px;margin:0 0 8px}p{line-height:1.6;margin:8px 0;color:#646980}button,select{font:inherit;border:1px solid #ddd8ed;background:white;border-radius:10px;padding:9px 12px}button{cursor:pointer}button.primary{background:#7363de;color:white;border:0}main{max-width:1200px;margin:auto;padding:24px}.clip{background:white;border:1px solid #e5e1f0;border-radius:18px;padding:20px;margin-bottom:24px}.frames{display:grid;grid-template-columns:1fr 1fr;gap:24px}h2{font-size:18px;overflow-wrap:anywhere}.frame{min-width:0}.picture{position:relative;max-width:430px;margin:auto;touch-action:none;cursor:crosshair}.picture img{display:block;width:100%;height:auto;border-radius:10px}.box{position:absolute;border:2px solid #efbc49;pointer-events:none}.box b{position:absolute;top:0;left:0;background:#efbc49;color:#222;font-size:12px;padding:2px 4px}.face{display:flex;align-items:center;gap:8px;margin-top:8px}.face select{min-width:0;flex:1}.face button{color:#b03d4d}label.reviewed{display:flex;gap:8px;margin-top:14px;font-weight:600}small{color:#646980}#status{margin-left:12px}.notice{max-width:1000px}@media(max-width:680px){.frames{grid-template-columns:1fr}main{padding:14px}header{position:static;padding:16px}#status{display:block;margin:8px 0}}</style>
<header><h1>Who appears in these videos?</h1><p class="notice">Private, local review. Yellow boxes are detector suggestions, not identities. Choose the correct person for each face, remove extra boxes, and drag on the image to add a missed face. Mark each checked frame “Reviewed.” No names are guessed and nothing is uploaded.</p><button class="primary" id="export">Save labels JSON</button><span id="status" role="status"></span></header><main id="clips"></main>
<script>const DATA=__DATA__;const key='brisky-face-review-'+DATA.dataset;let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{}const frames=DATA.frames.map(f=>({...f,faces:f.faces.map((b,i)=>({id:i+1,box:b,person:''})),reviewed:false,...saved[f.id]}));
const el=(tag,attrs={},text)=>{const n=document.createElement(tag);Object.assign(n,attrs);if(text!==undefined)n.textContent=text;return n};
function persist(){localStorage.setItem(key,JSON.stringify(Object.fromEntries(frames.map(f=>[f.id,{faces:f.faces,reviewed:f.reviewed}]))));document.getElementById('status').textContent=frames.filter(f=>f.reviewed).length+' / '+frames.length+' frames reviewed. Progress stays in this browser.';}
// Preserve owner-entered names attached to saved faces when reopening this sheet.
DATA.participants=[...new Set([...DATA.participants,...frames.flatMap(f=>f.faces.map(face=>face.person)).filter(name=>name&&name!=='Unknown / not enrolled')])];
const nameControls=el('div'),nameInput=el('input',{id:'new-person',type:'text',placeholder:'Add another person’s name',maxLength:80,ariaLabel:'New person name'}),addName=el('button',{id:'add-person',type:'button'},'Add name');
nameControls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:12px';nameInput.style.cssText='font:inherit;min-width:180px;border:1px solid #ddd8ed;border-radius:10px;padding:9px 12px';
addName.onclick=()=>{const name=nameInput.value.trim().replace(/\s+/g,' ');if(!name||name==='Unknown / not enrolled')return;const existing=DATA.participants.find(n=>n.toLocaleLowerCase()===name.toLocaleLowerCase());if(!existing){DATA.participants.push(name);for(const select of document.querySelectorAll('.face select'))select.add(el('option',{value:name},name),select.options.length-1)}nameInput.value='';persist()};
nameInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addName.click()}};nameControls.append(nameInput,addName);document.querySelector('header').append(nameControls);
function draw(frame,container,rows){container.querySelectorAll('.box').forEach(n=>n.remove());rows.replaceChildren();for(const face of frame.faces){const b=el('div',{className:'box'});Object.assign(b.style,{left:face.box[0]*100+'%',top:face.box[1]*100+'%',width:face.box[2]*100+'%',height:face.box[3]*100+'%'});b.append(el('b',{},String(face.id)));container.append(b);const row=el('div',{className:'face'});row.append(el('span',{},'Face '+face.id));const select=el('select',{'ariaLabel':frame.id+' face '+face.id});for(const name of ['',...DATA.participants,'Unknown / not enrolled'])select.append(el('option',{value:name},name||'Choose person…'));select.value=face.person;select.onchange=()=>{face.person=select.value;frame.reviewed=false;renderCheck(frame);persist()};const remove=el('button',{type:'button'},'Remove box');remove.onclick=()=>{frame.faces=frame.faces.filter(f=>f!==face);frame.reviewed=false;draw(frame,container,rows);renderCheck(frame);persist()};row.append(select,remove);rows.append(row);}}
function renderCheck(frame){document.getElementById('review-'+frame.id).checked=frame.reviewed;}
for(const clip of [...new Set(frames.map(f=>f.source_id))]){const group=frames.filter(f=>f.source_id===clip),section=el('section',{className:'clip'});section.append(el('h2',{},clip+' · '+group[0].filename));const columns=el('div',{className:'frames'});for(const frame of group){const wrapper=el('section',{className:'frame'});wrapper.append(el('p',{},frame.id+' · '+frame.frame_s.toFixed(2)+'s'));const picture=el('div',{className:'picture'}),image=el('img',{src:frame.image,alt:frame.id+' source frame',draggable:false});picture.append(image);const rows=el('div');wrapper.append(picture,el('small',{},'Drag a rectangle around a missed face. No visible faces? Remove all boxes and mark reviewed.'),rows);const checked=el('input',{type:'checkbox',id:'review-'+frame.id,checked:frame.reviewed});checked.onchange=()=>{if(checked.checked&&frame.faces.some(f=>!f.person)){checked.checked=false;alert('Choose a person for every remaining face box first.');return}frame.reviewed=checked.checked;persist()};const label=el('label',{className:'reviewed'});label.append(checked,document.createTextNode('Reviewed this frame'));wrapper.append(label);draw(frame,picture,rows);let start=null;const point=e=>{const r=picture.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}};picture.onpointerdown=e=>{start=point(e);picture.setPointerCapture(e.pointerId)};picture.onpointerup=e=>{if(!start)return;const end=point(e),box=[Math.min(start.x,end.x),Math.min(start.y,end.y),Math.abs(end.x-start.x),Math.abs(end.y-start.y)];start=null;if(box[2]<.01||box[3]<.01)return;frame.faces.push({id:Math.max(0,...frame.faces.map(f=>f.id))+1,box,person:''});frame.reviewed=false;draw(frame,picture,rows);renderCheck(frame);persist()};picture.onpointercancel=()=>{start=null};columns.append(wrapper)}section.append(columns);document.getElementById('clips').append(section)}
document.getElementById('export').onclick=()=>{const reviewed=frames.filter(f=>f.reviewed);if(!reviewed.length){alert('Review at least one frame first.');return}const data={version:1,dataset:DATA.dataset,participants:DATA.participants,frames:frames.map(f=>({id:f.id,source_id:f.source_id,image:f.image,frame_s:f.frame_s,reviewed:f.reviewed,faces:f.faces}))};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=el('a',{href:url,download:'brisky-face-labels.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};persist();</script></html>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', type=Path, required=True)
    parser.add_argument('--participants', type=Path, required=True)
    parser.add_argument('--ffmpeg', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--models', type=Path, required=True)
    parser.add_argument('--no-detection', action='store_true', help='Prepare human labels without model proposals; preserve unseen test footage')
    args = parser.parse_args()
    records = json.loads(args.inventory.read_text(encoding='utf-8'))['records']
    participants = json.loads(args.participants.read_text(encoding='utf-8'))['participants']
    if args.output.exists():
        raise ValueError('Use a new output directory to preserve any existing review')
    args.output.mkdir(parents=True)
    (args.output/'frames').mkdir()
    import cv2
    detector = None if args.no_detection else SFacePilot(args.models/'face_detection_yunet_2023mar.onnx', args.models/'face_recognition_sface_2021dec.onnx')
    frames = []
    for record in records:
        if record.get('error'):
            continue
        source = Path(record['file'])
        if hashlib.sha256(source.read_bytes()).hexdigest() != record['sha256']:
            raise ValueError('Source changed since inventory; refresh inventory first')
        for index, fraction in enumerate((.2, .7), 1):
            time = record['duration']*fraction
            identifier = f'{record["id"]}-frame-{index}'
            image = args.output/'frames'/f'{identifier}.jpg'
            subprocess.run([args.ffmpeg,'-hide_banner','-loglevel','error','-nostdin','-ss',str(time),'-i',str(source),'-an','-frames:v','1','-vf',r'scale=min(960\,iw):-2,setsar=1','-threads','1','-q:v','3',str(image)],check=True,timeout=30,capture_output=True)
            pixels = cv2.imread(str(image))
            if pixels is None:
                raise ValueError('Prepared frame could not be decoded')
            height,width = pixels.shape[:2]
            faces = None
            if detector is not None:
                detector.detector.setInputSize((width,height))
                _,faces = detector.detector.detect(pixels)
            boxes=[]
            if faces is not None:
                for face in faces[:20]:
                    x,y=max(0,float(face[0])/width),max(0,float(face[1])/height)
                    w,h=min(float(face[2])/width,1-x),min(float(face[3])/height,1-y)
                    if w>0 and h>0:
                        boxes.append([x,y,w,h])
            frames.append({'id':identifier,'source_id':record['id'],'filename':source.name,'frame_s':time,'image':f'frames/{identifier}.jpg','faces':boxes})
    dataset=hashlib.sha256(json.dumps([(r['id'],r['sha256']) for r in records]).encode()).hexdigest()
    data={'dataset':dataset,'participants':participants,'frames':frames,'detectorProposals':not args.no_detection}
    (args.output/'frames.private.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    embedded=json.dumps(data).replace('<',r'\u003c')
    page = PAGE.replace('__DATA__',embedded)
    if args.no_detection:
        page = page.replace('Yellow boxes are detector suggestions, not identities.', 'No model was run. Draw a box around each visible face.')
    (args.output/'review.html').write_text(page,encoding='utf-8')
    print(json.dumps({'clips':len(records),'frames':len(frames),'detectedBoxes':sum(len(f['faces']) for f in frames),'stage':'Ready for human identity labels; no recognition accuracy scored'}))


if __name__ == '__main__': main()
