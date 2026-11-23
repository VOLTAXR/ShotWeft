# ShotWeft V1.5 Release Checklist

## Pre-Release Verification

- [ ] GitHub Actions Linux and Windows jobs pass on the release commit. Linux runs the full regression; both platforms use `SHOTWEFT_REQUIRE_PDF=1` to verify installed-PDF export, page count, and every page image.
- [ ] Native Windows and Linux package acceptance passes. Open the generated PDFs and spot-check Chinese text. Full Windows CLI regression needs file-symlink permission; CI uses package verification to cover the Windows CLI and PDF workflow.
- [ ] Check the tarball allowlist. It should contain CLI build output, README, `package.json`, Agent guide, V1.5 release preparation notes, media sources, demo JPEGs, and third-party notices. Package verification must confirm `private: true`, scan development-machine paths, and reject source, screenshots, dependency directories, temporary files, and `.bak` files.
- [ ] Download the matching job artifacts, compare filenames, byte sizes, and SHA256 values against `release-manifest.json`, and independently verify the actual tarball with `SHA256SUMS.txt`. Check installation instructions, package version, and minimum Node.js version. See [V1.5 release notes](RELEASE_NOTES_V1.5.md).

## Requires User Confirmation

- [ ] Confirm the release strategy for the existing `main` and `v1.5.0` tag, and whether a new target branch is needed.
- [ ] Confirm the ShotWeft project license and the distribution terms for third-party dependencies and demo media. Sources: [release references and licenses](RELEASE_REFERENCES.md) and [media sources](MEDIA_SOURCES.md).
- [ ] Explicitly authorize the target commit for an official GitHub Release, whether and how the tag should be used, and the release assets. This task covers CI and local release preparation only; `private: true` still prevents accidental npm publication.