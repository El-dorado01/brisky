import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
import numpy as np
from robust_sface import RobustSFace,ContextDetector
from development_recheck import decision


class RobustReferenceTests(unittest.TestCase):
    def engine(self,faces):
        engine=RobustSFace.__new__(RobustSFace)
        engine.cv=SimpleNamespace(resize=lambda image,size:np.zeros((size[1],size[0],3),dtype=np.uint8))
        native=Mock();native.detect.return_value=(None,None)
        engine.detector=SimpleNamespace(detect=lambda image:(None,np.array(faces,dtype=np.float32) if faces else None),detector=native)
        return engine

    def test_broad_reference_can_enroll_one_contained_face_without_changing_user_box(self):
        target=[.1,.1,.8,.8];engine=self.engine([[30,30,40,40]+[35,35]*5+[.99]])
        face,failure=engine.reference_face(np.zeros((100,100,3),dtype=np.uint8),target)
        self.assertIsNone(failure);self.assertIsNotNone(face)
        self.assertEqual(target,[.1,.1,.8,.8]);self.assertEqual(engine.reference_status['status'],'adjust_selection')

    def test_multiple_contained_faces_abstain(self):
        engine=self.engine([[5,5,35,35]+[15,15]*5+[.99],[55,55,35,35]+[65,65]*5+[.99]])
        face,failure=engine.reference_face(np.zeros((100,100,3),dtype=np.uint8),[0,0,1,1])
        self.assertIsNone(face);self.assertEqual(failure,'ambiguous_selection')

    def test_probe_identity_decision_abstains_on_ambiguous_or_low_scores(self):
        gallery={'a':[{'embedding':[1.,0.],'source_id':'a'}],'b':[{'embedding':[.99,.01],'source_id':'b'}]}
        self.assertIsNone(decision([1.,0.],gallery))
        self.assertIsNone(decision([0.,1.],{'a':gallery['a']}))
        self.assertEqual(decision([1.,0.],{'a':gallery['a']}),'a')

    def test_probe_tiles_are_bounded_and_restore_boxes_and_landmarks_without_labels(self):
        cv=SimpleNamespace(resize=lambda image,size:np.zeros((size[1],size[0],3),dtype=np.uint8))
        detector=Mock();detector.detect.return_value=(None,np.array([[20,20,80,80]+[40,40]*5+[.99]],dtype=np.float32))
        context=ContextDetector(cv,detector)
        context.full=SimpleNamespace(detect=lambda image:(None,None),cached_key='same-frame')
        _,faces=context.detect(np.zeros((100,100,3),dtype=np.uint8))
        self.assertEqual(len(faces),4);self.assertEqual(detector.detect.call_count,4)
        self.assertEqual(list(faces[0][:6]),[10,10,40,40,20,20])
        context.detect(np.zeros((100,100,3),dtype=np.uint8))
        self.assertEqual(detector.detect.call_count,4)


if __name__=='__main__':unittest.main()
