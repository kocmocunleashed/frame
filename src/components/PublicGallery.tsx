import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { PublishedView } from "../../shared/publications";
import { api } from "../lib/api";
import { Brand, Loading, ErrorMessage } from "./UI";
import { AutoSlide } from "./SlideRenderer";
export default function PublicGallery() {
  const [items, setItems] = useState<PublishedView[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      setItems(await api("/publications"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="public-gallery">
      <header>
        <a href="/explore" aria-label="Frame public gallery">
          <Brand />
        </a>
        <a className="button primary" href="/">
          Your workspace
          <ArrowRight size={16} />
        </a>
      </header>
      <main>
        <p className="eyebrow">SHARED WITH THE WORLD</p>
        <h1>Ideas worth a closer look.</h1>
        <p className="public-gallery-intro">
          Presentations their authors chose to make public.
        </p>
        {loading ? (
          <Loading label="Loading public presentations…" />
        ) : error ? (
          <ErrorMessage>
            {error}
            <button onClick={load}>Try again</button>
          </ErrorMessage>
        ) : items.length ? (
          <div className="public-deck-grid">
            {items.map((item) => (
              <a
                className="public-deck-card"
                href={`/view/${item.publication.id}`}
                key={item.publication.id}
              >
                <AutoSlide
                  doc={item.document}
                  slide={item.document.slides[0]}
                />
                <h2>{item.document.title}</h2>
                <p>
                  By {item.author} · version {item.publication.revision}
                </p>
              </a>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>A quiet start.</h2>
            <p>
              Public presentations will appear here when their owners publish
              them.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
