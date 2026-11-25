import "web-streams-polyfill/dist/polyfill.min.js";
import { TextEncoder, TextDecoder } from "util";

// Suites that need real Unix sockets run under `@jest-environment node`, which has no `window`;
// the window-only shims below are skipped there.
if (typeof window !== "undefined") {
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
}

// Polyfill Obsidian's Node.doc / Node.win augmentation so plugin code that
// reads `element.doc` / `element.win` works under jsdom.
if (typeof Node !== "undefined" && !Object.prototype.hasOwnProperty.call(Node.prototype, "doc")) {
  Object.defineProperty(Node.prototype, "doc", {
    get() {
      return this.ownerDocument ?? window.document;
    },
    configurable: true,
  });
}
if (typeof Node !== "undefined" && !Object.prototype.hasOwnProperty.call(Node.prototype, "win")) {
  Object.defineProperty(Node.prototype, "win", {
    get() {
      return this.ownerDocument?.defaultView ?? window;
    },
    configurable: true,
  });
}

// Polyfill Obsidian's `HTMLElement.setCssProps` augmentation (sets one or more
// CSS custom properties) so plugin code that calls it — e.g. the autosizing
// `Textarea` — works under jsdom.
if (typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.setCssProps !== "function") {
  HTMLElement.prototype.setCssProps = function (props) {
    for (const [name, value] of Object.entries(props)) {
      this.style.setProperty(name, value);
    }
  };
}

// Obsidian exposes `activeDocument` / `activeWindow` globals pointing at the
// focused popout's document/window. Under jsdom there's only one document, so
// alias them onto `window` (the jsdom global object) — plugin code that portals
// into `activeDocument.body` (e.g. the Radix tooltip) would otherwise throw
// `activeDocument is not defined`.
if (typeof window !== "undefined" && typeof window.activeDocument === "undefined") {
  window.activeDocument = window.document;
}
if (typeof window !== "undefined" && typeof window.activeWindow === "undefined") {
  window.activeWindow = window;
}
