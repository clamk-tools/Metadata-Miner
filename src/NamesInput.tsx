import { useRef } from "react";

interface Props {
  text: string; // the paste box
  onText: (text: string) => void;
  reading: boolean; // a dropped folder is being walked
  onFiles: (files: File[]) => void;
  onPaste: () => void;
}

// The first step: which file names. Dropped or chosen files, or pasted names. A drop is handled by the page itself
// (App.tsx), anywhere on it; this only shows where to aim.
export function NamesInput({ text, onText, reading, onFiles, onPaste }: Props) {
  const picker = useRef<HTMLInputElement>(null);

  return (
    <section className="in" aria-labelledby="in-title">
      <div className="in-intro">
        <h2 id="in-title">
          From files to{" "}
          <span className="marked">
            Regex
            <svg viewBox="0 0 200 10" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M2 7 Q50 2 100 6 T198 5" vectorEffect="non-scaling-stroke" />
            </svg>
          </span>
        </h2>
        <p>
          Find the expression for your metadata.
          <br />
          Only file names are read.
        </p>
      </div>

      <div className="section-label">
        <span className="cap">Names</span>
        <span className="rule" />
      </div>

      <div className="in-ways">
        <div className="in-drop">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V9a1.5 1.5 0 0 0-1.5-1.5H12L10 5H4.5A1.5 1.5 0 0 0 3 6.5z" />
            <path d="M12 11v5M9.5 13.5L12 11l2.5 2.5" />
          </svg>
          <p className="in-drop-title">{reading ? "Reading the names…" : "Drop image files or a folder here"}</p>
          <p className="in-drop-hint">Anywhere on the page works.</p>
          <button type="button" disabled={reading} onClick={() => picker.current?.click()}>
            Choose files…
          </button>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            aria-label="Choose image files"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = ""; // choosing the same files again must count as a change
              if (files.length) onFiles(files);
            }}
          />
        </div>

        <div className="in-paste">
          <label htmlFor="in-text">Or paste the names, one per line</label>
          <textarea
            id="in-text"
            rows={7}
            spellCheck={false}
            value={text}
            placeholder={"plate1_B03_s2_w1_DAPI.tif\nplate1_B03_s2_w2_GFP.tif\nplate1_B04_s1_w1_DAPI.tif"}
            onChange={(e) => onText(e.target.value)}
          />
          <div className="in-actions">
            <button type="button" className="primary" disabled={!text.trim()} onClick={onPaste}>
              Use these names
            </button>
          </div>
        </div>
      </div>

      <p className="in-privacy">Only the names are read. No file is opened, and nothing is uploaded.</p>
    </section>
  );
}
