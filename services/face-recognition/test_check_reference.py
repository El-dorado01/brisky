import unittest
from check_reference import assess


def face(x,y,w,h): return [x,y,w,h]+[0]*10+[.99]


class ReferenceCheckTests(unittest.TestCase):
    def test_broad_selection_suggests_real_contained_face_without_declaring_ready(self):
        result=assess([.1,.1,.8,.8],[face(30,30,40,40)],100,100)
        self.assertEqual(result['status'],'adjust_selection')
        for a,b in zip(result['suggestedBox'],[.3,.3,.4,.4]): self.assertAlmostEqual(a,b)
        self.assertEqual(assess(result['suggestedBox'],[face(30,30,40,40)],100,100)['status'],'ready')

    def test_broad_selection_with_multiple_faces_is_not_snapped(self):
        self.assertEqual(assess([0,0,1,1],[face(10,10,35,35),face(55,55,35,35)],100,100),{'status':'ambiguous_selection'})

    def test_tiny_or_neighbouring_faces_and_whole_person_boxes_do_not_become_references(self):
        self.assertEqual(assess([0,0,.5,.5],[face(10,10,25,25)],100,100)['status'],'face_too_small')
        self.assertEqual(assess([0,0,.3,.3],[face(60,60,35,35)],100,100)['status'],'target_not_detected')
        self.assertEqual(assess([0,0,1,1],[face(30,30,35,35)],100,100)['status'],'target_not_detected')

    def test_matching_face_is_ready_but_missing_and_ambiguous_faces_are_not(self):
        self.assertEqual(assess([.2,.2,.4,.4],[face(20,20,40,40)],100,100)['status'],'ready')
        self.assertEqual(assess([.2,.2,.4,.4],[],100,100)['status'],'no_face_detected')
        self.assertEqual(assess([.2,.2,.4,.4],[face(20,20,40,40),face(21,21,40,40)],100,100)['status'],'ambiguous_selection')


if __name__=='__main__': unittest.main()
