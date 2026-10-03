# Audio test fixtures

Synthetic and original: a 2-second 440 Hz sine tone, generated with ffmpeg 7 (`jrottenberg/ffmpeg:7-alpine`), one file per supported format. Each carries the tags title `ToneTitle`, artist `ToneArtist`, album `ToneAlbum`, track 4, year 2020, genre `Test`; the FLAC and M4A also carry a 64x64 orange PNG cover (about #E8642C after ffmpeg's colour conversion). MP3 fixtures are built in code (`Mp3Fixture`). No real music lives in this repository.
