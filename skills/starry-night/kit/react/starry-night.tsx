"use client";
// React / Next.js wrappers for the Starry Night custom elements.
//
// The elements extend HTMLElement, which does not exist during server
// rendering, so each wrapper renders the bare tag on the server and imports
// the element's module in an effect on the client. Props map to attributes
// (camelCase -> kebab-case, booleans present/absent); `onReadout` receives
// the live readout text.
//
//   import { StarrySky, StarryText } from "@/components/starry-night/react/starry-night";
//   <StarrySky speed={1.2} focus={0.47} onReadout={setReadout} style={{ height: 480 }} />

import * as React from "react";

type Common = {
  pixel?: number;
  speed?: number;
  seed?: number;
  still?: boolean;
  paused?: boolean;
  transparent?: boolean;
  noTour?: boolean;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
  tabIndex?: number;
  onReadout?: (text: string) => void;
};

export type StarrySkyProps = Common & { focus?: number; stroke?: number; dither?: number };
export type StarrySwirlProps = Common & { count?: number; trail?: number; focus?: number };
export type StarryStarProps = Common & { variant?: "star" | "moon" | "spinner" };
export type StarryCypressProps = Common & { tongues?: number };
export type StarryVillageProps = Common & { houses?: number; lights?: "on" | "off" };
export type StarryPaintingProps = Common & { src: string; alt?: string; flow?: number; horizon?: number; hold?: number };
export type StarryTextProps = Common & { text: string; font?: string; density?: number };

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
const PASS = new Set(["className", "style", "onReadout", "children"]);

function make<P extends Common>(tag: string, load: () => Promise<unknown>) {
  const C = React.forwardRef<HTMLElement, P>(function StarryWrapper(props, forwarded) {
    const ref = React.useRef<HTMLElement | null>(null);
    const { onReadout, className, style } = props;

    React.useEffect(() => {
      load();
    }, []);

    // Sync attributes from props.
    React.useEffect(() => {
      const el = ref.current;
      if (!el) return;
      for (const [key, value] of Object.entries(props)) {
        if (PASS.has(key)) continue;
        const name = key.startsWith("aria-") ? key : key === "tabIndex" ? "tabindex" : kebab(key);
        if (value === false || value === undefined || value === null) el.removeAttribute(name);
        else el.setAttribute(name, value === true ? "" : String(value));
      }
    });

    React.useEffect(() => {
      const el = ref.current;
      if (!el || !onReadout) return;
      const on = (e: Event) => onReadout((e as CustomEvent<string>).detail);
      el.addEventListener("readout", on);
      return () => el.removeEventListener("readout", on);
    }, [onReadout]);

    const setRef = (node: HTMLElement | null) => {
      ref.current = node;
      if (typeof forwarded === "function") forwarded(node);
      else if (forwarded) forwarded.current = node;
    };
    return React.createElement(tag, { ref: setRef, className, style, suppressHydrationWarning: true });
  });
  C.displayName = tag;
  return C;
}

// Paths are relative to this file: kit/react/ -> kit/.
export const StarrySky = make<StarrySkyProps>("starry-sky", () =>
  // @ts-ignore: plain ESM module without type declarations
  import("../starry-sky.mjs"));
export const StarrySwirl = make<StarrySwirlProps>("starry-swirl", () =>
  // @ts-ignore: plain ESM module without type declarations
  import("../starry-swirl.mjs"));
export const StarryStar = make<StarryStarProps>("starry-star", () =>
  // @ts-ignore: plain ESM module without type declarations
  import("../starry-star.mjs"));
export const StarryCypress = make<StarryCypressProps>("starry-cypress", () =>
  // @ts-ignore: plain ESM module without type declarations
  import("../starry-cypress.mjs"));
export const StarryVillage = make<StarryVillageProps>("starry-village", () =>
  // @ts-ignore: plain ESM module without type declarations
  import("../starry-village.mjs"));
export const StarryPainting = make<StarryPaintingProps>("starry-painting", () =>
  // @ts-ignore: plain ESM module without type declarations
  import("../starry-painting.mjs"));
export const StarryText = make<StarryTextProps>("starry-text", () =>
  // @ts-ignore: plain ESM module without type declarations
  import("../starry-text.mjs"));
