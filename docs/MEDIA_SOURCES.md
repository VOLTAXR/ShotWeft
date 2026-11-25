# Demo Media Sources

Media download date: 2026-11-20.
Original media and license links are listed below.
The demo app reads media files from the project.

| Local file | Author and source | License and use |
| --- | --- | --- |
| before-the-tide.jpg | [Michael McGarry · Rocky Ocean Coastline in Oregon, USA](https://www.pexels.com/photo/rocky-ocean-coastline-in-oregon-usa-15726088/) | [Pexels License](https://www.pexels.com/license/). 1600 px version. Cover and coastal shot. |
| coastal-trail.jpg | [Bill Kuffrey · Haystack Rock by Bill Kuffrey](https://commons.wikimedia.org/wiki/File:Haystack_Rock_by_Bill_Kuffrey.jpg) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Original file. Forest-path shot. |
| afterglow.jpg | [Veronika Andrews · Scenic View of Cannon Beach and Haystack Rock at Sunset](https://www.pexels.com/photo/scenic-view-of-cannon-beach-and-haystack-rock-at-sunset-34887111/) | [Pexels License](https://www.pexels.com/license/). 1600 px version. Sunset shot. |
| waves.mp4, waves.jpg | [EJ Merl · Stunning Aerial View of Oregon Coast Waves](https://www.pexels.com/video/stunning-aerial-view-of-oregon-coast-waves-31069202/) | [Pexels License](https://www.pexels.com/license/). First 5 seconds scaled to 960 × 540 and converted to 30 fps. Cover extracted at 1 second. |
| coastal-mist.mp4, coastal-mist.jpg | [Chris · Serene Oregon Coastline with Foggy Rocks](https://www.pexels.com/video/serene-oregon-coastline-with-foggy-rocks-31664993/) | [Pexels License](https://www.pexels.com/license/). Clip scaled to 540 × 960. Cover extracted at 1 second. |

Both videos were converted to silent H.264.
Photos are cropped to the storyboard aspect ratio for display.

## V2 engineering demos

The M2 demo reuses byte-identical copies of the sources listed above: `demos/m2/media/coast.jpg` is `before-the-tide.jpg`, `trail.jpg` is `coastal-trail.jpg`, `glow.jpg` is `afterglow.jpg`, and `broll.mp4` is `coastal-mist.mp4`. Its `narration.m4a` is synthetic Microsoft Huihui SAPI speech generated locally for this fixture, not human narration.

The M3 demo uses original test media: FFmpeg `testsrc2` for the presenter pattern, `smptebars` and a synthetic tone for B-roll, and the same local SAPI voice for narration. The B-roll tone is intentionally muted in the rendered output. No wallstreet-explainer example assets, voice recordings, or fonts are included in either demo.
## V2 M4 component demo

The M4 demo (`demos/m4/`) reuses `demos/m2/media/coast.jpg`, a byte-identical copy of `before-the-tide.jpg` above (Pexels License). The map uses [Natural Earth](https://www.naturalearthdata.com/) 110 m land polygons, which are public domain; they were simplified to 117 polygons / 2,162 points and embedded in the demo plan, with no runtime download. The 110 m dataset mirror used for conversion is [martynafford/natural-earth-geojson](https://github.com/martynafford/natural-earth-geojson) (data derived from Natural Earth, public domain).

The M4 demo audio is digital silence: no narration, speech or music is included, and no synthetic voice is used. Its map is a schematic teaching graphic, not a historical atlas.
