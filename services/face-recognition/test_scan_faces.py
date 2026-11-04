import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from scan_faces import scan


class Feature:
    def __init__(self, values): self.values = values
    def reshape(self, *_): return self
    def tolist(self): return self.values


class ScanTests(unittest.TestCase):
    def engine(self, vector=None, reference=None, faces=None):
        face = [20, 20, 40, 40] + [0] * 10 + [.99]
        engine = SimpleNamespace(cv=SimpleNamespace(imread=lambda _: SimpleNamespace(shape=(100, 100, 3))),
                                 detector=Mock(), recognizer=Mock(), extract=Mock())
        engine.detector.detect.return_value = (1, [face] if faces is None else faces)
        engine.extract.return_value = (reference or [1., 0.], None)
        engine.recognizer.feature.return_value = Feature(vector or [1., 0.])
        return engine

    def manifest(self):
        return {'references': [{'id': 'manual-reference', 'image': 'reference.jpg', 'box': [.2, .2, .4, .4]}],
                'frames': [{'time': 3.5, 'image': 'sample.jpg'}], 'threshold': .55}

    def test_detected_face_keeps_source_time_and_normalized_box(self):
        result = scan(self.engine(), self.manifest())
        self.assertEqual(result['matches'], [{'frame': 3.5, 'box': [.2, .2, .4, .4], 'score': 1, 'referenceId': 'manual-reference'}])

    def test_dissimilar_face_is_not_suggested(self):
        self.assertEqual(scan(self.engine(vector=[0., 1.]), self.manifest())['matches'], [])

    def test_similar_other_person_reference_prevents_a_suggestion(self):
        engine=self.engine();manifest=self.manifest()
        manifest['competitors']=[{'id':'other','image':'other.jpg','box':[.2,.2,.4,.4]}]
        engine.extract.side_effect=[([1.,0.],None),([.99,.01],None)]
        self.assertEqual(scan(engine,manifest)['matches'],[])

    def test_failed_reference_does_not_scan_or_generate_matches(self):
        engine = self.engine(); engine.extract.return_value = (None, 'no_face_detected')
        result = scan(engine, self.manifest())
        self.assertEqual(result['referenceCount'], 0)
        engine.detector.detect.assert_not_called()

    def test_no_face_frame_is_counted_not_silently_dropped(self):
        engine = self.engine(); engine.detector.detect.return_value = (0, None)
        result = scan(engine, self.manifest())
        self.assertEqual(result['framesScanned'], 1)
        self.assertEqual(result['matches'], [])

    def test_tiny_and_nonfinite_faces_are_excluded(self):
        engine = self.engine(faces=[[0, 0, 12, 12]+[0]*11, [float('nan'), 0, 40, 40]+[0]*11])
        self.assertEqual(scan(engine, self.manifest())['matches'], [])

    def test_failed_frame_is_an_error_not_a_negative_match(self):
        engine = self.engine(); engine.cv.imread = lambda _: None
        with self.assertRaises(ValueError): scan(engine, self.manifest())

    def test_failed_recent_reference_falls_back_to_other_manual_tags(self):
        engine = self.engine()
        engine.extract.side_effect = [(None,'no_face_detected'),([1.,0.],None),([0.,1.],None)]
        manifest = self.manifest()
        manifest['references'] = [{'id': str(i),'sourceId':source,'image':'reference.jpg','box':[.2,.2,.4,.4]}
                                  for i,source in enumerate(('a','a','b'))]
        result = scan(engine,manifest)
        self.assertEqual(result['referenceCount'],2)
        self.assertEqual(result['matches'][0]['referenceId'],'1')
        self.assertEqual(engine.extract.call_count,3)

    def test_usable_references_prefer_distinct_sources_and_remain_capped_at_three(self):
        engine = self.engine()
        engine.extract.side_effect = [(vector,None) for vector in ([0.,1.],[1.,0.],[1.,0.],[0.,1.],[0.,1.])]
        manifest = self.manifest()
        manifest['references'] = [{'id':str(i),'sourceId':source,'image':'reference.jpg','box':[.2,.2,.4,.4]}
                                  for i,source in enumerate(('a','a','a','b','c'))]
        result = scan(engine,manifest)
        self.assertEqual(result['referenceCount'],3)
        self.assertEqual(result['matches'],[])


if __name__ == '__main__': unittest.main()
