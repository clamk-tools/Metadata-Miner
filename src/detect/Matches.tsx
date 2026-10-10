import type { DetectAnswer } from "../python/contract";

// How many names the pattern reads, and the ones it does not (click one to use it as the sample and widen the
// pattern to fit it).
export function MatchSummary({ answer, busy, onPick }: { answer: DetectAnswer; busy: boolean; onPick: (index: number) => void }) {
  return (
    <div className="dt-matches">
      <div className="is-legend">
        <span className="ok" role="status" data-testid="matched">
          Matched {answer.matched} of {answer.total} names
        </span>
        {answer.unmatched_count > 0 && <span>{answer.unmatched_count} get blank values. Click one to use it as the sample and widen the pattern to fit it:</span>}
      </div>
      {answer.unmatched.length > 0 && (
        <div className="dt-unmatched">
          {answer.unmatched.map((u) => (
            <button key={u.index} type="button" className="compact danger" disabled={busy} onClick={() => onPick(u.index)}>
              {u.name}
            </button>
          ))}
          {answer.unmatched_count > answer.unmatched.length && <span>+{answer.unmatched_count - answer.unmatched.length} more</span>}
        </div>
      )}
    </div>
  );
}

// The first few names with what the pattern reads from each.
export function MatchRows({ answer, colorOf }: { answer: DetectAnswer; colorOf: (name: string | null) => number }) {
  const names = answer.fields.map((f) => f.name);
  return (
    <div className="dt-matches">
      <div className="is-table-wrap">
        <table className="is-table">
          <thead>
            <tr>
              <th>Name</th>
              {names.map((n) => (
                <th key={n} className={`g${colorOf(n)}`}>
                  <span className="dot" />
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {answer.rows.map((row) => (
              <tr key={row.index}>
                <td className="is-fn">{row.name}</td>
                {names.map((n) => (
                  <td key={n}>{row.values[n] ?? "–"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
