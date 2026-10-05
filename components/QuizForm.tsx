"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { QuestionDraft, Quiz } from "@/lib/types";
import QuestionForm from "./QuestionForm";

function emptyQuestion(): QuestionDraft {
  return {
    question_text: "",
    option_1: "",
    option_2: "",
    option_3: "",
    option_4: "",
    correct_answer: "",
    points: 1,
  };
}

interface QuizFormProps {
  onCreated: () => void;
  onCancel: () => void;
  initialQuiz?: Quiz | null;
  initialQuestions?: QuestionDraft[] | null;
}

export default function QuizForm({
  onCreated,
  onCancel,
  initialQuiz,
  initialQuestions,
}: QuizFormProps) {
  const isEditing = Boolean(initialQuiz);

  const [title, setTitle] = useState(initialQuiz?.title ?? "");
  const [description, setDescription] = useState(
    initialQuiz?.description ?? ""
  );
  const [published, setPublished] = useState(
    initialQuiz?.published ?? false
  );

  // null = No Limit
  const [durationMinutes, setDurationMinutes] = useState<number | null>(
    initialQuiz?.duration_minutes ?? null
  );

  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initialQuestions && initialQuestions.length > 0
      ? initialQuestions
      : [emptyQuestion()]
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateQuestion(index: number, next: QuestionDraft) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? next : q))
    );
  }

  function removeQuestion(index: number) {
    setQuestions((prev) =>
      prev.filter((_, i) => i !== index)
    );
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function validate(): string | null {
    if (!title.trim()) {
      return "Quiz title is required.";
    }

    if (questions.length === 0) {
      return "Add at least one question.";
    }

    for (const [i, q] of questions.entries()) {
      if (!q.question_text.trim()) {
        return `Question ${i + 1} is missing question text.`;
      }

      if (
        !q.option_1.trim() ||
        !q.option_2.trim() ||
        !q.option_3.trim() ||
        !q.option_4.trim()
      ) {
        return `Question ${i + 1} needs all four options filled in.`;
      }

      if (!q.correct_answer.trim()) {
        return `Question ${i + 1} needs a correct answer selected.`;
      }

      if (!q.points || q.points < 1) {
        return `Question ${i + 1} needs at least 1 point.`;
      }
    }

    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError(null);
    setSuccess(null);

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    const supabase = supabaseBrowser();

    try {
      const rows = questions.map((q) => ({
        quiz_id: initialQuiz?.id,
        question_text: q.question_text,
        options: [
          q.option_1,
          q.option_2,
          q.option_3,
          q.option_4,
        ],
        correct_answer: q.correct_answer,
        points: q.points,
      }));

      if (isEditing && initialQuiz) {
        const { error: quizError } = await supabase
          .from("quizzes")
          .update({
            title: title.trim(),
            description: description.trim() || null,
            published,
            duration_minutes: durationMinutes,
          })
          .eq("id", initialQuiz.id);

        if (quizError) {
          throw new Error(quizError.message || "Could not update the quiz.");
        }

        const { error: deleteError } = await supabase
          .from("questions")
          .delete()
          .eq("quiz_id", initialQuiz.id);

        if (deleteError) {
          throw new Error(deleteError.message || "Could not replace quiz questions.");
        }

        const { error: questionsError } = await supabase
          .from("questions")
          .insert(
            rows.map((row) => ({
              ...row,
              quiz_id: initialQuiz.id,
            }))
          );

        if (questionsError) {
          throw new Error(questionsError.message);
        }
      } else {
        const { data: quiz, error: quizError } = await supabase
          .from("quizzes")
          .insert({
            title: title.trim(),
            description: description.trim() || null,
            published,
            duration_minutes: durationMinutes,
          })
          .select("id")
          .single();

        if (quizError || !quiz) {
          throw new Error(quizError?.message || "Could not create the quiz.");
        }

        const { error: questionsError } = await supabase
          .from("questions")
          .insert(
            rows.map((row) => ({
              ...row,
              quiz_id: quiz.id,
            }))
          );

        if (questionsError) {
          throw new Error(questionsError.message);
        }
      }

      setSuccess(
        isEditing ? "Quiz updated successfully." : "Quiz created successfully."
      );

      if (!isEditing) {
        setTitle("");
        setDescription("");
        setPublished(false);
        setDurationMinutes(null);
        setQuestions([emptyQuestion()]);
      }

      onCreated();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="panel rounded-2xl p-6 sm:p-8"
    >
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-white">
          {isEditing ? "Edit quiz" : "Create quiz"}
        </h2>

        <button
          type="button"
          onClick={onCancel}
          className="focus-ring rounded-lg border border-neutral-800 px-3 py-1.5 text-sm text-neutral-400 hover:text-white"
        >
          Cancel
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 rounded-lg border border-crimson/40 bg-crimson/10 px-4 py-3 text-sm text-crimson-bright">
          {error}
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="mb-5 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-400">
          {success}
        </div>
      )}

      {/* Basic Quiz Information */}
      <div className="grid gap-4">
        {/* Title */}
        <div>
          <label className="mb-1.5 block text-xs text-neutral-500">
            Quiz title
          </label>

          <input
            required
            value={title}
            onChange={(e) =>
              setTitle(e.target.value)
            }
            placeholder="Programming Fundamentals"
            className="focus-ring w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-xs text-neutral-500">
            Description
          </label>

          <textarea
            value={description}
            onChange={(e) =>
              setDescription(e.target.value)
            }
            rows={3}
            placeholder="A short overview of what this quiz covers."
            className="focus-ring w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
          />
        </div>

        {/* Time Limit */}
        <div>
          <label className="mb-1.5 flex items-center gap-2 text-xs text-neutral-500">
            <span>⏱️</span>
            <span>Time Limit</span>
          </label>

          <select
            value={
              durationMinutes === null
                ? "none"
                : String(durationMinutes)
            }
            onChange={(e) => {
              const value = e.target.value;

              if (value === "none") {
                setDurationMinutes(null);
              } else {
                setDurationMinutes(Number(value));
              }
            }}
            className="focus-ring w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white"
          >
            <option value="none">
              No Limit
            </option>

            <option value="15">
              15 Minutes
            </option>

            <option value="30">
              30 Minutes
            </option>

            <option value="45">
              45 Minutes
            </option>

            <option value="60">
              60 Minutes
            </option>
          </select>

          <p className="mt-1.5 text-xs text-neutral-600">
            Students will see a countdown timer during
            the quiz.
          </p>
        </div>

        {/* Publish */}
        <label className="flex w-fit items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) =>
              setPublished(e.target.checked)
            }
            className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 accent-crimson"
          />

          Publish immediately
        </label>
      </div>

      {/* Questions */}
      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-neutral-300">
            Questions
          </h3>

          <button
            type="button"
            onClick={addQuestion}
            className="focus-ring rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:border-crimson/50 hover:text-white"
          >
            + Add question
          </button>
        </div>

        {questions.map((q, i) => (
          <QuestionForm
            key={i}
            index={i}
            question={q}
            onChange={updateQuestion}
            onRemove={removeQuestion}
            canRemove={questions.length > 1}
          />
        ))}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="focus-ring mt-8 w-full rounded-lg bg-crimson px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-crimson-bright disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {submitting
          ? "Creating…"
          : "Create Quiz"}
      </button>
    </form>
  );
}