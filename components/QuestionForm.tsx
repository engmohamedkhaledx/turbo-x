"use client";

import type { QuestionDraft } from "@/lib/types";

interface QuestionFormProps {
  index: number;
  question: QuestionDraft;
  onChange: (index: number, question: QuestionDraft) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

export default function QuestionForm({
  index,
  question,
  onChange,
  onRemove,
  canRemove,
}: QuestionFormProps) {
  function update<K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) {
    onChange(index, { ...question, [key]: value });
  }

  const options = [
    question.option_1,
    question.option_2,
    question.option_3,
    question.option_4,
  ];

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-300">
          Question {index + 1}
        </p>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="focus-ring rounded-md border border-neutral-800 px-2.5 py-1 text-xs text-neutral-400 hover:border-crimson/50 hover:text-crimson-bright"
          >
            Remove
          </button>
        )}
      </div>

      <div className="grid gap-4">
        <div>
          <label className="mb-1.5 block text-xs text-neutral-500">
            Question text
          </label>
          <textarea
            required
            value={question.question_text}
            onChange={(e) => update("question_text", e.target.value)}
            placeholder="What is C++?"
            rows={5}
            className="focus-ring w-full resize-y rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(["option_1", "option_2", "option_3", "option_4"] as const).map(
            (key, i) => (
              <div key={key}>
                <label className="mb-1.5 block text-xs text-neutral-500">
                  Option {i + 1}
                </label>
                <textarea
                  required
                  value={question[key]}
                  onChange={(e) => update(key, e.target.value)}
                  rows={3}
                  className="focus-ring w-full resize-y rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
                />
              </div>
            )
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs text-neutral-500">
              Correct answer
            </label>
            <select
              required
              value={question.correct_answer}
              onChange={(e) => update("correct_answer", e.target.value)}
              className="focus-ring w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white"
            >
              <option value="">Select the correct option</option>
              {options.map(
                (opt, i) =>
                  opt.trim() && (
                    <option key={i} value={opt}>
                      {opt}
                    </option>
                  )
              )}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-neutral-500">
              Points
            </label>
            <input
              required
              type="number"
              min={1}
              value={question.points}
              onChange={(e) => update("points", Number(e.target.value) || 1)}
              className="focus-ring w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
