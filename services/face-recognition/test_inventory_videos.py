import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from inventory_videos import inventory


class InventoryTests(unittest.TestCase):
    def test_nested_copies_are_fingerprinted_and_previous_footage_flagged(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); (root/'nested').mkdir()
            (root/'first.mp4').write_bytes(b'old-content')
            (root/'nested/copy.MOV').write_bytes(b'old-content')
            (root/'notes.txt').write_text('ignore')
            response=SimpleNamespace(stdout=json.dumps({'format':{'duration':'2.5'},'streams':[{'codec_type':'video','width':320,'height':240}]}))
            previous={'records':[{'sha256':hashlib.sha256(b'old-content').hexdigest()}]}
            with patch('inventory_videos.subprocess.run',return_value=response) as run:
                result=inventory(root,Path('fake-probe'),previous)
            self.assertEqual(len(result['records']),2)
            self.assertTrue(all(r['duplicates_previous'] for r in result['records']))
            self.assertEqual(run.call_count,2)
            self.assertEqual((root/'first.mp4').read_bytes(),b'old-content')

    def test_invalid_metadata_remains_an_explicit_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); (root/'broken.mp4').write_bytes(b'video')
            response=SimpleNamespace(stdout=json.dumps({'format':{'duration':'NaN'},'streams':[{'codec_type':'video'}]}))
            with patch('inventory_videos.subprocess.run',return_value=response):
                result=inventory(root,Path('fake-probe'),{})
            self.assertEqual(result['records'][0]['error'],'metadata_unavailable')
            self.assertNotIn('duration',result['records'][0])


if __name__=='__main__': unittest.main()
