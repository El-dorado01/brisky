import unittest
from detection_views import inverse_point, source_face, suppress, matched_labels


class ViewTests(unittest.TestCase):
    def test_pixel_landmarks_and_box_edges_have_distinct_rotation_offsets(self):
        self.assertEqual(inverse_point(17, 1, 90, 10, 20), (1, 2))
        face = [14,1,4,3] + [17,1]*5 + [.99]
        restored = source_face(face,90,10,20)
        self.assertEqual(restored[:4],[1,2,3,4])
        self.assertEqual(restored[4:14],[1,2]*5)
        for angle,box,point in [(180,[6,14,3,4],[8,17]),(270,[2,6,4,3],[2,8])]:
            other = source_face(box+point*5+[.99],angle,10,20)
            self.assertEqual(other[:4],[1,2,3,4])
            self.assertEqual(other[4:14],[1,2]*5)

    def test_rotations_and_scaling_restore_non_square_source_coordinates(self):
        for angle, point in [(0,(1,2)),(90,(17,1)),(180,(8,17)),(270,(2,8))]:
            self.assertEqual(inverse_point(*point,angle,10,20),(1,2))
        restored = source_face([1,2,3,4]+[1,2]*5+[.9],0,10,20,.5,.5)
        self.assertEqual(restored[:4],[2,4,6,8])
        self.assertEqual(restored[4:14],[2,4]*5)
        padded = source_face([97,98,3,4]+[97,98]*5+[.9],0,202,212,padding=96)
        self.assertEqual(padded[:4],[1,2,3,4])
        self.assertEqual(padded[4:14],[1,2]*5)

    def test_duplicate_views_keep_highest_score_and_separate_faces(self):
        low = [1,1,10,10]+[0]*10+[.91]
        high = [1,1,10,10]+[0]*10+[.98]
        other = [30,30,10,10]+[0]*10+[.95]
        self.assertEqual(suppress([low,other,high]),[high,other])

    def test_matching_is_one_to_one_and_maximum_cardinality(self):
        self.assertEqual(matched_labels([[0,0,1,1]]*2,[[0,0,1,1]]),{0})
        # First prediction can explain either label, second can explain only label zero.
        self.assertEqual(matched_labels([[0,0,2,1],[0,0,1,1]],[[0,0,1,1],[1,0,1,1]],.5),{0,1})


if __name__ == '__main__': unittest.main()
