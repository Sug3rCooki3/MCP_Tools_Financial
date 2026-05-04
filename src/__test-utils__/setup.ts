import "@testing-library/jest-dom";

// jsdom doesn't implement scrollIntoView — provide a no-op stub (only in browser-like environments)
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = () => {};
}
