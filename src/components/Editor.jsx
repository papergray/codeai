import { useEffect, useRef, useCallback } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { rust } from "@codemirror/lang-rust";
import { php } from "@codemirror/lang-php";
import { sql } from "@codemirror/lang-sql";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { xml } from "@codemirror/lang-xml";

const langCompartment = new Compartment();
const readonlyCompartment = new Compartment();

const getLanguageExtension = (lang) => {
  switch (lang) {
    case "javascript": return javascript({ jsx: true, typescript: false });
    case "typescript": return javascript({ jsx: true, typescript: true });
    case "python":     return python();
    case "java":       return java();
    case "cpp":        return cpp();
    case "rust":       return rust();
    case "php":        return php();
    case "sql":        return sql();
    case "html":       return html();
    case "css":        return css();
    case "json":       return json();
    case "markdown":   return markdown();
    case "xml":        return xml();
    default:           return javascript();
  }
};

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "#0d0d14",
    fontSize: "13px",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  },
  ".cm-scroller": { overflow: "auto", lineHeight: "1.7" },
  ".cm-content": { padding: "16px 0", minHeight: "100%" },
  ".cm-gutters": {
    backgroundColor: "#090910",
    borderRight: "1px solid #1e1e30",
    color: "#3a3a5c",
    userSelect: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 8px" },
  ".cm-activeLineGutter": { backgroundColor: "#14142a !important", color: "#6060a0 !important" },
  ".cm-activeLine": { backgroundColor: "#13131f" },
  ".cm-cursor": { borderLeftColor: "#7c3aed", borderLeftWidth: "2px" },
  ".cm-selectionBackground": { backgroundColor: "#3b1d7a !important" },
  ".cm-focused .cm-selectionBackground": { backgroundColor: "#4c2890 !important" },
  ".cm-tooltip": { backgroundColor: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: "6px" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#2a1f5a" },
  ".cm-searchMatch": { backgroundColor: "#7c3aed33", outline: "1px solid #7c3aed66" },
  ".cm-foldGutter span": { color: "#4a4a7a" },
});

export default function Editor({ content, language, onChange, readOnly = false, onCursorChange }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const contentRef = useRef(content);
  const onChangeRef = useRef(onChange);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { contentRef.current = content; }, [content]);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: content || "",
        extensions: [
          basicSetup,
          oneDark,
          editorTheme,
          langCompartment.of(getLanguageExtension(language)),
          readonlyCompartment.of(EditorState.readOnly.of(readOnly)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const newContent = update.state.doc.toString();
              contentRef.current = newContent;
              onChangeRef.current?.(newContent);
            }
            if (update.selectionSet && onCursorChange) {
              const sel = update.state.selection.main;
              const line = update.state.doc.lineAt(sel.head);
              onCursorChange({ line: line.number, col: sel.head - line.from + 1 });
            }
          }),
          EditorView.lineWrapping,
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => view.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update content when file changes (without recreating editor)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content || "" },
      });
    }
  }, [content]);

  // Update language
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: langCompartment.reconfigure(getLanguageExtension(language)),
    });
  }, [language]);

  // Update readonly
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readonlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  // Expose focus method
  const focus = useCallback(() => viewRef.current?.focus(), []);

  return (
    <div
      ref={containerRef}
      style={{ height: "100%", overflow: "hidden" }}
      onClick={focus}
    />
  );
}
