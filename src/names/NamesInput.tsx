interface Props {
  text: string; // the paste box
  onText: (text: string) => void;
  onPaste: () => void;
}

// The first step: which file names. They are pasted, one per line (a full path is cut down to its name).
export function NamesInput({ text, onText, onPaste }: Props) {
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
        <p>Find the regex for your metadata.</p>
      </div>

      <div className="section-label">
        <span className="cap">Names</span>
        <span className="rule" />
      </div>

      <div className="in-paste">
        <label htmlFor="in-text">Paste the names, one per line</label>
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
    </section>
  );
}
