import { useState } from "react";
import type { BrandKit } from "../../shared/design-library";
import { api } from "../lib/api";
import { ErrorMessage } from "./UI";
import { PaletteFields, FontFields } from "./ThemeDesigner";
export default function BrandKitEditor({
  kit,
  onChange,
}: {
  kit: BrandKit;
  onChange: (k: BrandKit) => void;
}) {
  const [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="design-form">
      <label>
        Brand kit name
        <input
          required
          maxLength={80}
          value={kit.name}
          onChange={(e) => onChange({ ...kit, name: e.target.value })}
        />
      </label>
      <h3>Logo</h3>
      {kit.logo && (
        <div className="brand-logo-preview">
          <img src={kit.logo.src} alt={kit.logo.alt} />
          <button
            className="button"
            type="button"
            onClick={() => onChange({ ...kit, logo: null })}
          >
            Remove logo
          </button>
        </div>
      )}
      <label className="brand-upload">
        {uploading ? "Uploading logo…" : "Upload logo"}
        <input
          aria-label="Upload brand logo"
          disabled={uploading}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setError("");
            setUploading(true);
            try {
              const data = new FormData();
              data.set("file", file);
              const asset = await api<{ src: string }>("/assets", {
                method: "POST",
                body: data,
              });
              onChange({
                ...kit,
                logo: { src: asset.src, alt: `${kit.name} logo` },
              });
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setUploading(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {kit.logo && (
        <label>
          Logo alternative text
          <input
            required
            maxLength={1000}
            value={kit.logo.alt}
            onChange={(e) =>
              onChange({ ...kit, logo: { ...kit.logo!, alt: e.target.value } })
            }
          />
        </label>
      )}
      <h3>Brand colors</h3>
      <PaletteFields
        colors={kit.colors}
        onChange={(colors) => onChange({ ...kit, colors })}
      />
      <h3>Brand fonts</h3>
      <FontFields {...kit} onChange={(p) => onChange({ ...kit, ...p })} />
      <p className="hint">
        Manrope, DM Sans, Space Grotesk, Barlow Condensed, Syne, Fraunces and
        Nunito are included locally. Georgia and Courier New use system fonts;
        appearance can vary by device. Custom font uploads are not supported
        yet.
      </p>
      <label>
        Brand rules
        <textarea
          aria-label="Brand rules"
          rows={5}
          maxLength={4000}
          placeholder="How to use your logo, colors and voice…"
          value={kit.rules}
          onChange={(e) => onChange({ ...kit, rules: e.target.value })}
        />
      </label>
    </div>
  );
}
