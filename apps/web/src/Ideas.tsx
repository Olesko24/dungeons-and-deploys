import { type FormEvent, useEffect, useState } from "react";
import { api } from "./api.ts";

type Idea = { id: number; title: string; text: string; status: "open" | "planned" | "done" | "rejected"; author: string; votes: number; voted: boolean };
type IdeaList = { ideas: Idea[]; left: number };

/** Players suggest ideas for the game and upvote them. The status is set by the admin. */
export function Ideas() {
  const [list, setList] = useState<IdeaList | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => void api<IdeaList>("/ideas").then(setList), []);

  async function act(path: string, body: object) {
    try {
      setList(await api<IdeaList>(path, body));
      setMessage("");
      return true;
    } catch (err) {
      setMessage((err as Error).message);
      return false;
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await act("/ideas", { title, text })) {
      setTitle("");
      setText("");
    }
  }

  if (!list) return <section className="panel"><p>Loading…</p></section>;
  return (
    <section className="panel">
      <h2>Ideas</h2>
      <p className="dim">What should come next? Suggest an idea or upvote the ones you want. The most wanted ones get built first.</p>
      <form className="idea-form" onSubmit={submit}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Your idea in a few words" aria-label="Idea title" minLength={3} maxLength={80} required />
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Details, optional" aria-label="Idea details" maxLength={500} rows={3} />
        <button type="submit" className="small" disabled={list.left === 0}>{list.left === 0 ? "3 ideas today, back tomorrow" : `Suggest · ${list.left} left today`}</button>
      </form>
      {message && <p className="error" role="alert">{message}</p>}
      {list.ideas.length === 0 && <p className="dim">No ideas yet. Be the first.</p>}
      <ul className="ideas">
        {list.ideas.map((i) => (
          <li key={i.id} className={i.status}>
            <button type="button" className={`small vote ${i.voted ? "" : "ghost"}`} aria-pressed={i.voted} onClick={() => act(`/ideas/${i.id}/vote`, {})} title={i.voted ? "Take your vote back" : "Vote for this idea"}>
              ▲ {i.votes}
            </button>
            <div>
              <strong>{i.title}</strong>
              {i.status !== "open" && <span className={`idea-status ${i.status}`}> · {i.status}</span>}
              {i.text && <p className="dim">{i.text}</p>}
              <p className="dim small-text">#{i.id} by {i.author}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
