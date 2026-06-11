"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Plus, Send, Square, X } from "lucide-react";
import type { ModelOption } from "@/types/conversation";

type AIChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string, files?: File[]) => void;
  onStop?: () => void;
  loading?: boolean;
  modelOptions?: ModelOption[];
  selectedModel?: string;
  onModelChange?: (value: string) => void;
  requireModel?: boolean;
  placeholder?: string;
};

type PastedContent = {
  id: string;
  title: string;
  text: string;
};

function lineCount(text: string) {
  return text.split("\n").length;
}

function shouldAttachPaste(text: string) {
  return text.length > 900 || lineCount(text) > 14;
}

function pastedTitle(text: string) {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "Pasted content";
  return firstLine.length > 44 ? `${firstLine.slice(0, 44)}...` : firstLine;
}

function bytesLabel(text: string) {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function mergePromptAndPastes(prompt: string, pastes: PastedContent[]) {
  const cleanPrompt = prompt.trim();
  const pasteText = pastes
    .map((paste, index) => {
      const title = paste.title || `Pasted content ${index + 1}`;
      return `Pasted content ${index + 1}: ${title}\n${paste.text}`;
    })
    .join("\n\n");
  if (cleanPrompt && pasteText) return `${cleanPrompt}\n\n${pasteText}`;
  return cleanPrompt || pasteText;
}

function fileSizeLabel(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

const AIChatInput = forwardRef<HTMLTextAreaElement, AIChatInputProps>(function AIChatInput({
  value,
  onChange,
  onSend,
  onStop,
  loading = false,
  modelOptions = [],
  selectedModel = "",
  onModelChange,
  requireModel = false,
  placeholder = "輸入你想做的設計、文案或網頁...",
}, ref) {
  const isComposingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pastedContents, setPastedContents] = useState<PastedContent[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const sendValue = useMemo(() => mergePromptAndPastes(value, pastedContents), [pastedContents, value]);
  const modelMissing = requireModel && modelOptions.length === 0;
  const canSend = (Boolean(sendValue.trim()) || selectedFiles.length > 0) && !loading && !modelMissing;
  const canEdit = !modelMissing;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

  function setTextareaRef(node: HTMLTextAreaElement | null) {
    textareaRef.current = node;
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  }

  function submit() {
    if (!canSend) return;
    onSend(sendValue.trim() || "我已上傳參考素材，請協助分析並接著收斂需求。", selectedFiles);
    setPastedContents([]);
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="animate-composer-in rounded-[28px] border border-line1/80 bg-surface/95 p-2 shadow-[0_18px_48px_rgba(26,23,20,0.10),0_2px_8px_rgba(26,23,20,0.05)] backdrop-blur-xl transition-[border,box-shadow,transform] duration-240 ease-smooth focus-within:-translate-y-0.5 focus-within:border-line2 focus-within:shadow-focus">
      {pastedContents.length > 0 ? (
        <div className="mb-2 space-y-2 px-1 pt-1">
          {pastedContents.map((paste) => (
            <div
              key={paste.id}
              className="animate-chip-in flex items-center gap-3 rounded-[18px] border border-line1 bg-sunken/80 px-3 py-2 text-left shadow-xs"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line1 bg-surface text-ink-500">
                <FileText className="h-4 w-4" />
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                title={paste.title}
                onClick={() => {
                  textareaRef.current?.focus();
                }}
              >
                <span className="block truncate text-sm font-medium text-ink-900">{paste.title}</span>
                <span className="mt-0.5 block truncate text-xs text-ink-500">
                  {bytesLabel(paste.text)} · {lineCount(paste.text).toLocaleString()} lines · 會隨訊息送出
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPastedContents((current) => current.filter((item) => item.id !== paste.id))}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-400 transition hover:bg-hover hover:text-ink-900"
                aria-label="移除貼上內容"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {selectedFiles.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2 px-1 pt-1">
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${file.lastModified}-${index}`}
              className="animate-chip-in inline-flex max-w-full items-center gap-2 rounded-pill border border-line1 bg-sunken/80 px-3 py-2 text-sm text-ink-700 shadow-xs"
              title={file.name}
            >
              <FileText className="h-4 w-4 shrink-0 text-ink-500" />
              <span className="max-w-[220px] truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-ink-400">{fileSizeLabel(file.size)}</span>
              <button
                type="button"
                onClick={() => setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-400 transition hover:bg-hover hover:text-ink-900"
                aria-label="移除附件"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.ai,.eps,.psd,.svg"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            if (files.length === 0) return;
            setSelectedFiles((current) => [...current, ...files].slice(0, 8));
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="mb-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-500 transition-[transform,background,color] duration-120 ease-snap hover:-translate-y-px hover:bg-hover hover:text-ink-900 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="上傳參考素材"
          title="上傳參考素材"
        >
          <Plus className="h-5 w-5" />
        </button>
        <textarea
          ref={setTextareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (!shouldAttachPaste(text)) return;
            event.preventDefault();
            setPastedContents((current) => [
              ...current,
              {
                id: `paste-${Date.now()}-${current.length + 1}`,
                title: pastedTitle(text),
                text,
              },
            ]);
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onKeyDown={(event) => {
            const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean };
            if (event.key === "Enter" && !event.shiftKey && !isComposingRef.current && !nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          disabled={!canEdit}
          rows={1}
          className="max-h-40 min-h-12 flex-1 resize-none border-0 bg-transparent px-4 py-3 text-[15px] leading-6 text-ink-900 outline-none placeholder:text-ink-400"
        />
        {loading && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-900 text-white shadow-sm transition-[transform,box-shadow] duration-120 ease-snap hover:-translate-y-px hover:shadow-md active:scale-[0.97]"
            aria-label="停止生成"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-[transform,box-shadow,opacity] duration-120 ease-snap hover:-translate-y-px hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:translate-y-0 disabled:scale-100 disabled:opacity-35 bg-g3-brand"
            aria-label="送出"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        )}
      </div>
      {onModelChange && modelOptions.length > 0 ? (
        <div className="mt-1 flex items-center justify-between gap-2 px-3 pb-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">Model</span>
          <select
            value={selectedModel}
            onChange={(event) => onModelChange(event.target.value)}
            className="max-w-[240px] rounded-pill border border-transparent bg-transparent px-2 py-1 text-xs text-ink-500 outline-none transition-[background,border,box-shadow] duration-120 ease-smooth hover:bg-hover focus:border-line2 focus:bg-surface focus:shadow-focus"
          >
            {modelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : modelMissing ? (
        <div className="mt-1 px-3 pb-1 text-xs text-ink-400">
          尚未設定一般聊天模型，請先到後台新增模型。
        </div>
      ) : null}
    </div>
  );
});

export default AIChatInput;
