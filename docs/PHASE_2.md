# Phase 2 Feature Notes

## Scenes and Shots

- Add or edit scenes on the Script page.
- Drag scene handles to reorder them; arrow keys also reorder.
- Deleting a scene clears its shot associations. Undo restores the associations.
- Search, filter, duplicate, and delete shots on the Shots page.
- Drag handles in both the shot list and timeline to reorder.
- Shot order stays synchronized between the list and timeline.
- Shot property changes update the canvas and preview duration.

## Media and Storyboards

- Upload images or videos in the Media page.
- JPG, PNG, and WebP images are limited to 25 MB.
- MP4 and WebM videos are limited to 120 MB.
- Playable codecs depend on the browser.
- Open a media preview and choose "Use for current shot".
- Adjust crop zoom and drag the canvas to move the crop position.
- Arrow keys also nudge the crop.
- Crop parameters are stored separately from the original file.
- Play a video or seek, then choose "Extract keyframe".
- When the video belongs to the current shot, the keyframe becomes its storyboard image.
- Other keyframes can be associated manually from the media library.

## Saving and Preview

- IndexedDB stores projects, original files, thumbnails, and canvas crops.
- Edits save automatically; the editor header shows save status.
- Undo and redo cover scenes, shots, aspect ratios, crops, and media associations.
- Uploaded media and extracted frames remain in the media library.
- The undo history keeps the latest 40 steps and restores with the project.
- Drag the timeline playhead to locate a shot.
- Images and videos preview for each shot duration.
- Preview is muted; short videos stop on their final frame.

## Later Phases

- Konva annotations, layer editing, and object transforms.
- ZIP import/export plus PNG and PDF export.
- Audio tracks and mixing.