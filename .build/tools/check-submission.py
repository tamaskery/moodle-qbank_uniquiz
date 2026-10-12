"""Check the actual distributable ZIP against Marketplace packaging rules."""
import pathlib
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
    names = [item.filename for item in archive.infolist() if not item.is_dir()]
    assert len(names) == len(set(names)), 'Duplicate archive entries'
    for name in names:
        assert name.startswith('uniquiz/') and '..' not in name, name
        parts = pathlib.PurePosixPath(name).parts
        assert not set(parts) & {'.build', '.github', '.git', 'node_modules', 'submission'}, name
        if '/lang/' in name:
            assert name == 'uniquiz/lang/en/qbank_uniquiz.php', 'Non-English language file: ' + name
        # Moodle's native compiler strips source comments from minified artifacts;
        # their complete source headers are retained in amd/src and source maps.
        if pathlib.PurePosixPath(name).suffix in {'.php', '.js', '.css', '.mustache'} and '/amd/build/' not in name:
            source = archive.read(name).decode('utf-8')
            assert '@copyright 2026 Tamas Kery' in source, 'Missing copyright: ' + name
            assert '@license' in source and 'GNU GPL v3 or later' in source, 'Missing licence: ' + name
            assert 'Moodle is free software' in source, 'Missing boilerplate: ' + name
    assert 'uniquiz/COPYING.txt' in names
    assert 'uniquiz/lang/en/qbank_uniquiz.php' in names
    print(f'Marketplace package checks passed: {len(names)} files, English only, source licence/copyright headers.')
