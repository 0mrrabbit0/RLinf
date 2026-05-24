import React from "react";
import Editor, { type OnMount } from "@monaco-editor/react";

export interface ConfigEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
}

const ConfigEditor: React.FC<ConfigEditorProps> = ({
  value,
  onChange,
  language = "yaml",
  readOnly = false,
}) => {
  const handleMount: OnMount = (editor) => {
    // Focus the editor once mounted
    editor.focus();
  };

  return (
    <Editor
      height="100%"
      language={language}
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange?.(v ?? "")}
      onMount={handleMount}
      options={{
        readOnly,
        minimap: { enabled: false },
        lineNumbers: "on",
        wordWrap: "on",
        fontFamily: "Fira Code, Consolas, monospace",
        fontSize: 14,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        renderWhitespace: "selection",
        bracketPairColorization: { enabled: true },
        padding: { top: 12 },
      }}
    />
  );
};

export default ConfigEditor;
