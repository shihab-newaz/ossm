"use client";

import { UploadCloud } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { UploadList, useUploadQueue } from "./UploadQueue";
import { DEFAULT_LICENSE, LICENSES, type License } from "./uploader";

export function UploadScreen() {
  const { items, add } = useUploadQueue("AUDIO");
  const [dragging, setDragging] = useState(false);
  // Applies to files added after it is chosen.
  const [license, setLicense] = useState<License>(DEFAULT_LICENSE);
  const input = useRef<HTMLInputElement>(null);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    add(Array.from(event.dataTransfer.files), license);
  }

  return (
    <div className="flex flex-col gap-8 py-8">
      <h1 className="font-display text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] md:text-4xl md:leading-[42px]">Upload</h1>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-banner border-2 border-dashed px-6 py-12 text-center ${
          dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-bg-subtle"
        }`}
      >
        <UploadCloud size={40} aria-hidden className="text-fg-subtle" />
        <p className="font-display text-xl font-bold">Drop music here</p>
        <p className="text-fg-muted">MP3, FLAC, M4A, OGG/Opus or WAV, up to 250 MB each.</p>
        <div className="flex items-center gap-2 text-[14px]">
          <label htmlFor="license" className="font-semibold">
            License
          </label>
          <select
            id="license"
            value={license}
            onChange={(e) => setLicense(e.target.value as License)}
            className="h-10 rounded-card border border-border-strong bg-surface px-3"
          >
            {LICENSES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => input.current?.click()}
          className="h-11 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent hover:bg-accent-hover active:scale-[0.97]"
        >
          Choose files
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept="audio/*,.mp3,.flac,.m4a,.ogg,.opus,.wav"
          aria-label="Audio files"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            add(Array.from(e.target.files ?? []), license);
            e.target.value = "";
          }}
        />
      </div>
      <UploadList items={items} kind="AUDIO" />
    </div>
  );
}
