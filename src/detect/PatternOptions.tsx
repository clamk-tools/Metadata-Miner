import { Example, ExampleCase, Info } from "./help";

// The two options sent with every request. Both are on by default.
export interface Options {
  generalize: boolean;
  anchor: boolean;
}

// The two checkboxes under the pattern, each with an "i" that shows a worked example of ticked against unticked.
export function PatternOptions({ options, busy, onChange }: { options: Options; busy: boolean; onChange: (name: keyof Options, value: boolean) => void }) {
  return (
    <div className="dt-opts">
      <div className="dt-opt-row">
        <label className="dt-opt">
          <input type="checkbox" checked={options.anchor} disabled={busy} onChange={(e) => onChange("anchor", e.target.checked)} />
          Anchor with the neighbouring part on each side
        </label>
        <Info id="dt-help-anchor" label="What anchoring does">
          Adds the text just before and just after your labels to the pattern, so it can only match in the right place in the name.
          <Example label="Channel" before="plate1_B03_s2_w1_" hit="DAPI" after=".tif">
            <ExampleCase on pattern={String.raw`w\d+_(?P<Channel>[A-Za-z0-9]+)`} result="reads DAPI, GFP, Cy5: correct" />
            <ExampleCase on={false} pattern={String.raw`(?P<Channel>[A-Za-z0-9]+)`} result="reads plate1: wrong place" />
          </Example>
        </Info>
      </div>
      <div className="dt-opt-row">
        <label className="dt-opt">
          <input type="checkbox" checked={options.generalize} disabled={busy} onChange={(e) => onChange("generalize", e.target.checked)} />
          Allow fixed text to vary in its numbers
        </label>
        <Info id="dt-help-numbers" label="What letting the numbers vary does">
          Writes the numbers you did not label as “any number”, so w1 also matches w2 and w3. Untick it to keep them exactly as in the sample name.
          <Example label="Well" before="plate1_" hit="B03" after="_s2_w1_DAPI.tif" note="432 names: 2 plates, 3 sites.">
            <ExampleCase on pattern={String.raw`plate\d+_(?P<Well>[A-Z]\d{2})_s\d+`} result="matches all 432 names" />
            <ExampleCase on={false} pattern={String.raw`plate1_(?P<Well>[A-Z]\d{2})_s2`} result="matches 72 names: plate 1, site 2 only" />
          </Example>
        </Info>
      </div>
    </div>
  );
}
