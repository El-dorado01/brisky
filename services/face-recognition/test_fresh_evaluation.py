import json
from pathlib import Path
import tempfile
import unittest

from fresh_evaluation import prepare, run, unknown_metrics, UNKNOWN


class FreshEvaluationTests(unittest.TestCase):
    def fixture(self, root):
        review=root/'review'; review.mkdir()
        frames=[]; labels=[]
        for i,(name,source) in enumerate([('new name','a'),(UNKNOWN,'a'),(UNKNOWN,'b')]):
            image=review/f'frame-{i}.jpg'; image.write_bytes(b'private fixture image')
            frame={'id':str(i),'source_id':source,'image':image.name,'frame_s':float(i)}
            frames.append(frame)
            labels.append({**frame,'reviewed':True,'faces':[{'id':1,'box':[.1,.1,.3,.3],'person':name}]})
        prepared=review/'frames.json'; prepared.write_text(json.dumps({'dataset':'fixed','participants':[],'frames':frames}))
        exported=root/'labels.json'; exported.write_text(json.dumps({'version':1,'dataset':'fixed','participants':['new name'],'frames':labels}))
        inventory=root/'inventory.json'; inventory.write_text(json.dumps({'records':[]}))
        return exported,prepared,inventory

    def test_gallery_file_context_is_excluded_and_known_probes_not_invented(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); args=self.fixture(root); output=root/'evaluation'
            counts=prepare(*args,output)
            self.assertEqual(counts['unknownProbeFaces'],1)
            self.assertEqual(counts['excludedGalleryContextFaces'],1)
            plan=json.loads((output/'plan.private.json').read_text())
            self.assertEqual([s['split'] for s in plan['samples']],['gallery','excluded_gallery_context','test_unknown'])
            self.assertEqual(plan['known_probe_count'],0)

    def test_modified_frame_metadata_is_rejected_before_output_is_created(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); args=self.fixture(root)
            labels=json.loads(args[0].read_text()); labels['frames'][0]['source_id']='different'
            args[0].write_text(json.dumps(labels))
            with self.assertRaisesRegex(ValueError,'metadata differs'): prepare(*args,root/'evaluation')
            self.assertFalse((root/'evaluation').exists())

    def test_unknown_extraction_failures_remain_in_counts_but_are_not_safe_rejections(self):
        result=unknown_metrics([{'embedding':None,'scores':[]},{'embedding':[1.,0.],'scores':[.8,.7]}],.55)
        self.assertEqual(result['wronglyMatchedUnknownFaces'],1)
        self.assertEqual(result['wrongProfileSuggestions'],2)
        self.assertEqual(result['unknownExtractionFailures'],1)
        self.assertEqual(result['unknownFalseAcceptRate'],.5)
        self.assertEqual(result['unknownFalseAcceptRateWhenExtracted'],1.)
        self.assertIsNone(result['knownRecall'])

    def test_failed_enrollment_does_not_open_test_images_and_run_cannot_be_repeated(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); output=root/'evaluation'; prepare(*self.fixture(root),output)
            seen=[]
            class NoFace:
                def __init__(self,*args): pass
                def extract(self,path,box): seen.append(path.name); return None,'no_face_detected'
            report=run(output,root,NoFace)
            self.assertEqual(seen,['frame-0.jpg'])
            self.assertEqual(report['status'],'blocked_no_usable_gallery_test_not_run')
            self.assertIsNone(report['unknownTest'])
            with self.assertRaises(FileExistsError): run(output,root,NoFace)


if __name__=='__main__': unittest.main()
