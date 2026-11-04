import unittest
from development_report import diagnostic


class DevelopmentReportTests(unittest.TestCase):
    def test_entire_gallery_file_is_excluded_and_unenrollable_faces_remain(self):
        samples=[{'id':'a','identity':'p1','source_id':'first','embedding':[1.,0.]},
                 {'id':'b','identity':None,'source_id':'first','embedding':[1.,0.]},
                 {'id':'c','identity':'p1','source_id':'second','embedding':[1.,0.]},
                 {'id':'d','identity':'no-reference','source_id':'third','embedding':None},
                 {'id':'e','identity':None,'source_id':'third','embedding':[0.,1.]}]
        report=diagnostic(samples,.55)
        self.assertEqual(report['probeFaces'],3)
        self.assertEqual(report['correctKnown'],1)
        self.assertEqual(report['namedButUnenrollableProbes'],1)
        self.assertEqual(report['extractionFailures'],1)
        self.assertEqual(report['unknownFalseAccepts'],0)

    def test_wrong_unknown_match_is_not_reported_as_correct(self):
        samples=[{'id':'a','identity':'p1','source_id':'first','embedding':[1.,0.]},
                 {'id':'b','identity':None,'source_id':'second','embedding':[1.,0.]}]
        report=diagnostic(samples,.55)
        self.assertEqual(report['unknownFalseAccepts'],1)
        self.assertEqual(report['correctKnown'],0)


if __name__=='__main__':unittest.main()
