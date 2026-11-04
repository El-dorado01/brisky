"""Summarize development diagnostics without claiming calibrated/held-out accuracy."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path


def diagnostic(samples, cutoff):
    by_person=defaultdict(list)
    for sample in samples:
        if sample['identity'] is not None and sample['embedding'] is not None:
            by_person[sample['identity']].append(sample)
    gallery={person:sorted((s for s in rows if s['source_id']==min(r['source_id'] for r in rows)),key=lambda s:s['id'])[:3] for person,rows in by_person.items()}
    sources={r['source_id'] for rows in gallery.values() for r in rows}
    probes=[s for s in samples if s['source_id'] not in sources]
    out={'matchCutoff':cutoff,'enrolledIdentities':len(gallery),'gallerySourceFiles':len(sources),'probeFaces':len(probes),'knownProbes':sum(s['identity'] in gallery for s in probes),'unenrolledProbes':sum(s['identity'] not in gallery for s in probes),'explicitlyUnknownProbes':sum(s['identity'] is None for s in probes),'namedButUnenrollableProbes':sum(s['identity'] is not None and s['identity'] not in gallery for s in probes),'correctKnown':0,'wrongKnown':0,'unknownFalseAccepts':0,'abstentions':0,'extractionFailures':0}
    for sample in probes:
        scores=[]
        if sample['embedding'] is None:
            out['extractionFailures']+=1
        else:
            scores=sorted(((max(sum(a*b for a,b in zip(sample['embedding'],ref['embedding'])) for ref in refs),person) for person,refs in gallery.items()),reverse=True)
        predicted=scores[0][1] if scores and scores[0][0]>=cutoff else None
        if predicted is None:out['abstentions']+=1
        elif sample['identity'] not in gallery:out['unknownFalseAccepts']+=1
        elif predicted==sample['identity']:out['correctKnown']+=1
        else:out['wrongKnown']+=1
    return out


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();results=[];inputs={}
    manifest=json.loads((args.directory/'annotations.manifest.private.json').read_text())
    prepared=json.loads((args.directory/'frames.private.json').read_text())
    snapshots=[p for p in args.directory.glob('labels-*.private.json') if hashlib.sha256(p.read_bytes()).hexdigest()==manifest['labels_sha256']]
    if len(snapshots)!=1:raise ValueError('Require the original checksum-matching labels snapshot')
    labels=json.loads(snapshots[0].read_text());reviewed=sum(f['reviewed'] for f in labels['frames'])
    for threshold in (.9,.75,.6):
        path=args.directory/f'development-embeddings-{threshold}.private.json';content=path.read_bytes();inputs[path.name]=hashlib.sha256(content).hexdigest();bundle=json.loads(content);samples=bundle['samples']
        results.append({'detectorThreshold':threshold,'labelledFaces':len(samples),'extractedFaces':sum(s['embedding'] is not None for s in samples),'fixedCutoffDiagnostic':diagnostic(samples,.55)})
    relaxed=json.loads((args.directory/'development-embeddings-0.75.private.json').read_text())['samples']
    preprocessing=json.loads((args.directory/'preprocessing-diagnostics.private.json').read_text())
    report={'date':'2026-11-01','status':'development_diagnostics_only_not_ready_for_automatic_tagging','reviewedFrames':reviewed,'labelledFaces':len(manifest['samples']),'sourceFiles':len({f['source_id'] for f in prepared['frames']}),'unknownLabelMeaning':'Different people from every named participant, confirmed by owner; names may be known to the owner but were not enrolled','scope':'Two reviewed sample frames per source file. Not an exhaustive video scan or calibrated held-out recognition test. No identity names/images/vectors are included here.','detectorPresets':results,'matchCutoffDevelopmentComparison':[diagnostic(relaxed,c) for c in (.2,.3,.363,.45,.55)],'preprocessingComparison':[{'variant':r['variant'],'extractedFaces':r['extractedFaces'],'labelledFaces':r['labelledFaces']} for r in preprocessing['results']],'formalEvaluation':'Not run: current extraction does not provide two enrolled identities with usable references from two distinct files each, plus separate known/unknown calibration/test sets.','selectionProtocol':'Reference file per identity is the lexicographically first file with a usable feature; up to three references. All gallery files are excluded from probes. Named identities with no usable references are counted as unenrolled, not silently excluded. These source files have not been verified as distinct original recordings.','decision':'Keep live settings unchanged and keep explicit user confirmation. Lowering cutoffs is not supported by these development results. Improve/compare the recogniser and evaluate on fresh recording-level splits.','privacy':'Owner-authorized local inference only; originals unchanged; embeddings and case-level data remain in ignored storage.','inputHashes':inputs}
    with args.output.open('x',encoding='utf-8') as handle:json.dump(report,handle,indent=2,allow_nan=False);handle.write('\n')
    print(json.dumps({'status':report['status'],'detectorCounts':[{'threshold':r['detectorThreshold'],'extracted':r['extractedFaces'],'total':r['labelledFaces']} for r in results],'defaultDiagnostic':results[0]['fixedCutoffDiagnostic'],'relaxedDiagnostic':diagnostic(relaxed,.363)}))


if __name__=='__main__':main()
